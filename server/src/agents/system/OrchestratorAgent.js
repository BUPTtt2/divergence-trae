/**
 * OrchestratorAgent（编排总管，role=system）
 *   取代旧 planner.js 里的硬编码 QUESTION_TYPE_RULES / detectQuestionType / 正则匹配。
 *
 *   职责（只做 plan，不做 execute 智囊发言）：
 *     a) 问题建模（LLM ReAct Think：识别问题/用户意图/隐藏假设/缺什么信息）
 *     b) 维度生成（3~6 个核心视角，每个维度 ≤ 20 字）
 *     c) perspectivePool 生成（12 个可召唤候选视角：维度→agentPool 里的视角映射）
 *     d) autonomy 判定（ASK=需要追问，CONTINUE=信息够直接推演，HALT=问题不可推演）
 *
 *   实现分两路（与现有 planner 的兜底策略一致，保证不卡）：
 *     - LLM 优先（planViaLLM）：≥3 维度时用
 *     - 启发式兜底（planViaHeuristic）：LLM 空/超时/维度 < 3 时兜底，启发式沿用之前 _buildHeuristicClarify 的维度字典
 */
import BaseAgent from '../BaseAgent.js';
import { callLLM } from '../../services/llmRouter.js';
import agentPool from '../../data/agentPool.js';
import dynamicGenerator from '../../services/dynamicGenerator.js';

export class OrchestratorAgent extends BaseAgent {
  constructor() {
    super({
      id: 'orchestrator',
      name: '演·编排总管',
      role: 'system',
      timeoutMs: 45 * 1000,
      retries: 1
    });
  }

  async _execute(ctx) {
    const q = String((ctx.blackboard && ctx.blackboard.question) || '').trim();
    if (!q) throw new Error('[orchestrator] blackboard.question 为空');
    // 1) LLM 自主 plan
    let plan;
    try {
      plan = await this.planViaLLM(q, ctx);
    } catch (e) {
      this.audit(3, 'PLAN_LLM_FALLBACK', `LLM plan failed: ${(e && e.message || String(e)).slice(0, 150)}`, ctx);
    }
    // 2) 验证 LLM 产出的维度够不够（<3 一律走启发式，避免"我要养猫"生成 1 个维度的 bug）
    if (!plan || !Array.isArray(plan.dimensions) || plan.dimensions.length < 3) {
      plan = this.planViaHeuristic(q, plan || {});
    }
    // 3) perspectivePool 生成（维度→agentPool 映射 + 动态生成补齐）
    if (!plan.perspectivePool || plan.perspectivePool.length < 8) {
      plan.perspectivePool = await this.buildPerspectivePool(q, plan.dimensions || []);
    }
    // 4) autonomy 判定（默认 CONTINUE，维度缺信息太多 = ASK，极端情况 = HALT）
    if (!plan.autonomy) {
      plan.autonomy = this.decideAutonomy(q, plan.dimensions || []);
    }
    return {
      plan: {
        questionType: plan.questionType || this._heuristicTypeLabel(q),
        dimensions: (plan.dimensions || []).slice(0, 8),
        questions: plan.questions || [],
        divergence: plan.divergence || this._heuristicDivergence(q),
      },
      perspectivePool: plan.perspectivePool,
      autonomy: plan.autonomy,
      planSource: plan._src || 'heuristic',
    };
  }

  // ---------- LLM 规划 ----------
  async planViaLLM(question, ctx) {
    const sys = `你是决策推演"演"的编排总管（Orchestrator）。任务：把用户问题拆成 3-6 个维度并生成澄清问题集合。
严格返回 JSON，不能解释、不能 markdown：
{
  "questionType": "5-8个字的分类标签（例如：城市迁移/职业抉择/养宠决策/远行计划/情感抉择/投资理财/健康规划）",
  "dimensions": ["3-15个字的维度标签 1", "维度 2", "维度 3", "…"],
  "questions": [{"id":"q1","dimension":"所属维度","text":"22-38字的澄清问题","hint":"为什么这题重要，≤28字"}],
  "divergence": "6-12个字的预判分歧（例如：稳定与变迁之争/成本与体验/自由与责任/收益与风险）",
  "autonomy": "ASK"
}
约束：
- dimensions 至少 3 个，最多 6 个。
- questions 只生成"用户没说清楚"的问题，0<=N<=6。如果用户信息够，questions=[]，autonomy="CONTINUE"。
- autonomy 只允许 "ASK" / "CONTINUE" / "HALT"。问题太空泛或违反公序良俗 = HALT。
- 不要把"养猫"分类为 travel/远行；不要把"租房买房"分类为 travel/远行。`;
    const user = `用户问题：${question}\n请输出 JSON。`;
    const res = await callLLM(
      [{ role: 'system', content: sys }, { role: 'user', content: user }],
      { maxTokens: 900, temperature: 0.25, timeoutMs: 30 * 1000 }
    );
    if (!res || !res.content) throw new Error('LLM 空返回');
    const json = this._extractJSON(res.content);
    if (!json) throw new Error('LLM 未返回合法 JSON');
    return { ...json, _src: 'llm' };
  }

  _extractJSON(text) {
    if (!text) return null;
    // 1) 整段是 JSON
    try { return JSON.parse(text); } catch { /* ignore */ }
    // 2) 夹在 ```json / ``` 之间
    const m1 = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (m1) try { return JSON.parse(m1[1]); } catch { /* ignore */ }
    // 3) 第一个 { 到最后一个 }
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start > -1 && end > start) {
      try { return JSON.parse(text.slice(start, end + 1)); } catch { /* ignore */ }
    }
    return null;
  }

  // ---------- 启发式兜底 ----------
  planViaHeuristic(q, partial) {
    const dims = partial.dimensions && Array.isArray(partial.dimensions) && partial.dimensions.length >= 3
      ? partial.dimensions : this._heuristicDimensions(q);
    const questions = partial.questions && Array.isArray(partial.questions) ? partial.questions : this._heuristicQuestions(q, dims);
    const questionType = partial.questionType || this._heuristicTypeLabel(q);
    const divergence = partial.divergence || this._heuristicDivergence(q);
    const autonomy = questions && questions.length > 0 ? 'ASK' : 'CONTINUE';
    return { questionType, dimensions: dims, questions, divergence, autonomy, _src: 'heuristic' };
  }

  _heuristicTypeLabel(q) {
    const low = q.toLowerCase();
    if (/(养猫|宠物|猫|狗|养一只|铲屎)/.test(low)) return '养宠决策';
    if (/(西藏|新疆|云南|四川|三亚|青海|旅游|旅行|自驾|攻略|景点|度假)/.test(low)) return '远行计划';
    if (/(租房|买房|搬家|定居|落户|合租|搬家)/.test(low)) return '城市迁移';
    if (/(offer|跳槽|创业|辞职|转行|工作|职业|入职|离职)/.test(low)) return '职业抉择';
    if (/(投资|股票|基金|理财|贷款|借钱|存钱|汇率|还款)/.test(low)) return '投资理财';
    if (/(结婚|恋爱|分手|女朋友|男朋友|对象|家人|感情|相亲)/.test(low)) return '情感抉择';
    if (/(考研|留学|考试|学习|培训|毕业|学校)/.test(low)) return '学业规划';
    if (/(健康|看病|减肥|失眠|焦虑|抑郁|运动)/.test(low)) return '健康规划';
    return '人生抉择';
  }

  _heuristicDivergence(q) {
    const low = q.toLowerCase();
    if (/(养猫|宠物|猫|狗|养宠)/.test(low)) return '责任与陪伴之争';
    if (/(租房|买房|搬家|定居|落户)/.test(low)) return '稳定与变迁之争';
    if (/(西藏|新疆|云南|旅行|旅游|自驾|远行)/.test(low)) return '体验与风险之争';
    if (/(offer|跳槽|创业|辞职|转行|职业)/.test(low)) return '安稳与突破之争';
    if (/(结婚|恋爱|分手|对象|感情)/.test(low)) return '自由与责任之争';
    if (/(投资|股票|理财|贷款|存钱|钱|成本)/.test(low)) return '收益与风险之争';
    return '长期与短期之争';
  }

  _heuristicDimensions(q) {
    const dims = new Set(['价值投入', '隐性成本', '家庭影响', '长期风险', '退出成本']);
    const low = q.toLowerCase();
    if (/(养猫|宠物|猫|狗|养宠)/.test(low)) {
      ['健康与过敏', '居住条件', '时间精力', '经济预算', '家庭共识', '品类与品种'].forEach(d => dims.add(d));
    } else if (/(西藏|新疆|云南|旅游|旅行|自驾|远行|度假|景点|攻略)/.test(low)) {
      ['时间季节', '同行人', '预算分配', '玩法偏好', '健康与高反', '住宿节奏'].forEach(d => dims.add(d));
    } else if (/(租房|买房|搬家|定居|落户|合租)/.test(low)) {
      ['预算与月供', '通勤时长', '城市发展', '居住品质', '工作稳定性', '家庭需求'].forEach(d => dims.add(d));
    } else if (/(offer|跳槽|创业|辞职|转行|工作|职业)/.test(low)) {
      ['薪资收益', '成长空间', '工作强度', '职业稳定', '城市匹配', '家庭影响'].forEach(d => dims.add(d));
    } else if (/(结婚|恋爱|分手|对象|情感|家人|父母|老婆|老公)/.test(low)) {
      ['价值观契合', '家庭共识', '经济基础', '长期目标', '相处成本', '退出代价'].forEach(d => dims.add(d));
    }
    return Array.from(dims).slice(0, 6);
  }

  _heuristicQuestions(q, dims) {
    const qs = [];
    const low = q.toLowerCase();
    const push = (dimension, text, hint) => {
      if (qs.length >= 6) return;
      qs.push({ id: `hq${qs.length + 1}`, dimension, text, hint });
    };
    if (/(养猫|宠物|猫|狗|养宠)/.test(low)) {
      push('品类与品种', '你偏向养什么品类？猫咪/狗狗/其他小宠物？有具体品种偏好吗？', '不同品种掉毛量、运动量、花费差异巨大');
      push('经济预算', '每月固定支出（粮食/猫砂/驱虫/体检）预算？是否预留 5k-2w 的医疗应急金？', '养猫最大隐形成本是急诊');
      push('居住条件', '你目前的居住允许养宠物吗？房东/室友/物业有限制吗？有封窗吗？', '居住不稳定是弃养第一原因');
      push('时间精力', '每天能花多少固定时间照顾（喂食/铲屎/陪玩）？是否经常加班/出差？', '每天 30-60 分钟是硬性下限');
      push('健康与过敏', '你或同住的人有哮喘/猫毛狗毛过敏史吗？家里有无孕妇/备孕计划？', '过敏+备孕=家庭冲突高发');
      push('家庭共识', '同住的家人/室友都同意养吗？未来搬家/换城市能一并带走吗？', '宠物是家庭决策，不是个人选择');
    } else if (/(西藏|新疆|云南|旅游|旅行|自驾|远行|度假|景点|攻略)/.test(low)) {
      push('时间季节', '大致计划什么时间出发？玩几天？是节假日还是淡季？', '季节和天数直接决定价格和体验');
      push('同行人', '一个人去还是和朋友/家人同行？同行人的体力/偏好/预算是否一致？', '同行人决定整个行程节奏');
      push('预算分配', '人均总预算大概多少？机票/交通占比、住宿档次、餐饮/门票能接受的范围？', '预算分布定玩法');
      push('玩法偏好', '更偏打卡热门景点/小众深度体验/慢节奏躺平/极限户外？', '偏好不一致最易吵架');
      push('健康与高反', '有没有高原/高反相关健康问题？最近身体状态如何？有老人/小孩同行吗？', '高原风险必须前置确认');
      push('住宿节奏', '偏好住酒店/民宿/青旅？是每天换地方还是定点辐射周边？', '行程节奏直接影响疲劳度');
    } else if (/(租房|买房|搬家|定居|落户|合租)/.test(low)) {
      push('预算与月供', '能接受的房租/月供上限？占月收入比例？有预留 6 个月的应急现金吗？', '月供比例>35% 风险高');
      push('通勤时长', '能接受的单程通勤上限（分钟）？工作地点是否稳定？', '通勤超过 60 分钟消耗幸福指数');
      push('城市发展', '是短期过渡（1-2 年）还是长期定居（>5 年）？对所在城市发展有信心吗？', '短期过渡不要轻易买');
      push('居住品质', '对面积、户型、楼层、朝向、电梯、噪音敏感吗？小区配套要求？', '品质需求的排序直接筛掉 80%');
      push('工作稳定性', '最近 1 年内有没有跳槽/换城市/转行的计划？', '换工作前先买房会锁死流动性');
      push('家庭需求', '结婚/生小孩/父母同住的时间点？是否需要预留房间/学区？', '家庭需求决定居住面积下限');
    } else if (/(offer|跳槽|创业|辞职|转行|工作|职业)/.test(low)) {
      push('薪资收益', '目标薪资/薪酬结构（基本/绩效/期权）？税后实际到手预期？', '画大饼期权=不兑现');
      push('成长空间', '晋升路径/学习曲线/行业赛道前景？3-5 年的可迁移技能是否积累？', '夕阳行业涨薪幅度有限');
      push('工作强度', '能接受的加班时长/出差比例？是否有健康顾虑？', '996 + 高压 = 3 年内必悔');
      push('职业稳定', '公司成立时间/融资阶段/现金流？行业是否有政策风险？', '创业公司的 offer=赌');
      push('城市匹配', '工作地点在哪个城市？是否和家人/伴侣/房产在一起？', '异地=持续消耗感情/钱');
      push('家庭影响', '伴侣/父母对职业选择的态度？如果短期内收入下降能否接受？', '一人跳槽全家吃土');
    }
    return qs;
  }

  // ---------- autonomy 判定 ----------
  decideAutonomy(q, dimensions) {
    const low = q.toLowerCase();
    if (/(自杀|伤害他人|违法|毒品|诈骗)/.test(low)) return 'HALT';
    // 问题太短，信息不足 → ASK
    if (q.length < 6) return 'ASK';
    const density = dimensions && Array.isArray(dimensions) ? dimensions.length : 0;
    // 问题里没有提到时间/预算/条件的任何两个，就 ASK
    const hasCondition = /(预算|多少钱|多少天|几个人|几月份|什么季节|一个人|和朋友|和家人|和对象|和谁|同屋|同住|合租|室友|房东|备孕|过敏|健康|病史)/.test(low);
    if (!hasCondition && density < 6) return 'ASK';
    return 'CONTINUE';
  }

  // ---------- perspectivePool 生成 ----------
  async buildPerspectivePool(question, dimensions) {
    const pool = new Map();
    // 1) 从 agentPool 现有数据里，找 perspective/dimension 命中的
    const dimText = dimensions.join(' ').toLowerCase();
    const qlow = question.toLowerCase();
    for (const a of Object.values(agentPool)) {
      let score = 0;
      const tagStr = `${a.perspective || ''} ${a.description || ''} ${(a.dimensions || []).join(' ')}`.toLowerCase();
      for (const d of dimensions) {
        if (tagStr.includes(d.toLowerCase())) score += 1;
      }
      if (score > 0 || (a.perspective && dimText.includes(a.perspective.toLowerCase()))) {
        pool.set(a.id, { ...a, score });
        continue;
      }
      // 场景关键词命中
      const scenarios = [
        { key: '养宠', pat: /(养猫|宠物|猫|狗|铲屎)/ },
        { key: '远行', pat: /(西藏|新疆|云南|旅游|旅行|自驾|攻略|度假|景点|远行)/ },
        { key: '城市', pat: /(租房|买房|搬家|定居|落户|合租|迁)/ },
        { key: '职业', pat: /(offer|跳槽|创业|辞职|转行|工作|职业)/ },
        { key: '情感', pat: /(结婚|恋爱|分手|对象|情感|家人|父母|老婆|老公|孩子)/ },
        { key: '财务', pat: /(投资|股票|理财|贷款|钱|存钱|还款|成本)/ },
        { key: '健康', pat: /(健康|减肥|失眠|焦虑|抑郁|看病|运动|过敏|高反)/ },
      ];
      for (const s of scenarios) {
        if (s.pat.test(qlow) && s.pat.test(`${a.perspective} ${a.description}`.toLowerCase())) {
          pool.set(a.id, { ...a, score: score + 0.5 });
          break;
        }
      }
    }
    // 2) 用 dynamicGenerator 按维度补够 12 个
    const needCount = 12 - pool.size;
    if (needCount > 0) {
      try {
        const extras = await dynamicGenerator.generateAgentsForDimensions(question, dimensions, needCount);
        for (const e of extras || []) {
          if (!pool.has(e.id)) pool.set(e.id, { ...e, dynamic: true, score: 0.3 });
        }
      } catch (_) { /* ignore 动态生成失败 */ }
    }
    // 3) 不足 12 个时，从 agentPool 里按 popularity 补足
    if (pool.size < 12) {
      const rest = Object.values(agentPool)
        .filter(a => !pool.has(a.id))
        .sort((x, y) => (y.popularity || 0) - (x.popularity || 0))
        .slice(0, 12 - pool.size);
      for (const a of rest) pool.set(a.id, { ...a, score: 0.1 });
    }
    return Array.from(pool.values()).map(a => ({
      id: a.id, name: a.name, perspective: a.perspective || a.name,
      description: a.description || '', stance: 'NEUTRAL',
      intensity: typeof a.score === 'number' ? a.score : 0.5,
      ...(a.dynamic ? { dynamic: true } : {}),
    }));
  }
}

export default OrchestratorAgent;
