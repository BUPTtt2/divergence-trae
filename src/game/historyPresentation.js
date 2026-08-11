export function uniqueRoles(...roleGroups) {
  const roles = [];
  const seen = new Set();
  roleGroups.flat().forEach((role) => {
    const id = String(role?.id || '').trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    roles.push(role);
  });
  return roles;
}

export function uniqueMessages(values, normalize = (value) => String(value || '').trim()) {
  const messages = [];
  const seen = new Set();
  (Array.isArray(values) ? values : []).forEach((value) => {
    const message = normalize(value);
    const key = String(message || '').replace(/\s+/g, '').trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    messages.push(message);
  });
  return messages;
}
