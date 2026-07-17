import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ allowedRoles }) {
  const { user, profile, loading, isConfigured } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="screen-center">جاري التحقق من الحساب...</div>;
  }

  if (!isConfigured) {
    return <Navigate to="/admin/login" replace />;
  }

  if (!user) {
    return <Navigate to="/admin/login" replace state={{ from: location }} />;
  }

  if (!profile?.is_active) {
    return <div className="screen-center">هذا الحساب غير مفعّل.</div>;
  }

  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    return <Navigate to="/admin" replace />;
  }

  return <Outlet />;
}
