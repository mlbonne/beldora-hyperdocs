import type { EntryType, WikiEntry } from '../types';
import { ENTRY_TYPES, TYPE_META } from '../wikiTypes';

const API = 'https://generativelanguage.googleapis.com/v1beta';
/** Empty means automatic: the newest Flash model this key can use (Google retires model names over time). */
export const DEFAULT_GEMINI_MODEL = '';

export interface ExtractedField {
  label: string;
  value: string;
}

/** One wiki entry as proposed by Gemini. */
export interface ExtractedEntry {
  name: string;
  type: EntryType;
  /** Title of the existing entry this refers to, or "" for a new one. */
  existing: string;
  aliases: string[];
  summary: string;
  fields: ExtractedField[];
  /** For dynamics: names of the entries involved. */
  participants: string[];
  /** A short encyclopedic text for the entry's first tab. */
  article: string;
}

export class GeminiError extends Error {}

/** The requested model doesn't exist or is retired for this key. */
export class ModelUnavailableError extends GeminiError {}

// Gemini's structured output: the reply must be JSON of exactly this shape.
const SCHEMA = {
  type: 'OBJECT',
  properties: {
    entries: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING', description: 'Full name as written in the text.' },
          type: { type: 'STRING', enum: ENTRY_TYPES },
          existing: { type: 'STRING', description: 'Exact title from EXISTING WIKI if this is the same thing, else "".' },
          aliases: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Other names or short forms used in the text.' },
          summary: { type: 'STRING', description: 'One or two sentences.' },
          fields: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: { label: { type: 'STRING' }, value: { type: 'STRING' } },
              required: ['label', 'value'],
            },
          },
          participants: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Dynamics only: names involved.' },
          article: { type: 'STRING', description: 'One to three short paragraphs separated by blank lines.' },
        },
        required: ['name', 'type', 'existing', 'aliases', 'summary', 'fields', 'participants', 'article'],
      },
    },
  },
  required: ['entries'],
};

function instructions(): string {
  const labels = ENTRY_TYPES.map((t) => `- ${t}: ${TYPE_META[t].defaultFields.join(', ')}`).join('\n');
  return `You are the archivist of a fiction writer's world wiki. Read the CHAPTER and propose wiki entries for the elements a reader would need context for.

Entry types:
- character: any sentient being (person, animal, god, spirit…)
- location: any place
- item: any object or thing
- concept: an abstraction that needs a definition (belief, force, magic, institution, event…)
- dynamic: a relationship between two or more entries (family, rivalry, alliance, love…)

Rules:
- Use only what the text states or clearly implies. Never invent facts; leave a field out when the text doesn't say.
- Write summary, field values and article in the same language as the chapter.
- Infobox fields: prefer these labels, exactly as written, and add other short labels only for notable facts:
${labels}
- Skip generic nouns and anything too minor to need a page.
- If something is already in EXISTING WIKI (even under another spelling), set "existing" to its exact title and give only information that entry is missing.
- "name" and "aliases" must be spelled exactly as they appear in the chapter, so they can be found in the text.
- For dynamics, list the participants by name and make sure each one is also an entry (new or existing).`;
}

export async function extractEntries(opts: {
  apiKey: string;
  model: string;
  chapterTitle: string;
  text: string;
  existing: WikiEntry[];
  signal?: AbortSignal;
}): Promise<ExtractedEntry[]> {
  const existing = opts.existing.map((e) => ({
    title: e.title,
    type: e.type,
    aliases: e.aliases,
    summary: e.summary,
    filledFields: e.fields.filter((f) => f.value.trim()).map((f) => f.label),
  }));
  const prompt = `EXISTING WIKI:\n${JSON.stringify(existing)}\n\nCHAPTER "${opts.chapterTitle}":\n${opts.text}`;

  const res = await fetch(`${API}/models/${encodeURIComponent(opts.model)}:generateContent`, {
    method: 'POST',
    signal: opts.signal,
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': opts.apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: instructions() }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.2 },
    }),
  });
  const data = await res.json().catch(() => null);
  if (res.status === 404) throw new ModelUnavailableError(describeError(res.status, data?.error?.message));
  if (!res.ok) throw new GeminiError(describeError(res.status, data?.error?.message));

  const candidate = data?.candidates?.[0];
  const text: string | undefined = candidate?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('');
  if (!text) {
    const reason = data?.promptFeedback?.blockReason ?? candidate?.finishReason;
    throw new GeminiError(reason ? `Gemini returned no answer (${reason}).` : 'Gemini returned an empty answer.');
  }
  try {
    return normalize(JSON.parse(text).entries);
  } catch {
    throw new GeminiError('Gemini’s answer was not valid JSON. Try again.');
  }
}

function describeError(status: number, message?: string): string {
  if (status === 400 && message?.toLowerCase().includes('api key')) return 'The API key was rejected. Check it in Settings.';
  if (status === 403) return 'This API key is not allowed to use Gemini. Check it in Google AI Studio.';
  if (status === 404) return `Model not found. Pick another model in Settings.${message ? ` (${message})` : ''}`;
  if (status === 429) return 'Gemini’s rate limit or quota was reached. Wait a moment and try again.';
  return message ? `Gemini error ${status}: ${message}` : `Gemini error ${status}.`;
}

function normalize(raw: unknown): ExtractedEntry[] {
  if (!Array.isArray(raw)) return [];
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const strs = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
  return raw
    .map((r) => ({
      name: str(r?.name),
      type: (ENTRY_TYPES as string[]).includes(r?.type) ? (r.type as EntryType) : 'concept',
      existing: str(r?.existing),
      aliases: strs(r?.aliases),
      summary: str(r?.summary),
      fields: Array.isArray(r?.fields)
        ? r.fields.map((f: unknown) => ({ label: str((f as ExtractedField)?.label), value: str((f as ExtractedField)?.value) })).filter((f: ExtractedField) => f.label && f.value)
        : [],
      participants: strs(r?.participants),
      article: str(r?.article),
    }))
    .filter((e) => e.name);
}

/** Gemini models this key can use for text generation, newest names first. */
export async function listModels(apiKey: string): Promise<string[]> {
  const res = await fetch(`${API}/models?pageSize=200`, { headers: { 'x-goog-api-key': apiKey } });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new GeminiError(describeError(res.status, data?.error?.message));
  return (data?.models ?? [])
    .filter((m: { name: string; supportedGenerationMethods?: string[] }) =>
      m.name.includes('gemini') && m.supportedGenerationMethods?.includes('generateContent'),
    )
    .map((m: { name: string }) => m.name.replace(/^models\//, ''))
    .sort((a: string, b: string) => b.localeCompare(a, undefined, { numeric: true }));
}

/**
 * The best model for extraction from a list: the newest plain "gemini-N-flash", else another stable
 * Flash variant, else Google's "latest" alias. Previews, lite, image, audio and similar are skipped.
 */
export function pickModel(models: string[]): string | undefined {
  const version = (m: string) => Number(m.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] ?? 0);
  const newest = (list: string[]) => [...list].sort((a, b) => version(b) - version(a))[0];
  const plain = models.filter((m) => /^gemini-\d+(\.\d+)?-flash$/.test(m));
  if (plain.length) return newest(plain);
  const stable = models.filter(
    (m) => m.includes('flash') && !/preview|exp|lite|image|tts|audio|live|thinking|embedding/.test(m) && version(m) > 0,
  );
  if (stable.length) return newest(stable);
  return models.find((m) => m === 'gemini-flash-latest') ?? models.find((m) => m.includes('flash'));
}

/** The model to use: the chosen one, or the best one available to this key. */
export async function resolveModel(apiKey: string, chosen: string): Promise<string> {
  if (chosen) return chosen;
  const picked = pickModel(await listModels(apiKey));
  if (!picked) throw new GeminiError('No Gemini Flash model is available to this API key.');
  return picked;
}
