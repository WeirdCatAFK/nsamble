"""Thin HTTP wrapper around the OpenSCAD CLI."""
import json
import base64
import struct
import subprocess
import tempfile
import os
import zlib
from http.server import HTTPServer, BaseHTTPRequestHandler
from typing import Optional

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

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
BLANK_FRACTION_DENOM = 10_000
BLANK_MIN_PIXELS = 16


def _paeth_predictor(a, b, c):
    p = a + b - c
    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    if pb <= pc:
        return b
    return c


def is_blank_png(data):
    # type: (bytes) -> Optional[bool]
    """Check whether a PNG holds visible geometry.

    Returns True when the image is a single flat color, False when any
    region differs from the background, and None when the bytes cannot
    be decoded as a plain (non-interlaced) PNG.
    """
    if len(data) < 8 or data[:8] != PNG_SIGNATURE:
        return None

    width = height = bitdepth = colortype = None
    comp_method = filter_method = interlace = 0
    idat = bytearray()
    pos = 8
    try:
        while pos + 8 <= len(data):
            (length,) = struct.unpack(">I", data[pos:pos + 4])
            ctype = data[pos + 4:pos + 8]
            payload = data[pos + 8:pos + 8 + length]
            if len(payload) < length:
                return None
            if ctype == b"IHDR" and length == 13:
                width, height = struct.unpack(">II", payload[:8])
                bitdepth, colortype = payload[8], payload[9]
                comp_method, filter_method, interlace = payload[10:13]
            elif ctype == b"IDAT":
                idat += payload
            elif ctype == b"IEND":
                break
            pos += 12 + length
    except struct.error:
        return None

    channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}.get(colortype)
    if (width is None or not idat or channels is None
            or width <= 0 or height <= 0
            or bitdepth not in (1, 2, 4, 8, 16)
            or (colortype == 3 and bitdepth == 16)
            or comp_method != 0 or filter_method != 0 or interlace != 0):
        return None

    try:
        raw = zlib.decompress(bytes(idat))
    except zlib.error:
        return None

    stride = (width * bitdepth * channels + 7) // 8
    bpp = max(1, (bitdepth * channels) // 8)
    if len(raw) < height * (stride + 1):
        return None

    pixbytes = (bitdepth * channels) // 8 if bitdepth >= 8 else 0
    subbyte = bitdepth < 8

    background = None
    differing = 0
    prev = bytearray(stride)
    off = 0
    for _ in range(height):
        ftype = raw[off]
        off += 1
        if ftype > 4:
            return None
        cur = bytearray(raw[off:off + stride])
        off += stride
        for i in range(stride):
            a = cur[i - bpp] if i >= bpp else 0
            b = prev[i]
            c = prev[i - bpp] if i >= bpp else 0
            if ftype == 1:
                cur[i] = (cur[i] + a) & 0xFF
            elif ftype == 2:
                cur[i] = (cur[i] + b) & 0xFF
            elif ftype == 3:
                cur[i] = (cur[i] + ((a + b) >> 1)) & 0xFF
            elif ftype == 4:
                cur[i] = (cur[i] + _paeth_predictor(a, b, c)) & 0xFF
        if subbyte:
            pixels = _unpack_subbyte_row(cur, width, bitdepth)
        else:
            pixels = [bytes(cur[i:i + pixbytes])
                      for i in range(0, width * pixbytes, pixbytes)]
        if background is None and pixels:
            background = pixels[0]
        for pixel in pixels:
            if pixel != background:
                differing += 1
        prev = cur

    total = width * height
    if total == 0:
        return None
    return differing < max(BLANK_MIN_PIXELS, total // BLANK_FRACTION_DENOM)


def _unpack_subbyte_row(row, width, bitdepth):
    pixels = []
    per_byte = 8 // bitdepth
    mask = (1 << bitdepth) - 1
    for byte in row:
        for k in range(per_byte):
            if len(pixels) >= width:
                break
            shift = 8 - (k + 1) * bitdepth
            pixels.append((byte >> shift) & mask)
    return pixels

class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/compile":
            self.send_error(404)
            return

        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length))
        script = body.get("script", "")
        filename = body.get("filename", "output")
        output_format = body.get("output_format", "stl")

        with tempfile.TemporaryDirectory() as tmp:
            scad_path = os.path.join(tmp, f"{filename}.scad")

            with open(scad_path, "w") as f:
                f.write(script)

            if output_format == "svg":
                svg_path = os.path.join(tmp, f"{filename}.svg")
                svg_result = subprocess.run(
                    ["openscad", "-o", svg_path, scad_path],
                    capture_output=True, text=True, timeout=60,
                )
                result = {"svg": None, "errors": [], "warnings": []}
                if svg_result.returncode != 0:
                    result["errors"].append(svg_result.stderr.strip())
                elif os.path.exists(svg_path):
                    with open(svg_path, "rb") as f:
                        result["svg"] = base64.b64encode(f.read()).decode()
                if svg_result.stderr and svg_result.returncode == 0:
                    for line in svg_result.stderr.strip().splitlines():
                        if "WARNING" in line:
                            result["warnings"].append(line)
            else:
                stl_path = os.path.join(tmp, f"{filename}.stl")

                stl_result = subprocess.run(
                    ["openscad", "-o", stl_path, scad_path],
                    capture_output=True, text=True, timeout=60,
                )

                pngs = {}
                render_warnings = []
                for view_name, camera_arg in VIEWS.items():
                    view_png = os.path.join(tmp, f"{filename}_{view_name}.png")
                    view_result = subprocess.run(
                        ["xvfb-run", "-a", "openscad", "--render", "-o", view_png,
                         camera_arg, "--autocenter", "--viewall",
                         "--imgsize=800,600", scad_path],
                        capture_output=True, text=True, timeout=60,
                    )
                    if view_result.returncode != 0:
                        render_warnings.append(f"{view_name} view failed to render.")
                        continue
                    elif view_result.stderr:
                        for line in view_result.stderr.strip().splitlines():
                            if "WARNING" in line:
                                render_warnings.append(f"{view_name}: {line}")
                    if os.path.exists(view_png):
                        with open(view_png, "rb") as f:
                            png_bytes = f.read()
                        blank = is_blank_png(png_bytes)
                        if blank is True:
                            render_warnings.append(
                                f"{view_name} view rendered blank "
                                "(no visible geometry); omitted from results."
                            )
                            continue
                        if blank is None:
                            render_warnings.append(
                                f"{view_name} view produced an unreadable PNG; "
                                "omitted from results."
                            )
                            continue
                        pngs[view_name] = base64.b64encode(png_bytes).decode()

                result = {
                    "stl": None,
                    "png": pngs.get("isometric"),
                    "pngs": pngs,
                    "errors": [],
                    "warnings": render_warnings,
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

                if not pngs:
                    if stl_result.returncode == 0:
                        result["errors"].append(
                            "All preview renders came back blank "
                            "(no visible geometry in any view). The model "
                            "compiled, so the camera failed to frame it."
                        )
                    else:
                        result["errors"].append(
                            "No usable preview renders were produced."
                        )

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
