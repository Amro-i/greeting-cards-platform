import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowRight,
  Check,
  Grip,
  LoaderCircle,
  RotateCcw,
  Save,
  Type,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  findDefaultFont,
  fontLabel,
  fontSupportsLanguage,
  loadFont,
  loadFonts,
  normalizeTextSettings,
  settingsWithFont,
} from '../../lib/fontUtils';
import { getFriendlySupabaseError, getTemplatePublicUrl } from '../../lib/occasionUtils';
import { supabase } from '../../lib/supabase';

const LANGUAGE_META = {
  ar: { label: 'الاسم العربي', direction: 'rtl' },
  en: { label: 'English Name', direction: 'ltr' },
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeStoredSettings(row, fonts) {
  const arFont = fonts.find((font) => font.id === row?.arabic_settings?.fontId) || findDefaultFont(fonts, 'ar');
  const enFont = fonts.find((font) => font.id === row?.english_settings?.fontId) || findDefaultFont(fonts, 'en');
  return {
    ar: normalizeTextSettings(row?.arabic_settings, arFont, 'ar'),
    en: normalizeTextSettings(row?.english_settings, enFont, 'en'),
  };
}

export default function TemplateEditorPage() {
  const { templateId } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const canManage = ['super_admin', 'admin'].includes(profile?.role);
  const stageRef = useRef(null);
  const previewViewportRef = useRef(null);
  const [template, setTemplate] = useState(null);
  const [fonts, setFonts] = useState([]);
  const [settingsRowId, setSettingsRowId] = useState('');
  const [settings, setSettings] = useState({ ar: null, en: null });
  const [selectedLanguage, setSelectedLanguage] = useState('ar');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [stageSize, setStageSize] = useState({ width: 1, height: 1 });
  const [dragging, setDragging] = useState('');

  const loadEditor = useCallback(async () => {
    setLoading(true);
    setError('');

    const [templateResult, fontsResult] = await Promise.all([
      supabase
        .from('templates')
        .select(`
          id, name, shape, image_path, image_width, image_height, is_active, updated_at,
          occasion:occasions (id, title_ar, title_en, status, starts_at, ends_at),
          template_settings (id, arabic_settings, english_settings, updated_at)
        `)
        .eq('id', templateId)
        .maybeSingle(),
      supabase
        .from('fonts')
        .select('id, display_name, family_name, language, weight, style, storage_path, is_system, is_active')
        .order('is_system', { ascending: false })
        .order('display_name'),
    ]);

    if (templateResult.error || fontsResult.error) {
      setError(getFriendlySupabaseError(templateResult.error || fontsResult.error));
      setLoading(false);
      return;
    }

    if (!templateResult.data) {
      setError('القالب غير موجود أو تم حذفه.');
      setLoading(false);
      return;
    }

    const fontRecords = fontsResult.data || [];
    const row = Array.isArray(templateResult.data.template_settings)
      ? templateResult.data.template_settings[0]
      : templateResult.data.template_settings;

    setTemplate(templateResult.data);
    setFonts(fontRecords);
    setSettingsRowId(row?.id || '');
    setSettings(normalizeStoredSettings(row, fontRecords));
    void loadFonts(fontRecords.filter((font) => font.is_active || row?.arabic_settings?.fontId === font.id || row?.english_settings?.fontId === font.id));
    setLoading(false);
  }, [templateId]);

  useEffect(() => {
    void loadEditor();
  }, [loadEditor]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(''), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!template || !previewViewportRef.current) return undefined;

    const updateStageSize = () => {
      const availableWidth = previewViewportRef.current?.clientWidth || 1;
      const compactScreen = window.innerWidth <= 700;
      const preferredHeight = compactScreen
        ? Math.min(500, Math.max(320, window.innerHeight * 0.55))
        : Math.min(640, Math.max(420, window.innerHeight - 300));
      const scale = Math.min(
        availableWidth / template.image_width,
        preferredHeight / template.image_height,
      );

      setStageSize({
        width: Math.max(1, Math.floor(template.image_width * scale)),
        height: Math.max(1, Math.floor(template.image_height * scale)),
      });
    };

    const observer = new ResizeObserver(updateStageSize);
    observer.observe(previewViewportRef.current);
    window.addEventListener('resize', updateStageSize);
    const frame = window.requestAnimationFrame(updateStageSize);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateStageSize);
      window.cancelAnimationFrame(frame);
    };
  }, [template]);

  const activeSettings = settings[selectedLanguage];
  const selectedFont = fonts.find((font) => font.id === activeSettings?.fontId) || null;
  const availableFonts = useMemo(() => fonts.filter((font) => (
    (font.is_active || font.id === activeSettings?.fontId) && fontSupportsLanguage(font, selectedLanguage)
  )), [activeSettings?.fontId, fonts, selectedLanguage]);

  const previewScale = template?.image_width ? stageSize.width / template.image_width : 1;

  function updateLanguageSettings(language, patch) {
    setSettings((current) => ({
      ...current,
      [language]: { ...current[language], ...patch },
    }));
  }

  function selectFont(fontId) {
    const font = fonts.find((item) => item.id === fontId);
    if (!font) return;
    void loadFont(font);
    setSettings((current) => ({
      ...current,
      [selectedLanguage]: settingsWithFont(current[selectedLanguage], font),
    }));
  }

  function handlePointerMove(event, language) {
    if (!canManage || dragging !== language || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = clamp((event.clientX - rect.left) / rect.width, 0.02, 0.98);
    const y = clamp((event.clientY - rect.top) / rect.height, 0.02, 0.98);
    updateLanguageSettings(language, { x, y });
  }

  function handleTextKeyDown(event, language) {
    if (!canManage || !template || !settings[language]) return;

    const movement = {
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
    }[event.key];

    if (!movement) return;
    event.preventDefault();
    event.stopPropagation();

    const step = event.shiftKey ? 10 : 1;
    const current = settings[language];
    updateLanguageSettings(language, {
      x: clamp(current.x + (movement.x * step) / template.image_width, 0.02, 0.98),
      y: clamp(current.y + (movement.y * step) / template.image_height, 0.02, 0.98),
    });
  }

  function resetLanguage(language) {
    const defaultFont = findDefaultFont(fonts, language);
    updateLanguageSettings(language, normalizeTextSettings(null, defaultFont, language));
  }

  async function handleSave() {
    if (!canManage || saving || !template || !settings.ar || !settings.en) return;
    setSaving(true);
    setError('');

    try {
      const payload = {
        template_id: template.id,
        arabic_settings: settings.ar,
        english_settings: settings.en,
        updated_by: profile.id,
        updated_at: new Date().toISOString(),
      };

      const { data, error: saveError } = await supabase
        .from('template_settings')
        .upsert(payload, { onConflict: 'template_id' })
        .select('id')
        .single();
      if (saveError) throw saveError;

      const { error: templateError } = await supabase
        .from('templates')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', template.id);
      if (templateError) throw templateError;

      setSettingsRowId(data.id);
      setNotice('تم حفظ مواضع النصوص وإعدادات الخط.');
    } catch (saveFailure) {
      setError(getFriendlySupabaseError(saveFailure));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="content-card loading-card"><LoaderCircle className="spin" size={25} /> جاري فتح محرر القالب...</div>;
  }

  if (!template || !settings.ar || !settings.en) {
    return (
      <section>
        <div className="inline-notice error-notice">{error || 'تعذر فتح القالب.'}</div>
        <button className="secondary-button" type="button" onClick={() => navigate('/admin/templates')}>العودة إلى القوالب</button>
      </section>
    );
  }

  return (
    <section className="template-editor-page">
      <div className="page-heading editor-heading">
        <div>
          <Link className="back-inline-link" to="/admin/templates"><ArrowRight size={17} /> العودة إلى القوالب</Link>
          <h1>محرر القالب</h1>
          <p>{template.occasion?.title_ar} — {template.shape === 'square' ? 'قالب مربع' : 'قالب مستطيل'}</p>
        </div>
        <div className="editor-heading-actions">
          {settingsRowId && <span className="saved-settings-pill"><Check size={16} /> الإعدادات محفوظة</span>}
          {canManage && (
            <button className="primary-button" type="button" onClick={handleSave} disabled={saving}>
              {saving ? <><LoaderCircle className="spin" size={17} /> جاري الحفظ...</> : <><Save size={17} /> حفظ الإعدادات</>}
            </button>
          )}
        </div>
      </div>

      {notice && <div className="inline-notice success-notice">{notice}</div>}
      {error && <div className="inline-notice error-notice">{error}</div>}
      {!canManage && <div className="inline-notice info-notice">صلاحيتك للمعاينة فقط، ولا يمكنك تحريك النصوص أو حفظها.</div>}

      <div className="editor-workspace">
        <div className="editor-preview-panel">
          <div className="preview-panel-title">
            <div><strong>معاينة القالب</strong><span>اسحب الاسم مباشرة إلى المكان المطلوب</span></div>
            <span lang="en" dir="ltr">{template.image_width} × {template.image_height} px</span>
          </div>

          <div ref={previewViewportRef} className="design-stage-viewport">
            <div
              ref={stageRef}
              className="design-stage"
              style={{
                width: `${stageSize.width}px`,
                height: `${stageSize.height}px`,
                aspectRatio: `${template.image_width} / ${template.image_height}`,
              }}
            >
              <img src={getTemplatePublicUrl(template.image_path)} alt={template.name} draggable="false" />

              {['ar', 'en'].map((language) => {
              const text = settings[language];
              const isSelected = selectedLanguage === language;
              return (
                <div
                  key={language}
                  className={`design-text-layer ${isSelected ? 'selected' : ''} ${dragging === language ? 'dragging' : ''}`}
                  dir={LANGUAGE_META[language].direction}
                  lang={language === 'en' ? 'en' : 'ar'}
                  style={{
                    left: `${text.x * 100}%`,
                    top: `${text.y * 100}%`,
                    width: `${text.maxWidth * 100}%`,
                    color: text.color,
                    fontFamily: `'${text.familyName}', ${language === 'ar' ? 'Arial' : 'sans-serif'}`,
                    fontWeight: text.fontWeight,
                    fontStyle: text.fontStyle,
                    fontSize: `${Math.max(8, text.fontSize * previewScale)}px`,
                    lineHeight: text.lineHeight,
                    letterSpacing: `${text.letterSpacing * previewScale}px`,
                    textAlign: text.align,
                    cursor: canManage ? (dragging === language ? 'grabbing' : 'grab') : 'default',
                  }}
                  role="button"
                  tabIndex={canManage ? 0 : -1}
                  aria-label={`${LANGUAGE_META[language].label} — استخدم الأسهم لتحريك النص`}
                  onClick={(event) => {
                    setSelectedLanguage(language);
                    if (canManage) event.currentTarget.focus({ preventScroll: true });
                  }}
                  onKeyDown={(event) => handleTextKeyDown(event, language)}
                  onPointerDown={(event) => {
                    if (!canManage) return;
                    setSelectedLanguage(language);
                    event.currentTarget.focus({ preventScroll: true });
                    setDragging(language);
                    event.currentTarget.setPointerCapture(event.pointerId);
                  }}
                  onPointerMove={(event) => handlePointerMove(event, language)}
                  onPointerUp={(event) => {
                    setDragging('');
                    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                  }}
                  onPointerCancel={() => setDragging('')}
                >
                  <span>{text.sampleText}</span>
                  {isSelected && canManage && <i className="drag-handle"><Grip size={14} /></i>}
                </div>
                );
              })}
            </div>
          </div>

          <div className="preview-help">
            <Grip size={18} />
            <span>اختر العربية أو الإنجليزية، ثم اسحب النص أو حرّكه بأسهم لوحة المفاتيح. استخدم Shift مع السهم للتحريك بمقدار أكبر.</span>
          </div>
        </div>

        <aside className="editor-controls-panel">
          <div className="language-tabs">
            <button className={selectedLanguage === 'ar' ? 'active' : ''} type="button" onClick={() => setSelectedLanguage('ar')}>العربي</button>
            <button className={selectedLanguage === 'en' ? 'active' : ''} type="button" onClick={() => setSelectedLanguage('en')} lang="en">English</button>
          </div>

          <div className="control-section">
            <div className="control-section-heading"><Type size={18} /><strong>{LANGUAGE_META[selectedLanguage].label}</strong></div>
            <label className="editor-field">
              نص المعاينة
              <input
                dir={LANGUAGE_META[selectedLanguage].direction}
                value={activeSettings.sampleText}
                onChange={(event) => updateLanguageSettings(selectedLanguage, { sampleText: event.target.value })}
                disabled={!canManage}
              />
            </label>

            <label className="editor-field">
              الخط
              <select value={activeSettings.fontId} onChange={(event) => selectFont(event.target.value)} disabled={!canManage}>
                {availableFonts.map((font) => <option key={font.id} value={font.id}>{fontLabel(font)}</option>)}
              </select>
              {selectedFont && <small>{selectedFont.is_system ? 'خط معتمد داخل المنصة' : 'خط مرفوع من صفحة الخطوط'}</small>}
            </label>
          </div>

          <div className="control-section">
            <div className="control-row-heading"><strong>حجم الخط</strong><output>{Math.round(activeSettings.fontSize)} px</output></div>
            <input
              className="editor-range"
              type="range"
              min="12"
              max="260"
              step="1"
              value={activeSettings.fontSize}
              onChange={(event) => updateLanguageSettings(selectedLanguage, { fontSize: Number(event.target.value) })}
              disabled={!canManage}
            />

            <div className="control-row-heading"><strong>أقصى عرض للنص</strong><output>{Math.round(activeSettings.maxWidth * 100)}%</output></div>
            <input
              className="editor-range"
              type="range"
              min="20"
              max="96"
              step="1"
              value={Math.round(activeSettings.maxWidth * 100)}
              onChange={(event) => updateLanguageSettings(selectedLanguage, { maxWidth: Number(event.target.value) / 100 })}
              disabled={!canManage}
            />

            <div className="editor-two-fields">
              <label className="editor-field">
                ارتفاع السطر
                <input type="number" lang="en" dir="ltr" min="0.8" max="2" step="0.05" value={activeSettings.lineHeight} onChange={(event) => updateLanguageSettings(selectedLanguage, { lineHeight: Number(event.target.value) })} disabled={!canManage} />
              </label>
              <label className="editor-field">
                تباعد الحروف
                <input type="number" lang="en" dir="ltr" min="-10" max="30" step="0.5" value={activeSettings.letterSpacing} onChange={(event) => updateLanguageSettings(selectedLanguage, { letterSpacing: Number(event.target.value) })} disabled={!canManage} />
              </label>
            </div>
          </div>

          <div className="control-section">
            <strong>لون النص</strong>
            <div className="color-control">
              <input type="color" value={activeSettings.color} onChange={(event) => updateLanguageSettings(selectedLanguage, { color: event.target.value })} disabled={!canManage} />
              <input lang="en" dir="ltr" value={activeSettings.color} onChange={(event) => updateLanguageSettings(selectedLanguage, { color: event.target.value })} disabled={!canManage} />
            </div>

            <strong className="alignment-label">المحاذاة</strong>
            <div className="alignment-buttons">
              <button className={activeSettings.align === 'right' ? 'active' : ''} type="button" onClick={() => updateLanguageSettings(selectedLanguage, { align: 'right' })} disabled={!canManage}><AlignRight size={18} /> يمين</button>
              <button className={activeSettings.align === 'center' ? 'active' : ''} type="button" onClick={() => updateLanguageSettings(selectedLanguage, { align: 'center' })} disabled={!canManage}><AlignCenter size={18} /> وسط</button>
              <button className={activeSettings.align === 'left' ? 'active' : ''} type="button" onClick={() => updateLanguageSettings(selectedLanguage, { align: 'left' })} disabled={!canManage}><AlignLeft size={18} /> يسار</button>
            </div>
          </div>

          <div className="control-section">
            <div className="editor-two-fields">
              <label className="editor-field">
                الموضع الأفقي X
                <div className="percent-input"><input type="number" lang="en" dir="ltr" min="0" max="100" value={Math.round(activeSettings.x * 100)} onChange={(event) => updateLanguageSettings(selectedLanguage, { x: clamp(Number(event.target.value) / 100, 0, 1) })} disabled={!canManage} /><span>%</span></div>
              </label>
              <label className="editor-field">
                الموضع الرأسي Y
                <div className="percent-input"><input type="number" lang="en" dir="ltr" min="0" max="100" value={Math.round(activeSettings.y * 100)} onChange={(event) => updateLanguageSettings(selectedLanguage, { y: clamp(Number(event.target.value) / 100, 0, 1) })} disabled={!canManage} /><span>%</span></div>
              </label>
            </div>

            {canManage && (
              <button className="text-button reset-text-button" type="button" onClick={() => resetLanguage(selectedLanguage)}>
                <RotateCcw size={16} /> إعادة إعدادات هذا النص
              </button>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
