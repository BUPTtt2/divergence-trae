import { BrowserRouter, Routes, Route, useLocation, Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Component, lazy, Suspense, useEffect } from 'react';
import { GameProvider } from './context/GameContext';
import { ThemeProvider } from './context/ThemeContext';
import { SoundProvider } from './context/SoundContext';
import { AuthProvider } from './context/AuthContext.jsx';
import { extendTHREE } from './utils/extendThree';
import DraggableCompass from './components/fx/DraggableCompass';
import AchievementToast from './components/AchievementToast';
import FollowUpReminder from './components/FollowUpReminder';
import FeedbackDialog from './components/feedback/FeedbackDialog.jsx';
import BrandMark from './components/brand/BrandMark.jsx';
import AppNav from './components/AppNav';
import { fetchAgentPersonas } from './services/inferenceEngine';
import { tracker, initWebVitals } from './services/tracker';
import { shouldShowGlobalCompass } from './game/layoutState';
import { loadWithRetry } from './utils/lazyRetry';
import Game from './pages/Game';
import {
  resetSharedDeviceSession,
} from './utils/sharedDeviceSession.js';

/* 有限重试：失败后交给 ErrorBoundary，绝不留下永久加载态 */
function lazyRetry(loader) {
  return lazy(() => loadWithRetry(loader));
}

function InkLoading() {
  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#FAF8F0',
      fontFamily: '"PingFang SC", "Noto Sans SC", system-ui, sans-serif',
    }}>
      <div style={{
        width: 86,
        animation: 'brandPulse 1.2s ease-in-out infinite',
      }}><BrandMark compact /></div>
      <div style={{
        fontSize: 12,
        color: '#59635e',
        marginTop: 18,
        letterSpacing: '0.18em',
      }}>正在整理推演现场</div>
      <style>{`
        @keyframes brandPulse {
          0%, 100% { opacity: .62; transform: translateY(0); }
          50% { opacity: 1; transform: translateY(-4px); }
        }
        @media (prefers-reduced-motion: reduce) { .yance-brand { animation: none !important; } }
      `}</style>
    </div>
  );
}

/* 页面级代码分割：每个页面独立 chunk，减小首屏包体积 */
const Landing = lazyRetry(() => import('./pages/Landing'));
const Scenarios = lazyRetry(() => import('./pages/Scenarios'));
const Collection = lazyRetry(() => import('./pages/Collection'));
const Community = lazyRetry(() => import('./pages/Community'));
const Daily = lazyRetry(() => import('./pages/Daily'));
const Calendar = lazyRetry(() => import('./pages/Calendar'));
const Dictionary = lazyRetry(() => import('./pages/Dictionary'));
const Agents = lazyRetry(() => import('./pages/Agents'));
const Legal = lazyRetry(() => import('./pages/Legal'));
const Privacy = lazyRetry(() => import('./pages/Privacy'));
const Ops = lazyRetry(() => import('./pages/Ops'));
const AccountAction = lazyRetry(() => import('./pages/AccountAction'));

/* ErrorBoundary - 防止子组件抛错导致整页白屏 */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorStack: '', componentStack: '' };
  }

  static getDerivedStateFromError(error) {
    return { 
      hasError: true, 
      error, 
      errorStack: error ? (error.stack || error.message || 'Unknown error') : 'Unknown error',
    };
  }

  componentDidCatch(error, errorInfo) {
    const stack = error ? (error.stack || error.message || 'Unknown') : 'Unknown';
    const compStack = errorInfo?.componentStack || 'Unknown component';
    console.error('=== ErrorBoundary 捕获 ===');
    console.error('Error:', error);
    console.error('Stack:', stack);
    console.error('Component:', compStack);
    console.error('============================');
    this.setState({ errorStack: stack, componentStack: compStack });
    // 上报错误到后端监控
    try {
      tracker.trackError(error?.message || 'Unknown error', { stack: `${stack}\n---Component---\n${compStack}` });
    } catch { /* ignore */ }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#FAF6EC',
          color: '#1A1410',
          fontFamily: '"Ma Shan Zheng", "Noto Serif SC", serif',
          padding: '20px',
        }}>
          <div style={{ width: 72, marginBottom: 18 }}><BrandMark compact /></div>
          <h2 style={{ fontSize: 22, marginBottom: 8 }}>这一页暂时没有加载完整</h2>
          <p style={{ fontSize: 12, color: '#7A7468', marginBottom: 12, lineHeight: 1.7, textAlign: 'center' }}>
            刷新后可以继续；错误编号已交给系统记录。
          </p>
          <div style={{ 
            fontSize: 10, 
            color: '#9A9488', 
            backgroundColor: '#F5F2EA', 
            padding: '10px', 
            borderRadius: '4px', 
            maxWidth: '90%', 
            maxHeight: '150px', 
            overflow: 'auto', 
            marginBottom: '16px',
            fontFamily: 'monospace',
          }}>
            <div>错误: {this.state.error?.message || 'Unknown'}</div>
            <div style={{ marginTop: '4px' }}>堆栈: {this.state.errorStack.slice(0, 300)}...</div>
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '8px 24px',
              backgroundColor: '#A8472E',
              color: '#FAF6EC',
              border: 'none',
              borderRadius: 2,
              cursor: 'pointer',
              fontSize: 12,
              fontFamily: '"Ma Shan Zheng", serif',
              letterSpacing: '0.2em',
            }}
          >
            重新加载
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/* 404 页面 */
function NotFound() {
  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#F2EDE0',
      color: '#16161D',
      fontFamily: '"Noto Serif SC", serif',
    }}>
      <div style={{ fontSize: '64px', marginBottom: '16px', opacity: 0.2 }}>☷</div>
      <h2 style={{ fontSize: '24px', marginBottom: '8px' }}>此路不通</h2>
      <p style={{ fontSize: '12px', color: '#7A7468', marginBottom: '24px' }}>
        所寻之径不在卦中
      </p>
      <Link
        to="/"
        style={{
          padding: '8px 24px',
          backgroundColor: '#16161D',
          color: '#F2EDE0',
          textDecoration: 'none',
          borderRadius: '3px',
          fontSize: '12px',
        }}
      >
        返回首页
      </Link>
    </div>
  );
}

function AnimatedRoutes() {
  const location = useLocation();
  const isGame = location.pathname === '/sandbox';
  const isLanding = location.pathname === '/';
  // 推演台和首页有自己的导航/沉浸设计，不显示全局 AppNav
  const showGlobalNav = !isGame && !isLanding;

  return (
    <>
      {showGlobalNav && <AppNav variant="light" />}
      <AnimatePresence mode="wait">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className={isGame ? 'h-screen' : ''}
        >
          <Suspense fallback={<InkLoading />}>
            <Routes location={location}>
              <Route path="/" element={<ErrorBoundary><Landing /></ErrorBoundary>} />
              <Route path="/daily" element={<ErrorBoundary><Daily /></ErrorBoundary>} />
              <Route path="/scenarios" element={<ErrorBoundary><Scenarios /></ErrorBoundary>} />
              <Route path="/sandbox" element={
                <ErrorBoundary>
                  <Game />
                </ErrorBoundary>
              } />
              <Route path="/agents" element={
                <ErrorBoundary>
                  <Agents />
                </ErrorBoundary>
              } />
              <Route path="/cards" element={<ErrorBoundary><Collection /></ErrorBoundary>} />
              <Route path="/community" element={<ErrorBoundary><Community /></ErrorBoundary>} />
              <Route path="/calendar" element={<ErrorBoundary><Calendar /></ErrorBoundary>} />
              <Route path="/dictionary" element={<ErrorBoundary><Dictionary /></ErrorBoundary>} />
              <Route path="/legal" element={<ErrorBoundary><Legal /></ErrorBoundary>} />
              <Route path="/privacy" element={<ErrorBoundary><Privacy /></ErrorBoundary>} />
              <Route path="/ops" element={<ErrorBoundary><Ops /></ErrorBoundary>} />
              <Route path="/account/verify-email" element={<ErrorBoundary><AccountAction /></ErrorBoundary>} />
              <Route path="/account/reset-password" element={<ErrorBoundary><AccountAction /></ErrorBoundary>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </motion.div>
      </AnimatePresence>
      {shouldShowGlobalCompass(location.pathname) && <DraggableCompass />}
    </>
  );
}

export default function App() {
  extendTHREE();

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const CHANNEL = 'yance-tab-sync';
    const bc = new BroadcastChannel(CHANNEL);
    bc.postMessage({ type: 'TAB_OPEN', url: window.location.href });
    bc.onmessage = (e) => {
      if (e.data?.type === 'TAB_OPEN' && e.data.url !== window.location.href) {
        console.warn('[Tab] 检测到另一个标签页打开');
      }
      if (e.data?.type === 'KIOSK_HANDOFF') {
        tracker.prepareForHandoff();
        resetSharedDeviceSession();
        window.location.replace('/sandbox?new=1&kiosk=1&handoff=1');
      }
    };
    return () => bc.close();
  }, []);

  // P0: 应用启动时从后端加载权威 persona（后端 agentPool.js 为单一来源）
  useEffect(() => {
    fetchAgentPersonas();
    // 初始化 Web Vitals 性能监控
    initWebVitals();
    if (new URLSearchParams(window.location.search).get('handoff') === '1') {
      tracker.track('kiosk_handoff_completed');
    }
  }, []);

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <SoundProvider>
          <BrowserRouter>
            <AuthProvider>
              <GameProvider>
                <AnimatedRoutes />
                <AchievementToast />
                <FollowUpReminder />
                <FeedbackDialog />
              </GameProvider>
            </AuthProvider>
          </BrowserRouter>
        </SoundProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
