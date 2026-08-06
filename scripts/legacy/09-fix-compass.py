with open('src/components/fx/DraggableCompass.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

old = """    if (mode === 'shu') {
      return <span style={{ fontFamily: '"Ma Shan Zheng", serif', fontSize: 24, color: '#1A1410' }}>演</span>;
    }"""

new = """    if (mode === 'shu') {
      return <span style={{ fontFamily: '"Ma Shan Zheng", serif', fontSize: 24, color: '#1A1410' }}>书</span>;
    }"""

content = content.replace(old, new)

with open('src/components/fx/DraggableCompass.jsx', 'w', encoding='utf-8') as f:
    f.write(content)

print('Fixed compass shu mode: 演 -> 书')
