import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ImageIcon,
  LoaderCircle,
  MessageSquareText,
  Palette,
  Save,
  Settings2,
  Type,
} from 'lucide-react';
import BrandAssetField from '../../components/BrandAssetField';
import {
  DEFAULT_APP_SETTINGS,
  getBrandAssetUrl,
  useAppSettings,
} from '../../context/AppSettingsContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export default function SettingsPage() {
  const { profile } = useAuth();
  const { settings, setSettings, loading } = useAppSettings();
  const canEdit = profile?.role === 'super_admin' || profile?.role === 'admin';
  const [form, setForm] = useState(settings);
  const [savedAssets, setSavedAssets] = useState({ logo_path: '', cover_path: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    setForm(settings);
    setSavedAssets({ logo_path: settings.logo_path || '', cover_path: settings.cover_path || '' });
  }, [settings]);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setNotice('');
  }

  async function removeReplacedAssets(next) {
    const removed = ['logo_path', 'cover_path']
      .map((key) => savedAssets[key])
      .filter((path, index, paths) => path && path !== next[index === 0 ? 'logo_path' : 'cover_path']);
    if (removed.length) await supabase.storage.from('branding-assets').remove(removed);
  }

  async function saveSettings(event) {
    event.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    setError('');
    setNotice('');

    const payload = Object.fromEntries(
      Object.entries({ ...DEFAULT_APP_SETTINGS, ...form }).map(([key, value]) => (
        [key, typeof value === 'string' ? value.trim() : value]
      )),
    );

    const requiredText = [
      'platform_name_ar', 'platform_name_en', 'empty_message_ar', 'empty_message_en',
      'welcome_title_ar', 'welcome_title_en', 'generate_button_ar', 'download_button_ar',
      'footer_text_ar', 'footer_text_en',
    ];
    if (requiredText.some((key) => !payload[key])) {
      setError('أكمل جميع الحقول النصية المطلوبة.');
      setSaving(false);
      return;
    }
    if (!HEX_COLOR.test(payload.primary_color) || !HEX_COLOR.test(payload.primary_dark_color)) {
      setError('ألوان الهوية يجب أن تكون بصيغة HEX صحيحة مثل #6659B0.');
      setSaving(false);
      return;
    }

    const { error: saveError } = await supabase
      .from('app_settings')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', true);

    if (saveError) {
      setError(saveError.message || 'تعذر حفظ الإعدادات.');
    } else {
      await removeReplacedAssets(payload);
      setSettings(payload);
      setSavedAssets({ logo_path: payload.logo_path, cover_path: payload.cover_path });
      setNotice('تم حفظ هوية وإعدادات المنصة.');
    }
    setSaving(false);
  }

  if (loading) return <div className="table-loading"><LoaderCircle className="spin" size={24} /> جاري تحميل الإعدادات...</div>;

  const logoUrl = getBrandAssetUrl(form.logo_path);
  const coverUrl = getBrandAssetUrl(form.cover_path);
  const previewStyle = {
    '--preview-primary': form.primary_color || DEFAULT_APP_SETTINGS.primary_color,
    '--preview-primary-dark': form.primary_dark_color || DEFAULT_APP_SETTINGS.primary_dark_color,
  };

  return (
    <section>
      <div className="page-heading">
        <div><h1>الإعدادات والهوية</h1><p>تحكم في شعار المنصة وألوانها والنصوص التي تظهر للمستخدمين.</p></div>
      </div>

      {error && <div className="form-error package-notice">{error}</div>}
      {notice && <div className="success-message package-notice"><CheckCircle2 size={17} />{notice}</div>}

      <div className="settings-layout branding-settings-layout">
        <form className="content-card settings-form-card" onSubmit={saveSettings}>
          <div className="settings-section-title"><Settings2 size={21} /><div><strong>اسم المنصة</strong><span>يظهر في الصفحة العامة ولوحة الإدارة وصفحة الدخول.</span></div></div>
          <div className="form-grid two-columns">
            <label>
              اسم المنصة بالعربي
              <input value={form.platform_name_ar || ''} onChange={(event) => updateField('platform_name_ar', event.target.value)} disabled={!canEdit} maxLength={100} />
            </label>
            <label>
              اسم المنصة بالإنجليزي
              <input dir="ltr" value={form.platform_name_en || ''} onChange={(event) => updateField('platform_name_en', event.target.value)} disabled={!canEdit} maxLength={100} />
            </label>
          </div>

          <div className="settings-section-title with-top-border"><ImageIcon size={21} /><div><strong>صور الهوية</strong><span>PNG أو JPG أو WEBP، بحد أقصى 5 MB لكل صورة.</span></div></div>
          <div className="brand-assets-grid">
            <BrandAssetField
              label="شعار المنصة"
              hint="يفضل شعار مربع بخلفية شفافة."
              value={form.logo_path || ''}
              folder="logos"
              onChange={(value) => updateField('logo_path', value)}
              canEdit={canEdit}
              aspect="logo"
            />
            <BrandAssetField
              label="صورة غلاف الصفحة العامة"
              hint="يفضل صورة أفقية عريضة."
              value={form.cover_path || ''}
              folder="covers"
              onChange={(value) => updateField('cover_path', value)}
              canEdit={canEdit}
              aspect="cover"
            />
          </div>

          <div className="settings-section-title with-top-border"><Palette size={21} /><div><strong>ألوان الهوية</strong><span>تُطبق مباشرة على الأزرار والعناصر الرئيسية.</span></div></div>
          <div className="brand-colors-grid">
            <label className="color-setting-field">
              اللون الأساسي
              <span><input type="color" value={form.primary_color || '#6659b0'} onChange={(event) => updateField('primary_color', event.target.value)} disabled={!canEdit} /><input dir="ltr" value={form.primary_color || ''} onChange={(event) => updateField('primary_color', event.target.value)} disabled={!canEdit} maxLength={7} /></span>
            </label>
            <label className="color-setting-field">
              اللون الداكن
              <span><input type="color" value={form.primary_dark_color || '#3c3275'} onChange={(event) => updateField('primary_dark_color', event.target.value)} disabled={!canEdit} /><input dir="ltr" value={form.primary_dark_color || ''} onChange={(event) => updateField('primary_dark_color', event.target.value)} disabled={!canEdit} maxLength={7} /></span>
            </label>
          </div>

          <div className="settings-section-title with-top-border"><Type size={21} /><div><strong>نصوص صفحة إنشاء البطاقة</strong><span>يمكنك تخصيص العنوان وأسماء الأزرار.</span></div></div>
          <div className="form-grid two-columns">
            <label>العنوان الترحيبي بالعربي<input value={form.welcome_title_ar || ''} onChange={(event) => updateField('welcome_title_ar', event.target.value)} disabled={!canEdit} maxLength={140} /></label>
            <label>العنوان الترحيبي بالإنجليزي<input dir="ltr" value={form.welcome_title_en || ''} onChange={(event) => updateField('welcome_title_en', event.target.value)} disabled={!canEdit} maxLength={140} /></label>
            <label>نص زر تجهيز البطاقة<input value={form.generate_button_ar || ''} onChange={(event) => updateField('generate_button_ar', event.target.value)} disabled={!canEdit} maxLength={60} /></label>
            <label>نص زر التحميل<input value={form.download_button_ar || ''} onChange={(event) => updateField('download_button_ar', event.target.value)} disabled={!canEdit} maxLength={60} /></label>
          </div>

          <div className="settings-section-title with-top-border"><MessageSquareText size={21} /><div><strong>رسائل الصفحة العامة</strong><span>رسالة عدم وجود مناسبة والنص الموجود في أسفل الصفحة.</span></div></div>
          <div className="form-grid two-columns settings-textareas">
            <label>رسالة عدم وجود مناسبة بالعربي<textarea value={form.empty_message_ar || ''} onChange={(event) => updateField('empty_message_ar', event.target.value)} disabled={!canEdit} maxLength={220} rows={3} /></label>
            <label>رسالة عدم وجود مناسبة بالإنجليزي<textarea dir="ltr" value={form.empty_message_en || ''} onChange={(event) => updateField('empty_message_en', event.target.value)} disabled={!canEdit} maxLength={220} rows={3} /></label>
            <label>نص أسفل الصفحة بالعربي<textarea value={form.footer_text_ar || ''} onChange={(event) => updateField('footer_text_ar', event.target.value)} disabled={!canEdit} maxLength={180} rows={3} /></label>
            <label>نص أسفل الصفحة بالإنجليزي<textarea dir="ltr" value={form.footer_text_en || ''} onChange={(event) => updateField('footer_text_en', event.target.value)} disabled={!canEdit} maxLength={180} rows={3} /></label>
          </div>

          {canEdit ? (
            <button className="primary-button settings-save-button" type="submit" disabled={saving}>
              {saving ? <><LoaderCircle className="spin" size={17} /> جاري الحفظ...</> : <><Save size={17} /> حفظ الإعدادات</>}
            </button>
          ) : <div className="viewer-readonly-note">صلاحية Viewer تسمح بمشاهدة الإعدادات فقط.</div>}
        </form>

        <aside className="settings-preview-card branding-live-preview" style={previewStyle}>
          <span>معاينة مباشرة للهوية</span>
          {coverUrl && <div className="settings-cover-preview"><img src={coverUrl} alt="غلاف المنصة" /></div>}
          <div className="settings-preview-header">
            {logoUrl ? <div className="brand-logo-preview"><img src={logoUrl} alt="شعار المنصة" /></div> : <div className="brand-mark">ب</div>}
            <div><strong>{form.platform_name_ar || 'بطاقات تهنئة'}</strong><small lang="en" dir="ltr">{form.platform_name_en || 'Greeting Cards'}</small></div>
          </div>
          <div className="settings-empty-preview">
            <MessageSquareText size={30} />
            <strong>{form.welcome_title_ar || 'اصنع بطاقتك الخاصة'}</strong>
            <span lang="en" dir="ltr">{form.welcome_title_en || 'Create your greeting card'}</span>
            <button type="button">{form.generate_button_ar || 'تجهيز البطاقة'}</button>
          </div>
        </aside>
      </div>
    </section>
  );
}
