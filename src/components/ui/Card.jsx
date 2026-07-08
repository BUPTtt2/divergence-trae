export default function Card({ children, className = '', hoverable = false, dark = false, ...props }) {
  return (
    <div
      className={`
        border border-pixel relative overflow-hidden
        font-mono
        ${dark
          ? 'bg-[#1E1E2E] border-[#333] text-[#ccc]'
          : 'bg-[#FDFAF5] border-[#ddd] text-[#333]'
        }
        ${hoverable ? 'hover:-translate-y-1 hover:shadow-[0_6px_20px_rgba(0,0,0,0.12)] transition-all duration-200 cursor-pointer' : ''}
        ${className}
      `}
      {...props}
    >
      {/* Card thickness shadow */}
      <div className={`absolute -bottom-[2px] left-0 right-0 h-[2px] ${dark ? 'bg-black/30' : 'bg-black/8'}`} />
      {children}
    </div>
  );
}
