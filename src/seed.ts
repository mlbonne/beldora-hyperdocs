import type { JSONContent } from '@tiptap/react';
import { useStore } from './store';
import type { WikiEntry } from './types';

type Part = string | [string, ...WikiEntry[]];

/** Builds a paragraph; a tuple part is text linked to one or more entries. */
function p(...parts: Part[]): JSONContent {
  return {
    type: 'paragraph',
    content: parts.map((part) => {
      if (typeof part === 'string') return { type: 'text', text: part };
      const [text, ...linked] = part;
      return {
        type: 'text',
        text,
        marks: linked.map((e) => ({
          type: e.type === 'dynamic' ? 'dynamicLink' : 'wikiLink',
          attrs: { entryId: e.id, type: e.type },
        })),
      };
    }),
  };
}

const doc = (...content: JSONContent[]): JSONContent => ({ type: 'doc', content });

/** A small sample project so the first launch shows how chapters and the wiki fit together. */
export function seedDemoProject() {
  const s = useStore.getState();
  const pid = s.createProject('The Salt Lantern');

  const make = (
    type: WikiEntry['type'],
    title: string,
    summary: string,
    values: Record<string, string>,
    extra: { aliases?: string[]; participants?: string[] } = {},
  ) => {
    const e = useStore.getState().createEntry({ projectId: pid, type, title, summary, ...extra });
    useStore.getState().updateEntry(e.id, {
      fields: e.fields.map((f) => ({ ...f, value: values[f.label] ?? '' })),
    });
    return useStore.getState().entries[e.id];
  };

  const mira = make(
    'character',
    'Mira Vael',
    "A cartographer's apprentice who stole the Glass Compass and fled Ostrel under a winter storm.",
    { Species: 'Human', Age: '23', Affiliation: "Cartographers' Guild (expelled)", Status: 'Fugitive' },
    { aliases: ['Mira'] },
  );
  const corin = make(
    'character',
    'Corin Vael',
    "Mira's elder brother, bell-keeper of the Tide Chapel, who believes the sea remembers.",
    { Species: 'Human', Age: '27', Affiliation: 'Tide Chapel', Status: 'Searching for Mira' },
    { aliases: ['Corin'] },
  );
  const ostrel = make('location', 'Ostrel', 'A rain-soaked harbour city built on the drowned ruins of an older one.', {
    Region: 'The Salt Coast',
    Kind: 'Harbour city',
    Population: '~40,000',
    Ruler: 'The Lantern Council',
  });
  const chapel = make('location', 'Tide Chapel', "A chapel half-sunk in Ostrel's harbour whose bells ring with the tide, not the hour.", {
    Region: 'Ostrel harbour',
    Kind: 'Chapel',
  });
  const compass = make('item', 'Glass Compass', 'A compass of clouded sea-glass whose needle points toward whatever its bearer has lost.', {
    Kind: 'Navigational relic',
    Owner: 'Mira Vael',
    Origin: 'Unknown',
    Material: 'Sea-glass, brass',
  });
  const undertide = make('concept', 'Undertide', 'The old belief that the sea keeps the memory of everything it drowns.', {
    Category: 'Folk belief',
    Origin: 'The Salt Coast',
    'Known by': 'Tide Chapel keepers',
  });
  const siblings = make(
    'dynamic',
    'The Vael Siblings',
    'Estranged siblings bound by a shared loss and a quarrel neither of them will name.',
    { Nature: 'Family, estranged', Status: 'Broken', Since: 'Childhood' },
    { participants: [mira.id, corin.id] },
  );

  const overview = mira.tabs[0];
  useStore.getState().updateEntryTab(mira.id, overview.id, {
    content: doc(
      p(
        ['Mira Vael', mira],
        ' grew up in the lower terraces of ',
        ['Ostrel', ostrel],
        ', the younger of two children raised by a lamplighter. At twelve she was apprenticed to the Cartographers’ Guild, where she showed an uncanny talent for charting coastlines she had never seen.',
      ),
      p(
        'She left the city on the night of the winter storm, carrying the ',
        ['Glass Compass', compass],
        ' — a theft the Guild has not forgiven.',
      ),
    ),
  });

  const c1 = s.createChapter(
    pid,
    'The Lantern Road',
    doc(
      p(
        ['Mira', mira],
        ' had not stopped walking since the lights of ',
        ['Ostrel', ostrel],
        ' fell behind the hills. Rain came in from the sea in long grey sheets, and the road beneath her boots had turned into a river of mud and lantern-glow.',
      ),
      p(
        'Under her coat, wrapped in oilcloth, the ',
        ['Glass Compass', compass],
        ' trembled against her ribs. Its needle no longer pointed north. It pointed back — toward the harbour, toward the drowned stones, toward something she had not yet admitted she had lost.',
      ),
      p(
        'Far behind her, the bells of the ',
        ['Tide Chapel', chapel],
        ' began to ring, though it was nowhere near the hour. ',
        ['Mira', mira, siblings],
        [' and ', siblings],
        ['Corin', corin, siblings],
        ' had not spoken in a year, but she knew those bells. Her brother would be climbing the tower now, rope burning in his palms, listening for her name in the tide.',
      ),
      p(
        'She thought of the ',
        ['Undertide', undertide],
        ' — the old saying that the sea remembers everything it takes. Mira had never believed it. Corin always had. Somewhere past Ostrel the road bent toward the cliffs, and she followed it.',
      ),
    ),
  );

  s.createChapter(
    pid,
    'Salt and Bells',
    doc(
      p(
        'Corin found the note on the chapel steps, pinned beneath a stone the size of a fist. He knew the handwriting before he had read a single word. Mira always pressed too hard, as if the paper might argue with her.',
      ),
      p(
        'Below him the Tide Chapel groaned with the turning water. Somewhere out there, beyond the breakwater, the Undertide was listening.',
      ),
    ),
  );

  useStore.getState().openTab({ kind: 'chapter', id: c1 });
}
