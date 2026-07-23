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
import YanChat from './components/YanChat';
import AppNav from './components/AppNav';

/* lazy import 重试：浏览器缓存旧 chunk hash 时自动刷新 */
function lazyRetry(fn, retries = 2) {
  return lazy(() =>
    fn().catch(async (err) => {
      if (retries <= 0) throw err;
      // 等待 600ms 后重试一次
      await new Promise((r) => setTimeout(r, 600));
      // 若仍是 chunk 加载失败，强制刷新页面让浏览器拉到新 index.html
      if (err && /Failed to fetch dynamically imported module|Importing a module script failed/i.test(err.message || '')) {
        if (retries === 1) {
          console.warn('[lazyRetry] chunk 加载失败，强制刷新页面');
          if (typeof window !== 'undefined') window.location.reload();
          return new Promise(() => {}); // 永远不 resolve，等刷新
        }
      }
      return lazyRetry(fn, retries - 1)();
    })
  );
}

/* 水墨风格 Loading 骨架屏 */
function InkLoading() {
  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#FAF8F0',
      fontFamily: '"Ma Shan Zheng", "Noto Serif SC", serif',
    }}>
      <div style={{
        fontSize: 48,
        color: '#A8472E',
        opacity: 0.6,
        animation: 'inkPulse 1.4s ease-in-out infinite',
      }}>☯</div>
      <div style={{
        fontSize: 13,
        color: '#7A7468',
        marginTop: 16,
        letterSpacing: '0.3em',
        opacity: 0.7,
      }}>水墨晕染中</div>
      <style>{`
        @keyframes inkPulse {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.08); }
        }
      `}</style>
    </div>
  );
}

/* 页面级代码分割：每个页面独立 chunk，减小首屏包体积 */
const Landing = lazyRetry(() => import('./pages/Landing'));
const Scenarios = lazyRetry(() => import('./pages/Scenarios'));
const Game = lazyRetry(() => import('./pages/Game'));
const Collection = lazyRetry(() => import('./pages/Collection'));
const Community = lazyRetry(() => import('./pages/Community'));
const Daily = lazyRetry(() => import('./pages/Daily'));
const Calendar = lazyRetry(() => import('./pages/Calendar'));
const Dictionary = lazyRetry(() => import('./pages/Dictionary'));
const Agents = lazyRetry(() => import('./pages/Agents'));
const Legal = lazyRetry(() => import('./pages/Legal'));
const Privacy = lazyRetry(() => import('./pages/Privacy'));

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
          <div style={{ fontSize: 56, marginBottom: 16, opacity: 0.3, color: '#A8472E' }}>☯</div>
          <h2 style={{ fontSize: 22, marginBottom: 8, letterSpacing: '0.2em' }}>推演走神了</h2>
          <p style={{ fontSize: 12, color: '#7A7468', marginBottom: 12, lineHeight: 1.7, textAlign: 'center' }}>
            卦象暂时散去, 刷新一下即可继续。
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
            重新推演
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
              <Route path="/" element={<Landing />} />
              <Route path="/daily" element={<Daily />} />
              <Route path="/scenarios" element={<Scenarios />} />
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
              <Route path="/cards" element={<Collection />} />
              <Route path="/community" element={<Community />} />
              <Route path="/calendar" element={<Calendar />} />
              <Route path="/dictionary" element={<Dictionary />} />
              <Route path="/legal" element={<Legal />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </motion.div>
      </AnimatePresence>
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
    };
    return () => bc.close();
  }, []);

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <SoundProvider>
          <BrowserRouter>
            <AuthProvider>
              <GameProvider>
                <AnimatedRoutes />
                <DraggableCompass />
                <AchievementToast />
                <FollowUpReminder />
                <YanChat />
              </GameProvider>
            </AuthProvider>
          </BrowserRouter>
        </SoundProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
