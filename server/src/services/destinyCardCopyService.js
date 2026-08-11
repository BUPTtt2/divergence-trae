import { callLLM } from './llmRouter.js';

function compact(value, maxLength, fallback) {
  const text = String(value || '').replace(/\s+/g, ' ').replace(/[“”"]/g, '').trim() || fallback;
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).replace(/[，。；、：,.!?！？\s]+$/g, '')}…`;
}

function structuredCopy(input = {}) {
  const decision = compact(input.decision, 24, '定中求进');
  const semanticTitle = /停止|退出|放弃|终止/.test(decision)
    ? '知止有定'
    : /观察|等待|暂缓|保留/.test(decision)
      ? '静候观变'
      : /验证|试验|试行|小步/.test(decision)
        ? '小步验真'
        : /推进|执行|继续/.test(decision)
          ? '循势而行'
          : compact(input.hexagram ? `${input.hexagram}观行` : '', 5, '定中求进');
  return {
    source: 'structured',
    sealTitle: semanticTitle,
    verse: compact(input.hexagram ? `${input.hexagram}之象，行而后明` : '', 28, '见微知著，行而后明'),
    verdict: compact(input.summary || input.decision, 42, '判断已形成，留待行动验证'),
    insight: compact(input.summary || input.decision, 24, '以事实校准判断'),
    nextAction: compact(input.actions?.[0], 24, '从一个可逆动作开始'),
    guardrail: compact(input.reversals?.[0], 24, '出现反证便及时改路'),
  };
}

function parseGeneratedCopy(raw, fallback) {
  const match = String(raw || '').match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    return {
      source: 'generated',
      sealTitle: compact(parsed.sealTitle, 5, fallback.sealTitle),
      verse: compact(parsed.verse, 28, fallback.verse),
      verdict: compact(parsed.verdict, 42, fallback.verdict),
      insight: compact(parsed.insight, 24, fallback.insight),
      nextAction: compact(parsed.nextAction, 24, fallback.nextAction),
      guardrail: compact(parsed.guardrail, 24, fallback.guardrail),
    };
  } catch {
    return null;
  }
}

export async function createDestinyCardCopy(input = {}, options = {}) {
  const fallback = structuredCopy(input);
  const callLLMImpl = options.callLLMImpl || callLLM;
  const prompt = [
    '请把本局真实决策案卷写成一张克制、准确、有周易文学气质的纪念命牌。',
    '只输出 JSON：{"sealTitle":"3至5字、有本局含义的纪念牌名","verse":"不超过28字的两句短句","verdict":"不超过42字的判断","insight":"不超过24字的洞见","nextAction":"不超过24字的下一步","guardrail":"不超过24字的改路条件"}。',
    '不得新增事实，不得算命，不得写吉凶，不得使用空泛鸡汤；行动和戒线必须来自输入。',
    `所问：${compact(input.question, 120, '未提供')}`,
    `所择：${compact(input.decision, 80, '未提供')}`,
    `汇总：${compact(input.summary, 220, '未提供')}`,
    `行动：${(input.actions || []).slice(0, 3).join('；') || '未提供'}`,
    `改路：${(input.reversals || []).slice(0, 3).join('；') || '未提供'}`,
    `卦象：${compact(input.hexagram, 20, '未提供')}`,
  ].join('\n');
  try {
    const raw = await callLLMImpl([
      { role: 'system', content: '你是演策的终局文书官，只压缩真实案卷，不创造事实。' },
      { role: 'user', content: prompt },
    ], { maxTokens: 250, temperature: 0.55, timeout: 20000, stage: 'destiny_copy' });
    return parseGeneratedCopy(raw, fallback) || fallback;
  } catch {
    return fallback;
  }
}

export default createDestinyCardCopy;
