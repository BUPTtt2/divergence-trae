const LINE_NAMES = ['初', '二', '三', '四', '五', '上'];

function trigramName(value) {
  return String(value?.name || '').trim();
}

function trigramSymbol(value) {
  return String(value?.symbol || '').trim();
}

function hexagramName(value, fallback = '未成卦') {
  const upper = trigramName(value?.upper);
  const lower = trigramName(value?.lower);
  if (!upper && !lower) return fallback;
  return upper && lower && upper === lower ? upper : `${upper}${lower}`;
}

function hexagramStructure(value) {
  const upper = `${trigramName(value?.upper)}${trigramSymbol(value?.upper)}`;
  const lower = `${trigramName(value?.lower)}${trigramSymbol(value?.lower)}`;
  return `上${upper || '未定'} · 下${lower || '未定'}`;
}

function dynamicIndexes(oracle) {
  if (Array.isArray(oracle?.dynamics)) return oracle.dynamics.filter((position) => Number.isInteger(position) && position >= 0 && position < 6);
  return (Array.isArray(oracle?.lineMeta) ? oracle.lineMeta : [])
    .map((line, index) => line?.isDynamic ? index : -1)
    .filter((position) => position >= 0);
}

function evidenceCounts(lines) {
  return lines.reduce((counts, line) => {
    const state = ['verified', 'unknown', 'contested'].includes(line?.knowledgeState) ? line.knowledgeState : 'unknown';
    counts[state] += 1;
    return counts;
  }, { verified: 0, unknown: 0, contested: 0 });
}

export function createYiJingMirror(oracle = {}) {
  const dynamics = dynamicIndexes(oracle);
  const changedName = hexagramName(oracle.changed, '未成之卦');
  return {
    primaryName: hexagramName(oracle.primary, '本卦'),
    primaryStructure: hexagramStructure(oracle.primary),
    changeText: dynamics.length > 0
      ? `${dynamics.map((position) => LINE_NAMES[position]).join('、')}爻动，之卦为${changedName}。`
      : '此局为静卦，无动爻；先以本卦照见当前结构。',
    changedName,
    mutualName: hexagramName(oracle.mutual, '未成互卦'),
    oppositeName: hexagramName(oracle.opposite, '未成错卦'),
    evidenceCounts: evidenceCounts(Array.isArray(oracle.lineMeta) ? oracle.lineMeta : []),
  };
}

export default createYiJingMirror;
