function canvasFactory() {
  return document.createElement('canvas');
}

function wrapText(context, value, maxWidth, maxLines) {
  const lines = [];
  let current = '';
  Array.from(String(value || '')).forEach((character) => {
    const candidate = current + character;
    if (current && context.measureText(candidate).width > maxWidth) {
      lines.push(current);
      current = character;
    } else current = candidate;
  });
  if (current) lines.push(current);
  return lines.slice(0, maxLines).map((line, index) => (
    index === maxLines - 1 && lines.length > maxLines ? `${line.slice(0, -1)}…` : line
  ));
}

function drawTextBlock(context, label, text, y) {
  context.textAlign = 'left';
  context.fillStyle = '#b59a54';
  context.font = '24px "Noto Serif SC", serif';
  context.fillText(label, 112, y);
  context.fillStyle = '#eee4ce';
  context.font = '34px "Noto Serif SC", serif';
  wrapText(context, text, 690, 2).forEach((line, index) => context.fillText(line, 230, y + index * 48));
}

export function renderFateTicketCanvas(presentation, { canvasFactory: createCanvas = canvasFactory } = {}) {
  const canvas = createCanvas();
  canvas.width = 1024;
  canvas.height = 1536;
  const context = canvas.getContext('2d');
  const background = context.createLinearGradient(0, 0, 1024, 1536);
  background.addColorStop(0, '#171208');
  background.addColorStop(0.55, '#080806');
  background.addColorStop(1, '#020302');
  context.fillStyle = background;
  context.fillRect(0, 0, 1024, 1536);
  context.strokeStyle = 'rgba(229,196,113,.74)';
  context.lineWidth = 3;
  context.strokeRect(42, 42, 940, 1452);
  context.strokeStyle = 'rgba(229,196,113,.24)';
  context.lineWidth = 1;
  context.strokeRect(64, 64, 896, 1408);

  context.textAlign = 'center';
  context.fillStyle = '#bda45f';
  context.font = '22px Georgia, serif';
  context.fillText(`YANCE · DECISION ARCHIVE · ${presentation.archiveId}`, 512, 120);
  context.fillStyle = '#f5e5ad';
  context.font = '88px "Ma Shan Zheng", "STKaiti", serif';
  context.fillText(presentation.sealTitle, 512, 315);
  context.fillStyle = '#d8c9a5';
  context.font = '34px "Noto Serif SC", serif';
  wrapText(context, presentation.verse, 760, 2).forEach((line, index) => context.fillText(line, 512, 380 + index * 48));

  drawTextBlock(context, '所问', presentation.question, 590);
  drawTextBlock(context, '所择', presentation.decision, 760);
  drawTextBlock(context, '断语', presentation.verdict, 930);

  presentation.anchors.forEach((anchor, index) => {
    const x = 94 + index * 294;
    context.strokeStyle = 'rgba(218,179,82,.35)';
    context.strokeRect(x, 1090, 260, 220);
    context.fillStyle = '#bd503a';
    context.font = '52px "Ma Shan Zheng", serif';
    context.textAlign = 'left';
    context.fillText(anchor.label, x + 22, 1155);
    context.fillStyle = '#d8cdb7';
    context.font = '28px "Noto Serif SC", serif';
    wrapText(context, anchor.text, 210, 3).forEach((line, lineIndex) => context.fillText(line, x + 22, 1212 + lineIndex * 39));
  });

  context.textAlign = 'center';
  context.fillStyle = '#827864';
  context.font = '20px ui-monospace, monospace';
  context.fillText(`${presentation.hexagram} · ${presentation.date} · ${presentation.artworkLabel}`, 512, 1435);
  return canvas;
}

export async function exportFateTicketPng(presentation, {
  canvasFactory: createCanvas = canvasFactory,
  linkFactory = () => document.createElement('a'),
  urlFactory = URL,
} = {}) {
  const canvas = renderFateTicketCanvas(presentation, { canvasFactory: createCanvas });
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((value) => {
      if (value) resolve(value);
      else reject(new Error('命牌 PNG 生成失败'));
    }, 'image/png');
  });
  const url = urlFactory.createObjectURL(blob);
  const link = linkFactory();
  const filename = `演策命牌-${presentation.archiveId || presentation.date || '记录'}.png`;
  link.href = url;
  link.download = filename;
  link.click();
  urlFactory.revokeObjectURL(url);
  return filename;
}

export default renderFateTicketCanvas;
