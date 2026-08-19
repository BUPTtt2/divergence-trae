import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import BrandMark from '../components/brand/BrandMark.jsx';
import UserAvatar from '../components/UserAvatar.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { BRAND } from '../brand/brandMarkModel.js';
import { getLandingActions, PUBLIC_NAVIGATION, WALKTHROUGH_STAGES } from './publicLandingModel.js';
import './landing.css';

const EASE = [0.16, 1, 0.3, 1];

function PublicHeader({ authStatus }) {
  const [open, setOpen] = useState(false);
  const actions = getLandingActions(authStatus);
  const openAccount = () => {
    setOpen(false);
    window.dispatchEvent(new CustomEvent(actions.account.event, { detail: actions.account.detail }));
  };

  return (
    <header className="public-header">
      <Link to="/" className="public-header__brand" aria-label="演策首页"><BrandMark /></Link>
      <nav className="public-header__nav" aria-label="首页导航">
        {PUBLIC_NAVIGATION.map((item) => <a key={item.href} href={item.href}>{item.label}</a>)}
      </nav>
      <div className="public-header__actions">
        <button type="button" className="button button--quiet" disabled={actions.account.disabled} onClick={openAccount}>{actions.account.label}</button>
        <Link className="button button--ink" to={actions.primary.href}>{actions.primary.label}</Link>
      </div>
      <button type="button" className="public-header__menu" aria-expanded={open} aria-label={open ? '关闭菜单' : '打开菜单'} onClick={() => setOpen((value) => !value)}>
        <span /><span />
      </button>
      <AnimatePresence>
        {open && (
          <motion.nav className="public-header__mobile" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.24, ease: EASE }}>
            {PUBLIC_NAVIGATION.map((item) => <a key={item.href} href={item.href} onClick={() => setOpen(false)}>{item.label}</a>)}
            <button type="button" disabled={actions.account.disabled} onClick={openAccount}>{actions.account.label}</button>
            <Link to={actions.primary.href}>{actions.primary.label}</Link>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}

function DecisionInstrument({ reduceMotion }) {
  const branches = [
    { label: '机会', x: -76, y: -62, delay: 0.45 },
    { label: '代价', x: 84, y: -22, delay: 0.6 },
    { label: '关系', x: -88, y: 58, delay: 0.75 },
    { label: '长期', x: 76, y: 72, delay: 0.9 },
  ];
  return (
    <div className="decision-instrument" aria-label="多个决策视角汇入一条可行动路径">
      <motion.div className="decision-instrument__orbit" initial={reduceMotion ? false : { rotate: -12, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} transition={{ duration: 1.1, ease: EASE }} />
      <motion.div className="decision-instrument__core" initial={reduceMotion ? false : { scale: 0.72, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.8, ease: EASE }}>
        <img src="/brand/yance-mark.svg" alt="演策" />
      </motion.div>
      {branches.map((branch) => (
        <motion.span
          key={branch.label}
          className="decision-instrument__branch"
          style={{ '--branch-x': `${branch.x}px`, '--branch-y': `${branch.y}px` }}
          initial={reduceMotion ? false : { x: 0, y: 0, opacity: 0 }}
          animate={{ x: branch.x, y: branch.y, opacity: 1 }}
          transition={{ delay: branch.delay, duration: 0.75, ease: EASE }}
        >{branch.label}</motion.span>
      ))}
      <motion.div className="decision-instrument__path" initial={reduceMotion ? false : { scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ delay: 1, duration: 0.65, ease: EASE }} />
      <motion.span className="decision-instrument__action" initial={reduceMotion ? false : { opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.35, duration: 0.5 }}>下一步行动</motion.span>
    </div>
  );
}

function Walkthrough() {
  const [active, setActive] = useState(0);
  const stage = WALKTHROUGH_STAGES[active];
  return (
    <section id="walkthrough" className="walkthrough section-shell">
      <div className="section-copy">
        <h2>不是给答案，是把决定推演完整。</h2>
        <p>每一步都来自你的事实。你可以继续追问、翻回前面的分歧，也可以带着完整记录离开。</p>
      </div>
      <div className="walkthrough__body">
        <div className="walkthrough__controls" role="tablist" aria-label="推演过程">
          {WALKTHROUGH_STAGES.map((item, index) => (
            <button key={item.key} type="button" role="tab" aria-selected={active === index} onClick={() => setActive(index)}>
              <span>{item.signal}</span><strong>{item.title}</strong>
            </button>
          ))}
        </div>
        <div className="walkthrough__stage" role="tabpanel" aria-live="polite">
          <AnimatePresence mode="wait">
            <motion.div key={stage.key} initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -14 }} transition={{ duration: 0.35, ease: EASE }}>
              <span className="walkthrough__signal">{stage.signal}</span>
              <h3>{stage.title}</h3>
              <p>{stage.detail}</p>
              <div className={`walkthrough__visual walkthrough__visual--${stage.key}`} aria-hidden="true">
                <i /><i /><i /><i />
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}

function PublicFooter() {
  return (
    <footer className="public-footer" id="privacy">
      <BrandMark />
      <p>匿名可体验。完整问答默认只为你保存，运营分析不记录问题正文。</p>
      <div>
        <Link to="/privacy">隐私政策</Link>
        <Link to="/legal">用户协议</Link>
        <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('yance:open-feedback'))}>反馈建议</button>
      </div>
    </footer>
  );
}

export default function Landing() {
  const { status } = useAuth();
  const reduceMotion = useReducedMotion();
  const actions = getLandingActions(status);

  return (
    <main className="public-landing">
      <UserAvatar hideTrigger />
      <PublicHeader authStatus={status} />
      <section className="landing-hero section-shell">
        <motion.div className="landing-hero__copy" initial={reduceMotion ? false : { opacity: 0, y: 34 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.85, ease: EASE }}>
          <p className="landing-hero__eyebrow">多视角 AI 决策推演</p>
          <h1>{BRAND.promise}</h1>
          <p className="landing-hero__intro">不是替你决定。让事实、反方意见和行动路径在同一张桌上说清楚。</p>
          <div className="landing-hero__actions">
            <Link className="button button--accent" to={actions.primary.href}>开始一局</Link>
            <a className="button button--line" href="#walkthrough">先看过程</a>
          </div>
        </motion.div>
        <DecisionInstrument reduceMotion={reduceMotion} />
      </section>

      <section id="method" className="method section-shell">
        <div className="method__statement">
          <h2>一个人容易沿着原来的想法打转。</h2>
          <p>演策先拆问题，再让不同立场真正交锋，最后把选择变成能执行、能复盘的记录。</p>
        </div>
        <div className="method__rail" aria-label="演策方法">
          <motion.div initial={reduceMotion ? false : { scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true, amount: 0.6 }} transition={{ duration: 1, ease: EASE }} />
          <span>事实</span><span>分歧</span><span>选择</span><span>行动</span>
        </div>
      </section>

      <Walkthrough />

      <section className="privacy-boundary section-shell">
        <div className="privacy-boundary__mark">只记录必要的信息</div>
        <div>
          <h2>你的纠结，不是运营素材。</h2>
          <p>匿名体验保存在当前设备。注册后才能跨设备同步。反馈只在你主动提交时发送，不自动附带完整对话。</p>
        </div>
      </section>

      <section className="final-cta section-shell">
        <h2>下一次纠结，别只在脑中重播。</h2>
        <Link className="button button--accent" to={actions.primary.href}>开始一局</Link>
      </section>
      <PublicFooter />
    </main>
  );
}
