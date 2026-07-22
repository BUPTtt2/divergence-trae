import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './AchievementToast.css';

let toastId = 0;
const listeners = new Set();

export function showAchievementToast(achievement) {
  const id = ++toastId;
  listeners.forEach((fn) => fn({ id, ...achievement }));
  return id;
}

export default function AchievementToast() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const handleNewToast = (toast) => {
      setToasts((prev) => [...prev, toast]);
      
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, toast.duration || 4000);
    };

    listeners.add(handleNewToast);
    return () => listeners.delete(handleNewToast);
  }, []);

  return (
    <div className="achievement-toast-container">
      <AnimatePresence>
        {toasts.map((toast, index) => (
          <motion.div
            key={toast.id}
            initial={{ x: 400, opacity: 0, scale: 0.9 }}
            animate={{ x: 0, opacity: 1, scale: 1 }}
            exit={{ x: 400, opacity: 0, scale: 0.9 }}
            transition={{ 
              type: 'spring', 
              stiffness: 300, 
              damping: 30,
              delay: index * 0.1 
            }}
            className="achievement-toast"
            style={{ marginBottom: index > 0 ? 12 : 0 }}
          >
            <div className="achievement-toast-glow" />
            
            <div className="achievement-toast-content">
              <div className="achievement-toast-icon">
                <span className="achievement-icon-text">{toast.icon || '☯'}</span>
                <div className="achievement-icon-shine" />
              </div>
              
              <div className="achievement-toast-info">
                <div className="achievement-toast-label">成就解锁</div>
                <div className="achievement-toast-name">{toast.name}</div>
                <div className="achievement-toast-desc">{toast.description}</div>
                {toast.reward && (
                  <div className="achievement-toast-reward">
                    <span>+{toast.reward} 经验</span>
                  </div>
                )}
              </div>
            </div>

            <div className="achievement-toast-corner top-left" />
            <div className="achievement-toast-corner top-right" />
            <div className="achievement-toast-corner bottom-left" />
            <div className="achievement-toast-corner bottom-right" />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
