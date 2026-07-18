import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Eye,
  EyeOff,
  FileType2,
  LoaderCircle,
  Plus,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import ConfirmModal from '../../components/ConfirmModal';
import { useAuth } from '../../context/AuthContext';
import {
  FONT_BUCKET,
  fontLabel,
  getFontExtension,
  loadFonts,
  validateFontFile,
} from '../../lib/fontUtils';
import { getFriendlySupabaseError } from '../../lib/occasionUtils';
import { supabase } from '../../lib/supabase';

const EMPTY_FORM = {
  displayName: '',
  language: 'both',
  weight: '400',
  style: 'normal',
  file: null,
};

const LANGUAGE_LABELS = {
  ar: 'العربية',
  en: 'الإنجليزية',
  both: 'العربية والإنجليزية',
};

export default function FontsPage() {
  const { profile } = useAuth();
  const canManage = ['super_admin', 'admin'].includes(profile?.role);
  const fileRef = useRef(null);
  const [fonts, setFonts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [filter, setFilter] = useState('all');

  const loadFontRecords = useCallback(async () => {
    setLoading(true);
    setError('');
    const { data, error: queryError } = await supabase
      .from('fonts')
      .select('id, display_name, family_name, language, weight, style, storage_path, is_system, is_active, created_at')
      .order('is_system', { ascending: false })
      .order('display_name');

    if (queryError) {
      setFonts([]);
      setError(getFriendlySupabaseError(queryError));
    } else {
      const records = data || [];
      setFonts(records);
      void loadFonts(records.filter((font) => font.is_active));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadFontRecords();
  }, [loadFontRecords]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(''), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const filteredFonts = useMemo(() => {
    if (filter === 'all') return fonts;
    if (filter === 'system') return fonts.filter((font) => font.is_system);
    if (filter === 'uploaded') return fonts.filter((font) => !font.is_system);
    return fonts.filter((font) => font.language === filter || font.language === 'both');
  }, [filter, fonts]);

  function closeForm() {
    if (saving) return;
    setShowForm(false);
    setForm(EMPTY_FORM);
    setFormError('');
    if (fileRef.current) fileRef.current.value = '';
  }

  async function handleUpload(event) {
    event.preventDefault();
    if (!canManage || saving) return;

    const displayName = form.displayName.trim();
    if (!displayName) {
      setFormError('اكتب اسم الخط الذي سيظهر داخل محرر القالب.');
      return;
    }

    const fileError = validateFontFile(form.file);
    if (fileError) {
      setFormError(fileError);
      return;
    }

    const id = crypto.randomUUID();
    const extension = getFontExtension(form.file.name);
    const storagePath = `${profile.id}/${id}.${extension}`;
    const familyName = `GreetingFont_${id.replaceAll('-', '_')}`;
    setSaving(true);
    setFormError('');

    try {
      const { error: uploadError } = await supabase.storage.from(FONT_BUCKET).upload(storagePath, form.file, {
        cacheControl: '3600',
        contentType: form.file.type || undefined,
        upsert: false,
      });
      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase.from('fonts').insert({
        id,
        display_name: displayName,
        family_name: familyName,
        language: form.language,
        weight: Number(form.weight),
        style: form.style,
        storage_path: storagePath,
        is_system: false,
        is_active: true,
        created_by: profile.id,
      });

      if (insertError) {
        await supabase.storage.from(FONT_BUCKET).remove([storagePath]);
        throw insertError;
      }

      setShowForm(false);
      setForm(EMPTY_FORM);
      setFormError('');
      if (fileRef.current) fileRef.current.value = '';
      setNotice('تم رفع الخط وإضافته إلى محرر القوالب.');
      await loadFontRecords();
    } catch (uploadFailure) {
      setFormError(getFriendlySupabaseError(uploadFailure));
    } finally {
      setSaving(false);
    }
  }

  async function toggleFont(font) {
    if (!canManage || busyId) return;
    setBusyId(font.id);
    setError('');

    const { error: updateError } = await supabase
      .from('fonts')
      .update({ is_active: !font.is_active })
      .eq('id', font.id);

    if (updateError) {
      setError(getFriendlySupabaseError(updateError));
    } else {
      setNotice(font.is_active ? 'تم إخفاء الخط من محرر القوالب.' : 'تم تفعيل الخط.');
      await loadFontRecords();
    }
    setBusyId('');
  }

  async function deleteFont() {
    if (!deleteTarget || deleteTarget.is_system || !canManage || busyId) return;
    setBusyId(deleteTarget.id);
    setError('');

    try {
      const { data: settingsRows, error: settingsError } = await supabase
        .from('template_settings')
        .select('id, arabic_settings, english_settings');
      if (settingsError) throw settingsError;

      const isUsed = (settingsRows || []).some((row) => (
        row.arabic_settings?.fontId === deleteTarget.id || row.english_settings?.fontId === deleteTarget.id
      ));

      if (isUsed) {
        throw new Error('هذا الخط مستخدم في قالب حالي. غيّر الخط في القالب أولًا ثم احذفه.');
      }

      if (deleteTarget.storage_path) {
        const { error: removeError } = await supabase.storage
          .from(FONT_BUCKET)
          .remove([deleteTarget.storage_path]);
        if (removeError) console.warn('Font file cleanup failed:', removeError.message);
      }

      const { error: deleteError } = await supabase.from('fonts').delete().eq('id', deleteTarget.id);
      if (deleteError) throw deleteError;

      setDeleteTarget(null);
      setNotice('تم حذف الخط.');
      await loadFontRecords();
    } catch (deleteFailure) {
      setError(getFriendlySupabaseError(deleteFailure));
    } finally {
      setBusyId('');
    }
  }

  return (
    <section>
      <div className="page-heading">
        <div>
          <h1>الخطوط</h1>
          <p>إدارة الخطوط المعتمدة التي يمكن استخدامها على البطاقات.</p>
        </div>
        {canManage && (
          <button className="primary-button" type="button" onClick={() => setShowForm(true)}>
            <Plus size={18} /> إضافة خط
          </button>
        )}
      </div>

      {notice && <div className="inline-notice success-notice">{notice}</div>}
      {error && <div className="inline-notice error-notice">{error}</div>}
      {!canManage && <div className="inline-notice info-notice">صلاحيتك للعرض فقط.</div>}

      <div className="toolbar-card font-toolbar">
        <div className="segmented-control" aria-label="تصفية الخطوط">
          {[
            ['all', `الكل (${fonts.length})`],
            ['system', 'المعتمدة'],
            ['uploaded', 'المرفوعة'],
            ['ar', 'عربي'],
            ['en', 'إنجليزي'],
          ].map(([key, label]) => (
            <button key={key} className={filter === key ? 'active' : ''} type="button" onClick={() => setFilter(key)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="content-card loading-card"><LoaderCircle className="spin" size={25} /> جاري تحميل الخطوط...</div>
      ) : filteredFonts.length === 0 ? (
        <div className="content-card empty-table">
          <FileType2 size={38} />
          <strong>لا توجد خطوط في هذا القسم</strong>
        </div>
      ) : (
        <div className="fonts-grid">
          {filteredFonts.map((font) => (
            <article className={`font-card ${font.is_active ? '' : 'font-disabled'}`} key={font.id}>
              <div className="font-card-top">
                <div>
                  <div className="font-badges">
                    <span>{font.is_system ? 'خط معتمد' : 'خط مرفوع'}</span>
                    <span>{LANGUAGE_LABELS[font.language]}</span>
                  </div>
                  <h2>{font.display_name}</h2>
                  <p lang="en" dir="ltr">{fontLabel(font)}</p>
                </div>
                {font.is_active ? <CheckCircle2 size={21} /> : <EyeOff size={21} />}
              </div>

              <div
                className="font-preview-ar"
                dir="rtl"
                style={{ fontFamily: `'${font.family_name}', sans-serif`, fontWeight: font.weight, fontStyle: font.style }}
              >
                أهلاً وسهلاً بكم
              </div>
              <div
                className="font-preview-en"
                lang="en"
                dir="ltr"
                style={{ fontFamily: `'${font.family_name}', sans-serif`, fontWeight: font.weight, fontStyle: font.style }}
              >
                Welcome to the celebration
              </div>

              {canManage && (
                <div className="font-card-actions">
                  <button className="secondary-button" type="button" onClick={() => toggleFont(font)} disabled={busyId === font.id}>
                    {font.is_active ? <><EyeOff size={17} /> إخفاء</> : <><Eye size={17} /> تفعيل</>}
                  </button>
                  {!font.is_system && (
                    <button className="icon-button danger-icon" type="button" aria-label="حذف الخط" onClick={() => setDeleteTarget(font)} disabled={Boolean(busyId)}>
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {showForm && (
        <div className="modal-backdrop drawer-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeForm()}>
          <div className="font-upload-modal" role="dialog" aria-modal="true" aria-labelledby="font-upload-title">
            <button className="icon-button modal-close" type="button" aria-label="إغلاق" onClick={closeForm} disabled={saving}>
              <X size={20} />
            </button>
            <div className="font-upload-icon"><UploadCloud size={30} /></div>
            <h2 id="font-upload-title">إضافة خط جديد</h2>
            <p>ارفع ملف الخط وحدد اللغة والوزن ليظهر داخل محرر القوالب.</p>

            <form className="font-upload-form" onSubmit={handleUpload}>
              <label>
                اسم الخط
                <input value={form.displayName} onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))} placeholder="مثال: Corporate Arabic" disabled={saving} />
              </label>

              <div className="form-grid two-columns">
                <label>
                  دعم اللغة
                  <select value={form.language} onChange={(event) => setForm((current) => ({ ...current, language: event.target.value }))} disabled={saving}>
                    <option value="ar">العربية</option>
                    <option value="en">الإنجليزية</option>
                    <option value="both">العربية والإنجليزية</option>
                  </select>
                </label>
                <label>
                  وزن الخط
                  <select value={form.weight} onChange={(event) => setForm((current) => ({ ...current, weight: event.target.value }))} disabled={saving}>
                    <option value="300">Light — 300</option>
                    <option value="400">Regular — 400</option>
                    <option value="500">Medium — 500</option>
                    <option value="600">DemiBold — 600</option>
                    <option value="700">Bold — 700</option>
                    <option value="800">Extra Bold — 800</option>
                    <option value="900">Black — 900</option>
                  </select>
                </label>
              </div>

              <label>
                النمط
                <select value={form.style} onChange={(event) => setForm((current) => ({ ...current, style: event.target.value }))} disabled={saving}>
                  <option value="normal">Normal</option>
                  <option value="italic">Italic</option>
                </select>
              </label>

              <label className="font-file-drop">
                <input ref={fileRef} type="file" accept=".ttf,.otf,.woff,.woff2" onChange={(event) => setForm((current) => ({ ...current, file: event.target.files?.[0] || null }))} disabled={saving} />
                <UploadCloud size={25} />
                <strong>{form.file?.name || 'اختر ملف الخط'}</strong>
                <span>TTF, OTF, WOFF, WOFF2 — بحد أقصى 10 MB</span>
              </label>

              {formError && <div className="inline-notice error-notice">{formError}</div>}

              <div className="modal-actions">
                <button className="secondary-button" type="button" onClick={closeForm} disabled={saving}>إلغاء</button>
                <button className="primary-button" type="submit" disabled={saving}>
                  {saving ? <><LoaderCircle className="spin" size={17} /> جاري الرفع...</> : <><UploadCloud size={17} /> رفع الخط</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="حذف الخط؟"
        description={`سيتم حذف «${deleteTarget?.display_name || ''}» نهائيًا. لا يمكن حذف الخط إذا كان مستخدمًا داخل قالب.`}
        confirmLabel="حذف الخط"
        busy={busyId === deleteTarget?.id}
        onConfirm={deleteFont}
        onClose={() => !busyId && setDeleteTarget(null)}
      />
    </section>
  );
}
