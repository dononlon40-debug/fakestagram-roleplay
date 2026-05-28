import { Account, AccountFolder, Post, Story, StoryHighlight, Reel, DirectMessage, Conversation } from './types';
import { get as idbGet, set as idbSet, del as idbDel, keys as idbKeys } from 'idb-keyval';

// In-memory cache hydrated from IndexedDB at startup.
// Reads are synchronous; writes are mirrored to IDB asynchronously.
// This lets us persist arbitrarily large media (videos, multiple highlight images)
// without the localStorage 5MB quota limit.
const cache = new Map<string, unknown>();
let hydrated = false;

export const hydrate = async (): Promise<void> => {
  if (hydrated) return;
  try {
    let allKeys = (await idbKeys()).map(String);

    // One-time migration from localStorage (legacy data).
    if (allKeys.length === 0 && typeof localStorage !== 'undefined') {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith('ig_')) continue;
        const raw = localStorage.getItem(k);
        if (raw == null) continue;
        let val: unknown = raw;
        try { val = JSON.parse(raw); } catch { /* keep raw string */ }
        await idbSet(k, val);
      }
      allKeys = (await idbKeys()).map(String);
    }

    for (const k of allKeys) {
      const v = await idbGet(k);
      cache.set(k, v);
    }
  } catch (e) {
    console.error('Storage hydrate failed', e);
  }
  hydrated = true;
};

const get = <T>(key: string, fallback: T): T => {
  const v = cache.get(key);
  return v === undefined || v === null ? fallback : (v as T);
};

const set = (key: string, value: unknown) => {
  cache.set(key, value);
  idbSet(key, value).catch(e => console.warn('idb set failed', key, e));
};

const del = (key: string) => {
  cache.delete(key);
  idbDel(key).catch(() => {});
};

export const uid = () => crypto.randomUUID();

type ImportProgress = { loaded: number; total: number; label: string };

// ---------- Session snapshots ----------
// A "session" is a complete dump of every ig_* key. Built as a sequence of
// Blob parts instead of one giant string to avoid `RangeError: Invalid
// string length` on sessions with heavy media.
const pushJsonString = (parts: BlobPart[], value: string) => {
  parts.push('"');
  const chunkSize = 64 * 1024;
  for (let i = 0; i < value.length; i += chunkSize) {
    parts.push(JSON.stringify(value.slice(i, i + chunkSize)).slice(1, -1));
  }
  parts.push('"');
};

const pushJsonValue = (parts: BlobPart[], value: unknown, seen = new WeakSet<object>()) => {
  if (value === null || value === undefined) { parts.push('null'); return; }
  if (typeof value === 'string') { pushJsonString(parts, value); return; }
  if (typeof value === 'number') { parts.push(Number.isFinite(value) ? String(value) : 'null'); return; }
  if (typeof value === 'boolean') { parts.push(value ? 'true' : 'false'); return; }
  if (typeof value === 'bigint') { pushJsonString(parts, value.toString()); return; }
  if (typeof value !== 'object') { parts.push('null'); return; }
  if (seen.has(value)) throw new Error('Cannot export circular data');
  seen.add(value);
  if (Array.isArray(value)) {
    parts.push('[');
    value.forEach((item, i) => {
      if (i > 0) parts.push(',');
      pushJsonValue(parts, item, seen);
    });
    parts.push(']');
  } else {
    parts.push('{');
    let first = true;
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (typeof val === 'undefined' || typeof val === 'function' || typeof val === 'symbol') continue;
      if (!first) parts.push(',');
      first = false;
      pushJsonString(parts, key);
      parts.push(':');
      pushJsonValue(parts, val, seen);
    }
    parts.push('}');
  }
  seen.delete(value);
};

export const exportSessionBlob = (): Blob => {
  const parts: BlobPart[] = [];
  parts.push(`{"version":2,"exportedAt":${JSON.stringify(new Date().toISOString())},"data":{`);
  let first = true;
  for (const [k, v] of cache.entries()) {
    if (typeof k !== 'string' || !k.startsWith('ig_')) continue;
    if (!first) parts.push(',');
    first = false;
    try {
      pushJsonString(parts, k);
      parts.push(':');
      pushJsonValue(parts, v);
    } catch (e) {
      console.warn('skipping unserializable key', k, e);
    }
  }
  parts.push('},"complete":true}');
  return new Blob(parts, { type: 'application/json' });
};

const applyImportedSessionData = async (data: Map<string, unknown> | Record<string, unknown>, mode: 'replace' | 'merge') => {
  const entries = data instanceof Map ? [...data.entries()] : Object.entries(data);
  if (!entries.some(([k]) => k.startsWith('ig_'))) throw new Error('This is not a Fakestagram session export.');
  if (mode === 'replace') {
    const oldKeys = [...cache.keys()].filter(k => typeof k === 'string' && k.startsWith('ig_'));
    for (const k of oldKeys) {
      cache.delete(k);
      await idbDel(k).catch(() => {});
    }
  }
  for (const [k, v] of entries) {
    if (!k.startsWith('ig_')) continue;
    cache.set(k, v);
    await idbSet(k, v).catch(() => {});
  }
  const importedAccounts = (data instanceof Map ? data.get('ig_accounts') : data.ig_accounts) as Account[] | undefined;
  if (Array.isArray(importedAccounts) && importedAccounts.length > 0) {
    if (!cache.get('ig_main_account')) await idbSet('ig_main_account', importedAccounts[0].id).then(() => cache.set('ig_main_account', importedAccounts[0].id)).catch(() => {});
    if (!cache.get('ig_active_account')) await idbSet('ig_active_account', importedAccounts[0].id).then(() => cache.set('ig_active_account', importedAccounts[0].id)).catch(() => {});
  }
};

export const importSession = async (json: string, mode: 'replace' | 'merge' = 'replace'): Promise<void> => {
  const trimmed = json.replace(/^\uFEFF/, '').trim();
  if (!trimmed) throw new Error('Session file is empty. Please choose a Fakestagram session export file.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    const message = (err as Error).message || '';
    if (/end of JSON input/i.test(message)) {
      throw new Error('Session file is incomplete or truncated. Please export the session again and import the newly saved .json file.');
    }
    throw err;
  }
  if (parsed && typeof parsed === 'object' && 'complete' in parsed && (parsed as { complete?: boolean }).complete !== true) {
    throw new Error('Session file did not finish exporting. Please export the session again.');
  }
  const parsedRecord = parsed as Record<string, unknown>;
  const data: Record<string, unknown> = (parsedRecord?.data && typeof parsedRecord.data === 'object')
    ? parsedRecord.data as Record<string, unknown>
    : parsedRecord;
  if (!data || typeof data !== 'object') throw new Error('Invalid session file');
  await applyImportedSessionData(data, mode);
};

class StreamJsonReader {
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private decoder = new TextDecoder();
  private buffer = '';
  private pos = 0;
  private done = false;
  private loaded = 0;

  constructor(private file: File, private onProgress?: (progress: ImportProgress) => void) {
    this.reader = file.stream().getReader();
  }

  private async fill() {
    while (this.pos >= this.buffer.length && !this.done) {
      if (this.pos > 0) { this.buffer = this.buffer.slice(this.pos); this.pos = 0; }
      const result = await this.reader.read();
      if (result.done) {
        this.done = true;
        this.buffer += this.decoder.decode();
      } else {
        this.loaded += result.value.byteLength;
        this.buffer += this.decoder.decode(result.value, { stream: true });
        this.onProgress?.({ loaded: this.loaded, total: this.file.size, label: 'Reading session file' });
      }
    }
  }

  async peek(): Promise<string | null> {
    await this.fill();
    return this.pos < this.buffer.length ? this.buffer[this.pos] : null;
  }

  async next(): Promise<string> {
    const ch = await this.peek();
    if (ch === null) throw new Error('Session file is incomplete or truncated. Please export the session again.');
    this.pos += 1;
    if (this.pos > 1024 * 1024) { this.buffer = this.buffer.slice(this.pos); this.pos = 0; }
    return ch;
  }

  async skipWhitespace() {
    while (/\s/.test(await this.peek() || '')) this.pos += 1;
  }

  async expect(expected: string) {
    await this.skipWhitespace();
    const ch = await this.next();
    if (ch !== expected) throw new Error(`Invalid session file. Expected "${expected}".`);
  }

  async readString(): Promise<string> {
    const raw = await this.readStringRaw();
    return JSON.parse(raw) as string;
  }

  async readStringRaw(): Promise<string> {
    await this.skipWhitespace();
    let raw = await this.next();
    if (raw !== '"') throw new Error('Invalid session file. Expected a JSON string.');
    let escaped = false;
    while (true) {
      const ch = await this.next();
      raw += ch;
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === '"') return raw;
    }
  }

  async readJsonRawValue(): Promise<string> {
    await this.skipWhitespace();
    const first = await this.peek();
    if (first === '"') return this.readStringRaw();
    if (first === '{' || first === '[') {
      let raw = '';
      let depth = 0;
      let inString = false;
      let escaped = false;
      while (true) {
        const ch = await this.next();
        raw += ch;
        if (inString) {
          if (escaped) escaped = false;
          else if (ch === '\\') escaped = true;
          else if (ch === '"') inString = false;
          continue;
        }
        if (ch === '"') inString = true;
        else if (ch === '{' || ch === '[') depth += 1;
        else if (ch === '}' || ch === ']') {
          depth -= 1;
          if (depth === 0) return raw;
        }
      }
    }
    let raw = '';
    while (true) {
      const ch = await this.peek();
      if (ch === null || ch === ',' || ch === '}' || ch === ']') break;
      raw += await this.next();
    }
    return raw.trim();
  }

  async readArrayValue(key: string): Promise<unknown[]> {
    const arr: unknown[] = [];
    await this.expect('[');
    await this.skipWhitespace();
    if (await this.peek() === ']') { await this.next(); return arr; }
    while (true) {
      const raw = await this.readJsonRawValue();
      arr.push(JSON.parse(raw));
      if (arr.length % 100 === 0) {
        this.onProgress?.({ loaded: this.loaded, total: this.file.size, label: `Importing ${key} (${arr.length})` });
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      }
      await this.skipWhitespace();
      const ch = await this.next();
      if (ch === ']') return arr;
      if (ch !== ',') throw new Error('Invalid session file. Array item separator is missing.');
    }
  }
}

const importSessionStream = async (file: File, mode: 'replace' | 'merge', onProgress?: (progress: ImportProgress) => void) => {
  const reader = new StreamJsonReader(file, onProgress);
  const staged = new Map<string, unknown>();
  let foundData = false;
  let complete: boolean | undefined;

  await reader.expect('{');
  await reader.skipWhitespace();
  while (await reader.peek() !== '}') {
    const rootKey = await reader.readString();
    await reader.expect(':');
    if (rootKey === 'data') {
      foundData = true;
      await reader.expect('{');
      await reader.skipWhitespace();
      if (await reader.peek() === '}') {
        await reader.next();
      } else {
        while (true) {
          const key = await reader.readString();
          await reader.expect(':');
          await reader.skipWhitespace();
          const value = (await reader.peek()) === '['
            ? await reader.readArrayValue(key)
            : JSON.parse(await reader.readJsonRawValue());
          if (key.startsWith('ig_')) staged.set(key, value);
          await reader.skipWhitespace();
          const sep = await reader.next();
          if (sep === '}') break;
          if (sep !== ',') throw new Error('Invalid session file. Data separator is missing.');
        }
      }
    } else if (rootKey === 'complete') {
      complete = JSON.parse(await reader.readJsonRawValue()) as boolean;
    } else if (rootKey.startsWith('ig_')) {
      foundData = true;
      await reader.skipWhitespace();
      const value = (await reader.peek()) === '['
        ? await reader.readArrayValue(rootKey)
        : JSON.parse(await reader.readJsonRawValue());
      staged.set(rootKey, value);
    } else {
      await reader.readJsonRawValue();
    }
    await reader.skipWhitespace();
    const sep = await reader.next();
    if (sep === '}') break;
    if (sep !== ',') throw new Error('Invalid session file. Root separator is missing.');
  }
  if (!foundData) throw new Error('Invalid session file. No session data was found.');
  if (complete === false) throw new Error('Session file did not finish exporting. Please export the session again.');
  onProgress?.({ loaded: file.size, total: file.size, label: 'Saving imported session' });
  await applyImportedSessionData(staged, mode);
};

export const importSessionFile = async (
  file: File,
  mode: 'replace' | 'merge' = 'replace',
  onProgress?: (progress: ImportProgress) => void,
): Promise<void> => {
  if (file.size === 0) throw new Error('Session file is empty. Please choose a Fakestagram session export file.');
  if (file.size < 150 * 1024 * 1024) {
    onProgress?.({ loaded: 0, total: file.size, label: 'Reading session file' });
    await importSession(await file.text(), mode);
    onProgress?.({ loaded: file.size, total: file.size, label: 'Imported session' });
    return;
  }
  await importSessionStream(file, mode, onProgress);
};

// ---------- Linked session file (cross-browser sync) ----------
// Uses the File System Access API to persist a FileSystemFileHandle pointing
// to a session JSON file on the user's disk. Once linked, the app can
// auto-load on startup (after re-granting permission) and save back on
// demand. Chromium browsers only (Chrome, Edge, Brave, Arc, Opera).
const LINKED_HANDLE_KEY = '__linked_session_file_handle';

type FSHandle = {
  name: string;
  queryPermission: (opts: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
  requestPermission: (opts: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
  getFile: () => Promise<File>;
  createWritable: () => Promise<{ write: (data: BlobPart) => Promise<void>; close: () => Promise<void> }>;
};

export const isFileLinkSupported = (): boolean =>
  typeof window !== 'undefined' && 'showSaveFilePicker' in window;

export const getLinkedFileName = (): string | null => {
  const h = cache.get(LINKED_HANDLE_KEY) as FSHandle | undefined;
  return h?.name ?? null;
};

export const linkSessionFile = async (): Promise<string> => {
  if (!isFileLinkSupported()) throw new Error('File linking requires Chrome, Edge, or another Chromium browser.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handle: FSHandle = await (window as any).showSaveFilePicker({
    suggestedName: 'fakestagram-session.json',
    types: [{ description: 'Fakestagram session', accept: { 'application/json': ['.json'] } }],
  });
  cache.set(LINKED_HANDLE_KEY, handle);
  await idbSet(LINKED_HANDLE_KEY, handle).catch(() => {});
  await saveToLinkedFile();
  return handle.name;
};

export const unlinkSessionFile = async (): Promise<void> => {
  cache.delete(LINKED_HANDLE_KEY);
  await idbDel(LINKED_HANDLE_KEY).catch(() => {});
};

export const saveToLinkedFile = async (): Promise<boolean> => {
  const h = cache.get(LINKED_HANDLE_KEY) as FSHandle | undefined;
  if (!h) return false;
  let perm = await h.queryPermission({ mode: 'readwrite' });
  if (perm !== 'granted') perm = await h.requestPermission({ mode: 'readwrite' });
  if (perm !== 'granted') return false;
  const w = await h.createWritable();
  await w.write(exportSessionBlob());
  await w.close();
  return true;
};

export const loadFromLinkedFile = async (mode: 'replace' | 'merge' = 'replace'): Promise<boolean> => {
  const h = cache.get(LINKED_HANDLE_KEY) as FSHandle | undefined;
  if (!h) return false;
  let perm = await h.queryPermission({ mode: 'read' });
  if (perm !== 'granted') perm = await h.requestPermission({ mode: 'read' });
  if (perm !== 'granted') return false;
  const file = await h.getFile();
  if (file.size === 0) return false;
  await importSessionFile(file, mode);
  return true;
};

// Auto-load on startup if a linked file exists AND the local store is empty.
// Silent: never prompts without a user gesture.
export const tryAutoLoadLinkedFile = async (): Promise<boolean> => {
  const h = cache.get(LINKED_HANDLE_KEY) as FSHandle | undefined;
  if (!h) return false;
  const accs = cache.get('ig_accounts');
  if (Array.isArray(accs) && accs.length > 0) return false;
  try {
    const perm = await h.queryPermission({ mode: 'read' });
    if (perm !== 'granted') return false;
    return await loadFromLinkedFile('replace');
  } catch {
    return false;
  }
};

// Accounts
export const getAccounts = (): Account[] => get('ig_accounts', []);
export const getAccount = (id: string) => getAccounts().find(a => a.id === id);
export const saveAccount = (account: Account) => {
  const accounts = getAccounts().filter(a => a.id !== account.id);
  accounts.push(account);
  set('ig_accounts', accounts);
};
export const deleteAccount = (id: string) => {
  set('ig_accounts', getAccounts().filter(a => a.id !== id));
  set('ig_posts', getPosts().filter(p => p.accountId !== id));
  set('ig_stories', getStoriesRaw().filter(s => s.accountId !== id));
  set('ig_reels', getReels().filter(r => r.accountId !== id));
};

// Active / main account (current persona)
export const getActiveAccountId = (): string | null => get<string | null>('ig_active_account', null);
export const setActiveAccountId = (id: string) => set('ig_active_account', id);

export const getMainAccountId = (): string | null => get<string | null>('ig_main_account', null);
export const setMainAccountId = (id: string) => set('ig_main_account', id);

// Profile categories (global, shared across all accounts)
export const DEFAULT_CATEGORIES = [
  'Content Creator', 'Digital Creator', 'Artist', 'Photographer', 'Video Creator',
  'Blogger', 'Public Figure', 'Influencer', 'Musician/Band', 'Writer', 'Actor',
  'Model', 'Entrepreneur', 'Coach', 'Educator', 'Makeup Artist', 'Dancer',
  'Athlete', 'Chef', 'Designer', 'Gamer', 'Comedian', 'Journalist',
];
export const getCustomCategories = (): string[] => get<string[]>('ig_categories', []);
export const getAllCategories = (): string[] => {
  const custom = getCustomCategories();
  const seen = new Set<string>();
  return [...DEFAULT_CATEGORIES, ...custom].filter(c => {
    const k = c.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};
export const addCustomCategory = (cat: string) => {
  const trimmed = cat.trim();
  if (!trimmed) return;
  const all = getAllCategories().map(c => c.toLowerCase());
  if (all.includes(trimmed.toLowerCase())) return;
  set('ig_categories', [...getCustomCategories(), trimmed]);
};

// Posts
export const getPosts = (): Post[] => get('ig_posts', []);
export const getPostsByAccount = (accountId: string) => getPosts().filter(p => p.accountId === accountId);
export const savePost = (post: Post) => {
  const posts = getPosts().filter(p => p.id !== post.id);
  posts.unshift(post);
  set('ig_posts', posts);
};
export const deletePost = (id: string) => set('ig_posts', getPosts().filter(p => p.id !== id));

// Likes
export const getLikedPosts = (accountId: string): string[] => get(`ig_liked_${accountId}`, []);
export const toggleLikePost = (accountId: string, postId: string): boolean => {
  const liked = getLikedPosts(accountId);
  const isLiked = liked.includes(postId);
  if (isLiked) {
    set(`ig_liked_${accountId}`, liked.filter(id => id !== postId));
  } else {
    set(`ig_liked_${accountId}`, [...liked, postId]);
  }
  const posts = getPosts();
  const post = posts.find(p => p.id === postId);
  if (post) {
    post.likes += isLiked ? -1 : 1;
    set('ig_posts', posts);
  }
  return !isLiked;
};

// Saved posts
export const getSavedPosts = (accountId: string): string[] => get(`ig_saved_${accountId}`, []);
export const toggleSavePost = (accountId: string, postId: string): boolean => {
  const saved = getSavedPosts(accountId);
  const isSaved = saved.includes(postId);
  if (isSaved) {
    set(`ig_saved_${accountId}`, saved.filter(id => id !== postId));
  } else {
    set(`ig_saved_${accountId}`, [...saved, postId]);
  }
  return !isSaved;
};

// Comments
export const addComment = (postId: string, accountId: string, text: string, parentId?: string) => {
  const posts = getPosts();
  const post = posts.find(p => p.id === postId);
  if (post) {
    post.comments.push({
      id: uid(),
      accountId,
      text,
      likes: 0,
      createdAt: new Date().toISOString(),
      ...(parentId ? { parentId } : {}),
    });
    set('ig_posts', posts);
  }
};

export const deleteComment = (postId: string, commentId: string) => {
  const posts = getPosts();
  const post = posts.find(p => p.id === postId);
  if (post) {
    post.comments = post.comments.filter(c => c.id !== commentId);
    set('ig_posts', posts);
  }
};

export const getLikedComments = (accountId: string): string[] => get(`ig_liked_comments_${accountId}`, []);
export const toggleLikeComment = (accountId: string, postId: string, commentId: string): boolean => {
  const liked = getLikedComments(accountId);
  const isLiked = liked.includes(commentId);
  set(`ig_liked_comments_${accountId}`, isLiked ? liked.filter(id => id !== commentId) : [...liked, commentId]);
  const posts = getPosts();
  const post = posts.find(p => p.id === postId);
  const comment = post?.comments.find(c => c.id === commentId);
  if (comment) {
    comment.likes = Math.max(0, comment.likes + (isLiked ? -1 : 1));
    set('ig_posts', posts);
  }
  return !isLiked;
};

export const updatePost = (postId: string, patch: Partial<Post>) => {
  const posts = getPosts().map(p => p.id === postId ? { ...p, ...patch } : p);
  set('ig_posts', posts);
};

export const deleteReel = (id: string) => set('ig_reels', getReels().filter(r => r.id !== id));
export const updateReel = (reelId: string, patch: Partial<Reel>) => {
  const reels = getReels().map(r => r.id === reelId ? { ...r, ...patch } : r);
  set('ig_reels', reels);
};
// Enforce a maximum of 3 pinned posts per account by unpinning the oldest-pinned overflow.
export const enforcePinLimit = (accountId: string, max = 3) => {
  const posts = getPosts();
  const pinned = posts
    .filter(p => p.accountId === accountId && p.isPinned)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  if (pinned.length <= max) return;
  const excess = pinned.slice(0, pinned.length - max).map(p => p.id);
  set('ig_posts', posts.map(p => excess.includes(p.id) ? { ...p, isPinned: false } : p));
};
export const enforceReelPinLimit = (accountId: string, max = 3) => {
  const reels = getReels();
  const pinned = reels
    .filter(r => r.accountId === accountId && r.isPinned)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  if (pinned.length <= max) return;
  const excess = pinned.slice(0, pinned.length - max).map(r => r.id);
  set('ig_reels', reels.map(r => excess.includes(r.id) ? { ...r, isPinned: false } : r));
};

// Find or create a group conversation between specified participants (order-insensitive)
export const getOrCreateGroupConversation = (participantIds: string[]): Conversation => {
  const sorted = [...new Set(participantIds)].sort();
  const convs = getConversations();
  const existing = convs.find(c => {
    if (c.participantIds.length !== sorted.length) return false;
    const cs = [...c.participantIds].sort();
    return cs.every((id, i) => id === sorted[i]);
  });
  if (existing) return existing;
  const conv: Conversation = { id: uid(), participantIds: sorted, updatedAt: new Date().toISOString() };
  saveConversation(conv);
  return conv;
};

// Stories
const isStoryActive = (s: Story): boolean => {
  const exp = s.expiresAt ? new Date(s.expiresAt).getTime() : new Date(s.createdAt).getTime() + 86400000;
  return exp > Date.now();
};
export const getStoriesRaw = (): Story[] => get('ig_stories', []);
export const getStories = (): Story[] => getStoriesRaw().filter(isStoryActive);
export const getStoriesByAccount = (accountId: string) =>
  getStories().filter(s => s.accountId === accountId);
export const getStoryById = (id: string): Story | undefined =>
  getStoriesRaw().find(s => s.id === id);
export const saveStory = (story: Story) => {
  const stories = getStoriesRaw();
  stories.push(story);
  set('ig_stories', stories);
};
export const deleteStory = (id: string) => {
  set('ig_stories', getStoriesRaw().filter(s => s.id !== id));
  // Also remove from any highlights that reference it
  const highlights = getHighlights();
  let changed = false;
  const next = highlights.map(h => {
    if (h.storyIds.includes(id)) {
      changed = true;
      return { ...h, storyIds: h.storyIds.filter(x => x !== id) };
    }
    return h;
  });
  if (changed) set('ig_highlights', next);
};
export const pruneExpiredStories = () => {
  const all = getStoriesRaw();
  const referenced = new Set<string>();
  getHighlights().forEach(h => h.storyIds.forEach(id => referenced.add(id)));
  const kept = all.filter(s => isStoryActive(s) || referenced.has(s.id));
  if (kept.length !== all.length) set('ig_stories', kept);
};


// Highlights
export const getHighlights = (): StoryHighlight[] => get('ig_highlights', []);
export const getHighlightsByAccount = (accountId: string) =>
  getHighlights().filter(h => h.accountId === accountId);
export const getHighlight = (id: string) => getHighlights().find(h => h.id === id);
export const saveHighlight = (highlight: StoryHighlight) => {
  const highlights = getHighlights();
  const idx = highlights.findIndex(h => h.id === highlight.id);
  if (idx >= 0) highlights[idx] = highlight;
  else highlights.push(highlight);
  set('ig_highlights', highlights);
};
export const deleteHighlight = (id: string) =>
  set('ig_highlights', getHighlights().filter(h => h.id !== id));
export const reorderHighlights = (accountId: string, orderedIds: string[]) => {
  const all = getHighlights();
  const mine = all.filter(h => h.accountId === accountId);
  const others = all.filter(h => h.accountId !== accountId);
  const reordered = orderedIds
    .map(id => mine.find(h => h.id === id))
    .filter(Boolean) as StoryHighlight[];
  // Append any that were missed at the end
  mine.forEach(h => { if (!reordered.includes(h)) reordered.push(h); });
  set('ig_highlights', [...others, ...reordered]);
};

// Reels
export const getReels = (): Reel[] => get('ig_reels', []);
export const getReelsByAccount = (accountId: string) => getReels().filter(r => r.accountId === accountId);
export const saveReel = (reel: Reel) => {
  const reels = getReels().filter(r => r.id !== reel.id);
  reels.unshift(reel);
  set('ig_reels', reels);
};
export const getLikedReels = (accountId: string): string[] => get(`ig_liked_reels_${accountId}`, []);
export const toggleLikeReel = (accountId: string, reelId: string): boolean => {
  const liked = getLikedReels(accountId);
  const isLiked = liked.includes(reelId);
  set(`ig_liked_reels_${accountId}`, isLiked ? liked.filter(id => id !== reelId) : [...liked, reelId]);
  const reels = getReels();
  const reel = reels.find(r => r.id === reelId);
  if (reel) {
    reel.likes = Math.max(0, reel.likes + (isLiked ? -1 : 1));
    set('ig_reels', reels);
  }
  return !isLiked;
};
export const getSavedReels = (accountId: string): string[] => get(`ig_saved_reels_${accountId}`, []);
export const toggleSaveReel = (accountId: string, reelId: string): boolean => {
  const saved = getSavedReels(accountId);
  const isSaved = saved.includes(reelId);
  set(`ig_saved_reels_${accountId}`, isSaved ? saved.filter(id => id !== reelId) : [...saved, reelId]);
  return !isSaved;
};
export const addReelComment = (reelId: string, accountId: string, text: string, parentId?: string) => {
  const reels = getReels();
  const reel = reels.find(r => r.id === reelId);
  if (reel) {
    reel.comments.push({
      id: uid(),
      accountId,
      text,
      likes: 0,
      createdAt: new Date().toISOString(),
      ...(parentId ? { parentId } : {}),
    });
    set('ig_reels', reels);
  }
};
export const deleteReelComment = (reelId: string, commentId: string) => {
  const reels = getReels();
  const reel = reels.find(r => r.id === reelId);
  if (reel) {
    reel.comments = reel.comments.filter(c => c.id !== commentId);
    set('ig_reels', reels);
  }
};
export const toggleLikeReelComment = (accountId: string, reelId: string, commentId: string): boolean => {
  const liked = getLikedComments(accountId);
  const isLiked = liked.includes(commentId);
  set(`ig_liked_comments_${accountId}`, isLiked ? liked.filter(id => id !== commentId) : [...liked, commentId]);
  const reels = getReels();
  const reel = reels.find(r => r.id === reelId);
  const comment = reel?.comments.find(c => c.id === commentId);
  if (comment) {
    comment.likes = Math.max(0, comment.likes + (isLiked ? -1 : 1));
    set('ig_reels', reels);
  }
  return !isLiked;
};

// DMs
export const getConversations = (): Conversation[] => get('ig_conversations', []);
export const saveConversation = (conv: Conversation) => {
  const convs = getConversations().filter(c => c.id !== conv.id);
  convs.unshift(conv);
  set('ig_conversations', convs);
};
export const getMessages = (conversationId: string): DirectMessage[] => get(`ig_messages_${conversationId}`, []);
export const saveMessage = (conversationId: string, msg: DirectMessage) => {
  const msgs = getMessages(conversationId);
  msgs.push(msg);
  set(`ig_messages_${conversationId}`, msgs);
};
export const updateMessage = (conversationId: string, msgId: string, text: string) => {
  const msgs = getMessages(conversationId).map(m => m.id === msgId ? { ...m, text } : m);
  set(`ig_messages_${conversationId}`, msgs);
};
export const updateMessageTimestamp = (conversationId: string, msgId: string, createdAt: string) => {
  const msgs = getMessages(conversationId).map(m => m.id === msgId ? { ...m, createdAt } : m);
  // keep messages sorted chronologically
  msgs.sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  set(`ig_messages_${conversationId}`, msgs);
  // refresh conversation's last message + updatedAt
  const last = msgs[msgs.length - 1];
  if (last) {
    const conv = getConversations().find(c => c.id === conversationId);
    if (conv) saveConversation({ ...conv, lastMessage: last, updatedAt: last.createdAt });
  }
};
export const deleteMessage = (conversationId: string, msgId: string) => {
  set(`ig_messages_${conversationId}`, getMessages(conversationId).filter(m => m.id !== msgId));
};

export const deleteConversation = (id: string) => {
  set('ig_conversations', getConversations().filter(c => c.id !== id));
  del(`ig_messages_${id}`);
};

export const setMessageReaction = (conversationId: string, msgId: string, accountId: string, emoji: string | null) => {
  const msgs = getMessages(conversationId).map(m => {
    if (m.id !== msgId) return m;
    const reactions = { ...(m.reactions || {}) };
    if (emoji) reactions[accountId] = emoji;
    else delete reactions[accountId];
    return { ...m, reactions };
  });
  set(`ig_messages_${conversationId}`, msgs);
};

export const getPost = (id: string) => getPosts().find(p => p.id === id);
export const getReel = (id: string) => getReels().find(r => r.id === id);

// Find or create a 1-on-1 conversation between two accounts
export const getOrCreateConversation = (a: string, b: string): Conversation => {
  const convs = getConversations();
  const existing = convs.find(c =>
    c.participantIds.length === 2 &&
    c.participantIds.includes(a) &&
    c.participantIds.includes(b)
  );
  if (existing) return existing;
  const conv: Conversation = {
    id: uid(),
    participantIds: [a, b],
    updatedAt: new Date().toISOString(),
  };
  saveConversation(conv);
  return conv;
};

// Follows
export const getFollowing = (accountId: string): string[] => get(`ig_following_${accountId}`, []);
export const toggleFollow = (fromId: string, toId: string) => {
  const following = getFollowing(fromId);
  const isFollowing = following.includes(toId);
  const accounts = getAccounts();
  if (isFollowing) {
    set(`ig_following_${fromId}`, following.filter(id => id !== toId));
  } else {
    set(`ig_following_${fromId}`, [...following, toId]);
  }
  set('ig_accounts', accounts.map(account => {
    if (account.id === fromId) return { ...account, following: Math.max(0, account.following + (isFollowing ? -1 : 1)) };
    if (account.id === toId) return { ...account, followers: Math.max(0, account.followers + (isFollowing ? -1 : 1)) };
    return account;
  }));
  return !isFollowing;
};

// ---------- Account ordering / folders / tags (manage-accounts page) ----------
export const reorderAccounts = (orderedIds: string[]) => {
  const accounts = getAccounts();
  const map = new Map(accounts.map(a => [a.id, a]));
  const ordered: Account[] = [];
  orderedIds.forEach(id => { const a = map.get(id); if (a) { ordered.push(a); map.delete(id); } });
  // Append any not listed
  map.forEach(a => ordered.push(a));
  set('ig_accounts', ordered);
};

export const setAccountFolder = (accountId: string, folderId: string | null) => {
  const accounts = getAccounts().map(a => {
    if (a.id !== accountId) return a;
    const next = { ...a };
    if (folderId) next.folderId = folderId; else delete next.folderId;
    return next;
  });
  set('ig_accounts', accounts);
};

export const setAccountTags = (accountId: string, tags: string[]) => {
  const cleaned = Array.from(new Set(tags.map(t => t.trim()).filter(Boolean)));
  const accounts = getAccounts().map(a => a.id === accountId ? { ...a, tags: cleaned } : a);
  set('ig_accounts', accounts);
};

export const getAllAccountTags = (): string[] => {
  const seen = new Set<string>();
  getAccounts().forEach(a => (a.tags || []).forEach(t => seen.add(t)));
  return Array.from(seen).sort();
};

export const getAccountFolders = (): AccountFolder[] => get('ig_account_folders', []);
export const saveAccountFolder = (folder: AccountFolder) => {
  const folders = getAccountFolders().filter(f => f.id !== folder.id);
  folders.push(folder);
  set('ig_account_folders', folders);
};
export const reorderFolders = (orderedIds: string[]) => {
  const folders = getAccountFolders();
  const map = new Map(folders.map(f => [f.id, f]));
  const ordered: AccountFolder[] = [];
  orderedIds.forEach(id => { const f = map.get(id); if (f) { ordered.push(f); map.delete(id); } });
  map.forEach(f => ordered.push(f));
  set('ig_account_folders', ordered);
};
export const deleteAccountFolder = (id: string) => {
  set('ig_account_folders', getAccountFolders().filter(f => f.id !== id));
  // Clear folderId from any accounts in this folder
  const accounts = getAccounts().map(a => {
    if (a.folderId !== id) return a;
    const next = { ...a }; delete next.folderId; return next;
  });
  set('ig_accounts', accounts);
};

// ---------- Tag colors (manage-accounts page) ----------
export const getTagColors = (): Record<string, string> => get('ig_account_tag_colors', {});
export const setTagColor = (tag: string, color: string) => {
  const colors = getTagColors();
  colors[tag] = color;
  set('ig_account_tag_colors', colors);
};
export const removeTagColor = (tag: string) => {
  const colors = getTagColors();
  delete colors[tag];
  set('ig_account_tag_colors', colors);
};


// ---------- DM analytics ----------
/** Top N accounts that `fromAccountId` has sent the most messages to. */
export const getTopMessageRecipients = (fromAccountId: string, limit = 3): string[] => {
  const convs = getConversations().filter(c => c.participantIds.includes(fromAccountId));
  const counts = new Map<string, number>();
  convs.forEach(c => {
    const msgs = getMessages(c.id);
    msgs.forEach(m => {
      if (m.fromAccountId !== fromAccountId) return;
      c.participantIds.forEach(pid => {
        if (pid === fromAccountId) return;
        counts.set(pid, (counts.get(pid) || 0) + 1);
      });
    });
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id]) => id);
};

