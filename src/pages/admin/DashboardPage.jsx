import { CalendarCheck2, Image, LayoutTemplate, UsersRound } from 'lucide-react';

const cards = [
  { label: 'المناسبات النشطة', value: '0', icon: CalendarCheck2 },
  { label: 'البطاقات المنشأة', value: '0', icon: Image },
  { label: 'القوالب', value: '0', icon: LayoutTemplate },
  { label: 'مستخدمو الإدارة', value: '1', icon: UsersRound },
];

export default function DashboardPage() {
  return (
    <section>
      <div className="page-heading">
        <div><h1>لوحة التحكم</h1><p>نظرة عامة على المناسبات والبطاقات.</p></div>
      </div>
      <div className="stats-grid">
        {cards.map(({ label, value, icon: Icon }) => (
          <article className="stat-card" key={label}>
            <div className="stat-icon"><Icon size={23} /></div>
            <div><strong>{value}</strong><span>{label}</span></div>
          </article>
        ))}
      </div>
      <div className="content-card">
        <h2>البداية</h2>
        <p>أضف أول مناسبة، ثم ارفع القالب المربع والمستطيل وحدد إعدادات النص.</p>
      </div>
    </section>
  );
}
