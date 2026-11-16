import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { KeyRound, Loader2, RotateCcw, WandSparkles, X } from 'lucide-react';
import { useStore } from '../store';
import { ENTRY_TYPES, TYPE_META } from '../wikiTypes';
import type { EntryType } from '../types';
import { extractEntries, GeminiError, ModelUnavailableError, pickModel, listModels, resolveModel, type ExtractedEntry } from '../ai/gemini';
import { applyExtraction, planFor } from '../ai/applyExtraction';

interface Props {
  projectId: string;
  chapterTitle: string;
  text: string;
  onApplied: (entryIds: string[], linkMentions: boolean) => void;
  onClose: () => void;
}

type Row = ExtractedEntry & { key: number; checked: boolean };

export function ExtractDialog({ projectId, chapterTitle, text, onApplied, onClose }: Props) {
  const geminiKey = useStore((s) => s.geminiKey);
  const geminiModel = useStore((s) => s.geminiModel);
  const setGemini = useStore((s) => s.setGemini);
  const entries = useStore((s) => s.entries);

  const [keyDraft, setKeyDraft] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [linkMentions, setLinkMentions] = useState(true);
  const [usedModel, setUsedModel] = useState('');
  const abort = useRef<AbortController | null>(null);

  const run = useCallback(async () => {
    const key = useStore.getState().geminiKey;
    if (!key) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setStatus('loading');
    setError('');
    try {
      const existing = Object.values(useStore.getState().entries).filter((e) => e.projectId === projectId);
      const request = (model: string) =>
        extractEntries({ apiKey: key, model, chapterTitle, text, existing, signal: controller.signal });
      let model = await resolveModel(key, geminiModel);
      let found: ExtractedEntry[];
      try {
        found = await request(model);
      } catch (e) {
        // Google retires model names; switch to the newest one this key can use and remember it.
        if (!(e instanceof ModelUnavailableError)) throw e;
        const replacement = pickModel((await listModels(key)).filter((m) => m !== model));
        if (!replacement) throw e;
        model = replacement;
        setGemini({ geminiModel: model });
        found = await request(model);
      }
      setUsedModel(model);
      setRows(found.map((e, i) => ({ ...e, key: i, checked: true })));
      setStatus('done');
    } catch (e) {
      if (controller.signal.aborted) return;
      setError(e instanceof GeminiError ? e.message : `Could not reach Gemini: ${(e as Error).message}`);
      setStatus('error');
    }
  }, [projectId, chapterTitle, text, geminiModel, setGemini]);

  useEffect(() => {
    if (geminiKey && status === 'idle') run();
  }, [geminiKey, status, run]);

  useEffect(() => () => abort.current?.abort(), []);

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);

  // Updates with nothing left to add are dropped; everything else shows what it will do.
  const shown = useMemo(
    () =>
      rows
        .map((r) => ({ row: r, plan: planFor(projectId, r) }))
        .filter(({ plan }) => !plan.target || plan.changes.length > 0),
    // entries: re-plan if the wiki changes underneath
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, projectId, entries],
  );
  const selected = shown.filter(({ row }) => row.checked);
  const creating = selected.filter(({ plan }) => !plan.target).length;
  const updating = selected.length - creating;

  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const apply = () => {
    const ids = applyExtraction(projectId, selected.map(({ row }) => row));
    onApplied(ids, linkMentions);
  };

  return createPortal(
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal extract" onMouseDown={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h2>
              <WandSparkles size={19} /> Extract wiki entries
            </h2>
            <p className="modal-quote">
              Gemini reads “{chapterTitle}” and suggests entries. Nothing changes until you confirm.
              {usedModel && <span className="extract-model"> Model: {usedModel}</span>}
            </p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>

        {!geminiKey && (
          <div className="extract-key">
            <p>
              <KeyRound size={15} /> Paste a Gemini API key to start. Create one for free at{' '}
              <strong>aistudio.google.com</strong> › Get API key. It’s stored only on this computer.
            </p>
            <div className="extract-key-row">
              <input
                type="password"
                value={keyDraft}
                placeholder="Gemini API key"
                autoFocus
                onChange={(e) => setKeyDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && keyDraft.trim() && setGemini({ geminiKey: keyDraft.trim() })}
              />
              <button className="btn primary" disabled={!keyDraft.trim()} onClick={() => setGemini({ geminiKey: keyDraft.trim() })}>
                Save key
              </button>
            </div>
            <small className="hint">The chapter’s text and your wiki’s names are sent to Google to be analysed.</small>
          </div>
        )}

        {status === 'loading' && (
          <div className="extract-status">
            <Loader2 size={22} className="spin" />
            <span>Gemini is reading the chapter…</span>
            <button className="btn ghost sm" onClick={onClose}>
              Cancel
            </button>
          </div>
        )}

        {status === 'error' && (
          <div className="extract-status error">
            <span>{error}</span>
            <button className="btn ghost sm" onClick={run}>
              <RotateCcw size={14} /> Try again
            </button>
          </div>
        )}

        {status === 'done' && shown.length === 0 && (
          <div className="extract-status">
            <span>Gemini found nothing new in this chapter. Everything is already in the wiki.</span>
          </div>
        )}

        {status === 'done' && shown.length > 0 && (
          <div className="extract-list">
            {shown.map(({ row, plan }) => {
              const Icon = TYPE_META[row.type].icon;
              return (
                <div key={row.key} className={`extract-item t-${row.type} ${row.checked ? '' : 'off'}`}>
                  <input
                    type="checkbox"
                    checked={row.checked}
                    onChange={(e) => update(row.key, { checked: e.target.checked })}
                    aria-label={`Include ${row.name}`}
                  />
                  <div className="extract-body">
                    <div className="extract-top">
                      <label className="type-chip select">
                        <Icon size={12} strokeWidth={2.2} />
                        <select
                          value={row.type}
                          disabled={!!plan.target}
                          onChange={(e) => update(row.key, { type: e.target.value as EntryType })}
                        >
                          {ENTRY_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {TYPE_META[t].label}
                            </option>
                          ))}
                        </select>
                      </label>
                      {plan.target ? (
                        <strong className="extract-name">{plan.target.title}</strong>
                      ) : (
                        <input className="extract-name" value={row.name} onChange={(e) => update(row.key, { name: e.target.value })} />
                      )}
                      <span className={`extract-badge ${plan.target ? 'update' : 'new'}`}>
                        {plan.target ? `Update: ${plan.changes.join(', ')}` : 'New'}
                      </span>
                    </div>
                    {!plan.target || plan.changes.includes('description') ? (
                      <textarea
                        className="extract-summary"
                        rows={2}
                        value={row.summary}
                        onChange={(e) => update(row.key, { summary: e.target.value })}
                      />
                    ) : null}
                    <div className="extract-meta">
                      {row.aliases.length > 0 && <span>Also: {row.aliases.join(', ')}</span>}
                      {row.type === 'dynamic' && row.participants.length > 0 && <span>Between: {row.participants.join(', ')}</span>}
                      {row.fields.map((f) => (
                        <span key={f.label}>
                          <em>{f.label}:</em> {f.value}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <footer className="modal-foot">
          {status === 'done' && shown.length > 0 && (
            <label className="extract-link">
              <input type="checkbox" checked={linkMentions} onChange={(e) => setLinkMentions(e.target.checked)} />
              Link their names in this chapter
            </label>
          )}
          <button className="btn ghost" onClick={onClose}>
            {status === 'done' && shown.length > 0 ? 'Cancel' : 'Close'}
          </button>
          {status === 'done' && shown.length > 0 && (
            <button className="btn primary" disabled={!selected.length} onClick={apply}>
              {[creating && `Create ${creating}`, updating && `update ${updating}`].filter(Boolean).join(' & ') || 'Apply'}
            </button>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
}
