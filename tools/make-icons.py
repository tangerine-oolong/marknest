#!/usr/bin/env python3
"""纯 Python 生成扩展图标（无第三方依赖）：圆角蓝底 + 白色书签形状。"""
import os
import struct
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTDIR = os.path.join(ROOT, 'extension', 'icons')
SIZES = [16, 32, 48, 128]

BG = (47, 111, 235)
FG = (255, 255, 255)


def inside_rounded(x, y, n, r):
    if x < r and y < r:
        return (x - r) ** 2 + (y - r) ** 2 <= r * r
    if x > n - r and y < r:
        return (x - (n - r)) ** 2 + (y - r) ** 2 <= r * r
    if x < r and y > n - r:
        return (x - r) ** 2 + (y - (n - r)) ** 2 <= r * r
    if x > n - r and y > n - r:
        return (x - (n - r)) ** 2 + (y - (n - r)) ** 2 <= r * r
    return True


def bookmark_shape(x, y, n):
    """书签：矩形带 V 形缺口"""
    m = n * 0.28
    top, bot = n * 0.20, n * 0.82
    left, right = m, n - m
    if not (left <= x <= right and top <= y <= bot):
        return False
    depth = n * 0.20                      # V 的深度
    cx = (left + right) / 2
    half = (right - left) / 2
    rel = (abs(x - cx) / half) if half else 1
    notch = top + depth * (1 - rel)       # 越靠中间，缺口越深
    return y >= notch


def png(size):
    n = size
    r = max(2, int(n * 0.18))
    rows = []
    for y in range(n):
        row = bytearray([0])
        for x in range(n):
            if inside_rounded(x + 0.5, y + 0.5, n, r):
                c = FG if bookmark_shape(x + 0.5, y + 0.5, n) else BG
            else:
                c = (0, 0, 0, 0)
            row += bytes(c if len(c) == 4 else (c[0], c[1], c[2], 255))
        rows.append(bytes(row))
    raw = b''.join(rows)

    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack('>IIBBBBB', n, n, 8, 6, 0, 0, 0)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr)
            + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))


if __name__ == '__main__':
    os.makedirs(OUTDIR, exist_ok=True)
    for s in SIZES:
        p = os.path.join(OUTDIR, f'icon{s}.png')
        open(p, 'wb').write(png(s))
        print(f'  {p}  {os.path.getsize(p)} bytes')
