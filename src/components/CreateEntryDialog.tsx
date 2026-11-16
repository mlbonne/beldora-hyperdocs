import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link2, X } from 'lucide-react';
import { useStore } from '../store';
import { ENTRY_TYPES, TYPE_META } from '../wikiTypes';
import type { EntryType, WikiEntry } from '../types';
import { EntryAvatar } from './EntryAvatar';

export interface DialogResult {
  entry: WikiEntry;
  open: boolean;
  linkedExisting: boolean;
}

interface Props {
  projectId: string;
  initialText?: string;
  initialParticipants?: string[];
  /** Offer linking the selection to an entry that already exists. */
  allowExisting?: boolean;
  onDone: (result: DialogResult) => void;
  onClose: () => void;
}

export function CreateEntryDialog({
  projectId,
  initialText = '',
  initialParticipants = [],
  allowExisting = false,
  onDone,
  onClose,
}: Props) {
  const entries = useStore((s) => s.entries);
  const createEntry = useStore((s) => s.createEntry);
  const projectEntries = useMemo(
    () => Object.values(entries).filter((e) => e.projectId === projectId),
    [entries, projectId],
  );

  const [type, setType] = useState<EntryType>(initialParticipants.length >= 2 ? 'dynamic' : 'character');
  const [title, setTitle] = useState(initialText);
  const [titleTouched, setTitleTouched] = useState(false);
  const [summary, setSummary] = useState('');
  const [participants, setParticipants] = useState<string[]>(initialParticipants);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
    titleRef.current?.select();
  }, []);

  // Dynamics get a default name built from their participants until the user types their own.
  useEffect(() => {
    if (titleTouched) return;
    const names = participants.map((id) => entries[id]?.title).filter(Boolean);
    setTitle(type === 'dynamic' && names.length >= 2 ? names.join(' & ') : initialText);
  }, [type, participants, titleTouched, entries, initialText]);

  const existing = useMemo(() => {
    const q = (titleTouched ? title : initialText).trim().toLowerCase();
    if (!allowExisting || !q || q.length > 40) return [];
    return projectEntries
      .filter((e) => [e.title, ...e.aliases].some((n) => n.toLowerCase().includes(q) || q.includes(n.toLowerCase())))
      .slice(0, 5);
  }, [allowExisting, projectEntries, title, titleTouched, initialText]);

  const candidates = projectEntries.filter((e) => e.type !== 'dynamic' && !participants.includes(e.id));

  const submit = (open: boolean) => {
    if (!title.trim()) return titleRef.current?.focus();
    const entry = createEntry({
      projectId,
      type,
      title: title.trim(),
      summary: summary.trim(),
      participants: type === 'dynamic' ? participants : [],
    });
    onDone({ entry, open, linkedExisting: false });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    if (e.altKey && /^[1-5]$/.test(e.key)) {
      e.preventDefault();
      setType(ENTRY_TYPES[Number(e.key) - 1]);
    }
  };

  return createPortal(
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal create-entry" onMouseDown={(e) => e.stopPropagation()} onKeyDown={onKeyDown}>
        <header className="modal-head">
          <div>
            <h2>New wiki entry</h2>
            {initialText && <p className="modal-quote">“{initialText}”</p>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <div className="type-grid">
          {ENTRY_TYPES.map((t, i) => {
            const meta = TYPE_META[t];
            const Icon = meta.icon;
            return (
              <button
                key={t}
                className={`type-card t-${t} ${type === t ? 'selected' : ''}`}
                onClick={() => setType(t)}
                title={`Alt+${i + 1}`}
              >
                <span className="type-card-icon">
                  <Icon size={20} strokeWidth={1.7} />
                </span>
                <strong>{meta.label}</strong>
                <span>{meta.blurb}</span>
              </button>
            );
          })}
        </div>

        <label className="field">
          <span>Name</span>
          <input
            ref={titleRef}
            value={title}
            placeholder={type === 'dynamic' ? 'e.g. The Vael Siblings' : `Name of the ${TYPE_META[type].label.toLowerCase()}`}
            onChange={(e) => {
              setTitle(e.target.value);
              setTitleTouched(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit(!e.shiftKey);
              }
            }}
          />
        </label>

        {type === 'dynamic' && (
          <div className="field">
            <span>Between</span>
            <div className="participants">
              {participants.map((id) =>
                entries[id] ? (
                  <span key={id} className={`chip t-${entries[id].type}`}>
                    <EntryAvatar entry={entries[id]} size={18} />
                    {entries[id].title}
                    <button onClick={() => setParticipants(participants.filter((p) => p !== id))} aria-label="Remove">
                      <X size={12} />
                    </button>
                  </span>
                ) : null,
              )}
              {candidates.length > 0 && (
                <select
                  className="chip-add"
                  value=""
                  onChange={(e) => e.target.value && setParticipants([...participants, e.target.value])}
                >
                  <option value="">+ Add…</option>
                  {candidates.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.title} ({TYPE_META[e.type].label})
                    </option>
                  ))}
                </select>
              )}
            </div>
            {participants.length < 2 && (
              <small className="hint">A dynamic connects two or more entries. Pick them here, or select linked names in the text.</small>
            )}
          </div>
        )}

        <label className="field">
          <span>Brief description</span>
          <textarea
            rows={2}
            value={summary}
            placeholder="One or two lines shown when hovering this name in a chapter."
            onChange={(e) => setSummary(e.target.value)}
          />
        </label>

        {existing.length > 0 && (
          <div className="existing">
            <span className="existing-label">
              <Link2 size={13} /> Or link to an existing entry
            </span>
            {existing.map((e) => (
              <button key={e.id} className="existing-item" onClick={() => onDone({ entry: e, open: false, linkedExisting: true })}>
                <EntryAvatar entry={e} size={22} />
                <span>{e.title}</span>
                <em>{TYPE_META[e.type].label}</em>
              </button>
            ))}
          </div>
        )}

        <footer className="modal-foot">
          <span className="kbd-hint">
            <kbd>Enter</kbd> create &amp; open · <kbd>Shift</kbd>+<kbd>Enter</kbd> create
          </span>
          <button className="btn ghost" onClick={() => submit(false)}>
            Create
          </button>
          <button className="btn primary" onClick={() => submit(true)}>
            Create &amp; open page
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
