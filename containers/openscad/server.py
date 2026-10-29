"""Thin HTTP wrapper around the OpenSCAD CLI."""
import json
import base64
import subprocess
import tempfile
import os
from http.server import HTTPServer, BaseHTTPRequestHandler

try:
    import trimesh
    HAS_TRIMESH = True
except ImportError:
    HAS_TRIMESH = False

VIEWS = {
    "front":     "--camera=0,0,0,90,0,0,0",
    "right":     "--camera=0,0,0,90,0,270,0",
    "top":       "--camera=0,0,0,0,0,0,0",
    "isometric": "--camera=0,0,0,55,0,25,0",
}

MAX_VALIDATE_BYTES = 20_000_000

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

            with open(scad_path, "w") as f:
                f.write(script)

            stl_result = subprocess.run(
                ["openscad", "-o", stl_path, scad_path],
                capture_output=True, text=True, timeout=60,
            )

            pngs = {}
            for view_name, camera_arg in VIEWS.items():
                view_png = os.path.join(tmp, f"{filename}_{view_name}.png")
                subprocess.run(
                    ["xvfb-run", "-a", "openscad", "--render", "-o", view_png,
                     camera_arg, "--imgsize=800,600", scad_path],
                    capture_output=True, text=True, timeout=60,
                )
                if os.path.exists(view_png):
                    with open(view_png, "rb") as f:
                        pngs[view_name] = base64.b64encode(f.read()).decode()

            result = {
                "stl": None,
                "png": pngs.get("isometric"),
                "pngs": pngs,
                "errors": [],
                "warnings": [],
            }

            if stl_result.returncode != 0:
                result["errors"].append(stl_result.stderr.strip())
            elif os.path.exists(stl_path):
                with open(stl_path, "rb") as f:
                    result["stl"] = base64.b64encode(f.read()).decode()

                if HAS_TRIMESH and os.path.getsize(stl_path) < MAX_VALIDATE_BYTES:
                    try:
                        mesh = trimesh.load(stl_path)
                        result["validation"] = {
                            "is_watertight": bool(mesh.is_watertight),
                            "is_volume": bool(mesh.is_volume),
                            "volume_mm3": round(float(mesh.volume), 2) if mesh.is_volume else None,
                            "bounding_box": [round(float(d), 3) for d in mesh.bounding_box.extents],
                            "face_count": len(mesh.faces),
                            "vertex_count": len(mesh.vertices),
                            "euler_number": int(mesh.euler_number),
                            "has_degenerate_faces": bool(len(mesh.degenerate_faces) > 0) if hasattr(mesh, "degenerate_faces") else None,
                        }
                    except Exception as e:
                        result["validation"] = {"error": str(e)}

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
