import { supabase } from './supabase';

export const FONT_BUCKET = 'card-fonts';
export const MAX_FONT_SIZE = 10 * 1024 * 1024;
export const ALLOWED_FONT_EXTENSIONS = ['ttf', 'otf', 'woff', 'woff2'];

const loadedFontKeys = new Set();

export function getFontExtension(fileName = '') {
  return String(fileName).split('.').pop()?.toLowerCase() || '';
}

export function validateFontFile(file) {
  if (!file) return 'اختر ملف الخط.';
  const extension = getFontExtension(file.name);
  if (!ALLOWED_FONT_EXTENSIONS.includes(extension)) {
    return 'صيغة الخط غير مدعومة. استخدم TTF أو OTF أو WOFF أو WOFF2.';
  }
  if (file.size > MAX_FONT_SIZE) {
    return 'حجم ملف الخط أكبر من 10 MB.';
  }
  return '';
}

export function getFontPublicUrl(font) {
  if (!supabase || !font?.storage_path) return '';
  return supabase.storage.from(FONT_BUCKET).getPublicUrl(font.storage_path).data.publicUrl;
}

export function fontKey(font) {
  return [font?.family_name, font?.weight, font?.style, font?.storage_path || 'system'].join('|');
}

export async function loadFont(font) {
  if (!font?.family_name || typeof document === 'undefined' || !document.fonts) return;

  const key = fontKey(font);
  if (loadedFontKeys.has(key)) return;

  if (font.is_system || !font.storage_path) {
    try {
      await document.fonts.load(`${font.style || 'normal'} ${font.weight || 400} 18px "${font.family_name}"`);
    } catch {
      // Built-in @font-face rules are loaded by the browser.
    }
    loadedFontKeys.add(key);
    return;
  }

  const url = getFontPublicUrl(font);
  if (!url) return;

  const face = new FontFace(font.family_name, `url("${url}")`, {
    weight: String(font.weight || 400),
    style: font.style || 'normal',
    display: 'swap',
  });

  try {
    const loadedFace = await face.load();
    document.fonts.add(loadedFace);
    loadedFontKeys.add(key);
  } catch (error) {
    console.warn(`Unable to load font ${font.display_name}:`, error);
  }
}

export async function loadFonts(fonts = []) {
  await Promise.allSettled(fonts.map((font) => loadFont(font)));
}

export function fontSupportsLanguage(font, language) {
  return font?.language === 'both' || font?.language === language;
}

export function findDefaultFont(fonts, language) {
  const candidates = fonts.filter((font) => font.is_active && fontSupportsLanguage(font, language));
  if (language === 'ar') {
    return candidates.find((font) => font.family_name === 'GE Thameen' && font.weight === 400 && font.style === 'normal')
      || candidates.find((font) => font.family_name === 'GE Thameen')
      || candidates[0]
      || null;
  }
  return candidates.find((font) => font.family_name === 'Aller' && font.weight === 400 && font.style === 'normal')
    || candidates.find((font) => font.family_name === 'Aller')
    || candidates[0]
    || null;
}

export function fontLabel(font) {
  const weightLabels = {
    300: 'Light',
    400: 'Regular',
    500: 'Medium',
    600: 'DemiBold',
    700: 'Bold',
    800: 'Extra Bold',
    900: 'Black',
  };
  const suffix = [weightLabels[font?.weight] || font?.weight, font?.style === 'italic' ? 'Italic' : '']
    .filter(Boolean)
    .join(' · ');
  return `${font?.display_name || font?.family_name || 'خط'}${suffix ? ` — ${suffix}` : ''}`;
}

export function normalizeTextSettings(settings, font, language) {
  const fallback = language === 'ar'
    ? { x: 0.5, y: 0.56, fontSize: 68, maxWidth: 0.78, sampleText: 'الاسم العربي' }
    : { x: 0.5, y: 0.66, fontSize: 52, maxWidth: 0.72, sampleText: 'English Name' };

  return {
    x: Number.isFinite(Number(settings?.x)) ? Number(settings.x) : fallback.x,
    y: Number.isFinite(Number(settings?.y)) ? Number(settings.y) : fallback.y,
    fontSize: Number.isFinite(Number(settings?.fontSize)) ? Number(settings.fontSize) : fallback.fontSize,
    maxWidth: Number.isFinite(Number(settings?.maxWidth)) ? Number(settings.maxWidth) : fallback.maxWidth,
    color: settings?.color || '#ffffff',
    align: ['left', 'center', 'right'].includes(settings?.align) ? settings.align : 'center',
    fontId: settings?.fontId || font?.id || '',
    familyName: settings?.familyName || font?.family_name || (language === 'ar' ? 'GE Thameen' : 'Aller'),
    fontWeight: Number(settings?.fontWeight || font?.weight || 400),
    fontStyle: settings?.fontStyle || font?.style || 'normal',
    lineHeight: Number.isFinite(Number(settings?.lineHeight)) ? Number(settings.lineHeight) : 1.15,
    letterSpacing: Number.isFinite(Number(settings?.letterSpacing)) ? Number(settings.letterSpacing) : 0,
    sampleText: settings?.sampleText || fallback.sampleText,
  };
}

export function settingsWithFont(settings, font) {
  if (!font) return settings;
  return {
    ...settings,
    fontId: font.id,
    familyName: font.family_name,
    fontWeight: Number(font.weight || 400),
    fontStyle: font.style || 'normal',
  };
}
