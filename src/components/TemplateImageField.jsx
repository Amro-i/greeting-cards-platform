import { ImagePlus, RefreshCw, X } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { getTemplatePublicUrl } from '../lib/occasionUtils';

export default function TemplateImageField({ label, hint, file, existingTemplate, disabled, onChange }) {
  const selectedUrl = useMemo(() => (file ? URL.createObjectURL(file) : ''), [file]);
  const existingUrl = getTemplatePublicUrl(existingTemplate?.image_path);
  const previewUrl = selectedUrl || existingUrl;

  useEffect(() => () => {
    if (selectedUrl) URL.revokeObjectURL(selectedUrl);
  }, [selectedUrl]);

  return (
    <div className="template-upload-field">
      <div className="template-upload-heading">
        <div>
          <strong>{label}</strong>
          <span>{hint}</span>
        </div>
        {file && (
          <button className="text-button danger-text" type="button" onClick={() => onChange(null)} disabled={disabled}>
            <X size={16} /> إلغاء الاختيار
          </button>
        )}
      </div>

      <label className={`template-dropzone ${previewUrl ? 'has-preview' : ''} ${disabled ? 'disabled' : ''}`}>
        {previewUrl ? (
          <>
            <img src={previewUrl} alt={label} />
            <span className="replace-overlay"><RefreshCw size={18} /> استبدال الصورة</span>
          </>
        ) : (
          <div className="dropzone-empty">
            <ImagePlus size={31} />
            <strong>اختر صورة القالب</strong>
            <span>JPG أو PNG أو WebP — بحد أقصى 10 MB</span>
          </div>
        )}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => onChange(event.target.files?.[0] || null)}
          disabled={disabled}
        />
      </label>

      {existingTemplate && !file && (
        <div className="image-meta" lang="en" dir="ltr">
          {existingTemplate.image_width} × {existingTemplate.image_height} px
        </div>
      )}
      {file && <div className="image-meta">{file.name}</div>}
    </div>
  );
}
