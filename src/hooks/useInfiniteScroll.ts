import { useEffect, useRef, useState } from 'react';

/**
 * Lazy-render large lists with an IntersectionObserver sentinel.
 * Returns the visible count, a ref to attach to a sentinel div placed at the
 * end of the rendered list, and a hasMore flag.
 */
export function useInfiniteScroll(total: number, initial = 10, step = 10) {
  const [count, setCount] = useState(Math.min(initial, total));
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Reset when the list shrinks below current count (e.g., user switched profile).
  useEffect(() => {
    setCount(c => Math.min(Math.max(c, initial), total));
  }, [total, initial]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) {
          setCount(c => Math.min(c + step, total));
        }
      },
      { rootMargin: '800px 0px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [step, total, count]);

  return {
    count: Math.min(count, total),
    sentinelRef,
    hasMore: count < total,
  };
}
