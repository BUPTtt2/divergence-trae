import fs from 'fs'
const c = fs.readFileSync('src/components/YanChat.jsx','utf8')
const r = c.replace('location.pathname === /sandbox','location.pathname === \
/sandbox\')
fs.writeFileSync('src/components/YanChat.jsx',r)
console.log('ok')
const r = c.replace('location.pathname === /sandbox','location.pathname === \
/sandbox\')
const r = c.replace('location.pathname === /sandbox','location.pathname === "/sandbox"')
