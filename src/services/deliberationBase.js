export function buildDeliberationBases({ explicitBase, apiBase }) {
  if (explicitBase) return [explicitBase];
  return [...new Set([apiBase || '', '', 'http://localhost:3001'])];
}
