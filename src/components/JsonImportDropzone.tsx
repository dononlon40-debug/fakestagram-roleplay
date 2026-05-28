import { useState, useRef } from 'react';
import { Upload, FileJson, CheckCircle2, AlertCircle } from 'lucide-react';
import { Account, Post, Reel, MediaItem } from '@/lib/types';
import { saveAccount, savePost, saveReel, uid, setMainAccountId, getMainAccountId } from '@/lib/store';
import { useApp } from '@/contexts/AppContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

// Accepted JSON shapes:
// 1. { username, fullName?, biography?, profilePicUrl?, followersCount?, followsCount?, externalUrl?, latestPosts?: [...] }
// 2. An array of posts (then we require user to set username separately — rejected here with error).
// 3. { profile: {...}, posts: [...] }
//
// Post fields supported (mapped from common scraper formats):
//   - displayUrl OR imageUrl OR url -> primary image
//   - caption
//   - likesCount OR likes
//   - commentsCount OR comments
//   - timestamp OR takenAt OR createdAt
//   - type: 'Image' | 'Sidecar' | 'Video'
//   - childPosts OR sidecarMedia OR images -> additional media for Sidecar
//   - videoUrl (when type Video)

interface ParsedProfile {
  username: string;
  displayName?: string;
  bio?: string;
  profilePicture?: string;
  website?: string;
  followers?: number;
  following?: number;
}

interface ParsedPost {
  media: MediaItem[];
  caption: string;
  likes: number;
  comments: number;
  createdAt: string;
}

interface ParsedReel {
  thumbnail: string;
  video?: string;
  caption: string;
  likes: number;
  comments: number;
  views: number;
  createdAt: string;
}

interface ParsedResult {
  profile: ParsedProfile;
  posts: ParsedPost[];
  reels: ParsedReel[];
}

const pickPostUrl = (item: any): { url: string; type: 'image' | 'video'; thumbnail?: string } | null => {
  const videoUrl = item.videoUrl || item.video;
  const displayUrl = item.displayUrl || item.imageUrl || item.image || item.thumbnailUrl;
  if (videoUrl && (item.type?.toLowerCase?.() === 'video' || /\.mp4($|\?)/i.test(videoUrl))) {
    return { url: videoUrl, type: 'video', thumbnail: displayUrl || undefined };
  }
  const url = displayUrl || item.url || item.src;
  if (!url) return null;
  return { url, type: 'image' };
};

const repairJsonText = (text: string): string => {
  let t = text;
  // Fix keys with no value: `"foo":\n}` or `"foo":,` -> `"foo": null`
  t = t.replace(/("[^"\\]*"\s*:)(\s*)([,}\]])/g, '$1 null$2$3');
  // Fix top-level concatenated objects `}\n{` -> wrap as JSON array
  const trimmed = t.trim();
  if (trimmed.startsWith('{') && /}\s*\{/.test(trimmed)) {
    t = '[' + trimmed.replace(/}\s*\{/g, '},{') + ']';
  }
  return t;
};

const looksLikeProfile = (o: any): boolean =>
  !!o && typeof o === 'object' && !Array.isArray(o) && (
    'username' in o || 'usernme' in o || 'fullName' in o ||
    'followersCount' in o || 'profilePicUrl' in o || 'biography' in o
  ) && !('displayUrl' in o);

const looksLikePost = (o: any): boolean =>
  !!o && typeof o === 'object' && !Array.isArray(o) && (
    'displayUrl' in o || 'imageUrl' in o || 'videoUrl' in o
  );

const parseJson = (raw: any): ParsedResult => {
  let root: any = raw;
  if (root?.profile && root?.posts) {
    root = { ...root.profile, latestPosts: root.posts };
  }

  let profileSrc: any = null;
  let rawPosts: any[] = [];

  if (Array.isArray(root)) {
    const first = root[0];
    if (looksLikeProfile(first)) {
      profileSrc = first;
      rawPosts = root.slice(1).filter(looksLikePost);
    } else {
      const sample = root.find(looksLikePost);
      if (!sample) throw new Error('Could not find a profile or any posts in the JSON.');
      const owner = sample.ownerUsername || sample.username;
      if (!owner) throw new Error('Array of posts has no profile object and no "ownerUsername" to infer from.');
      profileSrc = { username: owner };
      rawPosts = root.filter(looksLikePost);
    }
  } else if (root && typeof root === 'object') {
    profileSrc = root;
    rawPosts = Array.isArray(root.latestPosts) ? root.latestPosts
      : Array.isArray(root.posts) ? root.posts : [];
  } else {
    throw new Error('Invalid JSON structure.');
  }

  const username = (
    profileSrc.username || profileSrc.usernme || profileSrc.handle || profileSrc.ownerUsername || ''
  ).toString().trim();
  if (!username) throw new Error('No username found (looked for username, usernme, handle, ownerUsername).');

  const profile: ParsedProfile = {
    username: username.toLowerCase().replace(/\s/g, ''),
    displayName: profileSrc.fullName || profileSrc.displayName || profileSrc.name || username,
    bio: profileSrc.biography || profileSrc.bio || '',
    profilePicture: profileSrc.profilePicUrl || profileSrc.profilePicture || profileSrc.avatar || '',
    website: profileSrc.externalUrl || profileSrc.externalURL || profileSrc.website || '',
    followers: Number(profileSrc.followersCount ?? profileSrc.followers ?? 0) || 0,
    following: Number(profileSrc.followsCount ?? profileSrc.followingCount ?? profileSrc.following ?? 0) || 0,
  };


  const posts: ParsedPost[] = [];
  const reels: ParsedReel[] = [];

  for (const p of rawPosts) {
    const t = (p.type || '').toString().toLowerCase();
    const caption = (p.caption || '').toString();
    const likes = Number(p.likesCount ?? p.likes ?? 0) || 0;
    const comments = Number(p.commentsCount ?? p.comments ?? 0) || 0;
    const createdAt = (p.timestamp || p.takenAt || p.createdAt || new Date().toISOString()).toString();

    // Single video post -> Reel
    if (t === 'video' && (p.videoUrl || p.video)) {
      const videoUrl = (p.videoUrl || p.video).toString();
      const thumb = (p.displayUrl || p.imageUrl || p.thumbnailUrl || p.image || '').toString();
      reels.push({
        thumbnail: thumb || videoUrl,
        video: videoUrl,
        caption,
        likes,
        comments,
        views: Number(p.videoViewCount ?? p.videoPlayCount ?? p.views ?? 0) || 0,
        createdAt,
      });
      continue;
    }

    const media: MediaItem[] = [];
    if (t === 'sidecar' || Array.isArray(p.childPosts) || Array.isArray(p.sidecarMedia) || Array.isArray(p.images)) {
      const children: any[] = p.childPosts || p.sidecarMedia || p.images || [];
      for (const child of children) {
        const picked = typeof child === 'string' ? { url: child, type: 'image' as const } : pickPostUrl(child);
        if (picked) media.push({ url: picked.url, type: picked.type, ...(picked.thumbnail ? { thumbnail: picked.thumbnail } : {}) });
      }
      if (media.length === 0) {
        const picked = pickPostUrl(p);
        if (picked) media.push({ url: picked.url, type: picked.type, ...(picked.thumbnail ? { thumbnail: picked.thumbnail } : {}) });
      }
    } else {
      const picked = pickPostUrl(p);
      if (picked) media.push({ url: picked.url, type: picked.type, ...(picked.thumbnail ? { thumbnail: picked.thumbnail } : {}) });
    }

    if (media.length === 0) continue;
    posts.push({ media, caption, likes, comments, createdAt });
  }

  return { profile, posts, reels };
};

interface Props {
  onImported?: () => void;
}

const JsonImportDropzone = ({ onImported }: Props) => {
  const { switchAccount, refresh } = useApp();
  const navigate = useNavigate();
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'downloading' | 'success'>('idle');
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchAsDataUrl = async (url: string): Promise<string> => {
    if (!url || url.startsWith('data:')) return url;

    const toDataUrl = async (fetchUrl: string) => {
      const res = await fetch(fetchUrl, { mode: 'cors', referrerPolicy: 'no-referrer' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      if (!blob.type.startsWith('image/') && !blob.type.startsWith('video/') && blob.type !== 'application/octet-stream') {
        throw new Error(`Unexpected MIME ${blob.type}`);
      }
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
    };

    // 1. Try direct fetch
    try {
      return await toDataUrl(url);
    } catch (e) {
      // 2. Fall back to images.weserv.nl CORS-friendly proxy (strips protocol)
      try {
        const stripped = url.replace(/^https?:\/\//, '');
        const proxied = `https://images.weserv.nl/?url=${encodeURIComponent(stripped)}`;
        return await toDataUrl(proxied);
      } catch (e2) {
        console.warn('Image fetch failed via direct and proxy, keeping remote URL:', url, e2);
        return url;
      }
    }
  };


  const handleFile = async (file: File) => {
    setError(null);
    setStatus('loading');
    try {
      const text = await file.text();
      let raw: any;
      try {
        raw = JSON.parse(text);
      } catch {
        // Attempt to repair common Apify quirks (missing values, concatenated objects)
        raw = JSON.parse(repairJsonText(text));
      }
      const { profile, posts, reels } = parseJson(raw);

      // Count total downloads (profile pic + post media (incl. video thumbnails) + reel videos + reel thumbnails)
      const postMediaCount = posts.reduce(
        (sum, p) => sum + p.media.reduce((s, m) => s + 1 + (m.thumbnail ? 1 : 0), 0),
        0,
      );
      const reelDownloadCount = reels.reduce(
        (sum, r) => sum + (r.video ? 1 : 0) + (r.thumbnail ? 1 : 0),
        0,
      );
      const totalImages = (profile.profilePicture ? 1 : 0) + postMediaCount + reelDownloadCount;
      setStatus('downloading');
      setProgress({ done: 0, total: totalImages });
      let done = 0;
      const tick = () => { done += 1; setProgress({ done, total: totalImages }); };

      // Download profile picture
      const localProfilePic = profile.profilePicture
        ? await fetchAsDataUrl(profile.profilePicture).then(u => { tick(); return u; })
        : '';

      const account: Account = {
        id: uid(),
        username: profile.username,
        displayName: profile.displayName || profile.username,
        bio: profile.bio || '',
        profilePicture: localProfilePic,
        website: profile.website || '',
        followers: profile.followers || 0,
        following: profile.following || 0,
        isPrivate: false,
        createdAt: new Date().toISOString(),
      };
      saveAccount(account);
      if (!getMainAccountId()) setMainAccountId(account.id);

      // Download post media sequentially to avoid overwhelming the browser
      let quotaWarned = false;
      for (const p of posts) {
        const localMedia: MediaItem[] = [];
        for (const m of p.media) {
          const localUrl = await fetchAsDataUrl(m.url);
          tick();
          let localThumb: string | undefined;
          if (m.thumbnail) {
            localThumb = await fetchAsDataUrl(m.thumbnail);
            tick();
          }
          localMedia.push({ ...m, url: localUrl, ...(localThumb ? { thumbnail: localThumb } : {}) });
        }
        const post: Post = {
          id: uid(),
          accountId: account.id,
          images: localMedia.map(m => m.type === 'video' ? (m.thumbnail || m.url) : m.url),
          media: localMedia,
          caption: p.caption,
          likes: p.likes,
          baseComments: p.comments,
          comments: [],
          createdAt: p.createdAt,
          isPinned: false,
        };
        try {
          savePost(post);
        } catch (storageErr) {
          if (!quotaWarned) {
            quotaWarned = true;
            toast.warning('Local storage is full — remaining posts will use remote image URLs.');
          }
          const fallbackMedia = p.media;
          savePost({
            ...post,
            images: fallbackMedia.map(m => m.type === 'video' ? (m.thumbnail || m.url) : m.url),
            media: fallbackMedia,
          });
        }
      }

      // Import reels (single-video posts)
      for (const r of reels) {
        const localVideo = r.video ? await fetchAsDataUrl(r.video) : '';
        if (r.video) tick();
        const localThumb = r.thumbnail ? await fetchAsDataUrl(r.thumbnail) : '';
        if (r.thumbnail) tick();
        const reel: Reel = {
          id: uid(),
          accountId: account.id,
          thumbnail: localThumb || r.thumbnail,
          video: localVideo || r.video,
          caption: r.caption,
          likes: r.likes,
          baseComments: r.comments,
          comments: [],
          views: r.views,
          createdAt: r.createdAt,
          isPinned: false,
        };
        try {
          saveReel(reel);
        } catch {
          if (!quotaWarned) {
            quotaWarned = true;
            toast.warning('Local storage is full — remaining reels will use remote URLs.');
          }
          saveReel({ ...reel, thumbnail: r.thumbnail, video: r.video });
        }
      }

      switchAccount(account.id);
      refresh();
      setStatus('success');
      toast.success(`Imported @${account.username} (${posts.length} posts, ${reels.length} reels)`);
      onImported?.();
      setTimeout(() => navigate('/'), 600);
    } catch (e: any) {
      console.error('JSON import failed', e);
      setError(e?.message || 'Failed to parse JSON.');
      setStatus('idle');
    }
  };


  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.json') && file.type !== 'application/json') {
      setError('Please drop a .json file.');
      return;
    }
    handleFile(file);
  };

  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
        <FileJson size={12} /> Import from JSON (optional)
      </label>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        className={`relative rounded-lg border-2 border-dashed p-4 text-center cursor-pointer transition-colors ${
          isDragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = '';
          }}
        />
        {status === 'success' ? (
          <div className="flex flex-col items-center text-primary gap-1">
            <CheckCircle2 size={28} />
            <p className="text-sm font-semibold">Success! Taking you to the feed…</p>
          </div>
        ) : status === 'loading' ? (
          <p className="text-sm text-muted-foreground">Parsing…</p>
        ) : status === 'downloading' ? (
          <div className="space-y-1.5">
            <p className="text-sm text-muted-foreground">
              Downloading images locally… {progress.done}/{progress.total}
            </p>
            <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1 text-muted-foreground">
            <Upload size={22} />
            <p className="text-xs"><span className="text-foreground font-medium">Drop a .json file</span> or click to browse</p>
            <p className="text-[10px] opacity-70">Stored locally only — never uploaded.</p>
          </div>
        )}
      </div>
      {error && (
        <p className="flex items-start gap-1 text-xs text-destructive">
          <AlertCircle size={12} className="mt-0.5 flex-shrink-0" /> {error}
        </p>
      )}
    </div>
  );
};

export default JsonImportDropzone;
