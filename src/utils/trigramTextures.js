/**
 * 水墨宣纸风格符文纹理
 * 宣纸白底 + 水墨色线条 + 淡金色点缀
 */
import * as THREE from 'three';

const TRIGRAM_LINES = {
  '☰': [1, 1, 1], '☷': [0, 0, 0], '☳': [1, 0, 0], '☴': [0, 1, 1],
  '☵': [0, 1, 0], '☲': [1, 0, 1], '☶': [0, 0, 1], '☱': [1, 1, 0], '☯': null,
};

const TRIGRAM_NAMES = {
  '☰': '乾', '☷': '坤', '☳': '震', '☴': '巽',
  '☵': '坎', '☲': '离', '☶': '艮', '☱': '兑',
};

const ALL_TRIGRAMS = ['☰', '☷', '☳', '☴', '☵', '☲', '☶', '☱'];

const textureCache = new Map();

function drawYao(ctx, cx, cy, width, height, type, color) {
  ctx.fillStyle = color;
  if (type === 1) {
    ctx.beginPath();
    ctx.roundRect(cx - width/2, cy - height/2, width, height, height/2);
    ctx.fill();
  } else {
    const gap = width * 0.22;
    const segW = (width - gap) / 2;
    ctx.beginPath();
    ctx.roundRect(cx - width/2, cy - height/2, segW, height, height/2);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(cx + gap/2, cy - height/2, segW, height, height/2);
    ctx.fill();
  }
}

function drawTaiji(ctx, cx, cy, radius, inkColor, lightColor) {
  ctx.save();

  // 水墨晕染外圈
  const grad = ctx.createRadialGradient(cx, cy, radius * 0.4, cx, cy, radius * 1.05);
  grad.addColorStop(0, inkColor + '00');
  grad.addColorStop(0.9, inkColor + '00');
  grad.addColorStop(1, inkColor + '35');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 1.05, 0, Math.PI * 2);
  ctx.fill();

  // 整圆底 = 阴（黑）
  ctx.fillStyle = inkColor;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  // 阳 = 左半（白）
  ctx.fillStyle = lightColor;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, Math.PI / 2, -Math.PI / 2, true);
  ctx.fill();

  // 阳凸出到阴：上半（cx, cy - r/2）小圆 = 阴（黑），让阳下半出现黑色鱼头
  ctx.fillStyle = inkColor;
  ctx.beginPath();
  ctx.arc(cx, cy - radius / 2, radius / 2, 0, Math.PI * 2);
  ctx.fill();

  // 阴凸出到阳：下半（cx, cy + r/2）小圆 = 阳（白），让阴下半出现白色鱼头
  ctx.fillStyle = lightColor;
  ctx.beginPath();
  ctx.arc(cx, cy + radius / 2, radius / 2, 0, Math.PI * 2);
  ctx.fill();

  // 阴鱼眼（上方阴鱼头中的白点）
  ctx.fillStyle = lightColor;
  ctx.beginPath();
  ctx.arc(cx, cy - radius / 2, radius * 0.16, 0, Math.PI * 2);
  ctx.fill();

  // 阳鱼眼（下方阳鱼头中的黑点）
  ctx.fillStyle = inkColor;
  ctx.beginPath();
  ctx.arc(cx, cy + radius / 2, radius * 0.16, 0, Math.PI * 2);
  ctx.fill();

  // 外圈墨线
  ctx.strokeStyle = inkColor;
  ctx.lineWidth = radius * 0.05;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

/**
 * 专用光球内部旋转的太极图（无文字，水墨金边，背景透明）
 * 用于 LightOrb 中心的旋转层
 */
export function createTaijiTexture(size = 256) {
  const cacheKey = `taiji-rotating-${size}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);

  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  const cx = size / 2, cy = size / 2;
  const r = size * 0.42;

  ctx.clearRect(0, 0, size, size);

  // 完整阴阳鱼 - 水墨风格
  drawTaiji(ctx, cx, cy, r, '#1A1410', '#F5E8B8');

  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  tex.anisotropy = 4;
  textureCache.set(cacheKey, tex);
  return tex;
}

/**
 * 专用光球底部的大八卦阵 + 罗盘
 * 风格：黑白水墨 + 金边 + 24 山刻度 + 中心阴阳鱼
 * 8 方卦象 + 卦名（先天八卦位）
 */
export function createBaguaCompassTexture(size = 512) {
  const cacheKey = `bagua-compass-${size}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);

  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  const cx = size / 2, cy = size / 2;
  const R = size * 0.46;   // 外八角半径
  const r = size * 0.30;   // 内八角半径
  const innerR = size * 0.16; // 中心阴阳鱼半径
  const trigramR = size * 0.38; // 卦象位置半径（在外八角内）

  ctx.clearRect(0, 0, size, size);

  // 1) 八角形外框 - 金色双线
  ctx.strokeStyle = '#C8A850';
  ctx.lineWidth = 3;
  ctx.shadowColor = '#F0D890';
  ctx.shadowBlur = 14;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 8;
    const x = cx + Math.cos(a) * R;
    const y = cy + Math.sin(a) * R;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.shadowBlur = 0;

  // 2) 内八角
  ctx.strokeStyle = '#C8A850';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 8;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();

  // 3) 罗盘 24 山刻度
  ctx.strokeStyle = '#C8A850';
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2 - Math.PI / 2;
    const isMajor = i % 3 === 0;
    const len = isMajor ? size * 0.04 : size * 0.02;
    const x1 = cx + Math.cos(a) * (R - len);
    const y1 = cy + Math.sin(a) * (R - len);
    const x2 = cx + Math.cos(a) * R;
    const y2 = cy + Math.sin(a) * R;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineWidth = isMajor ? 1.2 : 0.5;
    ctx.stroke();
  }

  // 4) 8 方位短线连接内外八角
  ctx.strokeStyle = '#C8A850';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 8;
    const x1 = cx + Math.cos(a) * r;
    const y1 = cy + Math.sin(a) * r;
    const x2 = cx + Math.cos(a) * R;
    const y2 = cy + Math.sin(a) * R;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // 5) 8 卦象 + 卦名（先天八卦位）
  const trigramPos = [
    { tri: '☰', name: '乾' }, // 0: 上（南）
    { tri: '☱', name: '兑' }, // 1: 东南
    { tri: '☲', name: '离' }, // 2: 东
    { tri: '☳', name: '震' }, // 3: 东北
    { tri: '☷', name: '坤' }, // 4: 下（北）
    { tri: '☵', name: '坎' }, // 5: 西北
    { tri: '☶', name: '艮' }, // 6: 西
    { tri: '☴', name: '巽' }, // 7: 西南
  ];

  trigramPos.forEach((p, i) => {
    // 先天八卦位（从顶部 -π/2 开始，顺时针）
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const tx = cx + Math.cos(a) * trigramR;
    const ty = cy + Math.sin(a) * trigramR;

    // 卦象线条
    const lines = TRIGRAM_LINES[p.tri];
    if (lines) {
      const lineH = size * 0.018;
      const lineW = size * 0.075;
      const spacing = size * 0.032;
      const startY = ty - spacing;
      ctx.fillStyle = '#1A1410';
      lines.forEach((type, j) => {
        drawYao(ctx, tx, startY + j * spacing, lineW, lineH, type, '#1A1410');
      });
    }

    // 卦名（卦象上方）
    ctx.font = `600 ${size * 0.05}px "Ma Shan Zheng", "ZCOOL XiaoWei", serif`;
    ctx.fillStyle = '#1A1410';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const nameOffset = size * 0.07;
    const nx = tx + Math.cos(a) * nameOffset;
    const ny = ty + Math.sin(a) * nameOffset;
    ctx.fillText(p.name, nx, ny);
  });

  // 6) 中心阴阳鱼
  drawTaiji(ctx, cx, cy, innerR, '#1A1410', '#FAF6E8');

  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  tex.anisotropy = 4;
  textureCache.set(cacheKey, tex);
  return tex;
}

function drawCenterSymbol(ctx, cx, cy, r, trigram, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  switch (trigram) {
    case '☰':
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(cx, cy, r * (0.3 + i * 0.3), 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    case '☷':
      ctx.strokeRect(cx - r, cy - r, r * 2, r * 2);
      ctx.beginPath();
      ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy);
      ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r);
      ctx.stroke();
      break;
    case '☳':
      ctx.beginPath();
      ctx.moveTo(cx - r*0.6, cy - r);
      ctx.lineTo(cx + r*0.2, cy - r*0.2);
      ctx.lineTo(cx - r*0.2, cy + r*0.2);
      ctx.lineTo(cx + r*0.6, cy + r);
      ctx.stroke();
      break;
    case '☴':
      ctx.beginPath();
      for (let i = 0; i <= 24; i++) {
        const t = i / 24;
        const x = cx - r + t * r * 2;
        const y = cy + Math.sin(t * Math.PI * 3) * r * 0.4;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      break;
    case '☵':
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.bezierCurveTo(cx + r*0.7, cy - r*0.2, cx + r*0.5, cy + r, cx, cy + r);
      ctx.bezierCurveTo(cx - r*0.5, cy + r, cx - r*0.7, cy - r*0.2, cx, cy - r);
      ctx.stroke();
      break;
    case '☲':
      ctx.beginPath();
      ctx.moveTo(cx, cy + r);
      ctx.bezierCurveTo(cx - r*0.7, cy + r*0.2, cx - r*0.4, cy - r*0.6, cx, cy - r);
      ctx.bezierCurveTo(cx + r*0.4, cy - r*0.6, cx + r*0.7, cy + r*0.2, cx, cy + r);
      ctx.stroke();
      break;
    case '☶':
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r, cy + r);
      ctx.lineTo(cx - r, cy + r);
      ctx.closePath();
      ctx.stroke();
      break;
    case '☱':
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(cx, cy + r*0.2 - i*r*0.4, r * (0.7 - i*0.15), Math.PI*0.15, Math.PI*0.85, false);
        ctx.stroke();
      }
      break;
  }
  ctx.restore();
}

/**
 * 水墨风格符文纹理 - 宣纸白底 + 水墨线条
 */
export function createRuneTexture(trigram, options = {}) {
  const {
    color = '#3A3530',
    accentColor = '#C8A850',
    size = 256,
    showName = true,
  } = options;

  const cacheKey = `ink-${trigram}-${color}-${accentColor}-${size}-${showName}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cx = size / 2;
  const cy = size / 2;

  ctx.clearRect(0, 0, size, size);

  // 中心符号
  if (trigram !== '☯') {
    drawCenterSymbol(ctx, cx, cy - size * 0.08, size * 0.1, trigram, accentColor);
  }

  // 卦象或太极
  if (trigram === '☯') {
    drawTaiji(ctx, cx, cy - size * 0.02, size * 0.18, color, '#FAF8F0');
  } else {
    const lines = TRIGRAM_LINES[trigram];
    if (lines) {
      const lineH = size * 0.03;
      const lineW = size * 0.2;
      const spacing = size * 0.06;
      const startY = cy + size * 0.08;
      ctx.fillStyle = color;
      lines.forEach((type, i) => {
        drawYao(ctx, cx, startY + i * spacing, lineW, lineH, type, color);
      });
    }
  }

  // 卦名
  if (showName && TRIGRAM_NAMES[trigram]) {
    ctx.save();
    ctx.font = `400 ${size * 0.065}px "Ma Shan Zheng", "ZCOOL XiaoWei", serif`;
    ctx.fillStyle = accentColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(TRIGRAM_NAMES[trigram], cx, cy + size * 0.3);
    ctx.restore();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  texture.anisotropy = 4;
  textureCache.set(cacheKey, texture);
  return texture;
}

/**
 * 卦象纹理 - 金色 + 阴/阳爻 + 卦名
 * 给 3D 卦符粒子、Agent 八角棱柱、ChoiceHud 用
 */
export function createTrigramPlateTexture(trigram, options = {}) {
  const {
    color = '#F0D890',      // 金色文字
    bgColor = 'rgba(20,16,8,0.85)', // 半透明深色
    size = 256,
    showName = true,
    glow = true,
  } = options;

  const cacheKey = `trigram-plate-${trigram}-${color}-${size}-${showName}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);

  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  const cx = size / 2, cy = size / 2;

  ctx.clearRect(0, 0, size, size);

  // 八角形外框 - 金色双线
  const R = size * 0.42;
  const r = size * 0.32;
  ctx.lineJoin = 'round';

  // 外八角
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  if (glow) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
  }
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 8;
    const x = cx + Math.cos(a) * R;
    const y = cy + Math.sin(a) * R;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.shadowBlur = 0;

  // 内八角
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 8;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();

  // 8 方位短线
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 8;
    const x1 = cx + Math.cos(a) * r;
    const y1 = cy + Math.sin(a) * r;
    const x2 = cx + Math.cos(a) * R;
    const y2 = cy + Math.sin(a) * R;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // 卦象（中心）
  if (trigram !== '☯' && TRIGRAM_LINES[trigram]) {
    const lines = TRIGRAM_LINES[trigram];
    const lineH = size * 0.025;
    const lineW = size * 0.18;
    const spacing = size * 0.05;
    const startY = cy - spacing;
    lines.forEach((type, i) => {
      drawYao(ctx, cx, startY + i * spacing, lineW, lineH, type, color);
    });
  }

  // 卦名
  if (showName && TRIGRAM_NAMES[trigram]) {
    ctx.font = `400 ${size * 0.07}px "Ma Shan Zheng", "ZCOOL XiaoWei", serif`;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.fillText(TRIGRAM_NAMES[trigram], cx, cy + size * 0.22);
    ctx.shadowBlur = 0;
  }

  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  tex.anisotropy = 4;
  textureCache.set(cacheKey, tex);
  return tex;
}

/**
 * 光晕纹理
 */
export function createGlowTexture(color = '#F0D890', size = 256) {
  const cacheKey = `glow-ink-${color}-${size}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);

  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, size, size);
  const grad = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
  grad.addColorStop(0, color + 'BB');
  grad.addColorStop(0.2, color + '66');
  grad.addColorStop(0.5, color + '22');
  grad.addColorStop(1, color + '00');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  textureCache.set(cacheKey, texture);
  return texture;
}

export function createStarTexture(size = 64) {
  const cacheKey = `star-ink-${size}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);

  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
  g.addColorStop(0, 'rgba(200,168,80,0.6)');
  g.addColorStop(0.3, 'rgba(200,168,80,0.2)');
  g.addColorStop(1, 'rgba(200,168,80,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  const t = new THREE.CanvasTexture(canvas);
  t.needsUpdate = true;
  textureCache.set(cacheKey, t);
  return t;
}

export { TRIGRAM_LINES, TRIGRAM_NAMES, ALL_TRIGRAMS };
