import { getPosts, getReels } from '@/lib/store';
import { useMemo, useState } from 'react';
import PostModal from '@/components/PostModal';
import ReelModal from '@/components/ReelModal';
import { Post, Reel } from '@/lib/types';
import { HeartIcon, CommentFilledIcon, CarouselBadgeIcon, ReelBadgeIcon } from '@/components/icons/InstagramIcons';
import { formatCount } from '@/lib/utils';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';

type Cell =
  | { kind: 'post'; post: Post; col: number; row: number; tall?: false }
  | { kind: 'reel'; reel: Reel; col: number; row: number; tall: boolean };

const ExplorePage = () => {
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [selectedReel, setSelectedReel] = useState<Reel | null>(null);

  const { cells, totalRows } = useMemo(() => {
    const posts = [...getPosts()].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const reels = [...getReels()].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const cells: Cell[] = [];
    let pi = 0;
    let ri = 0;
    let block = 0; // each block = 2 rows tall

    // Build blocks until both queues are drained
    while (pi < posts.length || ri < reels.length) {
      const baseRow = block * 2 + 1; // 1-indexed CSS grid rows
      const tallOnRight = block % 2 === 0; // zig-zag
      const tallCol = tallOnRight ? 3 : 1;

      // Place tall reel if available
      if (ri < reels.length) {
        cells.push({ kind: 'reel', reel: reels[ri++], col: tallCol, row: baseRow, tall: true });
      }

      // Fill remaining 4 single cells in the block in reading order, skipping tall slot
      for (let r = 0; r < 2; r++) {
        for (let c = 1; c <= 3; c++) {
          if (ri <= reels.length - 1 || pi < posts.length) {
            // skip cells covered by tall reel
            const coveredByTall =
              cells.some(x => x.tall && x.col === c && (x.row === baseRow + r || x.row + 1 === baseRow + r));
            if (coveredByTall) continue;
            if (pi < posts.length) {
              cells.push({ kind: 'post', post: posts[pi++], col: c, row: baseRow + r });
            } else if (ri < reels.length) {
              cells.push({ kind: 'reel', reel: reels[ri++], col: c, row: baseRow + r, tall: false });
            } else {
              break;
            }
          }
        }
      }

      block++;
      if (block > 5000) break; // safety
    }

    return { cells, totalRows: block * 2 };
  }, []);

  const visible = useInfiniteScroll(cells.length, 9, 9);
  const visibleCells = cells.slice(0, visible.count);
  const visibleRows = visibleCells.reduce((max, c) => {
    const end = c.kind === 'reel' && c.tall ? c.row + 1 : c.row;
    return Math.max(max, end);
  }, 0);

  if (cells.length === 0) {
    return (
      <div className="max-w-5xl mx-auto py-20 text-center text-muted-foreground text-sm">
        No content yet. Create some posts!
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto py-4 px-4">
      <div
        className="grid grid-cols-3"
        style={{
          gap: '2px',
          gridAutoRows: '1fr',
          gridTemplateRows: `repeat(${visibleRows}, minmax(0, 1fr))`,
        }}
      >
        {visibleCells.map((cell, i) => {
          const style: React.CSSProperties = {
            gridColumnStart: cell.col,
            gridRowStart: cell.row,
            gridRowEnd: cell.kind === 'reel' && cell.tall ? cell.row + 2 : cell.row + 1,
          };
          if (cell.kind === 'post') {
            const count = cell.post.media?.length ?? cell.post.images.length;
            const totalComments = (cell.post.baseComments || 0) + cell.post.comments.length;
            return (
              <button
                key={`p-${cell.post.id}-${i}`}
                onClick={() => setSelectedPost(cell.post)}
                className="bg-secondary overflow-hidden relative group aspect-square"
                style={style}
              >
                <img src={cell.post.images[0]} alt="" className="w-full h-full object-cover" />
                {count > 1 && (
                  <span className="absolute top-2 right-2 text-white drop-shadow">
                    <CarouselBadgeIcon size={20} />
                  </span>
                )}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-6 text-white text-sm font-semibold">
                  <span className="flex items-center gap-1.5"><HeartIcon size={18} filled /> {formatCount(cell.post.likes)}</span>
                  <span className="flex items-center gap-1.5"><CommentFilledIcon size={18} /> {formatCount(totalComments)}</span>
                </div>
              </button>
            );
          }
          // reel
          const reelComments = (cell.reel.baseComments || 0) + cell.reel.comments.length;
          return (
            <button
              key={`r-${cell.reel.id}-${i}`}
              onClick={() => setSelectedReel(cell.reel)}
              className="bg-secondary overflow-hidden relative group"
              style={{ ...style, aspectRatio: cell.tall ? '1 / 2' : '1 / 1' }}
            >
              <img src={cell.reel.thumbnail} alt="" className="w-full h-full object-cover" />
              <span className="absolute top-2 right-2 text-white drop-shadow">
                <ReelBadgeIcon size={20} />
              </span>
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-6 text-white text-sm font-semibold">
                <span className="flex items-center gap-1.5"><HeartIcon size={18} filled /> {formatCount(cell.reel.likes)}</span>
                <span className="flex items-center gap-1.5"><CommentFilledIcon size={18} /> {formatCount(reelComments)}</span>
              </div>
            </button>
          );
        })}
      </div>
      {visible.hasMore && <div ref={visible.sentinelRef} className="h-10" />}
      {selectedPost && <PostModal post={selectedPost} onClose={() => setSelectedPost(null)} />}
      {selectedReel && <ReelModal reel={selectedReel} onClose={() => setSelectedReel(null)} />}
    </div>
  );
};

export default ExplorePage;
