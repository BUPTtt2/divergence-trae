import { useCallback, useRef } from 'react';

export function useSound() {
  const ctxRef = useRef(null);

  const ensureAudio = useCallback(() => {
    if (!ctxRef.current) {
      ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    return ctxRef.current;
  }, []);

  const playBeep = useCallback((freq, duration, volume = 0.1) => {
    try {
      const ctx = ensureAudio();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      gain.gain.value = volume;
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {
      /* ignore audio errors */
    }
  }, [ensureAudio]);

  const sfxClick = useCallback(() => playBeep(600, 0.06), [playBeep]);
  const sfxReveal = useCallback(() => {
    playBeep(440, 0.12);
    setTimeout(() => playBeep(880, 0.15), 130);
  }, [playBeep]);
  const sfxDiceRoll = useCallback(() => {
    for (let i = 0; i < 6; i++) {
      setTimeout(() => playBeep(300 + Math.random() * 400, 0.05), i * 100);
    }
  }, [playBeep]);
  const sfxFateReveal = useCallback(() => {
    playBeep(523, 0.15);
    setTimeout(() => playBeep(659, 0.15), 160);
    setTimeout(() => playBeep(784, 0.3), 320);
  }, [playBeep]);
  const sfxAchievement = useCallback(() => {
    playBeep(523, 0.1);
    setTimeout(() => playBeep(659, 0.1), 100);
    setTimeout(() => playBeep(784, 0.2), 200);
  }, [playBeep]);

  return { sfxClick, sfxReveal, sfxDiceRoll, sfxFateReveal, sfxAchievement, playBeep };
}
