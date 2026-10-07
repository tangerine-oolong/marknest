#!/usr/bin/env python3
"""
泄露守卫：扫描仓库和构建产物，防止把真实书签数据、公司内网域名、私人邮箱误提交或公开发布。

用法：
    python3 tools/leak-guard.py            # 扫描全仓库
    python3 tools/leak-guard.py dist/      # 只扫某个目录

退出码 0 = 干净；1 = 发现可疑内容；2 = 参数错误。

名单优先级：
    tools/leak-blocklist.local.txt   （你自己的敏感片段，已被 .gitignore 排除，不会公开）
    tools/leak-blocklist.txt         （仓库里的模板，只有假域名）
一行一个片段，大小写不敏感，# 开头为注释。
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOOLS = os.path.join(ROOT, 'tools')
LOCAL = os.path.join(TOOLS, 'leak-blocklist.local.txt')
TEMPLATE = os.path.join(TOOLS, 'leak-blocklist.txt')

SKIP_DIRS = {'.git', 'node_modules', '__pycache__', '.venv'}
SKIP_SUFFIX = ('.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2', '.zip')
SKIP_NAMES = {'leak-guard.py', 'LICENSE', '.gitignore', '.DS_Store'}
EMAIL_RE = re.compile(r'[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})')
EMAIL_OK = ('example.com', 'example.org', 'example.net', 'noreply.local', 'test.local', 'your-company.com')
MAX_REPORT = 40


def load_patterns():
    src = LOCAL if os.path.exists(LOCAL) else TEMPLATE
    pats = []
    with open(src, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#'):
                pats.append(line.lower())
    return pats, src


def blocklist_names():
    return {os.path.basename(LOCAL), os.path.basename(TEMPLATE)}


def iter_files(scope):
    base = os.path.join(ROOT, scope) if scope else ROOT
    skip = blocklist_names()
    for dirpath, dirnames, filenames in os.walk(base):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in filenames:
            if fn in skip or fn in SKIP_NAMES or fn.startswith('leak-blocklist'):
                continue
            if fn.endswith(SKIP_SUFFIX):
                continue
            yield os.path.join(dirpath, fn)


def main():
    scope = sys.argv[1] if len(sys.argv) > 1 else ''
    pats, src = load_patterns()
    which = '本地名单' if src == LOCAL else '模板名单（未配置本地敏感片段，覆盖面有限）'
    hits = []
    checked = 0
    for path in iter_files(scope):
        checked += 1
        try:
            text = open(path, encoding='utf-8', errors='ignore').read()
        except OSError:
            continue
        low = text.lower()
        rel = os.path.relpath(path, ROOT)
        for p in pats:
            n = low.count(p)
            if n:
                hits.append((rel, p, n))
        for m in EMAIL_RE.finditer(text):
            dom = m.group(1).lower()
            if not any(dom.endswith(ok) for ok in EMAIL_OK):
                hits.append((rel, 'email:' + m.group(0), 1))

    print(f'名单：{which}，{len(pats)} 条 · 扫描 {checked} 个文件')
    if not hits:
        print('✅ 未发现可疑内容')
        if src != LOCAL:
            print('   提示：cp tools/leak-blocklist.txt tools/leak-blocklist.local.txt 后填入你的真实敏感片段，防护才有效')
        return 0
    print(f'❌ 发现 {len(hits)} 处可疑内容（发布前必须清理）：')
    for rel, p, n in hits[:MAX_REPORT]:
        print(f'   {rel}  <-  "{p}" x{n}')
    if len(hits) > MAX_REPORT:
        print(f'   ... 另有 {len(hits) - MAX_REPORT} 处')
    return 1


if __name__ == '__main__':
    sys.exit(main())
