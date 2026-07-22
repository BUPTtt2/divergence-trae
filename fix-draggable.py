with open('src/components/fx/DraggableCompass.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

old = """            {noteCount > 0 && (
              <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px dashed rgba(168,71,46,0.2)' }}>
                <div style={{ fontSize: 9, color: '#7A7468', marginBottom: 3 }}>近 记</div>
                {JSON.parse(localStorage.getItem(NOTES_KEY) || '[]').slice(0, 2).map((n, i) => (
                  <div key={i} style={{ fontSize: 10, color: '#3A2E1E', fontFamily: '"Ma Shan Zheng", serif', lineHeight: 1.5, marginBottom: 2 }}>
                    · {n.text}
                  </div>
                ))}
              </div>
            )}"""

new = """            {noteCount > 0 && (() => {
              let recentNotes = [];
              try {
                recentNotes = JSON.parse(localStorage.getItem(NOTES_KEY) || '[]').slice(0, 2);
              } catch { recentNotes = []; }
              return (
                <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px dashed rgba(168,71,46,0.2)' }}>
                  <div style={{ fontSize: 9, color: '#7A7468', marginBottom: 3 }}>近 记</div>
                  {recentNotes.map((n, i) => (
                    <div key={i} style={{ fontSize: 10, color: '#3A2E1E', fontFamily: '"Ma Shan Zheng", serif', lineHeight: 1.5, marginBottom: 2 }}>
                      · {n.text}
                    </div>
                  ))}
                </div>
              );
            })()}"""

if old in content:
    content = content.replace(old, new)
    with open('src/components/fx/DraggableCompass.jsx', 'w', encoding='utf-8') as f:
        f.write(content)
    print('Fixed DraggableCompass JSX JSON.parse')
else:
    print('Pattern not found - may already be fixed')
