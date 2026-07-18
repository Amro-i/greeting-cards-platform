import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import AdminLayout from './components/AdminLayout';
import ProtectedRoute from './components/ProtectedRoute';
import PublicCardPage from './pages/PublicCardPage';

const AccountPage = lazy(() => import('./pages/admin/AccountPage'));
const AdvancedToolsPage = lazy(() => import('./pages/admin/AdvancedToolsPage'));
const ActivityPage = lazy(() => import('./pages/admin/ActivityPage'));
const DashboardPage = lazy(() => import('./pages/admin/DashboardPage'));
const FontsPage = lazy(() => import('./pages/admin/FontsPage'));
const LoginPage = lazy(() => import('./pages/admin/LoginPage'));
const OccasionsPage = lazy(() => import('./pages/admin/OccasionsPage'));
const SettingsPage = lazy(() => import('./pages/admin/SettingsPage'));
const TemplateEditorPage = lazy(() => import('./pages/admin/TemplateEditorPage'));
const TemplatesPage = lazy(() => import('./pages/admin/TemplatesPage'));
const UsersPage = lazy(() => import('./pages/admin/UsersPage'));

function PageLoader() {
  return <div className="screen-center">جاري تحميل الصفحة...</div>;
}

function lazyPage(Page) {
  return (
    <Suspense fallback={<PageLoader />}>
      <Page />
    </Suspense>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<PublicCardPage />} />
      <Route path="/occasion/:slug" element={<PublicCardPage />} />
      <Route path="/admin/login" element={lazyPage(LoginPage)} />

      <Route element={<ProtectedRoute allowedRoles={['super_admin', 'admin', 'viewer']} />}>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={lazyPage(DashboardPage)} />
          <Route path="occasions" element={lazyPage(OccasionsPage)} />
          <Route path="occasions/:occasionId/preview" element={<PublicCardPage adminPreview />} />
          <Route path="templates" element={lazyPage(TemplatesPage)} />
          <Route path="templates/:templateId/editor" element={lazyPage(TemplateEditorPage)} />
          <Route path="fonts" element={lazyPage(FontsPage)} />
          <Route path="activity" element={lazyPage(ActivityPage)} />
          <Route path="advanced-tools" element={lazyPage(AdvancedToolsPage)} />
          <Route path="settings" element={lazyPage(SettingsPage)} />
          <Route path="account" element={lazyPage(AccountPage)} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute allowedRoles={['super_admin']} />}>
        <Route path="/admin/users" element={<AdminLayout />}>
          <Route index element={lazyPage(UsersPage)} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
