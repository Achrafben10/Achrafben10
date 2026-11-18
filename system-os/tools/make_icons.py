"""Generate PWA icons for THE SYSTEM (pure stdlib PNG writer)."""
import math
import os
import struct
import zlib

CY = (69, 200, 255)
CY2 = (126, 227, 255)
GOLD = (255, 209, 102)


def clamp(v, a=0.0, b=1.0):
    return max(a, min(b, v))


def lerp(a, b, t):
    return a + (b - a) * t


def mix(c1, c2, t):
    return tuple(lerp(c1[i], c2[i], t) for i in range(3))


def hex_sdf(x, y, r):
    kx, ky, kz = -0.866025404, 0.5, 0.577350269
    px, py = abs(x), abs(y)
    d = kx * px + ky * py
    if d < 0:
        px -= 2.0 * d * kx
        py -= 2.0 * d * ky
    qx = px - max(-kz * r, min(px, kz * r))
    qy = py - r
    return math.hypot(qx, qy) * (1.0 if qy >= 0 else -1.0)


def seg_dist(px, py, ax, ay, bx, by):
    vx, vy = bx - ax, by - ay
    wx, wy = px - ax, py - ay
    t = clamp((wx * vx + wy * vy) / (vx * vx + vy * vy + 1e-9))
    return math.hypot(px - (ax + vx * t), py - (ay + vy * t))


TRI = ((0.0, -0.30), (-0.27, 0.12), (0.27, 0.12))


def tri_inside(px, py):
    (ax, ay), (bx, by), (cx, cy) = TRI
    d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by)
    d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy)
    d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay)
    neg = d1 < 0 or d2 < 0 or d3 < 0
    pos = d1 > 0 or d2 > 0 or d3 > 0
    return not (neg and pos)


def tri_dist(px, py):
    (ax, ay), (bx, by), (cx, cy) = TRI
    return min(
        seg_dist(px, py, ax, ay, bx, by),
        seg_dist(px, py, bx, by, cx, cy),
        seg_dist(px, py, cx, cy, ax, ay),
    )


def sample(px, py):
    """Return (r, g, b) for a point in [-1, 1]^2."""
    # base background
    t = clamp((py + 1) * 0.5)
    col = mix((9, 22, 39), (4, 8, 15), t)

    r = math.hypot(px, py)
    glow = math.exp(-(r * r) / 0.55) * 0.42 + math.exp(-((r - 0.66) ** 2) / 0.010) * 0.18
    col = tuple(c + CY[i] * glow * 0.55 for i, c in enumerate(col))

    d = hex_sdf(px, py, 0.66)
    inner = clamp(-d / 0.05)
    if inner > 0:
        shade = mix((16, 52, 82), (6, 20, 34), clamp((py + 0.66) / 1.32))
        col = mix(col, shade, inner)

    # ring
    ring = clamp(1.0 - abs(d + 0.018) / 0.030)
    if ring > 0:
        col = mix(col, CY2, ring * 0.95)

    # outer breathing glow
    edge = math.exp(-(d / 0.075) ** 2) * 0.55
    col = tuple(c + CY[i] * edge for i, c in enumerate(col))

    # triangle
    td = tri_dist(px, py)
    tri_glow = math.exp(-(td / 0.075) ** 2) * 0.5
    col = tuple(c + CY2[i] * tri_glow for i, c in enumerate(col))
    if tri_inside(px, py):
        tg = clamp((py - TRI[0][1]) / (TRI[1][1] - TRI[0][1]))
        col = mix((236, 251, 255), (69, 185, 235), tg)

    # base bar
    if abs(px) < 0.185 and 0.215 < py < 0.275:
        col = mix(col, CY, 0.55)
        gl = math.exp(-(abs(py - 0.245) / 0.05) ** 2) * 0.25
        col = tuple(c + CY[i] * gl for i, c in enumerate(col))

    return tuple(int(clamp(c / 255.0) * 255) for c in col)


def render(size, ss):
    rows = []
    step = 1.0 / (size * ss)
    for y in range(size):
        row = bytearray()
        row.append(0)
        for x in range(size):
            r = g = b = 0
            for sy in range(ss):
                for sx in range(ss):
                    px = ((x * ss + sx + 0.5) * step) * 2 - 1
                    py = ((y * ss + sy + 0.5) * step) * 2 - 1
                    cr, cg, cb = sample(px, py)
                    r += cr
                    g += cg
                    b += cb
            n = ss * ss
            row += bytes((r // n, g // n, b // n, 255))
        rows.append(bytes(row))
    raw = b''.join(rows)

    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(raw, 9))
    png += chunk(b'IEND', b'')
    return png


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    out = os.path.join(here, '..', 'assets')
    os.makedirs(out, exist_ok=True)
    for size, ss in ((512, 2), (192, 3)):
        data = render(size, ss)
        path = os.path.join(out, 'icon-%d.png' % size)
        with open(path, 'wb') as f:
            f.write(data)
        print('wrote', os.path.relpath(path), len(data), 'bytes')


if __name__ == '__main__':
    main()
