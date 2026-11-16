import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, ImagePlus, Star, Trash2, X } from 'lucide-react';
import type { GalleryImage } from '../types';
import { imageFiles, readImage, uid } from '../utils';

interface Props {
  images: GalleryImage[];
  onChange: (images: GalleryImage[]) => void;
  onSetCover: (src: string) => void;
}

export function Gallery({ images, onChange, onSetCover }: Props) {
  const [drag, setDrag] = useState(false);
  const [viewing, setViewing] = useState<number | null>(null);

  const add = async (files: File[]) => {
    const added: GalleryImage[] = [];
    for (const f of files) added.push({ id: uid(), src: await readImage(f), caption: '' });
    if (added.length) onChange([...images, ...added]);
  };

  const pick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = () => add(imageFiles(input.files));
    input.click();
  };

  return (
    <div
      className={`gallery ${drag ? 'drag' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        add(imageFiles(e.dataTransfer.files));
      }}
      onPaste={(e) => add(imageFiles(e.clipboardData.files))}
      tabIndex={-1}
    >
      <div className="gallery-grid">
        {images.map((img, i) => (
          <figure key={img.id} className="gallery-item">
            <button className="gallery-thumb" onClick={() => setViewing(i)}>
              <img src={img.src} alt={img.caption} />
            </button>
            <div className="gallery-tools">
              <button className="icon-btn sm" title="Use as infobox image" onClick={() => onSetCover(img.src)}>
                <Star size={14} />
              </button>
              <button
                className="icon-btn sm"
                title="Remove"
                onClick={() => onChange(images.filter((x) => x.id !== img.id))}
              >
                <Trash2 size={14} />
              </button>
            </div>
            <input
              className="gallery-caption"
              value={img.caption}
              placeholder="Add a caption"
              onChange={(e) => onChange(images.map((x) => (x.id === img.id ? { ...x, caption: e.target.value } : x)))}
            />
          </figure>
        ))}
        <button className="gallery-add" onClick={pick}>
          <ImagePlus size={26} strokeWidth={1.4} />
          <span>Add images</span>
          <small>or drop / paste them here</small>
        </button>
      </div>
      {viewing !== null && images[viewing] && (
        <Lightbox images={images} index={viewing} onIndex={setViewing} onClose={() => setViewing(null)} />
      )}
    </div>
  );
}

function Lightbox({
  images,
  index,
  onIndex,
  onClose,
}: {
  images: GalleryImage[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const step = (d: number) => onIndex((index + d + images.length) % images.length);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });
  const img = images[index];
  return (
    <div className="lightbox" onClick={onClose}>
      <button className="lightbox-close" onClick={onClose} aria-label="Close">
        <X size={22} />
      </button>
      {images.length > 1 && (
        <>
          <button className="lightbox-nav prev" onClick={(e) => (e.stopPropagation(), step(-1))} aria-label="Previous">
            <ChevronLeft size={28} />
          </button>
          <button className="lightbox-nav next" onClick={(e) => (e.stopPropagation(), step(1))} aria-label="Next">
            <ChevronRight size={28} />
          </button>
        </>
      )}
      <figure onClick={(e) => e.stopPropagation()}>
        <img src={img.src} alt={img.caption} />
        {img.caption && <figcaption>{img.caption}</figcaption>}
      </figure>
    </div>
  );
}
