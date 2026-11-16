import { Mark, mergeAttributes } from '@tiptap/core';

function linkMark(name: string, className: string) {
  return Mark.create({
    name,
    inclusive: false,
    addAttributes() {
      return {
        entryId: {
          default: null,
          parseHTML: (el) => el.getAttribute('data-entry-id'),
          renderHTML: (attrs) => ({ 'data-entry-id': attrs.entryId }),
        },
        type: {
          default: 'character',
          parseHTML: (el) => el.getAttribute('data-type'),
          renderHTML: (attrs) => ({ 'data-type': attrs.type }),
        },
      };
    },
    parseHTML() {
      return [{ tag: `span.${className}[data-entry-id]` }];
    },
    renderHTML({ HTMLAttributes }) {
      return ['span', mergeAttributes({ class: className, spellcheck: 'false' }, HTMLAttributes), 0];
    },
  });
}

/** Links a word to a Character / Location / Item / Concept page. */
export const WikiLink = linkMark('wikiLink', 'wiki-link');

/** Links a span (usually covering several linked names) to a Dynamic page. Separate mark so it can overlap wiki links. */
export const DynamicLink = linkMark('dynamicLink', 'dynamic-link');
