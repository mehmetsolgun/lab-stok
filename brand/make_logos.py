"""Lab Stok logo alternatifleri (saf Python -> SVG). Çalıştır: python make_logos.py"""
import math, os

BLUE = "#4f8cff"
BLUE_D = "#2f6be0"
MINT = "#34d399"
WHITE = "#ffffff"


def strand_path(cx, ya, yb, y0, amp, period, phase, step=1.2):
    def x_at(y):
        return cx + amp * math.sin(2 * math.pi * (y - y0) / period + phase)
    pts, y = [], ya
    while y < yb:
        pts.append(f"{x_at(y):.2f} {y:.2f}")
        y += step
    pts.append(f"{x_at(yb):.2f} {yb:.2f}")
    return "M" + " L".join(pts)


def helix(cx, y0, y1, amp, period, col_a, col_b, sw=4.2, rungs=True):
    """Dikey çift sarmal. Kesişimlerde bir çizgi üstten, diğeri alttan geçer (alttaki kısa bir boşlukla kesilir)."""
    half = period / 2
    n = int((y1 - y0) / half + 1e-6)          # kesişim sayısı: y0 + k*half
    gap = sw * 0.95
    out = []
    if rungs:
        k = 0
        while True:
            y = y0 + half * k + half / 2
            if y > y1:
                break
            d = amp * math.sin(2 * math.pi * (y - y0) / period)
            out.append(f'<line x1="{cx + d:.2f}" y1="{y:.2f}" x2="{cx - d:.2f}" y2="{y:.2f}" stroke="{col_a}" stroke-width="{sw * 0.5:.2f}" stroke-linecap="round" opacity=".55"/>')
            k += 1

    def segments(phase, col, under_on_even):
        res = []
        for i in range(n + 1):
            ya = y0 + half * i
            yb = min(y0 + half * (i + 1), y1)
            if yb - ya < 1.0:
                continue
            if i > 0 and (i % 2 == 0) == under_on_even:                  # başlangıç kesişiminde altta
                ya += gap
            if yb < y1 - 0.01 and ((i + 1) % 2 == 0) == under_on_even:   # bitiş kesişiminde altta
                yb -= gap
            d = strand_path(cx, ya, yb, y0, amp, period, phase)
            res.append(f'<path d="{d}" fill="none" stroke="{col}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round"/>')
        return res

    out += segments(math.pi, col_b, True)     # B: 0,2,4… numaralı kesişimlerde altta
    out += segments(0.0, col_a, False)        # A: 1,3,5… numaralı kesişimlerde altta
    return "\n  ".join(out)


def svg(body, title):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" role="img" aria-label="{title}">\n'
            f'  <title>{title}</title>\n  {body}\n</svg>\n')


def logo_a():
    flask = "M50 16 L50 44 L24 93 Q17 106 32 106 L88 106 Q103 106 96 93 L70 44 L70 16 Z"
    body = f'''<defs>
    <linearGradient id="ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{BLUE}"/><stop offset="1" stop-color="{BLUE_D}"/></linearGradient>
  </defs>
  <rect x="41" y="8" width="38" height="9" rx="4.5" fill="url(#ga)"/>
  <path d="{flask}" fill="url(#ga)"/>
  {helix(60, 56, 101, 11.5, 30, WHITE, MINT, sw=4.8)}'''
    return svg(body, "Lab Stok — sarmal şişe")


def logo_b():
    pad = "M60 54 C79 54 95 72 93 87 C91 100 76 103 60 98 C44 103 29 100 27 87 C25 72 41 54 60 54 Z"
    toes = [(28, 49, 9, 12, -22), (47, 31, 9.5, 13.5, -7), (73, 31, 9.5, 13.5, 7), (92, 49, 9, 12, 22)]
    toe_svg = "\n  ".join(f'<ellipse cx="{x}" cy="{y}" rx="{rx}" ry="{ry}" transform="rotate({r} {x} {y})" fill="url(#gb)"/>' for x, y, rx, ry, r in toes)
    body = f'''<defs>
    <linearGradient id="gb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{BLUE}"/><stop offset="1" stop-color="{BLUE_D}"/></linearGradient>
  </defs>
  {toe_svg}
  <path d="{pad}" fill="url(#gb)"/>
  {helix(60, 62, 95, 10, 25, WHITE, MINT, sw=4.0)}'''
    return svg(body, "Lab Stok — sarmal pati")


def logo_c():
    body = f'''<defs>
    <linearGradient id="gc" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b6fd8"/><stop offset="1" stop-color="#1b2b52"/></linearGradient>
  </defs>
  <rect x="4" y="4" width="112" height="112" rx="30" fill="url(#gc)"/>
  <path d="M33 34 L60 88 L87 34" fill="none" stroke="{WHITE}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>
  <line x1="44.5" y1="49" x2="75.5" y2="49" stroke="{MINT}" stroke-width="6.5" stroke-linecap="round"/>
  <line x1="52" y1="64" x2="68" y2="64" stroke="{MINT}" stroke-width="6.5" stroke-linecap="round"/>'''
    return svg(body, "Lab Stok — V monogram")


if __name__ == "__main__":
    out = os.path.dirname(os.path.abspath(__file__))
    for name, fn in [("logo-a-sarmal-sise", logo_a), ("logo-b-sarmal-pati", logo_b), ("logo-c-monogram", logo_c)]:
        open(os.path.join(out, name + ".svg"), "w", encoding="utf-8").write(fn())
        print("yazıldı:", name)
