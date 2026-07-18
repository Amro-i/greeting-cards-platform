import { useEffect, useState } from 'react';
import { CalendarCheck2, Image, LayoutTemplate, LoaderCircle, UsersRound } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const DEFAULT_STATS = {
  activeOccasions: 0,
  generatedCards: 0,
  templates: 0,
  adminUsers: 0,
};

export default function DashboardPage() {
  const [stats, setStats] = useState(DEFAULT_STATS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadStats() {
      const now = new Date().toISOString();
      const results = await Promise.all([
        supabase.from('occasions').select('*', { count: 'exact', head: true }).eq('status', 'active').lte('starts_at', now).gte('ends_at', now),
        supabase.from('generation_logs').select('*', { count: 'exact', head: true }),
        supabase.from('templates').select('*', { count: 'exact', head: true }),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_active', true),
      ]);

      if (!active) return;
      setStats({
        activeOccasions: results[0].count || 0,
        generatedCards: results[1].count || 0,
        templates: results[2].count || 0,
        adminUsers: results[3].count || 0,
      });
      setLoading(false);
    }

    void loadStats();
    return () => { active = false; };
  }, []);

  const cards = [
    { label: 'المناسبات النشطة', value: stats.activeOccasions, icon: CalendarCheck2 },
    { label: 'البطاقات المنشأة', value: stats.generatedCards, icon: Image },
    { label: 'القوالب', value: stats.templates, icon: LayoutTemplate },
    { label: 'مستخدمو الإدارة', value: stats.adminUsers, icon: UsersRound },
  ];

  return (
    <section>
      <div className="page-heading">
        <div><h1>لوحة التحكم</h1><p>نظرة عامة على المناسبات والبطاقات.</p></div>
      </div>
      <div className="stats-grid">
        {cards.map(({ label, value, icon: Icon }) => (
          <article className="stat-card" key={label}>
            <div className="stat-icon"><Icon size={23} /></div>
            <div>
              <strong>{loading ? <LoaderCircle className="spin" size={22} /> : value}</strong>
              <span>{label}</span>
            </div>
          </article>
        ))}
      </div>
      <div className="content-card dashboard-start-card">
        <div>
          <h2>ابدأ بإضافة مناسبة</h2>
          <p>حدد وقت ظهور المناسبة وارفع القالب المربع والمستطيل. الصفحة العامة ستتحدث تلقائيًا.</p>
        </div>
        <a className="primary-button" href="/admin/occasions">إدارة المناسبات</a>
      </div>
    </section>
  );
}
