import { AlertTriangle, X } from 'lucide-react';

export default function ConfirmModal({ open, title, description, confirmLabel = 'تأكيد', busy, onConfirm, onClose }) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose();
    }}>
      <section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <button className="icon-button modal-close" type="button" aria-label="إغلاق" onClick={onClose} disabled={busy}>
          <X size={19} />
        </button>
        <div className="confirm-icon"><AlertTriangle size={28} /></div>
        <h2 id="confirm-title">{title}</h2>
        <p>{description}</p>
        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onClose} disabled={busy}>إلغاء</button>
          <button className="danger-button" type="button" onClick={onConfirm} disabled={busy}>
            {busy ? 'جاري التنفيذ...' : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
