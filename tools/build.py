#!/usr/bin/env python3
"""构建脚本：一份源码 → 两个发行物
  dist/extension/   Chrome 扩展（多文件，MV3 CSP 禁止内联脚本）
  dist/web/index.html  单文件网页版（内联全部 JS/CSS，双击即可用）
顺带生成 src/ui/demo-data.js（把 samples/demo-bookmarks.html 变成页面内可用的演示数据）。
"""
import json
import os
import re
import shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'src')
DIST = os.path.join(ROOT, 'dist')
EXT_SRC = os.path.join(ROOT, 'extension')

CORE = ['core/i18n.js', 'core/model.js', 'core/parse.js', 'core/tags.js',
        'core/classify.js', 'core/preflight.js', 'core/export.js', 'core/diff.js']
ADAPTERS = ['adapters/file-adapter.js', 'adapters/chrome-adapter.js']
APP = ['ui/app.js']
ALL_JS = CORE + ADAPTERS + ['ui/demo-data.js'] + APP


def read(p):
    with open(os.path.join(SRC, p), encoding='utf-8') as f:
        return f.read()


def gen_demo_data():
    sample = os.path.join(ROOT, 'samples', 'demo-bookmarks.html')
    if not os.path.exists(sample):
        raise SystemExit('缺少 samples/demo-bookmarks.html，请先运行 tools/make-demo.py')
    html = open(sample, encoding='utf-8').read()
    js = '/* 自动生成，勿手改：来自 samples/demo-bookmarks.html */\nwindow.BMO_DEMO_HTML = ' + json.dumps(html) + ';\n'
    out = os.path.join(SRC, 'ui', 'demo-data.js')
    open(out, 'w', encoding='utf-8').write(js)
    return len(html)


def build_extension():
    out = os.path.join(DIST, 'extension')
    if os.path.isdir(out):
        shutil.rmtree(out)
    os.makedirs(out)
    shutil.copy(os.path.join(EXT_SRC, 'manifest.json'), out)
    shutil.copy(os.path.join(EXT_SRC, 'background.js'), out)
    icons = os.path.join(EXT_SRC, 'icons')
    if os.path.isdir(icons):
        shutil.copytree(icons, os.path.join(out, 'icons'))
    for p in CORE + ADAPTERS + APP + ['ui/index.html', 'ui/styles.css', 'ui/demo-data.js']:
        dst = os.path.join(out, p)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        if p.endswith('ui/index.html'):
            # 扩展页面用包内绝对路径，避免 ../ 跨目录引用
            html = open(os.path.join(SRC, p), encoding='utf-8').read()
            html = re.sub(r'(src|href)="\.\./', r'\1="/', html)
            open(dst, 'w', encoding='utf-8').write(html)
        else:
            shutil.copy(os.path.join(SRC, p), dst)
    return out


def build_web():
    out = os.path.join(DIST, 'web')
    os.makedirs(out, exist_ok=True)
    html = read('ui/index.html')
    css = read('ui/styles.css')
    style_tag = '<style>\n' + css.replace('</style', '<\\/style') + '\n</style>'
    html = re.sub(r'<link rel="stylesheet"[^>]*>', lambda _: style_tag, html, count=1)

    scripts = []
    for p in CORE + ADAPTERS + ['ui/demo-data.js'] + APP:
        body = read(p).replace('</script', '<\\/script')
        scripts.append('/* ===== ' + p + ' ===== */\n' + body)
    inline = '<script>\n' + '\n;\n'.join(scripts) + '\n</script>'
    html = re.sub(r'(?:<script src="[^"]*"></script>\s*)+', lambda _: inline, html)
    dest = os.path.join(out, 'index.html')
    open(dest, 'w', encoding='utf-8').write(html)
    return dest


def main():
    n = gen_demo_data()
    e = build_extension()
    w = build_web()
    size = lambda p: f'{os.path.getsize(p)/1024:.1f} KB' if os.path.isfile(p) else ''
    print(f'演示数据 → src/ui/demo-data.js ({n/1024:.1f} KB)')
    print(f'扩展 → {e}/  (manifest {size(os.path.join(e,"manifest.json"))})')
    files = sum(len(fs) for _, _, fs in os.walk(e))
    print(f'       {files} 个文件')
    print(f'网页 → {w}  ({size(w)})')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
