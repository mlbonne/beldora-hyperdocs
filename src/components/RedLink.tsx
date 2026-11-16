import { useState } from 'react';
import { useStore } from '../store';
import { missingRef } from '../categoryRefs';
import { CreateEntryDialog } from './CreateEntryDialog';

/** A name with no article yet, in red; clicking it creates the article. */
export function RedLink({ name, projectId, className = '' }: { name: string; projectId: string; className?: string }) {
  const [creating, setCreating] = useState(false);
  const replaceCategoryMember = useStore((s) => s.replaceCategoryMember);
  const openTab = useStore((s) => s.openTab);
  return (
    <>
      <button
        className={`red-link ${className}`}
        onClick={() => setCreating(true)}
        title={`“${name}” has no article yet. Click to create it.`}
      >
        {name}
      </button>
      {creating && (
        <CreateEntryDialog
          projectId={projectId}
          initialText={name}
          onClose={() => setCreating(false)}
          onDone={({ entry, open }) => {
            setCreating(false);
            // Even if the name was changed in the dialog, this red link now points to the new article.
            replaceCategoryMember(projectId, missingRef(name), entry.id);
            if (open) openTab({ kind: 'wiki', id: entry.id });
          }}
        />
      )}
    </>
  );
}
