import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/contexts/AppContext';
import { savePost, saveReel, saveStory, uid, getAccounts } from '@/lib/store';
import { Post, Story, Reel } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Image, Film, Clock, UploadCloud } from 'lucide-react';
import ImageCropper from '@/components/ImageCropper';

const CreatePage = () => {
  const { activeAccount, accounts, refresh } = useApp();
  const navigate = useNavigate();
  const [type, setType] = useState<'post' | 'reel' | 'story'>('post');
  const [image, setImage] = useState('');
  const [isFileOver, setIsFileOver] = useState(false);
  const [cropImage, setCropImage] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [likes, setLikes] = useState(0);
  const [views, setViews] = useState(0);
  const [selectedAccountId, setSelectedAccountId] = useState(activeAccount?.id || '');
  useEffect(() => { if (activeAccount?.id) setSelectedAccountId(activeAccount.id); }, [activeAccount?.id]);
  const [isPinned, setIsPinned] = useState(false);

  const handleFile = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      if (type === 'story') {
        setCropImage(result);
      } else {
        setImage(result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFile(e.target.files?.[0]);
    e.target.value = '';
  };

  const handleSubmit = () => {
    const accountId = selectedAccountId || activeAccount?.id;
    if (!accountId || !image) return;

    if (type === 'post') {
      const post: Post = {
        id: uid(),
        accountId,
        images: [image],
        caption,
        likes,
        comments: [],
        createdAt: new Date().toISOString(),
        isPinned,
      };
      savePost(post);
    } else if (type === 'reel') {
      const reel: Reel = {
        id: uid(),
        accountId,
        thumbnail: image,
        caption,
        likes,
        comments: [],
        views,
        createdAt: new Date().toISOString(),
      };
      saveReel(reel);
    } else {
      const story: Story = {
        id: uid(),
        accountId,
        image,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };
      saveStory(story);
    }

    refresh();
    navigate(`/profile/${accountId}`);
  };

  return (
    <div className="max-w-lg mx-auto py-8 px-4">
      <h1 className="text-xl font-bold mb-6">Create new content</h1>

      <div className="flex gap-2 mb-6">
        {[
          { key: 'post' as const, icon: Image, label: 'Post' },
          { key: 'reel' as const, icon: Film, label: 'Reel' },
          { key: 'story' as const, icon: Clock, label: 'Story' },
        ].map(({ key, icon: Icon, label }) => (
          <Button
            key={key}
            variant={type === key ? 'default' : 'secondary'}
            onClick={() => setType(key)}
            className="gap-2 flex-1"
          >
            <Icon size={16} /> {label}
          </Button>
        ))}
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-sm text-muted-foreground mb-1 block">Post as:</label>
          <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
            <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
            <SelectContent>
              {accounts.map(a => (
                <SelectItem key={a.id} value={a.id}>{a.username}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="block w-full cursor-pointer">
            <div
              className={`${type === 'story' ? 'aspect-[9/16]' : 'aspect-square'} rounded-lg border-2 border-dashed flex items-center justify-center overflow-hidden transition-colors ${isFileOver ? 'border-primary bg-primary/10' : image ? 'border-border' : 'border-border hover:border-primary/50'}`}
              onDragEnter={(e) => { if (Array.from(e.dataTransfer.types).includes('Files')) { e.preventDefault(); setIsFileOver(true); } }}
              onDragOver={(e) => { if (Array.from(e.dataTransfer.types).includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setIsFileOver(true); } }}
              onDragLeave={() => setIsFileOver(false)}
              onDrop={(e) => { e.preventDefault(); setIsFileOver(false); handleFile(e.dataTransfer.files?.[0]); }}
            >
              {image ? (
                <img src={image} alt="" className="w-full h-full object-cover" />
              ) : isFileOver ? (
                <div className="text-center text-primary">
                  <UploadCloud size={48} className="mx-auto mb-2" />
                  <p className="text-sm font-semibold">Drop media here</p>
                </div>
              ) : (
                <div className="text-center text-muted-foreground">
                  <Image size={48} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Click to upload image</p>
                </div>
              )}
            </div>
            <input type="file" accept="image/*" className="hidden" onChange={handleImage} />
          </label>
          {type === 'story' && image && (
            <Button variant="secondary" size="sm" className="w-full" onClick={() => setCropImage(image)}>
              Edit photo
            </Button>
          )}
        </div>

        {type !== 'story' && (
          <Textarea placeholder="Write a caption..." value={caption} onChange={e => setCaption(e.target.value)} rows={3} />
        )}

        <div className="grid grid-cols-2 gap-3">
          <Input type="number" placeholder="Likes" value={likes} onChange={e => setLikes(parseInt(e.target.value) || 0)} />
          {type === 'reel' && (
            <Input type="number" placeholder="Views" value={views} onChange={e => setViews(parseInt(e.target.value) || 0)} />
          )}
        </div>

        {type === 'post' && (
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={isPinned} onChange={e => setIsPinned(e.target.checked)} className="rounded" />
            Pin to profile
          </label>
        )}

        <Button onClick={handleSubmit} className="w-full" disabled={!image || !selectedAccountId}>
          Share {type}
        </Button>
      </div>

      {cropImage && (
        <ImageCropper
          image={cropImage}
          aspectRatio={9 / 16}
          cropShape="rect"
          onCropDone={(cropped) => { setImage(cropped); setCropImage(null); }}
          onCancel={() => setCropImage(null)}
        />
      )}
    </div>
  );
};

export default CreatePage;
