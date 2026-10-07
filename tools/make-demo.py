#!/usr/bin/env python3
"""生成合成演示书签 samples/demo-bookmarks.html。
全部使用 RFC2606 保留域名（example.com / example.org / example.net），不含任何真实数据。
覆盖边界：超长标题、emoji、中文与转义字符 URL、5 层嵌套、空文件夹、同名兄弟文件夹、
只含 1 条的碎片文件夹、重复 URL、http 链接、带 data-URI ICON 的链接。"""
import os
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'samples', 'demo-bookmarks.html')
DAY = 86400
NOW = int(time.time())


def ts(days_ago):
    return NOW - days_ago * DAY


def esc(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')


def F(name, days=400, children=None):
    return {'name': name, 'days': days, 'children': children or []}


def L(title, url, days=400):
    return {'title': title, 'url': url, 'days': days}


def many(prefix, host, n, days=500, fmt='/{i}'):
    return [L(f'{prefix} {i+1}', f'https://{host}' + fmt.format(i=i), days) for i in range(n)]


ICON = ' ICON="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="'

TREE = [
    F('Bookmarks bar', 3000, [
        F('Tech', 1500, [
            L('Example Docs · 中文文档首页', 'https://docs.example.com/home', 90),
            L('Example Docs API reference with a very long title that will definitely be truncated in the bookmark bar because it clearly exceeds sixty characters',
              'https://docs.example.com/api', 120),
            L('Example Docs 快速上手指南', 'https://docs.example.com/quickstart', 60),
            L('Example Docs 常见问题 FAQ', 'https://docs.example.com/faq', 200),
            L('Example Docs 最佳实践', 'https://docs.example.com/practice', 240),
            L('Example Blog — 月度归档 🔥', 'https://blog.example.org/archive', 30),
            L('Example Blog: 深度长文合集（含 emoji 🚀✨）', 'https://blog.example.org/deep', 45),
            L('How to do the thing — Example Q&A', 'https://stackoverflow.example.net/q/1', 800),
            L('example/repo: 一个很好的开源项目', 'https://github.example.com/example/repo', 15),
            L('example/other-repo · README', 'https://github.example.com/example/other', 20),
            F('Languages', 900, [
                F('Rust', 800, [
                    F('Traits', 700, [
                        L('Rust traits 入门', 'https://doc.example.org/rust/traits', 700),
                    ]),
                ]),
                F('Go', 650, [L('Go 官方教程', 'https://tour.example.org/go', 650)]),
                F('Empty Folder', 500),                                  # 空分类
                F('Misc', 300, [L('杂项一', 'https://a.example.net/1', 300)]),
                F('Misc', 280, [L('杂项二', 'https://a.example.net/2', 280)]),   # 同名兄弟
            ]),
            F('One link only', 420, [L('唯一一条', 'https://single.example.com/only', 420)]),  # 碎片
            L('HTTP 老站（不可检测）', 'http://legacy.example.com/old-page', 2600),
            L('带中文路径与锚点', 'https://cn.example.com/书签/测试#段', 100),
            L('带查询参数', 'https://q.example.com/s?a=1&b=2', 110),
        ]),
        F('Work', 1200, many('Work dashboard — 内部看板（示例）', 'dash.example.com', 12, 1000, '/report/{i}')
          + many('文档示例', 'docs.example.com', 6, 500, '/team/{i}')
          + [L('重复链接（第一份）', 'https://dup.example.com/same', 150),
             L('重复链接（第二份）', 'https://dup.example.com/same', 140)]),
        F('Frequent', 40, [L(f'常用站点 {i+1}', f'https://hot{i}.example.com/', i * 3) for i in range(8)]),
        F('Ancient', 2400, many('2019 年收藏', 'old.example.org', 10, 2300, '/{i}')),
    ]),
    F('Other bookmarks', 2000,
      [L(f'其他书签散链 {i+1}', f'https://other{i}.example.com/x?y=1&z=2', 900 + i) for i in range(5)]
      + [F('Reading', 700, many('阅读列表', 'read.example.net', 4, 700, '/{i}'))]),
    F('Mobile bookmarks', 1000, [L('手机上的一个书签', 'https://m.example.com/sync', 1000)]),
]


def render(nodes, out, indent):
    pad = '    ' * indent
    out.append(pad + '<DL><p>')
    for n in nodes:
        ad = ts(n['days'])
        if 'children' in n:
            extra = ' PERSONAL_TOOLBAR_FOLDER="true"' if n['name'] == 'Bookmarks bar' else ''
            out.append(f'{pad}    <DT><H3 ADD_DATE="{ad}" LAST_MODIFIED="{ad}"{extra}>{esc(n["name"])}</H3>')
            render(n['children'], out, indent + 1)
        else:
            out.append(f'{pad}    <DT><A HREF="{esc(n["url"])}" ADD_DATE="{ad}"{ICON}>{esc(n["title"])}</A>')
    out.append(pad + '</DL><p>')


def main():
    body = []
    render(TREE, body, 0)
    txt = '\n'.join(['<!DOCTYPE NETSCAPE-Bookmark-file-1>',
                     '<!-- 合成演示数据：全部为 example.* 保留域名，不含任何真实书签 -->',
                     '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
                     '<TITLE>Bookmarks</TITLE>', '<H1>Bookmarks</H1>'] + body + [''])
    open(OUT, 'w', encoding='utf-8').write(txt)
    links = txt.count('<DT><A ')
    folders = txt.count('<DT><H3')
    bal = txt.count('<DL>') == txt.count('</DL>')
    print(f'写入 {OUT}\n  书签 {links} 条 / 文件夹 {folders} 个 / {len(txt)} 字节 / DL 平衡={bal}')
    return 0 if bal else 1


if __name__ == '__main__':
    raise SystemExit(main())
