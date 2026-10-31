"""Thin HTTP wrapper around openscad-mcp over MCP stdio."""
import asyncio
import json
import os
import subprocess
import tempfile
from http.server import HTTPServer, BaseHTTPRequestHandler

try:
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client
    HAS_MCP = True
except ImportError:
    HAS_MCP = False

MCP_TIMEOUT_SECONDS = 120
CHECK_TIMEOUT_SECONDS = 180
FILE_KEYS = {"file", "path", "filepath", "model_file", "scad_file", "filename"}
CODE_KEYS = {"code", "scad", "script", "source", "text", "model"}

schema_cache = {}


def pick_key(props, candidates, hints):
    for name in props:
        lowered = name.lower()
        if lowered in candidates or any(h in lowered for h in hints):
            return name
    return None


def resolve_args(schema, scad, tool_args):
    args = dict(tool_args or {})
    if not scad:
        return args
    props = (schema or {}).get("properties", {})
    if "scad" in props and "scad" not in args:
        args["scad"] = scad
        return args
    if "code" in props and "code" not in args:
        args["code"] = scad
        return args
    file_key = pick_key(props, FILE_KEYS, ("file", "path"))
    if file_key and file_key not in args:
        handle, tmp_path = tempfile.mkstemp(suffix=".scad")
        with os.fdopen(handle, "w") as handle_file:
            handle_file.write(scad)
        args[file_key] = tmp_path
        return args
    code_key = pick_key(props, CODE_KEYS, ("code", "script", "source"))
    if code_key and code_key not in args:
        args[code_key] = scad
        return args
    raise ValueError(f"No script arg in tool schema: {sorted(props)}")


async def call_tool(tool_name, arguments):
    params = StdioServerParameters(command="openscad-mcp", args=[])
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            listed = await session.list_tools()
            schemas = {tool.name: tool.inputSchema for tool in listed.tools}
            schema_cache.update(schemas)
            if tool_name not in schemas:
                raise ValueError(f"Unknown tool '{tool_name}'. Have: {sorted(schemas)}")
            return schemas[tool_name], await session.call_tool(tool_name, arguments)


def unwrap(result):
    blocks = []
    for item in result.content or []:
        text = getattr(item, "text", None)
        if text is None:
            continue
        try:
            blocks.append(json.loads(text))
        except ValueError:
            blocks.append(text)
    return blocks


def run_tool(tool_name, scad, tool_args):
    if not HAS_MCP:
        return {"error": "The 'mcp' package is not installed in this image."}

    async def attempt(refresh):
        if refresh:
            schema_cache.clear()
        schema = schema_cache.get(tool_name)
        if schema is None:
            params = StdioServerParameters(command="openscad-mcp", args=[])
            async with stdio_client(params) as (read, write):
                async with ClientSession(read, write) as session:
                    await session.initialize()
                    listed = await session.list_tools()
                    for tool in listed.tools:
                        schema_cache[tool.name] = tool.inputSchema
            schema = schema_cache.get(tool_name)
            if schema is None:
                raise ValueError(f"Unknown tool '{tool_name}'.")
        args = resolve_args(schema, scad, tool_args)
        _, result = await call_tool(tool_name, args)
        return {"content": unwrap(result), "is_error": bool(result.isError)}

    try:
        return asyncio.run(asyncio.wait_for(attempt(False), MCP_TIMEOUT_SECONDS))
    except ValueError as exc:
        if "Unknown tool" in str(exc):
            raise
        try:
            return asyncio.run(asyncio.wait_for(attempt(True), MCP_TIMEOUT_SECONDS))
        except (ValueError, subprocess.SubprocessError, OSError, TimeoutError) as retry_exc:
            return {"error": str(retry_exc)}
    except (subprocess.SubprocessError, OSError, TimeoutError) as exc:
        return {"error": str(exc)}


def run_check_file(checks_yaml, files):
    with tempfile.TemporaryDirectory() as tmp:
        checks_path = os.path.join(tmp, "checks.yaml")
        with open(checks_path, "w") as handle:
            handle.write(checks_yaml)
        for name, content in (files or {}).items():
            safe = os.path.basename(name)
            with open(os.path.join(tmp, safe), "w") as handle:
                handle.write(content)
        completed = subprocess.run(
            ["openscad-mcp", "check", checks_path, "--allow", tmp],
            capture_output=True, text=True, timeout=CHECK_TIMEOUT_SECONDS,
        )
        return {
            "exit_code": completed.returncode,
            "output": (completed.stdout + completed.stderr).strip(),
        }


class Handler(BaseHTTPRequestHandler):
    def send_payload(self, result):
        payload = json.dumps(result).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def read_body(self):
        length = int(self.headers.get("Content-Length", 0))
        return json.loads(self.rfile.read(length)) if length else {}

    def do_POST(self):
        try:
            if self.path == "/measure":
                body = self.read_body()
                self.send_payload(run_tool("measure", body.get("scad"), body.get("tool_args")))
            elif self.path == "/validate":
                body = self.read_body()
                self.send_payload(run_tool("validate", body.get("scad"), body.get("tool_args")))
            elif self.path == "/check":
                body = self.read_body()
                self.send_payload(run_check_file(body.get("checks_yaml", ""), body.get("files")))
            else:
                self.send_error(404)
        except (ValueError, subprocess.SubprocessError, OSError, TimeoutError) as exc:
            self.send_payload({"error": str(exc)})

    def do_GET(self):
        if self.path == "/health":
            self.send_payload({"status": "ok", "mcp": HAS_MCP})
            return
        self.send_error(404)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8083"))
    server = HTTPServer(("0.0.0.0", port), Handler)
    print(f"Constraint engine on port {port}")
    server.serve_forever()
