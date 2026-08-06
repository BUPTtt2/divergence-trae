/**
 * caseFile.js — 第3步结构化案件档案
 * 演提问多轮结束后生成，是后续所有Agent唯一的事实来源，禁止Agent读原始对话
 */

// 4条硬门槛：什么时候算"够清楚了可以开始叫智囊团"
// 文档第10步：析问退出 = 张力被确认 / 轮数上限 / 疲劳触发 / 早退
export const CASE_GATES = {
  BRANCH_CLEAR: 'branch_clear',    // ① 二选一方向/目标明确
  TIME_CLEAR: 'time_clear',        // ② 时间压力/截止日明确
  COST_CLEAR: 'cost_clear',        // ③ 能承受的最坏代价明确
  PEOPLE_CLEAR: 'people_clear',    // ④ 关键人物/影响面明确
  MAX_ROUNDS: 15,                  // 不再挤牙膏，给足15轮但用户可随时跳（防疲劳上限兜底）
  MIN_ROUNDS: 1,                   // 最少1轮（用户不想聊直接跳过就够了，别硬凑）
  MIN_ANSWER_LEN: 8,               // 提取出的字段至少>=8个汉字才算"真提取到"，不是随便两字凑数
};

// 用户价值观优先级候选词（从演回答里抽取用）
const VALUE_CANDIDATES = [
  '安全感', '稳定', '成长', '自由', '财富增长', '人际关系', '家庭', '健康',
  '名誉地位', '学习体验', '风险厌恶', '高风险高回报', '长期主义', '短期收益',
  '独立自主', '团队协作', '家人意见', '个人感受优先',
];

/**
 * 从演多轮问答历史中抽取字段生成Case File
 * 纯函数，零网络依赖（后端宕机也能跑）
 * ⚠️ 严格区分三种信息源：
 *  1) userAnswersOnly — 仅从用户"每轮回答"里提取（时间/代价/人物，必须让用户自己说）
 *  2) question + answers — 从原问题 + 回答联合提取（二选一方向，原问题常含"A还是B"）
 *  3) 最后兜底 — 只用于 caseFile 结构完整性（不算过门，gates仍然=false）
 */
export function generateCaseFile(question, rounds, keywords = [], questionType = '') {
  const cf = {
    question: question || '',
    branchA: '', branchB: '',         // 二选一分支
    timePressure: '',                 // 时间压力
    maxCost: '',                      // 最坏代价/成本
    people: '',                       // 关键人物
    values: [],                       // 价值观优先级排序
    knownFacts: [],                   // 已知事实条目列表 [{text, confirmed: true}]
    missingInfo: [],                  // 仍缺失哪些（用于"已确认信息面板"❌显示）
    gates: {},                        // 4条门槛满足情况 { gateKey: true/false }
    roundCount: rounds?.length || 0,  // 已经问了几轮
    answeredRounds: 0,                // 真正用户回答了（非空>=3字）多少轮 — 用于MIN_ROUNDS校验
    keywords: Array.isArray(keywords) ? keywords : [],
    questionType,
    confirmedByUser: false,           // 用户是否已点了"确认档案正确"
    createdAt: new Date().toISOString(),
  };

  // ============ 答案原文池（严格只有用户自己的回答，不含演的提问）============
  const userAnswerTexts = [];
  for (const r of (rounds || [])) {
    if (r.userAnswer) {
      const t = typeof r.userAnswer === 'string' ? r.userAnswer : JSON.stringify(r.userAnswer);
      const trimmed = t.trim();
      userAnswerTexts.push(trimmed);
      if (trimmed.length >= 3) cf.answeredRounds += 1; // 真回答算一轮，"啊/嗯/哈哈"不算
    }
  }
  const answersOnly = userAnswerTexts.join('\n');

  // ============ 联合池（原问题 + 用户回答）— 仅用于 detectBranch ============
  const questionPlusAnswers = `${question || ''}\n${answersOnly}`;

  // ============ 软兜底：把用户每轮回答拆成独立句子 ============
  const answerSentences = [];
  for (const ans of userAnswerTexts) {
    ans.split(/[。.!?！？\n；;]/).map(s => s.trim()).filter(s => s.length >= 2)
      .forEach(s => answerSentences.push(s.slice(0, 120)));
  }

  // ============ 门槛1：二选一分支（问题+回答联合提取，因为A还是B常在原问题中）============
  const branch = detectBranch(questionPlusAnswers, answerSentences);
  cf.branchA = branch.A;
  cf.branchB = branch.B;
  cf.gates[CASE_GATES.BRANCH_CLEAR] = (
    branch.A.length >= CASE_GATES.MIN_ANSWER_LEN &&
    branch.B.length >= CASE_GATES.MIN_ANSWER_LEN &&
    !branch.isFallbackOnly
  );

  // ============ 门槛2：时间压力（严格只看用户回答，不许拿原问题凑）============
  cf.timePressure = detectTimePressure(answersOnly, answerSentences);
  cf.gates[CASE_GATES.TIME_CLEAR] = cf.timePressure.length >= CASE_GATES.MIN_ANSWER_LEN;

  // ============ 门槛3：代价（严格只看用户回答）============
  cf.maxCost = detectMaxCost(answersOnly, answerSentences);
  cf.gates[CASE_GATES.COST_CLEAR] = cf.maxCost.length >= CASE_GATES.MIN_ANSWER_LEN;

  // ============ 门槛4：关键人物（严格只看用户回答）============
  cf.people = detectKeyPeople(answersOnly, answerSentences);
  cf.gates[CASE_GATES.PEOPLE_CLEAR] = cf.people.length >= CASE_GATES.MIN_ANSWER_LEN;

  // ============ 价值观抽取 ============
  cf.values = extractValues(questionPlusAnswers, answerSentences);

  // ============ 已知事实（每一轮用户回答就是一条已知事实）===========
  for (let i = 0; i < (rounds || []).length; i++) {
    const r = rounds[i];
    if (r.userAnswer && String(r.userAnswer).trim().length >= 3) {
      cf.knownFacts.push({
        id: `fact_${i}`,
        askedBy: r.questionBy || '演',
        question: r.question || '',
        answer: String(r.userAnswer).slice(0, 300),
        confirmed: true,
      });
    }
  }

  // ============ 结构完整性兜底（无提取内容的字段填说明，但不算门槛通过）============
  if (!cf.timePressure) cf.timePressure = '你还没说过时间方面的限制 — 在下方「时间压力」栏补全，或让演继续追问。';
  if (!cf.maxCost) cf.maxCost = '你还没说过能承受的最坏情况 — 在下方「代价上限」栏补全，或让演继续追问。';
  if (!cf.people) cf.people = '你还没说过影响到的人 — 在下方「关键人物」栏补全，或让演继续追问。';
  if (!cf.branchA || !cf.branchB) {
    if (!cf.branchA) cf.branchA = `方向A：主动行动，推进「${(question || '当前问题').slice(0, 16)}」`;
    if (!cf.branchB) cf.branchB = `方向B：再观察，暂不推进「${(question || '当前问题').slice(0, 16)}」`;
  }

  // ============ 仍缺失的门槛 ============
  if (!cf.gates[CASE_GATES.BRANCH_CLEAR]) cf.missingInfo.push('问题方向（二选一目标/具体选项）');
  if (!cf.gates[CASE_GATES.TIME_CLEAR]) cf.missingInfo.push('时间压力/截止日期');
  if (!cf.gates[CASE_GATES.COST_CLEAR]) cf.missingInfo.push('能承受的最坏代价/成本');
  if (!cf.gates[CASE_GATES.PEOPLE_CLEAR]) cf.missingInfo.push('关键人物/影响面');

  return cf;
}

// 检查是否满足了进入下一阶段的门槛：4条全满足 + answeredRounds >= MIN_ROUNDS（真的回答了），OR 轮数到上限
export function canAdvance(caseFile) {
  if (!caseFile) return false;
  if (caseFile.roundCount >= CASE_GATES.MAX_ROUNDS) return true; // 5轮上限，再问烦了
  // 真·最少轮数：用户至少有 MIN_ROUNDS 次非空回答，才算经历过真的追问
  if ((caseFile.answeredRounds || 0) < CASE_GATES.MIN_ROUNDS) return false;
  const all4 = [
    caseFile.gates[CASE_GATES.BRANCH_CLEAR],
    caseFile.gates[CASE_GATES.TIME_CLEAR],
    caseFile.gates[CASE_GATES.COST_CLEAR],
    caseFile.gates[CASE_GATES.PEOPLE_CLEAR],
  ].every(Boolean);
  return all4;
}

// 计算还有多少条门槛没满足（用于"已确认信息面板"进度条）
// ✅ 新增：第5条隐门槛 = answeredRounds >= MIN_ROUNDS
export function gateProgress(caseFile) {
  if (!caseFile) return { done: 0, total: 5, missing: [] };
  const gates = [
    CASE_GATES.BRANCH_CLEAR, CASE_GATES.TIME_CLEAR,
    CASE_GATES.COST_CLEAR, CASE_GATES.PEOPLE_CLEAR,
  ];
  let done = gates.filter(g => caseFile.gates?.[g]).length;
  const roundsOk = (caseFile.answeredRounds || 0) >= CASE_GATES.MIN_ROUNDS;
  if (roundsOk) done += 1;
  const missing = gates.filter(g => !caseFile.gates?.[g]).map(labelForGate);
  if (!roundsOk) missing.unshift(`至少回答 ${CASE_GATES.MIN_ROUNDS} 轮演的策问（当前 ${caseFile.answeredRounds || 0}/${CASE_GATES.MIN_ROUNDS}）`);
  return { done, total: 5, missing };
}

export function labelForGate(gate) {
  switch (gate) {
    case CASE_GATES.BRANCH_CLEAR: return '问题方向（二选一目标）';
    case CASE_GATES.TIME_CLEAR: return '时间压力/截止日期';
    case CASE_GATES.COST_CLEAR: return '能承受的最坏代价';
    case CASE_GATES.PEOPLE_CLEAR: return '关键人物/影响面';
    default: return gate;
  }
}

// 根据当前门槛缺口，生成演下一轮应该问什么（本地兜底版，零LLM依赖）
export function nextQuestionForGap(caseFile, keywords = []) {
  const { missing } = gateProgress(caseFile);
  // 优先缺什么问什么：如果还没回答够2轮 → 先凑轮数，再问字段
  const core = (caseFile?.question || '用户问题').slice(0, 18);
  const kwsStr = keywords.length ? `特别想了解你在「${keywords.slice(0, 2).join('、')}」这方面的考虑。` : '';
  // 过滤掉"至少回答2轮"提示，剩下的都是真实字段缺口
  const fieldGaps = missing.filter(m => !String(m).startsWith('至少回答'));
  if (fieldGaps.length === 0) {
    // 4条都满足了，但还没到最少轮数→再深度追问
    return `关于「${core}」，${kwsStr}你内心最深处，最害怕它变成什么样子？那个你不敢想的最坏场景，具体是什么样的？`;
  }
  // 每次只问最优先缺的那一条，不要一次性抛多个
  const gap = fieldGaps[0];
  if (gap.startsWith('问题方向')) {
    return `先从最核心的开始。${kwsStr}「${core}」——如果把它硬拆成两个方向，你现在纠结的 A 选项和 B 选项，具体各是什么？哪怕是模糊的描述也行，每个选项至少说 8 个字。`;
  }
  if (gap.startsWith('时间压力')) {
    return `再确认一下时间窗口。关于「${core}」，你有没有必须在某个日期前决定的压力？若拖了 1 个月、3 个月、6 个月，代价分别是什么？请说具体一些。`;
  }
  if (gap.startsWith('能承受')) {
    return `然后是最关键的代价。关于「${core}」——如果一切走成了最坏的情况，你能承受的最大损失是什么（金钱/时间/关系/名誉…），损失到哪条线你会坚决止损？`;
  }
  if (gap.startsWith('关键人物')) {
    return `最后说说人。${kwsStr}这件事里，除你之外，还有谁会被影响？谁有一票否决权？谁的意见你一定会参考？哪怕只有一个人也请说清楚。`;
  }
  return `关于「${core}」，${kwsStr}我还有一个地方没听清：${gap}，请描述得更具体一些。`;
}

// ============ 正则抽取器（纯代码，零LLM）—— 抽不出就返回空串，绝不拿最后一句废话凑数 ============
// detectBranch: 二选一方向，唯一允许用原问题的（因为"A还是B"常写在原问题里）
function detectBranch(text, answers = []) {
  const regexes = [
    /(?:是|该|要|选|去|做|买|换|借|投|接|辞|租|卖|学|谈|搬|回)\s*(.+?)\s*(?:还是|或|或者|vs\.?|——|---|-)\s*(.+?)(?:呢|吗|？|\?|，|,|。|$)/i,
    /要不要\s*(.+?)(?:呢|吗|？|\?|，|$)/i,
    /(.+?)\s*or\s*(.+?)/i,
  ];
  // 正则1：X还是Y
  const m1 = text.match(regexes[0]);
  if (m1 && m1[1] && m1[2]) {
    const A = m1[1].trim().slice(0, 40);
    const B = m1[2].trim().slice(0, 40);
    if (A.length >= 2 && B.length >= 2) return { A, B, isFallbackOnly: false };
  }
  // 正则2：要不要X → A=X，B=不X
  const m2 = text.match(regexes[1]);
  if (m2 && m2[1]) {
    const core = m2[1].trim().replace(/[？?呢,，。.！!]$/, '').slice(0, 30);
    if (core.length >= 3) {
      return {
        A: `选择 — 做/要 ${core}`,
        B: `选择 — 不做/不要 ${core}`,
        isFallbackOnly: false,
      };
    }
  }
  // 正则3：英文 or
  const m3 = text.match(regexes[2]);
  if (m3 && m3[1] && m3[2]) {
    const A = m3[1].trim().slice(0, 40);
    const B = m3[2].trim().slice(0, 40);
    if (A.length >= 2 && B.length >= 2) return { A, B, isFallbackOnly: false };
  }
  // 软兜底：用用户的回答分句中第一句作为A（必须含"选/要/做/不做"这类决策语义词才算）
  const branchRe = /选|要|选|去|做|不做|投|辞|买|卖|换|接|拒|留|走|去|回|搬|学|谈|租|借|还是|两个方向|二选一|一个|A|B|甲|乙/;
  const sens = (answers || []).filter(s => s && s.length >= 4);
  const branchSens = sens.filter(s => branchRe.test(s));
  if (branchSens.length >= 2) {
    return { A: branchSens[0].slice(0, 40), B: branchSens[1].slice(0, 40), isFallbackOnly: false };
  }
  if (branchSens.length === 1) {
    return { A: branchSens[0].slice(0, 40), B: '维持现状 / 暂不行动', isFallbackOnly: false };
  }
  // 最后兜底：返回空串占位 — 结构兜底但标记 fallbackOnly=true 不算过门
  return { A: '', B: '', isFallbackOnly: true };
}

// 严格版 detectTimePressure：只在用户回答里真找到了时间词才算（否则返回 ''）
function detectTimePressure(text, answers = []) {
  const months = text.match(/(\d+)\s*(个月|周|天|年|星期|m|months?)/i);
  const dates = text.match(/(?:截止|最后|必须|最晚|赶在|要在|deadline).{0,10}(年底|月初|月末|月中|下周|明天|后天|本周|本月|本季度|今年|明年|开学|毕业|过年|放假|月底|周末|周一|周五|周日)/i);
  const dur = text.match(/(?:期限|周期|时间|窗口|节奏).{0,6}(半?年|1年|季度|3个月|半年|1个月|1周|短期|长期|尽快|立刻|马上|紧急|赶紧|不急|慢慢|可以等)/i);
  if (months) return `${months[1]}${months[2]}内必须做决定`;
  if (dates) return dates[0].slice(0, 60);
  if (dur) return dur[0].slice(0, 60);
  // 软正则：只挑含语义匹配时间的分句，不再用"最近/当下"这种废话凑
  const softTimeRe = /急|赶|立刻|马上|必须|拖|等|慢慢|尽早|尽快|这周|下周|这个月|下个月|年底前|明年|半年内|三年内|3个月|一个月|一周|几天|几年内|年前|月底|月初/;
  const fromAnswers = (answers || []).find(s => softTimeRe.test(s));
  if (fromAnswers) return fromAnswers.slice(0, 60);
  return '';  // 抽不出 → 空，不算过门槛
}

// 严格版 detectMaxCost：不再用最后一句回答乱塞，只认真正代价语义的内容
function detectMaxCost(text, answers = []) {
  const money = text.match(/(\d+(?:\.\d+)?)\s*(万|千|块|元|k|w|百万|亿|万?块?钱)/i);
  const loss = text.match(/(?:最坏|最差|大不了|最多|止损|承受|赔|损失|代价|风险|承担|亏|付出).{0,22}(.{2,60}?)(?:。|$|，|,|\.|\?|？|\s|$)/i);
  if (money) return `金钱上限约 ${money[1]}${money[2]}`;
  if (loss) return loss[1].trim().slice(0, 60);
  // 软正则：必须真含"代价语义关键词"才采纳
  const softCostRe = /怕|担心|后悔|代价|受不了|最多|最不|承受|极限|底线|撑不|最害|嫌|太累|扛不住|赔光|亏|破釜|砸锅|一屁股|负债|抵押|丢工作|分手|离婚|闹翻|绝交|社死|没脸/;
  const fromAnswers = (answers || []).find(s => softCostRe.test(s));
  if (fromAnswers) return fromAnswers.slice(0, 80);
  return '';  // 抽不出 → 空
}

// 严格版 detectKeyPeople：只有真提到人物关系才返回
function detectKeyPeople(text, answers = []) {
  const people = text.match(/(?:家人|父母|爸爸|妈妈|对象|女朋友|男朋友|老公|老婆|伴侣|孩子|同事|老板|领导|朋友|合伙人|老师|客户|房东|室友|配偶|爱人|儿女|儿子|女儿|兄弟|姐妹|亲戚|公婆|岳父|岳母).{0,18}(?:同意|反对|商量|参考|决定|在意|影响|支持|不同意|吐槽|建议|帮|一起|管|说|催)/i);
  const count = text.match(/(?:影响|涉及|关联).{0,6}(\d+)\s*(?:个人|人|家庭|家|部门|团队|公司|宿舍|小组)/i);
  if (people) return people[0].slice(0, 80);
  if (count) return `涉及 ${count[1]} 个${count[2]}`;
  // 软正则：先从回答里找人物词，但必须是独立完整的句子才算
  const softPeopleRe = /家人|父母|爸|妈|对象|男女朋友|老公|老婆|伴侣|孩子|同事|老板|领导|朋友|合伙人|老师|客户|房东|室友|家里人|爱人|儿女|亲戚|公婆|学长|学姐|闺蜜|死党|兄弟|姐妹|男朋友|女朋友/;
  const fromAnswers = (answers || []).filter(s => s && s.length >= 4).find(s => softPeopleRe.test(s));
  if (fromAnswers) return fromAnswers.slice(0, 80);
  return '';  // 抽不出 → 空
}

function extractValues(text, answers = []) {
  const found = [];
  for (const v of VALUE_CANDIDATES) {
    if (text.includes(v) || (answers || []).some(s => s.includes(v))) found.push(v);
  }
  const softRules = [
    { kw: /钱|薪|工资|房|租|买|投|赚|赔|股|基金|理财|价格|预算|成本|价/, v: '财富增长' },
    { kw: /稳定|不折腾|安|保险|不冒险|保底|守住|不亏|踏实/, v: '安全感' },
    { kw: /累|怕|撑不|辛苦|压|休息|睡|身心|健|病/, v: '健康' },
    { kw: /成长|学习|进步|积累|经验|技能|提升|简历|学历|研|留/, v: '成长' },
    { kw: /自由|自己|不想被|不想看|谁说了算|一个人|独立|自|爽/, v: '自由' },
    { kw: /家|父母|孩|家人|爸|妈|婚|对象|伴侣|养|孝/, v: '家庭' },
    { kw: /朋友|同事|人际|人脉|社|关系|人情|合|团队|圈/, v: '人际关系' },
    { kw: /短期|立刻|马上|现在|见效|快|回报|收益/, v: '短期收益' },
    { kw: /长期|三年|五年|十年|一辈子|以后|将来|未/, v: '长期主义' },
    { kw: /名声|面|地位|头|名|title|级别|晋升|岗|职/, v: '名誉地位' },
    { kw: /风险|稳|慎|保守|怕输|不想赌|不要碰|低/, v: '风险厌恶' },
    { kw: /高回报|拼|赌|闯|试|冒险|博一把|all.in|梭/, v: '高风险高回报' },
  ];
  const haystack = `${text}\n${(answers || []).join('\n')}`;
  for (const r of softRules) {
    if (!found.includes(r.v) && r.kw.test(haystack)) found.push(r.v);
  }
  if (found.length === 0) found.push('安全感', '成长');
  return found.slice(0, 5);
}

export default { generateCaseFile, canAdvance, gateProgress, nextQuestionForGap, CASE_GATES, labelForGate };
