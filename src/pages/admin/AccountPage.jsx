import { useState } from 'react';
import { CheckCircle2, KeyRound, LoaderCircle, Save, UserRound } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

export default function AccountPage() {
  const { user, profile, reloadProfile } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function updateProfile(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    if (fullName.trim().length < 2) {
      setError('اكتب الاسم الكامل بشكل صحيح.');
      return;
    }
    setSavingProfile(true);
    const { error: profileError } = await supabase.rpc('update_own_profile', { p_full_name: fullName.trim() });
    if (profileError) setError(profileError.message || 'تعذر تحديث الاسم.');
    else {
      await reloadProfile();
      setNotice('تم تحديث بيانات الحساب.');
    }
    setSavingProfile(false);
  }

  async function updatePassword(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    if (password.length < 8) {
      setError('كلمة المرور يجب ألا تقل عن 8 أحرف.');
      return;
    }
    if (password !== confirmPassword) {
      setError('تأكيد كلمة المرور غير مطابق.');
      return;
    }
    setSavingPassword(true);
    const { error: passwordError } = await supabase.auth.updateUser({ password });
    if (passwordError) setError(passwordError.message || 'تعذر تغيير كلمة المرور.');
    else {
      setPassword('');
      setConfirmPassword('');
      setNotice('تم تغيير كلمة المرور بنجاح.');
    }
    setSavingPassword(false);
  }

  return (
    <section>
      <div className="page-heading"><div><h1>حسابي</h1><p>تحديث اسم الحساب وكلمة المرور.</p></div></div>
      {error && <div className="form-error package-notice">{error}</div>}
      {notice && <div className="success-message package-notice"><CheckCircle2 size={17} />{notice}</div>}

      <div className="account-grid">
        <form className="content-card account-card" onSubmit={updateProfile}>
          <div className="account-card-heading"><UserRound size={23} /><div><strong>بيانات الحساب</strong><span>البريد الإلكتروني لا يتغير من هذه الصفحة.</span></div></div>
          <label>
            الاسم الكامل
            <input value={fullName} onChange={(event) => setFullName(event.target.value)} maxLength={100} required />
          </label>
          <label>
            البريد الإلكتروني
            <input value={user?.email || ''} dir="ltr" disabled />
          </label>
          <label>
            الصلاحية
            <input value={profile?.role || ''} dir="ltr" disabled />
          </label>
          <button className="primary-button" type="submit" disabled={savingProfile}>
            {savingProfile ? <><LoaderCircle className="spin" size={17} /> جاري الحفظ...</> : <><Save size={17} /> حفظ الاسم</>}
          </button>
        </form>

        <form className="content-card account-card" onSubmit={updatePassword}>
          <div className="account-card-heading"><KeyRound size={23} /><div><strong>تغيير كلمة المرور</strong><span>استخدم كلمة مرور قوية لا تقل عن 8 أحرف.</span></div></div>
          <label>
            كلمة المرور الجديدة
            <input type="password" dir="ltr" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required />
          </label>
          <label>
            تأكيد كلمة المرور
            <input type="password" dir="ltr" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} required />
          </label>
          <button className="primary-button" type="submit" disabled={savingPassword}>
            {savingPassword ? <><LoaderCircle className="spin" size={17} /> جاري التغيير...</> : <><KeyRound size={17} /> تغيير كلمة المرور</>}
          </button>
        </form>
      </div>
    </section>
  );
}
