import { loadFont } from './fontUtils';

const IMAGE_LOAD_TIMEOUT = 25_000;
const MAX_CANVAS_PIXELS = 16_777_216;
const MAX_CANVAS_SIDE = 8192;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function canvasFont(settings, fontSize) {
  const style = settings?.fontStyle || 'normal';
  const weight = Number(settings?.fontWeight || 400);
  const family = settings?.familyName || 'sans-serif';
  return `${style} ${weight} ${fontSize}px "${family}"`;
}

function waitForImage(image) {
  if (typeof image.decode === 'function') {
    return image.decode().catch(() => new Promise((resolve, reject) => {
      if (image.complete && image.naturalWidth > 0) resolve();
      else {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('تعذر قراءة صورة القالب.'));
      }
    }));
  }

  return new Promise((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('تعذر قراءة صورة القالب.'));
  });
}

async function loadImageFromUrl(url) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), IMAGE_LOAD_TIMEOUT);

  try {
    const response = await fetch(url, {
      mode: 'cors',
      cache: 'force-cache',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('تعذر تحميل صورة القالب.');

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);

    try {
      const image = new Image();
      image.decoding = 'async';
      image.src = objectUrl;
      await waitForImage(image);
      if (!image.naturalWidth || !image.naturalHeight) throw new Error('صورة القالب غير صالحة.');
      return image;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('استغرق تحميل القالب وقتًا طويلًا. حاول مرة أخرى.');
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

function getSafeCanvasDimensions(width, height) {
  const sourceWidth = Number(width);
  const sourceHeight = Number(height);

  if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error('أبعاد القالب غير صالحة.');
  }

  const sideScale = Math.min(1, MAX_CANVAS_SIDE / sourceWidth, MAX_CANVAS_SIDE / sourceHeight);
  const pixelScale = Math.min(1, Math.sqrt(MAX_CANVAS_PIXELS / (sourceWidth * sourceHeight)));
  const scale = Math.min(sideScale, pixelScale);

  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
    scale,
  };
}

function measureTextWidth(context, text, settings) {
  const width = context.measureText(text).width;
  const spacing = Number(settings?.letterSpacing || 0);
  const extraSpacing = 'letterSpacing' in context ? Math.max(0, text.length - 1) * Math.abs(spacing) : 0;
  return width + extraSpacing;
}

export function getFittedFontSize(text, settings, canvasWidth) {
  const cleanText = String(text || '').trim();
  const requested = clamp(Number(settings?.fontSize || 48), 12, 400);
  if (!cleanText || typeof document === 'undefined') return requested;

  const maxWidthRatio = clamp(Number(settings?.maxWidth || 0.75), 0.1, 1);
  const maxWidth = Number(canvasWidth || 1) * maxWidthRatio;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return requested;

  context.font = canvasFont(settings, requested);
  const measured = measureTextWidth(context, cleanText, settings);
  if (!measured || measured <= maxWidth) return requested;
  return clamp(Math.floor(requested * (maxWidth / measured)), 12, requested);
}

function drawText(context, text, settings, language, canvasWidth, canvasHeight, sizeScale) {
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
  const sourceCanvasWidth = canvasWidth / sizeScale;
  const fontSize = getFittedFontSize(cleanText, settings, sourceCanvasWidth) * sizeScale;

  context.save();
  context.direction = language === 'ar' ? 'rtl' : 'ltr';
  context.textAlign = align;
  context.textBaseline = 'middle';
  context.fillStyle = settings?.color || '#ffffff';
  context.font = canvasFont(settings, Math.max(8, fontSize));
  context.fontKerning = 'normal';

  if ('letterSpacing' in context) {
    context.letterSpacing = `${Number(settings?.letterSpacing || 0) * sizeScale}px`;
  }

  context.fillText(cleanText, anchorX, anchorY, maxWidth);
  context.restore();
}

function canvasToJpegBlob(canvas, quality = 0.95) {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('استغرق إنشاء JPG وقتًا طويلًا.')), 20_000);
    canvas.toBlob((blob) => {
      window.clearTimeout(timer);
      if (blob) resolve(blob);
      else reject(new Error('تعذر إنشاء ملف JPG. قد تكون صورة القالب كبيرة جدًا لهذا الجهاز.'));
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
  if (typeof document === 'undefined' || typeof URL?.createObjectURL !== 'function') {
    throw new Error('هذا المتصفح لا يدعم إنشاء البطاقة. استخدم متصفحًا حديثًا.');
  }

  const relevantFontIds = [arabicSettings?.fontId, englishSettings?.fontId].filter(Boolean);
  const relevantFonts = (fonts || []).filter((font) => relevantFontIds.includes(font.id));
  await Promise.allSettled(relevantFonts.map((font) => loadFont(font)));
  if (document.fonts?.ready) await document.fonts.ready;

  const image = await loadImageFromUrl(imageUrl);
  const sourceWidth = Number(template.image_width || image.naturalWidth);
  const sourceHeight = Number(template.image_height || image.naturalHeight);
  const safe = getSafeCanvasDimensions(sourceWidth, sourceHeight);
  const canvas = document.createElement('canvas');
  canvas.width = safe.width;
  canvas.height = safe.height;

  const context = canvas.getContext('2d', { alpha: false, willReadFrequently: false });
  if (!context) throw new Error('المتصفح لا يدعم إنشاء البطاقة.');

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, safe.width, safe.height);
  context.drawImage(image, 0, 0, safe.width, safe.height);
  drawText(context, arabicName, arabicSettings, 'ar', safe.width, safe.height, safe.scale);
  drawText(context, englishName, englishSettings, 'en', safe.width, safe.height, safe.scale);

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
