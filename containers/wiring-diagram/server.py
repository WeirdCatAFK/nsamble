"""Fritzing-style breadboard wiring diagram generator."""
import json
import base64
import os
import xml.etree.ElementTree as ET
from http.server import HTTPServer, BaseHTTPRequestHandler

# ---------------------------------------------------------------------------
# Board templates — pin positions in SVG coordinates
# Board is drawn at (BOARD_X, BOARD_Y). Pins are relative offsets.
# ---------------------------------------------------------------------------

PIN_SPACING = 15

def _make_pins(labels, side, count):
    """Generate pin list for a board side. side: 'left' or 'right'."""
    return [{"label": l, "y": 50 + i * PIN_SPACING} for i, l in enumerate(labels)]

BOARDS = {
    "esp32-devkit-v1": {
        "name": "ESP32 DevKit V1",
        "width": 80, "height": 490,
        "pins_left": _make_pins(
            ["3V3","GND","GPIO15","GPIO2","GPIO4","GPIO16","GPIO17",
             "GPIO5","GPIO18","GPIO19","GPIO21","GPIO3","GPIO1",
             "GPIO22","GPIO23"], "left", 15),
        "pins_right": _make_pins(
            ["VIN","GND","GPIO13","GPIO12","GPIO14","GPIO27","GPIO26",
             "GPIO25","GPIO33","GPIO32","GPIO35","GPIO34","SVN","SVP",
             "EN"], "right", 15),
        "usb": "micro-b",
    },
    "esp32-s3-devkitc": {
        "name": "ESP32-S3-DevKitC",
        "width": 80, "height": 520,
        "pins_left": _make_pins(
            ["3V3","3V3","RST","GPIO4","GPIO5","GPIO6","GPIO7",
             "GPIO15","GPIO16","GPIO17","GPIO18","GPIO8","GPIO3",
             "GPIO46","GPIO9","GPIO10","GPIO11"], "left", 17),
        "pins_right": _make_pins(
            ["GND","TX","RX","GPIO1","GPIO2","GPIO42","GPIO41",
             "GPIO40","GPIO39","GPIO38","GPIO37","GPIO36","GPIO35",
             "GPIO0","GPIO45","GPIO48","GPIO47"], "right", 17),
        "usb": "type-c",
    },
    "esp32-c3-devkitm": {
        "name": "ESP32-C3-DevKitM",
        "width": 70, "height": 340,
        "pins_left": _make_pins(
            ["3V3","GND","GPIO2","GPIO3","GPIO10","GPIO6",
             "GPIO7","GPIO21","GPIO20"], "left", 9),
        "pins_right": _make_pins(
            ["GND","GPIO1","GPIO0","GPIO8","GPIO9","GPIO18",
             "GPIO19","GPIO5","GPIO4"], "right", 9),
        "usb": "type-c",
    },
    "arduino-uno-r3": {
        "name": "Arduino Uno R3",
        "width": 90, "height": 440,
        "pins_left": _make_pins(
            ["D0","D1","D2","D3","D4","D5","D6","D7",
             "D8","D9","D10","D11","D12","D13","GND","AREF"], "left", 16),
        "pins_right": _make_pins(
            ["A0","A1","A2","A3","A4","A5","VIN","GND",
             "GND","5V","3V3","RST","IOREF","NC"], "right", 14),
        "usb": "type-b",
    },
    "arduino-nano": {
        "name": "Arduino Nano",
        "width": 60, "height": 460,
        "pins_left": _make_pins(
            ["D1","D0","RST","GND","D2","D3","D4","D5",
             "D6","D7","D8","D9","D10","D11","D12"], "left", 15),
        "pins_right": _make_pins(
            ["VIN","GND","RST","5V","A7","A6","A5","A4",
             "A3","A2","A1","A0","AREF","3V3","D13"], "right", 15),
        "usb": "mini-b",
    },
    "arduino-mega-2560": {
        "name": "Arduino Mega 2560",
        "width": 100, "height": 580,
        "pins_left": _make_pins(
            ["D0","D1","D2","D3","D4","D5","D6","D7",
             "D8","D9","D10","D11","D12","D13","D14","D15",
             "D16","D17","D18","D19","D20","D21","D22","D23",
             "D24","D25","D26","D27","D28","D29","D30","D31"], "left", 32),
        "pins_right": _make_pins(
            ["A0","A1","A2","A3","A4","A5","A6","A7",
             "A8","A9","A10","A11","A12","A13","A14","A15",
             "5V","3V3","VIN","GND","GND","AREF",
             "D32","D33","D34","D35","D36","D37","D38","D39",
             "D40","D41"], "right", 32),
        "usb": "type-b",
    },
}

# ---------------------------------------------------------------------------
# Component visual templates
# ---------------------------------------------------------------------------

COMP_STYLES = {
    "bme280":        {"color": "#1565C0", "w": 60, "h": 50, "pins": ["VCC","GND","SCL","SDA"]},
    "dht22":         {"color": "#1565C0", "w": 60, "h": 50, "pins": ["VCC","DATA","NC","GND"]},
    "hc-sr04":       {"color": "#1565C0", "w": 70, "h": 50, "pins": ["VCC","TRIG","ECHO","GND"]},
    "mpu6050":       {"color": "#1565C0", "w": 60, "h": 60, "pins": ["VCC","GND","SCL","SDA","XDA","XCL","AD0","INT"]},
    "ssd1306":       {"color": "#37474F", "w": 70, "h": 50, "pins": ["GND","VCC","SCL","SDA"]},
    "lcd-16x2":      {"color": "#37474F", "w": 90, "h": 50, "pins": ["GND","VCC","SDA","SCL"]},
    "servo":         {"color": "#E65100", "w": 60, "h": 40, "pins": ["GND","VCC","SIG"]},
    "sg90":          {"color": "#E65100", "w": 60, "h": 40, "pins": ["GND","VCC","SIG"]},
    "l298n":         {"color": "#E65100", "w": 80, "h": 60, "pins": ["IN1","IN2","IN3","IN4","ENA","ENB","VCC","GND","5V"]},
    "relay":         {"color": "#E65100", "w": 60, "h": 45, "pins": ["VCC","GND","SIG","COM","NO","NC"]},
    "led":           {"color": "#F44336", "w": 30, "h": 30, "pins": ["ANODE","CATHODE"], "shape": "circle"},
    "resistor":      {"color": "#795548", "w": 50, "h": 20, "pins": ["1","2"], "shape": "resistor"},
    "buzzer":        {"color": "#6A1B9A", "w": 40, "h": 40, "pins": ["VCC","GND"]},
    "pir":           {"color": "#1565C0", "w": 50, "h": 50, "pins": ["VCC","OUT","GND"]},
    "photoresistor": {"color": "#795548", "w": 30, "h": 30, "pins": ["1","2"]},
    "nrf24l01":      {"color": "#0D47A1", "w": 60, "h": 55, "pins": ["GND","VCC","CE","CSN","SCK","MOSI","MISO","IRQ"]},
    "hc-05":         {"color": "#0D47A1", "w": 60, "h": 50, "pins": ["VCC","GND","TXD","RXD"]},
    "sd-card":       {"color": "#455A64", "w": 60, "h": 50, "pins": ["CS","SCK","MOSI","MISO","VCC","GND"]},
}

# ---------------------------------------------------------------------------
# Layout constants
# ---------------------------------------------------------------------------

SVG_W, SVG_H = 900, 600
BG_COLOR = "#1e1e1e"
BOARD_X = 30
BOARD_Y = 30
BREADBOARD_X = 260
BREADBOARD_Y = 40
BREADBOARD_W = 280
BREADBOARD_H = 520
COMP_START_X = 580
COMP_START_Y = 50
COMP_GAP = 20

# ---------------------------------------------------------------------------
# SVG builder helpers
# ---------------------------------------------------------------------------

def _el(parent, tag, **attrs):
    """Create a sub-element with string attributes."""
    e = ET.SubElement(parent, tag)
    for k, v in attrs.items():
        k = k.replace("_", "-") if k not in ("x", "y") else k
        e.set(k, str(v))
    return e

def _text(parent, x, y, content, size=9, fill="#e0e0e0", anchor="start", weight="normal"):
    t = _el(parent, "text", x=x, y=y, fill=fill)
    t.set("font-family", "monospace")
    t.set("font-size", str(size))
    t.set("text-anchor", anchor)
    t.set("font-weight", weight)
    t.set("dominant-baseline", "middle")
    t.text = content
    return t

# ---------------------------------------------------------------------------
# Drawing functions
# ---------------------------------------------------------------------------

def draw_board(svg, board_tmpl):
    """Draw the dev board and return a dict mapping pin_label -> (abs_x, abs_y)."""
    g = _el(svg, "g", id="board")
    bw, bh = board_tmpl["width"], board_tmpl["height"]

    # Shrink board to fit SVG if needed
    max_h = SVG_H - BOARD_Y * 2
    scale = min(1.0, max_h / bh)
    bh_draw = bh * scale
    bw_draw = bw * scale
    pin_scale = scale

    # PCB body
    _el(g, "rect", x=BOARD_X, y=BOARD_Y, width=bw_draw, height=bh_draw,
        rx=4, fill="#2E7D32", stroke="#1B5E20")

    # USB connector at top
    usb_w = 24 if board_tmpl.get("usb") == "type-b" else 16
    usb_h = 12
    usb_x = BOARD_X + bw_draw / 2 - usb_w / 2
    _el(g, "rect", x=usb_x, y=BOARD_Y - 6, width=usb_w, height=usb_h,
        rx=2, fill="#9E9E9E", stroke="#757575")

    # IC chip in center
    ic_w, ic_h = 28 * scale, 28 * scale
    _el(g, "rect",
        x=BOARD_X + bw_draw / 2 - ic_w / 2,
        y=BOARD_Y + bh_draw / 2 - ic_h / 2,
        width=ic_w, height=ic_h, fill="#212121", stroke="#424242")

    # Board label
    _text(g, BOARD_X + bw_draw / 2, BOARD_Y + bh_draw - 12,
           board_tmpl["name"], size=8, anchor="middle", weight="bold")

    pin_map = {}

    # Left pins
    for p in board_tmpl["pins_left"]:
        py = BOARD_Y + p["y"] * pin_scale
        px = BOARD_X
        # Pin dot
        _el(g, "circle", cx=px, cy=py, r=3, fill="#FFD54F")
        # Label
        _text(g, px - 5, py, p["label"], size=7, anchor="end")
        pin_map[p["label"]] = (px, py)

    # Right pins
    for p in board_tmpl["pins_right"]:
        py = BOARD_Y + p["y"] * pin_scale
        px = BOARD_X + bw_draw
        _el(g, "circle", cx=px, cy=py, r=3, fill="#FFD54F")
        _text(g, px + 5, py, p["label"], size=7)
        pin_map[p["label"]] = (px, py)

    return pin_map


def draw_breadboard(svg):
    """Draw simplified breadboard and return row Y positions."""
    g = _el(svg, "g", id="breadboard")

    # Main body
    _el(g, "rect", x=BREADBOARD_X, y=BREADBOARD_Y,
        width=BREADBOARD_W, height=BREADBOARD_H,
        rx=4, fill="#F5F5DC", stroke="#D7CCC8")

    # Power rail top (red + blue)
    _el(g, "rect", x=BREADBOARD_X + 5, y=BREADBOARD_Y + 5,
        width=BREADBOARD_W - 10, height=12, fill="#FFCDD2", stroke="#EF9A9A", rx=2)
    _text(g, BREADBOARD_X + 10, BREADBOARD_Y + 12, "+", size=8, fill="#C62828")
    _el(g, "rect", x=BREADBOARD_X + 5, y=BREADBOARD_Y + 20,
        width=BREADBOARD_W - 10, height=12, fill="#BBDEFB", stroke="#90CAF9", rx=2)
    _text(g, BREADBOARD_X + 10, BREADBOARD_Y + 27, "−", size=8, fill="#1565C0")

    # Center channel
    channel_y = BREADBOARD_Y + BREADBOARD_H / 2 - 4
    _el(g, "rect", x=BREADBOARD_X + 10, y=channel_y,
        width=BREADBOARD_W - 20, height=8, fill="#D7CCC8")

    # Power rail bottom
    _el(g, "rect", x=BREADBOARD_X + 5, y=BREADBOARD_Y + BREADBOARD_H - 32,
        width=BREADBOARD_W - 10, height=12, fill="#FFCDD2", stroke="#EF9A9A", rx=2)
    _el(g, "rect", x=BREADBOARD_X + 5, y=BREADBOARD_Y + BREADBOARD_H - 18,
        width=BREADBOARD_W - 10, height=12, fill="#BBDEFB", stroke="#90CAF9", rx=2)

    # Row hole dots (simplified — a few rows)
    row_ys = {}
    start_y = BREADBOARD_Y + 42
    for row in range(30):
        ry = start_y + row * 14
        if ry > BREADBOARD_Y + BREADBOARD_H - 40:
            break
        for col in range(5):
            cx = BREADBOARD_X + 30 + col * 18
            _el(g, "circle", cx=cx, cy=ry, r=2, fill="#BDBDBD")
        for col in range(5):
            cx = BREADBOARD_X + BREADBOARD_W - 30 - col * 18
            _el(g, "circle", cx=cx, cy=ry, r=2, fill="#BDBDBD")
        row_ys[row] = ry

    return row_ys


def draw_component(svg, comp, x, y):
    """Draw a component and return pin_label -> (abs_x, abs_y) map."""
    style = COMP_STYLES.get(comp["type"], None)
    if style is None:
        # Generic fallback
        style = {"color": "#616161", "w": 60, "h": 40,
                 "pins": comp.get("pin_labels", ["1", "2"])}

    g = _el(svg, "g", id=f"comp-{comp['label']}")
    cw, ch = style["w"], style["h"]

    shape = style.get("shape", "rect")
    if shape == "circle":
        color = comp.get("color", style["color"])
        _el(g, "circle", cx=x + cw / 2, cy=y + ch / 2, r=min(cw, ch) / 2,
            fill=color, stroke="#fff", opacity="0.9")
    elif shape == "resistor":
        # Draw as small labeled rectangle
        _el(g, "rect", x=x, y=y, width=cw, height=ch, rx=3,
            fill=style["color"], stroke="#5D4037")
        val = comp.get("value", "")
        if val:
            _text(g, x + cw / 2, y + ch / 2, val, size=7, anchor="middle", fill="#fff")
    else:
        _el(g, "rect", x=x, y=y, width=cw, height=ch, rx=4,
            fill=style["color"], stroke="#fff", opacity="0.9")

    # Label
    _text(g, x + cw / 2, y - 5, comp["label"], size=8, anchor="middle",
          fill="#FFD54F", weight="bold")

    # Type label inside
    if shape == "rect":
        _text(g, x + cw / 2, y + ch / 2, comp["type"].upper(), size=7,
              anchor="middle", fill="#fff")

    # Pins on the left side
    pin_map = {}
    pins = style["pins"]
    for i, pl in enumerate(pins):
        py = y + 10 + i * PIN_SPACING
        if py > y + ch:
            py = y + ch - 5
        px = x
        _el(g, "circle", cx=px, cy=py, r=2.5, fill="#FFD54F")
        _text(g, px - 5, py, pl, size=6, anchor="end", fill="#BDBDBD")
        pin_map[pl] = (px, py)

    return pin_map


def draw_wire(svg, x1, y1, x2, y2, color, offset=0):
    """Draw a Manhattan-routed wire between two points."""
    mid_x = (x1 + x2) / 2 + offset
    points = f"{x1},{y1} {mid_x},{y1} {mid_x},{y2} {x2},{y2}"
    _el(svg, "polyline", points=points, fill="none",
        stroke=color, opacity="0.85")
    _el(svg, "polyline", points=points, fill="none",
        stroke=color, opacity="0.85").set("stroke-width", "2")
    # Solder dots at endpoints
    _el(svg, "circle", cx=x1, cy=y1, r=3, fill=color)
    _el(svg, "circle", cx=x2, cy=y2, r=3, fill=color)


# ---------------------------------------------------------------------------
# Main generator
# ---------------------------------------------------------------------------

def generate_diagram(data):
    warnings = []
    board_id = data.get("board", "esp32-devkit-v1")
    components = data.get("components", [])
    connections = data.get("connections", [])

    board_tmpl = BOARDS.get(board_id)
    if board_tmpl is None:
        warnings.append(f"Unknown board '{board_id}', using esp32-devkit-v1.")
        board_tmpl = BOARDS["esp32-devkit-v1"]

    # Compute SVG height from board pin count
    max_pins = max(len(board_tmpl["pins_left"]), len(board_tmpl["pins_right"]))
    needed_h = max(SVG_H, BOARD_Y * 2 + max_pins * PIN_SPACING + 60)
    svg_h = min(needed_h, 900)

    svg = ET.Element("svg")
    svg.set("xmlns", "http://www.w3.org/2000/svg")
    svg.set("viewBox", f"0 0 {SVG_W} {svg_h}")
    svg.set("width", str(SVG_W))
    svg.set("height", str(svg_h))

    # Background
    _el(svg, "rect", x=0, y=0, width=SVG_W, height=svg_h, fill=BG_COLOR)

    # Title
    _text(svg, SVG_W / 2, 18, f"Wiring Diagram — {board_tmpl['name']}", size=12,
          anchor="middle", fill="#90CAF9", weight="bold")

    # Draw board
    board_pins = draw_board(svg, board_tmpl)

    # Draw breadboard
    draw_breadboard(svg)

    # Draw components and collect pin maps
    all_pin_maps = {"board": board_pins}
    cy = COMP_START_Y
    for comp in components:
        if comp["type"] not in COMP_STYLES:
            warnings.append(f"Unknown component type '{comp['type']}', drawn as generic.")
        cstyle = COMP_STYLES.get(comp["type"], {"w": 60, "h": 40})
        comp_pins = draw_component(svg, comp, COMP_START_X, cy)
        all_pin_maps[comp["label"]] = comp_pins
        cy += cstyle.get("h", 40) + COMP_GAP

    # Draw wires
    for i, conn in enumerate(connections):
        src = conn.get("from", {})
        dst = conn.get("to", {})
        color = conn.get("color", "#666666")

        src_device = src.get("device", "board")
        src_pin = src.get("pin", "")
        dst_device = dst.get("device", "")
        dst_pin = dst.get("pin", "")

        src_map = all_pin_maps.get(src_device, {})
        dst_map = all_pin_maps.get(dst_device, {})

        p1 = src_map.get(src_pin)
        p2 = dst_map.get(dst_pin)

        if p1 is None:
            warnings.append(f"Pin '{src_pin}' not found on '{src_device}'.")
            continue
        if p2 is None:
            warnings.append(f"Pin '{dst_pin}' not found on '{dst_device}'.")
            continue

        # Stagger vertical segment to reduce overlap
        offset = (i - len(connections) / 2) * 6
        draw_wire(svg, p1[0], p1[1], p2[0], p2[1], color, offset)

    # Legend — power rails
    power_rails = data.get("power_rails", {})
    if power_rails:
        ly = svg_h - 25
        _text(svg, 30, ly, "Power:", size=9, fill="#BDBDBD", weight="bold")
        lx = 80
        for label, voltage in power_rails.items():
            c = "#F44336" if "vcc" in label.lower() or "v" in label.lower() else "#212121"
            _el(svg, "line", x1=lx, y1=ly, x2=lx + 20, y2=ly, stroke=c)
            _el(svg, "line", x1=lx, y1=ly, x2=lx + 20, y2=ly).set("stroke-width", "3")
            _text(svg, lx + 25, ly, f"{label}: {voltage}", size=8, fill="#BDBDBD")
            lx += 100

    return ET.tostring(svg, encoding="unicode", xml_declaration=True), warnings


# ---------------------------------------------------------------------------
# HTTP server
# ---------------------------------------------------------------------------

class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/generate":
            self.send_error(404)
            return

        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length))

        try:
            svg_str, warnings = generate_diagram(body)
            svg_b64 = base64.b64encode(svg_str.encode("utf-8")).decode()
            result = {"svg": svg_b64, "warnings": warnings}
        except Exception as e:
            result = {"svg": None, "warnings": [], "errors": [str(e)]}

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
    port = int(os.environ.get("PORT", "8082"))
    server = HTTPServer(("0.0.0.0", port), Handler)
    print(f"Wiring diagram server on port {port}")
    server.serve_forever()
