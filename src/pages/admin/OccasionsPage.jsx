import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  CalendarClock,
  CalendarPlus,
  Check,
  Copy,
  CopyPlus,
  Edit3,
  Eye,
  Image as ImageIcon,
  LoaderCircle,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import ConfirmModal from '../../components/ConfirmModal';
import TemplateImageField from '../../components/TemplateImageField';
import { useAuth } from '../../context/AuthContext';
import {
  TEMPLATE_BUCKET,
  formatDateTime,
  getFriendlySupabaseError,
  getOccasionState,
  getTemplatePublicUrl,
  makeOccasionSlug,
  readImageDimensions,
  toDateTimeLocal,
  validateTemplateFile,
} from '../../lib/occasionUtils';
import { supabase } from '../../lib/supabase';

const EMPTY_FORM = {
  title_ar: '',
  title_en: '',
  starts_at: '',
  ends_at: '',
  status: 'draft',
  squareFile: null,
  rectangleFile: null,
};

const TEMPLATE_NAMES = {
  square: 'Square Template',
  rectangle: 'Rectangle Template',
};

function templateByShape(occasion, shape) {
  return occasion?.templates?.find((template) => template.shape === shape) || null;
}

function storageExtension(file) {
  const fromName = file.name.split('.').pop()?.toLowerCase();
  if (fromName && ['jpg', 'jpeg', 'png', 'webp'].includes(fromName)) return fromName === 'jpeg' ? 'jpg' : fromName;
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  return 'jpg';
}

function pathExtension(path) {
  const extension = path.split('.').pop()?.toLowerCase();
  return ['jpg', 'jpeg', 'png', 'webp'].includes(extension) ? extension : 'jpg';
}

function settingsRow(template) {
  return Array.isArray(template?.template_settings)
    ? template.template_settings[0]
    : template?.template_settings;
}

export default function OccasionsPage() {
  const { profile } = useAuth();
  const canManage = ['super_admin', 'admin'].includes(profile?.role);
  const [occasions, setOccasions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [notice, setNotice] = useState('');
  const [viewMode, setViewMode] = useState('current');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingOccasion, setEditingOccasion] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [actionBusyId, setActionBusyId] = useState('');
  const [copiedId, setCopiedId] = useState('');

  const loadOccasions = useCallback(async () => {
    setLoading(true);
    setPageError('');

    const { data, error } = await supabase
      .from('occasions')
      .select(`
        id, title_ar, title_en, slug, starts_at, ends_at, status, archived_at, archived_by, created_by, created_at, updated_at,
        templates (
          id, name, shape, image_path, image_width, image_height, is_active, created_at, updated_at,
          template_settings (id, arabic_settings, english_settings)
        )
      `)
      .order('starts_at', { ascending: false });

    if (error) {
      setPageError(getFriendlySupabaseError(error));
      setOccasions([]);
    } else {
      setOccasions(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void loadOccasions(); }, [loadOccasions]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(''), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const currentOccasions = useMemo(() => occasions.filter((occasion) => !occasion.archived_at), [occasions]);
  const archivedOccasions = useMemo(() => occasions.filter((occasion) => Boolean(occasion.archived_at)), [occasions]);
  const visibleOccasions = viewMode === 'archived' ? archivedOccasions : currentOccasions;

  const summary = useMemo(() => {
    const totals = { all: currentOccasions.length, active: 0, scheduled: 0, draft: 0, archived: archivedOccasions.length };
    currentOccasions.forEach((occasion) => {
      const state = getOccasionState(occasion).key;
      if (state === 'active') totals.active += 1;
      if (state === 'scheduled') totals.scheduled += 1;
      if (state === 'draft') totals.draft += 1;
    });
    return totals;
  }, [archivedOccasions.length, currentOccasions]);

  function openCreate() {
    setEditingOccasion(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setEditorOpen(true);
  }

  function openEdit(occasion) {
    setEditingOccasion(occasion);
    setForm({
      title_ar: occasion.title_ar,
      title_en: occasion.title_en,
      starts_at: toDateTimeLocal(occasion.starts_at),
      ends_at: toDateTimeLocal(occasion.ends_at),
      status: occasion.status,
      squareFile: null,
      rectangleFile: null,
    });
    setFormError('');
    setEditorOpen(true);
  }

  function closeEditor(force = false) {
    if (saving && !force) return;
    setEditorOpen(false);
    setEditingOccasion(null);
    setForm(EMPTY_FORM);
    setFormError('');
  }

  function updateField(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function copyPublicLink(occasion) {
    const url = `${window.location.origin}/occasion/${occasion.slug}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const input = document.createElement('textarea');
      input.value = url;
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      input.remove();
    }
    setCopiedId(occasion.id);
    setNotice('تم نسخ رابط المناسبة.');
    window.setTimeout(() => setCopiedId((current) => (current === occasion.id ? '' : current)), 2200);
  }

  async function uploadTemplate(file, occasionId, shape) {
    const dimensions = await readImageDimensions(file);
    const extension = storageExtension(file);
    const random = crypto.randomUUID().slice(0, 8);
    const path = `${occasionId}/${shape}-${Date.now()}-${random}.${extension}`;

    const { error } = await supabase.storage.from(TEMPLATE_BUCKET).upload(path, file, {
      cacheControl: '3600',
      contentType: file.type,
      upsert: false,
    });
    if (error) throw error;

    return { path, dimensions };
  }

  async function saveTemplate({ occasionId, shape, upload, existingTemplate }) {
    if (!upload) return null;

    const payload = {
      occasion_id: occasionId,
      name: TEMPLATE_NAMES[shape],
      shape,
      image_path: upload.path,
      image_width: upload.dimensions.width,
      image_height: upload.dimensions.height,
      is_active: true,
      created_by: profile.id,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('templates')
      .upsert(payload, { onConflict: 'occasion_id,shape,name' })
      .select('id, image_path')
      .single();

    if (error) throw error;

    if (existingTemplate?.image_path && existingTemplate.image_path !== upload.path) {
      const { error: removeError } = await supabase.storage.from(TEMPLATE_BUCKET).remove([existingTemplate.image_path]);
      if (removeError) console.warn('Old template file cleanup failed:', removeError.message);
    }

    return data;
  }

  async function handleSave(event) {
    event.preventDefault();
    if (!canManage || saving) return;

    setFormError('');
    const titleAr = form.title_ar.trim();
    const titleEn = form.title_en.trim();
    const startsAtDate = new Date(form.starts_at);
    const endsAtDate = new Date(form.ends_at);

    if (!titleAr || !titleEn) {
      setFormError('أدخل اسم المناسبة بالعربي والإنجليزي.');
      return;
    }
    if (!form.starts_at || !form.ends_at || Number.isNaN(startsAtDate.getTime()) || Number.isNaN(endsAtDate.getTime())) {
      setFormError('أدخل تاريخ ووقت البداية والنهاية بشكل صحيح.');
      return;
    }
    if (endsAtDate <= startsAtDate) {
      setFormError('يجب أن يكون وقت النهاية بعد وقت البداية.');
      return;
    }

    const squareError = validateTemplateFile(form.squareFile);
    const rectangleError = validateTemplateFile(form.rectangleFile);
    if (squareError || rectangleError) {
      setFormError(squareError || rectangleError);
      return;
    }

    const startsAt = startsAtDate.toISOString();
    const endsAt = endsAtDate.toISOString();
    const occasionId = editingOccasion?.id || crypto.randomUUID();
    const uploadedPaths = [];
    let insertedNewOccasion = false;

    setSaving(true);

    try {
      const squareUpload = form.squareFile ? await uploadTemplate(form.squareFile, occasionId, 'square') : null;
      if (squareUpload) uploadedPaths.push(squareUpload.path);
      const rectangleUpload = form.rectangleFile ? await uploadTemplate(form.rectangleFile, occasionId, 'rectangle') : null;
      if (rectangleUpload) uploadedPaths.push(rectangleUpload.path);

      const occasionPayload = {
        id: occasionId,
        title_ar: titleAr,
        title_en: titleEn,
        slug: editingOccasion?.slug || makeOccasionSlug(titleEn),
        starts_at: startsAt,
        ends_at: endsAt,
        status: form.status,
        created_by: editingOccasion?.created_by || profile.id,
        updated_at: new Date().toISOString(),
      };

      const { error: occasionError } = editingOccasion
        ? await supabase.from('occasions').update(occasionPayload).eq('id', occasionId)
        : await supabase.from('occasions').insert(occasionPayload);
      if (occasionError) throw occasionError;
      insertedNewOccasion = !editingOccasion;

      await Promise.all([
        saveTemplate({ occasionId, shape: 'square', upload: squareUpload, existingTemplate: templateByShape(editingOccasion, 'square') }),
        saveTemplate({ occasionId, shape: 'rectangle', upload: rectangleUpload, existingTemplate: templateByShape(editingOccasion, 'rectangle') }),
      ]);

      closeEditor(true);
      setNotice(editingOccasion ? 'تم تحديث المناسبة بنجاح.' : 'تم إنشاء المناسبة بنجاح.');
      await loadOccasions();
    } catch (error) {
      if (uploadedPaths.length) await supabase.storage.from(TEMPLATE_BUCKET).remove(uploadedPaths);
      if (insertedNewOccasion) await supabase.from('occasions').delete().eq('id', occasionId);
      setFormError(getFriendlySupabaseError(error));
    } finally {
      setSaving(false);
    }
  }

  async function duplicateOccasion(occasion) {
    if (!canManage || actionBusyId) return;
    const newOccasionId = crypto.randomUUID();
    const uploadedPaths = [];
    setActionBusyId(occasion.id);
    setPageError('');

    try {
      const duration = Math.max(60 * 60 * 1000, new Date(occasion.ends_at).getTime() - new Date(occasion.starts_at).getTime());
      const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const endsAt = new Date(startsAt.getTime() + duration);
      const uniqueSuffix = Date.now().toString(36);

      const { error: occasionError } = await supabase.from('occasions').insert({
        id: newOccasionId,
        title_ar: `${occasion.title_ar} - نسخة`,
        title_en: `${occasion.title_en} - Copy`,
        slug: makeOccasionSlug(`${occasion.title_en}-copy-${uniqueSuffix}`),
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        status: 'draft',
        created_by: profile.id,
        updated_at: new Date().toISOString(),
      });
      if (occasionError) throw occasionError;

      for (const template of occasion.templates || []) {
        const { data: fileBlob, error: downloadError } = await supabase.storage.from(TEMPLATE_BUCKET).download(template.image_path);
        if (downloadError) throw downloadError;
        const path = `${newOccasionId}/${template.shape}-copy-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${pathExtension(template.image_path)}`;
        const { error: uploadError } = await supabase.storage.from(TEMPLATE_BUCKET).upload(path, fileBlob, {
          cacheControl: '3600',
          contentType: fileBlob.type || undefined,
          upsert: false,
        });
        if (uploadError) throw uploadError;
        uploadedPaths.push(path);

        const newTemplateId = crypto.randomUUID();
        const { error: templateError } = await supabase.from('templates').insert({
          id: newTemplateId,
          occasion_id: newOccasionId,
          name: template.name,
          shape: template.shape,
          image_path: path,
          image_width: template.image_width,
          image_height: template.image_height,
          is_active: template.is_active,
          created_by: profile.id,
          updated_at: new Date().toISOString(),
        });
        if (templateError) throw templateError;

        const copiedSettings = settingsRow(template);
        if (copiedSettings) {
          const { error: settingsError } = await supabase.from('template_settings').insert({
            template_id: newTemplateId,
            arabic_settings: copiedSettings.arabic_settings || {},
            english_settings: copiedSettings.english_settings || {},
            updated_by: profile.id,
            updated_at: new Date().toISOString(),
          });
          if (settingsError) throw settingsError;
        }
      }

      setNotice('تم نسخ المناسبة وقوالبها كمسودة جديدة.');
      setViewMode('current');
      await loadOccasions();
    } catch (error) {
      if (uploadedPaths.length) await supabase.storage.from(TEMPLATE_BUCKET).remove(uploadedPaths);
      await supabase.from('occasions').delete().eq('id', newOccasionId);
      setPageError(getFriendlySupabaseError(error));
    } finally {
      setActionBusyId('');
    }
  }

  async function handleArchive() {
    if (!archiveTarget || !canManage || actionBusyId) return;
    setActionBusyId(archiveTarget.id);
    setPageError('');
    const { error } = await supabase.from('occasions').update({
      archived_at: new Date().toISOString(),
      archived_by: profile.id,
      status: 'disabled',
      updated_at: new Date().toISOString(),
    }).eq('id', archiveTarget.id);

    if (error) setPageError(getFriendlySupabaseError(error));
    else {
      setNotice('تمت أرشفة المناسبة وإخفاؤها من الصفحة العامة.');
      setArchiveTarget(null);
      await loadOccasions();
    }
    setActionBusyId('');
  }

  async function restoreOccasion(occasion) {
    if (!canManage || actionBusyId) return;
    setActionBusyId(occasion.id);
    setPageError('');
    const { error } = await supabase.from('occasions').update({
      archived_at: null,
      archived_by: null,
      status: 'draft',
      updated_at: new Date().toISOString(),
    }).eq('id', occasion.id);

    if (error) setPageError(getFriendlySupabaseError(error));
    else {
      setNotice('تمت استعادة المناسبة كمسودة.');
      await loadOccasions();
    }
    setActionBusyId('');
  }

  async function handleDelete() {
    if (!deleteTarget || !canManage || deleting) return;
    setDeleting(true);
    setPageError('');

    try {
      const paths = (deleteTarget.templates || []).map((template) => template.image_path).filter(Boolean);
      const { error } = await supabase.rpc('delete_archived_occasion', { p_occasion_id: deleteTarget.id });
      if (error) throw error;
      if (paths.length) {
        const { error: storageError } = await supabase.storage.from(TEMPLATE_BUCKET).remove(paths);
        if (storageError) console.warn('Template cleanup failed:', storageError.message);
      }
      setDeleteTarget(null);
      setNotice('تم حذف المناسبة المؤرشفة وقوالبها نهائيًا.');
      await loadOccasions();
    } catch (error) {
      setPageError(getFriendlySupabaseError(error));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section>
      <div className="page-heading">
        <div>
          <h1>المناسبات</h1>
          <p>إنشاء المناسبات، نسخها، أرشفتها، ورفع القوالب ومشاركة الروابط.</p>
        </div>
        {canManage && (
          <button className="primary-button" type="button" onClick={openCreate}>
            <Plus size={18} /> إضافة مناسبة
          </button>
        )}
      </div>

      {notice && <div className="inline-notice success-notice">{notice}</div>}
      {pageError && <div className="inline-notice error-notice">{pageError}</div>}
      {!canManage && <div className="inline-notice info-notice">صلاحيتك للعرض فقط، ولا يمكنك تعديل المناسبات.</div>}

      <div className="mini-stats-grid five-columns">
        <article><strong>{summary.all}</strong><span>المناسبات الحالية</span></article>
        <article><strong>{summary.active}</strong><span>مفعلة الآن</span></article>
        <article><strong>{summary.scheduled}</strong><span>مجدولة</span></article>
        <article><strong>{summary.draft}</strong><span>مسودات</span></article>
        <article><strong>{summary.archived}</strong><span>مؤرشفة</span></article>
      </div>

      <div className="toolbar-card occasion-view-toolbar">
        <div className="segmented-control" aria-label="عرض المناسبات">
          <button className={viewMode === 'current' ? 'active' : ''} type="button" onClick={() => setViewMode('current')}>الحالية ({currentOccasions.length})</button>
          <button className={viewMode === 'archived' ? 'active' : ''} type="button" onClick={() => setViewMode('archived')}>الأرشيف ({archivedOccasions.length})</button>
        </div>
      </div>

      {loading ? (
        <div className="content-card loading-card"><LoaderCircle className="spin" size={25} /> جاري تحميل المناسبات...</div>
      ) : visibleOccasions.length === 0 ? (
        <div className="content-card empty-table">
          {viewMode === 'archived' ? <Archive size={38} /> : <CalendarPlus size={38} />}
          <strong>{viewMode === 'archived' ? 'لا توجد مناسبات مؤرشفة' : 'لا توجد مناسبات بعد'}</strong>
          <span>{viewMode === 'archived' ? 'ستظهر هنا المناسبات التي تتم أرشفتها.' : 'أضف المناسبة الأولى ثم ارفع القالب المربع والمستطيل.'}</span>
        </div>
      ) : (
        <div className="occasion-list">
          {visibleOccasions.map((occasion) => {
            const state = occasion.archived_at ? { key: 'archived', label: 'مؤرشفة' } : getOccasionState(occasion);
            const square = templateByShape(occasion, 'square');
            const rectangle = templateByShape(occasion, 'rectangle');
            const busy = actionBusyId === occasion.id;

            return (
              <article className={`occasion-card ${occasion.archived_at ? 'archived-occasion-card' : ''}`} key={occasion.id}>
                <div className="occasion-card-main">
                  <div className="occasion-title-row">
                    <div>
                      <h2>{occasion.title_ar}</h2>
                      <span lang="en" dir="ltr">{occasion.title_en}</span>
                    </div>
                    <span className={`status-badge status-${state.key}`}>{state.label}</span>
                  </div>

                  <div className="occasion-dates">
                    <div><CalendarClock size={17} /><span>البداية</span><strong>{formatDateTime(occasion.starts_at)}</strong></div>
                    <div><CalendarClock size={17} /><span>النهاية</span><strong>{formatDateTime(occasion.ends_at)}</strong></div>
                    {occasion.archived_at && <div><Archive size={17} /><span>تاريخ الأرشفة</span><strong>{formatDateTime(occasion.archived_at)}</strong></div>}
                  </div>

                  <div className="occasion-template-summary">
                    {[['square', 'مربع', square], ['rectangle', 'مستطيل', rectangle]].map(([shape, label, template]) => (
                      <div className={`template-mini-card ${template ? 'ready' : ''}`} key={shape}>
                        {template ? <img src={getTemplatePublicUrl(template.image_path)} alt={`قالب ${label}`} /> : <ImageIcon size={23} />}
                        <div><strong>قالب {label}</strong><span>{template ? `${template.image_width} × ${template.image_height}` : 'غير مرفوع'}</span></div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="occasion-card-actions">
                  {!occasion.archived_at && (
                    <>
                      <Link className="secondary-button" to={`/admin/occasions/${occasion.id}/preview`}><Eye size={17} /> معاينة</Link>
                      <button className="secondary-button" type="button" onClick={() => copyPublicLink(occasion)}>
                        {copiedId === occasion.id ? <Check size={17} /> : <Copy size={17} />}
                        {copiedId === occasion.id ? 'تم النسخ' : 'نسخ الرابط'}
                      </button>
                    </>
                  )}
                  {canManage && (
                    <>
                      <button className="secondary-button" type="button" onClick={() => duplicateOccasion(occasion)} disabled={busy || Boolean(actionBusyId)}>
                        {busy ? <LoaderCircle className="spin" size={17} /> : <CopyPlus size={17} />} نسخ المناسبة
                      </button>
                      {!occasion.archived_at ? (
                        <>
                          <button className="secondary-button" type="button" onClick={() => openEdit(occasion)} disabled={Boolean(actionBusyId)}><Edit3 size={17} /> تعديل</button>
                          <button className="secondary-button danger-text" type="button" onClick={() => setArchiveTarget(occasion)} disabled={Boolean(actionBusyId)}><Archive size={17} /> أرشفة</button>
                        </>
                      ) : (
                        <>
                          <button className="secondary-button" type="button" onClick={() => restoreOccasion(occasion)} disabled={busy || Boolean(actionBusyId)}>
                            {busy ? <LoaderCircle className="spin" size={17} /> : <ArchiveRestore size={17} />} استعادة
                          </button>
                          <button className="icon-button danger-icon" type="button" aria-label="حذف المناسبة نهائيًا" onClick={() => setDeleteTarget(occasion)} disabled={Boolean(actionBusyId)}><Trash2 size={18} /></button>
                        </>
                      )}
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {editorOpen && (
        <div className="drawer-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeEditor();
        }}>
          <section className="occasion-drawer" role="dialog" aria-modal="true" aria-labelledby="occasion-editor-title">
            <header className="drawer-header">
              <div><h2 id="occasion-editor-title">{editingOccasion ? 'تعديل المناسبة' : 'إضافة مناسبة'}</h2><p>حدد الاسم والمدة وارفع القوالب المتاحة للمستخدم.</p></div>
              <button className="icon-button" type="button" aria-label="إغلاق" onClick={closeEditor} disabled={saving}><X size={20} /></button>
            </header>

            <form className="occasion-form" onSubmit={handleSave}>
              <div className="form-section">
                <h3>بيانات المناسبة</h3>
                <div className="form-grid two-columns">
                  <label>اسم المناسبة بالعربي<input value={form.title_ar} onChange={(event) => updateField('title_ar', event.target.value)} placeholder="مثال: اليوم الوطني" required /></label>
                  <label>اسم المناسبة بالإنجليزي<input lang="en" dir="ltr" value={form.title_en} onChange={(event) => updateField('title_en', event.target.value)} placeholder="Example: National Day" required /></label>
                  <label>تاريخ ووقت البداية<input type="datetime-local" lang="en" dir="ltr" value={form.starts_at} onChange={(event) => updateField('starts_at', event.target.value)} required /></label>
                  <label>تاريخ ووقت النهاية<input type="datetime-local" lang="en" dir="ltr" value={form.ends_at} onChange={(event) => updateField('ends_at', event.target.value)} required /></label>
                  <label className="full-column">
                    حالة المناسبة
                    <select value={form.status} onChange={(event) => updateField('status', event.target.value)}>
                      <option value="draft">مسودة — لا تظهر للمستخدم</option>
                      <option value="active">مفعلة حسب وقت البداية والنهاية</option>
                      <option value="disabled">معطلة</option>
                      <option value="ended">منتهية يدويًا</option>
                    </select>
                    <small>عند اختيار «مفعلة»، ستظهر تلقائيًا داخل الفترة المحددة.</small>
                  </label>
                </div>
              </div>

              <div className="form-section">
                <h3>قوالب المناسبة</h3>
                <p className="section-hint">يمكن رفع قالب واحد أو القالبين، ثم ضبط مواضع النص من صفحة القوالب.</p>
                <div className="template-fields-grid">
                  <TemplateImageField label="القالب المربع" hint="مناسب لمنشورات 1:1 مثل 1080 × 1080" file={form.squareFile} existingTemplate={templateByShape(editingOccasion, 'square')} onChange={(file) => updateField('squareFile', file)} disabled={saving} />
                  <TemplateImageField label="القالب المستطيل" hint="مناسب للتصاميم الأفقية أو الرأسية" file={form.rectangleFile} existingTemplate={templateByShape(editingOccasion, 'rectangle')} onChange={(file) => updateField('rectangleFile', file)} disabled={saving} />
                </div>
              </div>

              {formError && <div className="inline-notice error-notice">{formError}</div>}
              <footer className="drawer-footer">
                <button className="secondary-button" type="button" onClick={closeEditor} disabled={saving}>إلغاء</button>
                <button className="primary-button" type="submit" disabled={saving}>
                  {saving ? <><LoaderCircle className="spin" size={18} /> جاري الحفظ...</> : editingOccasion ? 'حفظ التعديلات' : 'إنشاء المناسبة'}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}

      <ConfirmModal
        open={Boolean(archiveTarget)}
        title="أرشفة المناسبة؟"
        description={`سيتم إخفاء «${archiveTarget?.title_ar || ''}» من الصفحة العامة، مع الاحتفاظ بالقوالب والإحصائيات وإمكانية استعادتها لاحقًا.`}
        confirmLabel="أرشفة المناسبة"
        busy={actionBusyId === archiveTarget?.id}
        onConfirm={handleArchive}
        onClose={() => !actionBusyId && setArchiveTarget(null)}
      />

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="حذف المناسبة نهائيًا؟"
        description={`سيتم حذف «${deleteTarget?.title_ar || ''}» وقوالبها نهائيًا. استخدم الحذف فقط بعد التأكد من عدم الحاجة إلى بياناتها.`}
        confirmLabel="حذف نهائي"
        busy={deleting}
        onConfirm={handleDelete}
        onClose={() => !deleting && setDeleteTarget(null)}
      />
    </section>
  );
}
