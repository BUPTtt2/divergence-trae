import { motion } from 'framer-motion';

const variants = {
  primary: 'bg-[#00A86B] text-white border-[#00A86B] hover:bg-[#00B875] shadow-[0_2px_0_#008C57]',
  outline: 'bg-transparent text-[#00A86B] border-[#00A86B] hover:bg-[#00A86B]/10',
  danger: 'bg-[#D9534F] text-white border-[#D9534F] hover:bg-[#E0635F] shadow-[0_2px_0_#B84440]',
  ghost: 'bg-transparent text-[#1E1E2E] border-[#ccc] hover:bg-[#1E1E2E] hover:text-white hover:border-[#1E1E2E]',
  'ghost-dark': 'bg-transparent text-[#888] border-[#444] hover:bg-white/5 hover:text-[#ccc]',
  gold: 'bg-[#E6B800] text-[#1E1E2E] border-[#E6B800] hover:bg-[#F0C800] shadow-[0_2px_0_#CCAA00]',
};

export default function Button({ children, variant = 'primary', onClick, disabled, className = '', icon, size = 'md', ...props }) {
  const sizes = { sm: 'px-3 py-1 text-[10px]', md: 'px-4 py-2 text-[11px]', lg: 'px-6 py-3 text-xs' };
  return (
    <motion.button
      whileHover={!disabled ? { y: -2, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' } : {}}
      whileTap={!disabled ? { y: 0, scale: 0.97 } : {}}
      className={`
        border border-pixel font-mono tracking-wider uppercase
        transition-colors duration-150 cursor-pointer inline-flex items-center justify-center gap-2
        disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100
        ${sizes[size]} ${variants[variant] || variants.primary}
        ${className}
      `}
      onClick={onClick}
      disabled={disabled}
      {...props}
    >
      {icon && <span>{icon}</span>}
      {children}
    </motion.button>
  );
}
