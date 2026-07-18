import { useRef, useState } from 'react';
import { ImagePlus, LoaderCircle, Trash2, UploadCloud } from 'lucide-react';
import { getBrandAssetUrl } from '../context/AppSettingsContext';
import { supabase } from '../lib/supabase';

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

function safeExtension(file) {
  const fromName = file.name.split('.').pop()?.toLowerCase();
  if (['png', 'jpg', 'jpeg', 'webp'].includes(fromName)) return fromName === 'jpeg' ? 'jpg' : fromName;
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  return 'jpg';
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
  const publicUrl = getBrandAssetUrl(value);

  async function uploadFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !supabase || !canEdit) return;

    setError('');
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('الملف يجب أن يكون PNG أو JPG أو WEBP.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('حجم الصورة يجب ألا يتجاوز 5 MB.');
      return;
    }

    setUploading(true);
    const extension = safeExtension(file);
    const path = `${folder}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from('branding-assets')
      .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type });

    if (uploadError) setError(uploadError.message || 'تعذر رفع الصورة.');
    else onChange(path);
    setUploading(false);
  }

  return (
    <div className="brand-asset-field">
      <div className="brand-asset-heading">
        <div><strong>{label}</strong><span>{hint}</span></div>
      </div>

      <div className={`brand-asset-preview ${aspect}`}>
        {publicUrl ? <img src={publicUrl} alt={label} /> : <ImagePlus size={34} />}
      </div>

      {error && <div className="asset-field-error">{error}</div>}

      {canEdit && (
        <div className="brand-asset-actions">
          <button className="secondary-button" type="button" onClick={() => inputRef.current?.click()} disabled={uploading}>
            {uploading ? <><LoaderCircle className="spin" size={17} /> جاري الرفع...</> : <><UploadCloud size={17} /> {value ? 'استبدال الصورة' : 'رفع صورة'}</>}
          </button>
          {value && (
            <button className="secondary-button danger-text" type="button" onClick={() => onChange('')} disabled={uploading}>
              <Trash2 size={17} /> إزالة
            </button>
          )}
        </div>
      )}

      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={uploadFile} />
    </div>
  );
}
