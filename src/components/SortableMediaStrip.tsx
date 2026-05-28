import { useState } from 'react';
import { MediaItem } from '@/lib/types';
import { Film, X, Plus, GripVertical } from 'lucide-react';

interface Props {
  media: MediaItem[];
  activeIdx: number;
  onActiveChange: (idx: number) => void;
  onReorder: (next: MediaItem[]) => void;
  onRemove: (idx: number) => void;
  onAdd?: (files: FileList) => void;
  accept?: string;
}

const SortableMediaStrip = ({ media, activeIdx, onActiveChange, onReorder, onRemove, onAdd, accept = 'image/*,video/*' }: Props) => {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const handleDrop = (toIdx: number) => {
    if (dragIdx === null || dragIdx === toIdx) {
      setDragIdx(null); setOverIdx(null);
      return;
    }
    const next = [...media];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(toIdx, 0, moved);
    onReorder(next);
    // keep selection on the moved item
    onActiveChange(toIdx);
    setDragIdx(null); setOverIdx(null);
  };

  return (
    <div className="w-full flex items-center gap-2 overflow-x-auto pb-1">
      {media.map((m, i) => (
        <div
          key={i}
          draggable
          onDragStart={(e) => { setDragIdx(i); e.dataTransfer.effectAllowed = 'move'; }}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOverIdx(i); }}
          onDragLeave={() => setOverIdx(prev => prev === i ? null : prev)}
          onDrop={(e) => { e.preventDefault(); handleDrop(i); }}
          onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
          className={`group relative flex-shrink-0 w-14 h-14 rounded-md overflow-hidden border-2 cursor-grab active:cursor-grabbing transition-all ${
            i === activeIdx ? 'border-primary' : 'border-transparent'
          } ${overIdx === i && dragIdx !== i ? 'ring-2 ring-primary/70 scale-105' : ''} ${
            dragIdx === i ? 'opacity-40' : ''
          }`}
          onClick={() => onActiveChange(i)}
          title="Drag to reorder"
        >
          <img
            src={m.type === 'video' ? (m.thumbnail || m.url) : m.url}
            alt=""
            className="w-full h-full object-cover pointer-events-none"
          />
          <span className="absolute top-0.5 left-0.5 bg-black/60 text-white rounded-sm p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <GripVertical size={10} />
          </span>
          {m.type === 'video' && (
            <span className="absolute bottom-0.5 right-0.5 bg-black/70 text-white rounded-sm p-0.5">
              <Film size={10} />
            </span>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRemove(i); }}
            className="absolute top-0.5 right-0.5 bg-black/70 text-white rounded-full p-0.5 hover:bg-destructive"
            aria-label="Remove"
          >
            <X size={10} />
          </button>
        </div>
      ))}
      {onAdd && (
        <label className="flex-shrink-0 w-14 h-14 rounded-md border-2 border-dashed border-border flex items-center justify-center cursor-pointer hover:border-primary/60 text-muted-foreground">
          <Plus size={18} />
          <input
            type="file"
            accept={accept}
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length) onAdd(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
      )}
    </div>
  );
};

export default SortableMediaStrip;
