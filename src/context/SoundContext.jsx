import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const SoundContext = createContext();

export const useSound = () => {
  const context = useContext(SoundContext);
  if (!context) {
    throw new Error('useSound must be used within a SoundProvider');
  }
  return context;
};

export const SoundProvider = ({ children }) => {
  const [isMuted, setIsMuted] = useState(() => {
    try {
      const saved = localStorage.getItem('yance_sound');
      if (saved !== null) return saved === 'muted';
      return false;
    } catch {
      return false;
    }
  });

  const [volume, setVolume] = useState(() => {
    try {
      const saved = localStorage.getItem('yance_volume');
      if (saved !== null) return parseFloat(saved);
      return 0.5;
    } catch {
      return 0.5;
    }
  });

  useEffect(() => {
    localStorage.setItem('yance_sound', isMuted ? 'muted' : 'enabled');
  }, [isMuted]);

  useEffect(() => {
    localStorage.setItem('yance_volume', volume.toString());
  }, [volume]);

  const toggleMute = useCallback(() => {
    setIsMuted(prev => !prev);
  }, []);

  const playClick = useCallback(() => {
    if (isMuted) return;
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(400, audioContext.currentTime + 0.1);
      gainNode.gain.setValueAtTime(0.1 * volume, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.1);
    } catch (e) { /* ignore */ }
  }, [isMuted, volume]);

  const playSuccess = useCallback(() => {
    if (isMuted) return;
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const notes = [523.25, 659.25, 783.99];
      notes.forEach((freq, i) => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        oscillator.frequency.setValueAtTime(freq, audioContext.currentTime + i * 0.1);
        gainNode.gain.setValueAtTime(0.08 * volume, audioContext.currentTime + i * 0.1);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + i * 0.1 + 0.2);
        oscillator.start(audioContext.currentTime + i * 0.1);
        oscillator.stop(audioContext.currentTime + i * 0.1 + 0.2);
      });
    } catch (e) { /* ignore */ }
  }, [isMuted, volume]);

  return (
    <SoundContext.Provider value={{ isMuted, toggleMute, volume, setVolume, playClick, playSuccess }}>
      {children}
    </SoundContext.Provider>
  );
};