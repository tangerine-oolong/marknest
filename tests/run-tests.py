#!/usr/bin/env python3
"""静态自测：不依赖浏览器，可在 CI 里跑。
浏览器端的功能测试见 tests/browser-tests.html（打开即跑，全绿为通过）。"""
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FAILS = []


def check(name, cond, detail=''):
    print(('  ✔ ' if cond else '  ✘ ') + name + (('  ← ' + str(detail)) if detail and not cond else ''))
    if not cond:
        FAILS.append(name)


def run(cmd):
    p = subprocess.run([sys.executable] + cmd, cwd=ROOT, capture_output=True, text=True)
    return p.returncode, (p.stdout + p.stderr).strip()


print('1) 构建')
rc, out = run(['tools/build.py'])
check('tools/build.py 成功', rc == 0, out.splitlines()[-1] if out else '')

print('2) 泄露守卫')
for scope in ('', 'dist/'):
    rc, out = run(['tools/leak-guard.py'] + ([scope] if scope else []))
    check(f'leak-guard {scope or "(仓库)"}', rc == 0, out.splitlines()[-1] if out else '')

print('3) CSP 合规')
rc, out = run(['tools/csp-check.py', 'dist/extension'])
check('扩展包无内联脚本/内联事件', rc == 0, out.splitlines()[-1] if out else '')

print('4) manifest')
mp = os.path.join(ROOT, 'dist/extension/manifest.json')
mf = json.load(open(mp, encoding='utf-8'))
check('manifest_version = 3', mf.get('manifest_version') == 3)
check('有 name / version / description', all(mf.get(k) for k in ('name', 'version', 'description')))
check('权限最小化（无 tabs 之外的多余敏感权限）',
      set(mf.get('permissions', [])) <= {'bookmarks', 'storage', 'history', 'alarms'}, mf.get('permissions'))
refs = set()
refs |= {mf.get('background', {}).get('service_worker')}
for v in (mf.get('icons') or {}).values():
    refs.add(v)
missing = [f for f in refs if f and not os.path.exists(os.path.join(ROOT, 'dist/extension', f))]
check('manifest 引用的文件都存在', not missing, missing)

print('5) 扩展包完整性')
ext = os.path.join(ROOT, 'dist/extension')
need = ['core/model.js', 'core/parse.js', 'core/tags.js', 'core/classify.js', 'core/preflight.js',
        'core/export.js', 'core/diff.js', 'core/i18n.js', 'adapters/chrome-adapter.js',
        'adapters/file-adapter.js', 'ui/index.html', 'ui/app.js', 'ui/styles.css', 'ui/demo-data.js']
miss = [n for n in need if not os.path.exists(os.path.join(ext, n))]
check('core/adapters/ui 文件齐全', not miss, miss)
html = open(os.path.join(ext, 'ui/index.html'), encoding='utf-8').read()
srcs = re.findall(r'<script src="([^"]+)"', html) + re.findall(r'<link rel="stylesheet" href="([^"]+)"', html)
bad = [s for s in srcs if s.startswith('http') or s.startswith('../')]
check('扩展页面无跨目录/远程引用', not bad, bad)
broken = []
for s in srcs:
    rel = s.lstrip('/') if s.startswith('/') else os.path.normpath(os.path.join('ui', s))
    if not os.path.exists(os.path.join(ext, rel)):
        broken.append(s)
check('扩展页面引用的脚本都存在', not broken, broken)

print('6) 单文件网页版')
web = open(os.path.join(ROOT, 'dist/web/index.html'), encoding='utf-8').read()
check('已内联 CSS', '<style>' in web and '<link rel="stylesheet"' not in web)
check('已内联 JS（无外部 script src）', 'src="..' not in web and '<script src=' not in web)
check('包含演示数据', 'BMO_DEMO_HTML' in web)
check('体积合理（< 400KB）', len(web) < 400 * 1024, f'{len(web)/1024:.0f}KB')

print('7) i18n 键位对齐')
i18n = open(os.path.join(ROOT, 'src/core/i18n.js'), encoding='utf-8').read()
dict_end = i18n.index('\n  };')                     # DICT 对象结束，别把后面的代码当键名扫进来
zh_blk = i18n[i18n.index('zh: {'):i18n.index('en: {')]
en_blk = i18n[i18n.index('en: {'):dict_end]
zh = set(re.findall(r"(\w+)\s*:\s*'", zh_blk))
en = set(re.findall(r"(\w+)\s*:\s*'", en_blk))
check('zh / en 键一致', zh == en, f'仅中文有 {sorted(zh-en)}；仅英文有 {sorted(en-zh)}')
ui_html = open(os.path.join(ROOT, 'src/ui/index.html'), encoding='utf-8').read()
used = set(re.findall(r'data-i18n="([^"]+)"', ui_html))
check('页面用到的文案键都在字典里', used <= zh, f'缺失 {sorted(used - zh)}')
js_src = open(os.path.join(ROOT, 'src/ui/app.js'), encoding='utf-8').read()
js_used = {k for k in re.findall(r"\bt\('([a-z_0-9]+)'", js_src) if not k.endswith('_')}
check('JS 里用到的文案键都在字典里', js_used <= zh, f'缺失 {sorted(js_used - zh)}')

print('8) Python 工具可编译')
ok = True
for fn in os.listdir(os.path.join(ROOT, 'tools')):
    if fn.endswith('.py'):
        try:
            compile(open(os.path.join(ROOT, 'tools', fn), encoding='utf-8').read(), fn, 'exec')
        except SyntaxError as e:
            ok = False
            check(f'编译 tools/{fn}', False, e)
check('tools/*.py 语法正确', ok)

print()
if FAILS:
    print(f'❌ {len(FAILS)} 项失败：' + '、'.join(FAILS))
    sys.exit(1)
print('✅ 静态自测全部通过。浏览器功能测试请打开 tests/browser-tests.html。')
