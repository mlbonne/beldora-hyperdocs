import type { WikiEntry } from '../types';
import { TYPE_META } from '../wikiTypes';

export function EntryAvatar({ entry, size = 22 }: { entry: WikiEntry; size?: number }) {
  const Icon = TYPE_META[entry.type].icon;
  return (
    <span className={`avatar t-${entry.type}`} style={{ width: size, height: size }}>
      {entry.image ? <img src={entry.image} alt="" /> : <Icon size={Math.round(size * 0.55)} strokeWidth={2} />}
    </span>
  );
}
