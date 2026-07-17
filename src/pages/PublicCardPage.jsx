import { useEffect, useState } from 'react';
import { CalendarX2, ShieldCheck } from 'lucide-react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

export default function PublicCardPage() {
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [occasion, setOccasion] = useState(null);

  useEffect(() => {
    if (!supabase) return;

    async function loadActiveOccasion() {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('occasions')
        .select('id, title_ar, title_en, slug, starts_at, ends_at')
        .eq('status', 'active')
        .lte('starts_at', now)
        .gte('ends_at', now)
        .order('starts_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) console.error('Occasion load error:', error.message);
      setOccasion(data ?? null);
      setLoading(false);
    }

    loadActiveOccasion();
  }, []);

  if (loading) {
    return <div className="screen-center">جاري تحميل المناسبة...</div>;
  }

  return (
    <div className="public-page">
      <header className="public-header">
        <div className="public-brand">
          <div className="brand-mark">ب</div>
          <div>
            <strong>بطاقات تهنئة</strong>
            <span>Greeting Cards</span>
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
            <h1>لا توجد مناسبة متاحة حاليًا</h1>
            <p lang="en" dir="ltr">No occasion is currently available.</p>
            <span>ستظهر هنا بطاقة المناسبة عند تفعيلها من لوحة الإدارة.</span>
          </section>
        ) : (
          <section className="occasion-ready-card">
            <span className="eyebrow">المناسبة الحالية</span>
            <h1>{occasion.title_ar}</h1>
            <p lang="en" dir="ltr">{occasion.title_en}</p>
            <div className="notice-box">
              تم تفعيل المناسبة. نموذج إدخال الاسم وإنشاء JPG سيضاف في الحزمة القادمة.
            </div>
          </section>
        )}
      </main>

      <footer className="public-footer">بطاقتك تُنشأ مباشرة وبخصوصية.</footer>
    </div>
  );
}
