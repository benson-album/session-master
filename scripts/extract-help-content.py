#!/usr/bin/env python3
"""提取 help.html 卡片内容到 help_content.json（正确跟踪嵌套层级）"""
import json, os, re

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.join(SCRIPT_DIR, '..')
HTML_PATH = os.path.join(PROJECT_DIR, 'src', 'help', 'help.html')
JSON_PATH = os.path.join(PROJECT_DIR, 'src', 'help', 'help_content.json')

with open(HTML_PATH) as f:
    html = f.read()

# 用简单的行解析 + div 深度跟踪来提取卡片
# 先找到所有 <div class="card" id="xxx"> 的位置及其对应结束位置
sections = []

i = 0
while True:
    # 找下一个 card div
    card_start = html.find('<div class="card"', i)
    if card_start == -1:
        break
    
    # 提取 id
    id_match = re.search(r'id="([^"]+)"', html[card_start:card_start+200])
    if not id_match:
        i = card_start + 1
        continue
    sec_id = id_match.group(1)
    
    # 跳过 id 属性的位置，找到 > 开始解析
    tag_end = html.find('>', card_start)
    if tag_end == -1:
        break
    
    # 从 tag_end+1 开始，逐字符跟踪 div 嵌套
    depth = 1
    pos = tag_end + 1
    while depth > 0 and pos < len(html):
        # 找下一个 < 或 >
        next_open = html.find('<', pos)
        if next_open == -1:
            break
        
        # 检查是开标签还是闭标签
        if html[next_open:next_open+2] == '</':
            close_end = html.find('>', next_open)
            if close_end == -1:
                break
            tag_name = html[next_open+2:close_end].split()[0]  # 处理 </div class="xxx">
            if tag_name == 'div':
                depth -= 1
                if depth == 0:
                    sections.append({"id": sec_id, "html": html[tag_end+1:next_open].strip()})
                    i = close_end + 1
                    break
            pos = close_end + 1
        elif html[next_open] == '<' and html[next_open+1] != '/' and html[next_open+1] != '!':
            # 可能是开标签
            close_end = html.find('>', next_open)
            if close_end == -1:
                break
            tag_content = html[next_open+1:close_end]
            tag_name = tag_content.split()[0]
            # 只跟踪 div（自闭合的 div 不存在，所以安全）
            if tag_name == 'div':
                depth += 1
            pos = close_end + 1
        else:
            # <!-- comment --> 或 <br> 或 <input ...> 等
            close_end = html.find('>', next_open)
            if close_end == -1:
                break
            pos = close_end + 1
    
    if depth > 0:
        # 没找到闭合，放弃
        i = tag_end + 1
    # else: i already updated above

# 验证
card_ids = [s['id'] for s in sections]
expected_ids = ['intro', 'cookie-sync', 'cloud-sync', 'blocker', 'heartbeat', 'faq', 'tips']
missing = [eid for eid in expected_ids if eid not in card_ids]
if missing:
    print(f"⚠️ 缺少卡片: {missing}")

# 导出时保留标签内的 id 属性（用于侧边栏定位）
content = {
    "version": 1,
    "lastUpdated": "2026-06-26",
    "updateUrl": "https://raw.githubusercontent.com/benson-album/session-master/master/src/help/help_content.json",
    "sectionIds": card_ids,
    "sections": sections
}

with open(JSON_PATH, 'w', encoding='utf-8') as f:
    json.dump(content, f, ensure_ascii=False, indent=2)

print(f"提取 {len(sections)} 个卡片:")
for s in sections:
    print(f"  [{s['id']}] {len(s['html'])} chars")
print(f"\n✅ 已写入: {JSON_PATH} ({os.path.getsize(JSON_PATH)} bytes)")
