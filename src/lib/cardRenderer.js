import { loadFont } from './fontUtils';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function canvasFont(settings, fontSize) {
  const style = settings?.fontStyle || 'normal';
  const weight = Number(settings?.fontWeight || 400);
  const family = settings?.familyName || 'sans-serif';
  return `${style} ${weight} ${fontSize}px "${family}"`;
}

async function loadImageFromUrl(url) {
  const response = await fetch(url, { mode: 'cors', cache: 'no-store' });
  if (!response.ok) throw new Error('تعذر تحميل صورة القالب.');

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);

  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = objectUrl;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function getFittedFontSize(context, text, settings, maxWidth) {
  const requested = clamp(Number(settings?.fontSize || 48), 12, 400);
  context.font = canvasFont(settings, requested);
  const measured = context.measureText(text).width;
  if (!measured || measured <= maxWidth) return requested;
  return clamp(Math.floor(requested * (maxWidth / measured)), 12, requested);
}

function drawText(context, text, settings, language, canvasWidth, canvasHeight) {
  const cleanText = String(text || '').trim();
  if (!cleanText) return;

  const maxWidthRatio = clamp(Number(settings?.maxWidth || 0.75), 0.1, 1);
  const maxWidth = canvasWidth * maxWidthRatio;
  const boxLeft = canvasWidth * Number(settings?.x || 0.5) - maxWidth / 2;
  const align = ['left', 'center', 'right'].includes(settings?.align) ? settings.align : 'center';
  const anchorX = align === 'left'
    ? boxLeft
    : align === 'right'
      ? boxLeft + maxWidth
      : canvasWidth * Number(settings?.x || 0.5);
  const anchorY = canvasHeight * Number(settings?.y || 0.5);
  const fontSize = getFittedFontSize(context, cleanText, settings, maxWidth);

  context.save();
  context.direction = language === 'ar' ? 'rtl' : 'ltr';
  context.textAlign = align;
  context.textBaseline = 'middle';
  context.fillStyle = settings?.color || '#ffffff';
  context.font = canvasFont(settings, fontSize);
  context.fontKerning = 'normal';

  if ('letterSpacing' in context) {
    context.letterSpacing = `${Number(settings?.letterSpacing || 0)}px`;
  }

  context.fillText(cleanText, anchorX, anchorY);
  context.restore();
}

function canvasToJpegBlob(canvas, quality = 0.95) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('تعذر إنشاء ملف JPG.'));
    }, 'image/jpeg', quality);
  });
}

export async function renderGreetingCard({
  template,
  imageUrl,
  arabicName,
  englishName,
  arabicSettings,
  englishSettings,
  fonts,
}) {
  if (!template || !imageUrl) throw new Error('القالب غير جاهز.');

  const relevantFontIds = [arabicSettings?.fontId, englishSettings?.fontId].filter(Boolean);
  const relevantFonts = (fonts || []).filter((font) => relevantFontIds.includes(font.id));
  await Promise.allSettled(relevantFonts.map((font) => loadFont(font)));
  if (typeof document !== 'undefined' && document.fonts?.ready) await document.fonts.ready;

  const image = await loadImageFromUrl(imageUrl);
  const width = Number(template.image_width || image.naturalWidth);
  const height = Number(template.image_height || image.naturalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('المتصفح لا يدعم إنشاء البطاقة.');

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  drawText(context, arabicName, arabicSettings, 'ar', width, height);
  drawText(context, englishName, englishSettings, 'en', width, height);

  return canvasToJpegBlob(canvas, 0.95);
}

export function makeCardFileName(occasion, englishName, shape) {
  const safeName = String(englishName || 'card')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .toLowerCase() || 'card';
  const occasionSlug = String(occasion?.slug || 'occasion').replace(/[^a-zA-Z0-9-]+/g, '-');
  return `${occasionSlug}-${shape}-${safeName}.jpg`;
}
