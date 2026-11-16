import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface Props {
  title: string;
  label: string;
  initial?: string;
  hint?: string;
  confirm: string;
  onConfirm: (name: string) => void;
  onClose: () => void;
}

/** Asks for a single name. */
export function NameDialog({ title, label, initial = '', hint, confirm, onConfirm, onClose }: Props) {
  const [name, setName] = useState(initial);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.select(), []);
  const submit = () => name.trim() && onConfirm(name.trim());

  return createPortal(
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal name-dialog" onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>
        <label className="field">
          <span>{label}</span>
          <input ref={input} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        </label>
        {hint && <p className="hint">{hint}</p>}
        <footer className="modal-foot">
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!name.trim()} onClick={submit}>
            {confirm}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
