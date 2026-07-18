import { Navigate, Route, Routes } from 'react-router-dom';
import AdminLayout from './components/AdminLayout';
import ProtectedRoute from './components/ProtectedRoute';
import PublicCardPage from './pages/PublicCardPage';
import AccountPage from './pages/admin/AccountPage';
import ActivityPage from './pages/admin/ActivityPage';
import DashboardPage from './pages/admin/DashboardPage';
import FontsPage from './pages/admin/FontsPage';
import LoginPage from './pages/admin/LoginPage';
import OccasionsPage from './pages/admin/OccasionsPage';
import SettingsPage from './pages/admin/SettingsPage';
import TemplateEditorPage from './pages/admin/TemplateEditorPage';
import TemplatesPage from './pages/admin/TemplatesPage';
import UsersPage from './pages/admin/UsersPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<PublicCardPage />} />
      <Route path="/admin/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute allowedRoles={['super_admin', 'admin', 'viewer']} />}>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="occasions" element={<OccasionsPage />} />
          <Route path="templates" element={<TemplatesPage />} />
          <Route path="templates/:templateId/editor" element={<TemplateEditorPage />} />
          <Route path="fonts" element={<FontsPage />} />
          <Route path="activity" element={<ActivityPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="account" element={<AccountPage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute allowedRoles={['super_admin']} />}>
        <Route path="/admin/users" element={<AdminLayout />}>
          <Route index element={<UsersPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
