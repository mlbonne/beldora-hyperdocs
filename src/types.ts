import type { JSONContent } from '@tiptap/react';

export type EntryType = 'character' | 'location' | 'item' | 'concept' | 'dynamic';

export interface Project {
  id: string;
  name: string;
  chapterOrder: string[];
  /** Introduction shown on the Wiki home. */
  wikiIntro?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Chapter {
  id: string;
  projectId: string;
  title: string;
  content: JSONContent | null;
  createdAt: number;
  updatedAt: number;
}

export interface InfoField {
  id: string;
  label: string;
  value: string;
}

export interface GalleryImage {
  id: string;
  src: string;
  caption: string;
}

export interface WikiTab {
  id: string;
  title: string;
  kind: 'text' | 'gallery';
  content?: JSONContent | null;
  images?: GalleryImage[];
}

export interface WikiEntry {
  id: string;
  projectId: string;
  type: EntryType;
  title: string;
  /** Other names this entry is known by; all of them are auto-detected in chapters. */
  aliases: string[];
  /** Brief description shown on the hover card. */
  summary: string;
  image: string | null;
  imageCaption: string;
  fields: InfoField[];
  tabs: WikiTab[];
  /** For dynamics: the entries taking part in the relationship. */
  participants: string[];
  createdAt: number;
  updatedAt: number;
}

/** A wiki category: a described list of entries, shown at the bottom of each member's page. */
export interface Category {
  id: string;
  projectId: string;
  name: string;
  description: JSONContent | null;
  /** Every member, in list order. */
  entryIds: string[];
  /**
   * Labelled rows of the navbox (e.g. "Fool", "Magician"). Members in no group are shown
   * in a final unlabelled row; with no groups at all, rows are made by entry type.
   */
  groups: CategoryGroup[];
  /** The article tab it was made from, if any, so it can be updated from there. */
  source?: { entryId: string; tabId: string };
  createdAt: number;
  updatedAt: number;
}

export interface CategoryGroup {
  id: string;
  label: string;
  entryIds: string[];
}

/** The Wiki home tab: always first, cannot be closed. */
export const HOME_TAB: TabRef = { kind: 'home', id: 'wiki' };

export interface TabRef {
  kind: 'home' | 'chapter' | 'wiki' | 'category';
  id: string;
}
