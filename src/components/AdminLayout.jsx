import {
  BarChart3,
  Wrench,
  CalendarDays,
  Files,
  LayoutDashboard,
  LogOut,
  Settings,
  TextCursorInput,
  UserCircle,
  Users,
} from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';
import { getBrandAssetUrl, useAppSettings } from '../context/AppSettingsContext';
import { useAuth } from '../context/AuthContext';

const links = [
  { to: '/admin', end: true, label: 'لوحة التحكم', icon: LayoutDashboard },
  { to: '/admin/occasions', label: 'المناسبات', icon: CalendarDays },
  { to: '/admin/templates', label: 'القوالب', icon: Files },
  { to: '/admin/fonts', label: 'الخطوط', icon: TextCursorInput },
  { to: '/admin/activity', label: 'السجل والإحصائيات', icon: BarChart3 },
  { to: '/admin/advanced-tools', label: 'أدوات الإدارة', icon: Wrench },
  { to: '/admin/users', label: 'المستخدمون', icon: Users, superAdminOnly: true },
  { to: '/admin/settings', label: 'الإعدادات', icon: Settings },
  { to: '/admin/account', label: 'حسابي', icon: UserCircle },
];

const roleLabels = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  viewer: 'Viewer',
};

export default function AdminLayout() {
  const { profile, signOut } = useAuth();
  const { settings } = useAppSettings();
  const visibleLinks = links.filter((link) => !link.superAdminOnly || profile?.role === 'super_admin');
  const logoUrl = getBrandAssetUrl(settings.logo_path);

  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <div className="brand-box">
          {logoUrl ? <div className="brand-logo"><img src={logoUrl} alt={settings.platform_name_ar} /></div> : <div className="brand-mark">ب</div>}
          <div>
            <strong>{settings.platform_name_ar}</strong>
            <span>لوحة الإدارة</span>
          </div>
        </div>

        <nav className="side-nav" aria-label="القائمة الرئيسية">
          {visibleLinks.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'active' : '')}>
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
          <div><span className="muted-label">مرحبًا</span><strong>{profile?.full_name || 'مستخدم الإدارة'}</strong></div>
          <span className="role-pill">{roleLabels[profile?.role] || profile?.role || 'Admin'}</span>
        </header>
        <div className="admin-content"><Outlet /></div>
      </main>
    </div>
  );
}
