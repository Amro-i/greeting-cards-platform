import {
  BarChart3,
  CalendarDays,
  Files,
  LayoutDashboard,
  LogOut,
  Settings,
  TextCursorInput,
  Users,
} from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const links = [
  { to: '/admin', end: true, label: 'لوحة التحكم', icon: LayoutDashboard },
  { to: '/admin/occasions', label: 'المناسبات', icon: CalendarDays },
  { to: '/admin/templates', label: 'القوالب', icon: Files },
  { to: '/admin/fonts', label: 'الخطوط', icon: TextCursorInput },
  { to: '/admin/activity', label: 'السجل والإحصائيات', icon: BarChart3 },
  { to: '/admin/users', label: 'المستخدمون', icon: Users, superAdminOnly: true },
  { to: '/admin/settings', label: 'الإعدادات', icon: Settings },
];

const roleLabels = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  viewer: 'Viewer',
};

export default function AdminLayout() {
  const { profile, signOut } = useAuth();
  const visibleLinks = links.filter((link) => !link.superAdminOnly || profile?.role === 'super_admin');

  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <div className="brand-box">
          <div className="brand-mark">ب</div>
          <div>
            <strong>بطاقات تهنئة</strong>
            <span>لوحة الإدارة</span>
          </div>
        </div>

        <nav className="side-nav" aria-label="القائمة الرئيسية">
          {visibleLinks.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => (isActive ? 'active' : '')}
            >
              <Icon size={19} strokeWidth={1.8} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <button className="signout-button" type="button" onClick={signOut}>
          <LogOut size={18} />
          تسجيل الخروج
        </button>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <div>
            <span className="muted-label">مرحبًا</span>
            <strong>{profile?.full_name || 'مستخدم الإدارة'}</strong>
          </div>
          <span className="role-pill">{roleLabels[profile?.role] || profile?.role || 'Admin'}</span>
        </header>
        <div className="admin-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
