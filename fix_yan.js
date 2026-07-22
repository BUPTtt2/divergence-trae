import fs from 'fs';

const content = fs.readFileSync('src/components/YanChat.jsx', 'utf8');
const lines = content.split('\n');

let step = 0;
for (let i = 0; i < lines.length; i++) {
  if (step === 0 && lines[i].includes('export default function YanChat() {')) {
    lines.splice(i + 1, 0, '  const location = useLocation();');
    lines.splice(i + 2, 0, '  const isGamePage = location.pathname === "/sandbox";');
    step = 1;
    i += 2;
  }
  if (step === 1 && lines[i].includes('{!isOpen && (')) {
    lines[i] = lines[i].replace('{!isOpen && (', '{!isOpen && !isGamePage && (');
    step = 2;
  }
}

fs.writeFileSync('src/components/YanChat.jsx', lines.join('\n'));
console.log('Done:', step, 'steps applied');
