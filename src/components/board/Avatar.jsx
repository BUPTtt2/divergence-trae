import React from 'react';
import { motion } from 'framer-motion';

const avatarSVGs = {
  explorer: (facingRight) => (
    <svg width="32" height="40" viewBox="0 0 32 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Hat */}
      <rect x="6" y="2" width="20" height="5" fill="#4CAF50" />
      <rect x="9" y="0" width="14" height="4" fill="#388E3C" />
      <rect x="14" y="0" width="4" height="7" fill="#2E7D32" />
      {/* Face */}
      <rect x="10" y="7" width="12" height="10" fill="#FFCC80" />
      {/* Eyes */}
      <rect x="12" y="9" width="3" height="3" fill="#333" />
      <rect x={facingRight ? '17' : '18'} y="9" width="3" height="3" fill="#333" />
      {/* Mouth */}
      <rect x="14" y="14" width="4" height="1" fill="#E65100" />
      {/* Body */}
      <rect x="9" y="17" width="14" height="12" fill="#1E88E5" />
      <rect x="10" y="18" width="4" height="4" fill="#1565C0" />
      <rect x="18" y="18" width="4" height="4" fill="#1565C0" />
      {/* Belt */}
      <rect x="9" y="25" width="14" height="2" fill="#5D4037" />
      {/* Legs */}
      <rect x="10" y="29" width="5" height="7" fill="#455A64" />
      <rect x="17" y="29" width="5" height="7" fill="#455A64" />
      {/* Boots */}
      <rect x="9" y="34" width="6" height="4" fill="#795548" />
      <rect x="17" y="34" width="6" height="4" fill="#795548" />
    </svg>
  ),

  ninja: (facingRight) => (
    <svg width="32" height="40" viewBox="0 0 32 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Hood */}
      <rect x="6" y="2" width="20" height="14" fill="#212121" />
      <rect x="4" y="8" width="4" height="10" fill="#212121" />
      <rect x="24" y="8" width="4" height="10" fill="#212121" />
      {/* Headband */}
      <rect x="5" y="9" width="22" height="3" fill="#F44336" />
      {/* Face opening */}
      <rect x="11" y="12" width="10" height="5" fill="#424242" />
      {/* Eyes */}
      <rect x="13" y="13" width="2" height="2" fill="#FFF" />
      <rect x="17" y="13" width="2" height="2" fill="#FFF" />
      {/* Body */}
      <rect x="7" y="16" width="18" height="14" fill="#37474F" />
      <rect x="8" y="17" width="6" height="5" fill="#263238" />
      <rect x="18" y="17" width="6" height="5" fill="#263238" />
      {/* Sash */}
      <rect x="7" y="26" width="18" height="2" fill="#F44336" />
      {/* Legs */}
      <rect x="9" y="28" width="5" height="8" fill="#37474F" />
      <rect x="18" y="28" width="5" height="8" fill="#37474F" />
      {/* Feet */}
      <rect x="8" y="34" width="6" height="4" fill="#212121" />
      <rect x="18" y="34" width="6" height="4" fill="#212121" />
    </svg>
  ),

  cat: (facingRight) => (
    <svg width="32" height="40" viewBox="0 0 32 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Ears */}
      <polygon points="8,8 10,0 14,7" fill="#FF9800" />
      <polygon points="18,7 22,0 24,8" fill="#FF9800" />
      <polygon points="9,8 11,2 13,7" fill="#FFB74D" />
      <polygon points="19,7 21,2 23,8" fill="#FFB74D" />
      {/* Face */}
      <rect x="7" y="6" width="18" height="14" fill="#FF9800" />
      {/* Eyes */}
      <ellipse cx="13" cy="11" rx="2" ry="2.5" fill="#FFF" />
      <ellipse cx="19" cy="11" rx="2" ry="2.5" fill="#FFF" />
      <ellipse cx={facingRight ? '13.5' : '12.5'} cy="11" rx="1" ry="2" fill="#333" />
      <ellipse cx={facingRight ? '19.5' : '18.5'} cy="11" rx="1" ry="2" fill="#333" />
      {/* Nose */}
      <polygon points="15,14 17,14 16,15" fill="#E91E63" />
      {/* Whiskers */}
      <line x1="4" y1="13" x2="11" y2="14" stroke="#333" strokeWidth="0.5" />
      <line x1="4" y1="15" x2="11" y2="15" stroke="#333" strokeWidth="0.5" />
      <line x1="21" y1="14" x2="28" y2="13" stroke="#333" strokeWidth="0.5" />
      <line x1="21" y1="15" x2="28" y2="15" stroke="#333" strokeWidth="0.5" />
      {/* Body */}
      <rect x="9" y="20" width="14" height="10" fill="#FF9800" />
      {/* Belly */}
      <ellipse cx="16" cy="25" rx="5" ry="4" fill="#FFE0B2" />
      {/* Legs */}
      <rect x="10" y="30" width="5" height="6" fill="#FF9800" />
      <rect x="17" y="30" width="5" height="6" fill="#FF9800" />
      {/* Paws */}
      <rect x="9" y="34" width="6" height="4" fill="#FFE0B2" />
      <rect x="17" y="34" width="6" height="4" fill="#FFE0B2" />
    </svg>
  ),

  robot: (facingRight) => (
    <svg width="32" height="40" viewBox="0 0 32 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Antenna */}
      <rect x="15" y="0" width="2" height="5" fill="#78909C" />
      <circle cx="16" cy="0" r="2" fill="#F44336" />
      {/* Head */}
      <rect x="7" y="5" width="18" height="13" fill="#B0BEC5" rx="2" />
      <rect x="8" y="6" width="16" height="11" fill="#CFD8DC" rx="1" />
      {/* Eyes */}
      <rect x="10" y="8" width="5" height="5" fill="#0D47A1" rx="1" />
      <rect x="17" y="8" width="5" height="5" fill="#0D47A1" rx="1" />
      <rect x="11" y="9" width="2" height="2" fill="#4FC3F7" />
      <rect x="18" y="9" width="2" height="2" fill="#4FC3F7" />
      {/* Mouth */}
      <rect x="11" y="15" width="10" height="1.5" fill="#546E7A" />
      {/* Neck */}
      <rect x="13" y="18" width="6" height="2" fill="#78909C" />
      {/* Body */}
      <rect x="7" y="20" width="18" height="12" fill="#1E88E5" rx="1" />
      <rect x="10" y="22" width="4" height="4" fill="#1565C0" rx="1" />
      <rect x="18" y="22" width="4" height="4" fill="#1565C0" rx="1" />
      {/* Chest light */}
      <circle cx="16" cy="29" r="2" fill="#76FF03" />
      {/* Legs */}
      <rect x="9" y="32" width="5" height="5" fill="#78909C" />
      <rect x="18" y="32" width="5" height="5" fill="#78909C" />
      {/* Feet */}
      <rect x="8" y="36" width="7" height="3" fill="#546E7A" rx="1" />
      <rect x="17" y="36" width="7" height="3" fill="#546E7A" rx="1" />
    </svg>
  ),

  alien: (facingRight) => (
    <svg width="32" height="40" viewBox="0 0 32 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Head */}
      <ellipse cx="16" cy="10" rx="10" ry="10" fill="#66BB6A" />
      {/* Eyes */}
      <ellipse cx={facingRight ? '12' : '14'} cy="8" rx="4" ry="5" fill="#FFF" />
      <ellipse cx={facingRight ? '20' : '18'} cy="8" rx="4" ry="5" fill="#FFF" />
      <ellipse cx={facingRight ? '13' : '14'} cy="8" rx="2" ry="3" fill="#1B5E20" />
      <ellipse cx={facingRight ? '20' : '19'} cy="8" rx="2" ry="3" fill="#1B5E20" />
      {/* Mouth */}
      <ellipse cx="16" cy="16" rx="3" ry="1.5" fill="#2E7D32" />
      {/* Body */}
      <rect x="8" y="20" width="16" height="12" fill="#9C27B0" rx="2" />
      <rect x="11" y="22" width="4" height="4" fill="#7B1FA2" rx="1" />
      <rect x="17" y="22" width="4" height="4" fill="#7B1FA2" rx="1" />
      {/* Belt gem */}
      <circle cx="16" cy="27" r="1.5" fill="#E040FB" />
      {/* Legs */}
      <rect x="9" y="32" width="5" height="5" fill="#7B1FA2" rx="1" />
      <rect x="18" y="32" width="5" height="5" fill="#7B1FA2" rx="1" />
      {/* Feet */}
      <ellipse cx="11.5" cy="37" rx="4" ry="2" fill="#4A148C" />
      <ellipse cx="20.5" cy="37" rx="4" ry="2" fill="#4A148C" />
    </svg>
  ),

  wizard: (facingRight) => (
    <svg width="32" height="40" viewBox="0 0 32 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Hat */}
      <polygon points="16,0 8,14 24,14" fill="#7B1FA2" />
      <rect x="6" y="12" width="20" height="4" fill="#9C27B0" />
      {/* Star on hat */}
      <polygon points="16,3 17,6 20,6 17.5,8 18.5,11 16,9 13.5,11 14.5,8 12,6 15,6" fill="#FFD54F" />
      {/* Face */}
      <rect x="10" y="16" width="12" height="8" fill="#FFCC80" />
      {/* Eyes */}
      <rect x="12" y="17" width="2" height="2" fill="#333" />
      <rect x="18" y="17" width="2" height="2" fill="#333" />
      {/* Beard */}
      <polygon points="10,24 22,24 20,32 12,32" fill="#FAFAFA" />
      <polygon points="12,32 20,32 18,36 14,36" fill="#EEEEEE" />
      {/* Body / robe */}
      <rect x="8" y="24" width="16" height="10" fill="#1565C0" rx="1" />
      {/* Robe trim */}
      <rect x="8" y="24" width="16" height="1.5" fill="#FFD54F" />
      {/* Robe detail */}
      <polygon points="8,34 4,38 28,38 24,34" fill="#1565C0" />
      <polygon points="8,34 5,38 27,38 24,34" fill="#0D47A1" />
      {/* Staff hint */}
      <rect x={facingRight ? '25' : '2'} y="4" width="2" height="30" fill="#795548" />
      <circle cx={facingRight ? '26' : '3'} cy="4" r="3" fill="#FFD54F" />
    </svg>
  ),
};

const idleAnimation = {
  y: [0, -2, 0],
  transition: {
    y: {
      duration: 1.6,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
};

const movingAnimation = {
  y: [0, -4, 0],
  transition: {
    y: {
      duration: 0.3,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
};

export default function Avatar({
  avatarType = 'explorer',
  x = 0,
  y = 0,
  moving = false,
  direction = 'right',
}) {
  const facingRight = direction === 'right';

  const renderAvatar = avatarSVGs[avatarType] || avatarSVGs.explorer;

  return (
    <motion.div
      style={{
        position: 'absolute',
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        transform: 'translate(-50%, -70%)',
        zIndex: 10,
        pointerEvents: 'none',
        imageRendering: 'pixelated',
      }}
      animate={{
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        scaleX: facingRight ? 1 : -1,
        ...(moving ? movingAnimation.y : idleAnimation.y),
      }}
      transition={{
        left: { type: 'spring', stiffness: 200, damping: 20 },
        top: { type: 'spring', stiffness: 200, damping: 20 },
        scaleX: { duration: 0.2 },
      }}
    >
      {renderAvatar(facingRight)}
    </motion.div>
  );
}
