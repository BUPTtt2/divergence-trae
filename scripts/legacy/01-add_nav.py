import re

def add_appnav_to_page(filepath, variant='light', add_padding=True):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    original = content
        lines = content.split('\n')
        last_import_idx = 0
        for i, line in enumerate(lines):
            if line.startswith('import '):
                last_import_idx = i
        content = '\n'.join(lines)
    pattern = r'(return \(\s*\n\s*<div[^>]*>)(\n)'
    replacement = r'\1\2      <AppNav variant=\
 + variant + 
\ />\n'
    content = re.sub(pattern, replacement, content, count=1)
    if add_padding:
        lines = content.split('\n')
        appnav_line_idx = -1
        for i, line in enumerate(lines):
            if '<AppNav' in line:
                appnav_line_idx = i
                break
        if appnav_line_idx >= 0:
            for i in range(appnav_line_idx + 1, min(appnav_line_idx + 20, len(lines))):
                line = lines[i]
                if 'className=' in line and ('section' in line or 'div' in line):
                    if 'pt-14' not in line:
                        lines[i] = line.replace('className=\
, 
className=\pt-14 ')
                        break
        content = '\n'.join(lines)
    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f'Modified: {filepath}')
        return True
    else:
        print(f'No changes: {filepath}')
        return False

pages = [
    ('src/pages/Collection.jsx', 'light', True),
    ('src/pages/Calendar.jsx', 'light', True),
    ('src/pages/Daily.jsx', 'light', True),
    ('src/pages/Dictionary.jsx', 'light', True),
    ('src/pages/Scenarios.jsx', 'light', True),
]

for filepath, variant, padding in pages:
    add_appnav_to_page(filepath, variant, padding)

print('\nAll done!')
