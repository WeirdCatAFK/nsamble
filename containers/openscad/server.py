"""Thin HTTP wrapper around the OpenSCAD CLI."""
import json
import base64
import subprocess
import tempfile
import os
from http.server import HTTPServer, BaseHTTPRequestHandler

class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/compile":
            self.send_error(404)
            return

        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length))
        script = body.get("script", "")
        filename = body.get("filename", "output")

        with tempfile.TemporaryDirectory() as tmp:
            scad_path = os.path.join(tmp, f"{filename}.scad")
            stl_path = os.path.join(tmp, f"{filename}.stl")
            png_path = os.path.join(tmp, f"{filename}.png")

            with open(scad_path, "w") as f:
                f.write(script)

            stl_result = subprocess.run(
                ["openscad", "-o", stl_path, scad_path],
                capture_output=True, text=True, timeout=60,
            )

            png_result = subprocess.run(
                ["openscad", "--render", "-o", png_path,
                 "--imgsize=800,600", scad_path],
                capture_output=True, text=True, timeout=60,
            )

            result = {
                "stl": None,
                "png": None,
                "errors": [],
                "warnings": [],
            }

            if stl_result.returncode != 0:
                result["errors"].append(stl_result.stderr.strip())
            elif os.path.exists(stl_path):
                with open(stl_path, "rb") as f:
                    result["stl"] = base64.b64encode(f.read()).decode()

            if os.path.exists(png_path):
                with open(png_path, "rb") as f:
                    result["png"] = base64.b64encode(f.read()).decode()

            if stl_result.stderr and stl_result.returncode == 0:
                for line in stl_result.stderr.strip().splitlines():
                    if "WARNING" in line:
                        result["warnings"].append(line)

            payload = json.dumps(result).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"status":"ok"}')
            return
        self.send_error(404)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    server = HTTPServer(("0.0.0.0", port), Handler)
    print(f"OpenSCAD compile server on port {port}")
    server.serve_forever()
