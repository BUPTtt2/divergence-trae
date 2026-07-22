with open('src/pages/Community.jsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

result = []
i = 0
while i < len(lines):
    line = lines[i]
    if line.strip().startswith('function formatDate'):
        if 'formatDate' in ''.join(result):
            while i < len(lines) and not line.strip().startswith('export default function Community'):
                i += 1
                if i < len(lines):
                    line = lines[i]
            continue
    elif 'const [customAgents, setCustomAgents]' in line:
        if 'customAgents' in ''.join(result):
            i += 1
            continue
    elif 'const [deleteConfirm, setDeleteConfirm]' in line:
        if 'deleteConfirm' in ''.join(result):
            i += 1
            continue
    elif 'useEffect(() => {' in line:
        if 'useEffect(() => {' in ''.join(result):
            depth = 1
            i += 1
            while i < len(lines) and depth > 0:
                if '{' in lines[i]:
                    depth += 1
                if '}' in lines[i]:
                    depth -= 1
                i += 1
            continue
    elif 'const handleDeleteAgent' in line:
        if 'handleDeleteAgent' in ''.join(result):
            depth = 1
            i += 1
            while i < len(lines) and depth > 0:
                if '{' in lines[i]:
                    depth += 1
                if '}' in lines[i]:
                    depth -= 1
                i += 1
            continue
    result.append(line)
    i += 1

with open('src/pages/Community.jsx', 'w', encoding='utf-8') as f:
    f.writelines(result)

print('Removed duplicates')
