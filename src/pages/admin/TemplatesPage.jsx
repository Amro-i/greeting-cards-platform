import { useCallback, useEffect, useMemo, useState } from 'react';
import { CopyPlus, Eye, EyeOff, ImageOff, LoaderCircle, Palette, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import ConfirmModal from '../../components/ConfirmModal';
import { useAuth } from '../../context/AuthContext';
import {
  TEMPLATE_BUCKET,
  formatDateTime,
  getFriendlySupabaseError,
  getOccasionState,
  getTemplatePublicUrl,
} from '../../lib/occasionUtils';
import { supabase } from '../../lib/supabase';

export default function TemplatesPage() {
  const { profile } = useAuth();
  const canManage = ['super_admin', 'admin'].includes(profile?.role);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [shapeFilter, setShapeFilter] = useState('all');
  const [busyId, setBusyId] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError('');
    const { data, error: queryError } = await supabase
      .from('templates')
      .select(`
        id, name, shape, image_path, image_width, image_height, is_active, created_at, updated_at,
        occasion:occasions (id, title_ar, title_en, status, starts_at, ends_at, archived_at),
        template_settings (id, arabic_settings, english_settings)
      `)
      .order('updated_at', { ascending: false });

    if (queryError) {
      setError(getFriendlySupabaseError(queryError));
      setTemplates([]);
    } else {
      setTemplates(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(''), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const filteredTemplates = useMemo(() => (
    shapeFilter === 'all' ? templates : templates.filter((template) => template.shape === shapeFilter)
  ), [shapeFilter, templates]);

  async function toggleTemplate(template) {
    if (!canManage || busyId) return;
    setBusyId(template.id);
    setError('');
    const { error: updateError } = await supabase
      .from('templates')
      .update({ is_active: !template.is_active, updated_at: new Date().toISOString() })
      .eq('id', template.id);

    if (updateError) {
      setError(getFriendlySupabaseError(updateError));
    } else {
      setNotice(template.is_active ? 'تم إخفاء القالب.' : 'تم تفعيل القالب.');
      await loadTemplates();
    }
    setBusyId('');
  }

  async function duplicateTemplate(template) {
    if (!canManage || busyId) return;
    setBusyId(template.id);
    setError('');

    let uploadedPath = '';
    let duplicateId = '';
    try {
      const { data: fileBlob, error: downloadError } = await supabase.storage
        .from(TEMPLATE_BUCKET)
        .download(template.image_path);
      if (downloadError) throw downloadError;

      const extension = template.image_path.split('.').pop()?.toLowerCase() || 'jpg';
      uploadedPath = `${template.occasion.id}/${template.shape}-duplicate-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${extension}`;
      const { error: uploadError } = await supabase.storage.from(TEMPLATE_BUCKET).upload(uploadedPath, fileBlob, {
        cacheControl: '3600',
        contentType: fileBlob.type || undefined,
        upsert: false,
      });
      if (uploadError) throw uploadError;

      duplicateId = crypto.randomUUID();
      const { error: insertError } = await supabase.from('templates').insert({
        id: duplicateId,
        occasion_id: template.occasion.id,
        name: `${template.name} Copy ${Date.now().toString(36)}`,
        shape: template.shape,
        image_path: uploadedPath,
        image_width: template.image_width,
        image_height: template.image_height,
        is_active: false,
        created_by: profile.id,
        updated_at: new Date().toISOString(),
      });
      if (insertError) throw insertError;

      const currentSettings = Array.isArray(template.template_settings)
        ? template.template_settings[0]
        : template.template_settings;
      if (currentSettings) {
        const { error: settingsError } = await supabase.from('template_settings').insert({
          template_id: duplicateId,
          arabic_settings: currentSettings.arabic_settings || {},
          english_settings: currentSettings.english_settings || {},
          updated_by: profile.id,
          updated_at: new Date().toISOString(),
        });
        if (settingsError) throw settingsError;
      }

      setNotice('تم نسخ القالب وإضافته كقالب غير مفعّل.');
      await loadTemplates();
    } catch (duplicateError) {
      if (duplicateId) await supabase.from('templates').delete().eq('id', duplicateId);
      if (uploadedPath) await supabase.storage.from(TEMPLATE_BUCKET).remove([uploadedPath]);
      setError(getFriendlySupabaseError(duplicateError));
    } finally {
      setBusyId('');
    }
  }

  async function deleteTemplate() {
    if (!deleteTarget || !canManage || busyId) return;
    setBusyId(deleteTarget.id);
    setError('');

    try {
      const { error: deleteError } = await supabase.from('templates').delete().eq('id', deleteTarget.id);
      if (deleteError) throw deleteError;

      const { error: storageError } = await supabase.storage
        .from(TEMPLATE_BUCKET)
        .remove([deleteTarget.image_path]);
      if (storageError) console.warn('Template file cleanup failed:', storageError.message);

      setDeleteTarget(null);
      setNotice('تم حذف القالب.');
      await loadTemplates();
    } catch (deleteError) {
      setError(getFriendlySupabaseError(deleteError));
    } finally {
      setBusyId('');
    }
  }

  return (
    <section>
      <div className="page-heading">
        <div>
          <h1>القوالب</h1>
          <p>عرض القوالب المرفوعة والتحكم في إتاحتها.</p>
        </div>
        <a className="primary-button" href="/admin/occasions">رفع قالب من المناسبات</a>
      </div>

      {notice && <div className="inline-notice success-notice">{notice}</div>}
      {error && <div className="inline-notice error-notice">{error}</div>}
      {!canManage && <div className="inline-notice info-notice">صلاحيتك للعرض فقط.</div>}

      <div className="toolbar-card">
        <div className="segmented-control" aria-label="تصفية القوالب">
          <button className={shapeFilter === 'all' ? 'active' : ''} type="button" onClick={() => setShapeFilter('all')}>الكل ({templates.length})</button>
          <button className={shapeFilter === 'square' ? 'active' : ''} type="button" onClick={() => setShapeFilter('square')}>مربع</button>
          <button className={shapeFilter === 'rectangle' ? 'active' : ''} type="button" onClick={() => setShapeFilter('rectangle')}>مستطيل</button>
        </div>
      </div>

      {loading ? (
        <div className="content-card loading-card"><LoaderCircle className="spin" size={25} /> جاري تحميل القوالب...</div>
      ) : filteredTemplates.length === 0 ? (
        <div className="content-card empty-table">
          <ImageOff size={38} />
          <strong>لا توجد قوالب في هذا القسم</strong>
          <span>يمكن رفع القوالب من صفحة المناسبات.</span>
        </div>
      ) : (
        <div className="templates-gallery">
          {filteredTemplates.map((template) => {
            const occasionState = getOccasionState(template.occasion);
            return (
              <article className="template-gallery-card" key={template.id}>
                <div className={`template-preview shape-${template.shape}`}>
                  <img src={getTemplatePublicUrl(template.image_path)} alt={template.name} />
                  {!template.is_active && <span className="disabled-overlay">غير متاح</span>}
                </div>
                <div className="template-card-body">
                  <div className="template-card-title">
                    <div>
                      <h2>{template.occasion?.title_ar || 'مناسبة محذوفة'}</h2>
                      <span lang="en" dir="ltr">{template.occasion?.title_en}</span>
                    </div>
                    <span className={`shape-badge shape-${template.shape}`}>
                      {template.shape === 'square' ? 'مربع' : 'مستطيل'}
                    </span>
                  </div>
                  <dl className="template-details">
                    <div><dt>الأبعاد</dt><dd lang="en" dir="ltr">{template.image_width} × {template.image_height} px</dd></div>
                    <div><dt>المناسبة</dt><dd><span className={`status-badge compact status-${occasionState.key}`}>{occasionState.label}</span></dd></div>
                    <div><dt>إعداد النص</dt><dd>{Array.isArray(template.template_settings) ? (template.template_settings.length ? 'جاهز' : 'غير محدد') : (template.template_settings ? 'جاهز' : 'غير محدد')}</dd></div>
                    <div><dt>آخر تحديث</dt><dd>{formatDateTime(template.updated_at)}</dd></div>
                  </dl>
                  <div className="template-card-actions">
                    <Link className="primary-button compact-button" to={`/admin/templates/${template.id}/editor`}>
                      <Palette size={17} /> {canManage ? 'تعديل التصميم' : 'معاينة التصميم'}
                    </Link>
                    {canManage && (
                      <>
                        <button className="secondary-button" type="button" onClick={() => duplicateTemplate(template)} disabled={Boolean(busyId)}>
                          {busyId === template.id ? <LoaderCircle className="spin" size={17} /> : <CopyPlus size={17} />} نسخ
                        </button>
                        <button className="secondary-button" type="button" onClick={() => toggleTemplate(template)} disabled={Boolean(busyId)}>
                          {template.is_active ? <><EyeOff size={17} /> إخفاء</> : <><Eye size={17} /> تفعيل</>}
                        </button>
                        <button className="icon-button danger-icon" type="button" aria-label="حذف القالب" onClick={() => setDeleteTarget(template)} disabled={Boolean(busyId)}>
                          <Trash2 size={18} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="حذف القالب؟"
        description={`سيتم حذف القالب ${deleteTarget?.shape === 'square' ? 'المربع' : 'المستطيل'} من مناسبة «${deleteTarget?.occasion?.title_ar || ''}».`}
        confirmLabel="حذف القالب"
        busy={busyId === deleteTarget?.id}
        onConfirm={deleteTemplate}
        onClose={() => !busyId && setDeleteTarget(null)}
      />
    </section>
  );
}
