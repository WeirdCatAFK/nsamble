"""Regression tests for the OpenSCAD render server helpers.

Run from this directory with: python3 test_server.py
"""
import struct
import sys
import os
import unittest
import zlib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import server


def _chunk(ctype, payload):
    return (
        struct.pack(">I", len(payload))
        + ctype
        + payload
        + struct.pack(">I", zlib.crc32(ctype + payload) & 0xFFFFFFFF)
    )


def _filter_row(filter_type, row, prev, bpp):
    if filter_type == 0:
        return bytes(row)
    out = bytearray()
    for i, b in enumerate(row):
        a = row[i - bpp] if i >= bpp else 0
        bb = prev[i] if prev is not None else 0
        c = prev[i - bpp] if (prev is not None and i >= bpp) else 0
        if filter_type == 1:
            out.append((b - a) & 0xFF)
        elif filter_type == 2:
            out.append((b - bb) & 0xFF)
        elif filter_type == 3:
            out.append((b - ((a + bb) >> 1)) & 0xFF)
        else:
            p = a + bb - c
            pa, pb, pc = abs(p - a), abs(p - bb), abs(p - c)
            pr = a if (pa <= pb and pa <= pc) else (bb if pb <= pc else c)
            out.append((b - pr) & 0xFF)
    return bytes(out)


def make_png(width, height, color=(250, 250, 250), squares=(), color_type=2,
             filters=0, interlaced=False):
    """Build a small valid PNG: solid color plus optional filled squares."""
    channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[color_type]
    if isinstance(filters, int):
        filters = [filters] * height
    stride = width * channels
    bpp = channels
    pixels = [bytearray(color) * width for _ in range(height)]
    for (sx, sy, size, scol) in squares:
        for y in range(sy, min(sy + size, height)):
            for x in range(sx, min(sx + size, width)):
                pixels[y][x * channels:(x + 1) * channels] = bytes(scol)
    raw = bytearray()
    prev = None
    for row, ftype in zip(pixels, filters):
        raw.append(ftype)
        raw += _filter_row(ftype, row, prev, bpp)
        prev = row
    ihdr = struct.pack(">IIBBBBB", width, height, 8, color_type, 0, 0,
                       1 if interlaced else 0)
    return (b"\x89PNG\r\n\x1a\n" + _chunk(b"IHDR", ihdr)
            + _chunk(b"IDAT", zlib.compress(bytes(raw))) + _chunk(b"IEND", b""))


def make_gray4_png(width, height, bg_index=0, squares=()):
    """Build a 4-bit grayscale PNG: solid index plus optional squares."""
    grid = [[bg_index] * width for _ in range(height)]
    for (sx, sy, size, idx) in squares:
        for y in range(sy, min(sy + size, height)):
            for x in range(sx, min(sx + size, width)):
                grid[y][x] = idx
    raw = bytearray()
    for row in grid:
        raw.append(0)
        for i in range(0, width, 2):
            hi = row[i]
            lo = row[i + 1] if i + 1 < width else 0
            raw.append((hi << 4) | lo)
    ihdr = struct.pack(">IIBBBBB", width, height, 4, 0, 0, 0, 0)
    return (b"\x89PNG\r\n\x1a\n" + _chunk(b"IHDR", ihdr)
            + _chunk(b"IDAT", zlib.compress(bytes(raw))) + _chunk(b"IEND", b""))


class BlankPngTest(unittest.TestCase):
    def test_solid_render_is_blank(self):
        png = make_png(64, 48)
        self.assertTrue(server.is_blank_png(png))

    def test_render_with_geometry_is_not_blank(self):
        png = make_png(64, 48, squares=[(10, 10, 30, (200, 30, 30))])
        self.assertFalse(server.is_blank_png(png))

    def test_tiny_mark_counts_as_blank(self):
        png = make_png(800, 600, squares=[(400, 300, 2, (200, 30, 30))])
        self.assertTrue(server.is_blank_png(png))

    def test_mixed_filter_types(self):
        png = make_png(64, 48, filters=[i % 5 for i in range(48)])
        self.assertTrue(server.is_blank_png(png))
        png = make_png(64, 48, squares=[(10, 10, 30, (200, 30, 30))],
                       filters=[i % 5 for i in range(48)])
        self.assertFalse(server.is_blank_png(png))

    def test_rgba_solid_is_blank(self):
        png = make_png(64, 48, color=(250, 250, 250, 255),
                       squares=[(10, 10, 30, (200, 30, 30, 255))],
                       color_type=6)
        self.assertFalse(server.is_blank_png(png))
        self.assertTrue(server.is_blank_png(
            make_png(64, 48, color=(250, 250, 250, 255), color_type=6)))

    def test_subbyte_depth(self):
        self.assertTrue(server.is_blank_png(make_gray4_png(64, 48)))
        png = make_gray4_png(64, 48, squares=[(10, 10, 30, 9)])
        self.assertFalse(server.is_blank_png(png))

    def test_truncated_png_is_unknown(self):
        png = make_png(64, 48)
        self.assertIsNone(server.is_blank_png(png[:40]))
        self.assertIsNone(server.is_blank_png(b"not a png"))

    def test_interlaced_png_is_unknown(self):
        png = make_png(64, 48, interlaced=True)
        self.assertIsNone(server.is_blank_png(png))


if __name__ == "__main__":
    unittest.main()
