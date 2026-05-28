import { useState } from 'react';
import { Reel } from '@/lib/types';
import { enforceReelPinLimit, updateReel } from '@/lib/store';
import { useApp } from '@/contexts/AppContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import EmojiPicker from '@/components/EmojiPicker';
import { Film, UploadCloud } from 'lucide-react';
import { toDateTimeLocalValue } from '@/lib/utils';

interface Props {
  reel: Reel;
  open: boolean;
  onClose: () => void;
}

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
      canvas.height = vid.videoHeight || 1280;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(vid, 0, 0);
        try { finish(canvas.toDataURL('image/jpeg', 0.8)); return; } catch { /* ignore */ }
      }
      finish(dataUrl);
    });
    setTimeout(() => finish(dataUrl), 4000);
  });

const EditReelModal = ({ reel, open, onClose }: Props) => {
  const { refresh } = useApp();
  const [caption, setCaption] = useState(reel.caption);
  const [likes, setLikes] = useState(reel.likes);
  const [views, setViews] = useState(reel.views);
  const [baseComments, setBaseComments] = useState(reel.baseComments || 0);
  const [createdAt, setCreatedAt] = useState(toDateTimeLocalValue(reel.createdAt));
  const [isPinned, setIsPinned] = useState(!!reel.isPinned);
  const [video, setVideo] = useState(reel.video || '');
  const [thumbnail, setThumbnail] = useState(reel.thumbnail);
  const [isOver, setIsOver] = useState(false);

  const addFile = async (file: File) => {
    const dataUrl = await readFileAsDataUrl(file);
    if (file.type.startsWith('video/')) {
      setVideo(dataUrl);
      setThumbnail(await generateVideoThumbnail(dataUrl));
    } else if (file.type.startsWith('image/')) {
      setThumbnail(dataUrl);
    }
  };

  const handleSave = () => {
    updateReel(reel.id, {
      caption,
      likes,
      views,
      baseComments,
      isPinned,
      video: video || undefined,
      thumbnail,
      createdAt: createdAt ? new Date(createdAt).toISOString() : reel.createdAt,
    });
    if (isPinned) enforceReelPinLimit(reel.accountId);
    refresh();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader><DialogTitle>Edit reel</DialogTitle></DialogHeader>
        <div className="space-y-3 mt-2">
          <label
            onDragOver={(e) => { e.preventDefault(); setIsOver(true); }}
            onDragLeave={() => setIsOver(false)}
            onDrop={(e) => { e.preventDefault(); setIsOver(false); const file = e.dataTransfer.files?.[0]; if (file) addFile(file); }}
            className={`relative aspect-[9/16] max-h-[420px] w-full mx-auto bg-secondary/40 rounded-lg overflow-hidden flex items-center justify-center cursor-pointer border-2 border-dashed transition-colors ${isOver ? 'border-primary bg-primary/10' : 'border-transparent'}`}
          >
            {video ? <video src={video} poster={thumbnail} controls className="h-full w-full object-contain" /> : thumbnail ? <img src={thumbnail} alt="" className="h-full w-full object-cover" /> : <Film size={42} className="text-muted-foreground" />}
            {isOver && <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center gap-2 text-primary"><UploadCloud size={34} /><span className="text-sm font-semibold">Drop media</span></div>}
            <input type="file" accept="image/*,video/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) addFile(file); e.target.value = ''; }} />
          </label>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-muted-foreground">Caption</label>
              <EmojiPicker onPick={(e) => setCaption(c => c + e)} />
            </div>
            <Textarea value={caption} onChange={e => setCaption(e.target.value)} rows={3} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="text-xs text-muted-foreground mb-1 block">Likes</label><Input type="number" value={likes} onChange={e => setLikes(parseInt(e.target.value) || 0)} /></div>
            <div><label className="text-xs text-muted-foreground mb-1 block">Comments</label><Input type="number" value={baseComments} onChange={e => setBaseComments(parseInt(e.target.value) || 0)} /></div>
            <div><label className="text-xs text-muted-foreground mb-1 block">Views</label><Input type="number" value={views} onChange={e => setViews(parseInt(e.target.value) || 0)} /></div>
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

export default EditReelModal;