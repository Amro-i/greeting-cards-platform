import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  CalendarDays,
  DatabaseBackup,
  Download,
  FileClock,
  FilterX,
  HardDrive,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
} from 'lucide-react';
import ConfirmModal from '../../components/ConfirmModal';
import { useAuth } from '../../context/AuthContext';
import { formatDateTime, getFriendlySupabaseError } from '../../lib/occasionUtils';
import { supabase } from '../../lib/supabase';

const PAGE_SIZE = 20;
const EMPTY_FILTERS = { search: '', action: '', entityType: '', dateFrom: '', dateTo: '' };

const ACTION_LABELS = {
  create: 'إنشاء',
  update: 'تعديل',
  delete: 'حذف',
  archive: 'أرشفة',
  restore: 'استعادة',
  export: 'تصدير',
  storage_cleanup: 'تنظيف التخزين',
};

const ENTITY_LABELS = {
  occasions: 'مناسبة',
  templates: 'قالب',
  fonts: 'خط',
  profiles: 'مستخدم',
  app_settings: 'إعدادات المنصة',
  storage: 'ملفات التخزين',
  admin_backup: 'نسخة إدارية',
};

const BUCKETS = [
  { id: 'card-templates', label: 'قوالب البطاقات' },
  { id: 'card-fonts', label: 'الخطوط المرفوعة' },
  { id: 'branding-assets', label: 'ملفات الهوية' },
];

function csvCell(value) {
  const text = value == null ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadFile(content, fileName, mimeType) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeDateName() {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

async function listBucketFiles(bucketId, prefix = '', depth = 0) {
  if (depth > 4) return [];
  const { data, error } = await supabase.storage.from(bucketId).list(prefix, {
    limit: 1000,
    sortBy: { column: 'name', order: 'asc' },
  });
  if (error) throw error;

  const paths = [];
  for (const item of data || []) {
    const path = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.id || item.metadata) {
      paths.push(path);
    } else {
      paths.push(...await listBucketFiles(bucketId, path, depth + 1));
    }
  }
  return paths;
}

function buildAuditQuery(filters, { page = 1, limit = PAGE_SIZE } = {}) {
  let query = supabase
    .from('audit_logs')
    .select(`
      id, actor_id, action, entity_type, entity_id, entity_label, details, created_at,
      actor:profiles!audit_logs_actor_id_fkey (full_name, role)
    `, { count: 'exact' })
    .order('created_at', { ascending: false });

  const search = filters.search.trim();
  if (search) query = query.or(`entity_label.ilike.%${search}%,entity_id.ilike.%${search}%`);
  if (filters.action) query = query.eq('action', filters.action);
  if (filters.entityType) query = query.eq('entity_type', filters.entityType);
  if (filters.dateFrom) query = query.gte('created_at', new Date(`${filters.dateFrom}T00:00:00`).toISOString());
  if (filters.dateTo) {
    const end = new Date(`${filters.dateTo}T23:59:59.999`);
    query = query.lte('created_at', end.toISOString());
  }

  const from = (page - 1) * limit;
  return query.range(from, from + limit - 1);
}

export default function AdvancedToolsPage() {
  const { profile } = useAuth();
  const canManage = ['super_admin', 'admin'].includes(profile?.role);
  const canCleanStorage = profile?.role === 'super_admin';
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);
  const [rows, setRows] = useState([]);
  const [rowCount, setRowCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [notice, setNotice] = useState('');
  const [exporting, setExporting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [storageReport, setStorageReport] = useState(null);
  const [confirmCleanup, setConfirmCleanup] = useState(false);

  const totalPages = Math.max(1, Math.ceil(rowCount / PAGE_SIZE));

  const loadAudit = useCallback(async () => {
    setLoading(true);
    setPageError('');
    const { data, error, count } = await buildAuditQuery(appliedFilters, { page });
    if (error) {
      setRows([]);
      setRowCount(0);
      setPageError(getFriendlySupabaseError(error));
    } else {
      setRows(data || []);
      setRowCount(count || 0);
    }
    setLoading(false);
  }, [appliedFilters, page]);

  useEffect(() => { void loadAudit(); }, [loadAudit]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(''), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const actionCounts = useMemo(() => rows.reduce((accumulator, row) => {
    accumulator[row.action] = (accumulator[row.action] || 0) + 1;
    return accumulator;
  }, {}), [rows]);

  function submitFilters(event) {
    event.preventDefault();
    setPage(1);
    setAppliedFilters(filters);
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setPage(1);
  }

  async function exportAuditCsv() {
    if (exporting) return;
    setExporting(true);
    setPageError('');
    try {
      const { data, error } = await buildAuditQuery(appliedFilters, { page: 1, limit: 5000 });
      if (error) throw error;
      const headers = ['ID', 'Action', 'Entity Type', 'Entity Label', 'Entity ID', 'Admin', 'Role', 'Date'];
      const lines = [headers.map(csvCell).join(',')];
      (data || []).forEach((row) => {
        lines.push([
          row.id,
          ACTION_LABELS[row.action] || row.action,
          ENTITY_LABELS[row.entity_type] || row.entity_type,
          row.entity_label,
          row.entity_id,
          row.actor?.full_name || 'System',
          row.actor?.role || '',
          row.created_at,
        ].map(csvCell).join(','));
      });
      downloadFile(`\uFEFF${lines.join('\n')}`, `audit-log-${safeDateName()}.csv`, 'text/csv;charset=utf-8');
      if (canManage) {
        await supabase.rpc('record_admin_audit', {
          p_action: 'export',
          p_entity_type: 'audit_logs',
          p_entity_id: null,
          p_entity_label: 'تصدير سجل تعديلات الإدارة',
          p_details: { rows: data?.length || 0 },
        });
      }
      setNotice('تم تصدير سجل التعديلات بصيغة CSV.');
    } catch (error) {
      setPageError(getFriendlySupabaseError(error));
    } finally {
      setExporting(false);
    }
  }

  async function exportAdminBackup() {
    if (!canManage || exporting) return;
    setExporting(true);
    setPageError('');
    try {
      const [occasions, templates, settings, fonts, totals, appSettings] = await Promise.all([
        supabase.from('occasions').select('*').order('created_at'),
        supabase.from('templates').select('*').order('created_at'),
        supabase.from('template_settings').select('*').order('updated_at'),
        supabase.from('fonts').select('*').order('created_at'),
        supabase.from('statistics_totals').select('*'),
        supabase.from('app_settings').select('*').single(),
      ]);
      const failed = [occasions, templates, settings, fonts, totals, appSettings].find((result) => result.error);
      if (failed?.error) throw failed.error;

      const payload = {
        format: 'greeting-cards-admin-export',
        version: 1,
        exported_at: new Date().toISOString(),
        note: 'This administrative export does not include Auth passwords or the binary contents of Storage files.',
        occasions: occasions.data || [],
        templates: templates.data || [],
        template_settings: settings.data || [],
        fonts: fonts.data || [],
        statistics_totals: totals.data || [],
        app_settings: appSettings.data || null,
      };
      downloadFile(JSON.stringify(payload, null, 2), `greeting-cards-admin-export-${safeDateName()}.json`, 'application/json');
      await supabase.rpc('record_admin_audit', {
        p_action: 'export',
        p_entity_type: 'admin_backup',
        p_entity_id: null,
        p_entity_label: 'نسخة إدارية من بيانات المنصة',
        p_details: {
          occasions: payload.occasions.length,
          templates: payload.templates.length,
          fonts: payload.fonts.length,
        },
      });
      setNotice('تم تنزيل النسخة الإدارية بصيغة JSON.');
      await loadAudit();
    } catch (error) {
      setPageError(getFriendlySupabaseError(error));
    } finally {
      setExporting(false);
    }
  }

  async function scanStorage() {
    if (!canCleanStorage || scanning) return;
    setScanning(true);
    setStorageReport(null);
    setPageError('');
    try {
      const [templatesResult, fontsResult, settingsResult, ...bucketPaths] = await Promise.all([
        supabase.from('templates').select('image_path'),
        supabase.from('fonts').select('storage_path').not('storage_path', 'is', null),
        supabase.from('app_settings').select('logo_path, cover_path').single(),
        ...BUCKETS.map((bucket) => listBucketFiles(bucket.id)),
      ]);
      const failed = [templatesResult, fontsResult, settingsResult].find((result) => result.error);
      if (failed?.error) throw failed.error;

      const references = {
        'card-templates': new Set((templatesResult.data || []).map((item) => item.image_path).filter(Boolean)),
        'card-fonts': new Set((fontsResult.data || []).map((item) => item.storage_path).filter(Boolean)),
        'branding-assets': new Set([
          settingsResult.data?.logo_path,
          settingsResult.data?.cover_path,
        ].filter(Boolean)),
      };

      const report = BUCKETS.map((bucket, index) => {
        const files = bucketPaths[index] || [];
        const orphanFiles = files.filter((path) => !references[bucket.id].has(path));
        return {
          ...bucket,
          totalFiles: files.length,
          referencedFiles: files.length - orphanFiles.length,
          orphanFiles,
        };
      });
      setStorageReport(report);
      setNotice(report.some((item) => item.orphanFiles.length)
        ? 'اكتمل الفحص. راجع الملفات غير المستخدمة قبل الحذف.'
        : 'اكتمل الفحص، ولا توجد ملفات غير مستخدمة.');
    } catch (error) {
      setPageError(getFriendlySupabaseError(error));
    } finally {
      setScanning(false);
    }
  }

  async function cleanupStorage() {
    if (!canCleanStorage || !storageReport || cleaning) return;
    setCleaning(true);
    setPageError('');
    try {
      let removedCount = 0;
      for (const bucket of storageReport) {
        if (!bucket.orphanFiles.length) continue;
        const chunks = [];
        for (let index = 0; index < bucket.orphanFiles.length; index += 100) {
          chunks.push(bucket.orphanFiles.slice(index, index + 100));
        }
        for (const chunk of chunks) {
          const { error } = await supabase.storage.from(bucket.id).remove(chunk);
          if (error) throw error;
          removedCount += chunk.length;
        }
      }
      await supabase.rpc('record_admin_audit', {
        p_action: 'storage_cleanup',
        p_entity_type: 'storage',
        p_entity_id: null,
        p_entity_label: 'تنظيف الملفات غير المستخدمة',
        p_details: { removed_files: removedCount },
      });
      setConfirmCleanup(false);
      setStorageReport(null);
      setNotice(`تم حذف ${removedCount} ملف غير مستخدم.`);
      await loadAudit();
    } catch (error) {
      setPageError(getFriendlySupabaseError(error));
    } finally {
      setCleaning(false);
    }
  }

  const orphanCount = storageReport?.reduce((total, bucket) => total + bucket.orphanFiles.length, 0) || 0;

  return (
    <section className="advanced-tools-page">
      <div className="page-heading">
        <div>
          <h1>أدوات الإدارة</h1>
          <p>سجل التعديلات، تصدير البيانات، ومراجعة الملفات غير المستخدمة.</p>
        </div>
        <div className="heading-actions">
          <button className="secondary-button" type="button" onClick={() => void loadAudit()} disabled={loading}>
            <RefreshCw size={17} className={loading ? 'spin' : ''} /> تحديث
          </button>
          <button className="secondary-button" type="button" onClick={exportAuditCsv} disabled={exporting || rowCount === 0}>
            <Download size={17} /> سجل CSV
          </button>
          {canManage && (
            <button className="primary-button" type="button" onClick={exportAdminBackup} disabled={exporting}>
              {exporting ? <LoaderCircle className="spin" size={17} /> : <DatabaseBackup size={17} />} نسخة إدارية
            </button>
          )}
        </div>
      </div>

      {notice && <div className="inline-notice success-notice">{notice}</div>}
      {pageError && <div className="inline-notice error-notice">{pageError}</div>}

      <div className="advanced-summary-grid">
        <article><FileClock size={21} /><div><strong>{rowCount}</strong><span>إجراء مسجل</span></div></article>
        <article><Archive size={21} /><div><strong>{actionCounts.archive || 0}</strong><span>أرشفة في الصفحة</span></div></article>
        <article><UserRound size={21} /><div><strong>{rows.filter((row) => row.actor_id).length}</strong><span>إجراءات بأسماء مستخدمين</span></div></article>
        <article><ShieldCheck size={21} /><div><strong>{profile?.role === 'super_admin' ? 'كاملة' : 'محدودة'}</strong><span>صلاحيات الأدوات</span></div></article>
      </div>

      <article className="content-card advanced-audit-card">
        <div className="card-section-heading">
          <div><FileClock size={21} /><span><strong>سجل تعديلات الإدارة</strong><small>يسجل إنشاء وتعديل وحذف وأرشفة العناصر الأساسية.</small></span></div>
        </div>

        <form className="advanced-filters" onSubmit={submitFilters}>
          <label className="activity-search-field">
            <Search size={18} />
            <input value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder="ابحث باسم العنصر أو رقمه" />
          </label>
          <select value={filters.action} onChange={(event) => setFilters((current) => ({ ...current, action: event.target.value }))} aria-label="نوع الإجراء">
            <option value="">كل الإجراءات</option>
            {Object.entries(ACTION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select value={filters.entityType} onChange={(event) => setFilters((current) => ({ ...current, entityType: event.target.value }))} aria-label="نوع العنصر">
            <option value="">كل العناصر</option>
            {Object.entries(ENTITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <label className="activity-date-field"><span>من</span><input type="date" value={filters.dateFrom} onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))} /></label>
          <label className="activity-date-field"><span>إلى</span><input type="date" value={filters.dateTo} onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value }))} /></label>
          <button className="primary-button" type="submit"><Search size={17} /> بحث</button>
          <button className="secondary-button" type="button" onClick={clearFilters}><FilterX size={17} /> مسح</button>
        </form>

        <div className="advanced-audit-list">
          {loading ? (
            <div className="loading-card"><LoaderCircle className="spin" size={21} /> جاري تحميل السجل...</div>
          ) : rows.length ? rows.map((row) => (
            <article className="audit-row" key={row.id}>
              <div className={`audit-action audit-${row.action}`}>{ACTION_LABELS[row.action] || row.action}</div>
              <div className="audit-main">
                <strong>{row.entity_label || ENTITY_LABELS[row.entity_type] || row.entity_type}</strong>
                <span>{ENTITY_LABELS[row.entity_type] || row.entity_type}{row.entity_id ? ` · ${row.entity_id}` : ''}</span>
              </div>
              <div className="audit-actor">
                <strong>{row.actor?.full_name || 'النظام'}</strong>
                <span>{row.actor?.role || 'System'}</span>
              </div>
              <time>{formatDateTime(row.created_at)}</time>
            </article>
          )) : (
            <div className="activity-empty-state"><FileClock size={31} /><strong>لا توجد إجراءات مطابقة</strong><span>جرّب تغيير الفلاتر.</span></div>
          )}
        </div>

        {rowCount > PAGE_SIZE && (
          <div className="table-pagination">
            <button className="secondary-button" type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>السابق</button>
            <span>صفحة {page} من {totalPages}</span>
            <button className="secondary-button" type="button" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>التالي</button>
          </div>
        )}
      </article>

      <article className="content-card storage-maintenance-card">
        <div className="card-section-heading">
          <div><HardDrive size={21} /><span><strong>تنظيف ملفات التخزين</strong><small>يعثر على الصور والخطوط القديمة التي لم تعد مرتبطة بأي سجل.</small></span></div>
          {canCleanStorage && (
            <button className="secondary-button" type="button" onClick={scanStorage} disabled={scanning || cleaning}>
              {scanning ? <LoaderCircle className="spin" size={17} /> : <Search size={17} />} فحص التخزين
            </button>
          )}
        </div>

        {!canCleanStorage ? (
          <div className="inline-notice info-notice">تنظيف التخزين متاح لـ Super Admin فقط لتجنب حذف الملفات بالخطأ.</div>
        ) : !storageReport ? (
          <div className="storage-empty"><HardDrive size={34} /><strong>لم يتم فحص التخزين بعد</strong><span>لن يتم حذف أي ملف قبل عرض تقرير المراجعة والتأكيد.</span></div>
        ) : (
          <>
            <div className="storage-report-grid">
              {storageReport.map((bucket) => (
                <article key={bucket.id}>
                  <strong>{bucket.label}</strong>
                  <span>{bucket.totalFiles} ملف إجمالي</span>
                  <span>{bucket.referencedFiles} مستخدم</span>
                  <b className={bucket.orphanFiles.length ? 'storage-warning' : ''}>{bucket.orphanFiles.length} غير مستخدم</b>
                </article>
              ))}
            </div>
            {orphanCount > 0 ? (
              <div className="storage-orphan-list">
                {storageReport.flatMap((bucket) => bucket.orphanFiles.map((path) => (
                  <div key={`${bucket.id}-${path}`}><span>{bucket.label}</span><code dir="ltr">{path}</code></div>
                )))}
              </div>
            ) : <div className="inline-notice success-notice">لا توجد ملفات غير مستخدمة.</div>}
            <div className="storage-actions">
              <button className="secondary-button" type="button" onClick={() => setStorageReport(null)}>إغلاق التقرير</button>
              <button className="danger-button" type="button" onClick={() => setConfirmCleanup(true)} disabled={orphanCount === 0 || cleaning}>
                <Trash2 size={17} /> حذف {orphanCount} ملف غير مستخدم
              </button>
            </div>
          </>
        )}
      </article>

      <ConfirmModal
        open={confirmCleanup}
        title="حذف الملفات غير المستخدمة؟"
        description={`سيتم حذف ${orphanCount} ملف من Supabase Storage. تم تحديدها لأنها غير مرتبطة بأي قالب أو خط أو ملف هوية حالي.`}
        confirmLabel="حذف الملفات"
        busy={cleaning}
        onConfirm={cleanupStorage}
        onClose={() => !cleaning && setConfirmCleanup(false)}
      />
    </section>
  );
}
