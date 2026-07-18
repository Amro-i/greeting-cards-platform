import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ImagePlus,
  LoaderCircle,
  ScanLine,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { getBrandAssetUrl } from '../context/AppSettingsContext';
import {
  getBrandingTarget,
  getImageQualityStatus,
  processBrandingImage,
} from '../lib/brandingImageProcessor';
import { supabase } from '../lib/supabase';

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_SOURCE_SIZE = 10 * 1024 * 1024;
const numberFormat = new Intl.NumberFormat('en-US');

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024 * 1024) return `${numberFormat.format(Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function BrandAssetField({
  label,
  hint,
  value,
  folder,
  onChange,
  canEdit,
  aspect = 'logo',
}) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [imageInfo, setImageInfo] = useState(null);
  const publicUrl = getBrandAssetUrl(value);
  const target = getBrandingTarget(aspect);

  useEffect(() => {
    if (!publicUrl) {
      setImageInfo(null);
      return undefined;
    }

    let active = true;
    const image = new Image();
    image.onload = () => {
      if (!active) return;
      const quality = getImageQualityStatus(aspect, image.naturalWidth, image.naturalHeight);
      setImageInfo({
        width: image.naturalWidth,
        height: image.naturalHeight,
        quality,
        processed: image.naturalWidth === target.width && image.naturalHeight === target.height,
      });
    };
    image.onerror = () => { if (active) setImageInfo(null); };
    image.src = publicUrl;
    return () => { active = false; };
  }, [aspect, publicUrl, target.height, target.width]);

  async function uploadFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !supabase || !canEdit) return;

    setError('');
    setNotice('');
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('الملف يجب أن يكون PNG أو JPG أو WEBP.');
      return;
    }
    if (file.size > MAX_SOURCE_SIZE) {
      setError('حجم الصورة الأصلية يجب ألا يتجاوز 10 MB.');
      return;
    }

    setUploading(true);
    try {
      const processed = await processBrandingImage(file, aspect);
      const path = `${folder}/${Date.now()}-${crypto.randomUUID()}.${processed.extension}`;
      const { error: uploadError } = await supabase.storage
        .from('branding-assets')
        .upload(path, processed.blob, {
          cacheControl: '3600',
          upsert: false,
          contentType: processed.mimeType,
        });

      if (uploadError) throw uploadError;

      setImageInfo({
        width: processed.outputWidth,
        height: processed.outputHeight,
        quality: { isLow: false, message: 'تم اعتماد المقاس الرسمي تلقائيًا.' },
        processed: true,
      });
      setNotice(
        `تمت المعالجة تلقائيًا من ${numberFormat.format(processed.sourceWidth)} × ${numberFormat.format(processed.sourceHeight)} px إلى ${numberFormat.format(processed.outputWidth)} × ${numberFormat.format(processed.outputHeight)} px (${formatBytes(processed.outputSize)}).`,
      );
      if (processed.quality.isLow) {
        setNotice((current) => `${current} تنبيه: جودة الملف الأصلي منخفضة وقد تظهر الصورة أقل وضوحًا.`);
      }
      onChange(path);
    } catch (uploadError) {
      setError(uploadError.message || 'تعذر معالجة الصورة ورفعها.');
    } finally {
      setUploading(false);
    }
  }

  function removeAsset() {
    setError('');
    setNotice('');
    setImageInfo(null);
    onChange('');
  }

  return (
    <div className="brand-asset-field">
      <div className="brand-asset-heading">
        <div><strong>{label}</strong><span>{hint}</span></div>
        <span className="brand-target-size"><ScanLine size={14} /> المقاس المعتمد: <b dir="ltr">{target.label}</b></span>
      </div>

      <div className={`brand-asset-preview ${aspect}`}>
        {publicUrl ? <img src={publicUrl} alt={label} /> : <ImagePlus size={34} />}
      </div>

      <div className="brand-asset-metadata">
        <span>{aspect === 'logo' ? 'بدون قص • خلفية شفافة محفوظة' : 'قص تلقائي من المنتصف • مناسب لجميع الشاشات'}</span>
        {imageInfo && (
          <span dir="ltr">
            الصورة الحالية: {numberFormat.format(imageInfo.width)} × {numberFormat.format(imageInfo.height)} px
          </span>
        )}
      </div>

      {imageInfo && (
        <div className={`asset-quality-note ${imageInfo.quality.isLow ? 'warning' : 'success'}`}>
          {imageInfo.quality.isLow ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
          <span>{imageInfo.processed ? 'المقاس الرسمي معتمد.' : imageInfo.quality.message}</span>
        </div>
      )}
      {notice && <div className="asset-process-notice"><CheckCircle2 size={16} /><span>{notice}</span></div>}
      {error && <div className="asset-field-error">{error}</div>}

      {canEdit && (
        <div className="brand-asset-actions">
          <button className="secondary-button" type="button" onClick={() => inputRef.current?.click()} disabled={uploading}>
            {uploading
              ? <><LoaderCircle className="spin" size={17} /> جاري المعالجة والرفع...</>
              : <><UploadCloud size={17} /> {value ? 'استبدال الصورة' : 'رفع صورة'}</>}
          </button>
          {value && (
            <button className="secondary-button danger-text" type="button" onClick={removeAsset} disabled={uploading}>
              <Trash2 size={17} /> إزالة
            </button>
          )}
        </div>
      )}

      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={uploadFile} />
    </div>
  );
}
