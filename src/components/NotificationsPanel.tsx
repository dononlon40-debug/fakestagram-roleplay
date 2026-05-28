import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Heart, MessageCircle, UserPlus } from 'lucide-react';
import { getPosts, getReels, getAccount, getFollowing, getAccounts } from '@/lib/store';
import { getSimEvents, getFakeUser, markSimEventsRead, type SimEvent } from '@/lib/simulation';
import { useApp } from '@/contexts/AppContext';
import { timeAgo } from '@/lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
}

type Notif =
  | { kind: 'comment'; postId: string; postThumb: string; actorIds: string[]; lastAt: string }
  | { kind: 'follow'; actorIds: string[]; lastAt: string }
  | { kind: 'sim-like'; postId: string; targetType: 'post' | 'reel'; postThumb: string; fakeUserIds: string[]; lastAt: string }
  | { kind: 'sim-comment'; postId: string; targetType: 'post' | 'reel'; postThumb: string; fakeUserId: string; text: string; lastAt: string }
  | { kind: 'sim-follow'; fakeUserIds: string[]; lastAt: string };

const NotificationsPanel = ({ open, onClose }: Props) => {
  const { activeAccountId } = useApp();
  const navigate = useNavigate();
  const [tick, setTick] = useState(0);

  // Re-render when the simulation drops new events.
  useEffect(() => {
    const handler = () => setTick(t => t + 1);
    window.addEventListener('ig:sim-tick', handler);
    return () => window.removeEventListener('ig:sim-tick', handler);
  }, []);

  useEffect(() => {
    if (open) markSimEventsRead();
  }, [open, tick]);

  const notifications: Notif[] = useMemo(() => {
    if (!activeAccountId) return [];
    const list: Notif[] = [];

    // Real comments on user's posts
    getPosts()
      .filter(p => p.accountId === activeAccountId)
      .forEach(p => {
        const externals = (p.comments || []).filter(c => c.accountId !== activeAccountId);
        if (externals.length === 0) return;
        const sorted = [...externals].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
        const actorIds: string[] = [];
        sorted.forEach(c => { if (!actorIds.includes(c.accountId)) actorIds.push(c.accountId); });
        list.push({
          kind: 'comment',
          postId: p.id,
          postThumb: p.images?.[0] || '',
          actorIds,
          lastAt: sorted[0].createdAt,
        });
      });

    // Real followers (other personas) — sort by the follower account's createdAt so
    // these don't always pin to the top of the notifications feed.
    const followers = getAccounts()
      .filter(a => a.id !== activeAccountId && getFollowing(a.id).includes(activeAccountId))
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    if (followers.length > 0) {
      list.push({
        kind: 'follow',
        actorIds: followers.map(a => a.id),
        lastAt: followers[0].createdAt || new Date(0).toISOString(),
      });
    }

    // Simulated events targeting the active account
    const sim = getSimEvents().filter(e => e.ownerAccountId === activeAccountId);
    // Group likes per target
    const likeGroups = new Map<string, SimEvent[]>();
    sim.forEach(e => {
      if (e.kind === 'like') {
        const key = `${e.targetType}:${e.targetId}`;
        const arr = likeGroups.get(key) || [];
        arr.push(e);
        likeGroups.set(key, arr);
      }
    });
    likeGroups.forEach((events, key) => {
      const [targetType, targetId] = key.split(':') as ['post' | 'reel', string];
      const thumb = targetType === 'post'
        ? (getPosts().find(p => p.id === targetId)?.images?.[0] || '')
        : (getReels().find(r => r.id === targetId)?.thumbnail || '');
      const sorted = [...events].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
      list.push({
        kind: 'sim-like',
        postId: targetId,
        targetType,
        postThumb: thumb,
        fakeUserIds: sorted.map(e => (e as any).fakeUserId),
        lastAt: sorted[0].createdAt,
      });
    });
    // Comments — one entry per comment, most recent first
    sim.forEach(e => {
      if (e.kind !== 'comment') return;
      const thumb = e.targetType === 'post'
        ? (getPosts().find(p => p.id === e.targetId)?.images?.[0] || '')
        : (getReels().find(r => r.id === e.targetId)?.thumbnail || '');
      list.push({
        kind: 'sim-comment',
        postId: e.targetId,
        targetType: e.targetType,
        postThumb: thumb,
        fakeUserId: e.fakeUserId,
        text: e.text,
        lastAt: e.createdAt,
      });
    });
    // Fake follows grouped
    const fakeFollows = sim.filter(e => e.kind === 'follow');
    if (fakeFollows.length > 0) {
      const sorted = [...fakeFollows].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
      list.push({
        kind: 'sim-follow',
        fakeUserIds: sorted.map(e => (e as any).fakeUserId),
        lastAt: sorted[0].createdAt,
      });
    }

    return list.sort((a, b) => +new Date(b.lastAt) - +new Date(a.lastAt));
  }, [activeAccountId, open, tick]);

  const StackedAvatars = ({ ids }: { ids: string[] }) => {
    const shown = ids.slice(0, 3);
    return (
      <div className="relative w-11 h-11 shrink-0">
        {shown.map((id, i) => {
          const a = getAccount(id);
          return (
            <div
              key={id}
              className="absolute w-8 h-8 rounded-full bg-secondary overflow-hidden border-2 border-background"
              style={{ left: i * 10, top: i * 4, zIndex: shown.length - i }}
            >
              {a?.profilePicture && <img src={a.profilePicture} alt="" className="w-full h-full object-cover" />}
            </div>
          );
        })}
      </div>
    );
  };

  const FakeAvatar = ({ id }: { id: string }) => {
    const u = getFakeUser(id);
    const initials = (u?.displayName || u?.username || '?').slice(0, 1).toUpperCase();
    return (
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold border-2 border-background"
        style={{ background: u?.color || 'hsl(var(--muted))' }}
      >
        {initials}
      </div>
    );
  };

  const StackedFakeAvatars = ({ ids }: { ids: string[] }) => {
    const shown = ids.slice(0, 3);
    return (
      <div className="relative w-11 h-11 shrink-0">
        {shown.map((id, i) => (
          <div key={id + i} className="absolute" style={{ left: i * 10, top: i * 4, zIndex: shown.length - i }}>
            <FakeAvatar id={id} />
          </div>
        ))}
      </div>
    );
  };

  const renderItem = (n: Notif, idx: number) => {
    if (n.kind === 'follow') {
      const first = getAccount(n.actorIds[0]);
      const extra = n.actorIds.length - 1;
      return (
        <button
          key={`f-${idx}`}
          onClick={() => first && navigate(`/profile/${first.id}`)}
          className="w-full flex items-center gap-3 px-5 py-3 hover:bg-secondary/50 transition-colors text-left"
        >
          <StackedAvatars ids={n.actorIds} />
          <div className="flex-1 min-w-0 text-sm">
            <span className="font-semibold">{first?.username || 'someone'}</span>
            {extra > 0 && <span> and {extra} other{extra === 1 ? '' : 's'}</span>}
            <span className="text-muted-foreground"> started following you. </span>
            <span className="text-muted-foreground text-xs">{timeAgo(n.lastAt)}</span>
          </div>
          <UserPlus size={16} className="text-muted-foreground shrink-0" />
        </button>
      );
    }
    if (n.kind === 'comment') {
      const first = getAccount(n.actorIds[0]);
      const extra = n.actorIds.length - 1;
      return (
        <button
          key={`c-${idx}`}
          onClick={() => first && navigate(`/profile/${first.id}`)}
          className="w-full flex items-center gap-3 px-5 py-3 hover:bg-secondary/50 transition-colors text-left"
        >
          <StackedAvatars ids={n.actorIds} />
          <div className="flex-1 min-w-0 text-sm">
            <span className="font-semibold">{first?.username || 'someone'}</span>
            {extra > 0 && <span> and {extra} other{extra === 1 ? '' : 's'}</span>}
            <span className="text-muted-foreground"> commented on your post. </span>
            <span className="text-muted-foreground text-xs">{timeAgo(n.lastAt)}</span>
          </div>
          {n.postThumb ? (
            <img src={n.postThumb} alt="" className="w-11 h-11 object-cover rounded shrink-0" />
          ) : (
            <div className="w-11 h-11 bg-secondary rounded shrink-0 flex items-center justify-center">
              <MessageCircle size={16} className="text-muted-foreground" />
            </div>
          )}
        </button>
      );
    }
    if (n.kind === 'sim-like') {
      const first = getFakeUser(n.fakeUserIds[0]);
      const extra = n.fakeUserIds.length - 1;
      return (
        <div key={`sl-${idx}`} className="w-full flex items-center gap-3 px-5 py-3 hover:bg-secondary/50 transition-colors text-left">
          <StackedFakeAvatars ids={n.fakeUserIds} />
          <div className="flex-1 min-w-0 text-sm">
            <span className="font-semibold">{first?.username || 'someone'}</span>
            {extra > 0 && <span> and {extra} other{extra === 1 ? '' : 's'}</span>}
            <span className="text-muted-foreground"> liked your {n.targetType}. </span>
            <span className="text-muted-foreground text-xs">{timeAgo(n.lastAt)}</span>
          </div>
          {n.postThumb ? (
            <img src={n.postThumb} alt="" className="w-11 h-11 object-cover rounded shrink-0" />
          ) : (
            <div className="w-11 h-11 bg-secondary rounded shrink-0 flex items-center justify-center">
              <Heart size={16} className="text-muted-foreground" />
            </div>
          )}
        </div>
      );
    }
    if (n.kind === 'sim-comment') {
      const u = getFakeUser(n.fakeUserId);
      return (
        <div key={`sc-${idx}`} className="w-full flex items-center gap-3 px-5 py-3 hover:bg-secondary/50 transition-colors text-left">
          <div className="w-11 h-11 shrink-0 flex items-center justify-center">
            <FakeAvatar id={n.fakeUserId} />
          </div>
          <div className="flex-1 min-w-0 text-sm">
            <span className="font-semibold">{u?.username || 'someone'}</span>
            <span className="text-muted-foreground"> commented: </span>
            <span className="truncate">{n.text}</span>
            <span className="text-muted-foreground text-xs"> · {timeAgo(n.lastAt)}</span>
          </div>
          {n.postThumb ? (
            <img src={n.postThumb} alt="" className="w-11 h-11 object-cover rounded shrink-0" />
          ) : (
            <div className="w-11 h-11 bg-secondary rounded shrink-0 flex items-center justify-center">
              <MessageCircle size={16} className="text-muted-foreground" />
            </div>
          )}
        </div>
      );
    }
    // sim-follow
    const first = getFakeUser(n.fakeUserIds[0]);
    const extra = n.fakeUserIds.length - 1;
    return (
      <div key={`sf-${idx}`} className="w-full flex items-center gap-3 px-5 py-3 hover:bg-secondary/50 transition-colors text-left">
        <StackedFakeAvatars ids={n.fakeUserIds} />
        <div className="flex-1 min-w-0 text-sm">
          <span className="font-semibold">{first?.username || 'someone'}</span>
          {extra > 0 && <span> and {extra} other{extra === 1 ? '' : 's'}</span>}
          <span className="text-muted-foreground"> started following you. </span>
          <span className="text-muted-foreground text-xs">{timeAgo(n.lastAt)}</span>
        </div>
        <UserPlus size={16} className="text-muted-foreground shrink-0" />
      </div>
    );
  };

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-transparent" onClick={onClose} />}
      <aside
        className={`fixed top-0 left-[72px] h-full w-[397px] bg-background border-r border-border z-40 transform transition-transform duration-300 ease-out ${
          open ? 'translate-x-0 shadow-2xl' : '-translate-x-[470px]'
        }`}
      >
        <div className="p-6 pb-4 flex items-center justify-between">
          <h2 className="text-2xl font-semibold">Notifications</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="border-t border-border" />
        <div className="overflow-y-auto" style={{ height: 'calc(100% - 96px)' }}>
          <div className="px-5 pt-4 pb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">New</div>
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center text-muted-foreground py-16 gap-2 px-6">
              <Heart size={28} className="opacity-40" />
              <p className="text-sm">No notifications yet.</p>
              <p className="text-xs">Interactions on your posts will show up here.</p>
            </div>
          ) : (
            notifications.map(renderItem)
          )}
        </div>
      </aside>
    </>
  );
};

export default NotificationsPanel;
