import { NavLink } from 'react-router-dom';

const navItems = [
  { to: '/', label: '首页', icon: '⌂' },
  { to: '/scenarios', label: '推演', icon: '◈' },
  { to: '/cards', label: '卡册', icon: '♦' },
  { to: '/community', label: '社区', icon: '≡' },
];

export default function Sidebar() {
  return (
    <div className="w-14 bg-[#1E1E2E] border-r border-[#333] flex flex-col items-center pt-4 gap-1">
      {/* Logo */}
      <div className="w-8 h-8 border border-[#00A86B] flex items-center justify-center text-[#00A86B] text-xs font-bold mb-6">
        演
      </div>
      {navItems.map(item => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => `
            w-10 h-10 flex flex-col items-center justify-center gap-0.5
            text-[8px] font-mono tracking-wider transition-all duration-150
            ${isActive
              ? 'text-[#00A86B] bg-[#00A86B]/10 border-l-2 border-[#00A86B]'
              : 'text-[#666] hover:text-[#aaa] hover:bg-white/5 border-l-2 border-transparent'
            }
          `}
        >
          <span className="text-sm">{item.icon}</span>
          <span>{item.label}</span>
        </NavLink>
      ))}
    </div>
  );
}
