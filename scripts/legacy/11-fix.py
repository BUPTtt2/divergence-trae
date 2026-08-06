import re
with open('src/pages/Community.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("import { useState, useMemo } from 'react';", "import { useState, useMemo, useEffect } from 'react';")

content = content.replace(
    "{ id: 'discuss', label: '讨论' },\n  { id: 'sages', label: '高人' },",
    "{ id: 'discuss', label: '讨论' },\n  { id: 'my_agents', label: '我的智囊' },\n  { id: 'sages', label: '高人' },"
)

content = content.replace(
    'export default function Community() {',
    '''function formatDate(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.getFullYear() + '.' + String(date.getMonth() + 1).padStart(2, '0') + '.' + String(date.getDate()).padStart(2, '0');
}

export default function Community() {'''
)

content = content.replace(
    "const [activeTab, setActiveTab] = useState('discover');",
    "const [activeTab, setActiveTab] = useState('discover');\n  const [customAgents, setCustomAgents] = useState([]);\n  const [deleteConfirm, setDeleteConfirm] = useState(null);"
)

content = content.replace(
    'const agents = useMemo(() => Object.values(AGENT_MAP).filter(a => a.role !== "master"), []);',
    '''const agents = useMemo(() => Object.values(AGENT_MAP).filter(a => a.role !== "master"), []);

  useEffect(() => {
    setCustomAgents(getCustomAgents());
  }, []);

  const handleDeleteAgent = (agentId) => {
    deleteCustomAgent(agentId);
    setCustomAgents(getCustomAgents());
    setDeleteConfirm(null);
  };'''
)

with open('src/pages/Community.jsx', 'w', encoding='utf-8') as f:
    f.write(content)

print('Fixed successfully')
