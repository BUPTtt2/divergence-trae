import { NavLink } from 'react-router-dom';

const links = [
  { to: '/', label: '首页' },
  { to: '/scenarios', label: '推演' },
  { to: '/cards', label: '卡牌册' },
  { to: '/community', label: '社区' },
];

export default function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 h-10 bg-terminal z-50 flex items-center px-4 border-b border-[#444]">
      <span className="text-retro-green font-bold tracking-widest text-xs mr-8 cursor-pointer" onClick={() => window.location.href='/'}>演策</span>
      <div className="flex gap-6">
        {links.map(link => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) => `
              text-xs tracking-wider transition-colors duration-150
              ${isActive ? 'text-retro-green font-bold' : 'text-[#888] hover:text-white'}
            `}
          >
            {link.label}
          </NavLink>
        ))}
      </div>
      <div className="ml-auto flex items-center gap-3">
        <div className="w-2 h-2 rounded-full bg-retro-green animate-pulse" />
        <span className="text-[10px] text-[#888] tracking-wider">ONLINE</span>
      </div>
    </nav>
  );
}
