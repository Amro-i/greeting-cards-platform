import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  DatabaseBackup,
  Download,
  FileCheck2,
  Globe2,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  Rocket,
  Server,
  Settings2,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getFriendlySupabaseError } from '../../lib/occasionUtils';
import { supabase } from '../../lib/supabase';

const RELEASE_VERSION = '1.0.0';
const MANUAL_STORAGE_KEY = 'greeting-cards-final-launch-checklist-v1';

const MANUAL_ITEMS = [
  { id: 'public-link', label: 'اختبرت الرابط العام من نافذة خاصة دون تسجيل دخول.' },
  { id: 'admin-login', label: 'اختبرت تسجيل دخول Super Admin وتسجيل الخروج.' },
  { id: 'sample-card', label: 'أنشأت بطاقة تجريبية مربعة أو مستطيلة وحمّلت JPG.' },
  { id: 'mobile-test', label: 'اختبرت الصفحة العامة من الجوال.' },
  { id: 'render-live', label: 'تأكدت أن آخر نشر في Render حالته Live.' },
  { id: 'backup-created', label: 'حفظت نسخة احتياطية حديثة قبل الإطلاق.' },
];

function downloadFile(content, fileName, mimeType) {
  const blob = new Blob([content], { type: mimeType });
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

function readManualState() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(MANUAL_STORAGE_KEY) || '{}');
    return Object.fromEntries(MANUAL_ITEMS.map((item) => [item.id, Boolean(saved[item.id])]));
  } catch {
    return Object.fromEntries(MANUAL_ITEMS.map((item) => [item.id, false]));
  }
}

function CheckRow({ passed, title, description, warning = false }) {
  const Icon = passed ? CheckCircle2 : warning ? AlertTriangle : XCircle;
  return (
    <article className={`launch-check-row ${passed ? 'passed' : warning ? 'warning' : 'failed'}`}>
      <Icon size={22} />
      <div>
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
    </article>
  );
}

export default function LaunchReadinessPage() {
  const { profile } = useAuth();
  const [summary, setSummary] = useState(null);
  const [manualState, setManualState] = useState(readManualState);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadReadiness = useCallback(async () => {
    setLoading(true);
    setError('');
    const { data, error: readinessError } = await supabase.rpc('get_launch_readiness');
    if (readinessError) {
      setSummary(null);
      setError(getFriendlySupabaseError(readinessError));
    } else {
      setSummary(data || null);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void loadReadiness(); }, [loadReadiness]);

  useEffect(() => {
    window.localStorage.setItem(MANUAL_STORAGE_KEY, JSON.stringify(manualState));
  }, [manualState]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(''), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const checks = useMemo(() => {
    if (!summary) return [];
    return [
      {
        passed: Number(summary.active_super_admins) >= 1,
        title: 'حساب Super Admin نشط',
        description: `${summary.active_super_admins || 0} حساب نشط بصلاحية Super Admin.`,
      },
      {
        passed: Number(summary.active_staff) >= 1,
        title: 'حسابات الإدارة جاهزة',
        description: `${summary.active_staff || 0} مستخدم إدارة نشط.`,
      },
      {
        passed: Number(summary.active_arabic_fonts) >= 1 && Number(summary.active_english_fonts) >= 1,
        title: 'الخطوط الأساسية متاحة',
        description: `${summary.active_arabic_fonts || 0} خط عربي و${summary.active_english_fonts || 0} خط إنجليزي نشط.`,
      },
      {
        passed: Number(summary.active_templates_without_settings) === 0,
        title: 'إعدادات القوالب مكتملة',
        description: Number(summary.active_templates_without_settings) === 0
          ? 'لا يوجد قالب نشط بدون إعدادات للنصوص.'
          : `${summary.active_templates_without_settings} قالب نشط يحتاج إعدادات للنصوص.`,
      },
      {
        passed: Number(summary.active_occasions_without_templates) === 0,
        title: 'المناسبات النشطة تحتوي على قوالب',
        description: Number(summary.active_occasions_without_templates) === 0
          ? 'كل مناسبة نشطة لديها قالب متاح.'
          : `${summary.active_occasions_without_templates} مناسبة نشطة بدون قالب.`,
      },
      {
        passed: Boolean(summary.app_settings_complete),
        title: 'إعدادات الهوية صحيحة',
        description: summary.app_settings_complete
          ? 'اسم المنصة والألوان الأساسية محفوظة بصيغة صحيحة.'
          : 'راجع اسم المنصة والألوان في صفحة الإعدادات.',
      },
      {
        passed: Boolean(summary.public_rate_limit_enabled),
        title: 'حماية الاستخدام العام مفعّلة',
        description: 'إنشاء السجلات محمي من التكرار ومحدد بـ20 محاولة خلال 10 دقائق لكل متصفح.',
      },
    ];
  }, [summary]);

  const technicalReady = checks.length > 0 && checks.every((check) => check.passed);
  const completedManual = Object.values(manualState).filter(Boolean).length;
  const manualReady = completedManual === MANUAL_ITEMS.length;
  const launchReady = technicalReady && manualReady;

  function toggleManual(id) {
    setManualState((current) => ({ ...current, [id]: !current[id] }));
  }

  function downloadChecklist() {
    const technicalLines = checks.map((check) => `${check.passed ? '[✓]' : '[ ]'} ${check.title} — ${check.description}`);
    const manualLines = MANUAL_ITEMS.map((item) => `${manualState[item.id] ? '[✓]' : '[ ]'} ${item.label}`);
    const content = [
      'منصة بطاقات تهنئة — قائمة الإطلاق النهائية',
      `الإصدار: ${RELEASE_VERSION}`,
      `تاريخ التصدير: ${new Date().toLocaleString('en-US-u-nu-latn-ca-gregory')}`,
      '',
      'الفحوص التقنية:',
      ...technicalLines,
      '',
      'الفحوص اليدوية:',
      ...manualLines,
      '',
      `الحالة النهائية: ${launchReady ? 'جاهزة للإطلاق' : 'تحتاج استكمال المراجعة'}`,
    ].join('\n');
    downloadFile(`\uFEFF${content}`, `final-launch-checklist-${safeDateName()}.txt`, 'text/plain;charset=utf-8');
    setNotice('تم تنزيل قائمة الإطلاق النهائية.');
  }

  async function exportConfigurationSnapshot() {
    if (exporting || profile?.role !== 'super_admin') return;
    setExporting(true);
    setError('');
    try {
      const [occasions, templates, templateSettings, fonts, totals, appSettings, auditLogs] = await Promise.all([
        supabase.from('occasions').select('*').order('created_at'),
        supabase.from('templates').select('*').order('created_at'),
        supabase.from('template_settings').select('*').order('updated_at'),
        supabase.from('fonts').select('*').order('created_at'),
        supabase.from('statistics_totals').select('*'),
        supabase.from('app_settings').select('*').single(),
        supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(5000),
      ]);
      const results = [occasions, templates, templateSettings, fonts, totals, appSettings, auditLogs];
      const failed = results.find((result) => result.error);
      if (failed?.error) throw failed.error;

      const payload = {
        format: 'greeting-cards-release-snapshot',
        release: RELEASE_VERSION,
        exported_at: new Date().toISOString(),
        warning: 'This is a configuration snapshot. It does not contain Auth passwords, Storage binary files, or a full PostgreSQL backup.',
        occasions: occasions.data || [],
        templates: templates.data || [],
        template_settings: templateSettings.data || [],
        fonts: fonts.data || [],
        statistics_totals: totals.data || [],
        app_settings: appSettings.data || null,
        audit_logs: auditLogs.data || [],
        readiness: summary,
      };

      downloadFile(JSON.stringify(payload, null, 2), `greeting-cards-release-${RELEASE_VERSION}-${safeDateName()}.json`, 'application/json');
      await supabase.rpc('record_admin_audit', {
        p_action: 'export',
        p_entity_type: 'release_snapshot',
        p_entity_id: RELEASE_VERSION,
        p_entity_label: `نسخة إعدادات الإطلاق ${RELEASE_VERSION}`,
        p_details: { occasions: payload.occasions.length, templates: payload.templates.length },
      });
      setManualState((current) => ({ ...current, 'backup-created': true }));
      setNotice('تم تنزيل نسخة إعدادات الإطلاق. احتفظ أيضًا بنسخة قاعدة بيانات Supabase وملفات Storage.');
    } catch (exportError) {
      setError(getFriendlySupabaseError(exportError));
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="launch-readiness-page">
      <div className="page-heading">
        <div>
          <h1>جاهزية الإطلاق</h1>
          <p>المراجعة النهائية قبل اعتماد المنصة للاستخدام الرسمي.</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => void loadReadiness()} disabled={loading}>
          <RefreshCw size={17} className={loading ? 'spin' : ''} /> إعادة الفحص
        </button>
      </div>

      {error && <div className="inline-notice error-notice">{error}</div>}
      {notice && <div className="inline-notice success-notice">{notice}</div>}

      <div className={`launch-status-hero ${launchReady ? 'ready' : technicalReady ? 'review' : 'blocked'}`}>
        <div className="launch-status-icon">
          {launchReady ? <Rocket size={34} /> : technicalReady ? <FileCheck2 size={34} /> : <ShieldCheck size={34} />}
        </div>
        <div>
          <span>الإصدار الرسمي {RELEASE_VERSION}</span>
          <h2>{launchReady ? 'المنصة جاهزة للإطلاق' : technicalReady ? 'الفحص التقني ناجح — أكمل الاختبار اليدوي' : 'توجد نقاط تقنية تحتاج مراجعة'}</h2>
          <p>
            {launchReady
              ? 'اكتملت الفحوص التقنية واليدوية. احتفظ بنسخة احتياطية قبل أي تعديل كبير لاحقًا.'
              : `اكتمل ${completedManual} من ${MANUAL_ITEMS.length} من خطوات الاختبار اليدوي.`}
          </p>
        </div>
        <span className="release-badge">v{RELEASE_VERSION}</span>
      </div>

      <div className="launch-summary-grid">
        <article><Globe2 size={21} /><strong>{summary?.active_occasions || 0}</strong><span>مناسبة نشطة الآن</span></article>
        <article><Settings2 size={21} /><strong>{summary?.active_templates || 0}</strong><span>قالب نشط</span></article>
        <article><Server size={21} /><strong>{summary?.total_generated || 0}</strong><span>إجمالي البطاقات</span></article>
        <article><LockKeyhole size={21} /><strong>{summary?.public_rate_limit_enabled ? 'مفعّلة' : 'غير مفعّلة'}</strong><span>حماية الاستخدام</span></article>
      </div>

      <div className="launch-columns">
        <div className="content-card launch-card">
          <div className="launch-card-heading">
            <div><ShieldCheck size={22} /><div><h2>الفحص التقني</h2><p>يُقرأ مباشرة من قاعدة بيانات المنصة.</p></div></div>
            <span>{loading ? <LoaderCircle className="spin" size={19} /> : `${checks.filter((check) => check.passed).length}/${checks.length}`}</span>
          </div>
          {loading ? (
            <div className="loading-card"><LoaderCircle className="spin" size={22} /> جاري فحص المنصة...</div>
          ) : (
            <div className="launch-check-list">
              {checks.map((check) => <CheckRow key={check.title} {...check} />)}
              {Number(summary?.active_occasions || 0) === 0 && (
                <CheckRow
                  passed={false}
                  warning
                  title="لا توجد مناسبة نشطة الآن"
                  description="هذه ليست مشكلة تقنية؛ الصفحة العامة ستعرض رسالة عدم وجود مناسبة حتى يتم تفعيل واحدة."
                />
              )}
            </div>
          )}
        </div>

        <div className="content-card launch-card">
          <div className="launch-card-heading">
            <div><FileCheck2 size={22} /><div><h2>الاختبار اليدوي</h2><p>حدد كل خطوة بعد تجربتها فعليًا.</p></div></div>
            <span>{completedManual}/{MANUAL_ITEMS.length}</span>
          </div>
          <div className="manual-launch-list">
            {MANUAL_ITEMS.map((item) => (
              <label key={item.id} className={manualState[item.id] ? 'checked' : ''}>
                <input type="checkbox" checked={manualState[item.id]} onChange={() => toggleManual(item.id)} />
                <span>{item.label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="content-card launch-backup-card">
        <div>
          <DatabaseBackup size={28} />
          <div>
            <h2>النسخة الاحتياطية قبل الإطلاق</h2>
            <p>نزّل نسخة الإعدادات من هنا، ثم احفظ نسخة PostgreSQL وملفات Storage من Supabase حسب الدليل المرفق بالحزمة.</p>
          </div>
        </div>
        <div className="launch-actions">
          <button className="secondary-button" type="button" onClick={downloadChecklist} disabled={!checks.length}>
            <Download size={17} /> تنزيل قائمة الاختبار
          </button>
          <button className="primary-button" type="button" onClick={() => void exportConfigurationSnapshot()} disabled={exporting || profile?.role !== 'super_admin'}>
            {exporting ? <LoaderCircle className="spin" size={17} /> : <DatabaseBackup size={17} />}
            نسخة إعدادات الإطلاق
          </button>
        </div>
      </div>

      <div className="launch-security-note">
        <ShieldCheck size={21} />
        <div>
          <strong>نقطة مستقرة نهائية</strong>
          <span>بعد نجاح هذه الحزمة، استخدم نسخًا احتياطية قبل أي تطوير جديد، ولا تضع مفاتيح Secret أو service_role داخل GitHub أو Render Static Site.</span>
        </div>
      </div>
    </section>
  );
}
