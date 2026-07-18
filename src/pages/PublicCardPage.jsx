import { useEffect, useMemo, useState } from 'react';
import { CalendarX2, RectangleHorizontal, ShieldCheck, Square } from 'lucide-react';
import { getFriendlySupabaseError } from '../lib/occasionUtils';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

const DEFAULT_SETTINGS = {
  platform_name_ar: 'بطاقات تهنئة',
  platform_name_en: 'Greeting Cards',
  empty_message_ar: 'لا توجد مناسبة متاحة حاليًا',
  empty_message_en: 'No occasion is currently available.',
};

export default function PublicCardPage() {
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [occasion, setOccasion] = useState(null);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!supabase) return;
    let active = true;

    async function loadPageData() {
      const now = new Date().toISOString();
      const [occasionResult, settingsResult] = await Promise.all([
        supabase
          .from('occasions')
          .select(`
            id, title_ar, title_en, slug, starts_at, ends_at,
            templates (id, shape, is_active)
          `)
          .eq('status', 'active')
          .lte('starts_at', now)
          .gte('ends_at', now)
          .order('starts_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('app_settings')
          .select('platform_name_ar, platform_name_en, empty_message_ar, empty_message_en')
          .eq('id', true)
          .maybeSingle(),
      ]);

      if (!active) return;
      if (occasionResult.error) setError(getFriendlySupabaseError(occasionResult.error));
      if (settingsResult.data) setSettings(settingsResult.data);
      setOccasion(occasionResult.data || null);
      setLoading(false);
    }

    void loadPageData();
    return () => { active = false; };
  }, []);

  const availableShapes = useMemo(() => {
    const activeTemplates = (occasion?.templates || []).filter((template) => template.is_active);
    return {
      square: activeTemplates.some((template) => template.shape === 'square'),
      rectangle: activeTemplates.some((template) => template.shape === 'rectangle'),
    };
  }, [occasion]);

  if (loading) {
    return <div className="screen-center">جاري تحميل المناسبة...</div>;
  }

  return (
    <div className="public-page">
      <header className="public-header">
        <div className="public-brand">
          <div className="brand-mark">ب</div>
          <div>
            <strong>{settings.platform_name_ar}</strong>
            <span>{settings.platform_name_en}</span>
          </div>
        </div>
        <a href="/admin/login" className="admin-link">
          <ShieldCheck size={18} />
          دخول الإدارة
        </a>
      </header>

      <main className="public-main">
        {!occasion ? (
          <section className="empty-occasion-card">
            <div className="empty-icon"><CalendarX2 size={40} /></div>
            <h1>{settings.empty_message_ar}</h1>
            <p lang="en" dir="ltr">{settings.empty_message_en}</p>
            <span>{error || 'ستظهر هنا بطاقة المناسبة عند تفعيلها من لوحة الإدارة.'}</span>
          </section>
        ) : (
          <section className="occasion-ready-card">
            <span className="eyebrow">المناسبة الحالية</span>
            <h1>{occasion.title_ar}</h1>
            <p lang="en" dir="ltr">{occasion.title_en}</p>

            <div className="public-shape-list">
              <div className={availableShapes.square ? 'available' : 'unavailable'}>
                <Square size={24} />
                <strong>بطاقة مربعة</strong>
                <span>{availableShapes.square ? 'القالب جاهز' : 'غير متاحة'}</span>
              </div>
              <div className={availableShapes.rectangle ? 'available' : 'unavailable'}>
                <RectangleHorizontal size={25} />
                <strong>بطاقة مستطيلة</strong>
                <span>{availableShapes.rectangle ? 'القالب جاهز' : 'غير متاحة'}</span>
              </div>
            </div>

            <div className="notice-box">
              المناسبة والقوالب جاهزة. إدخال الأسماء وإنشاء ملف JPG سيضاف في حزمة إنشاء البطاقة.
            </div>
          </section>
        )}
      </main>

      <footer className="public-footer">بطاقتك تُنشأ مباشرة وبخصوصية.</footer>
    </div>
  );
}
