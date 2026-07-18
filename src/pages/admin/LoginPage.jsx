import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { LockKeyhole, Mail } from 'lucide-react';
import { getBrandAssetUrl, useAppSettings } from '../../context/AppSettingsContext';
import { useAuth } from '../../context/AuthContext';

export default function LoginPage() {
  const { user, signIn, isConfigured } = useAuth();
  const { settings } = useAppSettings();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const logoUrl = getBrandAssetUrl(settings.logo_path);

  if (user) return <Navigate to="/admin" replace />;

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const { error: authError } = await signIn(email.trim(), password);
      if (authError) throw authError;
      navigate(location.state?.from?.pathname || '/admin', { replace: true });
    } catch (err) {
      setError(err.message || 'تعذر تسجيل الدخول.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <section className="login-panel">
        {logoUrl ? <div className="brand-logo large"><img src={logoUrl} alt={settings.platform_name_ar} /></div> : <div className="brand-mark large">ب</div>}
        <h1>دخول الإدارة</h1>
        <p><span>{settings.platform_name_ar}</span><small lang="en" dir="ltr">{settings.platform_name_en}</small></p>

        {!isConfigured && <div className="setup-alert">أضف بيانات Supabase داخل ملف <code>.env</code> أولًا.</div>}

        <form onSubmit={handleSubmit}>
          <label>
            البريد الإلكتروني
            <span className="input-with-icon">
              <Mail size={18} />
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@example.com" dir="ltr" required disabled={!isConfigured} />
            </span>
          </label>

          <label>
            كلمة المرور
            <span className="input-with-icon">
              <LockKeyhole size={18} />
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" dir="ltr" required disabled={!isConfigured} />
            </span>
          </label>

          {error && <div className="form-error">{error}</div>}

          <button className="primary-button full" type="submit" disabled={submitting || !isConfigured}>
            {submitting ? 'جاري الدخول...' : 'تسجيل الدخول'}
          </button>
        </form>

        <a href="/" className="back-link">العودة إلى الصفحة العامة</a>
      </section>
    </div>
  );
}
