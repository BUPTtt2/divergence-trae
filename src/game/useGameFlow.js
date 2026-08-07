import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import tracker from '../services/tracker';
import { getAgentsForQuestion, detectQuestionType, QUESTION_TYPES } from '../data/agents';
import { COLORS } from '../components/board/layoutConfig';
import { generateInferenceContent, generateDialoguesForAgents, generateYanSummary, judgeContinueAsking, isLlmAvailable, generatePersonalizedCardContent, appendYanMemory } from '../services/inferenceEngine';
import { detectConvergenceFromBlackboard } from '../services/multiAgentFramework';
import { getCustomAgents, getMarketAgents, recommendSubscribedAgents } from '../utils/customAgent';
import { streamYanChat, addYanMemory, getYanMemories, isBackendCircuitOpen } from '../services/apiClient';
import { recallRelevantMemories, formatMemoriesForPrompt, saveWorkingMemory, saveEpisode, inferFactsFromSession, saveAgentFeedback, detectChoicePattern } from '../services/memoryStore';
import { _buildLocalChoices } from './localEngine';
import { generateCaseFile, canAdvance as caseFileCanAdvance, gateProgress, nextQuestionForGap, CASE_GATES, labelForGate } from './caseFile';
import { assembleAgentContext, readMemoryLayers, writeL1Card, writeL2Bio, buildDoNotRepeat } from './context_assembler';
import { recordCost, checkBudget, maybeDowngrade, routeModelTier, makeCacheKey, getCached, setCached } from './costControl';
import { sanitizeLLMText } from '../utils/helpers';
import cyberRitual from './cyberRitual';
const {
  generateQinianSeed, makeGuaSignId, buildZhuangGuaLog, buildYongShenConfirm,
  recommendAgentsByGua, yanBreakDown, buildSanBian, buildFuTie,
  buildSignPoemAndTranslate, buildFateSign16, buildActionRuneSvg,
  getGuaByIdx, allGuaList,
} = cyberRitual;

/* ============================================================
   B1-B3 生产级系统 Agent 工具：
   1. 本地自然语言澄清降级（后端不可达时，保证 5 轮有效追问，不给 error）
   2. 本地 Agent 发言降级（后端不可达时，每个智囊基于 stance 启发式生成 2-3 句，不卡 UI）
   3. 四核心系统 Agent 分工常量（记忆管家·流程调度·任务分派·总结汇总）
============================================================ */
const SYSTEM_AGENTS = Object.freeze({
  memoryClerk: {
    id: 'sys_memory_clerk',
    name: '记忆管家·藏',
    role: 'system',
    stance: '跨轮次记忆归档',
    desc: '管理 L1 工作记忆 / L2 人设档案 / L3 长期库，提取事实、选择模式、历史推演，在每个阶段起点注入上下文',
    duty: '在每个 phase 切换时读取 recallRelevantMemories / getYanMemories，组装 memoryContext，过滤噪音去重，只输出高密度记忆片段',
  },
  flowDispatcher: {
    id: 'sys_flow_dispatcher',
    name: '流程调度·演',
    role: 'system',
    stance: '端到端推演流水线调度',
    desc: '控 7 个阶段（立卦→召唤→祈问→谐智→梳理→抉择→定论）的门控、超时、兜底跳转，保证阶段不跳不卡',
    duty: 'MAX_CLARIFY_ROUNDS 至少 2 轮，辩论超时 3s 走本地降级，选择阶段失败自动生成 3 个备选兜底',
  },
  taskAssigner: {
    id: 'sys_task_assigner',
    name: '任务分派·镜',
    role: 'system',
    stance: '智能匹配问题→Agent→维度',
    desc: '基于 stance + name + tags + perspective 做三重打分，给问题匹配最合适的 agent，禁止减肥问题推荐职场老兵',
    duty: '每类问题只推与 stance 语义相关的 Agent，关键词匹配分数≥3才能进入候选',
  },
  summaryComposer: {
    id: 'sys_summary_composer',
    name: '总结汇总·策',
    role: 'system',
    stance: '辩论收敛与结论生成',
    desc: '从多轮辩论中抽取分歧点/共识点/行动项，合成 3 段式演总结（分歧/共识/下一步）',
    duty: '检测辩论收敛、跳过剩余发言时立刻生成总结，不再等全部跑完',
  },
});

// ============ 全局生产级常量（hook 外部定义，引用稳定，不会触发无谓 re-render）============
const MAX_CLARIFY_ROUNDS = 15;
// D2: 辩论阶段最大轮次（默认 3 轮，超过就提示收敛；用户也可以跳过或无限追问）
const MAX_DEBATE_ROUNDS = 3;

/**
 * E3: 检测用户是不是「否定回答/答非所问/不想答」
 * 真的对话助手要能识别用户不想回答了，不要再死缠烂打
 */
function _isNegativeAnswer(text) {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return false;
  const negWords = [
    '不知道', '不了解', '不清楚', '没想过', '没考虑过', '不懂', '没懂', '不明白',
    '啥', '哈', '什么', '什么意思', '啥意思', '说啥', '说什么',
    '你问的啥', '你问啥', '什么鬼', '有病', '垃圾',
    '滚', '滚蛋', '闭嘴', '别问了', '停止', '跳过', '不用',
    '算了吧', '就这样吧', '你说呢', '反问',
    '不知道啊', '不晓得', '没头绪', '没想法', '没想好',
  ];
  const hasNeg = negWords.some(w => t.includes(w));
  if (hasNeg) return true;
  // 长度 <=2 的单字/双字一般是敷衍（「？」「哦」「嗯」「哈哈」）
  if (t.length <= 2 && /^(哈+|嗯+|哦+|啊+|？+|\?+|。+|，+)$/.test(t)) return true;
  // 问"这是你该问的吗？""你自己去查啊"这类讽刺反问，也算不想答
  if (/你该|你自己|你不会|关你|管你/.test(t)) return true;
  return false;
}

/**
 * E2: 上下文感知澄清追问（推翻旧版模板池！生产级对话助手）
 * 核心思路：**基于用户上一轮的回答来接话，而不是按 roundIdx 取模板池里的台词！**
 *  - 用户说"第一个" → 就追问"你说的第一个具体指哪个？"
 *  - 用户说"啥/不知道" → 先道歉，再换一个简单问题，或者提示可以跳过
 *  - 用户说了具体信息 → 就顺着那个信息深挖一个更深的点
 *  - 永远 1~2 个问题，不让用户压力大
 *
 * @param {string} question 用户原问题
 * @param {Array<{question:string, userAnswer:string}>} history 历史问答 yanQuestionRounds（最后一项.userAnswer 就是用户上一条回答）
 * @param {number} roundIdx 当前轮次（仅用于避免重复、生成兜底时）
 * @returns {string} 自然语言追问（1~2 句）
 */
function generateContextAwareClarify(question, history, roundIdx = 0) {
  const q = String(question || '').trim();
  const lastRound = Array.isArray(history) && history.length > 0 ? history[history.length - 1] : null;
  const lastAnswer = String(lastRound?.userAnswer || '').trim();
  const lastQuestion = String(lastRound?.question || '').trim();
  const prevRounds = (history || []).filter(r => r.userAnswer && String(r.userAnswer).trim().length > 0);

  // 第一轮（history 为空 / 没有上一轮回答）：基于原问题问 1 个最核心的、最容易回答的
  if (!lastAnswer) {
    const qLow = q.toLowerCase();
    if (/租房|房租|租/.test(qLow)) return `你打算租多长时间？短租（3个月以内）还是长租（半年以上）？目前考虑的预算范围大概多少？`;
    if (/减|肥|胖|健身|体重/.test(qLow)) return `你现在最想解决的是哪一个？体重数字/体态/精神状态/健康指标？`;
    if (/工作|offer|职|辞|跳槽|创业/.test(qLow)) return `这个决定是你自己想了很久的，还是最近一件事（比如跟老板吵架/看到朋友跳槽）突然冒出来的？`;
    if (/爱|分手|恋爱|对象|感情|婚|表白|出轨/.test(qLow)) return `你心里其实是想继续还是想结束？先不管对错，就说你潜意识的第一反应。`;
    if (/钱|买|房|投|股|消费|理财|预算/.test(qLow)) return `如果这件事失败了，最坏结果是什么？这个结果你自己能扛吗？`;
    if (/学|考|研|留学|申请|毕业|考试/.test(qLow)) return `你最终想拿到的那个具体结果是什么？一个分数/一张证书/一封Offer/还是一个人生方向？`;
    if (/旅行|旅游|去|玩|攻略|度假/.test(qLow)) return `这趟出行预算多少？时间几天？几个人去？`;
    if (/猫|狗|宠物|养|养猫|养狗/.test(qLow)) return `你是一时心动看了视频想养，还是想了半年以上、准备好照顾它10年以上了？`;
    return `你现在最纠结的那个具体瞬间是什么？不用描述大背景，就说那一秒钟的心理活动。`;
  }

  // 有上一轮回答：
  // 1. 如果上一轮回答是「否定回答/答非所问」→ 先道歉，再给一个超简单的、或者直接劝跳过
  if (_isNegativeAnswer(lastAnswer)) {
    const qLow = q.toLowerCase();
    if (/租房|租/.test(qLow)) return `抱歉，我刚刚没问到点子上。那你现在租房最头疼的点是什么？——预算不够 / 找不到合适地段 / 跟女朋友意见不统一？`;
    if (/减|肥|健身|体重/.test(qLow)) return `抱歉，我绕远了。那你减肥/健身最大的动力是什么？——拍婚纱照 / 体检指标异常 / 想穿某件衣服 / 纯内卷？`;
    return `抱歉，我刚刚问得不好，你不想回答也完全没关系。\n实在觉得我问不到点子上，可以直接点右上角「跳过 · 召智囊」，让他们先开口。\n或者换个简单的：你现在最头疼的那一件事是什么？`;
  }

  // 2. 如果上一轮回答很短、模糊、指代词（第一个 / 第二个 / 那个 / 这个 / 就那个）→ 就针对那个模糊点追问，不要扯别的！
  const lowLast = lastAnswer.toLowerCase();
  if (/^(第[一二三四五六七八九十1234567890]个)$|第.个|就那个|就是那个|这个|那个|就是|都可以|随便|都行|无所谓/.test(lowLast.trim())) {
    return `你说的「${lastAnswer}」具体指什么？能不能说一下名字/内容/位置，我好跟着你思路走。`;
  }

  // 3. 如果上一轮回答包含具体信息 → 顺着那个信息深挖一个点，不要跳题！
  const qLow = q.toLowerCase();
  const lowFull = `${qLow} ${lowLast}`;

  // 租房场景：用户说 实习/西二旗/2000 这类具体信息 → 顺着挖
  if (/租房|租|房租/.test(lowFull)) {
    if (/实习/.test(lowLast)) return `实习大概要做几个月？租期打算跟实习走，还是想长租下来？`;
    if (/西二旗|后厂村|中关村|望京|国贸|朝阳|海淀/.test(lowLast)) return `${lowLast.match(/西二旗|后厂村|中关村|望京|国贸|朝阳|海淀/)?.[0] || '这个地段'} 通勤能接受的最长时间是多久？1小时以内能接受吗？`;
    if (/\d/.test(lastAnswer) && (/预算|多少|块|千|万|rmb|元|工资|钱/.test(lowLast) || lowLast.length <= 10)) {
      return `这个预算是只算房租，还是把水电网/押金/中介费/通勤这些成本也算进去了？`;
    }
    if (/女朋友|对象|男朋友|老公|老婆|合租|室友/.test(lowLast)) return `你跟 TA 对地段/预算的想法一致吗？有没有 TA 不能妥协的点？`;
    return `租房这件事，你自己不能妥协的那 1 件事是什么？——地段 / 预算 / 房间大小 / 朝南 / 独卫 / 近地铁？`;
  }

  // 健康/减肥场景
  if (/减|肥|胖|健身|体重|饮食|运动|锻炼/.test(lowFull)) {
    if (/\d/.test(lastAnswer) && /kg|斤|公斤|米|cm|身高|体重/.test(lowFull)) return `这个身高体重你维持多久了？最近半年是稳定还是在慢慢涨/掉？`;
    if (/运动|锻炼|跑步|健身/.test(lowLast)) return `你说的这个运动频率，过去你能坚持多久？一周 / 一个月 / 半年以上？`;
    if (/吃|饮食|餐|外卖|奶茶|夜宵|零食/.test(lowLast)) return `这些饮食习惯，是最近 3 个月才这样的，还是你一直都这样生活？`;
    return `过去你试过最有效的一次改变，是怎么做到的？后来为什么又回去了？`;
  }

  // 职业/跳槽场景
  if (/工作|offer|职|辞|跳槽|创业|老板|公司|晋升|项目|合伙/.test(lowFull)) {
    if (/offer|录取|面试/.test(lowLast)) return `这个 Offer 最吸引你的 1 点是什么？最让你犹豫的 1 点又是什么？`;
    if (/辞|辞职|跳槽|走|离开/.test(lowLast)) return `真的走，是因为什么事积累到了临界点？有没有可能那个问题其实能解决？`;
    if (/钱|薪|工资|收入|预算|成本|多少/.test(lowLast)) return `钱是决定性因素吗？如果老东家涨薪 20% 留你，你会留吗？`;
    return `这个决定，你跟谁认真聊过？TA 最后给你的一句话建议是什么？`;
  }

  // 感情场景
  if (/爱|分手|恋爱|对象|男友|女友|感情|喜欢|表白|婚|出轨|异地/.test(lowFull)) {
    if (/分|分手|结束|过不下去|离/.test(lowLast)) return `你说想分，是 TA 真的有不能改的问题，还是你最近太累了、情绪压着了？`;
    if (/在一起|复合|结婚|表白|继续/.test(lowLast)) return `如果继续/结婚/在一起，未来 3 年你最担心的 1 件事是什么？`;
    if (/喜欢|爱|心动|感觉/.test(lowLast)) return `你喜欢 TA 什么？是 TA 这个人，还是 TA 让你感受到的感觉？`;
    return `这段关系里，你付出的和你得到的，天平是平的吗？你心里算一下。`;
  }

  // 金钱/消费/投资场景
  if (/钱|买|房|投|赚|赔|理财|预算|成本|消费|贷款|首付|价|基金|股/.test(lowFull)) {
    if (/买|买不买|要不要买|值不值/.test(lowLast)) return `如果把这笔钱放 3 个月，3 个月后你再回来想，会庆幸冷静了还是后悔没买？`;
    if (/投|投资|理财|基金|股票|赔|亏/.test(lowLast)) return `如果这笔钱全亏了，你 3 个月内的基本生活（房租/吃饭/还贷）会受影响吗？`;
    if (/预算|多少|贵|便宜|价格|块|千|万|元/.test(lastAnswer)) return `这笔钱对你来说是什么档位？——一个月零花 / 三个月工资 / 一年积蓄 / 半副身家？`;
    return `除了「划算/赚钱/好看」这个表层理由，你真正想得到的是什么？怕错过？想证明？还是需要被看见？`;
  }

  // 学习/考试/申请场景
  if (/学|考|研|留学|申|毕业|专业|学校|考试|读书|备考/.test(lowFull)) {
    if (/考|考试|考研|考公|备考|复习/.test(lowLast)) return `你现在每天真实能投入多少小时？——算上刷手机走神的真实时间，不是理想中时间。`;
    if (/留学|申请|学校|offer|专业|大学/.test(lowLast)) return `这个学校/专业，真的是你想去的，还是"别人都去我也去" / "爸妈想让我去"？`;
    return `如果这次失败了，你能接受的最坏结果是什么？有 Plan B 吗？`;
  }

  // 旅行场景
  if (/旅行|旅游|玩|去|出发|攻略|度假|露营|徒步|自驾|西藏|云南/.test(lowFull)) {
    if (/去|目的地|哪里|西藏|云南|北京|成都|上海/.test(lowLast)) return `为什么选这个地方？被种草了 / 有朋友在 / 有情节 / 就是想出去走走？`;
    if (/天|天时间|几天|多少天|一周|一个月/.test(lowLast)) return `这几天时间里，你想休息放空，还是想打卡见世面？这两条路完全是两种攻略。`;
    return `预算 + 同行人 + 时间，这三个变量定了 90% 的答案。你现在最不确定的是哪一个？`;
  }

  // 宠物场景
  if (/猫|狗|宠物|养|养猫|养狗|喵|汪/.test(lowFull)) {
    if (/品种|英短|美短|布偶|金毛|柯基|田园/.test(lowLast)) return `你选这个品种，是看颜值，还是真的了解它的性格/运动量/常见健康问题？`;
    if (/钱|费用|花费|预算|多少|一个月/.test(lowLast)) return `这些钱你准备好了吗？另外想过没有——如果它生病需要一次性花几万治，你治还是不治？`;
    return `你是想让 TA 陪你，还是你准备好照顾 TA 10 年以上了？前者是欲望，后者是责任。`;
  }

  // 所有场景通用兜底：**永远基于上一轮回答接话，不跳题**
  // 最后再出 2 个，第一个是跟上一轮回答有关的深入，第二个是引导用户往核心矛盾走
  const last = lastAnswer.length > 14 ? lastAnswer.slice(0, 14) + '…' : lastAnswer;
  return `你说的「${last}」—— 这个决定如果真的做了，接下来 3 个月你觉得最难的一步是什么？\n或者换个简单的：这个选择里，有没有哪怕 1 件事是你现在 100% 确定的？`;
}

/**
 * B1: 后端不可达时，本地 Agent 发言兜底（基于 stance + 名字启发式生成 2-3 句，UI 不卡）
 * @param {object} agent 智囊对象 { name, stance, tags, id }
 * @param {string} question 用户问题
 * @param {string[]} prevReplies 之前智囊的发言（用于立场对冲）
 * @param {number} roundIdx 第几轮辩论
 */
function extractUserCore(question) {
  const q = String(question || '').trim();
  // 抛掉内部系统前缀，只留用户真正说的话
  const cleaned = q
    .replace(/【用户补充说明】/g, ' ')
    .replace(/【你补充】/g, ' ')
    .replace(/^@[^\s]+\s*/, '') // 去掉 @智囊名
    .replace(/^追问补充\S*[：:]\s*/, '') // 去掉"追问补充X·视角："前缀
    .trim();
  const noQuote = cleaned.replace(/^[「『"']/, '').replace(/[」』"']$/, '');
  return noQuote.slice(0, 24) || '这件事';
}

/**
 * B1: 本地 Agent 发言兜底（后端不可达时用，基于真实用户输入生成自然对话，UI 不卡）
 * 根本性修复：之前返回「【name·stance】前缀 + 硬编码模板（如"先说我要泼的冷水"）」，
 * 这些内部标记和模板会原样泄露进推演记录，看起来全是预设话术、且与用户输入脱节。
 * 现在：去掉所有内部标记，引用用户真实说的话，以该智囊视角自然回应，像真人在继续对话。
 */
function localGenerateAgentReply(agent, question, prevReplies = [], roundIdx = 0) {
  const name = agent?.name || '智囊';
  const stance = String(agent?.stance || '').trim() || '旁观者视角';
  const stanceShort = stance.replace(/视角$/, '').trim();
  const core = extractUserCore(question);

  const stanceTokens = `${stance} ${name} ${(agent?.tags || []).join(' ')}`.toLowerCase();
  const type = {
    risk: /风险|安全|险|合规|规则|合同|边界|泼|冷/.test(stanceTokens),
    money: /财|钱|投资|财务|金|概率|赔率|成本|预算|算账/.test(stanceTokens),
    love: /情|感|家|关系|爱|婚|恋|暖/.test(stanceTokens),
    health: /健康|养|身|体|养生|生理|睡眠|疲劳|医/.test(stanceTokens),
    career: /职场|工作|事业|管理|职业|晋升|HR/.test(stanceTokens),
    study: /教育|学者|学习|知识|智慧|成长|师/.test(stanceTokens),
    field: /实地|体验|远足|一线|旅行|走/.test(stanceTokens),
    law: /讼|法律|规则|律师|合同|法度/.test(stanceTokens),
    reflect: /反思|人生|意义|盲点|哲|长期|远见|镜/.test(stanceTokens),
    act: /行动|动手|执行|震/.test(stanceTokens),
  };

  const openers = {
    risk: `关于「${core}」，我先把最难听的话放前面：如果最坏的那种可能真的发生，你扛得住吗？先别急着讲收益，把承受下限想清楚，再谈要不要。`,
    money: `「${core}」这笔账别只看表面。真正要算的是机会成本和沉没成本——万一选错了，你折进去的时间、钱、精力，还能换回来吗？`,
    love: `我不跟你讲道理。只问一句：夜深人静、没人看着你的时候，「${core}」这件事，你心里是踏实更多，还是不安更多？那个更真实的感受，往往就是答案。`,
    health: `先说身体。「${core}」如果最终换来的是你睡不好、压力大到掉头发，那不管别的理由多漂亮，都先打一个问号。命，比什么都重。`,
    career: `「${core}」这种决定，别问同龄人。去问那个比你大十岁、现在活得最舒服的前辈——他一句话，顶你看一百篇经验贴。`,
    study: `学习这件事，纠结大多来自「想太多、做太少」。今天先把第一页翻开，焦虑立刻少一半。别问来不来得及，你现在就是余生里最早的那个时刻。`,
    field: `别在地图上纠结。「${core}」值不值，先亲自去摸一下真的东西，答案会在你碰到的第一分钟浮出来。`,
    law: `先把边界划清楚：「${core}」里，口头承诺都不算、没签字的不作数、要你签「自愿放弃」的一律 NO。白纸黑字说话，边界守住了再谈选择。`,
    reflect: `站在你八十岁往回看，「${core}」还重要吗？别骗自己选那个「看起来对」的，选那个「说谎也会心虚」的反方向。`,
    act: `别分析了。「${core}」这件事，今晚能落地的第一步是什么？先把第一步做了，七成把握就出手，剩下的在路上补。`,
  };
  const fallback = `关于「${core}」，我没有标准答案，但想帮你把问题拆清楚：你真正怕的，是这件事本身，还是选了之后没了退路？把最坏的结果写下来，再回头看，答案会清晰很多。`;
  const baseText = openers[Object.keys(type).find(k => type[k])] || fallback;

  // 自然接上一句真实发言（去内部标记），让对话有来有回
  const lastPrev = (prevReplies.filter(r => r && typeof r === 'string' && r.length > 10).pop() || '')
    .replace(/【[^】]+】/g, '')
    .replace(/\n/g, ' ')
    .slice(0, 24);
  const dialoguePrefix = lastPrev
    ? `你刚才提到「${lastPrev}」，我从${stanceShort}的角度再补一点：`
    : '';

  return `${dialoguePrefix}${baseText}`;
}

const _generate5WQuestions = (question, typeLabel, kwList, cyberGua) => {
  const core = question.slice(0, 26);
  const qType = typeLabel || '人生抉择';
  const qLow = (question || '').toLowerCase();
  const kws = (kwList || []).filter(Boolean).slice(0, 5).join('、') || core;
  const headerLines = [];
  if (cyberGua?.gua) {
    const g = cyberGua.gua;
    const gz = cyberGua.ganzhi?.short || '';
    const rel = cyberGua.wuxingRels?.[0]?.label || '';
    headerLines.push(`【起卦】${g.symbol}  ${g.name} · ${g.palace}宫 · 属${g.wuxing}`);
    if (gz) headerLines.push(`【干支】${gz}`);
    headerLines.push(`【卦意】${(g.verse || '').split('\n')[0] || ''}`);
    if (g.movingLine) headerLines.push(`【动爻】第${g.movingLine}爻 · ${(g.movingLineMeaning || '').split('：')[0] || ''}`);
    if (rel) headerLines.push(`【气运】${rel}`);
    headerLines.push(``);
    headerLines.push(`—— 以上为你此刻心念所映之卦象。带着这面赛博卦镜，我们来剥几层，看看底下真正的问题是什么。 ——`);
    headerLines.push(``);
  }

  // ========= 何事：期望走向 vs 现状落差（变体） =========
  let whatQ;
  if (qLow.includes('减') || qLow.includes('肥') || qLow.includes('健身') || qLow.includes('体重') || qLow.includes('健康') || qLow.includes('吃') || qLow.includes('饭') || qType.includes('健康')) {
    whatQ = `【何事】你理想中的身体/生活状态是怎样的？现在最让你不舒服、最想改变的那一个点是什么？`;
  } else if (qType.includes('感情') || qType.includes('恋爱') || qType.includes('婚') || qLow.includes('分手') || qLow.includes('喜欢') || qLow.includes('对象')) {
    whatQ = `【何事】你心里最想要的那种关系状态是什么样的？与现状的核心落差——是安全感、被理解，还是未来方向不一致？`;
  } else if (qType.includes('职') || qType.includes('事业') || qType.includes('创业') || qType.includes('发展') || qLow.includes('offer') || qLow.includes('工作') || qLow.includes('辞职') || qLow.includes('跳槽')) {
    whatQ = `【何事】你对这份工作/事业最理想的期待是什么？最让你现在犹豫的那根刺到底是什么？`;
  } else if (qType.includes('财') || qLow.includes('钱') || qLow.includes('买') || qLow.includes('投资') || qLow.includes('房') || qLow.includes('租')) {
    whatQ = `【何事】你最理想的财务结果是什么（赚到多少、不亏多少、还是什么）？现在的状况离那一步差什么？`;
  } else if (qLow.includes('考试') || qLow.includes('研') || qLow.includes('学') || qLow.includes('书') || qType.includes('学习')) {
    whatQ = `【何事】你理想的学习/结果状态是怎样的？最让你焦虑的那个环节——是开始、是坚持，还是最后那一下验收？`;
  } else {
    whatQ = `【何事】你所期望的理想走向是怎样的？与当下状态的核心落差，是何种感受？`;
  }

  const baseLines = [
    `关于「${core}」，在分岔展开之前，我需要先向你确证几件事——它们将决定你看到的方向。`,
    ``,
    whatQ,
  ];

  // ========= 何时：时间压力 =========
  if (qType.includes('职') || qType.includes('事业') || qType.includes('创业') || qType.includes('发展')) {
    baseLines.push(`【何时】若将时间轴拉长至半年后、一年后、三年后三个节点，此刻的决定在每个节点分别意味着什么？你在意短期得失还是长期布局？`);
  } else if (qType.includes('财') || qType.includes('房') || qType.includes('租房') || qType.includes('买') || qLow.includes('投资')) {
    baseLines.push(`【何时】这笔决策的关键截止日是何时？若迟三个月、六个月再决定，代价或收益会如何变化？`);
  } else if (qLow.includes('减') || qLow.includes('肥') || qLow.includes('健身') || qLow.includes('健康') || qLow.includes('吃') || qType.includes('健康')) {
    baseLines.push(`【何时】你给自己的执行窗口是几天？若今晚就要做「吃 / 不吃」的选择，你是看短期口腹，还是看一周后的体重？`);
  } else if (qLow.includes('考试') || qLow.includes('研') || qLow.includes('申') || qLow.includes('学') || qLow.includes('毕业')) {
    baseLines.push(`【何时】关键日期（deadline / 考试 / DDL）是哪天？如果今晚只有 1 小时可用，你会投入在哪一步？`);
  } else if (qType.includes('感情') || qType.includes('恋爱') || qType.includes('婚') || qLow.includes('分') || qLow.includes('表白')) {
    baseLines.push(`【何时】你给自己的这段关系的最后期限或观察窗口是多久？若今晚必须给一个答复，你会选冲动还是克制？`);
  } else if (qLow.includes('旅') || qLow.includes('玩') || qLow.includes('去') || qLow.includes('旅行')) {
    baseLines.push(`【何时】出发日期定在什么时候？如果时间+预算只能二选一，你会保哪个、放哪个？`);
  } else {
    baseLines.push(`【何时】你给自己的考虑窗口有多长？若此刻必须二选一，你会基于当下还是未来做决定？`);
  }

  // ========= 何人 / 何价：第 3 问 =========
  if (qType.includes('财') || qType.includes('房') || qType.includes('租') || qType.includes('投资') || qLow.includes('钱') || qLow.includes('买')) {
    baseLines.push(`【何价】这笔支出/风险，是否在你三到六个月的可承受波动范围之内？若最坏情况发生，你能承担的最大代价是什么？`);
  } else if (qType.includes('感情') || qType.includes('恋爱') || qType.includes('婚') || qType.includes('人际') || qLow.includes('对象') || qLow.includes('分手') || qLow.includes('父母')) {
    baseLines.push(`【何人】牵涉其中的关键人物（除你之外），他们各自的真实诉求与底线是什么？有没有你一直回避面对的那个人？`);
  } else if (qLow.includes('减') || qLow.includes('肥') || qLow.includes('健身') || qLow.includes('吃') || qLow.includes('饭') || qType.includes('健康')) {
    baseLines.push(`【何价】你愿意为这个目标付出的真实代价有多大——比如：一周不去聚餐？每天 30 分钟运动？还是只是"想想而已"？`);
  } else if (qLow.includes('学') || qLow.includes('考试') || qLow.includes('研') || qType.includes('学习')) {
    baseLines.push(`【何价】你愿意为这个目标每天投入的真实时间是多少？最想偷懒的那一天，你打算怎么拉自己回来？`);
  } else if (qType.includes('职') || qType.includes('事业') || qLow.includes('offer') || qLow.includes('工作') || qLow.includes('跳槽') || qLow.includes('辞')) {
    baseLines.push(`【何人】这条职业路径上，谁是真正能帮你/阻碍你的关键人？谁的意见你该听、谁的你可以直接忽略？`);
  } else {
    baseLines.push(`【何人】此事会影响到哪些人？谁是你必须争取共识、谁又是你不必过度在意的那一个？`);
  }

  // ========= 为何：核心动机 =========
  let whyQ;
  if (qLow.includes('减') || qLow.includes('肥') || qLow.includes('健康') || qLow.includes('吃')) {
    whyQ = `【为何】在所有动机里——好看 / 健康 / 被喜欢 / 自信，哪一个才是你真正最放不下的那一个？是怕被说，还是真心向往？`;
  } else if (qLow.includes('钱') || qLow.includes('投资') || qLow.includes('房') || qLow.includes('买') || qType.includes('财')) {
    whyQ = `【为何】在"赚更多"和"别亏"之间，你到底是哪一种驱动？赚了是为了满足谁？亏了又怕失去什么？`;
  } else if (qType.includes('感情') || qLow.includes('对象') || qLow.includes('婚') || qLow.includes('分')) {
    whyQ = `【为何】你最放不下的到底是这个人本身、这段关系的"沉没成本"，还是怕分手后的空窗？是恐惧还是向往在拉着你走？`;
  } else if (qType.includes('职') || qLow.includes('工作') || qLow.includes('offer') || qLow.includes('辞') || qLow.includes('跳槽')) {
    whyQ = `【为何】你真正在意的是：钱、成长、同事氛围、还是社会评价？如果只能留一个，你会砍哪三个？`;
  } else {
    whyQ = `【为何】在这所有变量里，哪一个是你内心最放不下、最核心的那个念头？——是恐惧还是向往在驱动你？`;
  }
  baseLines.push(whyQ);

  // ========= 第 5 问：关键词 或 额外变体 =========
  if (kws && kws !== core && !(qLow.includes(kws.slice(0, 1)))) {
    baseLines.push(`【关键】我从你问法中捕捉到了「${kws}」这几个关键词，这些与你真正在意的东西是否一致？`);
  } else if (qLow.includes('纠结') || qLow.includes('选') || qLow.includes('还是') || qLow.includes('不') || qLow.includes('犹豫')) {
    baseLines.push(`【关键】如果此刻必须"盲选"，你直觉会站哪边？——那个瞬间冒出来的答案，往往就是你真正想选的。它和你现在嘴上说的，是同一个方向吗？`);
  } else {
    baseLines.push(`【关键】如果有一个"来自一年后自己的忠告"，你觉得它会对你说什么？把那一句话写出来就好。`);
  }

  baseLines.push(``);
  baseLines.push(`请先回答任意1-2个最戳中你的问题即可；答不出就先跳过，不要硬写。等信息够了再点召唤智囊团。`);
  return [...headerLines, ...baseLines].join('\n');
};

const _detectKeywordsLocal = (question) => {
  const text = (question || '').toLowerCase();
  const dict = [
    ['工作', /offer|薪|工作|公司|老板|同事|晋升|离职|跳槽|职业|岗位|部门/],
    ['事业', /创业|项目|合伙|业务|品牌|融资|启动|扩张/],
    ['感情', /爱|分手|恋爱|对象|男友|女友|伴侣|感情|喜欢|追|表白|婚姻|出轨|异地/],
    ['租房', /租|房|搬家|公寓|房租|押金|中介|房东/],
    ['买房', /买|房|首付|贷款|房价|楼盘|月供/],
    ['财务', /钱|投|赚|赔|股|基金|理财|风险|亏|成本|预算|借|债/],
    ['人际关系', /朋友|家人|父母|同学|合作|沟通|争吵|矛盾|人际/],
    ['学业', /学|考|研|留学|申请|专业|学校|成绩|毕业/],
    ['健康', /病|体检|睡眠|身体|疲劳|情绪|心理|焦虑/],
    ['选择困难', /不|要不要|该不|还是|或者|二选|选什么|怎么选/],
  ];
  return dict.filter(([, re]) => re.test(text)).map(([k]) => k);
};

// 镜渊反省审查官：纯代码规则抽取 分歧/共识/盲点
const _computeMirrorReview = (agents, agentDialogues, caseFile, convergence, question) => {
  const divergences = [];
  const consensus = [];
  const blindspots = [];
  const core = (question || '此事').slice(0, 14);

  const lastWords = {};
  const stances = {};
  for (const a of (agents || [])) {
    if (!a || a.role === 'master') continue;
    const hist = agentDialogues?.history?.[a.id] || [];
    let last = '';
    for (let i = hist.length - 1; i >= 0; i--) {
      const h = hist[i];
      const t = typeof h === 'object' ? h?.text : h;
      if (t && !t.startsWith('【你】')) { last = t.toString().slice(0, 80); break; }
    }
    const dial = agentDialogues?.[a.id];
    if (!last && typeof dial === 'string' && dial.length > 3) last = dial.slice(0, 80);
    if (last) lastWords[a.id] = last;
    stances[a.id] = (a.stance || a.name || '').replace(/视角/g, '').trim();
  }
  const ids = Object.keys(lastWords);

  const commonWords = ['止损', '风险', '机会', '长期', '短期', '代价', '成本', '验证', '行动', '时间', '稳定', '家人', '钱', '收益', '后悔', '退路', '成长', '自由', '安全', '沟通'];
  const kws = _detectKeywordsLocal(question || '');
  const pool = [...kws, ...commonWords];
  for (const w of pool) {
    let count = 0;
    for (const id of ids) if (lastWords[id].includes(w)) count++;
    if (count >= Math.min(2, ids.length)) {
      consensus.push(`各方一致关注「${w}」——说明这是真正不容回避的变量。`);
    }
  }
  if (convergence?.converged && consensus.length === 0) {
    consensus.push(`第${convergence.round || 1}轮后已收敛：智囊在「${core}」的大方向上没有本质冲突。`);
  }
  if (consensus.length === 0) {
    consensus.push(`虽然视角不同，但诸位都默认你有权做出选择——这本身就是最大的共识。`);
  }

  const stanceList = ids.map(id => ({ id, stance: stances[id], text: lastWords[id] }));
  if (!convergence?.converged || (convergence.consensusScore ?? 1) < 0.7) {
    const proWords = ['机会', '行动', '尝试', '冒险', '进攻', '扩张', '推进', '抓住', '入局'];
    const conWords = ['风险', '止损', '等待', '谨慎', '稳定', '观望', '退出', '保守', '避免', '退路'];
    for (const s of stanceList) {
      const hasPro = proWords.some(w => s.text.includes(w));
      const hasCon = conWords.some(w => s.text.includes(w));
      s._leaning = hasPro && !hasCon ? 'pro' : hasCon && !hasPro ? 'con' : 'neutral';
    }
    const pros = stanceList.filter(s => s._leaning === 'pro').map(s => s.stance || '某智囊');
    const cons = stanceList.filter(s => s._leaning === 'con').map(s => s.stance || '某智囊');
    if (pros.length > 0 && cons.length > 0) {
      divergences.push(`主张「推进」：${pros.join('、')}  vs  主张「保守」：${cons.join('、')}。核心分歧：要不要现在就动。`);
    }
    if (pros.length === 0 && cons.length === 0) {
      divergences.push(`收敛度仅${((convergence?.consensusScore ?? 0.6) * 100).toFixed(0)}%：智囊各说各的维度，表面无冲突实则无统一框架。`);
    }
  }
  if (ids.length >= 3) {
    let hasTime = false, hasCost = false;
    for (const s of stanceList) {
      if (/时间|截止|周期|期限|月|周|天/.test(s.text)) hasTime = true;
      if (/代价|成本|钱|损失|风险|止损|承受/.test(s.text)) hasCost = true;
    }
    const gateMismatch = caseFile?.gates && caseFile.gates.time_clear !== caseFile.gates.cost_clear;
    if ((hasTime && hasCost) || gateMismatch) {
      divergences.push(`有人强调「时间窗口」，也有人谈「代价上限」——两者不可兼得时，你愿意先牺牲哪一个？`);
    }
  }
  if (divergences.length === 0) {
    divergences.push(`没有显性分歧。但没有分歧 = 没有新信息，请主动制造一枚「反方硬币」。`);
  }

  if (caseFile?.missingInfo?.length > 0) {
    for (const m of caseFile.missingInfo.slice(0, 2)) {
      blindspots.push(`智囊团的讨论没有覆盖「${m}」——没谈不代表不重要，只是集体盲区。`);
    }
  }
  const blindWords = ['退出机制', '最坏情况', '关键人意见', '验证步骤', '后悔成本', '长期副作用'];
  const talked = ids.flatMap(id => lastWords[id]);
  for (const bw of blindWords) {
    if (!talked.some(t => t.includes(bw.slice(0, 2)))) {
      blindspots.push(`没有人提「${bw}」。不要默认它不存在——只是今天没被问到。`);
      if (blindspots.length >= 3) break;
    }
  }
  if (blindspots.length === 0) {
    blindspots.push(`盲点永远有一个：此刻没被你说出口的那个情绪。它是什么？`);
  }

  return {
    divergences: Array.from(new Set(divergences)).slice(0, 3),
    consensus: Array.from(new Set(consensus)).slice(0, 3),
    blindspots: Array.from(new Set(blindspots)).slice(0, 3),
  };
};

// 解析 LLM 润色后的镜渊反省文本，兜底用rawReview
function parseMirrorLLM(text, rawReview) {
  const sections = { 分歧: 'divergences', 共识: 'consensus', 盲点: 'blindspots' };
  const out = { divergences: [], consensus: [], blindspots: [] };
  try {
    const lines = String(text || '').split(/\r?\n/);
    let curKey = null;
    for (const line0 of lines) {
      const line = line0.trim();
      if (!line) continue;
      let matched = null;
      for (const [cn, en] of Object.entries(sections)) {
        if (line.includes(`【${cn}】`) || new RegExp(`^\\s*${cn}\\s*[：:]`).test(line)) {
          curKey = en;
          matched = cn;
          break;
        }
      }
      if (matched) continue;
      if (!curKey) continue;
      const clean = line.replace(/^\s*\d+\s*[\.、\)）]\s*/, '').replace(/^[-•·]\s*/, '').trim();
      if (clean.length >= 3) out[curKey].push(clean);
    }
  } catch {}
  for (const k of Object.keys(sections)) {
    const en = sections[k];
    if (!Array.isArray(out[en]) || out[en].length === 0) out[en] = rawReview[en] || [];
  }
  return out;
}

// 把镜渊反省审查官的输出拼成一段自然文字（注入演对话里显示）
// 不再使用 【】Markdown 标记；以自然段落+序号分隔，避免"像代码/模板"的观感。
function buildJingyuanIntroText(review) {
  if (!review) return '';
  const head = '镜渊 · 反省审查官 列席：\n此局听完诸位发言，我有三处话要说——\n\n';
  const part = (title, arr) => {
    const list = Array.isArray(arr) ? arr.filter(Boolean) : [];
    if (list.length === 0) return '';
    const items = list.map((s, i) => `  ${i + 1}. ${String(s).replace(/^[\s\-•·]+/, '')}`).join('\n');
    return `${title}：\n${items}\n\n`;
  };
  const body =
    part('关于分歧', review.divergences) +
    part('已达成的共识', review.consensus) +
    part('未被提及的盲点', review.blindspots);
  return `${head}${body}——以上，供你抉择前最后一瞥。`;
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 系统Agent·任务分派·镜：三重匹配算法（Context Engineering 落地）
 * 根据问题关键词+语义，从候选Agent中按【话题大类 → stance语义 → name+tags】三层过滤，
 * 避免"减肥问题推荐职场老兵/讼师"这类跨域错配。
 * @param {string} question 用户原始问题
 * @param {Array<{id,name,stance,desc,tags?}>} candidateAgents 候选Agent池
 * @param {number} topK 返回前N个，默认4
 * @returns {string[]} 匹配的AgentID数组（按得分降序）
 */
function taskAssignerMatchAgents(question, candidateAgents, topK = 4) {
  if (!Array.isArray(candidateAgents) || candidateAgents.length === 0) return [];
  const q = (question || '').toString();
  const qLow = q.toLowerCase();

  // ── 第一层：话题大类识别（7+4 类，对应 localGenerateNaturalClarify 分类） ──
  const TOPIC_RULES = [
    { key: 'health', score: 40, qTest: t => /减|肥|胖|健身|体重|身材|健康|养生|饮食|运动|跑步|瑜伽|食物|热量|碳水|蛋白|睡眠|作息|生病|医院|体检/.test(t),
      allowStanceKw: ['健康','养生','身体','饮食','运动','健身','减肥','中医','膳食','营养','睡眠','生理','食品'],
      denyStanceKw: ['法律','职场','诉讼','合同','offer','加薪','跳槽','公司','投资','股票','金融','创业','商业'] },
    { key: 'career', score: 40, qTest: t => /工作|offer|职|薪|辞|跳槽|公司|领导|同事|绩效|面试|简历|职场|上班|加班|晋升|创业|副业|行业|赛道/.test(t),
      allowStanceKw: ['职场','职业','工作','offer','管理','领导','公司','人力','创业','商业','投资','金融','老板','同事','HR','绩效'],
      denyStanceKw: ['健康','养生','中医','减肥','健身','法律','诉讼','律师','感情','恋爱','婆媳','亲子','学习','考试'] },
    { key: 'love', score: 40, qTest: t => /喜欢|爱|分手|结婚|单身|恋爱|对象|相亲|前任|现任|异地|暧昧|出轨|男生|女生|女朋友|男朋友|伴侣|亲密|恋/.test(t),
      allowStanceKw: ['感情','恋爱','亲密','伴侣','婚姻','心理','共情','性别','女性','男性','关系','人际','PUA'],
      denyStanceKw: ['法律','职场','诉讼','投资','金融','健身','中医','减肥','商业'] },
    { key: 'relation', score: 35, qTest: t => /父母|妈|爸|婆|媳|公公|婆婆|孩子|小孩|儿子|女儿|家庭|亲子|教育|老师|学校|朋友|闺蜜|兄弟|亲戚|人际/.test(t),
      allowStanceKw: ['父母','亲子','婆媳','家庭','教育','孩子','家长','老师','人际','朋友','关系','心理','共情'],
      denyStanceKw: ['法律','诉讼','投资','金融','商业','职场','创业'] },
    { key: 'edu', score: 35, qTest: t => /考研|考公|高考|学习|考试|学校|留学|专业|选校|毕业|论文|导师|研究生|大学生|培训|升学|就业|读书|英语|数学/.test(t),
      allowStanceKw: ['学习','教育','学生','考试','升学','留学','专业','考研','导师','读书','认知','思维','规划','心理'],
      denyStanceKw: ['法律','诉讼','健身','中医','减肥','金融','股票','投资','商业'] },
    { key: 'finance', score: 40, qTest: t => /钱|买|卖|房|股|基金|投资|理财|消费|省钱|赚|工资|收入|存款|贷款|保险|还债|资产|亏损|分红|副业|现金流/.test(t),
      allowStanceKw: ['投资','理财','金融','消费','房产','经济','商业','成本','风险','保险','负债','赚钱','省钱','资产','市场','股票','基金'],
      denyStanceKw: ['法律','诉讼','中医','减肥','健身','感情','恋爱','亲子','家庭'] },
    { key: 'law', score: 40, qTest: t => /法|合同|签|违约|起诉|诉讼|赔偿|离婚|财产|遗嘱|侵权|纠纷|仲裁|律师|法院|证据|借条|担保|工伤|劳动|仲裁|专利|版权|维权/.test(t),
      allowStanceKw: ['法律','诉讼','合同','律师','合规','风险','维权','仲裁','证据','法务','版权','专利','劳动','离婚','财产','条款','违约'],
      denyStanceKw: ['中医','减肥','健身','感情','恋爱','亲子','投资','理财'] },
    { key: 'purchase', score: 35, qTest: t => /买|手机|电脑|车|房|数码|耳机|手表|相机|家电|家具|衣服|鞋|包|品牌|性价比|配置|预算|选|对比|评测|开箱/.test(t),
      allowStanceKw: ['消费','产品','数码','性价比','品牌','配置','评测','预算','决策','逻辑','理性','数据','参数'],
      denyStanceKw: ['法律','诉讼','中医','减肥','感情','恋爱','法律'] },
    { key: 'life', score: 30, qTest: t => /旅行|玩|游戏|电影|综艺|书|音乐|做饭|猫|狗|宠物|搬家|装修|出租|租房|城市|北京|上海|深圳|杭州|搬家/.test(t),
      allowStanceKw: ['生活','旅行','消费','产品','性价比','体验','心理','人际','规划','艺术','审美','游戏'],
      denyStanceKw: ['法律','诉讼','投资','金融','中医','减肥'] },
    { key: 'decision', score: 30, qTest: t => /要不要|该不该|选哪个|怎么选|纠结|二选一|两难|赌|风险|决策|计划|目标|未来|方向|选择|犹豫|权衡/.test(t),
      allowStanceKw: ['决策','逻辑','风险','理性','规划','选择','权衡','成本','收益','战略','思维','第一性原理','博弈'],
      denyStanceKw: [] },
  ];

  // 命中的话题组（可能多个，累计分数）
  const hitTopics = TOPIC_RULES.filter(r => r.qTest(qLow));
  const hitTopicKeys = new Set(hitTopics.map(r => r.key));
  const baseTopicScore = hitTopics.reduce((s, r) => s + r.score, 0);
  const mergedAllowKw = new Set(hitTopics.flatMap(r => r.allowStanceKw));
  const mergedDenyKw = new Set(hitTopics.flatMap(r => r.denyStanceKw));

  // ── 第二层：对每个Agent算分（stance+name+desc+tags 四重加权） ──
  const scored = candidateAgents.map(agent => {
    const name = (agent.name || '').toString();
    const stance = (agent.stance || '').toString();
    const desc = (agent.desc || '').toString();
    const tags = Array.isArray(agent.tags) ? agent.tags : [];
    const textLow = (name + ' ' + stance + ' ' + desc + ' ' + tags.join(' ')).toLowerCase();

    let score = 0;
    let denyHit = false;

    // 话题大分类命中（只在有明确话题时才生效，否则通用匹配）
    if (hitTopics.length > 0) {
      // deny 词命中 → 直接负分过滤（如减肥问题的Agent不能含"法律""诉讼"）
      for (const kw of mergedDenyKw) {
        if (textLow.includes(kw.toString().toLowerCase())) {
          score -= 80;
          denyHit = true;
          break;
        }
      }
      if (!denyHit) {
        // allow 词命中 → 大加分（stance > name > desc > tags）
        for (const kw of mergedAllowKw) {
          const k = kw.toString().toLowerCase();
          if (stance.toLowerCase().includes(k)) score += 35;
          else if (name.toLowerCase().includes(k)) score += 20;
          else if (tags.some(t => t.toLowerCase().includes(k))) score += 15;
          else if (desc.toLowerCase().includes(k)) score += 10;
        }
        score += baseTopicScore * 0.3; // 话题基础分加成
      }
    }

    // 问题原词与Agent文本的词重合（不管话题，做细粒度匹配）
    const qWords = [...new Set(
      (qLow.match(/[\u4e00-\u9fa5A-Za-z0-9]+/g) || []).filter(w => w.length >= 2)
    )];
    for (const w of qWords) {
      if (stance.toLowerCase().includes(w)) score += 25;
      else if (name.toLowerCase().includes(w)) score += 18;
      else if (tags.some(t => t.toLowerCase().includes(w))) score += 12;
      else if (desc.toLowerCase().includes(w)) score += 8;
    }

    // 特殊规则：对"讼师""职场老兵"这类强标签Agent做保护
    if (/讼师|律师|法务|法律/.test(name) && !hitTopicKeys.has('law')) score -= 60;
    if (/职场老兵|老板|HR|领导|创业者|投资人/.test(name) && !hitTopicKeys.has('career') && !hitTopicKeys.has('finance') && !hitTopicKeys.has('decision')) score -= 50;
    if (/老中医|健身教练|营养师|养生/.test(name) && !hitTopicKeys.has('health')) score -= 50;

    // 去重偏好：带 "新" 或 gen_ 的Agent给一点优先（鼓励新视角）
    if ((agent.id || '').startsWith('gen_')) score += 5;

    return { agent, score, denyHit };
  });

  // ── 第三层：排序+截断+保底 ──
  const sorted = scored
    .filter(s => !s.denyHit)                // 先踢掉 deny 明确命中的
    .sort((a, b) => b.score - a.score)      // 分数降序
    .filter(s => s.score > -10);            // 过滤特别不相关的（分数太低的）

  let result = sorted.slice(0, topK).map(s => s.agent.id);

  // 保底：如果过滤后一个也不剩，退回按"没有话题分类"的通用模式重算一次（不考虑 deny）
  if (result.length === 0) {
    const fallbackScored = candidateAgents.map(agent => {
      const name = (agent.name || '').toString();
      const stance = (agent.stance || '').toString();
      const desc = (agent.desc || '').toString();
      const textLow = (name + ' ' + stance + ' ' + desc).toLowerCase();
      const qWords = [...new Set(
        (qLow.match(/[\u4e00-\u9fa5A-Za-z0-9]+/g) || []).filter(w => w.length >= 2)
      )];
      let score = 0;
      for (const w of qWords) {
        if (stance.toLowerCase().includes(w)) score += 20;
        else if (name.toLowerCase().includes(w)) score += 12;
        else if (desc.toLowerCase().includes(w)) score += 6;
      }
      // 再没匹配就给 diversity 分（保证有得选，随机但稳定）
      if (score === 0) score = Math.floor(Math.random() * 10);
      return { agent, score };
    }).sort((a, b) => b.score - a.score);
    result = fallbackScored.slice(0, topK).map(s => s.agent.id);
  }

  return result;
}

/**
 * 系统Agent·总结汇总·策：本地降级总结（后端不可达时兜底）
 * 基于：用户问题 → 5轮澄清 → 所有智囊发言 → 产出「分歧/共识/盲点/策选」四段式总结
 * 不调用后端，保证流程闭环。
 */
function summaryComposerLocalSummary({ question, clarifies = [], agentReplies = [], agents = [] }) {
  const cleanAgents = Array.isArray(agents) ? agents : [];
  const cleanReplies = Array.isArray(agentReplies) ? agentReplies : [];
  const cleanClarifies = Array.isArray(clarifies) ? clarifies : [];

  // 聚合所有发言
  const allReplyTexts = cleanAgents.map((a, i) => {
    const text = cleanReplies[i] || (cleanReplies[0] && cleanReplies[0][a.id]) || '';
    return { name: a.name || '智囊', stance: a.stance || '', text };
  }).filter(x => x.text);

  // 1. 分歧：取前3个不同 stance 的观点
  const divergenceList = [];
  const seenStance = new Set();
  allReplyTexts.forEach(r => {
    const key = (r.stance || r.name).slice(0, 6);
    if (seenStance.has(key) || divergenceList.length >= 3) return;
    seenStance.add(key);
    const snippet = (r.text || '').slice(0, 50).replace(/\n/g, ' ');
    divergenceList.push(`${r.name}（${r.stance}）：「${snippet}${snippet.length >= 50 ? '…' : ''}」`);
  });
  while (divergenceList.length < 3) divergenceList.push('（暂无更多分歧，可尝试增加更多智囊视角）');

  // 2. 共识：基于问题类型给通用共识
  const qLow = (question || '').toString().toLowerCase();
  let consensusList = [
    '这个问题没有绝对对错，核心取决于你的优先级和长期目标。',
    '做决定前先列「不可妥协项」和「可妥协项」，避免情绪冲动。',
    '建议把「最坏情况」写出来，问自己：真的发生时我能承受吗？'
  ];
  if (/减|肥|健身|健康|减肥/.test(qLow)) {
    consensusList = [
      '减肥的本质是「长期热量差」，短期极端节食大概率反弹。',
      '先从「最小可坚持的改变」开始（比如每天多走 3000 步），不要一下子全部改。',
      '体重只是参考，更重要的是维度、精力、体检指标的变化。'
    ];
  } else if (/offer|工作|职|辞|跳槽|薪/.test(qLow)) {
    consensusList = [
      '选 Offer 的核心三要素：成长速度 × 直接上级 × 业务前景，而不是只看薪资。',
      '如果犹豫，就列 18 个月后你想成为什么样的人，再反推哪份工作能帮你最快到。',
      '裸辞不是不行，但请先准备 6 个月以上的生活备用金。'
    ];
  } else if (/爱|恋爱|分手|结婚|单身|对象/.test(qLow)) {
    consensusList = [
      '感情里「一个人能不能让你变更好」，比「他有多好」更重要。',
      '不要试图改变对方——3 年以上的习惯，几乎没有人能被另一半真正改过来。',
      '如果一段关系让你长期自我怀疑，请优先相信直觉。'
    ];
  }

  // 3. 盲点：基于澄清轮次没问到的点
  const blindspots = [];
  const clarifyText = cleanClarifies.map(c => (c.question || '') + (c.userAnswer || '')).join(' ');
  if (!/钱|预算|成本|多少/.test(clarifyText)) blindspots.push('可能忽略了「金钱/时间成本」维度：做这个决定要花多少钱？占你月收入/储蓄的比例？');
  if (!/长期|1年|3年|未来/.test(clarifyText)) blindspots.push('可能忽略了「长期影响」：今天做的选择，1 年后会让你感激还是后悔？');
  if (!/最坏|风险|失败|Plan B/.test(clarifyText)) blindspots.push('可能忽略了「最坏情况预案」：如果一切按最坏的方向发展，你有 Plan B 吗？');
  while (blindspots.length < 3) blindspots.push('（盲点不多，说明澄清已比较充分）');

  // 4. 策选建议：3条可执行建议
  let options = [
    '方案 A · 保守派：先不做改变，用 2 周时间收集更多信息再决定。',
    '方案 B · 折中派：先试错 1 个月（试错成本可控的前提下），再决定是否推进。',
    '方案 C · 激进派：直接执行，后续用敏捷迭代调整路径。'
  ];
  if (divergenceList.length >= 2) {
    options = [
      `方案 A · ${allReplyTexts[0]?.name || '方案一'} 路线：按「${(allReplyTexts[0]?.stance || '').slice(0, 8)}」思路推进。`,
      `方案 B · ${allReplyTexts[1]?.name || '方案二'} 路线：按「${(allReplyTexts[1]?.stance || '').slice(0, 8)}」思路推进。`,
      '方案 C · 合纵：两边各取一部分，组合成你自己的第三条路。'
    ];
  }

  const finalAdvice = `——总结汇总·策的最终建议——\n请你做最后一个动作：拿一张纸，左边写「现在做的 3 个好处」，右边写「1 年后后悔的 3 个可能」。\n写完再闭眼 10 秒，直觉第一冒出来的答案，往往就是你心里真正想要的。`;

  return {
    divergences: divergenceList,
    consensus: consensusList,
    blindspots: blindspots,
    options,
    finalAdvice,
    finalText: `演 · 总结（本地降级版）\n\n【议题】${question}\n\n【分歧焦点】\n${divergenceList.map((d, i) => `${i + 1}. ${d}`).join('\n')}\n\n【底层共识】\n${consensusList.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n\n【潜在盲点】\n${blindspots.map((b, i) => `${i + 1}. ${b}`).join('\n')}\n\n【三种策选】\n${options.map((o, i) => `${i + 1}. ${o}`).join('\n')}\n\n${finalAdvice}`,
  };
}

export default function useGameFlow({ DEFAULT_CHOICES }) {
  const navigate = useNavigate();

  const [phase, setPhase] = useState('input');
  const [userInput, setUserInput] = useState('');
  const [inputValue, setInputValue] = useState('要不要接那个新 Offer?');
  const [inference, setInference] = useState(null);
  const [showInput, setShowInput] = useState(true);
  const [showQuestion, setShowQuestion] = useState(false);
  const [activeAgentIdx, setActiveAgentIdx] = useState(-1);
  const [selectedChoice, setSelectedChoice] = useState(null);
  const [agentDialogues, setAgentDialogues] = useState({ history: {} });
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [awaitingUser, setAwaitingUser] = useState(false);
  const [currentResponse, setCurrentResponse] = useState('');
  const [currentCommit, setCurrentCommit] = useState('');
  const [oracleThrowing, setOracleThrowing] = useState(false);
  const [oracleResult, setOracleResult] = useState(null);
  const [floatTip, setFloatTip] = useState(null);
  const [selectedAgentIds, setSelectedAgentIds] = useState(new Set());
  const [agentCallResults, setAgentCallResults] = useState({});
  const [toolCallState, setToolCallState] = useState({
    agentId: null, tools: [], currentTool: null, results: [], status: 'idle',
  });
  const [debateRound, setDebateRound] = useState(1);
  const [debateConvergence, setDebateConvergence] = useState(null);
  const debateBlackboardRef = useRef(null);
  // B5: 辩论体验优化 - 自动播放开关（当前发言播完自动跳下一位）
  const [debateAutoPlay, setDebateAutoPlay] = useState(false);
  const debateAutoTimerRef = useRef(null);
  const debateMentionQueueRef = useRef([]);
  const [showAgentErrorModal, setShowAgentErrorModal] = useState(false);
  const [agentErrors, setAgentErrors] = useState({});
  const [yanMemories, setYanMemories] = useState([]);
  const [yanConversationId, setYanConversationId] = useState(null);
  const floatTipTimer = useRef(null);
  const stageTimersRef = useRef([]);
  const [fateContent, setFateContent] = useState(null);
  // 3D 浮起的命牌（DestinyRevealFX）只在用户点了"揭示命签"后才显示，避免 path_reveal 一进来就堆一堆牌
  const [fateRevealed, setFateRevealed] = useState(false);

  const [caseFile, setCaseFile] = useState(null);
  const [yanQuestionRounds, setYanQuestionRounds] = useState([]);
  const [memoryLayers, setMemoryLayers] = useState({ bioL2: '', l1Cards: [] });
  const [mirrorReview, setMirrorReview] = useState(null);
  const downgradeRef = useRef(null);
  // E3: 连续否定回答计数（用户回答「不知道/啥？/别问了」这类，连续 2 次就提示「别问了，直接召智囊」）
  const negativeStreakRef = useRef(0);
  const [clarifyRound, setClarifyRound] = useState(0);
  const [infoProgress, setInfoProgress] = useState(0);
  // ============ 赛博算命仪式专用状态（流程节点，非动画）============
  const [qinianInput, setQinianInput] = useState({ mindNum: 0, sixThrows: [], yongShenConfirmed: null, agentRecAccepted: null, sanBianStep: 0, sanJiChecked: [false,false,false], sanYaoChecked: [false,false,false] });
  const [cyberGua, setCyberGua] = useState(null); // { signId, gua(卦元对象), yaoArray, movingLine, zhuangGuaLog, yongShenObj, agentRecommendedIds, sanBian, poem, fateSign16, runeSvg, fuTie, niGuaTag }
  // ★ 根因修复：setQinian 必须同时支持「对象 patch」和「函数式更新」两种调用。
  //   之前只支持对象，导致 handleCastOneCoin/handleToggleSanJi/handleSanbianNext 等传入的
  //   函数被当对象展开（...(fn||{}) 无键）→ 状态永不更新 → 投一枚/勾选/下一变按钮"点不动"。
  const setQinian = useCallback((patch) => setQinianInput(prev => {
    const base = prev || {};
    if (typeof patch === 'function') return patch(base);
    return { ...base, ...(patch || {}) };
  }), []);

  const GAME_SAVE_KEY = 'yance_game_session';

  const saveGameState = useCallback(() => {
    try {
      const snapshot = {
        phase, userInput, inputValue, inference, agentDialogues,
        showInput, showQuestion, activeAgentIdx, selectedChoice,
        selectedAgentIds: Array.from(selectedAgentIds),
        yanQuestionRounds, clarifyRound, currentCommit,
        debateRound, debateConvergence, oracleResult,
        yanConversationId, caseFile, mirrorReview, infoProgress,
        fateContent,
      };
      sessionStorage.setItem(GAME_SAVE_KEY, JSON.stringify(snapshot));
    } catch (e) {
      console.warn('[saveGameState] 保存失败:', e);
    }
  }, [phase, userInput, inputValue, inference, agentDialogues, showInput, showQuestion, activeAgentIdx, selectedChoice, selectedAgentIds, yanQuestionRounds, clarifyRound, currentCommit, debateRound, debateConvergence, oracleResult, yanConversationId, caseFile, mirrorReview, infoProgress, fateContent]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(GAME_SAVE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (!s || !s.phase || s.phase === 'input') return;
      // ★ Q1 修复：起始仪式阶段（立卦/投钱/装卦/三变/演问前）的半拉子状态一律不恢复，
      //         防止"恢复完立刻被 awaitingUser effect 自动推进到演问问题环节，用户根本填不了"
      const RITUAL_STAGES = new Set([
        'qinian_mind','qinian_tou','zhuanggua','yongshen','sanbian',
        'casting','oracle_prompt','oracle','yan_analyze','agent_select','case_file_confirm'
      ]);
      const restoredIsRitual = RITUAL_STAGES.has(s.phase);
      if (restoredIsRitual) {
        // 只恢复用户输入的问题（保留他写的提问），其他阶段/状态丢掉，让用户从 qinian_mind 重新起卦
        if (s.userInput) setUserInput(s.userInput);
        if (s.inputValue) setInputValue(s.inputValue);
        sessionStorage.removeItem(GAME_SAVE_KEY);
        return;
      }
      // 非仪式阶段（辩/结/择/命/定）才完整恢复
      if (s.userInput) setUserInput(s.userInput);
      if (s.inputValue) setInputValue(s.inputValue);
      if (s.inference) setInference(s.inference);
      if (s.agentDialogues) setAgentDialogues(s.agentDialogues);
      if (typeof s.showInput === 'boolean') setShowInput(s.showInput);
      if (typeof s.showQuestion === 'boolean') setShowQuestion(s.showQuestion);
      if (typeof s.activeAgentIdx === 'number') setActiveAgentIdx(s.activeAgentIdx);
      if (s.selectedChoice) setSelectedChoice(s.selectedChoice);
      if (Array.isArray(s.selectedAgentIds)) setSelectedAgentIds(new Set(s.selectedAgentIds));
      if (Array.isArray(s.yanQuestionRounds)) setYanQuestionRounds(s.yanQuestionRounds);
      if (typeof s.clarifyRound === 'number') setClarifyRound(s.clarifyRound);
      if (s.currentCommit) setCurrentCommit(s.currentCommit);
      if (typeof s.debateRound === 'number') setDebateRound(s.debateRound);
      if (s.debateConvergence) setDebateConvergence(s.debateConvergence);
      if (s.oracleResult) setOracleResult(s.oracleResult);
      if (s.yanConversationId) setYanConversationId(s.yanConversationId);
      if (s.caseFile) setCaseFile(s.caseFile);
      if (s.mirrorReview) setMirrorReview(s.mirrorReview);
      if (typeof s.infoProgress === 'number') setInfoProgress(s.infoProgress);
      if (s.fateContent) setFateContent(s.fateContent);
      setPhase(s.phase);
      setAwaitingUser(true);
      sessionStorage.removeItem(GAME_SAVE_KEY);
    } catch (e) {
      console.warn('[restoreGameState] 恢复失败:', e);
      sessionStorage.removeItem(GAME_SAVE_KEY);
    }
  }, []);

  const activeAgents = useMemo(() => {
    try {
      if (!userInput) return [];
      const presetAgents = getAgentsForQuestion(userInput) || [];
      const customAgentsList = getCustomAgents();
      const allAgents = [...presetAgents, ...customAgentsList];
      if ((phase === 'agent_debate' || phase === 'reflecting' || phase === 'summary' || phase === 'committing' || phase === 'final') && inference?.agents) {
        return inference.agents;
      }
      return allAgents;
    } catch (e) {
      console.warn('[activeAgents] 生成失败:', e);
      return [];
    }
  }, [userInput, phase, inference]);

  const questionType = useMemo(() => {
    if (!userInput) return null;
    const type = detectQuestionType(userInput);
    return QUESTION_TYPES[type];
  }, [userInput]);

  const choices = useMemo(() => {
    const cleanTxt = (s) => sanitizeLLMText(String(s || '').replace(/\s+/g, ' ').trim());
    // ★ Q6 异常处理：currentCommit 可能是 undefined/null/空字符串/超长，一律安全处理
    const safeCommit = (() => {
      try {
        const raw = String(currentCommit || '').trim();
        if (!raw) return '';
        if (raw.length > 120) return raw.slice(0, 117) + '…';
        return raw;
      } catch (_) { return ''; }
    })();
    try {
      // 1. 先拿本地动态生成（含智囊原话切片、问题关键词、currentCommit 本心锚点）
      const local = _buildLocalChoices(userInput, activeAgents, agentDialogues, safeCommit) || [];
      const seenIds = new Set();
      const merged = [];
      const pushUniq = (c) => {
        if (!c || !c.id) return;
        if (seenIds.has(c.id)) return;
        seenIds.add(c.id);
        merged.push(c);
      };
      local.forEach(pushUniq);

      // 2. 再合并 inference.options（后端返回的，如果可用且有内容）
      try {
        if (Array.isArray(inference?.options) && inference.options.length > 0) {
          for (const o of inference.options) {
            if (!o || !o.label) continue;
            const normalizedId = o.id || String(o.label).slice(0, 8);
            const cleanLabel = cleanTxt(o.label);
            if (!cleanLabel) continue;
            // 从后端 keyPoints 中抽真实话，不足再补本地生成兜底
            const kpRaw = Array.isArray(o.keyPoints) ? o.keyPoints.map(k => cleanTxt(k)).filter(Boolean) : [];
            while (kpRaw.length < 3) kpRaw.push(`关于「${cleanTxt(userInput).slice(0, 12) || '此事'}」的${cleanLabel}要点`);
            pushUniq({
              id: normalizedId,
              label: cleanLabel,
              desc: cleanTxt(o.desc || o.summary || cleanLabel),
              keyPoints: kpRaw.slice(0, 3),
              verse: cleanTxt(o.verse || `${cleanLabel}。此卦言${o.gua || '大有'}。`),
              gua: o.gua || cleanLabel.slice(0, 2),
              icon: o.icon || '☰',
              color: o.color || '#C88848',
              glowColor: o.glowColor || '#E8B880',
            });
          }
        }
      } catch (_) {}

      // 3. 兜底 DEFAULT_CHOICES，确保每个 choice 都有 keyPoints/verse
      (DEFAULT_CHOICES || []).forEach(pushUniq);

      if (merged.length > 0) {
        // 补齐字段：keyPoints/verse 为空就从本地生成里按 id 借，最后才用空兜底
        const finalWithFields = merged.map((c, idx) => {
          const fallback = (DEFAULT_CHOICES || []).find(d => d && d.id === c.id) || (DEFAULT_CHOICES || [])[idx] || {};
          return {
            ...c,
            keyPoints: Array.isArray(c.keyPoints) && c.keyPoints.length > 0
              ? c.keyPoints.slice(0, 3)
              : (Array.isArray(fallback.keyPoints) ? fallback.keyPoints.slice(0, 3) : [cleanTxt(c.label || '此路径要点')]),
            verse: c.verse && cleanTxt(c.verse).length > 2
              ? cleanTxt(c.verse)
              : (fallback.verse || `${cleanTxt(c.label || '选择')}。卦有明训。`),
            gua: c.gua || fallback.gua || '大有',
            icon: c.icon || fallback.icon || '☰',
            color: c.color || fallback.color || '#C8A850',
            glowColor: c.glowColor || fallback.glowColor || '#F0D890',
          };
        });
        // 严格最多 3 张，避免堆积
        return finalWithFields.slice(0, 3);
      }
    } catch (e) {
      console.warn('[choices] 生成失败，降级 DEFAULT_CHOICES:', e.message);
    }
    // 最后兜底：DEFAULT_CHOICES 也一定补齐了 keyPoints/verse
    const withFields = (DEFAULT_CHOICES || []).slice(0, 3).map(c => ({
      ...c,
      keyPoints: Array.isArray(c.keyPoints) && c.keyPoints.length > 0 ? c.keyPoints.slice(0, 3) : [c.label || '此路径要点'],
      verse: c.verse || `${c.label}。卦有明训。`,
    }));
    return withFields.length > 0 ? withFields : [
      { id: 'opportunity', label: '抓住机会', keyPoints: ['先做再说', '占住位置', '补漏洞'], verse: '元亨。利有攸往。', icon: '☰', gua: '大有', color: '#C88848', glowColor: '#E8B880' },
    ];
  }, [DEFAULT_CHOICES, userInput, activeAgents, agentDialogues, inference, currentCommit]);

  const progress = useMemo(() => {
    if (phase === 'clarify_loop') return 0;
    return gateProgress(caseFile);
  }, [caseFile, phase]);

  const clearTimers = useCallback(() => {
    stageTimersRef.current.forEach(t => clearTimeout(t));
    stageTimersRef.current = [];
    if (floatTipTimer.current) { clearTimeout(floatTipTimer.current); floatTipTimer.current = null; }
  }, []);

  const showFloatTipBriefly = useCallback((msg, duration = 3000) => {
    setFloatTip(msg);
    if (floatTipTimer.current) clearTimeout(floatTipTimer.current);
    floatTipTimer.current = setTimeout(() => setFloatTip(null), duration);
  }, []);

  const appendYanDialogue = useCallback((text, source = 'preset') => {
    setAgentDialogues(prev => ({
      ...prev,
      yan: text,
      history: {
        ...(prev.history || {}),
        yan: [...((prev.history || {}).yan || []), typeof text === 'object' ? text : { text, source }],
      },
    }));
  }, []);

  const appendUserToYanHistory = useCallback((userText) => {
    const wrapped = `【你】${userText}`;
    setAgentDialogues(prev => {
      const history = { ...(prev.history || {}) };
      const arr = history.yan || [];
      history.yan = [...arr, wrapped];
      return { ...prev, yan: wrapped, history };
    });
  }, []);

  const prevPhaseRef = useRef(phase);
  useEffect(() => {
    const prev = prevPhaseRef.current;
    if (prev !== phase) {
      try {
        tracker.track('phase_exit', { phase: prev });
        tracker.track('phase_enter', { phase });
      } catch (e) { /* noop */ }
      prevPhaseRef.current = phase;
    }
  }, [phase]);

  useEffect(() => {
    tracker.track('phase_enter', { phase: 'input' });
  }, []);

  const handleRestart = useCallback(() => {
    clearTimers();
    setPhase('input');
    setShowInput(true);
    setShowQuestion(false);
    setUserInput('');
    setActiveAgentIdx(-1);
    setSelectedChoice(null);
    setAgentDialogues({ history: {} });
    setShowHistoryPanel(false);
    setAwaitingUser(false);
    setCurrentResponse('');
    setInference(null);
    setDebateRound(1);
    setDebateConvergence(null);
    setCaseFile(null);
    setYanQuestionRounds([]);
    setMirrorReview(null);
    setFateRevealed(false);
    debateBlackboardRef.current = null;
    debateMentionQueueRef.current = [];
    downgradeRef.current = null;
    setClarifyRound(0);
    // 赛博算命仪式：重置全部
    setQinian({ mindNum: 0, sixThrows: [], yongShenConfirmed: null, agentRecAccepted: null, sanBianStep: 0, sanJiChecked: [false,false,false], sanYaoChecked: [false,false,false] });
    setCyberGua(null);
  }, [clearTimers, setQinian]);

  const handleStart = useCallback(async () => {
    try {
      if (!inputValue.trim()) return;
      const question = inputValue.trim();
      const keywords = _detectKeywordsLocal(question);
      const qType = detectQuestionType(question);
      const typeLabel = QUESTION_TYPES[qType]?.label || '人生抉择';

      const budget = checkBudget();
      if (budget.over) {
        const dg = maybeDowngrade(null, budget.reason);
        downgradeRef.current = dg;
        showFloatTipBriefly(dg.tip, 5000);
      }

      routeModelTier(question, keywords);

      const layers = readMemoryLayers({ questionText: question, keywords, topK: 3 });
      setMemoryLayers({ bioL2: layers.bioL2 || '', l1Cards: layers.l1Cards || [] });

      setUserInput(question);
      setShowInput(false);
      setShowQuestion(true);
      // 流程赛博算命 A：走完 [立卦 · 起念数字 → 六次真投爻 → 装卦日志 → 用神校准]
      //  → 再进入澄清/析理；用户可以一键跳过仪式，保留控制权
      setActiveAgentIdx(-1);
      setSelectedChoice(null);
      setAgentDialogues({ history: {} });
      setAwaitingUser(false);  // ★ Q1 根因修复：qinian_mind 阶段必须用户手动点按钮推进，绝对不许 awaitingUser=true 触发自动推进
      setCurrentResponse('');
      setCaseFile(null);
      setClarifyRound(0);
      setInference(null);
      setQinian({ mindNum: 0, sixThrows: [], yongShenConfirmed: null, agentRecAccepted: null, sanBianStep: 0, sanJiChecked: [false,false,false], sanYaoChecked: [false,false,false] });
      setCyberGua(null);
      setPhase('qinian_mind');  // 仪式 P1：起念数字 ← 就停在这里！用户不按按钮不许往下

      // ★ Q1 根因修复：删掉 handleStart 里所有「自动延时推进到 analyzing/summoning/clarify_loop」的代码！
      //    之前写的 await delay(4000) setPhase('analyzing') 是「填不了就自己跳到演问问题」的直接罪魁祸首。
      //    现在流程必须用户手动按按钮一步一步推进：
      //      qinian_mind →（点确认落数·起卦）→ qinian_tou →（六投·装卦）→ zhuanggua →（点装卦日志确认）→ yongshen
      //      →（点用神校准）→ sanbian →（点 6 次 下一变/定局揭命）→ casting → yan_analyze → clarify_loop → agent_select → …
      //    如果用户想跳过整个仪式 → 点 UI 右上角「不愿立卦 · 直接开演（跳过仪式）」链接，那个会直接走跳过分支到 clarify_loop

      const openingQuestion = _generate5WQuestions(question, typeLabel, keywords);
      // 初始占位：真实提问在演生成后回写，保证卡片与右侧推演记录同源
      setYanQuestionRounds([{
        question: '演 · 候你一念落数 · 起卦定局……',
        userAnswer: '',
        questionBy: '演',
      }]);

      // ★ Q1：不再启动任何推进定时器，保持 clearTimers 后停住
      clearTimers();

      // ★ A1 根因修复：handleStart 里**绝对不许再调用演生成首个问题**！
      //   之前 L1165-1259 这段 judgeContinueAsking + streamYanChat + appendYanDialogue 是
      //   「选数字界面演就开始问问题」的直接原因。
      //   生成演第一个问题的逻辑现在只在两个地方：
      //     ① 用户正常走完仪式 → handleConfirmSanBian（定局·揭命 后调用）
      //     ② 用户点跳过仪式 → handleSkipQinian（不愿立卦·直接开演 后调用）
      //   这里只保留一个占位，让 UI 在仪式阶段显示「候命」，不要真的去发请求/写对话。
      setAgentDialogues(prev => ({ ...prev, yan: '演 · 候命 · 待卦成象……' }));
      // 不再 setAwaitingUser(true)，也不 appendYanDialogue / setYanQuestionRounds
      // 保证 qinian_mind / qinian_tou 阶段 UI 上不会出现"演已经问了第一个问题"
    } catch (e) {
      console.warn('[handleStart] 推演启动失败:', e);
      setFloatTip('推演启动失败，请重试');
      setTimeout(() => {
        handleRestart();
      }, 2000);
    }
  }, [inputValue, clearTimers, handleRestart, showFloatTipBriefly, appendYanDialogue]);

  const handleUserAdvance = useCallback(async (opts = {}) => {
    const { forceClarifyStop = false } = opts;
    // ★ Q1+Q7 修复：阶段守卫——summary/committing/oracle/branch_select/path_reveal/final 不再触发任何自动推进或旧 agent 追加发言
    // 避免"总结之后还有这些在发言"
    const LOCKED_PHASES = ['reflecting', 'summary', 'committing', 'oracle_prompt', 'oracle', 'branch_select', 'path_reveal', 'final', 'qinian_mind', 'qinian_tou', 'zhuanggua', 'yongshen', 'sanbian', 'agent_select', 'case_file_confirm'];
    if (LOCKED_PHASES.includes(phase) && !forceClarifyStop) {
      // 这些阶段只能走各自的专用按钮（handleShowChoices / handleCommit / handleStartOracle 等）
      // handleUserAdvance 在这些阶段一律不做事，杜绝"自己往后跳"
      return;
    }
    if (phase === 'clarify_loop') {
      const yanAnswer = currentResponse.trim();
      const nextRound = forceClarifyStop ? MAX_CLARIFY_ROUNDS : clarifyRound + 1;

      // E3: 识别用户是否在「否定/不想回答」，连续 2 次就弹提示让用户跳过，不要死缠烂打
      if (yanAnswer && !forceClarifyStop) {
        const isNeg = _isNegativeAnswer(yanAnswer);
        if (isNeg) {
          negativeStreakRef.current = Math.min(10, negativeStreakRef.current + 1);
          if (negativeStreakRef.current >= 2) {
            showFloatTipBriefly(
              '我连续 2 次没问到点子上，抱歉。建议直接点「跳过·召智囊」让他们先开口，或换个问题重新开始。',
              6000
            );
          }
        } else if (yanAnswer.length >= 6) {
          // 有效回答（>=6字）就清零否定 streak
          negativeStreakRef.current = 0;
        }
      }

      setYanQuestionRounds(prevRounds => {
        let rounds = prevRounds.length > 0 ? [...prevRounds] : [{ question: '请继续描述你的处境。', userAnswer: '', questionBy: '演' }];
        rounds[rounds.length - 1] = { ...rounds[rounds.length - 1], userAnswer: yanAnswer };
        return rounds;
      });

      if (yanAnswer) appendUserToYanHistory(yanAnswer);
      setCurrentResponse('');
      setClarifyRound(nextRound);

      let baseProgress = 0;
      try {
        baseProgress = Math.min(95, Math.round(
          (nextRound / MAX_CLARIFY_ROUNDS) * 55 +
          Math.min(yanAnswer.length / 40, 1) * 15 +
          Math.min(yanQuestionRounds.length / 3, 1) * 15 +
          (userInput.length > 12 ? 15 : Math.round(userInput.length / 12 * 15))
        ));
        setInfoProgress(baseProgress);
        if (baseProgress >= 80 && !forceClarifyStop) {
          showFloatTipBriefly(`信息已收集 ${baseProgress}%，可以随时点「跳过到智囊」，或继续聊让演追问更深。`, 4500);
        }
      } catch (_) {}

      const accumulatedContext = (() => {
        const hist = agentDialogues?.history?.yan || [];
        const qaPairs = [];
        let lastQ = '';
        for (const h of hist) {
          const txt = typeof h === 'object' ? h.text : h;
          if (!txt) continue;
          if (txt.startsWith('【你】')) {
            if (lastQ) qaPairs.push({ q: lastQ, a: txt.replace('【你】', '') });
            lastQ = '';
          } else {
            lastQ = txt.slice(0, 80);
          }
        }
        return `用户原问题：${userInput}\n\n澄清问答历史：\n${qaPairs.map((p, i) => `Q${i+1}: ${p.q}\nA${i+1}: ${p.a}`).join('\n\n')}`;
      })();

      let judgeResult = { continueAsking: false, nextQuestion: '' };
      if (!forceClarifyStop) {
        const yanAgent = { id: 'yan', name: '演', stance: '澄清视角' };
        const yanHistory = (agentDialogues?.history?.yan || []).map(h => typeof h === 'object' ? h.text : h);
        judgeResult = await judgeContinueAsking(yanAgent, userInput, yanHistory, yanAnswer);
      }

      // A1+A2 彻底修复：
      // - 只有 2 种情况能停：①用户点「演·信息已足够」(forceClarifyStop=true)；②到 5 轮上限(防止死循环)
      // - 不管 LLM/后端说「信息够不够」，都不能替用户决定，用户主控节奏
      // - MAX_CLARIFY_ROUNDS 是上限不是强制值：用户可以在 1~5 轮之间任何时刻点按钮提前进入智囊池
      const shouldStop =
        forceClarifyStop ||
        nextRound >= MAX_CLARIFY_ROUNDS;

      if (!shouldStop) {
        // B1 Fix: keywords 和 qType 必须提前声明（TDZ 问题），因为上面 if 里已经用到了
        const keywords = _detectKeywordsLocal(userInput);
        const qType = detectQuestionType(userInput);

        let nextQuestion = judgeResult?.nextQuestion;
        let source = 'llm_judge';

        // A2 Fix: 语义跑偏校验——如果 LLM 返回的追问和当前问题类型完全不搭（比如健康/吃饭问题扯到"职场/法律/纠结通用"），
        // 直接用本地 localGenerateNaturalClarify 的精准话题问题覆盖（保证追问方向永远不跑题）
        if (nextQuestion && nextQuestion.length > 3) {
          const qLowAll = (userInput + ' ' + (keywords || []).join(' ')).toLowerCase();
          const isHealthQ = /减|肥|胖|健身|体重|健康|运动|吃|睡|饮食|餐|饭|锻炼|瑜伽|减肥| calorie /.test(qLowAll);
          const isCareerQ = /工作|offer|职|薪|辞|跳槽|创业|老板|公司|晋升|事业|项目|合伙/.test(qLowAll);
          const isLoveQ = /爱|分手|恋爱|对象|男友|女友|伴侣|感情|喜欢|追|表白|婚|出轨|异地/.test(qLowAll);
          const nextLow = nextQuestion.toLowerCase();
          let mismatched = false;
          // 健康问题不能问"职场/法律/公司/创业"相关
          if (isHealthQ && /职场|法律|诉讼|合同|offer|公司|老板|同事|领导|创业|投资|金融|股票/.test(nextLow)) mismatched = true;
          // 感情问题不能问"法律/职场/投资"
          if (isLoveQ && /法律|职场|诉讼|投资|金融|健身|减肥|中医|商业|公司/.test(nextLow)) mismatched = true;
          // 职场问题不能问"减肥/健身/中医/感情/恋爱"
          if (isCareerQ && /减肥|健身|中医|养生|恋爱|分手|感情|对象|出轨|表白/.test(nextLow)) mismatched = true;
          // 追问不能脱离原话题：出现太泛的"纠结什么情况下"这类模板、且原问题是健康/感情等具体类型时也覆盖
          if ((isHealthQ || isCareerQ || isLoveQ) && /通常在什么情况下感到纠结|选A还是选B|抛硬币/.test(nextLow)) mismatched = true;
          if (mismatched) {
            // E2: 基于最新的 yanQuestionRounds（包含刚刚回答的上一轮）动态生成追问
            nextQuestion = generateContextAwareClarify(userInput, yanQuestionRounds, nextRound);
            source = 'local_natural_semantic_guard';
          }
        }

        if (!nextQuestion || nextQuestion.length < 6) {
          try {
            setFloatTip('演 · 正在斟酌下一个追问...');
            const qTypeLabel = typeof qType === 'string' ? qType : (Array.isArray(qType) ? qType[0] : '人生抉择');
            const llmPrompt = `你是「演」，一位沉稳直指核心的引导者。\n\n${accumulatedContext}\n\n当前用户已回答${nextRound}轮澄清问题。请用自然、沉稳、直指核心的口吻，提出1个新的追问，深入挖掘用户还没说出口的真实顾虑、背景约束或核心诉求。不要用5W模板，不要用编号，不要用【何事】【何时】这类标签，就用自然语言对话。只输出1个问题，不要解释。要求：追问必须紧扣用户「${qTypeLabel}」类问题的核心方向，不能扯不相关的领域。`;
            // ★ 修复：澄清追问 LLM 调用从 8s → 20s
            // 原 8s 太短，Vercel 冷启动 + 智谱高峰期响应时间经常超过 8s，
            // 导致 Promise.race 返回 null → 触发"后端+LLM追问生成失败，启用本地自然语言降级"，
            // 用户感知就是"前面对话好好的，突然就降级了"。
            const race = await Promise.race([
              streamYanChat({
                message: llmPrompt,
                conversationId: yanConversationId
              }, (chunk, fullText, convId) => { setYanConversationId(convId); }),
              new Promise(resolve => setTimeout(() => resolve(null), 20000)),
            ]);
            if (race && race.text && race.text.length > 10) {
              nextQuestion = race.text;
              source = 'llm';
              recordCost(llmPrompt.length, race.text.length);
              if (race.conversationId) setYanConversationId(race.conversationId);
            }
          } catch (e) {
            console.warn('[澄清追问] LLM失败:', e);
          } finally {
            setFloatTip(null);
          }
        }

        if (!nextQuestion || nextQuestion.length < 6) {
          console.warn('[澄清追问] 后端+LLM追问生成失败，启用本地自然语言降级');
          // E2: 传 yanQuestionRounds（已包含刚刚用户回答的上一轮），生成真正接得上话的追问
          nextQuestion = generateContextAwareClarify(userInput, yanQuestionRounds, nextRound);
          source = 'local_natural';
        }

        if (baseProgress >= 80) {
          nextQuestion += '\n\n（我问得差不多了——随时可以点「跳过·召智囊」让他们来聊聊，或者继续跟我说也行。）';
        }

        appendYanDialogue(nextQuestion, source);
        setYanQuestionRounds(prev => {
          if (prev.length === 0) return [{ question: nextQuestion, userAnswer: '', questionBy: '演' }];
          return [...prev, { question: nextQuestion, userAnswer: '', questionBy: '演' }];
        });
        setAwaitingUser(true);
        return;
      }

      setFloatTip('演 · 信息已足够，正在生成推演内容与智囊池...');

      let userContext = '';
      try {
        const summarizePrompt = `${accumulatedContext}\n\n请基于以上多轮问答，用2-3句话提炼关键信息作为智囊团讨论的背景上下文。直接输出结果。`;
        if (isLlmAvailable() && !downgradeRef.current) {
          // ★ 修复：澄清后上下文总结从 8s → 20s，与澄清追问保持一致
          const race = await Promise.race([
            streamYanChat({ message: summarizePrompt, conversationId: yanConversationId },
              (chunk, fullText, convId) => { setYanConversationId(convId); }),
            new Promise(resolve => setTimeout(() => resolve(null), 20000)),
          ]);
          if (race && race.text && race.text.length > 5) {
            userContext = race.text;
            recordCost(summarizePrompt.length, race.text.length);
          }
        }
      } catch (_) {}

      const keywords = _detectKeywordsLocal(userInput);
      const qType = detectQuestionType(userInput);
      let inf = null;
      const infCacheKey = makeCacheKey('inference', { question: userInput, keywords }, { qType });
      const cachedInf = getCached(infCacheKey);
      if (cachedInf) {
        inf = cachedInf;
      } else {
        try {
          const promptChars = userInput.length + (userContext?.length || 0) + 200;
          inf = await generateInferenceContent(userContext ? `${userInput}\n\n【用户背景】${userContext}` : userInput);
          if (inf) {
            recordCost(promptChars, JSON.stringify(inf).length);
            setCached(infCacheKey, inf);
          }
        } catch (e) {
          console.warn('[澄清后] 生成推演内容异常，降级本地兜底Agent池:', e.message || e);
          inf = null;
        }
      }

      if (!inf || !inf.agents || inf.agents.length === 0) {
        console.warn('[澄清后] 后端推演内容生成失败，用任务分派·镜三重匹配动态选兜底Agent');
        let customAgentsList = [];
        try { customAgentsList = getCustomAgents() || []; } catch (e) { console.warn('customAgents load fail:', e); }

        // R3/R4 Fix: 兜底Agent池按7大话题全覆盖，不再写死 Offer/风险视角；然后用 taskAssignerMatchAgents 基于问题精准选4个
        const FALLBACK_AGENTS_POOL = [
          // 健康/减肥
          { id: 'lao_zhongyi', name: '老中医', stance: '健康养生视角', role: 'dynamic', trigram: '☷', color: '#508870', glow: '#80C8A8', desc: '从中医养生、饮食作息、体质辩证看健康决策' },
          { id: 'fitness_coach', name: '健身教练', stance: '运动营养视角', role: 'dynamic', trigram: '☳', color: '#C86848', glow: '#E8A080', desc: '从热量缺口、力量训练、饮食习惯分析减脂可行性' },
          { id: 'nutritionist', name: '营养师', stance: '膳食营养视角', role: 'dynamic', trigram: '☴', color: '#A87898', glow: '#D8A8C8', desc: '从宏量营养素、基础代谢、长期可持续性给饮食方案' },
          // 职业/Offer
          { id: 'luxiang', name: '路向', stance: '职业发展视角', role: 'dynamic', trigram: '☴', color: '#508870', glow: '#80C8A8', desc: '从职业路径、成长速度、行业前景分析Offer选择' },
          { id: 'workplace_vet', name: '职场老兵', stance: '职场生存视角', role: 'dynamic', trigram: '☱', color: '#685888', glow: '#A898C8', desc: '从办公室政治、领导风格、团队文化分析潜在坑点' },
          { id: 'hr_sister', name: 'HR姐姐', stance: '薪酬福利视角', role: 'dynamic', trigram: '☰', color: '#A87898', glow: '#D8A8C8', desc: '从薪资结构、五险一金、试用期、跳槽背调给务实建议' },
          // 财务/消费
          { id: 'qiangu', name: '钱谷', stance: '财务成本视角', role: 'dynamic', trigram: '☰', color: '#C88848', glow: '#E8B880', desc: '从ROI、机会成本、现金流、隐性花费分析经济账' },
          { id: 'value_investor', name: '价值投资者', stance: '长期投资视角', role: 'dynamic', trigram: '☵', color: '#5078A8', glow: '#80A8D8', desc: '从长期价值、护城河、复利效应思考消费和资产' },
          // 法律/风险
          { id: 'fadu', name: '法度·讼师', stance: '法律风险视角', role: 'dynamic', trigram: '☲', color: '#A84848', glow: '#E88080', desc: '从合同条款、违约风险、维权成本、诉讼可行性分析' },
          { id: 'fengyan', name: '风眼', stance: '风险管控视角', role: 'permanent', trigram: '☵', color: '#A84848', glow: '#E88080', desc: '从最坏情况、黑天鹅风险、底线思维做风险预警' },
          // 感情/人际
          { id: 'xinhe', name: '心禾', stance: '亲密关系视角', role: 'dynamic', trigram: '☷', color: '#A87898', glow: '#D8A8C8', desc: '从依恋模式、沟通方法、边界感分析感情关系' },
          { id: 'old_mother', name: '老母亲', stance: '家庭代际视角', role: 'dynamic', trigram: '☷', color: '#C88848', glow: '#E8B880', desc: '从父母期望、家族责任、代际冲突角度分析家庭决策' },
          // 教育/成长
          { id: 'xuezhe', name: '学者', stance: '教育认知视角', role: 'dynamic', trigram: '☶', color: '#5078A8', glow: '#80A8D8', desc: '从学习规律、认知升级、长期复利角度分析教育投入' },
          // 理性决策
          { id: 'jingyuan', name: '镜渊', stance: '反思复盘视角', role: 'permanent', trigram: '☶', color: '#685888', glow: '#A898C8', desc: '事后复盘视角，帮你看清自己的情绪、偏见和动机' },
          { id: 'duiyan', name: '兑言', stance: '博弈决策视角', role: 'dynamic', trigram: '☱', color: '#48A898', glow: '#80D8C8', desc: '从博弈论、成本收益、机会成本角度做理性决策推演' },
          { id: 'zhenxing', name: '震行', stance: '行动执行视角', role: 'dynamic', trigram: '☳', color: '#C86848', glow: '#E8A080', desc: '从执行力、最小试错、分步落地的务实派视角给可执行方案' },
          // 生活/产品
          { id: 'backpacker', name: '背包客', stance: '生活体验视角', role: 'dynamic', trigram: '☴', color: '#508870', glow: '#80C8A8', desc: '从真实体验、生活品质、情绪价值分析消费和人生选择' },
          { id: 'product_manager', name: '产品经理', stance: '需求分析视角', role: 'dynamic', trigram: '☰', color: '#5078A8', glow: '#80A8D8', desc: '从真实需求、场景痛点、性价比决策分析购买决策' },
        ];
        const poolWithCustom = [...FALLBACK_AGENTS_POOL, ...customAgentsList];
        const pickedIds = taskAssignerMatchAgents(userInput, poolWithCustom, Math.min(5, poolWithCustom.length));
        const merged = pickedIds
          .map(id => poolWithCustom.find(a => a.id === id))
          .filter(Boolean);
        // 保底至少4个
        const finalAgents = merged.length >= 2
          ? merged
          : [FALLBACK_AGENTS_POOL[0], FALLBACK_AGENTS_POOL[1], FALLBACK_AGENTS_POOL[9], FALLBACK_AGENTS_POOL[14]];
        inf = {
          agents: finalAgents,
          agentDialogues: {},
          powerfulQuestion: '',
          userContext,
        };
      } else {
        inf.userContext = userContext || inf.userContext;
      }

      let recommendedAgentIds = [];
      let generatedAgents = [];

      try {
        setFloatTip('演 · 正在遴选推荐智囊...');
        const existingAgents = inf.agents || [];
        const agentInfoStr = existingAgents.map(a => `ID:${a.id} | 名称:${a.name} | 立场:${a.stance || ''} | 描述:${a.desc || ''}`).join('\n');

        const recommendPrompt = `用户的问题是：「${userInput}」\n用户背景上下文：${userContext || '（无）'}\n\n现有智囊池：\n${agentInfoStr}\n\n请你作为「演」，从现有智囊中，根据问题的语义匹配度，挑选3-5个最适合参议的智囊作为推荐池。要求：\n1. 根据问题关键词和场景，匹配智囊的 stance（立场）和 desc（描述）\n2. 只返回智囊 ID 数组的 JSON，不要其他内容，格式如：{"recommendedIds": ["id1", "id2", "id3"]}\n3. 数量控制在3-5个之间`;

        if (isLlmAvailable() && !downgradeRef.current) {
          try {
            const recRace = await Promise.race([
              streamYanChat({ message: recommendPrompt, conversationId: yanConversationId },
                (chunk, fullText, convId) => { setYanConversationId(convId); }),
              new Promise(resolve => setTimeout(() => resolve(null), 4000)),
            ]);
            if (recRace && recRace.text) {
              recordCost(recommendPrompt.length, recRace.text.length);
              try {
                const jsonMatch = recRace.text.match(/\{[^}]+\}/);
                if (jsonMatch) {
                  const parsed = JSON.parse(jsonMatch[0]);
                  if (Array.isArray(parsed.recommendedIds) && parsed.recommendedIds.length > 0) {
                    const validIds = parsed.recommendedIds.filter(id =>
                      existingAgents.some(a => a.id === id)
                    );
                    // R2 Fix: 即使后端返回推荐，也用「任务分派·镜」三重匹配二次校验/排序，防止减肥问题乱推荐职场老兵/讼师
                    const backendPickedAgents = validIds.map(id => existingAgents.find(a => a.id === id)).filter(Boolean);
                    const rerankedIds = taskAssignerMatchAgents(
                      userInput,
                      backendPickedAgents.length > 0 ? backendPickedAgents : existingAgents,
                      5
                    );
                    // 合并（后端+本地重排），去重后取前5
                    recommendedAgentIds = [...new Set([...rerankedIds, ...validIds])].slice(0, 5).filter(id =>
                      existingAgents.some(a => a.id === id)
                    );
                  }
                }
              } catch (e) {
                console.warn('[推荐智囊] JSON解析失败:', e);
              }
            }
          } catch (e) {
            // 429/网络失败：不阻断流程，走下方本地匹配兜底
            console.warn('[推荐智囊] LLM失败，走本地匹配兜底:', (e && e.message) ? e.message : e);
          }
        }

        if (recommendedAgentIds.length === 0) {
          // 系统Agent·任务分派·镜：三重匹配（话题→stance→name+tags），不再乱slice前4个，避免减肥问题推荐职场老兵/讼师
          recommendedAgentIds = taskAssignerMatchAgents(userInput, existingAgents, Math.min(4, existingAgents.length));
        }

        setFloatTip('演 · 正在构思新维度智囊...');
        const genPrompt = `用户的问题是：「${userInput}」\n用户背景上下文：${userContext || '（无）'}\n\n现有智囊池：\n${agentInfoStr}\n\n请你作为「演」，判断：现有智囊的视角是否已经足够覆盖这个问题场景？如果存在明显缺失的视角（例如用户问健身选私教还是自学，但没有"健身教练"视角；用户问亲子教育，没有"家长"视角等），请动态生成1-2个全新的「新维度智囊」加入候选池。\n\n要求：\n1. 返回 JSON 数组格式：[{"id":"gen_xxx","name":"名称","stance":"XX视角","desc":"一句描述","color":"十六进制颜色","trigram":"一个八卦符号如☰☵等"}]\n2. id 必须以 gen_ 开头，后面跟有意义的英文缩写，不要和现有 ID 重复\n3. 每个新智囊的 name、stance、desc 要独特，不要和现有智囊重复\n4. color 从以下调色板中选：#C88848,#508870,#A87898,#5078A8,#C86848,#48A898,#A84848,#685888\n5. trigram 从以下选一个：☰☷☳☴☵☲☶☱\n6. 如果觉得现有智囊视角已足够，返回空数组 [] 即可\n7. 只输出 JSON，不要其他解释文字`;

        if (isLlmAvailable() && !downgradeRef.current) {
          try {
            const genRace = await Promise.race([
              streamYanChat({ message: genPrompt, conversationId: yanConversationId },
                (chunk, fullText, convId) => { setYanConversationId(convId); }),
              new Promise(resolve => setTimeout(() => resolve(null), 5000)),
            ]);
            if (genRace && genRace.text) {
              recordCost(genPrompt.length, genRace.text.length);
              try {
                const jsonMatch = genRace.text.match(/\[[\s\S]*\]/);
                if (jsonMatch) {
                  const parsed = JSON.parse(jsonMatch[0]);
                  if (Array.isArray(parsed)) {
                    generatedAgents = parsed
                      .filter(a => a && a.id && a.id.startsWith('gen_'))
                      .slice(0, 2)
                      .map(a => ({
                        id: a.id,
                        name: a.name || '新维度智囊',
                        stance: a.stance || '新视角',
                        desc: a.desc || '',
                        color: a.color || '#A87898',
                        glow: a.color || '#A87898',
                        trigram: a.trigram || '☯',
                        icon: a.trigram || '☯',
                        role: 'dynamic',
                        isGenerated: true,
                      }));
                  }
                }
              } catch (e) {
                console.warn('[新维度智囊] JSON解析失败:', e);
              }
            }
          } catch (e) {
            // 429/网络失败：跳过新维度生成，不影响后续
            console.warn('[新维度智囊] LLM失败，跳过:', (e && e.message) ? e.message : e);
          }
        }

      } catch (e) {
        console.warn('[智囊遴选] 整体失败:', e);
      } finally {
        setFloatTip(null);
      }

      inf.recommendedAgentIds = recommendedAgentIds;
      inf.generatedAgents = generatedAgents;
      if (generatedAgents.length > 0) {
        inf.agents = [...(inf.agents || []), ...generatedAgents];
      }

      setInference(inf);
      setPhase('agent_select');

      // B6: 默认不预选，不再「全部都召唤出来」。只有从历史推演恢复时，才会保留用户上次的选择。
      const preSelected = new Set();
      try {
        // 只有自定义Agent明确标记 _preSelected=true（来自历史恢复）才默认选中
        const customAgents = (getCustomAgents() || []);
        customAgents.forEach(cidOrAgent => {
          const cid = typeof cidOrAgent === 'string' ? cidOrAgent : cidOrAgent.id;
          const match = (inf.agents || []).find(a => a.id === cid);
          if (match && match._preSelected) preSelected.add(cid);
        });
      } catch (e) { console.warn('custom agent preselect error:', e); }
      setSelectedAgentIds(preSelected);
      setAwaitingUser(true);
      return;
    }

    if (phase === 'yan_analyze') {
      return;
    }

    // C2: agent_debate 阶段——如果用户输入了文字（currentResponse.trim().length>0），视为「补充追问/给Agent补充信息」
    // 不直接切下一位Agent，而是让所有Agent（或@到的那一位）基于补充信息再回复一轮，用户可以无限聊下去，想停就点「跳过到总结」
    if (phase === 'agent_debate' && inference && inference.agents) {
      const userSupplement = currentResponse.trim();
      if (userSupplement.length > 0) {
        const agents = inference.agents;
        // ★ Q4-5 修复：更严格的 @mention 匹配
        // 1) 支持「@老中医你觉得呢」（没有空格）、「@风 我想问...」（中间有空格）
        // 2) 任意位置 @，不限定在开头
        const mentionMatchAll = [...userSupplement.matchAll(/@([^\s，。！？、,.!?@#$%^&*()（）【】\[\]'""]+)/g)];
        const mentionNames = mentionMatchAll.map(m => m[1]).filter(Boolean);
        const mentionName = mentionNames[0] || null;

        // ★ Q5.2 风格分流：检测用户是要「建议」还是「追问」
        // 用户说「你觉得呢/给我建议/怎么办/怎么做/帮我看看/出个主意/我该选哪个/推荐哪个」→ advice 模式（给出建议，别反问）
        // 否则默认 inquiry 模式（澄清追问，继续问清楚）
        const sLow = userSupplement.toLowerCase();
        const isAdviceIntent = /觉得|建议|怎么办|怎么做|支招|主意|推荐|选哪个|该选|帮我|给我|方案|意见|看法|说下|说说|分析|判断|到底|结果/.test(sLow);
        const replyIntent = isAdviceIntent ? 'advice' : 'inquiry';

        // ★ 只要 @mention 命中了 >=1 个 agent，其他 agent 一律不准回复（解决「我和风说话，老兵也回了」）
        let targetAgents = agents;
        if (mentionNames.length > 0) {
          const matched = agents.filter(a =>
            mentionNames.some(n => String(a.name).includes(n) || String(a.id).includes(n) || String(a.stance || '').includes(n))
          );
          if (matched && matched.length > 0) targetAgents = matched;
        }

        // 追加用户输入到对话历史 —— @mention 命中时只写入目标 agent 的历史，避免其他 agent 被触发
        setAgentDialogues(prev => {
          const history = { ...(prev.history || {}) };
          const newPrev = { ...prev, history };
          const agentsToWrite = targetAgents;
          for (const a of agentsToWrite) {
            const arr = history[a.id] || [];
            history[a.id] = [...arr, `【你补充】${userSupplement}`];
            newPrev[a.id] = `【你补充】${userSupplement}`;
          }
          newPrev.yan = mentionName
            ? `（你追问了 @${mentionName}，Ta 正在斟酌${isAdviceIntent ? '建议' : '回复'}…）`
            : `（你补充了信息，诸位智囊正在重新斟酌${isAdviceIntent ? '建议方案' : '澄清思路'}…）`;
          const yanHistory = history.yan || [];
          history.yan = [...yanHistory, newPrev.yan];
          return newPrev;
        });

        setCurrentResponse('');
        setFloatTip(mentionName
          ? `@${mentionName} 正在斟酌${isAdviceIntent ? '建议' : '回复'}…`
          : `诸位智囊正在斟酌${isAdviceIntent ? '建议方案' : '补充意见'}…`);

        try {
          const qType = detectQuestionType(userInput);
          const supplementQuestion = `${userInput}\n\n【用户补充说明】${userSupplement}`;

          // ★ T7：currentCommit（落笔本心）注入辩论上下文（异常安全）
          let safeCommitTxt = '';
          try {
            const raw = String(currentCommit || '').trim();
            if (raw && raw.length >= 2 && raw.length <= 200) safeCommitTxt = raw;
          } catch (_) { safeCommitTxt = ''; }

          const onAgentComplete = (agentId, text, success, error, source) => {
            const agentName = targetAgents.find(a => a.id === agentId)?.name || agentId;
            let replyText = '';
            if (success && text) {
              replyText = sanitizeLLMText(String(text).trim());
            }
            // ★ T5：补充辩论失败时也明确显示失败占位，不要直接 return 不写 UI
            if (!success || !replyText) {
              const why = (error && typeof error === 'string') ? error.replace(/[。！？!?\.]+$/, '') : '网络或服务超时';
              replyText = `「${agentName}」本次生成失败（${why}），请点重试按钮再试一次。`;
              setAgentErrors(prev => ({ ...(prev || {}), [agentId]: { agentName, error: why || '生成失败', needRetry: true } }));
              setShowAgentErrorModal(true);
            }
            setAgentDialogues(prev => {
              const history = { ...(prev.history || {}) };
              const arr = history[agentId] || [];
              history[agentId] = [...arr, replyText];
              return { ...prev, [agentId]: replyText, history };
            });
          };
          const onErr = (errs) => {
            console.warn('[agent_debate 追问补充] 部分智囊失败:', errs);
            if (errs && Object.keys(errs).length > 0) {
              setAgentErrors(prev => ({ ...(prev || {}), ...errs }));
              setShowAgentErrorModal(true);
            }
          };
          // ★ Q4-5 + Q5.2：传入 targetAgents（@ 时只给被@的）和 intent（advice/inquiry 分流，
          //   注意：options.intent 是对象(给重排用)，options.replyIntent 是字符串(给风格分流用)，
          //   之前把 replyIntent 塞到 intent 字段，会导致 reorderAgentsByIntent 接字符串报错）
          await generateDialoguesForAgents(
            supplementQuestion, targetAgents, qType, onAgentComplete, onErr, supplementQuestion,
            {
              round: (debateRound || 1) + 1,
              intent: { decisionStructure: qType },
              replyIntent,
              commitText: safeCommitTxt,
            }
          );
          setInfoProgress(prev => Math.min(95, prev + 10));
        } catch (e) {
          // ★ T5：补充阶段抛异常时也不要本地填内容，明确标失败 + 打开重试
          console.warn('[agent_debate 追问补充] 真实LLM失败，交由用户重试:', e.message);
          const errMsg = e?.message || '未知错误';
          try {
            targetAgents.forEach((a) => {
              const placeholder = `「${a.name || a.id}」本次生成失败（${errMsg}），请点重试按钮再试一次。`;
              setAgentDialogues(prev => {
                const history = { ...(prev.history || {}) };
                const arr = history[a.id] || [];
                history[a.id] = [...arr, placeholder];
                return { ...prev, [a.id]: placeholder, history };
              });
            });
            const allE = {};
            targetAgents.forEach(a => { allE[a.id] = { agentName: a.name || a.id, error: errMsg, needRetry: true }; });
            setAgentErrors(prev => ({ ...(prev || {}), ...allE }));
            setShowAgentErrorModal(true);
          } catch (e2) {
            console.warn('[agent_debate 追问补充] 异常处理失败:', e2.message);
          }
        } finally {
          setFloatTip(null);
          setAwaitingUser(true);
          return;
        }
      }
    }

    if (!inference) return;

    const agents = inference.agents;
    const dialogues = inference.agentDialogues;
    const currentIdx = activeAgentIdx;
    const currentAgent = agents[currentIdx];

    const userAnswer = currentResponse.trim();
    if (userAnswer && currentIdx >= 0) {
      const agentId = currentAgent.id;
      setAgentDialogues(prev => {
        const history = { ...(prev.history || {}) };
        const arr = history[agentId] || [];
        history[agentId] = [...arr, `【你】${userAnswer}`];
        return { ...prev, [agentId]: `【你】${userAnswer}`, history };
      });
      setCurrentResponse('');
    }

    setAwaitingUser(false);

    const dialogueHistory = [];
    if (currentIdx >= 0) {
      const agentHistory = agentDialogues.history?.[currentAgent.id] || [];
      dialogueHistory.push(...agentHistory);
    }

    // A4 Fix: 每个 Agent 最多只允许 1 次「反问用户」，避免死循环（没有 userAnswer 就直接下一位）
    // 如果 userAnswer 为空 → 直接切下一位 Agent，不再触发追问
    // 如果当前 Agent 的 history 里已经有 ≥1 条非用户（Agent）发言 → 不再追加追问，防止重复 fallback
    const agentHistoryArr = (currentIdx >= 0 && currentAgent?.id)
      ? (agentDialogues.history?.[currentAgent.id] || [])
      : [];
    const agentNonUserMsgs = agentHistoryArr.filter(h => !String(h).startsWith('【你】'));
    const allowAgentAskBack = userAnswer.length > 0 && agentNonUserMsgs.length <= 1;

    if (allowAgentAskBack && currentIdx >= 0 && currentIdx < agents.length - 1) {
      const JUDGE_TIMEOUT_MS = 5000;
      let continueResult = { continueAsking: false, nextQuestion: '' };
      try {
        const raceRes = await Promise.race([
          judgeContinueAsking(currentAgent, userInput, dialogueHistory, userAnswer),
          new Promise(resolve => setTimeout(() => resolve(null), JUDGE_TIMEOUT_MS)),
        ]);
        if (raceRes && typeof raceRes === 'object') continueResult = raceRes;
      } catch (e) { console.warn('[judgeContinueAsking] error, use fallback:', e.message); }

      if (!continueResult.continueAsking || !continueResult.nextQuestion || continueResult.nextQuestion.length < 4) {
        const stance = (currentAgent?.stance || '').replace(/视角/g, '') || currentAgent?.name || '智囊';
        const core = userInput.slice(0, 16);
        const fallbackQs = [
          `作为${stance}视角，我想追问一句：关于「${core}」，你最担心出状况的环节是哪一个？`,
          `如果最坏情况发生，你有什么后手？（若暂时没有，也可告诉我你当下最笃定的点。）`,
          `此事成功与否，对你的影响是长期还是短期？你愿意为它付出多大代价？`,
          `除了眼前的选项，你心里有没有那个"如果有就好了"的第三种可能？`,
        ];
        const kws = _detectKeywordsLocal(userInput);
        if (kws.length > 0) {
          fallbackQs.push(`刚才你提到${kws.slice(0,2).join('、')}——这几项里，真正卡住你的，是哪一项？`);
        }
        const idx = Math.min((currentIdx * 7 + stance.length + core.length) % fallbackQs.length, fallbackQs.length - 1);
        continueResult = { continueAsking: true, nextQuestion: fallbackQs[idx] };
      }

      // A4 Fix: 防重复追加——如果 fallback 的 nextQuestion 和当前 Agent 近 3 条历史发言有重复，就不追加
      const nextQClean = String(continueResult?.nextQuestion || '').trim();
      const alreadyExists = nextQClean && agentHistoryArr.some(h => {
        const hClean = String(h).trim();
        if (hClean === nextQClean) return true;
        // 相似度检测：长度差 ≤10 且共享 6 字以上连续片段
        if (Math.abs(hClean.length - nextQClean.length) <= 10) {
          for (let i = 0; i + 6 <= nextQClean.length; i++) {
            if (hClean.includes(nextQClean.slice(i, i + 6))) return true;
          }
        }
        return false;
      });

      if (continueResult.continueAsking && continueResult.nextQuestion && !alreadyExists) {
        const nextQuestion = continueResult.nextQuestion;
        setAgentDialogues(prev => {
          const history = { ...(prev.history || {}) };
          const arr = history[currentAgent.id] || [];
          history[currentAgent.id] = [...arr, nextQuestion];
          return { ...prev, [currentAgent.id]: nextQuestion, history };
        });
        setAwaitingUser(true);
        return;
      }
    }

    if (currentIdx < agents.length - 1) {
      const nextIdx = currentIdx + 1;
      const t = setTimeout(() => {
        setActiveAgentIdx(nextIdx);
        const dialogue = dialogues[agents[nextIdx].id] || '...';
        setAgentDialogues(prev => {
          const history = { ...(prev.history || {}) };
          const existing = history[agents[nextIdx].id] || [];
          if (existing.includes(dialogue)) {
            return prev;
          }
          history[agents[nextIdx].id] = [...existing, dialogue];
          return { ...prev, [agents[nextIdx].id]: dialogue, history };
        });
        setAwaitingUser(true);
      }, 800);
      stageTimersRef.current.push(t);
    } else {
      setAwaitingUser(false);

      // ★ 修复：外层超时必须 > generateYanSummary 内部超时，否则后端慢响应时外层先超时，
      //   返回默认空话而非本地降级总结。后端 LLM 20s+，放宽到 30s 确保真实总结能完成。
      const YAN_SUMMARY_TIMEOUT = 30000;
      let yanSummary = null;
      try {
        const p = generateYanSummary(userInput, agentDialogues || {}, agents);
        const race = await Promise.race([
          p,
          new Promise(resolve => setTimeout(() => resolve(null), YAN_SUMMARY_TIMEOUT)),
        ]);
        if (race && race.summary) {
          yanSummary = race;
        }
      } catch (e) {
        console.warn('[yanSummary] 后端总结失败，降级本地总结汇总之策:', e.message);
      }

      if (!yanSummary || !yanSummary.summary) {
        // 系统Agent·总结汇总·策：后端不可达时本地降级总结，不再抛错
        const localSummary = summaryComposerLocalSummary({
          question: userInput,
          clarifies: yanQuestionRounds,
          agentReplies: [agentDialogues],
          agents: agents,
        });
        yanSummary = {
          summary: localSummary.finalText,
          keyPoints: [...localSummary.divergences.slice(0, 2), ...localSummary.consensus.slice(0, 2)],
          structured: localSummary,
          source: 'local_summary_composer',
        };
      }

      // R4 Fix: 保证最终 summary 一定有内容，不再给 error 级别的兜底文案
      const safeSummary = yanSummary?.summary || (summaryComposerLocalSummary({
        question: userInput, clarifies: yanQuestionRounds,
        agentReplies: [agentDialogues], agents: agents,
      }).finalText);
      setInference(prev => ({ ...(prev || {}), summary: safeSummary }));

      const rawReview = _computeMirrorReview(agents, agentDialogues, caseFile, debateConvergence, userInput);
      let finalReview = rawReview;
      try {
        if (!downgradeRef.current && isLlmAvailable()) {
          const reviewCacheKey = makeCacheKey('mirror_review', caseFile || { question: userInput }, { agentsCount: agents.length, round: debateRound });
          const cachedReview = getCached(reviewCacheKey);
          if (cachedReview) {
            finalReview = cachedReview;
          } else {
            const reviewPrompt = `请基于以下信息，以「镜渊·反省审查官」的口吻（沉稳、直指本质、不煽情），润色三段反省。保留条目数量与顺序不变，仅润色措辞，不要使用【】符号、不要使用 Markdown 符号，也不要加 emoji/图标，用自然中文序号即可。\n\n分歧：\n${rawReview.divergences.map((d, i) => `${i + 1}. ${d}`).join('\n')}\n\n共识：\n${rawReview.consensus.map((d, i) => `${i + 1}. ${d}`).join('\n')}\n\n盲点：\n${rawReview.blindspots.map((d, i) => `${i + 1}. ${d}`).join('\n')}\n\n输出格式：依次输出三段标题（"关于分歧"/"已达成的共识"/"未被提及的盲点"）加冒号换行，每段条目用数字序号，段落之间空一行；不使用任何括号、图标、方框等装饰性符号。`;
            const reviewLLM = await Promise.race([
              (async () => {
                try {
                  const r = await streamYanChat({
                    message: reviewPrompt,
                    conversationId: yanConversationId
                  }, () => {});
                  return r?.text || null;
                } catch { return null; }
              })(),
              new Promise(resolve => setTimeout(() => resolve(null), 3500)),
            ]);
            if (reviewLLM && reviewLLM.length > 20) {
              const parsed = parseMirrorLLM(reviewLLM, rawReview);
              finalReview = parsed;
              recordCost(reviewPrompt.length, reviewLLM.length);
              setCached(reviewCacheKey, parsed);
            }
          }
        }
      } catch (e) { console.warn('[mirrorReview LLM润色失败，用原生]', e.message); }
      setMirrorReview(finalReview);

      const consensusScore = debateConvergence?.consensusScore ?? 0.6;
      const isDivergent = !debateConvergence?.converged || consensusScore < 0.6;
      const reflectDelay = (yanSummary.source === 'local' || !debateConvergence?.converged)
        ? (isDivergent ? 2500 : 1600)
        : (isDivergent ? 6500 : 4300);
      const reflectingText = isDivergent
        ? sanitizeLLMText(`诸位的分歧颇大,各执一词。\n${yanSummary.keyPoints?.join('、') || '各方视角,碰撞激烈'}\n分歧之中,常藏真意。让我再细加梳理……`)
        : sanitizeLLMText(`诸位所议,皆有道理。\n${yanSummary.keyPoints?.join('、') || '各方视角,各有见地'}\n听罢,让我再思量一卦……`);

      const t1 = setTimeout(() => {
        setPhase('reflecting');
        setActiveAgentIdx(-1);
        setShowQuestion(false);
        setAgentDialogues(prev => ({
          ...prev,
          yan: reflectingText,
          history: { ...(prev.history || {}), yan: [...((prev.history || {}).yan || []), reflectingText] },
        }));
      }, 800);
      const t2 = setTimeout(() => {
        setPhase('summary');
        let summaryText = sanitizeLLMText(yanSummary.summary || `诸位各抒己见,我已梳理完毕。\n此局无定论,关键在你自己。\n请做出你的抉择。`);
        try {
          const pattern = detectChoicePattern();
          if (pattern.hint) {
            summaryText = `${summaryText}\n\n——\n${sanitizeLLMText(pattern.hint)}`;
          }
        } catch (e) { /* noop */ }

        const jingyuanIntro = sanitizeLLMText(buildJingyuanIntroText(finalReview));
        setAgentDialogues(prev => {
          const nextHistory = { ...(prev.history || {}) };
          nextHistory.yan = [...(nextHistory.yan || []), summaryText];
          const existingJY = nextHistory.jingyuan || [];
          nextHistory.jingyuan = [...existingJY, jingyuanIntro];
          return {
            ...prev,
            yan: summaryText,
            jingyuan: jingyuanIntro,
            history: nextHistory,
          };
        });
        setAwaitingUser(true);
      }, reflectDelay);
      stageTimersRef.current.push(t1, t2);
    }
  }, [activeAgentIdx, inference, currentResponse, userInput, agentDialogues, debateConvergence, yanConversationId, yanQuestionRounds, appendYanDialogue, appendUserToYanHistory, caseFile, debateRound, downgradeRef, clarifyRound, MAX_CLARIFY_ROUNDS, phase]);

  const handleConfirmCaseFile = useCallback((editedCF) => {
    return;
  }, []);

  const handleBackFromCaseFile = useCallback(() => {
    setPhase('yan_analyze');
    const last = yanQuestionRounds[yanQuestionRounds.length - 1];
    if (last?.question) {
      appendYanDialogue(last.question, last.questionBy === '演' ? 'llm' : 'preset');
    }
    setAwaitingUser(true);
  }, [yanQuestionRounds, appendYanDialogue]);

  const handleToolStart = useCallback((agentId, tools) => {
    setToolCallState({ agentId, tools, currentTool: null, results: [], status: 'calling' });
  }, []);
  const handleToolCall = useCallback((agentId, tool, params) => {
    setToolCallState(prev => prev.agentId === agentId
      ? { ...prev, currentTool: tool, status: 'calling' }
      : prev);
  }, []);
  const handleToolResult = useCallback((agentId, tool, summary, status) => {
    setToolCallState(prev => prev.agentId === agentId
      ? { ...prev, results: [...prev.results, { tool, summary, status }] }
      : prev);
  }, []);
  const toolCallbacks = useMemo(() => ({
    onToolStart: handleToolStart,
    onToolCall: handleToolCall,
    onToolResult: handleToolResult,
  }), [handleToolStart, handleToolCall, handleToolResult]);

  const handleConfirmAgents = useCallback(async () => {
    if (!inference) return;
    // A3 Fix: 全量 Agent 池合并，保证所有选中的（含市集临时选择、未订阅市集、订阅、自制）都能匹配到
    // 优先级：自制 > 订阅 > 后端 inference.agents > 后端 perspectivePool > 全局市集 getMarketAgents()
    const customAgentsList = getCustomAgents() || [];
    const marketAgentsGlobal = (() => {
      try { return getMarketAgents() || []; } catch (e) { console.warn('[handleConfirmAgents] 读取市集Agent失败', e.message); return []; }
    })();
    const allAgentsWithDup = [
      ...customAgentsList,                  // 自制 + 订阅（优先级最高，id 冲突时保留）
      ...(inference.agents || []),          // 后端生成的推演 Agent
      ...(inference.perspectivePool || []), // 后端视角池
      ...marketAgentsGlobal,                // 市集全量（兜底，保证用户临时选的市集 Agent 也能匹配）
    ];
    // 双重去重：1) id 唯一 2) name+stance 组合唯一（解决"市集+官方"双份同角色问题）
    const seenIds = new Set();
    const seenNameStance = new Set();
    const allAgents = [];
    for (const a of allAgentsWithDup) {
      if (!a || !a.id || !a.name || !a.stance) continue;  // 关键属性必须存在，防 null.current
      if (seenIds.has(a.id)) continue;
      const nsKey = `${String(a.name).trim()}::${String(a.stance).trim()}`;
      if (seenNameStance.has(nsKey)) continue;
      seenIds.add(a.id);
      seenNameStance.add(nsKey);
      allAgents.push(a);
    }
    const selectedIdsArr = Array.from(selectedAgentIds);
    console.debug('[handleConfirmAgents] 选中ID debug:', {
      selectedAgentIds: selectedIdsArr,
      allAgentIds: allAgents.map(a => a.id),
    });
    const selected = allAgents.filter(a => {
      const origId = a.id || '';
      let hit = false;
      // A3/R3/R4 Fix: 兼容四重 ID 匹配（原始ID / 带 __n 后缀 / 市集 marketId 映射 / sub_ 前缀订阅）
      for (const sid of selectedIdsArr) {
        if (!sid) continue;
        if (sid === origId) { hit = true; break; }
        // uniqueId 后缀匹配
        if (sid.startsWith(origId + '__')) { hit = true; break; }
        if (origId.startsWith(sid + '__')) { hit = true; break; }
        // 市集 marketId / originMarketId 匹配（市集 Agent id = market_xxx，订阅后变成 sub_xxx）
        if ((a.marketId && a.marketId === sid) || (a.originMarketId && a.originMarketId === sid)) { hit = true; break; }
        // sub_ 前缀 / market_ 前缀互换匹配
        const sidClean = String(sid).replace(/^sub_/, '').replace(/^market_/, '');
        const origClean = origId.replace(/^sub_/, '').replace(/^market_/, '');
        if (sidClean === origClean) { hit = true; break; }
      }
      return hit;
    });
    // R3/R4 Fix: 如果一个都没匹配到，尝试用任务分派·镜按问题类型从 inference.agents 中兜底选3个，不要停在「请至少选一位」
    if (selected.length === 0) {
      console.warn('[handleConfirmAgents] 选中ID和候选池ID未匹配，自动兜底选3位:', {
        selectedAgentIds: selectedIdsArr,
        candidateIds: allAgents.map(a => a.id),
      });
      const fallbackFromRec = (inference.agents || []).filter(a =>
        Array.isArray(inference.recommendedAgentIds) && inference.recommendedAgentIds.includes(a.id)
      );
      if (fallbackFromRec.length > 0) {
        selected.push(...fallbackFromRec.slice(0, 4));
      } else {
        const autoPickedIds = taskAssignerMatchAgents(userInput, inference.agents || [], 3);
        const autoPicked = autoPickedIds.map(id => (inference.agents || []).find(a => a.id === id)).filter(Boolean);
        if (autoPicked.length >= 1) {
          selected.push(...autoPicked);
        }
      }
      if (selected.length === 0) {
        setFloatTip('请至少选择一位智囊');
        return;
      }
      // 自动把兜底选中的ID同步回 selectedAgentIds，保证状态一致
      setSelectedAgentIds(prev => {
        const next = new Set(prev);
        selected.forEach(a => next.add(a.id));
        return next;
      });
    }
    // 赛博算命仪式 B：把合局的 agent 再做一次按卦象打分，写入 cyberGua.agentRecommendedIds（仅用于仪式产物展示，不改变用户选择）
    if (selected.length > 0 && cyberGua?.gua) {
      try {
        const rec = recommendAgentsByGua(selected, userInput, cyberGua.gua, Math.min(3, selected.length));
        const pickIds = (rec?.topK || []).map(a => a?.id).filter(Boolean);
        setCyberGua(prev => prev ? { ...prev, agentRecommendedIds: pickIds, agentRationale: rec?.rationale || '' } : prev);
      } catch (e) { console.warn('[cyber ritual] agentRec 注入失败', e.message); }
    }
    setInference(prev => prev ? { ...prev, agents: selected } : { agents: selected });
    setAwaitingUser(false);

    clearTimers();
    setPhase('agent_debate');
    setActiveAgentIdx(0);
    setFloatTip('智囊正在斟酌发言…');

    const question = userInput;
    const qType = detectQuestionType(question);
    const newDialogues = {};
    const callResults = {};
    let hasErrors = false;
    let allErrors = {};

    // D2: 生产级信息打通 —— 把澄清阶段（yanQuestionRounds）收集到的所有问答历史，100% 合成到上下文里
    // 不管是后端生成还是本地降级，所有 Agent 发言都能用到用户说过的「实习租房 / 西二旗 / 2000预算 / 通勤1小时」这些具体信息
    const clarifiedHistoryText = (() => {
      if (!Array.isArray(yanQuestionRounds) || yanQuestionRounds.length === 0) return inference?.userContext || '';
      const lines = [];
      yanQuestionRounds.forEach((r, i) => {
        if (!r) return;
        const q = String(r.question || '').trim();
        const a = String(r.userAnswer || '').trim();
        if (q) lines.push(`澄清 Q${i+1}：${q}`);
        if (a) lines.push(`澄清 A${i+1}：${a}`);
      });
      return lines.join('\n');
    })();
    const userContextFull = clarifiedHistoryText
      ? `【用户原问题】${question}\n\n【澄清阶段收集到的背景信息（智囊必须用上）】\n${clarifiedHistoryText}`
      : question;

    setToolCallState({ agentId: null, tools: [], currentTool: null, results: [], status: 'idle' });

    const onAgentComplete = (agentId, text, success, error, source, collaboration) => {
      // ★ T5 修复：单个失败时用占位失败文本明确告诉用户失败了，不假装成功；也不丢 UI 块
      if (success) {
        newDialogues[agentId] = text;
      } else {
        const agentName = selected.find(a => a.id === agentId)?.name || agentId;
        const why = (error && typeof error === 'string') ? error.replace(/[。！？!?\.]+$/, '') : '网络或服务超时';
        newDialogues[agentId] = `「${agentName}」本次生成失败（${why}），请点重试按钮再试一次。`;
      }
      callResults[agentId] = { success, error, source, collaboration };
      if (!success) {
        hasErrors = true;
        allErrors[agentId] = {
          agentName: selected.find(a => a.id === agentId)?.name || agentId,
          error: error || '未知错误',
          needRetry: true,
        };
      }
      setInference(prev => prev ? { ...prev, agentDialogues: { ...newDialogues } } : { agentDialogues: newDialogues });
      setToolCallState(prev => prev.agentId === agentId ? { ...prev, status: 'done' } : prev);
    };

    const onError = (errors) => {
      setAgentErrors(errors);
      setShowAgentErrorModal(true);
    };

    // ★ 修复：多Agent辩论改为【每个Agent独立计时】，不再用整体 race。
    // 用户要求"每次说话之后回答的计时"，而非整体时间。
    // generateDialoguesForAgents 内部已对每个 Agent 单独 45s 超时（getAgentDialogueWithTimeout），
    // 单个 Agent 失败只跳过它自己，其他 Agent 继续走真实 LLM → 实现"单次降级"而非整体降级。
    // 外层不再设整体超时，杜绝"一个慢 → 全部降级模板"。

    const localPresetDialogues = () => {
      // 仅最后兜底（极端情况）用；单 Agent 失败 / 后端不可达时：走"明确失败 + 用户重试"，不再静默本地填充
      selected.forEach((a, i) => {
        const prevReplies = Object.values(newDialogues).filter(Boolean);
        newDialogues[a.id] = localGenerateAgentReply(a, userContextFull, prevReplies, 0);
        callResults[a.id] = { success: true, source: 'local_natural_degraded', collaboration: null };
      });
      setInference(prev => prev ? { ...prev, agentDialogues: { ...newDialogues } } : { agentDialogues: newDialogues });
    };

    if (isBackendCircuitOpen()) {
      // ★ T5：后端网络不可达——像豆包一样明确提示"网络不可达"，不要本地填内容假装成功
      console.warn('[handleConfirmAgents] 后端已断路，明确标记失败并交由用户重试');
      const circuitErr = '网络不可达或服务暂不可用';
      selected.forEach((a) => {
        newDialogues[a.id] = `「${a.name || a.id}」生成失败（${circuitErr}），请点重试按钮再试一次。`;
        callResults[a.id] = { success: false, error: circuitErr, source: 'failed_circuit_open', collaboration: null, needRetry: true };
        allErrors[a.id] = { agentName: a.name || a.id, error: circuitErr, needRetry: true };
      });
      hasErrors = true;
      setInference(prev => prev ? { ...prev, agentDialogues: { ...newDialogues } } : { agentDialogues: newDialogues });
      setDebateRound(1);
      setDebateConvergence({ converged: false, consensusScore: 0 });
    } else {
      try {
        // D2: 后端也注入澄清上下文，不再传 inference.userContext（可能是空），而是传合成后的 userContextFull
        const mergedContext = clarifiedHistoryText || inference?.userContext || '';

        // ★ T1 修复：第一轮也做意图判断（之前只有 handleSupplementDebate 做过导致第一轮风格分流失效）
        const qLow = String(question || '').toLowerCase();
        const isAdviceIntent = /觉得|建议|怎么办|怎么做|支招|主意|推荐|选哪个|该选|帮我|给我|方案|意见|看法|说下|说说|分析|判断|到底|结果/.test(qLow) || /(建议|主意)/.test(qLow);
        const firstReplyIntent = isAdviceIntent ? 'advice' : 'inquiry';

        // ★ T7：currentCommit（落笔本心）注入辩论上下文
        let safeCommitTxt = '';
        try {
          const raw = String(currentCommit || '').trim();
          if (raw && raw.length >= 2 && raw.length <= 200) safeCommitTxt = raw;
        } catch (_) { safeCommitTxt = ''; }

        // 内部单Agent独立计时（45s超时跳过单个），整体自然结束，不设外层race
        const result = await generateDialoguesForAgents(question, selected, qType, onAgentComplete, onError, mergedContext, {
          round: 1,
          toolCallbacks,
          intent: { decisionStructure: detectQuestionType(question) },
          replyIntent: firstReplyIntent,
          commitText: safeCommitTxt,
        });
        if (result && result.blackboard) {
          debateBlackboardRef.current = result.blackboard;
          debateMentionQueueRef.current = result.mentionQueue || [];
          const convergence = detectConvergenceFromBlackboard(result.blackboard, { currentRound: 1 });
          setDebateRound(1);
          setDebateConvergence(convergence);
        } else {
          setDebateRound(1);
          setDebateConvergence({ converged: true, consensusScore: 0.7 });
        }
      } catch (e) {
        // ★ T5：catch 到异常（ReferenceError 等）——不要本地填内容，明确标失败 + 打开重试
        console.warn('[handleConfirmAgents] 后端辩论异常，标记失败交由用户重试:', e.message);
        const errMsg = e?.message || '未知错误';
        selected.forEach((a) => {
          if (!newDialogues[a.id] || !callResults[a.id]?.success) {
            newDialogues[a.id] = `「${a.name || a.id}」生成失败（${errMsg}），请点重试按钮再试一次。`;
            callResults[a.id] = { success: false, error: errMsg, source: 'failed_exception', collaboration: null, needRetry: true };
            allErrors[a.id] = { agentName: a.name || a.id, error: errMsg, needRetry: true };
          }
        });
        hasErrors = true;
        setInference(prev => prev ? { ...prev, agentDialogues: { ...newDialogues } } : { agentDialogues: newDialogues });
        setDebateRound(1);
        setDebateConvergence({ converged: false, consensusScore: 0 });
      }
    }

    if (hasErrors && Object.keys(allErrors).length > 0) {
      setAgentErrors(allErrors);
      setShowAgentErrorModal(true);
    }

    setFloatTip(null);

    // ★ 关键修复：selected 数组为空时直接返回，防止 selected[0] 是 undefined 导致的 .current null 错误
    if (!Array.isArray(selected) || selected.length === 0) {
      setFloatTip('请至少选择一位智囊后再试');
      setAwaitingUser(true);
      return;
    }
    const firstAgent = selected[0];
    if (!firstAgent || !firstAgent.id) {
      setFloatTip('智囊数据异常，请重新选择');
      setAwaitingUser(true);
      return;
    }
    const firstDialogue = newDialogues[firstAgent.id] || '此问需细思，先辨明真意所在。';
    setAgentDialogues(prev => {
      const history = { ...(prev.history || {}) };
      const existing = history[firstAgent.id] || [];
      if (existing.includes(firstDialogue)) return prev;
      history[firstAgent.id] = [...existing, { text: firstDialogue, source: callResults[firstAgent.id]?.source || 'preset' }];
      return { ...prev, [firstAgent.id]: firstDialogue, history };
    });
    setAwaitingUser(true);
  }, [inference, selectedAgentIds, userInput, clearTimers, toolCallbacks]);

  const handleRunAnotherRound = useCallback(async () => {
    if (!inference || !inference.agents) return;
    const selected = inference.agents;
    const nextRound = debateRound + 1;
    if (nextRound > MAX_DEBATE_ROUNDS) return;

    setAwaitingUser(false);
    setActiveAgentIdx(0);
    setFloatTip(`第 ${nextRound} 轮辩论中…`);

    const question = userInput;
    const qType = detectQuestionType(question);
    const newDialogues = {};
    const callResults = {};
    const existingBlackboard = debateBlackboardRef.current;
    const existingMentionQueue = debateMentionQueueRef.current;

    // D2: 第二轮辩论也注入澄清历史（yanQuestionRounds），保证上下文贯穿始终
    const clarifiedHistoryText = (() => {
      if (!Array.isArray(yanQuestionRounds) || yanQuestionRounds.length === 0) return inference?.userContext || '';
      const lines = [];
      yanQuestionRounds.forEach((r, i) => {
        if (!r) return;
        const q = String(r.question || '').trim();
        const a = String(r.userAnswer || '').trim();
        if (q) lines.push(`澄清 Q${i+1}：${q}`);
        if (a) lines.push(`澄清 A${i+1}：${a}`);
      });
      return lines.join('\n');
    })();
    const mergedContext = clarifiedHistoryText || inference?.userContext || '';

    setToolCallState({ agentId: null, tools: [], currentTool: null, results: [], status: 'idle' });

    const onAgentComplete = (agentId, text, success, error, source, collaboration) => {
      newDialogues[agentId] = text;
      callResults[agentId] = { success, error, source, collaboration };
      setInference(prev => prev ? { ...prev, agentDialogues: { ...(prev.agentDialogues || {}), [agentId]: text } } : prev);
      setToolCallState(prev => prev.agentId === agentId ? { ...prev, status: 'done' } : prev);
    };

    const result = await generateDialoguesForAgents(
      question, selected, qType, onAgentComplete, undefined, mergedContext,
      { existingBlackboard, existingMentionQueue, round: nextRound, toolCallbacks }
    );
    setAgentCallResults(prev => ({ ...prev, ...callResults }));

    if (result.blackboard) {
      debateBlackboardRef.current = result.blackboard;
      debateMentionQueueRef.current = result.mentionQueue || [];
      const convergence = detectConvergenceFromBlackboard(result.blackboard, { currentRound: nextRound });
      setDebateRound(nextRound);
      setDebateConvergence(convergence);
    }

    const firstId = selected[0]?.id;
    if (firstId && newDialogues[firstId]) {
      setAgentDialogues(prev => {
        const history = { ...(prev.history || {}) };
        for (const a of selected) {
          const t = newDialogues[a.id];
          if (t) {
            const arr = history[a.id] || [];
            history[a.id] = [...arr, { text: t, source: callResults[a.id]?.source || 'preset', round: nextRound }];
          }
        }
        return { ...prev, [firstId]: newDialogues[firstId], history };
      });
    }

    setFloatTip(null);
    setAwaitingUser(true);
  }, [inference, userInput, debateRound, toolCallbacks]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const handleChoiceClick = useCallback(async (choice, index) => {
    // A5 Fix: choice 空值兜底，防止最终选择环节直接报错
    const safeChoice = choice || {
      label: '遵从本心 · 顺势而为',
      icon: '☰',
      stance: '综合决策',
      idx: index ?? 0,
    };
    setSelectedChoice(safeChoice);
    // 赛博算命仪式 C：三变定局 step0：进入三忌三要勾选面板（而非直接到 path_reveal）
    setPhase('sanbian');
    setQinian(prev => ({ ...(prev||{}), sanBianStep: 0, sanJiChecked: [false,false,false], sanYaoChecked: [false,false,false] }));
    setAwaitingUser(true);
    setFateContent(null);
    setFateRevealed(false);
    // 三变之前，先把三变对象 + 逆卦 + 签语 + 符命 + 符文准备好（纯函数无IO，稳定）
    try {
      const q = String(userInput || '').trim() || safeChoice.label;
      const c = cyberGua?.gua || (inference?.gua ? { id: 14, gua: inference.gua.gua, element: inference.gua.element } : { id: 14, gua: '大有', element: '火' });
      const ags = Array.isArray(activeAgents) ? activeAgents.filter(a => a && a.role !== 'master') : [];
      const sanBian = buildSanBian(q, c, ags);
      const poemTr = buildSignPoemAndTranslate({ gua: c, topic: q, choice: safeChoice, core: sanBian?.core || '顺势而为', yongShen: cyberGua?.yongShenObj?.label || '本我', agents: ags });
      const fs16 = buildFateSign16(q, c, safeChoice, sanBian?.core || '顺势而为');
      const runeSvg = buildActionRuneSvg(fs16, c, safeChoice);
      const niGuaTag = (() => {
        const ni = (c.id != null) ? getGuaByIdx(63 - (c.id - 1)) : null;
        return ni ? `逆卦·${ni.gua}（${ni.trigram || ''} ${ni.element || ''}行）` : '逆卦·未明';
      })();
      setCyberGua(prev => prev ? { ...prev, sanBian, poem: poemTr.poem, poemTranslate: poemTr.translate, core: sanBian?.core || '顺势而为', fateSign16: fs16, runeSvg, niGuaTag } : { sanBian, poem: poemTr.poem, poemTranslate: poemTr.translate, core: sanBian?.core || '顺势而为', fateSign16: fs16, runeSvg, niGuaTag });
    } catch (e) { console.warn('[cyber ritual] prepare 失败', e.message); }
    setAgentDialogues(prev => {
      const realGua = inference?.gua;
      const realVerse = inference?.verse;
      const summary = realGua
        ? `路将分，先做三变定局。\n三忌三要，两径抉择，皆在你手。\n卦成${realGua.gua}（${realGua.element}行），辞曰「${realVerse || '此中深意，待你细品'}」。\n择「${safeChoice.label}」之前，先把三枚铜钱压在纸上。`
        : `路将分，先做三变定局。\n三忌三要，两径抉择，皆在你手。\n择「${safeChoice.label}」之前，先把本心落在纸上。`;
      return {
        ...prev,
        yan: summary,
        history: { ...(prev.history || {}), yan: [...((prev.history || {}).yan || []), summary] },
      };
    });

    try {
      const realGua = inference?.gua;
      const guaName = realGua?.gua || safeChoice.gua || '大有';
      const trigram = realGua?.trigram || safeChoice.icon || '☰';
      const element = realGua?.element || safeChoice.element || '火';

      // ★★★ P4 命牌重做：融入本次推演真实数据，不再用 qLow 匹配通用模板
      //   所有内容从以下真实来源抽取：
      //     - 用户问题（question）
      //     - 智囊真实发言（agentDialogues.history）
      //     - 演总结的共识/分歧（inference.summary/options）
      //     - 用户选择的路径（safeChoice.label）
      const buildLocalFateCard = (p) => {
        const { choiceLabel, question } = p;
        const cleanTxt = (s) => sanitizeLLMText(String(s || '').replace(/\s+/g, ' ').trim());

        // ===== 数据源 1：从 agentDialogues.history 提取本次智囊真实发言（每人一句，最长 28 字） =====
        const agentSnippets = [];
        try {
          const hist = (agentDialogues?.history) || {};
          for (const a of (activeAgents || [])) {
            if (!a || a.role === 'master') continue;
            const arr = Array.isArray(hist[a.id]) ? hist[a.id] : [];
            if (arr.length === 0) continue;
            const last = arr[arr.length - 1];
            const raw = typeof last === 'string' ? last : (last?.text || '');
            const t = cleanTxt(raw);
            if (!t) continue;
            const firstSent = t.split(/[。？！!?\n]/)[0] || t.slice(0, 30);
            const snippet = firstSent.length > 26 ? firstSent.slice(0, 26) + '…' : firstSent;
            agentSnippets.push({ name: a.name, stance: a.stance || a.perspective || '智囊', snippet });
          }
        } catch (_) {}

        // ===== 数据源 2：从 inference.summary 文本中提取共识/分歧片段（做辅助备用） =====
        let summaryLines = [];
        try {
          if (typeof inference?.summary === 'string' && inference.summary.length > 20) {
            const raw = cleanTxt(inference.summary);
            summaryLines = raw.split(/\n/).map(s => s.trim()).filter(Boolean);
          } else if (typeof inference === 'object' && inference.consensus && Array.isArray(inference.consensus)) {
            summaryLines = inference.consensus.map(c => cleanTxt(c)).filter(Boolean);
          }
        } catch (_) {}

        // ===== 数据源 3：问题中提取的具体关键词（让锦囊/禁忌切题） =====
        const qLow = String(question || '').toLowerCase();
        const qShort = cleanTxt(question).slice(0, 20) || '此局';

        // ===== 择路 Day1-Day7：结合选择的 choiceLabel + 问题场景定制 =====
        const choiceMapKeyword = {
          '抓住机会': '先占位再补漏洞',
          '谨慎兜底': '先兜住最坏情况再说',
          '先做最小一步': '先迈出最小的一步再说',
          '保持现状再等等': '等信号到齐再决策',
          '规避风险': '先把风险写在纸上',
          '稳守当前': '先把当下的事做到位',
          '探索新路': '先做 30 天小范围试验',
        };
        const choiceHint = choiceMapKeyword[choiceLabel] || '依本心，按所选，走下去';

        const zhelu = [
          `Day 1：把「${qShort}」和你的选择「${choiceLabel}」写在纸上，贴冰箱或电脑旁。今晚念一遍，不摇摆。`,
          `Day 2：完成锦囊第 1 条。今天就做，不等到"条件成熟"——${choiceHint}。`,
          `Day 3：找 1 个这次没参与推演、但你信任的人聊 15 分钟，只说事实，不要问 TA "我该怎么办"。`,
          `Day 7：复盘——智囊说的 3 个提醒，哪 1 条已经应验？哪 1 条你还没做？没做的今天补。`,
        ];

        // ===== 锦囊 3 条：优先从智囊真实发言中抽取，不足再按问题场景补 =====
        const jinNangFromAgents = agentSnippets
          .filter(s => /做|先|今天|立刻|马上|试试|可以|建议|应该|写|聊|算|约|找|走|迈出|动|开始|别等/.test(s.snippet))
          .map(s => `${s.name}说的「${s.snippet}」——今天就做`)
          .slice(0, 2);

        const sceneBasedJinNang = (() => {
          if (/减|肥|健身|健康|睡|饮食|运动|血压|血糖|体检/.test(qLow)) {
            return [
              '今晚提早 30 分钟睡，手机放客厅不进卧室',
              '明天少喝 1 杯甜饮，晚饭主食减 1/4，不挨饿',
              '接下来 7 天，每天出门走 20 分钟，认真走，不听播客',
            ];
          }
          if (/工作|offer|职|辞|跳槽|创业|老板|晋升|事业|合伙|加班/.test(qLow)) {
            return [
              '写"想要/不要"各 6 条，第一反应，不改',
              '要走的今天就更新简历前 1/3：自我介绍+最近 2 个项目数字',
              '约 1 位前辈/猎头聊 1 小时，不带情绪，只问事实',
            ];
          }
          if (/爱|分手|对象|恋爱|伴侣|感情|喜欢|婚|表白|相亲|出轨|异地/.test(qLow)) {
            return [
              '写在纸上：TA 一辈子这样，我能接受吗？Yes/No+3 条理由',
              '有诉求当面说 3 句：我想要/我需要/如果…就…，不抱怨',
              '3 天不主动发消息，看 TA 找不找你、说什么',
            ];
          }
          if (/钱|买|房|租|股|投|基金|理财|预算|成本|价|消费|贷款|首付|借钱/.test(qLow)) {
            return [
              '算清楚：这笔钱全亏，能不能撑 6 个月基本生活',
              '在纸上写 1 条具体退路，不写清楚不推进',
              '分 3 批进、分 3 个月做，不一把梭哈',
            ];
          }
          if (/学|考|研|留学|申|毕业|专业|学校|考试|读书|证书|英语|面试/.test(qLow)) {
            return [
              '今天做 1 件最小的事：报名 / 买课本 / 写 100 字陈述',
              '本周约 1 位学长学姐聊 30 分钟：最满意 1 件+最不满意 1 件',
              '写 90 天计划：每天几分？什么时候？不做的惩罚？',
            ];
          }
          return [
            '写 3 条：最坏结果？能接受吗？最好结果？',
            '找一个无关的人聊 15 分钟，只说事实，不问怎么办',
            '定决策 Deadline：24h/3 天/7 天，到点必选，选完不回头',
          ];
        })();

        // 合并：先放智囊的真实话，再用场景模板补到 3 条
        let jinNang = [...jinNangFromAgents];
        for (const s of sceneBasedJinNang) {
          if (jinNang.length >= 3) break;
          jinNang.push(s);
        }
        jinNang = jinNang.slice(0, 3);
        while (jinNang.length < 3) jinNang.push('把"为什么选这个"写 3 条理由在纸上，不删不改');

        // ===== 禁忌 3 条：优先从风险视角的发言中抽取，不足再按场景补 =====
        const jinJiFromAgents = agentSnippets
          .filter(s => /不要|别|小心|风险|最坏|不能|禁止|别做|千万别|别等|别信/.test(s.snippet) || s.stance?.includes('风险') || s.name === '风眼')
          .map(s => `✗ 别像${s.name}提醒的那样：${s.snippet}`)
          .slice(0, 2);

        const sceneBasedJinJi = (() => {
          if (/减|肥|健身|健康|睡|饮食|运动/.test(qLow)) {
            return [
              '✗ 不要办年卡再开始，先做 7 天再说',
              '✗ 不要每天称体重，一周 1 次最多',
              '✗ 不要同时改 3 件事，先改最容易的 1 件',
            ];
          }
          if (/工作|offer|职|辞|跳槽|创业|老板/.test(qLow)) {
            return [
              '✗ 不在同事面前抱怨或说"我要走了"，传出去就被动',
              '✗ 不拿梦想面子加分，只看钱、人、成长三个客观项',
              '✗ 不裸辞，存款<18 个月生活费就骑驴找马',
            ];
          }
          if (/爱|分手|对象|恋爱|感情|婚|表白|出轨|异地/.test(qLow)) {
            return [
              '✗ 不说"你再不改就分手"——说过 3 次的直接走，不说第 4 次',
              '✗ 23 点后不做感情决定，不翻聊天记录截图',
              '✗ 不拿"我付出了那么多"当理由，沉没成本不是本金',
            ];
          }
          if (/钱|买|房|租|股|投|基金|理财|预算|成本|贷款|首付/.test(qLow)) {
            return [
              '✗ 不加杠杆、不借钱、不动父母/婚房/救命钱，碰一条=从投资变赌',
              '✗ 不信非掏钱的人的"建议"——朋友小红书群聊，一律别信',
              '✗ 3 天内不决定，过完 1 个周末再说',
            ];
          }
          if (/学|考|研|留学|申|毕业|学校|考试|证书|面试/.test(qLow)) {
            return [
              '✗ 不问"现在准备还来得及吗"，除了 1 周后要考的，都来得及',
              '✗ 不花 30h 做计划买装备找攻略，翻 1 页书比这强',
              '✗ 不和别人比进度，只和 3 个月前的自己比',
            ];
          }
          return [
            '✗ 不在凌晨 0-8 点做决策，原始脑只会怕和逃',
            '✗ 不同时问 5 个人同一件事，问 2 个真正懂的就够',
            '✗ 不说"我再想想"，没新信息想超过 1 周就是逃避',
          ];
        })();

        let jinJi = [...jinJiFromAgents];
        for (const s of sceneBasedJinJi) {
          if (jinJi.length >= 3) break;
          // 防止智囊抽取的和场景重复
          if (!jinJi.some(existing => existing.length > 5 && s.length > 5 &&
            (existing.includes(s.slice(4, 10)) || s.includes(existing.slice(4, 10))))) {
            jinJi.push(s);
          }
        }
        jinJi = jinJi.slice(0, 3);
        while (jinJi.length < 3) jinJi.push('✗ 不做让你半夜会醒的决定；醒了就减到你睡得着的仓位');

        // ===== 回溯 3 个时间点：结合问题类型定制 =====
        let huiShuo;
        if (/减|肥|健身|健康|睡|饮食|运动/.test(qLow)) {
          huiShuo = [
            '【第 7 天问自己】：锦囊 3 条，哪 1 条让我身体立刻有了变化？（精神/睡眠/食欲）',
            '【第 30 天问自己】：体重/指标没动，但我的精神状态和身体感觉，比 30 天前好吗？——好 = 对的',
            '【第 90 天问自己】：这件事成了习惯，还是又回去了？——能坚持 > 数字好看',
          ];
        } else if (/工作|offer|职|辞|跳槽|创业|老板|晋升/.test(qLow)) {
          huiShuo = [
            '【3 个月后问自己】：当初最怕的那件事发生了吗？没发生 → 其实是焦虑；发生了 → 我怎么扛过来的',
            '【1 年后问自己】：简历上因为这次选择，多了什么分量的章节？——多 1 条就值',
            '【3 年后问自己】：这次选择教会了我什么？——选对/选错都值得，只要教会了',
          ];
        } else if (/爱|分手|对象|恋爱|感情|婚|表白|出轨|异地/.test(qLow)) {
          huiShuo = [
            '【第 14 天问自己】：选完以后我睡得着吗？——睡得着 = 对的；睡不着 = 再想想',
            '【半年后问自己】：想到 TA 的时候，第一反应是笑还是叹气？——笑 = 选对了',
            '【3 年后问自己】：如果今天重来一次，我还会这样选吗？——答案就是答案',
          ];
        } else if (/钱|买|房|租|股|投|基金|理财|贷款|首付/.test(qLow)) {
          huiShuo = [
            '【第 1 个周末过完】：周末冷静下来想的，和工作日一样吗？——一样再推进',
            '【3 个月后问自己】：这笔账现在回头算，最大的隐性成本是什么？当时想到了吗？',
            '【1 年后问自己】：睡不着的夜晚多了还是少了？——仓位是否让你睡得着，是唯一的上限',
          ];
        } else {
          huiShuo = [
            '【第 7 天问自己】：智囊提醒的 3 个点，哪 1 条已经应验？哪 1 条我还没做？',
            '【3 个月后问自己】：当初最纠结的那个瞬间，今天看其实多余吗？——下次别纠结超过 1 周',
            '【1 年后问自己】：这次选择让我变成了什么样的人？——成长 = 真正的收获',
          ];
        }

        const guaMap = {
          '抓住机会': { n: '大有卦', t: '☰', e: '火', v: '火在天上，大有。君子以遏恶扬善，顺天休命。' },
          '谨慎兜底': { n: '谦卦', t: '☷', e: '地', v: '地中有山，谦。君子以裒多益寡，称物平施。' },
          '先做最小一步': { n: '复卦', t: '☳', e: '雷', v: '雷在地中，复。先王以至日闭关，商旅不行，后不省方。' },
          '保持现状再等等': { n: '艮卦', t: '☶', e: '山', v: '兼山，艮。君子以思不出其位。' },
          '规避风险': { n: '坎卦', t: '☵', e: '水', v: '习坎，有孚，维心亨。行有尚，往有功。' },
          '稳守当前': { n: '艮卦', t: '☶', e: '山', v: '兼山，艮。君子以思不出其位。' },
          '探索新路': { n: '巽卦', t: '☴', e: '风', v: '随风，巽。君子以申命行事。' },
        };
        const g = guaMap[choiceLabel] || { n: `${p.guaName || '大有'}卦`, t: p.trigram || '☰', e: p.element || '火', v: p.verse || '一卦方成，万象在掌。' };

        // keyPoints：从锦囊 + 选项中取，保证面板有内容
        const optsLabels = Array.isArray(inference?.options) ? inference.options.map(o => cleanTxt(o.label)).filter(Boolean) : [];
        const kp = [
          ...jinNang.slice(0, 2),
          ...optsLabels.slice(0, 2),
        ].filter(Boolean);

        // ===== 解签 explain：6 段式完整结构，加入本次推演摘要 =====
        // 「本次推演摘要」段：把智囊真实引用 + 共识/分歧摘要放进来，让命牌和这次推演直接关联
        const sessionBlock = (() => {
          const lines = [];
          lines.push(`【本次推演】问题：${qShort}${qShort.length >= 20 ? '…' : ''}`);
          if (agentSnippets.length > 0) {
            lines.push(`  智囊 ${agentSnippets.length} 位列席：${agentSnippets.slice(0, 5).map(s => `${s.name}（${s.stance}）`).join(' / ')}`);
          }
          // 每人放一句原话，真实感
          for (const s of agentSnippets.slice(0, 3)) {
            lines.push(`  · ${s.name}：${s.snippet}`);
          }
          if (summaryLines.length > 0) {
            const firstConsensus = summaryLines.find(l => l.length >= 8 && l.length <= 50) || summaryLines[0];
            if (firstConsensus) lines.push(`  共识参考：${firstConsensus.slice(0, 44)}`);
          }
          lines.push(`  你最终选择的路：${choiceLabel} —— ${choiceHint}`);
          return lines.join('\n');
        })();

        const explain = [
          sessionBlock,
          '',
          `【择 · 路】「${choiceLabel}」—— 接下来 7 天这样做：`,
          ...zhelu.map(s => `  ${s}`),
          '',
          `【锦 · 囊】3 条今天就做的小事：`,
          ...jinNang.map((s, i) => `  (${i + 1}) ${s}`),
          '',
          `【禁 · 忌】3 个别踩的坑：`,
          ...jinJi.map(s => `  ${s}`),
          '',
          `【回 · 溯】检验答案的 3 个时间点：`,
          ...huiShuo,
        ].join('\n');

        // summary：放在 FateCardPanel「终局」那一块，30-50 字，含这次推演的关键词
        const agentNames = agentSnippets.length > 0
          ? agentSnippets.slice(0, 3).map(s => s.name).join('、')
          : '诸位智囊';
        const summary = `此局问「${qShort}」，${agentNames}共论，分歧之后你择「${choiceLabel}」。今卦得「${g.n}」(${g.e}行)，前路谨记锦囊，勿踩禁忌，且行且验。`;

        return {
          error: false, errorMessage: '',
          verse: g.v, verseFull: `${g.t} · ${g.n} · ${g.e}行\n「${g.v}」`,
          guaName: g.n, trigram: g.t, element: g.e,
          summary,
          choiceLabel,
          keyPoints: kp.length ? kp : [choiceHint, '本心所向', '且行且验'],
          explanation: explain,
          jinNang, jinJi, zhelu, huiShuo,
          // ★ 额外写入 FateCardPanel 可以直接读的字段，让面板各区块内容不重复
          userQuestion: cleanTxt(question),
          agentSnippets,
          consensusHint: summaryLines.find(l => l.length >= 8 && l.length <= 80) || '',
          divergenceHint: (() => {
            const d = summaryLines.find(l => /分歧|风险派|机会派|离场|留场/.test(l));
            return d || '';
          })(),
          editable: true, source: 'local_fate_v3_context_aware',
        };
      };

      // ★ 修复：整体 12s 超时保护（内部 fetch 3+3+5=11s），防止后端慢响应导致命牌一直 loading
      //   generatePersonalizedCardContent 内部 catch 已改为返回降级结果（不 throw），
      //   所以外层 race 基本不会超时，此处仅作最终兜底
      const personalized = await Promise.race([
        generatePersonalizedCardContent({
          question: userInput,
          guaName,
          choiceLabel: safeChoice.label,
          agentDialogues: agentDialogues || {},
          trigram,
        }),
        new Promise(resolve => setTimeout(() => resolve(null), 12000)),
      ]);
      if (personalized && typeof personalized === 'object' && personalized.verse) {
        // 后端结果 + 本地 6 段式字段合并，防止后端太单薄
        setFateContent({
          ...buildLocalFateCard({ guaName, trigram, element, choiceLabel: safeChoice.label, question: userInput }),
          ...personalized,
          verse: personalized.verse,
          summary: personalized.summary || `今择「${safeChoice.label}」，是你的真心所向。`,
          source: personalized.source || 'backend_augmented',
        });
      } else {
        setFateContent(buildLocalFateCard({ guaName, trigram, element, choiceLabel: safeChoice.label, question: userInput }));
      }
    } catch (e) {
      console.warn('[命牌生成] 后端失败，启用系统Agent·策 本地 6 段式命牌:', e.message);
      const realGua = inference?.gua;
      const choiceLabel = safeChoice.label;
      const cleanTxt = (s) => sanitizeLLMText(String(s || '').replace(/\s+/g, ' ').trim());
      const qShort = cleanTxt(userInput).slice(0, 20) || '此局';
      const qLow = String(userInput || '').toLowerCase();

      // 简化版同样要抽智囊原话（catch 时 agentDialogues 仍可用）
      const agentSnippets = [];
      try {
        const hist = (agentDialogues?.history) || {};
        for (const a of (activeAgents || [])) {
          if (!a || a.role === 'master') continue;
          const arr = Array.isArray(hist[a.id]) ? hist[a.id] : [];
          if (arr.length === 0) continue;
          const last = arr[arr.length - 1];
          const raw = typeof last === 'string' ? last : (last?.text || '');
          const t = cleanTxt(raw);
          if (!t) continue;
          const firstSent = t.split(/[。？！!?\n]/)[0] || t.slice(0, 28);
          const snippet = firstSent.length > 24 ? firstSent.slice(0, 24) + '…' : firstSent;
          agentSnippets.push({ name: a.name, stance: a.stance || '智囊', snippet });
        }
      } catch (_) {}

      // 锦囊/禁忌：catch 分支直接用问题场景模板，不依赖其他状态
      const jinNang = /减|肥|健身|健康|睡|饮食|运动|血/.test(qLow)
        ? ['今晚提早 30 分睡，手机放客厅', '明天少喝 1 杯甜饮，晚饭主食减 1/4', '接下来 7 天，每天出门走 20 分钟']
        : /工作|offer|职|辞|跳槽|创业|老板|晋升/.test(qLow)
          ? ['今天写"想要/不要"各 6 条，第一反应不改', '要走的话：更新简历前 1/3（自我介绍+项目数字）', '约 1 位前辈/猎头聊 1 小时，只问事实']
          : /爱|分手|对象|恋爱|感情|婚|表白|相亲|出轨|异地/.test(qLow)
            ? ['写：TA 一辈子这样，我能接受吗？Yes/No+3 条理由', '当面说 3 句具体诉求：我想要/我需要/如果…就…', '3 天不主动发消息，看 TA 找不找你']
            : /钱|买|房|租|股|投|基金|理财|成本|贷款|首付/.test(qLow)
              ? ['算：这笔钱全亏，我能不能撑 6 个月基本生活', '写 1 条具体退路在纸上，不写不推进', '分 3 批分 3 个月做，不一把梭哈']
              : /学|考|研|留学|申|毕业|学校|考试|证书|面试/.test(qLow)
                ? ['今天做 1 件最小的事：报名/买课本/写 100 字陈述', '本周约 1 位学长学姐聊 30 分钟', '写 90 天计划：每天几分？什么时候？不做的惩罚？']
                : ['写最坏/最好/最可能 3 条结果', '找 1 个无关的人聊 15 分钟，只说事实不问怎么办', '定 Deadline：24h/3 天/7 天，到点必选'];
      const jinJi = /减|肥|健身|健康|睡|饮食|运动/.test(qLow)
        ? ['✗ 不办年卡再开始，先做 7 天', '✗ 不每天称体重，一周最多 1 次', '✗ 不同时改 3 件事，先改最容易的 1 件']
        : /工作|offer|职|辞|跳槽|创业|老板/.test(qLow)
          ? ['✗ 不在同事面前抱怨或说"我要走了"', '✗ 不拿梦想面子给自己加分，只看钱、人、成长', '✗ 不裸辞，存款<18 个月生活费就骑驴找马']
          : /爱|分手|对象|恋爱|感情|婚|出轨|异地/.test(qLow)
            ? ['✗ 不说第 4 次"你再不改就分手"，说过 3 次的直接走', '✗ 23 点后不做感情决定，不翻聊天截图', '✗ 不拿"我付出了那么多"当留下的理由']
            : /钱|买|房|租|股|投|基金|理财|贷款|首付/.test(qLow)
              ? ['✗ 不加杠杆/借钱/动父母婚房救命钱，碰一条=赌', '✗ 不信非掏钱人的建议，朋友小红书群聊一律别信', '✗ 3 天内不做决定，过完 1 个周末再说']
              : /学|考|研|留学|申|毕业|学校|考试/.test(qLow)
                ? ['✗ 不问"现在准备还来得及吗"，除了 1 周后要考的都来得及', '✗ 不花 30h 做计划买装备，翻 1 页书比这强', '✗ 不和别人比进度，只和 3 个月前的自己比']
                : ['✗ 不在凌晨 0-8 点做决策', '✗ 不同时问 5 个人同一件事，问 2 个真正懂的就够', '✗ 不说"我再想想"，没新信息想超过 1 周就是逃避'];

      const zhelu = [
        `Day 1：把「${qShort}」和你选的「${choiceLabel}」写在纸上，贴在眼前。`,
        'Day 2：完成锦囊第 1 条。不等到"条件成熟"，今天就做。',
        'Day 3：找一个没参与这次推演、你信任的人聊 15 分钟，只说事实。',
        'Day 7：复盘——智囊提醒的 3 个点，哪 1 条已经应验？哪 1 条还没做？',
      ];
      const huiShuo = [
        '【3 个月后】当初最怕的那件事发生了吗？没发生=其实是焦虑；发生了=你怎么扛的',
        '【1 年后】因为这次选择，你身上多了什么有分量的新东西？——多 1 条就值',
        '【3 年后】当初纠结 1 个月的这件事，今天还重要吗？——不重要的，当初就该纠结不超过 1 周',
      ];
      const agentNames = agentSnippets.length > 0
        ? agentSnippets.slice(0, 3).map(s => s.name).join('、')
        : '诸位智囊';
      const sessionLines = [];
      sessionLines.push(`【本次推演】问题：${qShort}${qShort.length >= 20 ? '…' : ''}`);
      if (agentSnippets.length > 0) {
        sessionLines.push(`  智囊 ${agentSnippets.length} 位列席：${agentSnippets.slice(0, 5).map(s => `${s.name}（${s.stance}）`).join(' / ')}`);
      }
      for (const s of agentSnippets.slice(0, 3)) {
        sessionLines.push(`  · ${s.name}：${s.snippet}`);
      }
      sessionLines.push(`  你最终选择的路：${choiceLabel}`);

      const sessionBlock = sessionLines.join('\n');
      const explanation = [
        sessionBlock,
        '',
        `【择 · 路】「${choiceLabel}」—— 接下来 7 天：`,
        ...zhelu.map(s => `  ${s}`),
        '',
        `【锦 · 囊】3 条今天就做：`,
        ...jinNang.map((s, i) => `  (${i + 1}) ${s}`),
        '',
        `【禁 · 忌】3 个别踩的坑：`,
        ...jinJi.map(s => `  ${s}`),
        '',
        `【回 · 溯】检验答案的 3 个时间点：`,
        ...huiShuo,
      ].join('\n');

      const summary = `此局问「${qShort}」，${agentNames}共论之后你择「${choiceLabel}」。前路谨记锦囊，勿踩禁忌，且行且验，答案在你脚下。`;
      const keyPoints = [
        ...jinNang.slice(0, 2),
        ...(Array.isArray(inference?.options) ? inference.options.map(o => cleanTxt(o.label)).filter(Boolean) : []),
      ].slice(0, 4);

      setFateContent({
        error: false, errorMessage: '',
        verse: '一卦方成，万象在掌。\n一念起时，天地皆响。',
        jinNang, jinJi, zhelu, huiShuo,
        explanation,
        summary,
        choiceLabel,
        keyPoints: keyPoints.length ? keyPoints : ['本心所向', '顺势而为'],
        guaName: realGua?.gua || safeChoice.gua || '大有',
        trigram: realGua?.trigram || safeChoice.icon || '☰',
        editable: true, source: 'local_fate_v3_simple_context',
        userQuestion: cleanTxt(userInput),
        agentSnippets,
        consensusHint: '',
        divergenceHint: '',
      });
    }

    const t = setTimeout(() => {
      setAwaitingUser(true);
    }, 4500);
    stageTimersRef.current.push(t);

    // ★ P3 长期记忆：用户选完命牌后写入本地记忆层（演就记得了）
    try {
      const pickedAgents = Array.isArray(inference?.agents)
        ? inference.agents.filter(a => a.role !== 'master').map(a => String(a.name || '').trim()).filter(Boolean)
        : [];
      appendYanMemory({
        question: userInput,
        questionType,
        choiceLabel: safeChoice?.label,
        selectedAgentNames: pickedAgents,
        fateSummary: fateContent?.summary || safeChoice?.label,
        fateKeyPoints: fateContent?.keyPoints || [],
        ts: Date.now(),
      });
    } catch (memErr) {
      console.warn('[longTermMemory] 写入失败:', memErr.message);
    }
  }, [inference, userInput, currentCommit, agentDialogues, yanQuestionRounds, questionType]);

  const handleRevealFate = useCallback(() => {
    setAwaitingUser(false);
    setFateRevealed(true);      // 点击"揭示命签"时才让浮起命牌出现
    setPhase('final');
    // ★ 再写一次 final 阶段的记忆，补上 fateContent（命牌内容）
    try {
      appendYanMemory({
        question: userInput,
        questionType,
        choiceLabel: selectedChoice?.label,
        fateContent: fateContent || null,
        phase: 'final',
      });
    } catch (memErr) {
      console.warn('[longTermMemory] final 写入失败:', memErr.message);
    }
  }, [userInput, questionType, selectedChoice, fateContent]);

  const handleShowChoices = useCallback(() => {
    setPhase('committing');
    setAwaitingUser(false);
    setAgentDialogues(prev => {
      const reflectingAck = '卦已成,辞已立。\n在分岔之前,请落笔一句你的本心所向。\n不拘长短,只为后日回看。';
      return {
        ...prev,
        yan: reflectingAck,
        history: { ...(prev.history || {}), yan: [...((prev.history || {}).yan || []), reflectingAck] },
      };
    });
  }, []);

  const handleCommit = useCallback(() => {
    if (currentCommit.trim()) {
      setAgentDialogues(prev => ({
        ...prev,
        history: { ...(prev.history || {}), yan: [...((prev.history || {}).yan || []), `【你 · 决】${currentCommit.trim()}`] },
      }));
      setCurrentCommit('');
    }
    setPhase('oracle_prompt');
    setAgentDialogues(prev => {
      const oracleAsk = '分岔在前,诸路尚未分明。\n——「需为这一卦再投三枚铜钱,借一束天光吗？」\n也许一卦之后,你自然开解。';
      return {
        ...prev,
        yan: oracleAsk,
        history: { ...(prev.history || {}), yan: [...((prev.history || {}).yan || []), oracleAsk] },
      };
    });
  }, [currentCommit]);

  const handleStartOracle = useCallback(() => {
    setPhase('oracle');
    setOracleThrowing(true);
    setOracleResult(null);
    setAwaitingUser(false);
    setTimeout(() => {
      const ORACLE_GUAS = [
        { gua: '乾', trigram: '☰', element: '天', verse: '元亨。利贞。', gloss: '天行健, 君子以自强不息。' },
        { gua: '坤', trigram: '☷', element: '地', verse: '元亨。利牝马之贞。', gloss: '地势坤, 君子以厚德载物。' },
        { gua: '震', trigram: '☳', element: '雷', verse: '亨。震来虩虩, 笑言哑哑。', gloss: '洊雷, 君子以恐惧修省。' },
        { gua: '巽', trigram: '☴', element: '风', verse: '小亨。利有攸往。利见大人。', gloss: '随风, 君子以申命行事。' },
        { gua: '坎', trigram: '☵', element: '水', verse: '习坎, 有孚, 维心亨。', gloss: '习坎, 行有尚。险中可通。' },
        { gua: '离', trigram: '☲', element: '火', verse: '利贞。亨。畜牝牛, 吉。', gloss: '明两作, 大人以继明照四方。' },
        { gua: '艮', trigram: '☶', element: '山', verse: '艮其背, 不获其身。', gloss: '兼山, 止其所也。静观其变。' },
        { gua: '兑', trigram: '☱', element: '泽', verse: '亨。利贞。', gloss: '丽泽, 君子以朋友讲习。' },
      ];
      const r = ORACLE_GUAS[Math.floor(Math.random() * ORACLE_GUAS.length)];
      setOracleResult(r);
      setOracleThrowing(false);
      setInference(prev => ({ ...(prev || {}), gua: { gua: r.gua, trigram: r.trigram, element: r.element }, verse: r.verse, oracleGloss: r.gloss }));
      setAgentDialogues(prev => {
        const oracleResp = `此卦${r.gua}（${r.trigram}·属${r.element}）。\n${r.verse}\n——${r.gloss}\n请将此天光带入分岔。`;
        return {
          ...prev,
          yan: oracleResp,
          history: { ...(prev.history || {}), yan: [...((prev.history || {}).yan || []), oracleResp] },
        };
      });
    }, 1800);
  }, []);

  const handleProceedToChoices = useCallback(() => {
    setPhase('branch_select');
    setAwaitingUser(false);
    setAgentDialogues(prev => ({
      ...prev,
      yan: '卦已成,天光已借。\n分岔在前,请选择你的路径。',
      history: { ...(prev.history || {}), yan: [...((prev.history || {}).yan || []), '卦已成,天光已借。分岔在前,请选择你的路径。'] },
    }));
  }, []);

  const handleSkipOracle = useCallback(() => {
    setPhase('branch_select');
    setAwaitingUser(false);
    setAgentDialogues(prev => {
      const skipMsg = '「也罢。心已明, 便不必再劳烦天机。分岔就在眼前,请择一路。」';
      return {
        ...prev,
        yan: skipMsg,
        history: { ...(prev.history || {}), yan: [...((prev.history || {}).yan || []), skipMsg] },
      };
    });
  }, []);

  const handleAgentClick = useCallback((agent) => {
    setShowHistoryPanel(true);
  }, []);

  const handleSaveToCollection = useCallback(async () => {
    try {
      const fallbackMap = {
        opportunity: { gua: '大有', trigram: '☰', verse: '元亨。柔得尊位,大亨以正。', element: '火', style: '机会型' },
        risk:        { gua: '坎',  trigram: '☵', verse: '习坎,有孚,维心亨。', element: '水', style: '稳健型' },
        stable:      { gua: '艮',  trigram: '☶', verse: '艮其背,不获其身。', element: '山', style: '稳健型' },
        explore:     { gua: '巽',  trigram: '☴', verse: '小亨,利有攸往。', element: '风', style: '机会型' },
      };
      const fb = fallbackMap[selectedChoice?.id] || fallbackMap.opportunity;
      const realGua = inference?.gua;
      const advisors = (activeAgents || []).filter(a => a && a.role !== 'master').map(a => a.name).filter(Boolean);
      const guaName = realGua?.gua || fb.gua;
      const trigram = realGua?.trigram || fb.trigram;
      const choiceLabel = selectedChoice?.label || '抓住机会';

      let personalized = fateContent;
      if (!personalized || !personalized.verse) {
        try {
          personalized = await generatePersonalizedCardContent({
            question: userInput,
            guaName,
            choiceLabel,
            agentDialogues: inference?.agentDialogues || {},
            trigram,
          });
        } catch (e) {
          personalized = { verse: inference?.verse || fb.verse, summary: '', source: 'preset' };
        }
      }

      const agentNotes = (activeAgents || [])
        .filter(a => a && a.role !== 'master')
        .map(a => {
          const arr = inference?.agentDialogues?.history?.[a.id] || inference?.agentDialogues?.[a.id] || [];
          const last = Array.isArray(arr) ? arr[arr.length - 1] : null;
          const text = typeof last === 'string' ? last : (last?.text || '');
          return { id: a.id, name: a.name, color: a.color || '#C8A850', note: (text || '').slice(0, 80) };
        })
        .filter(a => a.note)
        .slice(0, 6);

      const card = {
        id: `card-${Date.now()}`,
        gua: guaName,
        trigram,
        element: realGua?.element || fb.element,
        title: choiceLabel,
        question: userInput,
        decision: choiceLabel,
        style: realGua?.element ? `${realGua.element}行` : fb.style,
        advisors: advisors.length > 0 ? advisors : ['演'],
        verse: personalized.verse || inference?.verse || fb.verse,
        powerfulQuestion: inference?.powerfulQuestion || '',
        framework: inference?.framework || '',
        summary: personalized.summary || inference?.summary || '此卦已入卡牌册,留作后日之镜。',
        cardSource: personalized.source,
        guaElement: realGua?.element || fb.element,
        yanSummary: inference?.summary || personalized.summary || '',
        agentNotes,
        choice: selectedChoice ? { id: selectedChoice.id, label: selectedChoice.label, icon: selectedChoice.icon } : null,
        commit: currentCommit || '',
        date: new Date().toISOString().split('T')[0],
        pillars: (() => {
          const now = new Date();
          const stems = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
          const branches = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
          const pillar = (n) => stems[n % 10] + branches[n % 12];
          return {
            year: pillar(now.getFullYear() + 4),
            month: pillar(now.getMonth() + 1 + now.getFullYear()),
            day: pillar(now.getDate() + (now.getMonth() + 1) * 3),
            hour: pillar(now.getHours() + now.getDate() * 2),
          };
        })(),
        hasAchievement: false,
      };
      const saved = JSON.parse(localStorage.getItem('yance_collection') || '[]');
      saved.unshift(card);
      localStorage.setItem('yance_collection', JSON.stringify(saved));

      try {
        writeL1Card(card);
      } catch (e) { /* noop */ }

      addYanMemory({
        category: 'deduction',
        title: userInput.slice(0, 20) + (userInput.length > 20 ? '...' : ''),
        content: `问题：${userInput}\n决策：${selectedChoice?.label || '未选择'}\n卦象：${card.gua}\n总结：${card.summary.slice(0, 100)}`,
        source: '推演台',
        confidence: 0.8,
      }).catch(e => console.warn('[记忆保存] 失败', e));

      try {
        saveEpisode({
          question: userInput,
          decision: selectedChoice?.label || '未选择',
          hexagram: card.gua || '',
          guaName: card.title || '',
          agents: (inference?.agents || []).map(a => a.id),
          choice: selectedChoice?.id || '',
        });
        inferFactsFromSession({
          question: userInput,
          choice: selectedChoice?.id,
          agents: inference?.agents || [],
        });
      } catch (e) {
        console.warn('[情景记忆保存] 失败', e);
      }

      showFloatTipBriefly(`命签「${card.gua} · ${card.title}」已入卡牌册`, 2400);
    } catch (e) {
      console.warn('保存失败', e);
    }
  }, [selectedChoice, userInput, activeAgents, inference, fateContent, currentCommit, showFloatTipBriefly]);

  const phaseLabel = useMemo(() => {
    try {
      const agents = activeAgents || [];
      const nonMasterAgents = agents.filter(a => a.role !== 'master');
      switch (phase) {
        case 'qinian_mind': return '立卦 · P1 起念数字';
        case 'qinian_tou':   return '立卦 · P2 六投铜钱';
        case 'zhuanggua':   return '立卦 · P3 装卦日志';
        case 'yongshen':    return '立卦 · P4 用神校准';
        case 'casting': return '演 · 起卦 · 投三枚铜钱';
        case 'analyzing': return '演 · 理解问题';
        case 'summoning': return `演 · 召唤顾问 · ${nonMasterAgents.length} 位`;
        case 'clarify_loop': return `演 · 澄清中`;
        case 'yan_analyze': return '演 · 确证关键信息';
        case 'case_file_confirm': return '演 · 请确认结构化档案';
        case 'agent_select': return '演 · 遴选智囊（按卦推合局）';
        case 'agent_debate': return activeAgentIdx >= 0 ? `${nonMasterAgents[activeAgentIdx]?.name || ''} 发言中 · ${activeAgentIdx + 1}/${nonMasterAgents.length}` : '诸智集结';
        case 'reflecting': return '演 · 反思汇聚';
        case 'summary': return '演 · 梳理总结';
        case 'committing': return '演 · 落笔本心';
        case 'oracle_prompt': return '演 · 借天光否';
        case 'oracle': return oracleThrowing ? '演 · 落卦中' : (oracleResult ? `演 · 天机已现 · ${oracleResult.gua}` : '演 · 借天光否');
        case 'branch_select': return '请选择你的路径';
        case 'sanbian': {
          const s = qinianInput?.sanBianStep ?? 0;
          return s === 0 ? '三变 · 一忌' : s === 1 ? '三变 · 二忌' : s === 2 ? '三变 · 三忌' : s === 3 ? '三变 · 一要' : s === 4 ? '三变 · 二要' : s === 5 ? '三变 · 三要' : '三变 · 两径抉择';
        }
        case 'path_reveal': return '路径已定';
        case 'final': return '推演完成';
        default: return '';
      }
    } catch (e) {
      console.warn('[phaseLabel] 生成失败:', e);
      return '';
    }
  }, [phase, activeAgentIdx, activeAgents, oracleThrowing, oracleResult, clarifyRound, MAX_CLARIFY_ROUNDS, qinianInput]);

  const historyCount = useMemo(() => {
    const h = agentDialogues?.history || {};
    return Object.values(h).reduce((sum, arr) => sum + arr.length, 0);
  }, [agentDialogues]);

  const mentionMessages = useMemo(() => {
    const msgs = debateBlackboardRef.current?.messages;
    if (!Array.isArray(msgs)) return [];
    return msgs.filter(m => m && (m.isMention || m.refusalReason));
  }, [debateRound, phase, agentDialogues]);

  const handleSkipClarify = useCallback(async () => {
    if (phase !== 'clarify_loop') return;
    await handleUserAdvance({ forceClarifyStop: true });
  }, [phase, handleUserAdvance]);

  // B5: 辩论阶段「跳过到总结」：直接把 activeAgentIdx 推到最后一位，触发 handleUserAdvance 进演总结
  const handleSkipToSummary = useCallback(async () => {
    if (phase !== 'agent_debate') return;
    const agents = (activeAgents || []).filter(a => a.role !== 'master');
    const lastIdx = agents.length - 1;
    if (activeAgentIdx < lastIdx) {
      setActiveAgentIdx(lastIdx);
      // 等待一帧让 activeAgentIdx 落地，再推进到总结
      await new Promise(r => setTimeout(r, 50));
    }
    await handleUserAdvance({});
  }, [phase, activeAgents, activeAgentIdx, handleUserAdvance]);

  // B5: 辩论自动播放——当开启 debateAutoPlay 且 awaitingUser=true（当前发言播完等用户点）时，延迟 2.2s 自动下一位/总结
  useEffect(() => {
    if (!debateAutoPlay) return;
    if (phase !== 'agent_debate') return;
    if (!awaitingUser) return;

    // 算延迟：按当前发言长度估算阅读时间，最少 2s，最多 5.5s
    const agents = (activeAgents || []).filter(a => a.role !== 'master');
    const agent = agents[activeAgentIdx];
    const text = (agent && agentDialogues?.[agent.id]) || '';
    const textLen = (text || '').length;
    const delayMs = Math.min(5500, Math.max(2200, 1500 + Math.floor(textLen / 20) * 300));

    if (debateAutoTimerRef.current) clearTimeout(debateAutoTimerRef.current);
    // ★ Q1 修复：起始仪式阶段（起念/投钱/装卦/用神/三变/立卦/择智/演问）
    //         绝对不允许 autoPlay 自动推进，必须用户点击底部按钮手动推进
    const LOCKED_AUTO_PLAY = new Set([
      'input','qinian_mind','qinian_tou','zhuanggua','yongshen','sanbian',
      'casting','oracle_prompt','oracle','yan_analyze','agent_select','case_file_confirm','clarify_loop',
      'branch_select','path_reveal','committing','final','reflecting','summary'
    ]);
    if (LOCKED_AUTO_PLAY.has(phase)) return;
    debateAutoTimerRef.current = setTimeout(async () => {
      try {
        await handleUserAdvance({});
      } catch (e) {
        console.warn('[autoPlay advance failed]:', e);
      }
    }, delayMs);

    return () => {
      if (debateAutoTimerRef.current) clearTimeout(debateAutoTimerRef.current);
    };
  }, [debateAutoPlay, phase, awaitingUser, activeAgentIdx, activeAgents, agentDialogues, handleUserAdvance]);

  // ============== 赛博算命仪式：流程节点处理函数 ==============
  // R1: 起念数字（心念 1-100 数字 + 起卦按钮），进入 P2 六投铜钱
  const handleSetMindNum = useCallback((n) => {
    const num = Math.max(1, Math.min(100, parseInt(n,10) || Math.floor(Math.random()*99)+1));
    setQinian({ mindNum: num });
  }, [setQinian]);

  const handleConfirmMindNum = useCallback(() => {
    // ★ P4 修复：qinian_mind 阶段必须用户**显式点「确认落数」**才允许推进
    //         双重锁：① phase 严格是 qinian_mind 才做事；② mindNum 已落数；③ 绝不允许 effect 间接触发 setPhase('qinian_tou') 走这里
    if (phase !== 'qinian_mind') return;
    if (!qinianInput?.mindNum) {
      // 未落数就先补一个（但不自动推进，交给用户再点一次按钮）
      setQinian({ mindNum: Math.floor(Math.random()*99)+1 });
      return;
    }
    setPhase('qinian_tou');
    setQinian(prev => ({ ...prev, sixThrows: [] }));
  }, [phase, qinianInput, setQinian]);

  // R2: 六次真投爻（用户点按钮/真实摇铜钱）
  const handleCastOneCoin = useCallback(() => {
    setQinian(prev => {
      const t = (prev?.sixThrows && Array.isArray(prev.sixThrows)) ? [...prev.sixThrows] : [];
      if (t.length >= 6) return prev;
      const coin = Math.random() < 0.5 ? '字' : '背';
      return { ...prev, sixThrows: [...t, coin] };
    });
  }, [setQinian]);

  const handleResetSixThrows = useCallback(() => setQinian(prev => ({ ...prev, sixThrows: [] })), [setQinian]);

  const handleConfirmSixThrows = useCallback(() => {
    const throws = (qinianInput?.sixThrows && Array.isArray(qinianInput.sixThrows)) ? qinianInput.sixThrows : [];
    if (throws.length !== 6) return;
    const qStr = String(userInput || '此局').trim();
    const seed = generateQinianSeed(qStr, qinianInput?.mindNum || 42, throws);
    // ★ 根因修复：generateQinianSeed 返回 {seed,guaIdx,movingLine,yaoArray}，没有 .gua 属性！通过导出的 getGuaByIdx 拿卦对象
    const allList = allGuaList();
    const guaObj = getGuaByIdx(seed?.guaIdx || 1) || allList?.[0];
    const signId = makeGuaSignId(guaObj?.id || guaObj?.idx || seed?.guaIdx || 1, seed?.movingLine || 1, qinianInput?.mindNum || 42, new Date());
    const zLog = buildZhuangGuaLog(guaObj, seed?.movingLine || 1, seed?.yaoArray || [1,0,1,0,1,0], qStr, signId);
    const yong = buildYongShenConfirm(qStr, guaObj, seed?.movingLine || 1);
    const futie = buildFuTie(guaObj, qStr, signId);
    // ★ D1：六投已定立刻 buildSanBian，生成 A/B 分岔路径（twoPaths）—— 后面 branch_select 阶段要用
    let sanBian = null;
    try { sanBian = buildSanBian(qStr, guaObj, []); } catch(e) { console.warn('[六投] buildSanBian 失败降级', e); }
    setCyberGua({ signId, gua: guaObj, yaoArray: seed?.yaoArray || [], movingLine: seed?.movingLine || 1, zhuangGuaLog: zLog, yongShenObj: yong, fuTie: futie, sanBian });
    // 注入 inference.gua（保证其他老逻辑仍能读到卦）
    setInference(prev => ({ ...(prev||{}), gua: { gua: guaObj?.gua || guaObj?.name || '', trigram: guaObj?.trigram || '', element: guaObj?.element || guaObj?.wuxing || '', id: guaObj?.id || guaObj?.idx || seed?.guaIdx || 1, movingLine: seed?.movingLine || 1, verse: guaObj?.verse || prev?.verse }, verse: guaObj?.verse || prev?.verse }));
    setPhase('zhuanggua');
    setAwaitingUser(true);
  }, [qinianInput, userInput]);

  // R3: 装卦日志确认 → P4 用神校准
  const handleConfirmZhuanggua = useCallback(() => setPhase('yongshen'), []);

  const handleConfirmYongShen = useCallback((yongshenConfirmedLabel) => {
    const cLabel = typeof yongshenConfirmedLabel === 'string' ? yongshenConfirmedLabel : (cyberGua?.yongShenObj?.label || '本我');
    setQinian(prev => ({ ...prev, yongShenConfirmed: cLabel, sanBianStep: 0, sanJiChecked: [false,false,false], sanYaoChecked: [false,false,false] }));
    setCyberGua(prev => prev && prev.yongShenObj ? { ...prev, yongShenObj: { ...prev.yongShenObj, confirmed: cLabel } } : prev);
    // 按卦先算一次 agent 推荐（供 agent_select 页面展示"按卦推合局"）
    try {
      const question = String(userInput || '此局').trim();
      // 从已有池子里拉候选（agent_select 之后 inference.agents 会被合成全量池）
      const allAgentsForRec = (() => {
        const customAgentsList = getCustomAgents() || [];
        const marketAgentsGlobal = (() => { try { return getMarketAgents() || []; } catch (_) { return []; } })();
        const arr = [
          ...customAgentsList,
          ...(inference?.agents || []),
          ...(inference?.perspectivePool || []),
          ...marketAgentsGlobal,
        ];
        const seenIds = new Set();
        return arr.filter(a => {
          if (!a || !a.id) return false;
          if (seenIds.has(a.id)) return false;
          seenIds.add(a.id); return true;
        });
      })();
      if (cyberGua?.gua && allAgentsForRec.length > 0) {
        const rec = recommendAgentsByGua(allAgentsForRec, question, cyberGua.gua, 3);
        const ids = (rec?.topK || []).map(a => a?.id).filter(Boolean);
        if (ids.length > 0) {
          setCyberGua(prev => prev ? { ...prev, agentRecommendedIds: ids, agentRationale: rec?.rationale || '' } : prev);
          // 预勾选：让用户基于合局推荐再手动增减
          setSelectedAgentIds(prev => {
            const next = new Set(prev);
            ids.forEach(i => next.add(i));
            return next;
          });
        }
      }
    } catch (e) { console.warn('[cyber ritual] agentRec 预推失败', e.message); }
    // ★ 修复流程顺序：yongShen → sanbian（6 次下一变）→ casting → clarify_loop
    //   绝对不许在这里自动 delay 推进到 casting/analyzing/clarify_loop（之前那样就是用户没点按钮自动跳）
    setAwaitingUser(false);
    setPhase('sanbian');
  }, [cyberGua, userInput, inference]);

  // R4: 跳过仪式（不想玩仪式直接进澄清）
  const handleSkipQinian = useCallback(() => {
    const qStr = String(userInput || '此局').trim();
    setQinian(prev => ({ ...prev, mindNum: prev?.mindNum || Math.floor(Math.random()*99)+1, yongShenConfirmed: '跳过仪式', sanBianStep: 6, sanJiChecked: [true,true,true], sanYaoChecked: [true,true,true] }));
    // 自动补卦：纯规则生成本地卦象，保证后续 inference.gua 有值
    let seed = null;
    let guaObj = null;
    let signId = null;
    let sanBian = null;
    const allList = allGuaList();
    try {
      const mindN = Math.floor(Math.random()*99)+1;
      seed = generateQinianSeed(qStr, mindN, Array.from({length:6}, () => Math.random()<0.5?'字':'背'));
      // ★ 根因修复：generateQinianSeed 不返回 .gua，自己通过 getGuaByIdx 取卦对象
      guaObj = getGuaByIdx(seed?.guaIdx || 1) || allList?.[0];
      signId = makeGuaSignId(guaObj?.id || guaObj?.idx || seed?.guaIdx || 1, seed?.movingLine || 1, mindN, new Date());
      sanBian = buildSanBian(qStr, guaObj, []);
    } catch(e) {
      console.warn('[skip qinian 补卦] 异常，使用第一卦兜底:', e);
      try {
        guaObj = allList?.[0];
        seed = { seed: 'fallback', guaIdx: 1, movingLine: 1, yaoArray: [1,1,1,1,1,1] };
        signId = makeGuaSignId(1, 1, 42, new Date());
        sanBian = buildSanBian(qStr, guaObj, []);
      } catch(fb) { console.warn('[skip qinian 终极兜底也失败]', fb); sanBian = null; }
    }
    if (seed && guaObj && signId) {
      const zLog = (guaObj && seed.yaoArray) ? buildZhuangGuaLog(guaObj, seed.movingLine, seed.yaoArray, qStr, signId) : '';
      const yong = (guaObj && seed.movingLine !== undefined) ? buildYongShenConfirm(qStr, guaObj, seed.movingLine) : null;
      const futie = guaObj ? buildFuTie(guaObj, qStr, signId) : null;
      setCyberGua(prev => prev ? { ...prev, ...seed, gua: guaObj, signId, zhuangGuaLog: zLog, yongShenObj: yong, fuTie: futie, sanBian } : { ...seed, gua: guaObj, signId, zhuangGuaLog: zLog, yongShenObj: yong, fuTie: futie, sanBian });
      setInference(prev => ({ ...(prev||{}), gua: { gua: guaObj?.gua || guaObj?.name || '', trigram: guaObj?.trigram || '', element: guaObj?.element || guaObj?.wuxing || '', id: guaObj?.id || guaObj?.idx || seed?.guaIdx || 1, movingLine: seed.movingLine, verse: guaObj?.verse || prev?.verse }, verse: guaObj?.verse || prev?.verse }));
    }
    // 回到 casting → analyzing → summoning → clarify_loop（跳过仪式的用户不想等，展示时间比正常仪式稍短）
    (async () => {
      setAwaitingUser(false);
      setPhase('casting');
      await delay(1100);
      setPhase('analyzing');
      await delay(800);
      setPhase('summoning');
      await delay(800);
      setPhase('clarify_loop');
      // ── 生成演的首个追问（5W 本地兜底 + judgeContinueAsking 优先 + LLM 其次）──────────────────────
      setAgentDialogues(prev => ({ ...prev, yan: '演 · 正在思索……' }));
      const yanAgent = { id: 'yan', name: '演', stance: '澄清视角' };
      const tL = QUESTION_TYPES[detectQuestionType(qStr)]?.label || '人生抉择';
      const kws = _detectKeywordsLocal(qStr);
      const opQ = _generate5WQuestions(qStr, tL, kws);
      let firstJudge = { continueAsking: false, nextQuestion: '' };
      try { firstJudge = await judgeContinueAsking(yanAgent, qStr, [], ''); }
      catch(e) { console.warn('[skip 后 firstJudge 失败]', e.message); firstJudge = { continueAsking: true, nextQuestion: generateContextAwareClarify(qStr, [], 0) }; }
      let yanText = ''; let source = 'preset';
      const cacheKey = makeCacheKey('yan_clarify_first', { question: qStr, keywords: kws }, {});
      const cached = getCached(cacheKey);
      if (firstJudge?.continueAsking && firstJudge.nextQuestion) { yanText = firstJudge.nextQuestion; source = 'llm_judge'; }
      else if (cached && !downgradeRef.current) { yanText = cached.text; source = cached.source || 'cache'; }
      else if (downgradeRef.current) { yanText = opQ; source = 'local_5w'; }
      else {
        try {
          if (isLlmAvailable()) {
            setFloatTip('演 · 正在斟酌第一个问题……');
            try {
              const res = await streamYanChat({
                message: `你是「演」，一位沉稳直指核心的引导者。用户的问题是：「${qStr}」\n\n请基于用户的原始问题，用自然、沉稳、直指核心的口吻，提出1个关键的追问，帮助用户说出真正想说的、藏在表层之下的真实情况。不要用5W模板，不要用编号，不要用【何事】【何时】这类标签，就用自然语言对话。只输出1个问题，不要解释，不要输出其他内容。`,
                conversationId: yanConversationId
              }, (_c, _f, convId) => setYanConversationId(convId));
              if (res?.text && res.text.length > 5) {
                yanText = res.text; source = 'llm';
                setCached(cacheKey, { text: yanText, source });
                if (res.conversationId) setYanConversationId(res.conversationId);
              }
            } catch(e) { console.warn('[skip 后 LLM 追问失败]', e); }
          }
        } catch(e) { console.warn('[skip 后演澄清整体] 失败降级', e); }
      }
      setFloatTip(null);
      if (!yanText || yanText.length <= 5) { yanText = opQ || generateContextAwareClarify(qStr, [], 0); source = 'local_natural'; }
      appendYanDialogue(yanText, source);
      setYanQuestionRounds(prev => prev.length===0 ? [{question:yanText, userAnswer:'', questionBy:'演'}] : prev.map((r,i)=>i===0?{...r, question:yanText, questionBy:'演'}:r));
      setAwaitingUser(true);
    })().catch(e => {
      console.warn('[skip qinian 流程] 异常:', e);
      setPhase('clarify_loop');
      const yanText = generateContextAwareClarify(qStr, [], 0);
      appendYanDialogue(yanText, 'local_natural');
      setYanQuestionRounds(prev => prev.length===0 ? [{question:yanText, userAnswer:'', questionBy:'演'}] : prev);
      setAwaitingUser(true);
    });
  }, [userInput, appendYanDialogue, yanConversationId]);

  // R5: 三变定局流程（sanbian 阶段分步处理）
  const handleSanbianNext = useCallback(() => {
    setQinian(prev => {
      const step = Math.min(6, (prev?.sanBianStep ?? 0) + 1);
      return { ...prev, sanBianStep: step };
    });
  }, [setQinian]);

  const handleToggleSanJi = useCallback((idx) => {
    setQinian(prev => {
      const arr = Array.isArray(prev?.sanJiChecked) ? [...prev.sanJiChecked] : [false,false,false];
      arr[idx] = !arr[idx];
      return { ...prev, sanJiChecked: arr };
    });
  }, [setQinian]);

  const handleToggleSanYao = useCallback((idx) => {
    setQinian(prev => {
      const arr = Array.isArray(prev?.sanYaoChecked) ? [...prev.sanYaoChecked] : [false,false,false];
      arr[idx] = !arr[idx];
      return { ...prev, sanYaoChecked: arr };
    });
  }, [setQinian]);

  const buildFateContentFallback = useCallback((safeChoice) => {
    try {
      const q = String(userInput || '此局').trim();
      const guaName = cyberGua?.gua?.gua || inference?.gua?.gua || safeChoice.gua || '大有';
      const trigram = cyberGua?.gua?.trigram || inference?.gua?.trigram || safeChoice.icon || '☰';
      const element = cyberGua?.gua?.element || inference?.gua?.element || safeChoice.element || '火';
      const jinNang = (cyberGua?.sanBian?.threeYao || []).map((y,i)=>`三要 ${i+1}. ${y}`).slice(0,3);
      const jinJi = (cyberGua?.sanBian?.threeJi || []).map((j,i)=>`✗ 忌 ${i+1}. ${j}`).slice(0,3);
      const zhelu = cyberGua?.yanBreakDown && Array.isArray(cyberGua.yanBreakDown) ? cyberGua.yanBreakDown.slice(0,4) : ['Day 1: 先做最小一步', 'Day 3: 找人聊事实', 'Day 7: 复盘应验', 'Day 30: 检查习惯'];
      const huiShuo = ['第7天问自己：做了没有？', '第30天问自己：变化有没有？', '第90天问自己：坚持了吗？'];
      const explain = [
        `【本次推演】问题：${q.slice(0,30)}${q.length>=30?'…':''}`,
        cyberGua?.niGuaTag ? `【逆卦提示】${cyberGua.niGuaTag} —— 反着做就是错的，别骗自己。` : '',
        cyberGua?.fuTie ? `【符贴】${cyberGua.fuTie}` : '',
        `【择路】「${safeChoice.label}」`,
        '', `【锦囊】`, ...jinNang.map(s=>`  ${s}`),
        '', `【禁忌】`, ...jinJi.map(s=>`  ${s}`),
        '', `【回顾】`, ...huiShuo,
      ].filter(Boolean).join('\n');
      const summary = `此卦得${guaName}（${element}行），你择「${safeChoice.label}」。谨记三忌三要，且行且验。${cyberGua?.fateSign16?` 符命 ${cyberGua.fateSign16}.`:''}`;
      return {
        error:false, errorMessage:'',
        verse: cyberGua?.gua?.verse || inference?.verse || `一卦方成，万象在掌。`,
        verseFull: `${trigram} · ${guaName}卦 · ${element}行`,
        guaName, trigram, element,
        summary,
        choiceLabel: safeChoice.label,
        keyPoints: jinNang.length?jinNang:[safeChoice.label,'顺势而为','且行且验'],
        explanation: explain,
        jinNang, jinJi, zhelu, huiShuo,
        userQuestion: q, agentSnippets: [], consensusHint: cyberGua?.core || '', divergenceHint: cyberGua?.poemTranslate || '',
        editable: true, source: 'cyber_ritual_local_fallback',
        cyberSignId: cyberGua?.signId,
        cyberPoem: cyberGua?.poem || [], cyberPoemTranslate: cyberGua?.poemTranslate || '',
        cyberFateSign16: cyberGua?.fateSign16,
        cyberRuneSvg: cyberGua?.runeSvg,
        cyberNiGua: cyberGua?.niGuaTag,
        cyberFuTie: cyberGua?.fuTie,
        cyberZhuangGuaLog: cyberGua?.zhuangGuaLog,
        cyberSanBianPick: cyberGua ? (cyberGua.sanBianPick || (qinianInput?.sanBianStep>=6?'path_A':'unknown')) : 'unknown',
      };
    } catch (e) {
      console.warn('[buildFateContentFallback] 失败:', e);
      return { error:true, errorMessage: String(e?.message||e), summary:'推演异常，请重试', verse:'无', explanation:'无', keyPoints:[], choiceLabel: safeChoice?.label || '择路', source: 'fatal_fallback' };
    }
  }, [cyberGua, inference, userInput, qinianInput]);

  const buildFateContentAfterChoice = useCallback(async (safeChoice) => {
    try {
      const base = buildFateContentFallback(safeChoice);
      if (!downgradeRef.current && isLlmAvailable()) {
        try {
          const personalized = await Promise.race([
            generatePersonalizedCardContent({
              question: userInput,
              guaName: base.guaName,
              choiceLabel: safeChoice.label,
              agentDialogues: agentDialogues || {},
              trigram: base.trigram,
            }),
            new Promise(resolve => setTimeout(() => resolve(null), 9000)),
          ]);
          if (personalized && typeof personalized === 'object' && personalized.verse) {
            const next = { ...base, ...personalized, verse: personalized.verse, source: personalized.source || 'cyber_ritual_backend_augmented', summary: personalized.summary || base.summary };
            setFateContent(next);
            return;
          }
        } catch (e) { console.warn('[cyber fate backend] 失败，降级本地', e.message); }
      }
      setFateContent(base);
    } catch (e) {
      console.warn('[buildFateContentAfterChoice] 失败', e.message);
      setFateContent(buildFateContentFallback(safeChoice));
    }
  }, [buildFateContentFallback, userInput, agentDialogues]);

  const handleConfirmSanBian = useCallback((twoPathsPickKey) => {
    const pickedKey = typeof twoPathsPickKey === 'string' ? twoPathsPickKey : null;
    const sanBian = cyberGua?.sanBian;
    const pickA = pickedKey === 'path_A' || pickedKey !== 'path_B';
    const finalChoice = (() => {
      if (!sanBian?.twoPaths) return selectedChoice;
      const pLabel = pickA ? sanBian.twoPaths.A.label : sanBian.twoPaths.B.label;
      const cBase = selectedChoice || { label: pLabel, icon: '☰', stance: '综合决策', idx: 0 };
      if (String(cBase.label).includes(pLabel.slice(0,2)) || pLabel.includes(String(cBase.label).slice(0,2))) return cBase;
      return { ...cBase, label: pLabel, stance: pickA ? (sanBian.twoPaths.A.standpoint||'顺势而为') : (sanBian.twoPaths.B.standpoint||'稳守当下'), icon: pickA ? '⚡' : '⚙' };
    })();
    setSelectedChoice(finalChoice);
    setCyberGua(prev => prev ? {
      ...prev,
      sanBianPick: pickA ? 'path_A' : 'path_B',
      sanJiChecked_: qinianInput?.sanJiChecked || [false,false,false],
      sanYaoChecked_: qinianInput?.sanYaoChecked || [false,false,false],
    } : null);
    setAwaitingUser(false);

    // ★ 正确的流程：sanbian 结束 → casting（展示卦盘 2.5 秒让用户看清楚是什么卦）→ analyzing（演在思考）→ summoning → clarify_loop + 生成演的首个追问
    //   之前直接跳到 path_reveal 是错的（选分岔 branch_select 都还没做，不可能直接命签）
    (async () => {
      setPhase('casting');
      await delay(2500);
      setPhase('analyzing');

      // ── 生成演的首个追问（5W 兜底 + judgeContinueAsking 优先 + LLM stream 其次）────────────────────────────────
      setAgentDialogues(prev => ({ ...prev, yan: '演 · 正在斟酌第一个问题……' }));
      const question = userInput || '此局';
      const yanAgent = { id: 'yan', name: '演', stance: '澄清视角' };

      // 先算一次 5W 本地兜底（永远能产出一个，不用怕 LLM 挂）
      const typeLabel = QUESTION_TYPES[detectQuestionType(question)]?.label || '人生抉择';
      const keywords = _detectKeywordsLocal(question);
      const openingQuestion = _generate5WQuestions(question, typeLabel, keywords);

      // 再问 judgeContinueAsking（是否应该追问 + 追问内容推荐）
      let firstJudge = { continueAsking: false, nextQuestion: '' };
      try { firstJudge = await judgeContinueAsking(yanAgent, question, [], ''); }
      catch (e) {
        console.warn('[handleConfirmSanBian] firstJudge 异常降级', e.message);
        firstJudge = { continueAsking: true, nextQuestion: generateContextAwareClarify(question, [], 0) };
      }

      let yanText = '';
      let source = 'preset';
      const yanCacheKey = makeCacheKey('yan_clarify_first', { question, keywords }, {});
      const cachedYan = getCached(yanCacheKey);

      if (firstJudge?.continueAsking && firstJudge.nextQuestion) {
        yanText = firstJudge.nextQuestion; source = 'llm_judge';
      } else if (cachedYan && !downgradeRef.current) {
        yanText = cachedYan.text; source = cachedYan.source || 'cache';
      } else if (downgradeRef.current) {
        yanText = openingQuestion; source = 'local_5w';
      } else {
        // 最后用 stream LLM 生成（网络慢没关系，用户现在在看 casting 卦盘，有耐心）
        try {
          const localMemories = recallRelevantMemories(question);
          const localMemoryContext = formatMemoriesForPrompt(localMemories);
          const fullQuestion = localMemoryContext ? `${question}\n\n用户过往相关信息:\n${localMemoryContext}` : question;
          if (isLlmAvailable()) {
            setFloatTip('演 · 正在斟酌第一个问题……');
            try {
              const result = await streamYanChat({
                message: `你是「演」，一位沉稳直指核心的引导者。用户的问题是：「${fullQuestion}」\n\n请基于用户的原始问题，用自然、沉稳、直指核心的口吻，提出1个关键的追问，帮助用户说出真正想说的、藏在表层之下的真实情况。不要用5W模板，不要用编号，不要用【何事】【何时】这类标签，就用自然语言对话。只输出1个问题，不要解释，不要输出其他内容。`,
                conversationId: yanConversationId
              }, (_c, _f, convId) => setYanConversationId(convId));
              if (result && result.text && result.text.length > 5) {
                yanText = result.text; source = 'llm';
                recordCost(fullQuestion.length + 300, result.text.length);
                setCached(yanCacheKey, { text: yanText, source });
                if (result.conversationId) setYanConversationId(result.conversationId);
              }
            } catch (e) { console.warn('[sanbian后演澄清LLM] 失败:', e); }
          }
        } catch (e) { console.warn('[sanbian后演澄清整体] 失败降级:', e); }
      }
      if (!yanText || yanText.length <= 5) { yanText = generateContextAwareClarify(question, [], 0); source = 'local_natural'; }
      setFloatTip(null);

      await delay(900);
      setPhase('summoning');
      await delay(1100);
      setPhase('clarify_loop');
      appendYanDialogue(yanText, source);
      setYanQuestionRounds(prev => {
        if (prev.length === 0) return [{ question: yanText, userAnswer: '', questionBy: '演' }];
        return prev.map((r, i) => i === 0 ? { ...r, question: yanText, questionBy: '演' } : r);
      });
      setAwaitingUser(true);
    })().catch(e => {
      console.warn('[handleConfirmSanBian → casting → clarify_loop] 异常:', e);
      // 出任何错直接落到 clarify_loop，并且给一个兜底追问
      const q = userInput || '此局';
      const yanText = generateContextAwareClarify(q, [], 0);
      setPhase('clarify_loop');
      appendYanDialogue(yanText, 'local_natural');
      setYanQuestionRounds(prev => prev.length===0 ? [{question:yanText, userAnswer:'', questionBy:'演'}] : prev);
      setAwaitingUser(true);
    });
  }, [cyberGua, selectedChoice, qinianInput, userInput, appendYanDialogue, yanConversationId]);

  return {
    navigate, phase, userInput, setUserInput, inputValue, setInputValue,
    inference, showInput, showQuestion, activeAgentIdx, selectedChoice,
    agentDialogues, showHistoryPanel, setShowHistoryPanel, awaitingUser,
    currentResponse, setCurrentResponse, currentCommit, setCurrentCommit,
    oracleThrowing, oracleResult, floatTip, selectedAgentIds, setSelectedAgentIds,
    agentCallResults, toolCallState, MAX_DEBATE_ROUNDS, debateRound,
    debateConvergence, showAgentErrorModal, setShowAgentErrorModal, agentErrors,
    yanMemories, fateContent, fateRevealed, activeAgents, questionType, choices,
    phaseLabel, historyCount, mentionMessages, debateBlackboardRef,
    caseFile, yanQuestionRounds, progress, memoryLayers, mirrorReview,
    debateAutoPlay, setDebateAutoPlay, handleSkipToSummary,
    handleRestart, handleStart, handleUserAdvance, handleSkipClarify, handleConfirmAgents,
    handleRunAnotherRound, handleChoiceClick, handleRevealFate,
    handleShowChoices, handleCommit, handleStartOracle,
    handleProceedToChoices, handleSkipOracle, handleAgentClick,
    handleSaveToCollection, toolCallbacks,
    handleConfirmCaseFile, handleBackFromCaseFile,
    infoProgress, MAX_CLARIFY_ROUNDS, saveGameState,
    // 赛博算命仪式：节点状态 & 节点处理器
    qinianInput, setQinian, cyberGua,
    handleSetMindNum, handleConfirmMindNum,
    handleCastOneCoin, handleResetSixThrows, handleConfirmSixThrows,
    handleConfirmZhuanggua, handleConfirmYongShen, handleSkipQinian,
    handleSanbianNext, handleToggleSanJi, handleToggleSanYao, handleConfirmSanBian,
  };
}
