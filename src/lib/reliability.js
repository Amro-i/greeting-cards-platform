const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/g;
const MULTIPLE_SPACES = /\s+/g;

export function normalizePersonName(value, maxLength = 100) {
  return String(value ?? '')
    .replace(CONTROL_CHARACTERS, ' ')
    .replace(MULTIPLE_SPACES, ' ')
    .trim()
    .slice(0, maxLength);
}

export function createRequestKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}


const ANONYMOUS_CLIENT_KEY_STORAGE = 'greeting-cards-client-key-v1';

export function getAnonymousClientKey() {
  try {
    const existing = window.localStorage.getItem(ANONYMOUS_CLIENT_KEY_STORAGE);
    if (existing && existing.length >= 20) return existing;

    const created = createRequestKey();
    window.localStorage.setItem(ANONYMOUS_CLIENT_KEY_STORAGE, created);
    return created;
  } catch {
    return createRequestKey();
  }
}

export function delay(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export async function withTimeout(factory, milliseconds = 20_000, message = 'استغرقت العملية وقتًا أطول من المتوقع.') {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(factory),
      new Promise((_, reject) => {
        timer = window.setTimeout(() => reject(new Error(message)), milliseconds);
      }),
    ]);
  } finally {
    if (timer) window.clearTimeout(timer);
  }
}

export async function retryOperation(factory, {
  attempts = 2,
  delayMs = 450,
  shouldRetry = () => true,
} = {}) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await factory(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || !shouldRetry(error)) break;
      await delay(delayMs * attempt);
    }
  }

  throw lastError;
}

export function isLikelyNetworkError(error) {
  const message = String(error?.message || '').toLowerCase();
  return !navigator.onLine
    || message.includes('fetch')
    || message.includes('network')
    || message.includes('timeout')
    || message.includes('وقتًا أطول');
}

export function getFriendlyClientError(error, fallback = 'تعذر إتمام العملية. حاول مرة أخرى.') {
  if (!navigator.onLine) return 'لا يوجد اتصال بالإنترنت. تحقق من الشبكة ثم حاول مرة أخرى.';
  if (isLikelyNetworkError(error)) return 'تعذر الاتصال بالخادم. تحقق من الإنترنت ثم حاول مرة أخرى.';
  return error?.message || fallback;
}
