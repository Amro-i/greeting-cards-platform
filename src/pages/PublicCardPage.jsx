import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  CalendarDays,
  CalendarX2,
  CheckCircle2,
  Download,
  Eye,
  ImageIcon,
  LoaderCircle,
  RectangleHorizontal,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Square,
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { getBrandAssetUrl, useAppSettings } from '../context/AppSettingsContext';
import { makeCardFileName, renderGreetingCard } from '../lib/cardRenderer';
import { findDefaultFont, loadFonts, normalizeTextSettings } from '../lib/fontUtils';
import { getFriendlySupabaseError, getTemplatePublicUrl } from '../lib/occasionUtils';
import { isSupabaseConfigured, supabase } from '../lib/supabase';


const OCCASION_SELECT = `
  id, title_ar, title_en, slug, starts_at, ends_at, status,
  templates (
    id, name, shape, image_path, image_width, image_height,
    is_active, created_at, updated_at,
    template_settings (arabic_settings, english_settings)
  )
`;

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

function getOccasionThumbnail(occasion) {
  const templates = sortTemplates((occasion?.templates || []).filter((template) => template.is_active));
  return templates[0] || null;
}

export default function PublicCardPage({ adminPreview = false }) {
  const { slug, occasionId } = useParams();
  const previewRef = useRef(null);
  const { settings, loading: settingsLoading } = useAppSettings();
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [occasion, setOccasion] = useState(null);
  const [activeOccasions, setActiveOccasions] = useState([]);
  const [fonts, setFonts] = useState([]);
  const [selectedShape, setSelectedShape] = useState('');
  const [arabicName, setArabicName] = useState('');
  const [englishName, setEnglishName] = useState('');
  const [previewWidth, setPreviewWidth] = useState(1);
  const [generatedUrl, setGeneratedUrl] = useState('');
  const [generatedFileName, setGeneratedFileName] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [missingRequestedOccasion, setMissingRequestedOccasion] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    let active = true;

    async function loadPageData() {
      setLoading(true);
      setError('');
      setNotice('');
      setOccasion(null);
      setActiveOccasions([]);
      setMissingRequestedOccasion(false);

      const now = new Date().toISOString();
      let occasionQuery;

      if (adminPreview && occasionId) {
        occasionQuery = supabase
          .from('occasions')
          .select(OCCASION_SELECT)
          .eq('id', occasionId)
          .maybeSingle();
      } else if (slug) {
        occasionQuery = supabase
          .from('occasions')
          .select(OCCASION_SELECT)
          .eq('slug', slug)
          .eq('status', 'active')
          .lte('starts_at', now)
          .gte('ends_at', now)
          .maybeSingle();
      } else {
        occasionQuery = supabase
          .from('occasions')
          .select(OCCASION_SELECT)
          .eq('status', 'active')
          .lte('starts_at', now)
          .gte('ends_at', now)
          .order('starts_at', { ascending: false });
      }

      const [occasionResult, fontsResult] = await Promise.all([
        occasionQuery,
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
      setFonts(fontsResult.data || []);
      void loadFonts(fontsResult.data || []);

      if (adminPreview || slug) {
        setOccasion(occasionResult.data || null);
        setMissingRequestedOccasion(!occasionResult.data);
      } else {
        const occasions = occasionResult.data || [];
        setActiveOccasions(occasions);
        if (occasions.length === 1) setOccasion(occasions[0]);
      }
      setLoading(false);
    }

    void loadPageData();
    return () => { active = false; };
  }, [adminPreview, occasionId, slug]);

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

      if (adminPreview) {
        setNotice('تم تجهيز بطاقة المعاينة. لم تُسجل العملية في الإحصائيات.');
      } else {
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

  if (loading || settingsLoading) {
    return <div className="screen-center"><LoaderCircle className="spin" size={25} /> جاري تحميل المناسبة...</div>;
  }

  const isPicker = !adminPreview && !slug && activeOccasions.length > 1 && !occasion;

  const builderContent = occasion ? (
    <section className="card-builder-shell">
      {adminPreview && (
        <div className="admin-preview-banner">
          <div><Eye size={20} /><span><strong>معاينة الإدارة</strong><small>يمكنك تجربة البطاقة قبل التفعيل دون زيادة الإحصائيات.</small></span></div>
          <Link className="secondary-button" to="/admin/occasions"><ArrowRight size={17} /> العودة للمناسبات</Link>
        </div>
      )}

      <div className="builder-intro">
        <span className="eyebrow"><Sparkles size={16} /> {adminPreview ? 'معاينة المناسبة' : settings.welcome_title_ar}</span>
        {!adminPreview && <p className="builder-welcome-en" lang="en" dir="ltr">{settings.welcome_title_en}</p>}
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
              : <><Sparkles size={19} /> {settings.generate_button_ar}</>}
          </button>

          {generatedUrl && (
            <div className="generated-actions">
              <button className="download-card-button" type="button" onClick={downloadCard}>
                <Download size={19} /> {settings.download_button_ar}
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
            <div className="no-public-template"><ImageIcon size={35} /><strong>لا يوجد قالب متاح</strong><span>فعّل قالبًا واحدًا على الأقل من صفحة القوالب.</span></div>
          )}

          <p className="preview-privacy-note">تُنشأ البطاقة داخل متصفحك، ولا يتم رفع ملف JPG إلى الخادم.</p>
        </div>
      </div>
    </section>
  ) : null;

  if (adminPreview) {
    return (
      <div className="admin-occasion-preview-page">
        {builderContent || (
          <section className="empty-occasion-card admin-preview-empty">
            <div className="empty-icon"><CalendarX2 size={40} /></div>
            <h1>تعذر تحميل المناسبة</h1>
            <p>قد تكون المناسبة محذوفة أو لا تملك صلاحية عرضها.</p>
            <Link className="primary-button" to="/admin/occasions">العودة للمناسبات</Link>
          </section>
        )}
      </div>
    );
  }

  return (
    <div className="public-page">
      <header className="public-header">
        <Link to="/" className="public-brand">
          {settings.logo_path ? (
            <div className="brand-logo"><img src={getBrandAssetUrl(settings.logo_path)} alt={settings.platform_name_ar} /></div>
          ) : <div className="brand-mark">ب</div>}
          <div>
            <strong>{settings.platform_name_ar}</strong>
            <span>{settings.platform_name_en}</span>
          </div>
        </Link>
        <a href="/admin/login" className="admin-link">
          <ShieldCheck size={18} />
          دخول الإدارة
        </a>
      </header>

      {settings.cover_path && (
        <div className="public-cover-strip">
          <img src={getBrandAssetUrl(settings.cover_path)} alt="غلاف المنصة" />
        </div>
      )}

      <main className={`public-main ${occasion ? 'builder-main' : ''} ${isPicker ? 'occasion-picker-main' : ''}`}>
        {isPicker ? (
          <section className="public-occasion-picker">
            <div className="picker-heading">
              <span className="eyebrow"><CalendarDays size={17} /> المناسبات المتاحة</span>
              <h1>اختر المناسبة</h1>
              <p>توجد أكثر من مناسبة مفعلة حاليًا. اختر المناسبة التي تريد تجهيز بطاقتها.</p>
            </div>
            <div className="occasion-choice-grid">
              {activeOccasions.map((item) => {
                const thumbnail = getOccasionThumbnail(item);
                return (
                  <Link className="occasion-choice-card" to={`/occasion/${item.slug}`} key={item.id}>
                    <div className="choice-preview">
                      {thumbnail ? <img src={getTemplatePublicUrl(thumbnail.image_path)} alt={item.title_ar} /> : <ImageIcon size={36} />}
                    </div>
                    <div className="choice-body">
                      <h2>{item.title_ar}</h2>
                      <p lang="en" dir="ltr">{item.title_en}</p>
                      <span>فتح المناسبة <ArrowRight size={16} /></span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ) : builderContent || (
          <section className="empty-occasion-card">
            <div className="empty-icon"><CalendarX2 size={40} /></div>
            <h1>{missingRequestedOccasion ? 'هذه المناسبة غير متاحة حاليًا' : settings.empty_message_ar}</h1>
            <p lang="en" dir="ltr">{missingRequestedOccasion ? 'This occasion is not currently available.' : settings.empty_message_en}</p>
            <span>{error || (missingRequestedOccasion ? 'تحقق من الرابط أو ارجع إلى الصفحة الرئيسية.' : 'ستظهر هنا بطاقة المناسبة عند تفعيلها من لوحة الإدارة.')}</span>
            {missingRequestedOccasion && <Link className="primary-button empty-home-button" to="/">العودة إلى الصفحة الرئيسية</Link>}
          </section>
        )}
      </main>

      <footer className="public-footer"><span>{settings.footer_text_ar}</span><small lang="en" dir="ltr">{settings.footer_text_en}</small></footer>
    </div>
  );
}
