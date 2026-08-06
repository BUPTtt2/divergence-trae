with open('src/App.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

if 'Legal' not in content:
    content = content.replace(
        "import Dictionary from './pages/Dictionary';",
        "import Dictionary from './pages/Dictionary';\nimport Legal from './pages/Legal';"
    )
    content = content.replace(
        '<Route path="/dictionary" element={<Dictionary />} />',
        '<Route path="/dictionary" element={<Dictionary />} />\n            <Route path="/legal" element={<Legal />} />'
    )
    with open('src/App.jsx', 'w', encoding='utf-8') as f:
        f.write(content)
    print('Added Legal route')
else:
    print('Legal route already exists')
