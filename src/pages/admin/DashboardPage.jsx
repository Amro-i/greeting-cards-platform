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
        supabase.from('statistics_totals').select('total_generated'),
        supabase.from('templates').select('*', { count: 'exact', head: true }),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_active', true),
      ]);

      if (!active) return;
      const generatedCards = (results[1].data || []).reduce((total, item) => total + Number(item.total_generated || 0), 0);
      setStats({
        activeOccasions: results[0].count || 0,
        generatedCards,
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
    { label: 'إجمالي البطاقات', value: stats.generatedCards, icon: Image },
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
          <h2>متابعة النتائج</h2>
          <p>راجع الأسماء والإحصائيات اليومية وإجمالي استخدام كل مناسبة من صفحة السجل والإحصائيات.</p>
        </div>
        <a className="primary-button" href="/admin/activity">عرض السجل والإحصائيات</a>
      </div>
    </section>
  );
}
