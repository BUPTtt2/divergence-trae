/**
 * 命签分享卡片生成器 - Canvas 2D 绘制 800×1100 PNG
 * 水墨风格：宣纸底 + 朱砂方孔 + 水墨斑驳 + 卦象符文
 *
 * 用法：
 *   import { generateShareCard, downloadShareCard } from '../utils/shareCardGenerator';
 *   const dataUrl = await generateShareCard(card);
 *   downloadShareCard(dataUrl, `${card.gua}-命签.png`);
 */

// 水墨色板
const INK = {
  paper: '#FAF8F0',         // 宣纸底
  paperDark: '#F0EBE0',     // 宣纸暗
  ink: '#1F1B16',           // 浓墨
  inkLight: '#4A4238',      // 淡墨
  inkFade: '#8A7F70',       // 灰墨
  cinnabar: '#B83A2C',      // 朱砂
  cinnabarLight: '#D4655A', // 朱砂淡
  gold: '#C8A850',          // 暖金
  goldLight: '#E8D890',     // 暖金淡
};

/**
 * 生成分享卡片 dataURL
 * @param {Object} card - 命签对象
 * @param {Object} [opts]
 * @param {string} [opts.yanSummary] - 演的总结
 * @param {Array<{name,color,note}>} [opts.agentNotes] - 智囊批注
 * @param {string} [opts.commit] - 用户承诺
 * @returns {Promise<string>} PNG dataURL
 */
export async function generateShareCard(card, opts = {}) {
  const W = 800, H = 1100;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // 1. 宣纸底 + 水墨晕染
  drawPaperBackground(ctx, W, H);

  // 2. 外框（双线，水墨边）
  drawDoubleBorder(ctx, W, H);

  // 3. 顶部朱砂印章（卦象）
  drawTrigramSeal(ctx, W, card);

  // 4. 卦名 + 五行
  drawGuaTitle(ctx, W, card);

  // 5. 卦辞（居中竖排，水墨书法体感）
  drawVerse(ctx, W, card);

  // 6. 四柱
  drawPillars(ctx, W, card);

  // 7. 智囊批注
  drawAdvisorNotes(ctx, W, opts.agentNotes || []);

  // 8. 抉择 + 演总结
  drawDecisionAndSummary(ctx, W, card, opts.yanSummary || '');

  // 9. 用户承诺
  drawCommit(ctx, W, H, opts.commit || card?.epilogue || '');

  // 10. 底部水印 + 日期
  drawFooter(ctx, W, H, card);

  return canvas.toDataURL('image/png');
}

/* ---------------- 私有绘制函数 ---------------- */

function drawPaperBackground(ctx, W, H) {
  // 宣纸底色渐变
  const grad = ctx.createRadialGradient(W / 2, H / 2, 100, W / 2, H / 2, H);
  grad.addColorStop(0, INK.paper);
  grad.addColorStop(1, INK.paperDark);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // 水墨斑驳：随机墨点
  ctx.save();
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const r = Math.random() * 40 + 5;
    const alpha = Math.random() * 0.04 + 0.01;
    ctx.fillStyle = `rgba(31,27,22,${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // 角落水墨晕染
  for (const [cx, cy] of [[0, 0], [W, 0], [0, H], [W, H]]) {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 220);
    g.addColorStop(0, 'rgba(31,27,22,0.08)');
    g.addColorStop(1, 'rgba(31,27,22,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

function drawDoubleBorder(ctx, W, H) {
  ctx.save();
  ctx.strokeStyle = INK.ink;
  ctx.lineWidth = 3;
  ctx.strokeRect(30, 30, W - 60, H - 60);
  ctx.lineWidth = 1;
  ctx.strokeRect(42, 42, W - 84, H - 84);
  // 四角朱砂小方印
  ctx.fillStyle = INK.cinnabar;
  const corners = [[42, 42], [W - 42, 42], [42, H - 42], [W - 42, H - 42]];
  for (const [x, y] of corners) {
    ctx.fillRect(x - 4, y - 4, 8, 8);
  }
  ctx.restore();
}

function drawTrigramSeal(ctx, W, card) {
  // 顶部中央朱砂方印 + 卦象符号
  const cx = W / 2;
  const cy = 130;
  const size = 110;
  ctx.save();
  // 朱砂方印
  ctx.fillStyle = INK.cinnabar;
  ctx.fillRect(cx - size / 2, cy - size / 2, size, size);
  // 内框
  ctx.strokeStyle = INK.paper;
  ctx.lineWidth = 2;
  ctx.strokeRect(cx - size / 2 + 8, cy - size / 2 + 8, size - 16, size - 16);
  // 卦象符号
  ctx.fillStyle = INK.paper;
  ctx.font = '60px "Ma Shan Zheng", "KaiTi", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(card.trigram || '☰', cx, cy + 4);
  ctx.restore();
}

function drawGuaTitle(ctx, W, card) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = INK.ink;
  ctx.font = 'bold 44px "Ma Shan Zheng", "KaiTi", serif';
  ctx.fillText(card.gua || '大有', W / 2, 250);
  // 五行
  ctx.fillStyle = INK.inkLight;
  ctx.font = '18px "KaiTi", serif';
  const element = card.guaElement || card.element || '火';
  ctx.fillText(`· 五行属 ${element} ·`, W / 2, 285);
  ctx.restore();
}

function drawVerse(ctx, W, card) {
  // 卦辞居中竖排（最多 4 列）
  const verse = (card.verse || '元亨利贞').slice(0, 24);
  ctx.save();
  ctx.fillStyle = INK.ink;
  ctx.font = '24px "KaiTi", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  // 简化：每 6 字一列，最多 4 列
  const chars = Array.from(verse);
  const colCount = Math.min(4, Math.ceil(chars.length / 6));
  const colWidth = 44;
  const startX = W / 2 - ((colCount - 1) * colWidth) / 2;
  for (let c = 0; c < colCount; c++) {
    const colChars = chars.slice(c * 6, (c + 1) * 6);
    for (let i = 0; i < colChars.length; i++) {
      ctx.fillText(colChars[i], startX + c * colWidth, 320 + i * 32);
    }
  }
  ctx.restore();
}

function drawPillars(ctx, W, card) {
  const pillars = card.pillars;
  if (!pillars) return;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = INK.inkFade;
  ctx.font = '13px "KaiTi", serif';
  ctx.fillText('四 柱', W / 2, 540);
  ctx.fillStyle = INK.inkLight;
  ctx.font = '17px "KaiTi", serif';
  const parts = [
    `${pillars.year}年`,
    `${pillars.month}月`,
    `${pillars.day}日`,
    `${pillars.hour}时`,
  ];
  ctx.fillText(parts.join('  ·  '), W / 2, 568);
  // 分隔线
  ctx.strokeStyle = INK.inkFade;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(120, 600);
  ctx.lineTo(W - 120, 600);
  ctx.stroke();
  ctx.restore();
}

function drawAdvisorNotes(ctx, W, agentNotes) {
  if (!agentNotes || agentNotes.length === 0) return;
  ctx.save();
  ctx.textAlign = 'left';
  ctx.fillStyle = INK.inkLight;
  ctx.font = '14px "KaiTi", serif';
  ctx.fillText('· 智囊批注 ·', 100, 630);
  ctx.font = '13px "KaiTi", serif';
  let y = 660;
  for (const a of agentNotes.slice(0, 4)) {
    // 智囊名
    ctx.fillStyle = a.color || INK.gold;
    ctx.fillText(`【${a.name}】`, 110, y);
    // 批注（截断）
    ctx.fillStyle = INK.inkLight;
    const note = (a.note || '').slice(0, 32);
    ctx.fillText(note, 180, y);
    y += 28;
  }
  ctx.restore();
}

function drawDecisionAndSummary(ctx, W, card, yanSummary) {
  ctx.save();
  // 抉择
  ctx.textAlign = 'center';
  ctx.fillStyle = INK.cinnabar;
  ctx.font = '16px "Ma Shan Zheng", "KaiTi", serif';
  ctx.fillText(`汝之抉择 · ${card.decision || card.title || ''}`, W / 2, 800);
  // 演总结
  if (yanSummary) {
    ctx.fillStyle = INK.inkLight;
    ctx.font = '13px "KaiTi", serif';
    wrapText(ctx, `演之总结：${yanSummary}`, W / 2, 830, W - 200, 22, 4);
  } else if (card.summary) {
    ctx.fillStyle = INK.inkLight;
    ctx.font = '13px "KaiTi", serif';
    wrapText(ctx, card.summary, W / 2, 830, W - 200, 22, 4);
  }
  ctx.restore();
}

function drawCommit(ctx, W, H, commit) {
  if (!commit) return;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = INK.inkFade;
  ctx.font = 'italic 12px "KaiTi", serif';
  wrapText(ctx, `「${commit}」`, W / 2, H - 150, W - 240, 20, 3);
  ctx.restore();
}

function drawFooter(ctx, W, H, card) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = INK.inkFade;
  ctx.font = '11px "KaiTi", serif';
  ctx.fillText('· 演 策 · AI 决策推演沙盘 ·', W / 2, H - 70);
  ctx.fillText(card.date || new Date().toISOString().split('T')[0], W / 2, H - 52);
  // AI 生成标识
  ctx.fillStyle = INK.cinnabarLight;
  ctx.font = '9px "KaiTi", serif';
  ctx.fillText('AI 生成内容，仅供参考', W / 2, H - 35);
  ctx.restore();
}

/** 文本自动换行（居中） */
function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 4) {
  const chars = Array.from(text);
  let line = '';
  let lines = [];
  for (const ch of chars) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxWidth && line.length > 0) {
      lines.push(line);
      line = ch;
      if (lines.length >= maxLines - 1) break;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) lines = lines.slice(0, maxLines);
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineHeight));
}

/**
 * 下载分享卡片
 */
export function downloadShareCard(dataUrl, filename = '命签.png') {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * 复制到剪贴板（需要 HTTPS）
 */
export async function copyShareCardToClipboard(dataUrl) {
  try {
    const blob = await (await fetch(dataUrl)).blob();
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return true;
  } catch (e) {
    console.warn('[shareCard] 复制失败', e);
    return false;
  }
}
