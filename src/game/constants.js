import { COLORS } from '../components/board/layoutConfig';

export const BORDER_COLOR = '#C8A850';
export const GLOW_COLOR = '#F0D890';
export const RUST_COLOR = '#A8472E';
export const PAPER_COLOR = '#FAF6EC';

export const DEFAULT_CHOICES = [
  { id: 'opportunity', label: '抓住机会', color: COLORS.choice.opportunity, glowColor: '#E8B880', icon: '☰', gua: '大有' },
  { id: 'risk', label: '规避风险', color: COLORS.choice.risk, glowColor: '#E88080', icon: '☵', gua: '坎' },
  { id: 'stable', label: '稳守当前', color: COLORS.choice.stable, glowColor: '#80C8A8', icon: '☶', gua: '艮' },
  { id: 'explore', label: '探索新路', color: COLORS.choice.explore, glowColor: '#D8A8C8', icon: '☴', gua: '巽' },
];
