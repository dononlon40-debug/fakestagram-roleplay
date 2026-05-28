import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Post, MediaItem } from '@/lib/types';
import { cn } from '@/lib/utils';

interface Props {
  post: Post;
  className?: string;
  mediaClassName?: string;
  /** When true, fit media within container (object-contain) for modals. Else fill (object-cover). */
  contain?: boolean;
  /** Forwarded to root container for things like double-tap-to-like */
  onDoubleClick?: (e: React.MouseEvent) => void;
  /** Forwarded children rendered over the active slide (e.g. heart pop) */
  overlay?: React.ReactNode;
}

const itemsForPost = (post: Post): MediaItem[] => {
  if (post.media && post.media.length > 0) return post.media;
  return (post.images || []).map(url => ({ url, type: 'image' as const }));
};

const PostCarousel = ({ post, className, mediaClassName, contain, onDoubleClick, overlay }: Props) => {
  const items = itemsForPost(post);
  const [idx, setIdx] = useState(0);

  useEffect(() => { setIdx(0); }, [post.id]);

  if (items.length === 0) return null;

  const go = (delta: number) => (e: React.MouseEvent) => {
    e.stopPropagation();
    setIdx(i => Math.max(0, Math.min(items.length - 1, i + delta)));
  };

  const fit = contain ? 'object-contain' : 'object-cover';

  return (
    <div
      className={cn('relative w-full select-none', className)}
      onDoubleClick={onDoubleClick}
    >
      <div className="w-full h-full overflow-hidden">
        <div
          className="flex h-full w-full transition-transform duration-300 ease-out"
          style={{ transform: `translateX(-${idx * 100}%)` }}
        >
          {items.map((m, i) => (
            <div key={i} className="w-full h-full flex-shrink-0 flex items-center justify-center bg-black">
              {m.type === 'video' ? (
                <video
                  src={m.url}
                  poster={m.thumbnail}
                  controls
                  playsInline
                  className={cn('w-full h-full', fit, mediaClassName)}
                />
              ) : (
                <img
                  src={m.url}
                  alt=""
                  draggable={false}
                  className={cn('w-full h-full', fit, mediaClassName)}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {items.length > 1 && (
        <>
          {idx > 0 && (
            <button
              type="button"
              onClick={go(-1)}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-background/80 text-foreground flex items-center justify-center shadow hover:bg-background"
              aria-label="Previous"
            >
              <ChevronLeft size={18} />
            </button>
          )}
          {idx < items.length - 1 && (
            <button
              type="button"
              onClick={go(1)}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-background/80 text-foreground flex items-center justify-center shadow hover:bg-background"
              aria-label="Next"
            >
              <ChevronRight size={18} />
            </button>
          )}
          <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-black/60 text-white text-[11px] font-medium">
            {idx + 1}/{items.length}
          </div>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
            {items.map((_, i) => (
              <span
                key={i}
                className={cn(
                  'w-1.5 h-1.5 rounded-full transition-colors',
                  i === idx ? 'bg-primary' : 'bg-white/60'
                )}
              />
            ))}
          </div>
        </>
      )}

      {overlay}
    </div>
  );
};

export default PostCarousel;
