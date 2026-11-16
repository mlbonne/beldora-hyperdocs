import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, SquareArrowOutUpRight } from 'lucide-react';
import { useStore } from '../store';
import { TYPE_META } from '../wikiTypes';
import type { WikiEntry } from '../types';

/** The compact "infobox" shown when hovering a linked name. */
export function EntryCard({
  entry,
  onOpen,
  onOpenNewTab,
}: {
  entry: WikiEntry;
  onOpen?: () => void;
  onOpenNewTab?: () => void;
}) {
  const entries = useStore((s) => s.entries);
  const meta = TYPE_META[entry.type];
  const Icon = meta.icon;
  const facts = entry.fields.filter((f) => f.label.trim() && f.value.trim()).slice(0, 4);
  const between = entry.participants.map((id) => entries[id]?.title).filter(Boolean);

  return (
    <div className={`entry-card t-${entry.type}`}>
      <div className="ec-media">
        {entry.image ? (
          <img src={entry.image} alt="" />
        ) : (
          <div className="ec-placeholder">
            <Icon size={38} strokeWidth={1.3} />
          </div>
        )}
      </div>
      <div className="ec-body">
        <span className="type-chip">
          <Icon size={12} strokeWidth={2.2} />
          {meta.label}
        </span>
        <h3>{entry.title || 'Untitled'}</h3>
        {entry.summary ? <p>{entry.summary}</p> : <p className="muted">No description yet.</p>}
        {entry.type === 'dynamic' && between.length > 0 && <p className="ec-between">Between {between.join(', ')}</p>}
        {facts.length > 0 && (
          <dl>
            {facts.map((f) => (
              <div key={f.id}>
                <dt>{f.label}</dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {(onOpen || onOpenNewTab) && (
          <div className="ec-actions">
            {onOpen && (
              <button className="ec-open" onClick={onOpen}>
                Open wiki page <ArrowRight size={14} />
              </button>
            )}
            {onOpenNewTab && (
              <button className="ec-open ec-newtab" onClick={onOpenNewTab}>
                <SquareArrowOutUpRight size={13} /> Open in new tab
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Shows a card while a link is hovered, lingering briefly so the pointer can travel onto it. */
export function useHoverCard(delay = 450) {
  const [card, setCard] = useState<{ id: string; rect: DOMRect } | null>(null);
  const timer = useRef<number>();
  const onHover = useCallback(
    (id: string | null, rect: DOMRect | null) => {
      window.clearTimeout(timer.current);
      if (id && rect) setCard({ id, rect });
      else timer.current = window.setTimeout(() => setCard(null), delay);
    },
    [delay],
  );
  const keep = useCallback(() => window.clearTimeout(timer.current), []);
  const leave = useCallback(() => {
    timer.current = window.setTimeout(() => setCard(null), delay);
  }, [delay]);
  const close = useCallback(() => setCard(null), []);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return { card, onHover, keep, leave, close };
}
