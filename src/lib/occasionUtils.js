import { supabase } from './supabase';

export const TEMPLATE_BUCKET = 'card-templates';
export const MAX_TEMPLATE_SIZE = 10 * 1024 * 1024;
export const ALLOWED_TEMPLATE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function getOccasionState(occasion, referenceDate = new Date()) {
  if (!occasion) return { key: 'draft', label: 'مسودة' };

  if (occasion.status === 'disabled') return { key: 'disabled', label: 'معطلة' };
  if (occasion.status === 'draft') return { key: 'draft', label: 'مسودة' };
  if (occasion.status === 'ended') return { key: 'ended', label: 'منتهية' };

  const now = referenceDate.getTime();
  const startsAt = new Date(occasion.starts_at).getTime();
  const endsAt = new Date(occasion.ends_at).getTime();

  if (Number.isFinite(startsAt) && startsAt > now) {
    return { key: 'scheduled', label: 'مجدولة' };
  }

  if (Number.isFinite(endsAt) && endsAt < now) {
    return { key: 'ended', label: 'منتهية' };
  }

  return { key: 'active', label: 'مفعلة' };
}

export function formatDateTime(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('ar-SA-u-nu-latn', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function toDateTimeLocal(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

export function makeOccasionSlug(titleEn) {
  const base = String(titleEn || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

  const suffix = Date.now().toString(36);
  return `${base || 'occasion'}-${suffix}`;
}

export function getTemplatePublicUrl(path) {
  if (!supabase || !path) return '';
  return supabase.storage.from(TEMPLATE_BUCKET).getPublicUrl(path).data.publicUrl;
}

export function validateTemplateFile(file) {
  if (!file) return '';
  if (!ALLOWED_TEMPLATE_TYPES.includes(file.type)) {
    return 'صيغة الصورة غير مدعومة. استخدم JPG أو PNG أو WebP.';
  }
  if (file.size > MAX_TEMPLATE_SIZE) {
    return 'حجم الصورة أكبر من 10 MB.';
  }
  return '';
}

export function readImageDimensions(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      const dimensions = { width: image.naturalWidth, height: image.naturalHeight };
      URL.revokeObjectURL(url);
      resolve(dimensions);
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('تعذر قراءة أبعاد الصورة.'));
    };

    image.src = url;
  });
}

export function getFriendlySupabaseError(error) {
  if (!error) return 'حدث خطأ غير متوقع.';
  if (error.code === '23505') return 'توجد بيانات أخرى بالقيمة نفسها. حدّث الصفحة وحاول مرة أخرى.';
  if (error.code === '23P01') return 'توقيت المناسبة يتداخل مع مناسبة مفعلة أخرى.';
  if (error.message?.toLowerCase().includes('row-level security')) {
    return 'ليس لديك صلاحية لتنفيذ هذه العملية.';
  }
  return error.message || 'تعذر إتمام العملية.';
}
