// Client-side "yard sign" export: composite the rendered QR PNG onto a
// captioned card via an offscreen canvas. Everything stays in the browser —
// no backend, no upload. Sizes are derived from the QR edge so a 512 or a
// 2048 export both stay proportional.

export const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load the QR image'));
    img.src = src;
  });

// Compose a titled/captioned card around the QR PNG onto an offscreen canvas
// and hand it back. Shared by the live preview and the download so the two can
// never drift — the on-screen card is the exact pixels that get saved.
export const composeCard = async (pngBlob, { title, caption, fgColor = '#111111', bgColor = '#ffffff' }) => {
  const qrUrl = URL.createObjectURL(pngBlob);
  try {
    const img = await loadImage(qrUrl);
    const qr = img.width; // qr-code-styling renders a square canvas
    const pad = Math.round(qr * 0.12);
    const titleH = title ? Math.round(qr * 0.16) : 0;
    const captionH = caption ? Math.round(qr * 0.12) : 0;

    const w = qr + pad * 2;
    const h = pad + titleH + qr + captionH + pad;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = fgColor;

    let y = pad;
    if (title) {
      ctx.font = `700 ${Math.round(titleH * 0.5)}px Helvetica, Arial, sans-serif`;
      ctx.fillText(title, w / 2, y + Math.round(titleH * 0.15), qr);
      y += titleH;
    }

    ctx.drawImage(img, pad, y, qr, qr);
    y += qr;

    if (caption) {
      ctx.font = `400 ${Math.round(captionH * 0.42)}px Helvetica, Arial, sans-serif`;
      ctx.fillText(caption, w / 2, y + Math.round(captionH * 0.25), qr);
    }

    return canvas;
  } finally {
    URL.revokeObjectURL(qrUrl);
  }
};

// Compose a titled/captioned card around the QR PNG and download it.
export const downloadCard = async (pngBlob, { filename, ...cardOptions }) => {
  const canvas = await composeCard(pngBlob, cardOptions);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  downloadBlob(blob, filename);
};
