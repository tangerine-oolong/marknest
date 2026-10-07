#!/usr/bin/env python3
"""用无头 Chrome 生成 README 预览图 docs/assets/preview.png。

截图内容是 samples/demo-bookmarks.html 的合成数据（全部 example.* 假域名），
不含任何真实书签。

用法：python3 tools/screenshot.py
"""
import os
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(ROOT, 'dist', 'web', 'index.html')
OUT = os.path.join(ROOT, 'docs', 'assets', 'preview.png')
CHROME_CANDIDATES = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    shutil.which('google-chrome'), shutil.which('chromium'), shutil.which('chrome'),
]
SIZE = '1440,900'
TIMEOUT = 45


def find_chrome():
    for c in CHROME_CANDIDATES:
        if c and os.path.exists(c):
            return c
    return None


def main():
    chrome = find_chrome()
    if not chrome:
        print('未找到 Chrome / Chromium / Edge，跳过截图生成')
        return 0                                    # 不算失败：CI 上没装浏览器
    if not os.path.exists(WEB):
        print('缺少 dist/web/index.html，请先运行 tools/build.py')
        return 1
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    url = 'file://' + WEB + '?demo=1'
    with tempfile.TemporaryDirectory() as profile:
        cmd = [chrome, '--headless=new', '--disable-gpu', '--hide-scrollbars',
               f'--window-size={SIZE}', '--virtual-time-budget=5000',
               f'--user-data-dir={profile}', f'--screenshot={OUT}', url]
        try:
            subprocess.run(cmd, capture_output=True, timeout=TIMEOUT)
        except subprocess.TimeoutExpired:
            pass                                    # 无头 Chrome 截图后常不自己退出，忽略
        finally:
            subprocess.run(['pkill', '-f', 'headless=new'], capture_output=True)
    if not os.path.exists(OUT) or os.path.getsize(OUT) < 1024:
        print('❌ 截图生成失败')
        return 1
    print(f'✅ {OUT}  {os.path.getsize(OUT)/1024:.0f} KB')
    return 0


if __name__ == '__main__':
    sys.exit(main())
