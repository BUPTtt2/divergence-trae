/**
 * AnimationAgent（动画调度总管，role=system）
 *   订阅 phase 变化，产出 AnimationTimeline JSON（纯数据，不直接操作 DOM/Canvas/Three）
 *   前端消费 AnimationTimeline.steps，按顺序播放；支持跳过、倍速、停止。
 *
 *   phase 列表：casting → yan_analyze → agent_select → agent_debate → clarifying → reflecting → oracle → commit → idle
 *   每个 phase 对应一组 steps，duration 是毫秒，params 可携带 agentId/颜色/位置/强度等信息
 *   这样后面接 Unity/Cocos/R3F 都不需要改 Agent 逻辑，只要前端按 JSON 渲染
 */
import BaseAgent from '../BaseAgent.js';

const PHASE_DEFS = {
  casting: [
    { name: 'taiji_fade_in', durationMs: 800 },
    { name: 'three_coins_throw', durationMs: 1600 },
    { name: 'hexagram_build_lines', durationMs: 2200 },
    { name: 'hexagram_glow', durationMs: 700 },
  ],
  yan_analyze: [
    { name: 'yan_pulse_ring', durationMs: 1200 },
    { name: 'memory_orbit_particles', durationMs: 1500 },
    { name: 'perspective_sparkles', durationMs: 1000 },
  ],
  agent_select: [
    { name: 'candidate_pool_float', durationMs: 900 },
    { name: 'selection_highlight', durationMs: 600 },
  ],
  clarifying: [
    { name: 'question_card_slide_in', durationMs: 500 },
    { name: 'yan_speak_bubble', durationMs: 800 },
  ],
  agent_debate: [
    { name: 'advisor_stand_up', durationMs: 700, params: { perAgentDelayMs: 250 } },
    { name: 'dialogue_stream_fly', durationMs: 1500 },
    { name: 'stance_polarize_glow', durationMs: 900 },
  ],
  reflecting: [
    { name: 'all_dialogue_converge', durationMs: 1500 },
    { name: 'yan_compile_golden', durationMs: 1200 },
  ],
  oracle: [
    { name: 'hexagram_line_solidify', durationMs: 1300 },
    { name: 'fortune_reveal', durationMs: 1700 },
  ],
  commit: [
    { name: 'commit_ring_expand', durationMs: 1100 },
    { name: 'destiny_anchor', durationMs: 1400 },
  ],
  idle: [
    { name: 'breathe_idle', durationMs: 4000, params: { loop: true } },
  ],
};

export class AnimationAgent extends BaseAgent {
  constructor() {
    super({ id: 'animation', name: '演·动画调度', role: 'system', timeoutMs: 5_000, retries: 0 });
  }

  async _execute(ctx) {
    const phase = String((ctx.blackboard && ctx.blackboard.phase) || 'idle').trim();
    const agents = Array.isArray(ctx.blackboard && ctx.blackboard.agents) ? ctx.blackboard.agents : [];
    const def = PHASE_DEFS[phase] || PHASE_DEFS.idle;
    // 把 agent 信息注入到 agent_debate 步骤 params 里
    let steps = def.map(s => ({ ...s, params: { ...(s.params || {}) } }));
    if (phase === 'agent_debate') {
      steps = steps.map(s => {
        if (s.name === 'advisor_stand_up') {
          return { ...s, params: { ...s.params, agentIds: agents.map(a => a.id).slice(0, 6), perAgentDelayMs: s.params.perAgentDelayMs || 250 } };
        }
        return s;
      });
    }
    const totalMs = steps.reduce((acc, s) => acc + Number(s.durationMs || 0), 0);
    return { timeline: { phase, steps, totalMs } };
  }

  /** 同步版（无 await）供后端热路径用，不调 AgentRunner */
  timelineFor(phase, agents = []) {
    const phaseStr = String(phase || 'idle').trim();
    const def = PHASE_DEFS[phaseStr] || PHASE_DEFS.idle;
    const steps = def.map(s => ({ ...s, params: { ...(s.params || {}) } }));
    const injectAgent = phaseStr === 'agent_debate';
    if (injectAgent) {
      for (let i = 0; i < steps.length; i++) {
        if (steps[i].name === 'advisor_stand_up') {
          steps[i].params = { ...steps[i].params, agentIds: agents.map(a => a && a.id).filter(Boolean).slice(0, 6), perAgentDelayMs: steps[i].params.perAgentDelayMs || 250 };
        }
      }
    }
    const totalMs = steps.reduce((acc, s) => acc + Number(s.durationMs || 0), 0);
    return { phase: phaseStr, steps, totalMs };
  }
}

const singleton = new AnimationAgent();
export default singleton;
