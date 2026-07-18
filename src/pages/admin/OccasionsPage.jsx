import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  CalendarPlus,
  Edit3,
  Image as ImageIcon,
  LoaderCircle,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
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

export default function OccasionsPage() {
  const { profile } = useAuth();
  const canManage = ['super_admin', 'admin'].includes(profile?.role);
  const [occasions, setOccasions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [notice, setNotice] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingOccasion, setEditingOccasion] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const loadOccasions = useCallback(async () => {
    setLoading(true);
    setPageError('');

    const { data, error } = await supabase
      .from('occasions')
      .select(`
        id, title_ar, title_en, slug, starts_at, ends_at, status, created_at, updated_at,
        templates (id, name, shape, image_path, image_width, image_height, is_active, created_at, updated_at)
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

  useEffect(() => {
    void loadOccasions();
  }, [loadOccasions]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(''), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const summary = useMemo(() => {
    const totals = { all: occasions.length, active: 0, scheduled: 0, draft: 0 };
    occasions.forEach((occasion) => {
      const state = getOccasionState(occasion).key;
      if (state === 'active') totals.active += 1;
      if (state === 'scheduled') totals.scheduled += 1;
      if (state === 'draft') totals.draft += 1;
    });
    return totals;
  }, [occasions]);

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

  async function findScheduleConflict(startsAt, endsAt, currentId) {
    let query = supabase
      .from('occasions')
      .select('id, title_ar, starts_at, ends_at')
      .eq('status', 'active')
      .lt('starts_at', endsAt)
      .gt('ends_at', startsAt)
      .limit(1);

    if (currentId) query = query.neq('id', currentId);
    const { data, error } = await query;
    if (error) throw error;
    return data?.[0] || null;
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
      const { error: removeError } = await supabase.storage
        .from(TEMPLATE_BUCKET)
        .remove([existingTemplate.image_path]);
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
      if (form.status === 'active') {
        const conflict = await findScheduleConflict(startsAt, endsAt, editingOccasion?.id);
        if (conflict) {
          throw new Error(`يتداخل التوقيت مع المناسبة: ${conflict.title_ar}`);
        }
      }

      const squareUpload = form.squareFile
        ? await uploadTemplate(form.squareFile, occasionId, 'square')
        : null;
      if (squareUpload) uploadedPaths.push(squareUpload.path);

      const rectangleUpload = form.rectangleFile
        ? await uploadTemplate(form.rectangleFile, occasionId, 'rectangle')
        : null;
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
        saveTemplate({
          occasionId,
          shape: 'square',
          upload: squareUpload,
          existingTemplate: templateByShape(editingOccasion, 'square'),
        }),
        saveTemplate({
          occasionId,
          shape: 'rectangle',
          upload: rectangleUpload,
          existingTemplate: templateByShape(editingOccasion, 'rectangle'),
        }),
      ]);

      closeEditor(true);
      setNotice(editingOccasion ? 'تم تحديث المناسبة بنجاح.' : 'تم إنشاء المناسبة بنجاح.');
      await loadOccasions();
    } catch (error) {
      if (uploadedPaths.length) {
        await supabase.storage.from(TEMPLATE_BUCKET).remove(uploadedPaths);
      }
      if (insertedNewOccasion) {
        await supabase.from('occasions').delete().eq('id', occasionId);
      }
      setFormError(getFriendlySupabaseError(error));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget || !canManage || deleting) return;
    setDeleting(true);
    setPageError('');

    try {
      const paths = (deleteTarget.templates || []).map((template) => template.image_path).filter(Boolean);
      if (paths.length) {
        const { error: storageError } = await supabase.storage.from(TEMPLATE_BUCKET).remove(paths);
        if (storageError) console.warn('Template cleanup failed:', storageError.message);
      }

      const { error } = await supabase.from('occasions').delete().eq('id', deleteTarget.id);
      if (error) throw error;

      setDeleteTarget(null);
      setNotice('تم حذف المناسبة وقوالبها.');
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
          <p>إنشاء المناسبات وتحديد وقت ظهورها ورفع القوالب الأساسية.</p>
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

      <div className="mini-stats-grid">
        <article><strong>{summary.all}</strong><span>إجمالي المناسبات</span></article>
        <article><strong>{summary.active}</strong><span>مفعلة الآن</span></article>
        <article><strong>{summary.scheduled}</strong><span>مجدولة</span></article>
        <article><strong>{summary.draft}</strong><span>مسودات</span></article>
      </div>

      {loading ? (
        <div className="content-card loading-card"><LoaderCircle className="spin" size={25} /> جاري تحميل المناسبات...</div>
      ) : occasions.length === 0 ? (
        <div className="content-card empty-table">
          <CalendarPlus size={38} />
          <strong>لا توجد مناسبات بعد</strong>
          <span>أضف المناسبة الأولى ثم ارفع القالب المربع والمستطيل.</span>
        </div>
      ) : (
        <div className="occasion-list">
          {occasions.map((occasion) => {
            const state = getOccasionState(occasion);
            const square = templateByShape(occasion, 'square');
            const rectangle = templateByShape(occasion, 'rectangle');

            return (
              <article className="occasion-card" key={occasion.id}>
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
                  </div>

                  <div className="occasion-template-summary">
                    {[['square', 'مربع', square], ['rectangle', 'مستطيل', rectangle]].map(([shape, label, template]) => (
                      <div className={`template-mini-card ${template ? 'ready' : ''}`} key={shape}>
                        {template ? (
                          <img src={getTemplatePublicUrl(template.image_path)} alt={`قالب ${label}`} />
                        ) : (
                          <ImageIcon size={23} />
                        )}
                        <div><strong>قالب {label}</strong><span>{template ? `${template.image_width} × ${template.image_height}` : 'غير مرفوع'}</span></div>
                      </div>
                    ))}
                  </div>
                </div>

                {canManage && (
                  <div className="occasion-card-actions">
                    <button className="secondary-button" type="button" onClick={() => openEdit(occasion)}>
                      <Edit3 size={17} /> تعديل
                    </button>
                    <button className="icon-button danger-icon" type="button" aria-label="حذف المناسبة" onClick={() => setDeleteTarget(occasion)}>
                      <Trash2 size={18} />
                    </button>
                  </div>
                )}
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
              <div>
                <h2 id="occasion-editor-title">{editingOccasion ? 'تعديل المناسبة' : 'إضافة مناسبة'}</h2>
                <p>حدد الاسم والمدة وارفع القوالب المتاحة للمستخدم.</p>
              </div>
              <button className="icon-button" type="button" aria-label="إغلاق" onClick={closeEditor} disabled={saving}>
                <X size={20} />
              </button>
            </header>

            <form className="occasion-form" onSubmit={handleSave}>
              <div className="form-section">
                <h3>بيانات المناسبة</h3>
                <div className="form-grid two-columns">
                  <label>
                    اسم المناسبة بالعربي
                    <input value={form.title_ar} onChange={(event) => updateField('title_ar', event.target.value)} placeholder="مثال: اليوم الوطني" required />
                  </label>
                  <label>
                    اسم المناسبة بالإنجليزي
                    <input lang="en" dir="ltr" value={form.title_en} onChange={(event) => updateField('title_en', event.target.value)} placeholder="Example: National Day" required />
                  </label>
                  <label>
                    تاريخ ووقت البداية
                    <input type="datetime-local" value={form.starts_at} onChange={(event) => updateField('starts_at', event.target.value)} required />
                  </label>
                  <label>
                    تاريخ ووقت النهاية
                    <input type="datetime-local" value={form.ends_at} onChange={(event) => updateField('ends_at', event.target.value)} required />
                  </label>
                  <label className="full-column">
                    حالة المناسبة
                    <select value={form.status} onChange={(event) => updateField('status', event.target.value)}>
                      <option value="draft">مسودة — لا تظهر للمستخدم</option>
                      <option value="active">مفعلة حسب وقت البداية والنهاية</option>
                      <option value="disabled">معطلة</option>
                      <option value="ended">منتهية يدويًا</option>
                    </select>
                    <small>عند اختيار «مفعلة»، ستظهر تلقائيًا داخل الفترة المحددة، وتظهر «مجدولة» قبل بدايتها.</small>
                  </label>
                </div>
              </div>

              <div className="form-section">
                <h3>قوالب المناسبة</h3>
                <p className="section-hint">يمكن رفع قالب واحد أو القالبين. تحديد موضع النص سيضاف في الحزمة التالية.</p>
                <div className="template-fields-grid">
                  <TemplateImageField
                    label="القالب المربع"
                    hint="مناسب لمنشورات 1:1 مثل 1080 × 1080"
                    file={form.squareFile}
                    existingTemplate={templateByShape(editingOccasion, 'square')}
                    onChange={(file) => updateField('squareFile', file)}
                    disabled={saving}
                  />
                  <TemplateImageField
                    label="القالب المستطيل"
                    hint="مناسب للتصاميم الأفقية أو الرأسية"
                    file={form.rectangleFile}
                    existingTemplate={templateByShape(editingOccasion, 'rectangle')}
                    onChange={(file) => updateField('rectangleFile', file)}
                    disabled={saving}
                  />
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
        open={Boolean(deleteTarget)}
        title="حذف المناسبة؟"
        description={`سيتم حذف «${deleteTarget?.title_ar || ''}» وجميع القوالب المرتبطة بها. لا يمكن التراجع عن هذه العملية.`}
        confirmLabel="حذف المناسبة"
        busy={deleting}
        onConfirm={handleDelete}
        onClose={() => !deleting && setDeleteTarget(null)}
      />
    </section>
  );
}
