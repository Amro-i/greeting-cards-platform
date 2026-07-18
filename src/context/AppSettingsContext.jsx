import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getFriendlyClientError, withTimeout } from '../lib/reliability';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

export const DEFAULT_APP_SETTINGS = {
  platform_name_ar: 'بطاقات تهنئة',
  platform_name_en: 'Greeting Cards',
  empty_message_ar: 'لا توجد مناسبة متاحة حاليًا',
  empty_message_en: 'No occasion is currently available.',
  welcome_title_ar: 'اصنع بطاقتك الخاصة',
  welcome_title_en: 'Create your greeting card',
  generate_button_ar: 'تجهيز البطاقة',
  download_button_ar: 'تحميل البطاقة JPG',
  footer_text_ar: 'بطاقتك تُنشأ مباشرة وبخصوصية.',
  footer_text_en: 'Your card is created privately in your browser.',
  logo_path: '',
  cover_path: '',
  primary_color: '#6659b0',
  primary_dark_color: '#3c3275',
};

const AppSettingsContext = createContext(null);

export function getBrandAssetUrl(path) {
  if (!path || !supabase) return '';
  return supabase.storage.from('branding-assets').getPublicUrl(path).data.publicUrl;
}

function normalizeSettings(data) {
  return {
    ...DEFAULT_APP_SETTINGS,
    ...(data || {}),
    logo_path: data?.logo_path || '',
    cover_path: data?.cover_path || '',
  };
}

export function AppSettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULT_APP_SETTINGS);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState('');

  async function refreshSettings() {
    if (!supabase) {
      setSettings(DEFAULT_APP_SETTINGS);
      setLoading(false);
      return DEFAULT_APP_SETTINGS;
    }

    setLoading(true);
    setError('');
    let result;
    try {
      result = await withTimeout(() => supabase
        .from('app_settings')
        .select('*')
        .eq('id', true)
        .maybeSingle(), 15_000, 'استغرق تحميل إعدادات المنصة وقتًا طويلًا.');
    } catch (loadError) {
      setError(getFriendlyClientError(loadError, 'تعذر تحميل إعدادات المنصة.'));
      setSettings(DEFAULT_APP_SETTINGS);
      setLoading(false);
      return DEFAULT_APP_SETTINGS;
    }

    if (result.error) {
      setError(getFriendlyClientError(result.error, 'تعذر تحميل إعدادات المنصة.'));
      setSettings(DEFAULT_APP_SETTINGS);
      setLoading(false);
      return DEFAULT_APP_SETTINGS;
    }

    const next = normalizeSettings(result.data);
    setSettings(next);
    setLoading(false);
    return next;
  }

  useEffect(() => {
    void refreshSettings();
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--primary', settings.primary_color || DEFAULT_APP_SETTINGS.primary_color);
    root.style.setProperty('--primary-dark', settings.primary_dark_color || DEFAULT_APP_SETTINGS.primary_dark_color);
  }, [settings.primary_color, settings.primary_dark_color]);

  const value = useMemo(() => ({
    settings,
    setSettings: (value) => setSettings(normalizeSettings(value)),
    refreshSettings,
    loading,
    error,
  }), [settings, loading, error]);

  return <AppSettingsContext.Provider value={value}>{children}</AppSettingsContext.Provider>;
}

export function useAppSettings() {
  const context = useContext(AppSettingsContext);
  if (!context) throw new Error('useAppSettings must be used within AppSettingsProvider');
  return context;
}
