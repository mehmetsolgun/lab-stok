"""Writes public/icon-192.png, icon-512.png and icon-maskable-512.png (pure Python, no dependencies)."""
import struct, zlib, os

BG = (23, 30, 40)        # app dark panel
ACCENT = (79, 140, 255)  # accent blue
LIQ = (74, 222, 128)     # green liquid


def inside(poly, x, y):
    n, ok, j = len(poly), False, len(poly) - 1
    for i in range(n):
        xi, yi = poly[i]; xj, yj = poly[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            ok = not ok
        j = i
    return ok


def render(size, pad):
    s = size
    # flask in a 100x100 design box, scaled into the padded area
    k = s * (1 - 2 * pad) / 100.0
    ox = oy = s * pad
    P = lambda pts: [(ox + x * k, oy + y * k) for x, y in pts]
    flask = P([(38, 8), (62, 8), (62, 40), (88, 86), (80, 94), (20, 94), (12, 86), (38, 40)])
    liquid = P([(30, 66), (70, 66), (88, 86), (80, 94), (20, 94), (12, 86)])
    rim = P([(34, 4), (66, 4), (66, 10), (34, 10)])
    rows = []
    for y in range(s):
        row = bytearray([0])
        for x in range(s):
            c = BG
            # rounded-square background mask is left to the OS (maskable); keep full bleed
            if inside(flask, x + .5, y + .5):
                c = ACCENT
                if inside(liquid, x + .5, y + .5):
                    c = LIQ
            if inside(rim, x + .5, y + .5):
                c = ACCENT
            row += bytes(c) + b'\xff'
        rows.append(bytes(row))
    raw = b''.join(rows)

    def chunk(t, d):
        b = t + d
        return struct.pack('>I', len(d)) + b + struct.pack('>I', zlib.crc32(b) & 0xFFFFFFFF)

    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', s, s, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')


out = os.path.join(os.path.dirname(__file__), '..', 'public')
for name, size, pad in [('icon-192.png', 192, 0.14), ('icon-512.png', 512, 0.14), ('icon-maskable-512.png', 512, 0.26)]:
    with open(os.path.join(out, name), 'wb') as f:
        f.write(render(size, pad))
    print('wrote', name)
