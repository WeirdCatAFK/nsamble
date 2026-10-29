"""Thin HTTP wrapper around the KiCad CLI."""
import json
import base64
import subprocess
import tempfile
import os
import glob as globmod
from http.server import HTTPServer, BaseHTTPRequestHandler

KICAD_PRO_TEMPLATE = json.dumps({
    "meta": {"filename": "", "version": 1},
    "text_variables": {}
})


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/compile":
            self.send_error(404)
            return

        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length))
        schematic = body.get("schematic", "")
        board = body.get("board", "")
        filename = body.get("filename", "output")

        with tempfile.TemporaryDirectory() as tmp:
            sch_path = os.path.join(tmp, f"{filename}.kicad_sch")
            pcb_path = os.path.join(tmp, f"{filename}.kicad_pcb")
            pro_path = os.path.join(tmp, f"{filename}.kicad_pro")

            with open(pro_path, "w") as f:
                f.write(KICAD_PRO_TEMPLATE)

            result = {
                "schematic_svg": None,
                "board_svgs": {},
                "gerbers": {},
                "drill": None,
                "drc": None,
                "errors": [],
                "warnings": [],
            }

            if schematic:
                with open(sch_path, "w") as f:
                    f.write(schematic)

                svg_dir = os.path.join(tmp, "sch_svg")
                os.makedirs(svg_dir, exist_ok=True)
                sch_export = subprocess.run(
                    ["xvfb-run", "-a",
                     "kicad-cli", "sch", "export", "svg",
                     "-o", svg_dir, sch_path],
                    capture_output=True, text=True, timeout=60,
                )
                if sch_export.returncode != 0:
                    result["errors"].append(
                        f"Schematic export: {sch_export.stderr.strip()}")
                else:
                    svgs = globmod.glob(os.path.join(svg_dir, "*.svg"))
                    if svgs:
                        with open(svgs[0], "rb") as f:
                            result["schematic_svg"] = base64.b64encode(
                                f.read()).decode()

            if board:
                with open(pcb_path, "w") as f:
                    f.write(board)

                layer_sets = {
                    "front": "F.Cu,F.SilkS,Edge.Cuts",
                    "back": "B.Cu,B.SilkS,Edge.Cuts",
                }
                for view_name, layers in layer_sets.items():
                    svg_path = os.path.join(
                        tmp, f"{filename}_{view_name}.svg")
                    pcb_svg = subprocess.run(
                        ["xvfb-run", "-a",
                         "kicad-cli", "pcb", "export", "svg",
                         "-l", layers, "-o", svg_path, pcb_path],
                        capture_output=True, text=True, timeout=60,
                    )
                    if pcb_svg.returncode == 0 and os.path.exists(svg_path):
                        with open(svg_path, "rb") as f:
                            result["board_svgs"][view_name] = (
                                base64.b64encode(f.read()).decode())
                    elif pcb_svg.returncode != 0:
                        result["warnings"].append(
                            f"Board SVG ({view_name}): "
                            f"{pcb_svg.stderr.strip()}")

                drc_path = os.path.join(tmp, "drc.json")
                drc_run = subprocess.run(
                    ["kicad-cli", "pcb", "drc",
                     "--format", "json", "-o", drc_path, pcb_path],
                    capture_output=True, text=True, timeout=60,
                )
                if os.path.exists(drc_path):
                    with open(drc_path) as f:
                        result["drc"] = json.load(f)
                elif drc_run.returncode != 0:
                    result["warnings"].append(
                        f"DRC: {drc_run.stderr.strip()}")

                gerber_dir = os.path.join(tmp, "gerbers")
                os.makedirs(gerber_dir, exist_ok=True)
                gb_run = subprocess.run(
                    ["kicad-cli", "pcb", "export", "gerbers",
                     "-o", gerber_dir, pcb_path],
                    capture_output=True, text=True, timeout=60,
                )
                if gb_run.returncode == 0:
                    for gf in os.listdir(gerber_dir):
                        with open(os.path.join(gerber_dir, gf), "rb") as f:
                            result["gerbers"][gf] = (
                                base64.b64encode(f.read()).decode())
                else:
                    result["warnings"].append(
                        f"Gerber export: {gb_run.stderr.strip()}")

                drill_run = subprocess.run(
                    ["kicad-cli", "pcb", "export", "drill",
                     "-o", tmp, pcb_path],
                    capture_output=True, text=True, timeout=60,
                )
                if drill_run.returncode == 0:
                    drills = globmod.glob(os.path.join(tmp, "*.drl"))
                    if drills:
                        with open(drills[0], "rb") as f:
                            result["drill"] = (
                                base64.b64encode(f.read()).decode())

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
    port = int(os.environ.get("PORT", "8081"))
    server = HTTPServer(("0.0.0.0", port), Handler)
    print(f"KiCad compile server on port {port}")
    server.serve_forever()
