import { Navigate, Route, Routes } from 'react-router-dom';
import AdminLayout from './components/AdminLayout';
import ProtectedRoute from './components/ProtectedRoute';
import PublicCardPage from './pages/PublicCardPage';
import DashboardPage from './pages/admin/DashboardPage';
import LoginPage from './pages/admin/LoginPage';
import PlaceholderPage from './pages/admin/PlaceholderPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<PublicCardPage />} />
      <Route path="/admin/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute allowedRoles={['super_admin', 'admin', 'viewer']} />}>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="occasions" element={<PlaceholderPage title="المناسبات" description="إنشاء المناسبات وتحديد مدة ظهورها." actionLabel="إضافة مناسبة" />} />
          <Route path="templates" element={<PlaceholderPage title="القوالب" description="إدارة القوالب المربعة والمستطيلة." actionLabel="رفع قالب" />} />
          <Route path="fonts" element={<PlaceholderPage title="الخطوط" description="إدارة الخطوط المتاحة داخل محرر القوالب." actionLabel="إضافة خط" />} />
          <Route path="activity" element={<PlaceholderPage title="السجل والإحصائيات" description="متابعة الأشخاص والبطاقات التي تم إنشاؤها." />} />
          <Route path="settings" element={<PlaceholderPage title="الإعدادات" description="إعدادات المنصة والرسائل العامة." />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute allowedRoles={['super_admin']} />}>
        <Route path="/admin/users" element={<AdminLayout />}>
          <Route index element={<PlaceholderPage title="مستخدمو الإدارة" description="إنشاء الحسابات وتحديد الصلاحيات." actionLabel="إضافة مستخدم" />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
