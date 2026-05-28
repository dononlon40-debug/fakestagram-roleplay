import { useState, useEffect, useRef } from 'react';
import { useApp } from '@/contexts/AppContext';
import { savePost, saveReel, saveStory, uid, enforcePinLimit, enforceReelPinLimit } from '@/lib/store';
import { Post, Story, Reel, MediaItem } from '@/lib/types';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { ArrowLeft, Image as ImageIcon, Film, Clock, X, ZoomIn, Crop, UploadCloud } from 'lucide-react';
import EmojiPicker from '@/components/EmojiPicker';
import SortableMediaStrip from '@/components/SortableMediaStrip';
import AccountPicker from '@/components/AccountPicker';

interface Props {
  open: boolean;
  onClose: () => void;
}

const toLocalInput = (d: Date) => {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const CreatePostModal = ({ open, onClose }: Props) => {
  const { activeAccount, accounts, refresh } = useApp();
  const [type, setType] = useState<'post' | 'reel' | 'story'>('post');
  // Multi-media list for posts; reels/stories use the first item only.
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [isFileOver, setIsFileOver] = useState(false);
  const [activeMediaIdx, setActiveMediaIdx] = useState(0);
  const [caption, setCaption] = useState('');
  const [likes, setLikes] = useState(0);
  const [commentsCount, setCommentsCount] = useState(0);
  const [views, setViews] = useState(0);
  const [postedAt, setPostedAt] = useState(toLocalInput(new Date()));
  const [selectedAccountId, setSelectedAccountId] = useState(activeAccount?.id || '');
  const [isPinned, setIsPinned] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [objectFit, setObjectFit] = useState<'contain' | 'cover'>('contain');
  const [previewAspect, setPreviewAspect] = useState<number | 'original'>('original');
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragStart = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const reset = () => {
    setType('post');
    setMedia([]);
    setActiveMediaIdx(0);
    setCaption('');
    setLikes(0);
    setCommentsCount(0);
    setViews(0);
    setPostedAt(toLocalInput(new Date()));
    setIsPinned(false);
    setZoom(1);
    setObjectFit('contain');
    setPreviewAspect('original');
    setOffset({ x: 0, y: 0 });
  };

  // Reset pan/zoom when switching to a different media item
  useEffect(() => {
    setOffset({ x: 0, y: 0 });
    setZoom(1);
  }, [activeMediaIdx]);

  const onDragStart = (e: React.PointerEvent) => {
    if (!activeItem || activeItem.type !== 'image') return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onDragMove = (e: React.PointerEvent) => {
    if (!dragStart.current) return;
    setOffset({
      x: dragStart.current.ox + (e.clientX - dragStart.current.x),
      y: dragStart.current.oy + (e.clientY - dragStart.current.y),
    });
  };
  const onDragEnd = (e: React.PointerEvent) => {
    if ((e.currentTarget as HTMLElement).hasPointerCapture?.(e.pointerId)) {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    }
    dragStart.current = null;
  };

  // Sync selected account to the currently active persona whenever the modal opens
  useEffect(() => {
    if (open && activeAccount?.id) {
      setSelectedAccountId(activeAccount.id);
    }
  }, [open, activeAccount?.id]);

  const handleClose = () => {
    reset();
    onClose();
  };

  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

  const generateVideoThumbnail = (dataUrl: string): Promise<string> =>
    new Promise(resolve => {
      const vid = document.createElement('video');
      vid.src = dataUrl;
      vid.crossOrigin = 'anonymous';
      vid.muted = true;
      vid.playsInline = true;
      let done = false;
      const finish = (val: string) => { if (!done) { done = true; resolve(val); } };
      vid.addEventListener('loadeddata', () => { vid.currentTime = 0.1; });
      vid.addEventListener('seeked', () => {
        const canvas = document.createElement('canvas');
        canvas.width = vid.videoWidth || 720;
        canvas.height = vid.videoHeight || 720;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(vid, 0, 0);
          try { finish(canvas.toDataURL('image/jpeg', 0.8)); return; } catch { /* ignore */ }
        }
        finish(dataUrl);
      });
      setTimeout(() => finish(dataUrl), 4000);
    });

  const addFiles = async (files: File[]) => {
    if (files.length === 0) return;
    const allowMultiple = type === 'post';
    const accepted = files.filter(file => file.type.startsWith('image/') || (type !== 'story' && file.type.startsWith('video/')));
    const slice = allowMultiple ? accepted : accepted.slice(0, 1);
    const newItems: MediaItem[] = [];
    for (const file of slice) {
      const dataUrl = await readFileAsDataUrl(file);
      if (file.type.startsWith('video/')) {
        const thumb = await generateVideoThumbnail(dataUrl);
        newItems.push({ url: dataUrl, type: 'video', thumbnail: thumb });
      } else {
        newItems.push({ url: dataUrl, type: 'image' });
      }
    }
    setMedia(prev => {
      const next = allowMultiple ? [...prev, ...newItems] : newItems;
      setActiveMediaIdx(next.length - 1);
      return next;
    });
  };

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    await addFiles(files);
  };

  const isFileDrag = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes('Files');
  const handleMediaDrop = async (e: React.DragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setIsFileOver(false);
    await addFiles(Array.from(e.dataTransfer.files || []));
  };

  // Paste from clipboard
  useEffect(() => {
    if (!open) return;
    const onPaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const it of Array.from(items)) {
        if (it.kind === 'file' && it.type.startsWith('image/')) {
          const f = it.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length) {
        e.preventDefault();
        await addFiles(files);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, type]);

  const removeMedia = (idx: number) => {
    setMedia(prev => {
      const next = prev.filter((_, i) => i !== idx);
      setActiveMediaIdx(i => Math.max(0, Math.min(i, next.length - 1)));
      return next;
    });
  };

  // Reels/stories only allow a single item — trim when switching types.
  useEffect(() => {
    if (type !== 'post' && media.length > 1) {
      setMedia(prev => prev.slice(0, 1));
      setActiveMediaIdx(0);
    }
  }, [type, media.length]);

  const handleSubmit = () => {
    const accountId = selectedAccountId || activeAccount?.id;
    if (!accountId || media.length === 0) return;
    const createdAt = postedAt ? new Date(postedAt).toISOString() : new Date().toISOString();

    if (type === 'post') {
      // Thumbnails for grid views: image url for images, generated thumb for videos.
      const images = media.map(m => m.type === 'video' ? (m.thumbnail || m.url) : m.url);
      const post: Post = {
        id: uid(),
        accountId,
        images,
        media,
        caption,
        likes,
        baseComments: commentsCount,
        comments: [],
        createdAt,
        isPinned,
      };
      savePost(post);
      if (isPinned) enforcePinLimit(accountId);
    } else if (type === 'reel') {
      const first = media[0];
      const reel: Reel = {
        id: uid(),
        accountId,
        thumbnail: first.type === 'video' ? (first.thumbnail || first.url) : first.url,
        video: first.type === 'video' ? first.url : undefined,
        caption,
        likes,
        baseComments: commentsCount,
        comments: [],
        views,
        createdAt,
        isPinned,
      };
      saveReel(reel);
      if (isPinned) enforceReelPinLimit(accountId);

    } else {
      const first = media[0];
      const story: Story = {
        id: uid(),
        accountId,
        image: first.type === 'video' ? (first.thumbnail || first.url) : first.url,
        createdAt,
        expiresAt: new Date(new Date(createdAt).getTime() + 24 * 60 * 60 * 1000).toISOString(),
      };
      saveStory(story);
    }

    refresh();
    handleClose();
  };

  const typeOptions = [
    { key: 'post' as const, icon: ImageIcon, label: 'Post' },
    { key: 'reel' as const, icon: Film, label: 'Reel' },
    { key: 'story' as const, icon: Clock, label: 'Story' },
  ];

  const activeItem = media[activeMediaIdx];
  const acceptStr = type === 'story' ? 'image/*' : 'image/*,video/*';
  const allowMultiple = type === 'post';


  const aspectOptions: { label: string; value: number | 'original' }[] = [
    { label: 'Original', value: 'original' },
    { label: '1:1', value: 1 },
    { label: '4:3', value: 4 / 3 },
    { label: '16:9', value: 16 / 9 },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent
        className="p-0 bg-card border-border rounded-2xl overflow-hidden max-w-2xl gap-0 [&>button.absolute]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        {/* Header */}
        <div className="relative flex items-center justify-between px-4 py-3 border-b border-border">
          <button
            onClick={handleClose}
            className="p-1.5 rounded-full hover:bg-secondary transition-colors"
            aria-label="Back"
          >
            <ArrowLeft size={20} />
          </button>
          <h2 className="text-base font-semibold">Create new post</h2>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-full hover:bg-secondary transition-colors"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="grid md:grid-cols-2 h-[560px] max-h-[80vh] overflow-hidden">
          {/* Left: media upload — fixed-size canvas so the modal never resizes when switching types */}
          <div
            className={`relative bg-secondary/30 flex flex-col items-center justify-center p-4 gap-3 overflow-hidden transition-colors ${isFileOver ? 'bg-primary/10' : ''}`}
            onDragEnter={(e) => { if (isFileDrag(e)) { e.preventDefault(); setIsFileOver(true); } }}
            onDragOver={(e) => { if (isFileDrag(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setIsFileOver(true); } }}
            onDragLeave={(e) => { if (e.currentTarget === e.target) setIsFileOver(false); }}
            onDrop={handleMediaDrop}
          >
            {isFileOver && (
              <div className="absolute inset-3 z-20 rounded-xl border-2 border-dashed border-primary bg-background/70 backdrop-blur-sm flex flex-col items-center justify-center text-primary pointer-events-none">
                <UploadCloud size={40} />
                <p className="mt-2 text-sm font-semibold">Drop media to add it</p>
              </div>
            )}
            <div className="relative w-full flex-1 flex items-center justify-center overflow-hidden">
              {activeItem ? (
                <div
                  className="relative w-full h-full flex items-center justify-center overflow-hidden rounded-lg select-none"
                  style={previewAspect !== 'original' ? { aspectRatio: String(previewAspect) } : undefined}
                  onPointerDown={onDragStart}
                  onPointerMove={onDragMove}
                  onPointerUp={onDragEnd}
                  onPointerCancel={onDragEnd}
                >
                  {activeItem.type === 'video' ? (
                    <video
                      src={activeItem.url}
                      controls
                      className="w-full h-full"
                      style={{ objectFit, transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`, transition: dragStart.current ? 'none' : 'transform 120ms ease-out' }}
                    />
                  ) : (
                    <img
                      src={activeItem.url}
                      alt=""
                      draggable={false}
                      className={`w-full h-full ${activeItem.type === 'image' ? (dragStart.current ? 'cursor-grabbing' : 'cursor-grab') : ''}`}
                      style={{ objectFit, transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`, transition: dragStart.current ? 'none' : 'transform 120ms ease-out' }}
                    />
                  )}

                  {/* Crop / zoom toolbar overlaid on the image, bottom-left */}
                  {activeItem.type === 'image' && (
                    <div className="absolute bottom-3 left-3 flex items-center gap-2 z-10" onPointerDown={(e) => e.stopPropagation()}>
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            className="w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center backdrop-blur-sm"
                            aria-label="Zoom"
                          >
                            <ZoomIn size={16} />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent side="top" align="start" className="w-56 p-3 bg-popover border-border z-[230]">
                          <div className="flex items-center gap-3">
                            <span className="text-xs w-10">Zoom</span>
                            <Slider value={[zoom]} min={1} max={2} step={0.01} onValueChange={([v]) => setZoom(v)} className="flex-1" />
                            <span className="text-xs w-10 text-right tabular-nums">{Math.round(zoom * 100)}%</span>
                          </div>
                        </PopoverContent>
                      </Popover>
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            className="w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center backdrop-blur-sm"
                            aria-label="Crop"
                          >
                            <Crop size={16} />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent side="top" align="start" className="w-56 p-2 bg-popover border-border z-[230]">
                          <div className="px-2 pt-1 pb-2 text-[10px] uppercase tracking-wide text-muted-foreground">Aspect ratio</div>
                          {aspectOptions.map(opt => (
                            <button
                              key={opt.label}
                              onClick={() => {
                                setPreviewAspect(opt.value);
                                if (opt.value !== 'original') setObjectFit('cover');
                              }}
                              className={`w-full text-left text-xs px-3 py-2 rounded hover:bg-secondary ${previewAspect === opt.value ? 'bg-secondary font-semibold' : ''}`}
                            >
                              {opt.label}
                            </button>
                          ))}
                          <div className="border-t border-border my-1" />
                          <button
                            onClick={() => setObjectFit('contain')}
                            className={`w-full text-left text-xs px-3 py-2 rounded hover:bg-secondary ${objectFit === 'contain' ? 'bg-secondary font-semibold' : ''}`}
                          >
                            Fit content
                          </button>
                          <button
                            onClick={() => setObjectFit('cover')}
                            className={`w-full text-left text-xs px-3 py-2 rounded hover:bg-secondary ${objectFit === 'cover' ? 'bg-secondary font-semibold' : ''}`}
                          >
                            Fill content
                          </button>
                        </PopoverContent>
                      </Popover>
                    </div>
                  )}
                </div>
              ) : (
                <label className="w-full cursor-pointer flex items-center justify-center">
                  <div className="text-center text-muted-foreground">
                    <ImageIcon size={56} className="mx-auto mb-3 opacity-50" />
                    <p className="text-sm font-medium">Click to upload media</p>
                    <p className="text-xs mt-1 opacity-70">
                      {type === 'post' ? 'Photos and videos · select multiple' : type === 'reel' ? 'Video or photo' : 'Photo'}
                    </p>
                    <p className="text-[11px] mt-2 opacity-60">drag files here or paste from clipboard (⌘V)</p>
                  </div>
                  <input
                    type="file"
                    accept={acceptStr}
                    multiple={allowMultiple}
                    className="hidden"
                    onChange={handleFiles}
                  />
                </label>
              )}
            </div>


            {media.length > 0 && (
              <SortableMediaStrip
                media={media}
                activeIdx={activeMediaIdx}
                onActiveChange={setActiveMediaIdx}
                onReorder={(next) => setMedia(next)}
                onRemove={removeMedia}
                onAdd={allowMultiple ? (files) => addFiles(Array.from(files)) : undefined}
                accept={acceptStr}
              />
            )}
          </div>





          {/* Right: form */}
          <div className="p-4 space-y-4 overflow-y-auto">

            {/* Type tabs */}
            <div className="flex gap-1 p-1 bg-secondary rounded-lg">
              {typeOptions.map(({ key, icon: Icon, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setType(key)}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                    type === key ? 'bg-card text-foreground shadow' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Icon size={14} /> {label}
                </button>
              ))}
            </div>

            {/* Account selector */}
            <AccountPicker
              accounts={accounts}
              selectedId={selectedAccountId}
              onSelect={setSelectedAccountId}
            />



            {/* Caption (not for story) */}
            {type !== 'story' && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-muted-foreground">Caption</label>
                  <EmojiPicker onPick={(e) => setCaption(c => c + e)} />
                </div>
                <Textarea
                  placeholder="Write a caption..."
                  value={caption}
                  onChange={e => setCaption(e.target.value)}
                  rows={3}
                />
              </div>
            )}

            {/* Posted at */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Date posted</label>
              <Input
                type="datetime-local"
                value={postedAt}
                onChange={e => setPostedAt(e.target.value)}
              />
            </div>

            {/* Counts */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Likes</label>
                <Input
                  type="number"
                  min={0}
                  placeholder="0"
                  value={likes}
                  onChange={e => setLikes(parseInt(e.target.value) || 0)}
                />
              </div>
              {type === 'story' ? (
                <div />
              ) : (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Comments</label>
                  <Input
                    type="number"
                    min={0}
                    placeholder="0"
                    value={commentsCount}
                    onChange={e => setCommentsCount(parseInt(e.target.value) || 0)}
                  />
                </div>
              )}
              {type === 'reel' && (
                <div className="space-y-1.5 col-span-2">
                  <label className="text-xs font-medium text-muted-foreground">Views</label>
                  <Input
                    type="number"
                    min={0}
                    placeholder="0"
                    value={views}
                    onChange={e => setViews(parseInt(e.target.value) || 0)}
                  />
                </div>
              )}
            </div>

            {(type === 'post' || type === 'reel') && (
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={isPinned} onChange={e => setIsPinned(e.target.checked)} className="rounded" />
                Pin to profile
              </label>
            )}

            <Button onClick={handleSubmit} className="w-full" disabled={media.length === 0 || !selectedAccountId}>
              Share {type}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CreatePostModal;
