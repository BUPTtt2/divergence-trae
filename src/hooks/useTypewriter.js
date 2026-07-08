import { useState, useEffect, useRef } from 'react';

export function useTypewriter(text, speed = 30, { enabled = true, onComplete } = {}) {
  const [displayed, setDisplayed] = useState('');
  const indexRef = useRef(0);

  useEffect(() => {
    if (!enabled || !text) {
      setDisplayed(text || '');
      return;
    }
    indexRef.current = 0;
    setDisplayed('');
    const interval = setInterval(() => {
      indexRef.current++;
      if (indexRef.current <= text.length) {
        setDisplayed(text.slice(0, indexRef.current));
      } else {
        clearInterval(interval);
        onComplete?.();
      }
    }, speed);
    return () => clearInterval(interval);
  }, [text, speed, enabled]);

  return displayed;
}
