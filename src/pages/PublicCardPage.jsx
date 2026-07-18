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
  RectangleVertical,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Square,
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import CardNamePreview from '../components/CardNamePreview';
import { getBrandAssetUrl, useAppSettings } from '../context/AppSettingsContext';
import { makeCardFileName, renderGreetingCard } from '../lib/cardRenderer';
import { findDefaultFont, loadFonts, normalizeTextSettings } from '../lib/fontUtils';
import { getFriendlySupabaseError, getTemplatePublicUrl } from '../lib/occasionUtils';
import { createRequestKey, getAnonymousClientKey, getFriendlyClientError, normalizePersonName, retryOperation, withTimeout } from '../lib/reliability';
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
  const generationLockRef = useRef(false);
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
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!supabase) return;
    let active = true;

    function buildOccasionQuery(now) {
      if (adminPreview && occasionId) {
        return supabase
          .from('occasions')
          .select(OCCASION_SELECT)
          .eq('id', occasionId)
          .maybeSingle();
      }
      if (slug) {
        return supabase
          .from('occasions')
          .select(OCCASION_SELECT)
          .eq('slug', slug)
          .eq('status', 'active')
          .lte('starts_at', now)
          .gte('ends_at', now)
          .maybeSingle();
      }
      return supabase
        .from('occasions')
        .select(OCCASION_SELECT)
        .eq('status', 'active')
        .lte('starts_at', now)
        .gte('ends_at', now)
        .order('starts_at', { ascending: false });
    }

    async function requestPageData() {
      const now = new Date().toISOString();
      return withTimeout(() => Promise.all([
        buildOccasionQuery(now),
        supabase
          .from('fonts')
          .select('id, display_name, family_name, language, weight, style, storage_path, is_system, is_active')
          .eq('is_active', true)
          .order('is_system', { ascending: false })
          .order('display_name'),
      ]), 20_000, 'استغرق تحميل المناسبة وقتًا طويلًا.');
    }

    async function loadPageData() {
      setLoading(true);
      setError('');
      setNotice('');
      setOccasion(null);
      setActiveOccasions([]);
      setMissingRequestedOccasion(false);

      try {
        const [occasionResult, fontsResult] = await retryOperation(requestPageData, {
          attempts: 2,
          shouldRetry: () => navigator.onLine,
        });

        if (!active) return;
        if (occasionResult.error || fontsResult.error) {
          throw occasionResult.error || fontsResult.error;
        }

        const availableFonts = fontsResult.data || [];
        setFonts(availableFonts);
        await loadFonts(availableFonts);

        if (adminPreview || slug) {
          setOccasion(occasionResult.data || null);
          setMissingRequestedOccasion(!occasionResult.data);
        } else {
          const occasions = occasionResult.data || [];
          setActiveOccasions(occasions);
          if (occasions.length === 1) setOccasion(occasions[0]);
        }
      } catch (loadError) {
        if (!active) return;
        setError(getFriendlyClientError(loadError, getFriendlySupabaseError(loadError)));
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadPageData();
    return () => { active = false; };
  }, [adminPreview, occasionId, slug, reloadToken]);

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
  const previewIsPortrait = selectedTemplate ? selectedTemplate.image_height > selectedTemplate.image_width : false;
  const previewMaxWidth = previewIsPortrait ? 420 : 760;
  const previewViewportStyle = selectedTemplate
    ? {
        aspectRatio: String(selectedTemplate.image_width) + ' / ' + String(selectedTemplate.image_height),
        width: '100%',
        maxWidth: String(previewMaxWidth) + 'px',
      }
    : undefined;

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
    if (!selectedTemplate || !selectedTextSettings || generationLockRef.current) return;

    const arName = normalizePersonName(arabicName);
    const enName = normalizePersonName(englishName);
    setArabicName(arName);
    setEnglishName(enName);

    if (!arName || !enName) {
      setError('أدخل الاسم العربي والاسم الإنجليزي.');
      return;
    }
    if (arName.length > 100 || enName.length > 100) {
      setError('يجب ألا يتجاوز كل اسم 100 حرف.');
      return;
    }

    generationLockRef.current = true;
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
        const requestKey = createRequestKey();
        const clientKey = getAnonymousClientKey();
        const { error: logError } = await withTimeout(() => supabase.rpc('create_generation_log', {
          p_occasion_id: occasion.id,
          p_template_id: selectedTemplate.id,
          p_arabic_name: arName,
          p_english_name: enName,
          p_shape: selectedShape,
          p_request_key: requestKey,
          p_client_key: clientKey,
        }), 12_000, 'تم تجهيز البطاقة، لكن تأخر تسجيل العملية في الإحصائيات.');

        if (logError) {
          const isRateLimited = String(logError.message || '').includes('RATE_LIMIT_EXCEEDED');
          setNotice(isRateLimited
            ? 'تم تجهيز البطاقة. تم إيقاف تسجيل محاولات إضافية مؤقتًا بسبب كثرة الاستخدام، ويمكنك تنزيل البطاقة الآن.'
            : 'تم تجهيز البطاقة، لكن تعذر تسجيل العملية في الإحصائيات.');
        } else {
          setNotice('تم تجهيز البطاقة بنجاح. يمكنك تنزيلها الآن.');
        }
      }
    } catch (generationError) {
      setError(getFriendlyClientError(generationError, 'تعذر تجهيز البطاقة. حاول مرة أخرى.'));
    } finally {
      generationLockRef.current = false;
      setGenerating(false);
    }
  }

  function downloadCard() {
    if (!generatedUrl) return;
    const link = document.createElement('a');
    link.href = generatedUrl;
    link.download = generatedFileName || 'greeting-card.jpg';
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();

    // بعض متصفحات iOS لا تدعم download بشكل كامل؛ فتح الملف يبقيه متاحًا للحفظ.
    if (!('download' in HTMLAnchorElement.prototype)) {
      window.open(generatedUrl, '_blank', 'noopener,noreferrer');
    }
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
              onChange={(event) => { setArabicName(event.target.value.replace(/[\r\n]+/g, ' ')); clearGeneratedCard(); }}
              onBlur={() => setArabicName((value) => normalizePersonName(value))}
              placeholder="مثال: محمد أحمد"
              maxLength={100}
              autoComplete="name"
              dir="rtl"
            />
            <small className="field-character-count">{arabicName.length}/100</small>
          </label>

          <label className="public-field">
            الاسم بالإنجليزي
            <input
              value={englishName}
              onChange={(event) => { setEnglishName(event.target.value.replace(/[\r\n]+/g, ' ')); clearGeneratedCard(); }}
              onBlur={() => setEnglishName((value) => normalizePersonName(value))}
              placeholder="Example: Mohammed Ahmed"
              maxLength={100}
              autoComplete="name"
              dir="ltr"
              lang="en"
            />
            <small className="field-character-count">{englishName.length}/100</small>
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
              <RectangleVertical size={22} />
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
              <div className="public-design-stage-wrap is-generated">
                <img src={generatedUrl} alt="البطاقة النهائية" className="generated-card-image" />
              </div>
              <span><CheckCircle2 size={18} /> تم إنشاء JPG بجودة عالية</span>
            </div>
          ) : selectedTemplate && selectedTextSettings ? (
            <div ref={previewRef} className="public-design-stage-wrap">
              <div
                className="public-design-stage"
                style={previewViewportStyle}
              >
                <img src={getTemplatePublicUrl(selectedTemplate.image_path)} alt={selectedTemplate.name} />
                <CardNamePreview
                  value={arabicName}
                  settings={selectedTextSettings.ar}
                  language="ar"
                  templateWidth={selectedTemplate.image_width}
                  previewScale={previewScale}
                />
                <CardNamePreview
                  value={englishName}
                  settings={selectedTextSettings.en}
                  language="en"
                  templateWidth={selectedTemplate.image_width}
                  previewScale={previewScale}
                />
              </div>
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
            {error && !missingRequestedOccasion && (
              <button className="secondary-button empty-retry-button" type="button" onClick={() => setReloadToken((value) => value + 1)}>
                <RefreshCw size={17} /> إعادة المحاولة
              </button>
            )}
            {missingRequestedOccasion && <Link className="primary-button empty-home-button" to="/">العودة إلى الصفحة الرئيسية</Link>}
          </section>
        )}
      </main>

      <footer className="public-footer"><span>{settings.footer_text_ar}</span><small lang="en" dir="ltr">{settings.footer_text_en}</small></footer>
    </div>
  );
}
