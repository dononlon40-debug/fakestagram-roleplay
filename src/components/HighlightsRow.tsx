import { useState, useEffect } from 'react';
import { StoryHighlight, Story } from '@/lib/types';
import {
  getHighlightsByAccount, getStoriesByAccount, getStoryById, saveHighlight, deleteHighlight,
  reorderHighlights, uid,
} from '@/lib/store';
import { useApp } from '@/contexts/AppContext';
import { Plus, Pencil, X, ChevronLeft, ChevronRight, Trash2, ArrowUp, ArrowDown, UploadCloud } from 'lucide-react';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import StoryViewer from './StoryViewer';
import ImageCropper from './ImageCropper';

interface Props {
  accountId: string;
  canEdit: boolean;
}

type CropTarget = 'cover' | 'content';

const HighlightsRow = ({ accountId, canEdit }: Props) => {
  const { refresh } = useApp();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [coverImage, setCoverImage] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [selectedStoryIds, setSelectedStoryIds] = useState<string[]>([]);
  const [cropQueue, setCropQueue] = useState<string[]>([]);
  const [cropTarget, setCropTarget] = useState<CropTarget>('content');
  const [viewer, setViewer] = useState<{ groups: Story[][]; highlightIds: string[]; groupIndex: number } | null>(null);
  const [dragImageIdx, setDragImageIdx] = useState<number | null>(null);
  const [dragStoryIdx, setDragStoryIdx] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<CropTarget | null>(null);

  const reorderArr = <T,>(arr: T[], from: number, to: number): T[] => {
    if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return arr;
    const next = [...arr];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
  };

  const highlights = getHighlightsByAccount(accountId);
  const accountStories = getStoriesByAccount(accountId);

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setCoverImage('');
    setImages([]);
    setSelectedStoryIds([]);
    setCropQueue([]);
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (h: StoryHighlight) => {
    setEditingId(h.id);
    setName(h.name);
    setCoverImage(h.coverImage);
    setImages(h.images || []);
    setSelectedStoryIds(h.storyIds);
    setCropQueue([]);
    setDialogOpen(true);
  };

  const readImageFiles = (files: File[]) => Promise.all(
    files.filter(f => f.type.startsWith('image/')).map(f => new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result as string);
      r.onerror = rej;
      r.readAsDataURL(f);
    }))
  );

  const handleCoverFiles = (files: File[]) => {
    readImageFiles(files.slice(0, 1)).then(results => {
      if (!results[0]) return;
      setCropTarget('cover');
      setCropQueue([results[0]]);
    });
  };

  const handleContentFiles = (files: File[]) => {
    readImageFiles(files).then(results => {
      if (!results.length) return;
      setCropTarget('content');
      setCropQueue(results);
    });
  };

  const handleCoverPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleCoverFiles(Array.from(e.target.files || []));
    e.target.value = '';
  };

  const handleImagesPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleContentFiles(Array.from(e.target.files || []));
    e.target.value = '';
  };

  // Paste images from clipboard while the highlight dialog is open
  useEffect(() => {
    if (!dialogOpen) return;
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const it of Array.from(items)) {
        if (it.kind === 'file' && it.type.startsWith('image/')) {
          const f = it.getAsFile();
          if (f) files.push(f);
        }
      }
      if (!files.length) return;
      e.preventDefault();
      Promise.all(files.map(f => new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result as string);
        r.onerror = rej;
        r.readAsDataURL(f);
      }))).then(results => {
        setCropTarget('content');
        setCropQueue(prev => [...prev, ...results]);
      });
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [dialogOpen]);

  const handleCropDone = (cropped: string) => {
    if (cropTarget === 'cover') {
      setCoverImage(cropped);
      setCropQueue([]);
      return;
    }
    setImages(prev => [...prev, cropped]);
    setCropQueue(prev => prev.slice(1));
  };

  const handleCropCancel = () => {
    if (cropTarget === 'cover') {
      setCropQueue([]);
      return;
    }
    setCropQueue(prev => prev.slice(1));
  };

  const isFileDrag = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes('Files');
  const handleDropFiles = (e: React.DragEvent, target: CropTarget) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(null);
    const files = Array.from(e.dataTransfer.files || []);
    if (target === 'cover') handleCoverFiles(files);
    else handleContentFiles(files);
  };

  const moveImage = (idx: number, dir: -1 | 1) => {
    setImages(prev => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  };

  const moveStorySel = (idx: number, dir: -1 | 1) => {
    setSelectedStoryIds(prev => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  };

  const moveHighlight = (idx: number, dir: -1 | 1) => {
    const ids = highlights.map(h => h.id);
    const j = idx + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    reorderHighlights(accountId, ids);
    refresh();
  };

  const handleSave = () => {
    if (!name.trim() || !coverImage) return;
    const h: StoryHighlight = {
      id: editingId || uid(),
      accountId,
      name: name.trim(),
      coverImage,
      storyIds: selectedStoryIds,
      images,
    };
    saveHighlight(h);
    setDialogOpen(false);
    resetForm();
    refresh();
  };

  const handleDelete = () => {
    if (!editingId) return;
    if (!confirm('Delete this highlight?')) return;
    deleteHighlight(editingId);
    setDialogOpen(false);
    resetForm();
    refresh();
  };

  const buildStoriesForHighlight = (h: StoryHighlight): Story[] => {
    const fromStories = h.storyIds
      .map(id => getStoryById(id))
      .filter(Boolean) as Story[];
    const fromImages: Story[] = (h.images || []).map((img, i) => ({
      id: `${h.id}-img-${i}`,
      accountId: h.accountId,
      image: img,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    }));
    const combined = [...fromStories, ...fromImages];
    if (combined.length > 0) return combined;
    return [{
      id: h.id,
      accountId: h.accountId,
      image: h.coverImage,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    }];
  };

  const openHighlight = (startIdx: number) => {
    const groups: Story[][] = highlights.map(buildStoriesForHighlight);
    const highlightIds = highlights.map(h => h.id);
    setViewer({ groups, highlightIds, groupIndex: startIdx });
  };

  if (highlights.length === 0 && !canEdit) return null;

  const currentCrop = cropQueue[0] || null;

  return (
    <>
      <div className="flex gap-6 overflow-x-auto scrollbar-hide py-2 mb-4">
        {highlights.map((h, idx) => (
          <div key={h.id} className="flex flex-col items-center gap-1 shrink-0 group/h relative">
            <button onClick={() => openHighlight(idx)} className="flex flex-col items-center gap-1">
              <div className="w-[72px] h-[72px] rounded-full border border-border p-[3px] hover:border-foreground transition-colors">
                <div className="w-full h-full rounded-full overflow-hidden bg-secondary">
                  <img src={h.coverImage} alt="" className="w-full h-full object-cover" />
                </div>
              </div>
              <span className="text-xs truncate w-20 text-center">{h.name}</span>
            </button>
            {canEdit && (
              <div className="absolute -top-1 -right-1 flex gap-1 opacity-0 group-hover/h:opacity-100 transition-opacity">
                {idx > 0 && (
                  <button
                    onClick={() => moveHighlight(idx, -1)}
                    className="bg-card border border-border rounded-full p-1 hover:bg-secondary"
                    aria-label="Move left"
                  >
                    <ChevronLeft size={12} />
                  </button>
                )}
                <button
                  onClick={() => openEdit(h)}
                  className="bg-card border border-border rounded-full p-1 hover:bg-secondary"
                  aria-label="Edit"
                >
                  <Pencil size={12} />
                </button>
                {idx < highlights.length - 1 && (
                  <button
                    onClick={() => moveHighlight(idx, 1)}
                    className="bg-card border border-border rounded-full p-1 hover:bg-secondary"
                    aria-label="Move right"
                  >
                    <ChevronRight size={12} />
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
        {canEdit && (
          <button onClick={openCreate} className="flex flex-col items-center gap-1 shrink-0">
            <div className="w-[72px] h-[72px] rounded-full border border-border flex items-center justify-center hover:bg-secondary/50 transition-colors">
              <Plus size={28} className="text-muted-foreground" />
            </div>
            <span className="text-xs text-muted-foreground">New</span>
          </button>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o && currentCrop) return; setDialogOpen(o); if (!o) resetForm(); }}>
        <DialogContent
          className="bg-card border-border max-h-[85vh] overflow-y-auto"
          onInteractOutside={(e) => { if (currentCrop) e.preventDefault(); }}
          onEscapeKeyDown={(e) => { if (currentCrop) e.preventDefault(); }}
        >
          <DialogHeader><DialogTitle>{editingId ? 'Edit highlight' : 'New highlight'}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div
              className={`flex items-center gap-4 rounded-lg border border-dashed p-2 transition-colors ${dropTarget === 'cover' ? 'border-primary bg-primary/10' : 'border-transparent'}`}
              onDragEnter={(e) => { if (isFileDrag(e)) { e.preventDefault(); setDropTarget('cover'); } }}
              onDragOver={(e) => { if (isFileDrag(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDropTarget('cover'); } }}
              onDragLeave={() => setDropTarget(prev => prev === 'cover' ? null : prev)}
              onDrop={(e) => handleDropFiles(e, 'cover')}
            >
              <div className="w-20 h-20 rounded-full bg-secondary overflow-hidden flex items-center justify-center">
                {coverImage && <img src={coverImage} alt="" className="w-full h-full object-cover" />}
                {!coverImage && <UploadCloud size={20} className="text-muted-foreground" />}
              </div>
              <label className="text-sm text-primary cursor-pointer font-semibold">
                {coverImage ? 'Change cover' : 'Upload cover'}
                <input type="file" accept="image/*" className="hidden" onChange={handleCoverPick} />
              </label>
            </div>

            <Input placeholder="Highlight name" value={name} onChange={e => setName(e.target.value)} maxLength={16} />

            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-muted-foreground">Photos in this highlight</p>
                <label className="text-xs text-primary cursor-pointer font-semibold">
                  + Add photos
                  <input type="file" accept="image/*" multiple className="hidden" onChange={handleImagesPick} />
                </label>
              </div>
              <div
                className={`rounded-lg border border-dashed p-2 transition-colors ${dropTarget === 'content' ? 'border-primary bg-primary/10' : 'border-border/60'}`}
                onDragEnter={(e) => { if (isFileDrag(e)) { e.preventDefault(); setDropTarget('content'); } }}
                onDragOver={(e) => { if (isFileDrag(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDropTarget('content'); } }}
                onDragLeave={() => setDropTarget(prev => prev === 'content' ? null : prev)}
                onDrop={(e) => handleDropFiles(e, 'content')}
              >
              {images.length > 0 ? (
                <div className="grid grid-cols-4 gap-2 max-h-56 overflow-y-auto">
                  {images.map((img, i) => (
                    <div
                      key={i}
                      draggable
                      onDragStart={() => setDragImageIdx(i)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        if (dragImageIdx !== null) setImages(prev => reorderArr(prev, dragImageIdx, i));
                        setDragImageIdx(null);
                      }}
                      onDragEnd={() => setDragImageIdx(null)}
                      className={`relative aspect-[9/16] rounded-md overflow-hidden bg-secondary group/img cursor-move ${dragImageIdx === i ? 'opacity-40' : ''}`}
                    >
                      <img src={img} alt="" className="w-full h-full object-cover pointer-events-none" />
                      <button
                        type="button"
                        onClick={() => setImages(prev => prev.filter((_, idx) => idx !== i))}
                        className="absolute top-1 right-1 bg-black/70 rounded-full p-0.5 hover:bg-black"
                        aria-label="Remove"
                      >
                        <X size={12} className="text-white" />
                      </button>
                      <div className="absolute bottom-1 left-1 right-1 flex justify-between opacity-0 group-hover/img:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => moveImage(i, -1)}
                          disabled={i === 0}
                          className="bg-black/70 rounded-full p-0.5 disabled:opacity-30"
                          aria-label="Move up"
                        >
                          <ArrowUp size={10} className="text-white" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveImage(i, 1)}
                          disabled={i === images.length - 1}
                          className="bg-black/70 rounded-full p-0.5 disabled:opacity-30"
                          aria-label="Move down"
                        >
                          <ArrowDown size={10} className="text-white" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic py-4 text-center">Drop photos here or click Add photos.</p>
              )}
              </div>
            </div>

            {accountStories.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">Include from stories (optional · tap to add, drag to reorder)</p>
                <div className="grid grid-cols-4 gap-2 max-h-40 overflow-y-auto">
                  {accountStories.map(s => {
                    const sel = selectedStoryIds.includes(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSelectedStoryIds(p => sel ? p.filter(x => x !== s.id) : [...p, s.id])}
                        className={`aspect-[9/16] rounded-md overflow-hidden border-2 ${sel ? 'border-primary' : 'border-transparent'}`}
                      >
                        <img src={s.image} alt="" className="w-full h-full object-cover" />
                      </button>
                    );
                  })}
                </div>
                {selectedStoryIds.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs text-muted-foreground mb-1">Order of selected stories</p>
                    <div className="grid grid-cols-6 gap-1">
                      {selectedStoryIds.map((sid, i) => {
                        const s = accountStories.find(x => x.id === sid);
                        return (
                          <div
                            key={sid}
                            draggable
                            onDragStart={() => setDragStoryIdx(i)}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={() => {
                              if (dragStoryIdx !== null) setSelectedStoryIds(prev => reorderArr(prev, dragStoryIdx, i));
                              setDragStoryIdx(null);
                            }}
                            onDragEnd={() => setDragStoryIdx(null)}
                            className={`relative aspect-[9/16] rounded overflow-hidden bg-secondary group/s cursor-move ${dragStoryIdx === i ? 'opacity-40' : ''}`}
                          >
                            {s && <img src={s.image} alt="" className="w-full h-full object-cover pointer-events-none" />}
                            <div className="absolute bottom-0 inset-x-0 flex justify-between opacity-0 group-hover/s:opacity-100 transition-opacity">
                              <button type="button" onClick={() => moveStorySel(i, -1)} disabled={i === 0} className="bg-black/70 rounded-full p-0.5 disabled:opacity-30">
                                <ArrowUp size={9} className="text-white" />
                              </button>
                              <button type="button" onClick={() => moveStorySel(i, 1)} disabled={i === selectedStoryIds.length - 1} className="bg-black/70 rounded-full p-0.5 disabled:opacity-30">
                                <ArrowDown size={9} className="text-white" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2">
              {editingId && (
                <Button onClick={handleDelete} variant="destructive" className="gap-1">
                  <Trash2 size={14} /> Delete
                </Button>
              )}
              <Button onClick={handleSave} className="flex-1" disabled={!name.trim() || !coverImage}>
                {editingId ? 'Save changes' : 'Create'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {currentCrop && (
        <ImageCropper
          image={currentCrop}
          onCropDone={handleCropDone}
          onCancel={handleCropCancel}
          aspectRatio={cropTarget === 'cover' ? 1 : 9 / 16}
          cropShape={cropTarget === 'cover' ? 'round' : 'rect'}
        />
      )}

      {viewer && (
        <StoryViewer
          groups={viewer.groups}
          highlightIds={viewer.highlightIds}
          initialGroupIndex={viewer.groupIndex}
          onClose={() => setViewer(null)}
        />
      )}
    </>
  );
};

export default HighlightsRow;
