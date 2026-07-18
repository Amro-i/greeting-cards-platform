const TARGETS = {
  logo: {
    width: 1200,
    height: 400,
    minimumWidth: 600,
    minimumHeight: 200,
    mode: 'contain',
    quality: 0.92,
    mimeType: 'image/webp',
    extension: 'webp',
    label: '1200 × 400 px',
  },
  cover: {
    width: 1920,
    height: 500,
    minimumWidth: 1440,
    minimumHeight: 400,
    mode: 'cover',
    quality: 0.9,
    mimeType: 'image/webp',
    extension: 'webp',
    label: '1920 × 500 px',
  },
};

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('تعذر قراءة ملف الصورة.'));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('تعذر تجهيز الصورة.'));
    }, mimeType, quality);
  });
}

function drawContained(ctx, image, target) {
  const scale = Math.min(target.width / image.naturalWidth, target.height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  const x = (target.width - drawWidth) / 2;
  const y = (target.height - drawHeight) / 2;
  ctx.clearRect(0, 0, target.width, target.height);
  ctx.drawImage(image, x, y, drawWidth, drawHeight);
}

function drawCovered(ctx, image, target) {
  const scale = Math.max(target.width / image.naturalWidth, target.height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  const x = (target.width - drawWidth) / 2;
  const y = (target.height - drawHeight) / 2;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, target.width, target.height);
  ctx.drawImage(image, x, y, drawWidth, drawHeight);
}

export function getBrandingTarget(aspect) {
  return TARGETS[aspect] || TARGETS.logo;
}

export function getImageQualityStatus(aspect, width, height) {
  const target = getBrandingTarget(aspect);
  const isLow = width < target.minimumWidth || height < target.minimumHeight;
  return {
    isLow,
    message: isLow
      ? `جودة الصورة منخفضة. يفضل ألا تقل عن ${target.minimumWidth} × ${target.minimumHeight} px.`
      : 'جودة الصورة مناسبة وستتم معالجتها تلقائيًا.',
  };
}

export async function processBrandingImage(file, aspect) {
  const target = getBrandingTarget(aspect);
  const image = await loadImage(file);
  const sourceWidth = image.naturalWidth;
  const sourceHeight = image.naturalHeight;

  if (!sourceWidth || !sourceHeight) {
    throw new Error('تعذر التحقق من أبعاد الصورة.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = target.width;
  canvas.height = target.height;
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) throw new Error('المتصفح لا يدعم معالجة الصور المطلوبة.');

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  if (target.mode === 'cover') drawCovered(ctx, image, target);
  else drawContained(ctx, image, target);

  let blob;
  let mimeType = target.mimeType;
  let extension = target.extension;
  try {
    blob = await canvasToBlob(canvas, mimeType, target.quality);
  } catch {
    mimeType = aspect === 'logo' ? 'image/png' : 'image/jpeg';
    extension = aspect === 'logo' ? 'png' : 'jpg';
    blob = await canvasToBlob(canvas, mimeType, target.quality);
  }

  const quality = getImageQualityStatus(aspect, sourceWidth, sourceHeight);
  return {
    blob,
    mimeType,
    extension,
    sourceWidth,
    sourceHeight,
    outputWidth: target.width,
    outputHeight: target.height,
    outputSize: blob.size,
    quality,
  };
}
