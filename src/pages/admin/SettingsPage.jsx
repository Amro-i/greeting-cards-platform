import { useEffect, useState } from 'react';
import { CheckCircle2, LoaderCircle, MessageSquareText, Save, Settings2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

const DEFAULT_SETTINGS = {
  platform_name_ar: 'بطاقات تهنئة',
  platform_name_en: 'Greeting Cards',
  empty_message_ar: 'لا توجد مناسبة متاحة حاليًا',
  empty_message_en: 'No occasion is currently available.',
};

export default function SettingsPage() {
  const { profile } = useAuth();
  const canEdit = profile?.role === 'super_admin' || profile?.role === 'admin';
  const [form, setForm] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    async function loadSettings() {
      const { data, error: loadError } = await supabase
        .from('app_settings')
        .select('platform_name_ar, platform_name_en, empty_message_ar, empty_message_en')
        .eq('id', true)
        .maybeSingle();
      if (!active) return;
      if (loadError) setError(loadError.message);
      if (data) setForm(data);
      setLoading(false);
    }
    void loadSettings();
    return () => { active = false; };
  }, []);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function saveSettings(event) {
    event.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    setError('');
    setNotice('');

    const payload = Object.fromEntries(
      Object.entries(form).map(([key, value]) => [key, value.trim()]),
    );
    if (Object.values(payload).some((value) => !value)) {
      setError('جميع الحقول مطلوبة.');
      setSaving(false);
      return;
    }

    const { error: saveError } = await supabase
      .from('app_settings')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', true);

    if (saveError) setError(saveError.message || 'تعذر حفظ الإعدادات.');
    else {
      setForm(payload);
      setNotice('تم حفظ إعدادات المنصة.');
    }
    setSaving(false);
  }

  if (loading) return <div className="table-loading"><LoaderCircle className="spin" size={24} /> جاري تحميل الإعدادات...</div>;

  return (
    <section>
      <div className="page-heading">
        <div><h1>الإعدادات</h1><p>تعديل اسم المنصة والرسالة التي تظهر عند عدم وجود مناسبة.</p></div>
      </div>

      {error && <div className="form-error package-notice">{error}</div>}
      {notice && <div className="success-message package-notice"><CheckCircle2 size={17} />{notice}</div>}

      <div className="settings-layout">
        <form className="content-card settings-form-card" onSubmit={saveSettings}>
          <div className="settings-section-title"><Settings2 size={21} /><div><strong>هوية المنصة</strong><span>تظهر في رأس الصفحة العامة.</span></div></div>
          <div className="form-grid two-columns">
            <label>
              اسم المنصة بالعربي
              <input value={form.platform_name_ar} onChange={(event) => updateField('platform_name_ar', event.target.value)} disabled={!canEdit} maxLength={100} />
            </label>
            <label>
              اسم المنصة بالإنجليزي
              <input dir="ltr" value={form.platform_name_en} onChange={(event) => updateField('platform_name_en', event.target.value)} disabled={!canEdit} maxLength={100} />
            </label>
          </div>

          <div className="settings-section-title with-top-border"><MessageSquareText size={21} /><div><strong>رسالة عدم وجود مناسبة</strong><span>تظهر تلقائيًا عندما لا توجد مناسبة مفعلة.</span></div></div>
          <div className="form-grid two-columns settings-textareas">
            <label>
              الرسالة بالعربي
              <textarea value={form.empty_message_ar} onChange={(event) => updateField('empty_message_ar', event.target.value)} disabled={!canEdit} maxLength={220} rows={4} />
            </label>
            <label>
              الرسالة بالإنجليزي
              <textarea dir="ltr" value={form.empty_message_en} onChange={(event) => updateField('empty_message_en', event.target.value)} disabled={!canEdit} maxLength={220} rows={4} />
            </label>
          </div>

          {canEdit ? (
            <button className="primary-button settings-save-button" type="submit" disabled={saving}>
              {saving ? <><LoaderCircle className="spin" size={17} /> جاري الحفظ...</> : <><Save size={17} /> حفظ الإعدادات</>}
            </button>
          ) : (
            <div className="viewer-readonly-note">صلاحية Viewer تسمح بمشاهدة الإعدادات فقط.</div>
          )}
        </form>

        <aside className="settings-preview-card">
          <span>معاينة الصفحة العامة</span>
          <div className="settings-preview-header">
            <div className="brand-mark">ب</div>
            <div><strong>{form.platform_name_ar || 'بطاقات تهنئة'}</strong><small lang="en" dir="ltr">{form.platform_name_en || 'Greeting Cards'}</small></div>
          </div>
          <div className="settings-empty-preview">
            <MessageSquareText size={30} />
            <strong>{form.empty_message_ar || 'لا توجد مناسبة متاحة حاليًا'}</strong>
            <span lang="en" dir="ltr">{form.empty_message_en || 'No occasion is currently available.'}</span>
          </div>
        </aside>
      </div>
    </section>
  );
}
