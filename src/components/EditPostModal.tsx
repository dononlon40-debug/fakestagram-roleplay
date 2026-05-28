import { useState } from 'react';
import { Post, MediaItem } from '@/lib/types';
import { updatePost, enforcePinLimit } from '@/lib/store';
import { useApp } from '@/contexts/AppContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import EmojiPicker from '@/components/EmojiPicker';
import SortableMediaStrip from '@/components/SortableMediaStrip';
import { Image as ImageIcon, Film } from 'lucide-react';
import { toDateTimeLocalValue } from '@/lib/utils';

interface Props {
  post: Post;
  open: boolean;
  onClose: () => void;
}

const buildInitialMedia = (post: Post): MediaItem[] => {
  if (post.media && post.media.length) return post.media;
  return (post.images || []).map(url => ({ url, type: 'image' as const }));
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

const EditPostModal = ({ post, open, onClose }: Props) => {
  const { refresh } = useApp();
  const [caption, setCaption] = useState(post.caption);
  const [likes, setLikes] = useState(post.likes);
  const [baseComments, setBaseComments] = useState(post.baseComments || 0);
  const [createdAt, setCreatedAt] = useState(toDateTimeLocalValue(post.createdAt));
  const [isPinned, setIsPinned] = useState(post.isPinned);
  const [media, setMedia] = useState<MediaItem[]>(buildInitialMedia(post));
  const [activeIdx, setActiveIdx] = useState(0);

  const addFiles = async (files: File[]) => {
    const newItems: MediaItem[] = [];
    for (const file of files) {
      const dataUrl = await readFileAsDataUrl(file);
      if (file.type.startsWith('video/')) {
        const thumb = await generateVideoThumbnail(dataUrl);
        newItems.push({ url: dataUrl, type: 'video', thumbnail: thumb });
      } else {
        newItems.push({ url: dataUrl, type: 'image' });
      }
    }
    setMedia(prev => {
      const next = [...prev, ...newItems];
      setActiveIdx(next.length - 1);
      return next;
    });
  };

  const removeMedia = (idx: number) => {
    setMedia(prev => {
      const next = prev.filter((_, i) => i !== idx);
      setActiveIdx(i => Math.max(0, Math.min(i, next.length - 1)));
      return next;
    });
  };

  const handleSave = () => {
    const images = media.map(m => m.type === 'video' ? (m.thumbnail || m.url) : m.url);
    updatePost(post.id, {
      caption,
      likes,
      baseComments,
      createdAt: createdAt ? new Date(createdAt).toISOString() : post.createdAt,
      isPinned,
      media: media.length ? media : undefined,
      images,
    });
    if (isPinned) enforcePinLimit(post.accountId);
    refresh();
    onClose();
  };

  const activeItem = media[activeIdx];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader><DialogTitle>Edit post</DialogTitle></DialogHeader>
        <div className="space-y-3 mt-2">
          {/* Media preview */}
          <div className="aspect-square w-full bg-secondary/40 rounded-lg overflow-hidden flex items-center justify-center">
            {activeItem ? (
              activeItem.type === 'video' ? (
                <video src={activeItem.url} controls className="max-w-full max-h-full" />
              ) : (
                <img src={activeItem.url} alt="" className="w-full h-full object-cover" />
              )
            ) : (
              <label className="cursor-pointer text-center text-muted-foreground">
                <ImageIcon size={42} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm">Click to upload media</p>
                <input
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) addFiles(Array.from(e.target.files));
                    e.target.value = '';
                  }}
                />
              </label>
            )}
          </div>

          {media.length > 0 && (
            <SortableMediaStrip
              media={media}
              activeIdx={activeIdx}
              onActiveChange={setActiveIdx}
              onReorder={(next) => setMedia(next)}
              onRemove={removeMedia}
              onAdd={(files) => addFiles(Array.from(files))}
            />
          )}
          {media.length > 1 && (
            <p className="text-[11px] text-muted-foreground -mt-1">Drag thumbnails to reorder</p>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-muted-foreground">Caption</label>
              <EmojiPicker onPick={(e) => setCaption(c => c + e)} />
            </div>
            <Textarea value={caption} onChange={e => setCaption(e.target.value)} rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Likes</label>
              <Input type="number" value={likes} onChange={e => setLikes(parseInt(e.target.value) || 0)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Comments</label>
              <Input type="number" value={baseComments} onChange={e => setBaseComments(parseInt(e.target.value) || 0)} />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Posted time</label>
            <Input type="datetime-local" value={createdAt} onChange={e => setCreatedAt(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isPinned} onChange={e => setIsPinned(e.target.checked)} />
            Pin to profile
          </label>
          <Button className="w-full" onClick={handleSave}>Save changes</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EditPostModal;
