/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        'retro-green': '#00A86B',
        'paper': '#F5F1E8',
        'paper-dark': '#E8E2D5',
        'terminal': '#1A1A1A',
        'terminal-gray': '#2C2C2C',
        'gold': '#D4A017',
        'risk-red': '#C94C4C',
        'emotion-purple': '#9B59B6',
        'neutral-gray': '#888888',
        'qiangu': '#E8A830',
        'luxiang': '#00A86B',
        'fengyan': '#D94F4F',
        'xinhe': '#C77DBA',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Courier New', 'monospace'],
      },
      borderWidth: {
        'pixel': '1px',
      },
      borderRadius: {
        'none': '0px',
        'sm': '2px',
      },
      animation: {
        'scanline': 'scanline 8s linear infinite',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'glow': 'glow 2s ease-in-out infinite',
        'float': 'float 3s ease-in-out infinite',
        'fog-breathe': 'fogBreathe 4s ease-in-out infinite',
      },
      keyframes: {
        scanline: {
          '0%': { backgroundPosition: '0 0' },
          '100%': { backgroundPosition: '0 100vh' },
        },
        pulse: {
          '0%, 100%': { transform: 'scale(1)', opacity: '1' },
          '50%': { transform: 'scale(1.02)', opacity: '0.9' },
        },
        glow: {
          '0%, 100%': { boxShadow: '0 0 5px rgba(0, 168, 107, 0.3)' },
          '50%': { boxShadow: '0 0 15px rgba(0, 168, 107, 0.6)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        fogBreathe: {
          '0%, 100%': { opacity: '0.6', transform: 'scale(1)' },
          '50%': { opacity: '0.8', transform: 'scale(1.01)' },
        },
      },
    },
  },
  plugins: [],
}
