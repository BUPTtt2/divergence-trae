import { BrowserRouter, Routes, Route, useLocation, Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Component } from 'react';
import { GameProvider } from './context/GameContext';
import Landing from './pages/Landing';
import Scenarios from './pages/Scenarios';
import Game from './pages/Game';
import Collection from './pages/Collection';
import Community from './pages/Community';
import DraggableCompass from './components/fx/DraggableCompass';

/* ErrorBoundary - 防止子组件抛错导致整页白屏 */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary 捕获:', error, errorInfo);
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
        }}>
          <div style={{ fontSize: 56, marginBottom: 16, opacity: 0.3, color: '#A8472E' }}>☯</div>
          <h2 style={{ fontSize: 22, marginBottom: 8, letterSpacing: '0.2em' }}>推演走神了</h2>
          <p style={{ fontSize: 12, color: '#7A7468', marginBottom: 24, lineHeight: 1.7 }}>
            卦象暂时散去, 刷新一下即可继续。
          </p>
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

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className={isGame ? 'h-screen' : ''}
      >
        <Routes location={location}>
          <Route path="/" element={<Landing />} />
          <Route path="/scenarios" element={<Scenarios />} />
          <Route path="/sandbox" element={<Game />} />
          <Route path="/cards" element={<Collection />} />
          <Route path="/community" element={<Community />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <GameProvider>
          <AnimatedRoutes />
          {/* 悬浮八卦罗盘 - 所有页面通用 (fixed, 拖拽位置 localStorage 持久化) */}
          <DraggableCompass />
        </GameProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
