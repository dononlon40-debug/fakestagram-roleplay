/** Subsequence + substring fuzzy match. Empty query matches everything. */
export const fuzzyMatch = (text: string, query: string): boolean => {
  if (!query) return true;
  const t = (text || '').toLowerCase();
  const q = query.toLowerCase();
  if (t.includes(q)) return true;
  let i = 0;
  for (const ch of t) {
    if (ch === q[i]) i++;
    if (i === q.length) return true;
  }
  return false;
};
