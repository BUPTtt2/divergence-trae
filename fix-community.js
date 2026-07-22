const fs = require('fs');

const content = fs.readFileSync('src/pages/Community.jsx', 'utf8');

let fixed = content;

fixed = fixed.replace(
  "import { useState, useMemo } from 'react';",
  "import { useState, useMemo, useEffect } from 'react';"
);

fixed = fixed.replace(
  "const TABS = [\n  { id: 'discover', label: '发现' },\n  { id: 'shares', label: '命签' },\n  { id: 'discuss', label: '讨论' },\n  { id: 'sages', label: '高人' },\n];",
  "const TABS = [\n  { id: 'discover', label: '发现' },\n  { id: 'shares', label: '命签' },\n  { id: 'discuss', label: '讨论' },\n  { id: 'my_agents', label: '我的智囊' },\n  { id: 'sages', label: '高人' },\n];"
);

fixed = fixed.replace(
  "export default function Community() {\n  const navigate = useNavigate();\n  const [activeTab, setActiveTab] = useState('discover');\n\n  const agents = useMemo(() => Object.values(AGENT_MAP).filter(a => a.role !== 'master'), []);",
  "function formatDate(timestamp) {\n  if (!timestamp) return '';\n  const date = new Date(timestamp);\n  return date.getFullYear() + '.' + String(date.getMonth() + 1).padStart(2, '0') + '.' + String(date.getDate()).padStart(2, '0');\n}\n\nexport default function Community() {\n  const navigate = useNavigate();\n  const [activeTab, setActiveTab] = useState('discover');\n  const [customAgents, setCustomAgents] = useState([]);\n  const [deleteConfirm, setDeleteConfirm] = useState(null);\n\n  const agents = useMemo(() => Object.values(AGENT_MAP).filter(a => a.role !== 'master'), []);\n\n  useEffect(() => {\n    setCustomAgents(getCustomAgents());\n  }, []);\n\n  const handleDeleteAgent = (agentId) => {\n    deleteCustomAgent(agentId);\n    setCustomAgents(getCustomAgents());\n    setDeleteConfirm(null);\n  };"
);

fs.writeFileSync('src/pages/Community.jsx', fixed, 'utf8');
console.log('Fixed successfully');
