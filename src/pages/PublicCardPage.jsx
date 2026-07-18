import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarX2,
  CheckCircle2,
  Download,
  ImageIcon,
  LoaderCircle,
  RectangleHorizontal,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Square,
} from 'lucide-react';
import { makeCardFileName, renderGreetingCard } from '../lib/cardRenderer';
import { findDefaultFont, loadFonts, normalizeTextSettings } from '../lib/fontUtils';
import { getFriendlySupabaseError, getTemplatePublicUrl } from '../lib/occasionUtils';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

const DEFAULT_SETTINGS = {
  platform_name_ar: 'بطاقات تهنئة',
  platform_name_en: 'Greeting Cards',
  empty_message_ar: 'لا توجد مناسبة متاحة حاليًا',
  empty_message_en: 'No occasion is currently available.',
};

function getTemplateSettings(template, fonts) {
  const row = Array.isArray(template?.template_settings)
    ? template.template_settings[0]
    : template?.template_settings;
  const arFont = fonts.find((font) => font.id === row?.arabic_settings?.fontId) || findDefaultFont(fonts, 'ar');
  const enFont = fonts.find((font) => font.id === row?.english_settings?.fontId) || findDefaultFont(fonts, 'en');

  return {
    ar: normalizeTextSettings(row?.arabic_settings, arFont, 'ar'),
    en: normalizeTextSettings(row?.english_settings, enFont, 'en'),
  };
}

function sortTemplates(templates) {
  return [...templates].sort((first, second) => (
    new Date(second.updated_at || second.created_at || 0).getTime()
    - new Date(first.updated_at || first.created_at || 0).getTime()
  ));
}

export default function PublicCardPage() {
  const previewRef = useRef(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [occasion, setOccasion] = useState(null);
  const [fonts, setFonts] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [selectedShape, setSelectedShape] = useState('');
  const [arabicName, setArabicName] = useState('');
  const [englishName, setEnglishName] = useState('');
  const [previewWidth, setPreviewWidth] = useState(1);
  const [generatedUrl, setGeneratedUrl] = useState('');
  const [generatedFileName, setGeneratedFileName] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!supabase) return;
    let active = true;

    async function loadPageData() {
      const now = new Date().toISOString();
      const [occasionResult, settingsResult, fontsResult] = await Promise.all([
        supabase
          .from('occasions')
          .select(`
            id, title_ar, title_en, slug, starts_at, ends_at,
            templates (
              id, name, shape, image_path, image_width, image_height,
              is_active, created_at, updated_at,
              template_settings (arabic_settings, english_settings)
            )
          `)
          .eq('status', 'active')
          .lte('starts_at', now)
          .gte('ends_at', now)
          .order('starts_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('app_settings')
          .select('platform_name_ar, platform_name_en, empty_message_ar, empty_message_en')
          .eq('id', true)
          .maybeSingle(),
        supabase
          .from('fonts')
          .select('id, display_name, family_name, language, weight, style, storage_path, is_system, is_active')
          .eq('is_active', true)
          .order('is_system', { ascending: false })
          .order('display_name'),
      ]);

      if (!active) return;
      if (occasionResult.error || fontsResult.error) {
        setError(getFriendlySupabaseError(occasionResult.error || fontsResult.error));
      }
      if (settingsResult.data) setSettings(settingsResult.data);
      setOccasion(occasionResult.data || null);
      setFonts(fontsResult.data || []);
      void loadFonts(fontsResult.data || []);
      setLoading(false);
    }

    void loadPageData();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!previewRef.current) return undefined;
    const observer = new ResizeObserver((entries) => {
      setPreviewWidth(entries[0]?.contentRect?.width || 1);
    });
    observer.observe(previewRef.current);
    return () => observer.disconnect();
  }, [occasion, selectedShape]);

  useEffect(() => () => {
    if (generatedUrl) URL.revokeObjectURL(generatedUrl);
  }, [generatedUrl]);

  const templatesByShape = useMemo(() => {
    const activeTemplates = sortTemplates((occasion?.templates || []).filter((template) => template.is_active));
    return {
      square: activeTemplates.find((template) => template.shape === 'square') || null,
      rectangle: activeTemplates.find((template) => template.shape === 'rectangle') || null,
    };
  }, [occasion]);

  useEffect(() => {
    if (selectedShape && templatesByShape[selectedShape]) return;
    if (templatesByShape.square) setSelectedShape('square');
    else if (templatesByShape.rectangle) setSelectedShape('rectangle');
    else setSelectedShape('');
  }, [selectedShape, templatesByShape]);

  const selectedTemplate = selectedShape ? templatesByShape[selectedShape] : null;
  const selectedTextSettings = useMemo(
    () => (selectedTemplate ? getTemplateSettings(selectedTemplate, fonts) : null),
    [fonts, selectedTemplate],
  );
  const previewScale = selectedTemplate?.image_width ? previewWidth / selectedTemplate.image_width : 1;
  const canGenerate = Boolean(
    selectedTemplate
    && arabicName.trim()
    && englishName.trim()
    && !generating,
  );

  function clearGeneratedCard() {
    setGeneratedUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return '';
    });
    setGeneratedFileName('');
    setNotice('');
  }

  function changeShape(shape) {
    setSelectedShape(shape);
    setError('');
    clearGeneratedCard();
  }

  async function handleGenerate(event) {
    event.preventDefault();
    if (!selectedTemplate || !selectedTextSettings) return;

    const arName = arabicName.trim();
    const enName = englishName.trim();
    if (!arName || !enName) {
      setError('أدخل الاسم العربي والاسم الإنجليزي.');
      return;
    }
    if (arName.length > 100 || enName.length > 100) {
      setError('يجب ألا يتجاوز كل اسم 100 حرف.');
      return;
    }

    setGenerating(true);
    setError('');
    setNotice('');
    clearGeneratedCard();

    try {
      const blob = await renderGreetingCard({
        template: selectedTemplate,
        imageUrl: getTemplatePublicUrl(selectedTemplate.image_path),
        arabicName: arName,
        englishName: enName,
        arabicSettings: selectedTextSettings.ar,
        englishSettings: selectedTextSettings.en,
        fonts,
      });

      const objectUrl = URL.createObjectURL(blob);
      const fileName = makeCardFileName(occasion, enName, selectedShape);
      setGeneratedUrl(objectUrl);
      setGeneratedFileName(fileName);

      const { error: logError } = await supabase.from('generation_logs').insert({
        occasion_id: occasion.id,
        template_id: selectedTemplate.id,
        arabic_name: arName,
        english_name: enName,
        shape: selectedShape,
      });

      if (logError) {
        setNotice('تم تجهيز البطاقة، لكن تعذر تسجيل العملية في الإحصائيات.');
      } else {
        setNotice('تم تجهيز البطاقة بنجاح. يمكنك تنزيلها الآن.');
      }
    } catch (generationError) {
      setError(generationError?.message || 'تعذر تجهيز البطاقة. حاول مرة أخرى.');
    } finally {
      setGenerating(false);
    }
  }

  function downloadCard() {
    if (!generatedUrl) return;
    const link = document.createElement('a');
    link.href = generatedUrl;
    link.download = generatedFileName || 'greeting-card.jpg';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function resetForm() {
    setArabicName('');
    setEnglishName('');
    setError('');
    clearGeneratedCard();
  }

  if (loading) {
    return <div className="screen-center"><LoaderCircle className="spin" size={25} /> جاري تحميل المناسبة...</div>;
  }

  return (
    <div className="public-page">
      <header className="public-header">
        <div className="public-brand">
          <div className="brand-mark">ب</div>
          <div>
            <strong>{settings.platform_name_ar}</strong>
            <span>{settings.platform_name_en}</span>
          </div>
        </div>
        <a href="/admin/login" className="admin-link">
          <ShieldCheck size={18} />
          دخول الإدارة
        </a>
      </header>

      <main className={`public-main ${occasion ? 'builder-main' : ''}`}>
        {!occasion ? (
          <section className="empty-occasion-card">
            <div className="empty-icon"><CalendarX2 size={40} /></div>
            <h1>{settings.empty_message_ar}</h1>
            <p lang="en" dir="ltr">{settings.empty_message_en}</p>
            <span>{error || 'ستظهر هنا بطاقة المناسبة عند تفعيلها من لوحة الإدارة.'}</span>
          </section>
        ) : (
          <section className="card-builder-shell">
            <div className="builder-intro">
              <span className="eyebrow"><Sparkles size={16} /> المناسبة الحالية</span>
              <h1>{occasion.title_ar}</h1>
              <p lang="en" dir="ltr">{occasion.title_en}</p>
              <span>اكتب اسمك واختر شكل البطاقة، ثم حمّلها بصيغة JPG.</span>
            </div>

            <div className="builder-grid">
              <form className="card-builder-form" onSubmit={handleGenerate}>
                <div className="builder-section-heading">
                  <span>1</span>
                  <div><strong>أدخل الأسماء</strong><small>سيظهر كل اسم في مكانه المحدد داخل القالب.</small></div>
                </div>

                <label className="public-field">
                  الاسم بالعربي
                  <input
                    value={arabicName}
                    onChange={(event) => { setArabicName(event.target.value); clearGeneratedCard(); }}
                    placeholder="مثال: محمد أحمد"
                    maxLength={100}
                    autoComplete="name"
                    dir="rtl"
                  />
                </label>

                <label className="public-field">
                  الاسم بالإنجليزي
                  <input
                    value={englishName}
                    onChange={(event) => { setEnglishName(event.target.value); clearGeneratedCard(); }}
                    placeholder="Example: Mohammed Ahmed"
                    maxLength={100}
                    autoComplete="name"
                    dir="ltr"
                    lang="en"
                  />
                </label>

                <div className="builder-section-heading shape-step-heading">
                  <span>2</span>
                  <div><strong>اختر نوع القالب</strong><small>تظهر فقط الأنواع التي جهزتها الإدارة.</small></div>
                </div>

                <div className="public-shape-buttons">
                  <button
                    type="button"
                    className={selectedShape === 'square' ? 'active' : ''}
                    onClick={() => changeShape('square')}
                    disabled={!templatesByShape.square}
                  >
                    <Square size={25} />
                    <span><strong>مربع</strong><small>{templatesByShape.square ? 'متاح' : 'غير متاح'}</small></span>
                    {selectedShape === 'square' && <CheckCircle2 size={18} />}
                  </button>

                  <button
                    type="button"
                    className={selectedShape === 'rectangle' ? 'active' : ''}
                    onClick={() => changeShape('rectangle')}
                    disabled={!templatesByShape.rectangle}
                  >
                    <RectangleHorizontal size={27} />
                    <span><strong>مستطيل</strong><small>{templatesByShape.rectangle ? 'متاح' : 'غير متاح'}</small></span>
                    {selectedShape === 'rectangle' && <CheckCircle2 size={18} />}
                  </button>
                </div>

                {error && <div className="public-form-message error"><span>{error}</span></div>}
                {notice && <div className="public-form-message success"><CheckCircle2 size={18} /><span>{notice}</span></div>}

                <button className="primary-button public-generate-button" type="submit" disabled={!canGenerate}>
                  {generating
                    ? <><LoaderCircle className="spin" size={19} /> جاري تجهيز البطاقة...</>
                    : <><Sparkles size={19} /> تجهيز البطاقة</>}
                </button>

                {generatedUrl && (
                  <div className="generated-actions">
                    <button className="download-card-button" type="button" onClick={downloadCard}>
                      <Download size={19} /> تحميل البطاقة JPG
                    </button>
                    <button className="reset-card-button" type="button" onClick={resetForm}>
                      <RotateCcw size={17} /> البدء من جديد
                    </button>
                  </div>
                )}
              </form>

              <div className="public-preview-panel">
                <div className="public-preview-heading">
                  <div><ImageIcon size={20} /><span><strong>{generatedUrl ? 'البطاقة النهائية' : 'معاينة البطاقة'}</strong><small>{selectedTemplate ? `${selectedTemplate.image_width} × ${selectedTemplate.image_height} px` : 'اختر قالبًا متاحًا'}</small></span></div>
                </div>

                {generatedUrl ? (
                  <div className="generated-card-preview">
                    <img src={generatedUrl} alt="البطاقة النهائية" />
                    <span><CheckCircle2 size={18} /> تم إنشاء JPG بالجودة الأصلية</span>
                  </div>
                ) : selectedTemplate && selectedTextSettings ? (
                  <div
                    ref={previewRef}
                    className="public-design-stage"
                    style={{ aspectRatio: `${selectedTemplate.image_width} / ${selectedTemplate.image_height}` }}
                  >
                    <img src={getTemplatePublicUrl(selectedTemplate.image_path)} alt={selectedTemplate.name} />
                    <div
                      className="public-name-layer"
                      dir="rtl"
                      style={{
                        left: `${selectedTextSettings.ar.x * 100}%`,
                        top: `${selectedTextSettings.ar.y * 100}%`,
                        width: `${selectedTextSettings.ar.maxWidth * 100}%`,
                        color: selectedTextSettings.ar.color,
                        fontFamily: `'${selectedTextSettings.ar.familyName}', Arial`,
                        fontWeight: selectedTextSettings.ar.fontWeight,
                        fontStyle: selectedTextSettings.ar.fontStyle,
                        fontSize: `${Math.max(8, selectedTextSettings.ar.fontSize * previewScale)}px`,
                        lineHeight: selectedTextSettings.ar.lineHeight,
                        letterSpacing: `${selectedTextSettings.ar.letterSpacing * previewScale}px`,
                        textAlign: selectedTextSettings.ar.align,
                      }}
                    >{arabicName.trim() || selectedTextSettings.ar.sampleText}</div>
                    <div
                      className="public-name-layer"
                      dir="ltr"
                      lang="en"
                      style={{
                        left: `${selectedTextSettings.en.x * 100}%`,
                        top: `${selectedTextSettings.en.y * 100}%`,
                        width: `${selectedTextSettings.en.maxWidth * 100}%`,
                        color: selectedTextSettings.en.color,
                        fontFamily: `'${selectedTextSettings.en.familyName}', sans-serif`,
                        fontWeight: selectedTextSettings.en.fontWeight,
                        fontStyle: selectedTextSettings.en.fontStyle,
                        fontSize: `${Math.max(8, selectedTextSettings.en.fontSize * previewScale)}px`,
                        lineHeight: selectedTextSettings.en.lineHeight,
                        letterSpacing: `${selectedTextSettings.en.letterSpacing * previewScale}px`,
                        textAlign: selectedTextSettings.en.align,
                      }}
                    >{englishName.trim() || selectedTextSettings.en.sampleText}</div>
                  </div>
                ) : (
                  <div className="no-public-template"><ImageIcon size={35} /><strong>لا يوجد قالب متاح</strong><span>أضف قالبًا مفعّلًا من لوحة الإدارة.</span></div>
                )}

                <p className="preview-privacy-note">تُنشأ البطاقة داخل متصفحك، ولا يتم رفع ملف JPG إلى الخادم.</p>
              </div>
            </div>
          </section>
        )}
      </main>

      <footer className="public-footer">بطاقتك تُنشأ مباشرة وبخصوصية.</footer>
    </div>
  );
}
