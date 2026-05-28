// Living social-media simulator.
// Generates organic likes / comments / fake-user notifications over time so the
// fake roleplay accounts feel like a real, active platform.
//
// Engagement model (per post / per reel):
//   - Brand new (<1h): explosive — followers * 0.5 + ~100 likes/hour
//   - First day:       still hot, exponentially decaying
//   - First month:     gradual decline, follower-scaled
//   - <1 year old:     ~1 like/day baseline
//   - Very old:        rare, ~1 like per few weeks
// Comments scale at ~5% of likes. Saves are not simulated.
//
// Ticks are driven by elapsed real-time between page loads (capped at a week),
// plus a 60-second interval while the app is open. Sampling uses Poisson so
// small posts can still occasionally pop.

import { Post, Reel } from './types';
import { getPosts, getReels, getAccount, uid } from './store';
import { get as idbGet, set as idbSet } from 'idb-keyval';

const LAST_TICK_KEY = 'ig_sim_last_tick';
const FAKE_USERS_KEY = 'ig_fake_users';
const EVENTS_KEY = 'ig_sim_events';
const MAX_EVENTS = 300;

export interface FakeUser {
  id: string;
  username: string;
  displayName: string;
  color: string; // hsl seed for the avatar
}

export type SimEvent =
  | { id: string; kind: 'like'; targetType: 'post' | 'reel'; targetId: string; ownerAccountId: string; fakeUserId: string; createdAt: string; read?: boolean }
  | { id: string; kind: 'comment'; targetType: 'post' | 'reel'; targetId: string; ownerAccountId: string; fakeUserId: string; text: string; createdAt: string; read?: boolean }
  | { id: string; kind: 'follow'; ownerAccountId: string; fakeUserId: string; createdAt: string; read?: boolean };

// ---------- Synchronous cache (mirrors what's in IDB) ----------
let fakeUsersCache: FakeUser[] = [];
let eventsCache: SimEvent[] = [];
let lastTickCache: number | null = null;
let bootstrapped = false;

// ---------- Name generators ----------
const FIRST = [
  'alex','sam','jordan','taylor','riley','casey','morgan','jamie','quinn','avery',
  'rowan','sage','noah','liam','emma','olivia','mia','ava','sofia','luna',
  'zoe','iris','nora','ivy','kai','leo','milo','theo','ezra','arlo',
  'maya','lila','remy','wren','juno','indie','dani','frankie','nico','vega',
  'cleo','reese','blair','sky','ash','river','phoenix','sloane','dakota','marlowe',
];
const LAST = [
  'hart','rose','wolf','fox','lane','quinn','knox','reed','vale','west',
  'rivers','stone','crowe','moon','star','rain','jay','grey','blake','frost',
  'wilde','byrne','sloan','holt','park','sun','sky','heart','dove','swift',
];
const SUFFIX = ['', '', '', '_', '.', '01', '99', '_xo', 'xx', '23', '_real', '.life'];
const COMMENTS = [
  '🔥🔥🔥', 'love this', 'omg yes', 'stunning', 'goals', 'this is everything',
  'wow', '😍😍', 'incredible shot', 'gorgeous', 'obsessed', 'iconic',
  'no way 😭', 'beautiful', 'mood', 'why so pretty', 'queen', 'king',
  'this hits different', '🥹', 'absolute fire', 'where is this?', 'pls drop the location',
  'cannot stop staring', 'art', 'a whole vibe', '✨', 'gorgeous as always',
  'literally perfect', 'this made my day', 'so good', '💜',
];

const rand = (n: number) => Math.floor(Math.random() * n);
const pick = <T,>(arr: T[]) => arr[rand(arr.length)];

const generateFakeUser = (): FakeUser => {
  const first = pick(FIRST);
  const last = pick(LAST);
  const sep = pick(['', '_', '.', '']);
  const suffix = pick(SUFFIX);
  const username = `${first}${sep}${last}${suffix}`;
  return {
    id: uid(),
    username,
    displayName: `${first[0].toUpperCase()}${first.slice(1)} ${last[0].toUpperCase()}${last.slice(1)}`,
    color: `hsl(${rand(360)} 60% 55%)`,
  };
};

// Poisson sampler (Knuth) — fine for small lambdas. Cap to avoid runaway loops.
const poisson = (lambda: number): number => {
  if (lambda <= 0) return 0;
  if (lambda > 30) {
    // Normal approximation for large lambda
    const u1 = Math.random() || 1e-9;
    const u2 = Math.random();
    const n = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return Math.max(0, Math.round(lambda + n * Math.sqrt(lambda)));
  }
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  while (p > L && k < 200) { k++; p *= Math.random(); }
  return k - 1;
};

// Expected likes per hour for a piece of content
const expectedLikesPerHour = (ageHours: number, followers: number): number => {
  const f = Math.max(0, followers);
  if (ageHours < 1)        return f * 0.5 + 80;
  if (ageHours < 24)       return f * 0.05 + 30 * Math.exp(-ageHours / 12);
  if (ageHours < 24 * 30)  return f * 0.003 * Math.exp(-ageHours / (24 * 14)) + 0.5;
  if (ageHours < 24 * 365) return f * 0.0001 + 0.04;          // ~1/day on a popular post
  return f * 0.00002 + 0.003;                                  // very old: rare
};

// ---------- Bootstrap from IDB ----------
export const initSimulation = async (): Promise<void> => {
  if (bootstrapped) return;
  bootstrapped = true;
  try {
    fakeUsersCache = ((await idbGet(FAKE_USERS_KEY)) as FakeUser[] | undefined) || [];
    eventsCache = ((await idbGet(EVENTS_KEY)) as SimEvent[] | undefined) || [];
    lastTickCache = ((await idbGet(LAST_TICK_KEY)) as number | undefined) ?? null;
  } catch { /* noop */ }

  // Seed a fake-user pool once.
  if (fakeUsersCache.length < 80) {
    while (fakeUsersCache.length < 80) fakeUsersCache.push(generateFakeUser());
    idbSet(FAKE_USERS_KEY, fakeUsersCache).catch(() => {});
  }
};

export const getFakeUsers = (): FakeUser[] => fakeUsersCache;
export const getFakeUser = (id: string): FakeUser | undefined =>
  fakeUsersCache.find(u => u.id === id);
export const getSimEvents = (): SimEvent[] => eventsCache;
export const markSimEventsRead = (): void => {
  let changed = false;
  eventsCache = eventsCache.map(e => {
    if (!e.read) { changed = true; return { ...e, read: true }; }
    return e;
  });
  if (changed) idbSet(EVENTS_KEY, eventsCache).catch(() => {});
};

// ---------- Tick: advance the simulation ----------
export const runSimulationTick = (): boolean => {
  if (!bootstrapped) return false;
  const now = Date.now();
  const last = lastTickCache ?? now;
  const deltaMs = now - last;
  if (deltaMs < 15_000) {  // run at most every 15s
    if (lastTickCache === null) {
      lastTickCache = now;
      idbSet(LAST_TICK_KEY, now).catch(() => {});
    }
    return false;
  }
  // Cap delta to prevent absurd spikes after long absence (max 7 days of simulated time).
  const deltaHours = Math.min(deltaMs / 3_600_000, 24 * 7);

  const posts = getPosts();
  const reels = getReels();
  let postsChanged = false;
  let reelsChanged = false;
  const newEvents: SimEvent[] = [];

  const simulate = <T extends Post | Reel>(
    item: T,
    targetType: 'post' | 'reel',
  ): { likes: number; comments: number } => {
    const account = getAccount(item.accountId);
    if (!account) return { likes: 0, comments: 0 };
    const ageHours = Math.max(0, (now - new Date(item.createdAt).getTime()) / 3_600_000);
    const rate = expectedLikesPerHour(ageHours, account.followers);
    const expectedLikes = rate * deltaHours;
    const likes = poisson(expectedLikes);
    const expectedComments = expectedLikes * 0.05;
    const comments = poisson(expectedComments);

    // Spawn notification events for a small visible slice (avoid drowning the inbox).
    const likeNotifs = Math.min(likes, 5);
    for (let i = 0; i < likeNotifs; i++) {
      const u = pick(fakeUsersCache);
      newEvents.push({
        id: uid(),
        kind: 'like',
        targetType,
        targetId: item.id,
        ownerAccountId: item.accountId,
        fakeUserId: u.id,
        createdAt: new Date(now - Math.random() * deltaMs).toISOString(),
      });
    }
    const commentNotifs = Math.min(comments, 3);
    for (let i = 0; i < commentNotifs; i++) {
      const u = pick(fakeUsersCache);
      newEvents.push({
        id: uid(),
        kind: 'comment',
        targetType,
        targetId: item.id,
        ownerAccountId: item.accountId,
        fakeUserId: u.id,
        text: pick(COMMENTS),
        createdAt: new Date(now - Math.random() * deltaMs).toISOString(),
      });
    }
    return { likes, comments };
  };

  posts.forEach(p => {
    const { likes, comments } = simulate(p, 'post');
    if (likes > 0) { p.likes += likes; postsChanged = true; }
    if (comments > 0) { p.baseComments = (p.baseComments || 0) + comments; postsChanged = true; }
  });
  reels.forEach(r => {
    const { likes, comments } = simulate(r, 'reel');
    if (likes > 0) { r.likes += likes; reelsChanged = true; }
    if (comments > 0) { r.baseComments = (r.baseComments || 0) + comments; reelsChanged = true; }
    // Reels also accrue views (~10x likes)
    if (likes > 0) { r.views = (r.views || 0) + likes * (5 + rand(15)); reelsChanged = true; }
  });

  // Rare fake follows on the most-active accounts
  const accountIds = Array.from(new Set(posts.map(p => p.accountId).concat(reels.map(r => r.accountId))));
  accountIds.forEach(aid => {
    const acc = getAccount(aid);
    if (!acc) return;
    const followRate = (acc.followers * 0.0005 + 0.02) * deltaHours; // expected new fake followers
    const n = poisson(followRate);
    for (let i = 0; i < Math.min(n, 2); i++) {
      const u = pick(fakeUsersCache);
      newEvents.push({
        id: uid(), kind: 'follow', ownerAccountId: aid, fakeUserId: u.id,
        createdAt: new Date(now - Math.random() * deltaMs).toISOString(),
      });
    }
    if (n > 0) { acc.followers += n; /* bumped on the cached account object */ }
  });

  // Persist (in-memory cache is mutated in place, so it's already up to date)
  if (postsChanged) idbSet('ig_posts', posts).catch(() => {});
  if (reelsChanged) idbSet('ig_reels', reels).catch(() => {});
  if (accountIds.length > 0) import('./store').then(s => idbSet('ig_accounts', s.getAccounts())).catch(() => {});

  if (newEvents.length > 0) {
    eventsCache = [...eventsCache, ...newEvents].slice(-MAX_EVENTS);
    idbSet(EVENTS_KEY, eventsCache).catch(() => {});
  }
  lastTickCache = now;
  idbSet(LAST_TICK_KEY, now).catch(() => {});
  const changed = newEvents.length > 0 || postsChanged || reelsChanged;
  if (changed && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('ig:sim-tick'));
  }
  return changed;
};

