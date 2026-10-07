#!/usr/bin/env python3
"""MV3 CSP 合规检查：扩展包里的 HTML 不得含内联脚本、远程脚本或内联事件属性。
用法：python3 tools/csp-check.py [目录]   默认检查 dist/extension"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INLINE_SCRIPT = re.compile(r'<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>', re.S | re.I)
REMOTE_SCRIPT = re.compile(r'<script[^>]*\bsrc=["\'](https?:|//)', re.I)
INLINE_HANDLER = re.compile(r'<[a-zA-Z][^>]*\son[a-z]+\s*=', re.I)
DYNAMIC_CODE = re.compile(r'\b(eval|new\s+Function)\s*\(')


def check_file(path):
    text = open(path, encoding='utf-8', errors='ignore').read()
    problems = []
    if path.endswith('.html'):
        for m in INLINE_SCRIPT.finditer(text):
            if m.group(1).strip():
                problems.append(f'内联 <script>（MV3 CSP 会直接拒绝加载）: {m.group(1).strip()[:60]}…')
        for m in REMOTE_SCRIPT.finditer(text):
            problems.append('远程脚本（扩展禁止）')
        for m in INLINE_HANDLER.finditer(text):
            problems.append(f'内联事件属性: {m.group(0)[:60]}')
    elif path.endswith('.js'):
        for m in DYNAMIC_CODE.finditer(text):
            problems.append(f'动态代码执行: {m.group(0)[:40]}')
    return problems


def main():
    target = sys.argv[1] if len(sys.argv) > 1 else 'dist/extension'
    base = target if os.path.isabs(target) else os.path.join(ROOT, target)
    if not os.path.isdir(base):
        print(f'❌ 目录不存在: {base}（先运行 tools/build.py）')
        return 2
    bad = 0
    scanned = 0
    for dirpath, _, files in os.walk(base):
        for fn in files:
            if not fn.endswith(('.html', '.js')):
                continue
            scanned += 1
            for p in check_file(os.path.join(dirpath, fn)):
                bad += 1
                print(f'❌ {os.path.relpath(os.path.join(dirpath, fn), ROOT)}: {p}')
    if bad:
        print(f'共 {bad} 处 CSP 违规（扫描 {scanned} 个文件）')
        return 1
    print(f'✅ CSP 合规（扫描 {scanned} 个文件）')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
