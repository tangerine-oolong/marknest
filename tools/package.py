#!/usr/bin/env python3
"""打包发行物到 dist/release/：

  marknest-extension-v<版本>.zip   Chrome 扩展（解压后是一个文件夹，直接「加载已解压的扩展程序」）
  marknest-web-v<版本>.html        单文件网页版（双击即用）

版本号取自 extension/manifest.json，保证和扩展里显示的版本一致。
"""
import os
import re
import shutil
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, 'dist')
OUT = os.path.join(DIST, 'release')
EXT = os.path.join(DIST, 'extension')
WEB = os.path.join(DIST, 'web', 'index.html')
MANIFEST = os.path.join(ROOT, 'extension', 'manifest.json')
SKIP = {'.DS_Store', 'Thumbs.db'}


def version():
    txt = open(MANIFEST, encoding='utf-8').read()
    m = re.search(r'"version"\s*:\s*"([^"]+)"', txt)
    if not m:
        raise SystemExit('manifest.json 里找不到 version')
    return m.group(1)


def build_if_missing():
    if not (os.path.isdir(EXT) and os.path.exists(WEB)):
        print('缺少 dist/，先跑 tools/build.py')
        raise SystemExit(1)


def clean_junk(path):
    for root, _, files in os.walk(path):
        for f in files:
            if f in SKIP or f.endswith('.pyc'):
                os.remove(os.path.join(root, f))


def zip_extension(v):
    target = os.path.join(OUT, f'marknest-extension-v{v}.zip')
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as z:
        for root, dirs, files in os.walk(EXT):
            dirs[:] = [d for d in dirs if d not in ('.DS_Store',)]
            for f in sorted(files):
                if f in SKIP:
                    continue
                full = os.path.join(root, f)
                arc = os.path.join('marknest-extension', os.path.relpath(full, EXT))
                z.write(full, arc)
    return target


def copy_web(v):
    target = os.path.join(OUT, f'marknest-web-v{v}.html')
    shutil.copyfile(WEB, target)
    return target


def main():
    v = version()
    build_if_missing()
    clean_junk(EXT)
    os.makedirs(OUT, exist_ok=True)
    for old in os.listdir(OUT):
        os.remove(os.path.join(OUT, old))
    z = zip_extension(v)
    h = copy_web(v)
    # 自检：zip 必须以 marknest-extension/manifest.json 为根，且不含系统垃圾文件
    with zipfile.ZipFile(z) as zf:
        names = zf.namelist()
        assert 'marknest-extension/manifest.json' in names, 'zip 根结构不对，解压后无法直接加载'
        assert not [n for n in names if os.path.basename(n) in SKIP], 'zip 里混入了系统垃圾文件'
        print(f'扩展包  {os.path.basename(z)}  {len(names)} 个文件  {os.path.getsize(z)/1024:.0f} KB')
    print(f'网页版  {os.path.basename(h)}  {os.path.getsize(h)/1024:.0f} KB')
    print(f'版本    v{v}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
