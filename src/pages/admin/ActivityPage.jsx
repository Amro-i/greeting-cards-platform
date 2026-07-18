import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  CalendarDays,
  CheckSquare2,
  ChevronLeft,
  ChevronRight,
  Download,
  Eraser,
  FilterX,
  Image,
  LoaderCircle,
  RectangleHorizontal,
  RefreshCw,
  Search,
  Square,
  Trash2,
  UsersRound,
} from 'lucide-react';
import ConfirmModal from '../../components/ConfirmModal';
import { useAuth } from '../../context/AuthContext';
import { getFriendlySupabaseError } from '../../lib/occasionUtils';
import { supabase } from '../../lib/supabase';

const PAGE_SIZE = 25;

const EMPTY_FILTERS = {
  search: '',
  occasionId: '',
  shape: '',
  dateFrom: '',
  dateTo: '',
};

function startOfTodayIso() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function startOfWeekIso() {
  const date = new Date();
  const day = date.getDay();
  const distance = day === 0 ? 6 : day - 1;
  date.setDate(date.getDate() - distance);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function startOfDateIso(value) {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function endOfDateIso(value) {
  if (!value) return '';
  const date = new Date(`${value}T23:59:59.999`);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function formatNumber(value) {
  return new Intl.NumberFormat('ar-SA').format(Number(value || 0));
}

function formatDateTime(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('ar-SA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function csvCell(value) {
  const text = String(value ?? '').replace(/"/g, '""');
  return `"${text}"`;
}

function downloadCsv(rows) {
  const header = ['الاسم العربي', 'English Name', 'المناسبة', 'نوع القالب', 'اسم القالب', 'تاريخ الإنشاء'];
  const lines = rows.map((row) => [
    row.arabic_name,
    row.english_name,
    row.occasion?.title_ar || '',
    row.shape === 'square' ? 'مربع' : 'مستطيل',
    row.template?.name || '',
    formatDateTime(row.generated_at),
  ]);
  const csv = `\ufeff${[header, ...lines].map((line) => line.map(csvCell).join(',')).join('\n')}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `greeting-card-activity-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function buildLogsQuery(filters, { count = true, applyRange = true, page = 1 } = {}) {
  let query = supabase
    .from('generation_logs')
    .select(`
      id, arabic_name, english_name, shape, generated_at,
      occasion:occasions!generation_logs_occasion_id_fkey (id, title_ar, title_en),
      template:templates!generation_logs_template_id_fkey (id, name)
    `, count ? { count: 'exact' } : undefined)
    .order('generated_at', { ascending: false });

  const search = filters.search.trim().replace(/[,%()]/g, ' ');
  if (search) query = query.or(`arabic_name.ilike.%${search}%,english_name.ilike.%${search}%`);
  if (filters.occasionId) query = query.eq('occasion_id', filters.occasionId);
  if (filters.shape) query = query.eq('shape', filters.shape);

  const fromIso = startOfDateIso(filters.dateFrom);
  const toIso = endOfDateIso(filters.dateTo);
  if (fromIso) query = query.gte('generated_at', fromIso);
  if (toIso) query = query.lte('generated_at', toIso);

  if (applyRange) {
    const from = (page - 1) * PAGE_SIZE;
    query = query.range(from, from + PAGE_SIZE - 1);
  }

  return query;
}

export default function ActivityPage() {
  const { profile } = useAuth();
  const canManage = ['super_admin', 'admin'].includes(profile?.role);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);
  const [occasions, setOccasions] = useState([]);
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [rowCount, setRowCount] = useState(0);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summary, setSummary] = useState({
    totalGenerated: 0,
    squareGenerated: 0,
    rectangleGenerated: 0,
    today: 0,
    week: 0,
    namesStored: 0,
  });
  const [occasionTotals, setOccasionTotals] = useState([]);
  const [chartDays, setChartDays] = useState([]);
  const [pageError, setPageError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmAction, setConfirmAction] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  const pageCount = Math.max(1, Math.ceil(rowCount / PAGE_SIZE));
  const allPageSelected = rows.length > 0 && rows.every((row) => selectedIds.includes(row.id));

  const loadOccasions = useCallback(async () => {
    const { data, error } = await supabase
      .from('occasions')
      .select('id, title_ar, title_en')
      .order('starts_at', { ascending: false });
    if (!error) setOccasions(data || []);
  }, []);

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    const chartStart = new Date();
    chartStart.setDate(chartStart.getDate() - 13);
    chartStart.setHours(0, 0, 0, 0);

    const [totalsResult, todayResult, weekResult, namesResult, chartResult] = await Promise.all([
      supabase.from('statistics_totals').select(`
        total_generated, square_generated, rectangle_generated,
        occasion:occasions!statistics_totals_occasion_id_fkey (id, title_ar, title_en)
      `),
      supabase.from('generation_logs').select('*', { count: 'exact', head: true }).gte('generated_at', startOfTodayIso()),
      supabase.from('generation_logs').select('*', { count: 'exact', head: true }).gte('generated_at', startOfWeekIso()),
      supabase.from('generation_logs').select('*', { count: 'exact', head: true }),
      supabase.from('generation_logs').select('generated_at').gte('generated_at', chartStart.toISOString()).order('generated_at'),
    ]);

    const firstError = [totalsResult, todayResult, weekResult, namesResult, chartResult].find((result) => result.error)?.error;
    if (firstError) {
      setPageError(getFriendlySupabaseError(firstError));
      setSummaryLoading(false);
      return;
    }

    const totals = totalsResult.data || [];
    const aggregated = totals.reduce((accumulator, item) => ({
      totalGenerated: accumulator.totalGenerated + Number(item.total_generated || 0),
      squareGenerated: accumulator.squareGenerated + Number(item.square_generated || 0),
      rectangleGenerated: accumulator.rectangleGenerated + Number(item.rectangle_generated || 0),
    }), { totalGenerated: 0, squareGenerated: 0, rectangleGenerated: 0 });

    setSummary({
      ...aggregated,
      today: todayResult.count || 0,
      week: weekResult.count || 0,
      namesStored: namesResult.count || 0,
    });

    setOccasionTotals(
      totals
        .map((item) => ({
          titleAr: item.occasion?.title_ar || 'مناسبة محذوفة',
          titleEn: item.occasion?.title_en || '',
          total: Number(item.total_generated || 0),
          square: Number(item.square_generated || 0),
          rectangle: Number(item.rectangle_generated || 0),
        }))
        .sort((a, b) => b.total - a.total),
    );

    const dayMap = new Map();
    for (let index = 0; index < 14; index += 1) {
      const date = new Date(chartStart);
      date.setDate(chartStart.getDate() + index);
      const key = date.toISOString().slice(0, 10);
      dayMap.set(key, {
        key,
        label: new Intl.DateTimeFormat('ar-SA', { day: 'numeric', month: 'short' }).format(date),
        value: 0,
      });
    }
    (chartResult.data || []).forEach((item) => {
      const key = new Date(item.generated_at).toISOString().slice(0, 10);
      if (dayMap.has(key)) dayMap.get(key).value += 1;
    });
    setChartDays([...dayMap.values()]);
    setSummaryLoading(false);
  }, []);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setPageError('');
    const { data, error, count } = await buildLogsQuery(appliedFilters, { page });
    if (error) {
      setPageError(getFriendlySupabaseError(error));
      setRows([]);
      setRowCount(0);
    } else {
      setRows(data || []);
      setRowCount(count || 0);
    }
    setSelectedIds([]);
    setLoading(false);
  }, [appliedFilters, page]);

  useEffect(() => {
    void Promise.all([loadOccasions(), loadSummary()]);
  }, [loadOccasions, loadSummary]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(''), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const chartMax = useMemo(() => Math.max(1, ...chartDays.map((item) => item.value)), [chartDays]);

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

  function togglePageSelection() {
    if (allPageSelected) {
      setSelectedIds((current) => current.filter((id) => !rows.some((row) => row.id === id)));
    } else {
      setSelectedIds((current) => [...new Set([...current, ...rows.map((row) => row.id)])]);
    }
  }

  function toggleRow(id) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function performConfirmedAction() {
    if (!canManage || !confirmAction || actionBusy) return;
    setActionBusy(true);
    setPageError('');

    let result;
    if (confirmAction === 'selected') {
      result = await supabase.from('generation_logs').delete().in('id', selectedIds);
    } else if (confirmAction === 'clear') {
      result = await supabase.rpc('clear_generation_logs');
    } else {
      result = await supabase.rpc('reset_generation_activity');
    }

    if (result.error) {
      setPageError(getFriendlySupabaseError(result.error));
    } else {
      if (confirmAction === 'selected') setNotice(`تم حذف ${selectedIds.length} سجل مع الاحتفاظ بالإحصائيات الإجمالية.`);
      if (confirmAction === 'clear') setNotice('تم مسح قائمة الأسماء مع الاحتفاظ بالإحصائيات الإجمالية.');
      if (confirmAction === 'reset') setNotice('تم مسح السجل وإعادة ضبط جميع الإحصائيات إلى الصفر.');
      setPage(1);
      await Promise.all([loadRows(), loadSummary()]);
    }

    setConfirmAction(null);
    setActionBusy(false);
  }

  async function handleExport() {
    if (exporting) return;
    setExporting(true);
    setPageError('');
    const { data, error } = await buildLogsQuery(appliedFilters, { count: false, applyRange: false }).limit(10000);
    if (error) setPageError(getFriendlySupabaseError(error));
    else if (!(data || []).length) setNotice('لا توجد سجلات مطابقة لتصديرها.');
    else downloadCsv(data || []);
    setExporting(false);
  }

  function confirmContent() {
    if (confirmAction === 'selected') return {
      title: 'حذف السجلات المحددة؟',
      description: `سيتم حذف ${selectedIds.length} سجل من قائمة الأسماء. لن تتغير الإحصائيات الإجمالية.`,
      confirmLabel: 'حذف المحدد',
    };
    if (confirmAction === 'clear') return {
      title: 'مسح قائمة الأسماء؟',
      description: 'سيتم حذف جميع الأسماء والتواريخ من السجل، مع بقاء العدد الإجمالي للبطاقات محفوظًا.',
      confirmLabel: 'مسح القائمة',
    };
    return {
      title: 'إعادة ضبط جميع الإحصائيات؟',
      description: 'سيتم حذف قائمة الأسماء وإرجاع أعداد البطاقات المربعة والمستطيلة والإجمالي إلى الصفر. لا يمكن التراجع.',
      confirmLabel: 'إعادة الضبط',
    };
  }

  const confirmation = confirmContent();

  return (
    <section className="activity-page">
      <div className="page-heading activity-heading">
        <div>
          <h1>السجل والإحصائيات</h1>
          <p>متابعة البطاقات المنشأة والأسماء المستخدمة وأداء كل مناسبة.</p>
        </div>
        <div className="heading-actions">
          <button className="secondary-button" type="button" onClick={() => void Promise.all([loadRows(), loadSummary()])} disabled={loading || summaryLoading}>
            <RefreshCw size={17} className={loading || summaryLoading ? 'spin' : ''} /> تحديث
          </button>
          <button className="secondary-button" type="button" onClick={handleExport} disabled={exporting || rowCount === 0}>
            {exporting ? <LoaderCircle className="spin" size={17} /> : <Download size={17} />} تصدير CSV
          </button>
        </div>
      </div>

      {notice && <div className="inline-notice success-notice">{notice}</div>}
      {pageError && <div className="inline-notice error-notice">{pageError}</div>}

      <div className="activity-stats-grid">
        <article className="activity-stat-card">
          <span><Image size={21} /></span>
          <div><strong>{summaryLoading ? '—' : formatNumber(summary.totalGenerated)}</strong><small>إجمالي البطاقات</small></div>
        </article>
        <article className="activity-stat-card">
          <span><CalendarDays size={21} /></span>
          <div><strong>{summaryLoading ? '—' : formatNumber(summary.today)}</strong><small>بطاقات اليوم</small></div>
        </article>
        <article className="activity-stat-card">
          <span><BarChart3 size={21} /></span>
          <div><strong>{summaryLoading ? '—' : formatNumber(summary.week)}</strong><small>هذا الأسبوع</small></div>
        </article>
        <article className="activity-stat-card">
          <span><Square size={21} /></span>
          <div><strong>{summaryLoading ? '—' : formatNumber(summary.squareGenerated)}</strong><small>بطاقات مربعة</small></div>
        </article>
        <article className="activity-stat-card">
          <span><RectangleHorizontal size={21} /></span>
          <div><strong>{summaryLoading ? '—' : formatNumber(summary.rectangleGenerated)}</strong><small>بطاقات مستطيلة</small></div>
        </article>
        <article className="activity-stat-card">
          <span><UsersRound size={21} /></span>
          <div><strong>{summaryLoading ? '—' : formatNumber(summary.namesStored)}</strong><small>أسماء محفوظة حاليًا</small></div>
        </article>
      </div>

      <div className="analytics-grid">
        <article className="content-card activity-chart-card">
          <div className="card-section-heading">
            <div><BarChart3 size={20} /><span><strong>النشاط خلال آخر 14 يومًا</strong><small>عدد البطاقات المسجلة يوميًا</small></span></div>
          </div>
          {summaryLoading ? (
            <div className="loading-card"><LoaderCircle className="spin" size={20} /> جاري تحميل الرسم...</div>
          ) : (
            <div className="activity-chart" aria-label="رسم نشاط البطاقات خلال 14 يومًا">
              {chartDays.map((item) => (
                <div className="activity-chart-column" key={item.key} title={`${item.label}: ${item.value}`}>
                  <span className="activity-chart-value">{item.value || ''}</span>
                  <div className="activity-chart-track"><i style={{ height: `${Math.max(item.value ? 8 : 2, (item.value / chartMax) * 100)}%` }} /></div>
                  <small>{item.label}</small>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="content-card occasion-ranking-card">
          <div className="card-section-heading">
            <div><CheckSquare2 size={20} /><span><strong>الإجمالي حسب المناسبة</strong><small>الأعداد محفوظة حتى بعد مسح الأسماء</small></span></div>
          </div>
          {summaryLoading ? (
            <div className="loading-card"><LoaderCircle className="spin" size={20} /> جاري التحميل...</div>
          ) : occasionTotals.length ? (
            <div className="occasion-ranking-list">
              {occasionTotals.slice(0, 8).map((item, index) => (
                <div className="occasion-ranking-row" key={`${item.titleAr}-${index}`}>
                  <span className="ranking-number">{index + 1}</span>
                  <div><strong>{item.titleAr}</strong><small lang="en">{item.titleEn}</small></div>
                  <div className="ranking-total"><strong>{formatNumber(item.total)}</strong><small>{formatNumber(item.square)} مربع · {formatNumber(item.rectangle)} مستطيل</small></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-analytics">لا توجد إحصائيات حتى الآن.</div>
          )}
        </article>
      </div>

      <article className="content-card activity-log-card">
        <div className="activity-log-header">
          <div>
            <h2>قائمة الأشخاص</h2>
            <p>السجلات الحالية: {formatNumber(rowCount)}</p>
          </div>
          {canManage && (
            <div className="activity-danger-actions">
              <button className="secondary-button danger-text" type="button" onClick={() => setConfirmAction('clear')} disabled={summary.namesStored === 0}>
                <Eraser size={17} /> مسح قائمة الأسماء
              </button>
              <button className="danger-button" type="button" onClick={() => setConfirmAction('reset')} disabled={summary.totalGenerated === 0 && summary.namesStored === 0}>
                <Trash2 size={17} /> إعادة ضبط الإحصائيات
              </button>
            </div>
          )}
        </div>

        <form className="activity-filters" onSubmit={submitFilters}>
          <label className="activity-search-field">
            <Search size={18} />
            <input value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder="ابحث بالاسم العربي أو الإنجليزي" />
          </label>
          <select value={filters.occasionId} onChange={(event) => setFilters((current) => ({ ...current, occasionId: event.target.value }))} aria-label="المناسبة">
            <option value="">كل المناسبات</option>
            {occasions.map((occasion) => <option value={occasion.id} key={occasion.id}>{occasion.title_ar}</option>)}
          </select>
          <select value={filters.shape} onChange={(event) => setFilters((current) => ({ ...current, shape: event.target.value }))} aria-label="نوع القالب">
            <option value="">كل الأنواع</option>
            <option value="square">مربع</option>
            <option value="rectangle">مستطيل</option>
          </select>
          <label className="activity-date-field"><span>من</span><input type="date" value={filters.dateFrom} onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))} /></label>
          <label className="activity-date-field"><span>إلى</span><input type="date" value={filters.dateTo} onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value }))} /></label>
          <button className="primary-button" type="submit"><Search size={17} /> بحث</button>
          <button className="secondary-button" type="button" onClick={clearFilters}><FilterX size={17} /> مسح الفلاتر</button>
        </form>

        {canManage && selectedIds.length > 0 && (
          <div className="activity-selection-bar">
            <span>تم تحديد {formatNumber(selectedIds.length)} سجل</span>
            <button className="danger-button" type="button" onClick={() => setConfirmAction('selected')}><Trash2 size={16} /> حذف المحدد</button>
          </div>
        )}

        <div className="activity-table-wrap">
          {loading ? (
            <div className="loading-card"><LoaderCircle className="spin" size={21} /> جاري تحميل السجل...</div>
          ) : rows.length ? (
            <table className="activity-table">
              <thead>
                <tr>
                  {canManage && <th className="selection-cell"><input type="checkbox" checked={allPageSelected} onChange={togglePageSelection} aria-label="تحديد الصفحة" /></th>}
                  <th>الاسم العربي</th>
                  <th>English Name</th>
                  <th>المناسبة</th>
                  <th>القالب</th>
                  <th>تاريخ الإنشاء</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className={selectedIds.includes(row.id) ? 'selected-row' : ''}>
                    {canManage && <td className="selection-cell"><input type="checkbox" checked={selectedIds.includes(row.id)} onChange={() => toggleRow(row.id)} aria-label={`تحديد ${row.arabic_name}`} /></td>}
                    <td><strong>{row.arabic_name}</strong></td>
                    <td lang="en">{row.english_name}</td>
                    <td><strong>{row.occasion?.title_ar || '—'}</strong><small lang="en">{row.occasion?.title_en || ''}</small></td>
                    <td><span className={`shape-badge ${row.shape === 'square' ? 'shape-square' : 'shape-rectangle'}`}>{row.shape === 'square' ? <Square size={13} /> : <RectangleHorizontal size={14} />}{row.shape === 'square' ? 'مربع' : 'مستطيل'}</span><small>{row.template?.name || ''}</small></td>
                    <td>{formatDateTime(row.generated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="activity-empty-state"><UsersRound size={32} /><strong>لا توجد سجلات مطابقة</strong><span>جرّب تغيير البحث أو الفلاتر.</span></div>
          )}
        </div>

        <div className="activity-pagination">
          <span>صفحة {formatNumber(page)} من {formatNumber(pageCount)} · {formatNumber(rowCount)} سجل</span>
          <div>
            <button className="icon-button" type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}><ChevronRight size={18} /></button>
            <button className="icon-button" type="button" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page >= pageCount}><ChevronLeft size={18} /></button>
          </div>
        </div>
      </article>

      <ConfirmModal
        open={Boolean(confirmAction)}
        title={confirmation.title}
        description={confirmation.description}
        confirmLabel={confirmation.confirmLabel}
        busy={actionBusy}
        onConfirm={performConfirmedAction}
        onClose={() => !actionBusy && setConfirmAction(null)}
      />
    </section>
  );
}
