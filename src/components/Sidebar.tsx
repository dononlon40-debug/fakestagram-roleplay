import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { User, Compass, Search as SearchLucide, Lightbulb } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useApp } from '@/contexts/AppContext';
import { HomeIcon, ReelsIcon, MessengerIcon, NotificationsIcon, CreateIcon } from '@/components/icons/InstagramIcons';
import CreatePostModal from '@/components/CreatePostModal';
import SearchPanel from '@/components/SearchPanel';
import NotificationsPanel from '@/components/NotificationsPanel';
import { getPosts } from '@/lib/store';

const Sidebar = () => {
  const { activeAccount, activeAccountId } = useApp();
  const location = useLocation();
  const [createOpen, setCreateOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const isLight = theme === 'light';

  const hasNotifications = (() => {
    if (!activeAccountId) return false;
    return getPosts()
      .filter(p => p.accountId === activeAccountId)
      .some(p => (p.comments || []).some(c => c.accountId !== activeAccountId));
  })();


  const itemBase =
    'group relative flex items-center justify-center w-12 h-12 mx-auto rounded-lg transition-colors hover:bg-secondary';

  const HoverLabel = ({ children }: { children: React.ReactNode }) => (
    <span
      className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-md bg-foreground px-2.5 py-1.5 text-xs font-medium text-background opacity-0 -translate-x-2 transition-all duration-200 ease-out group-hover:opacity-100 group-hover:translate-x-0 z-50 shadow-lg"
    >
      {children}
    </span>
  );

  return (
    <aside className="fixed left-0 top-0 h-full w-[72px] border-r border-border flex flex-col py-4 z-50 bg-background">
      <div className="mb-6 flex justify-center">
        <span className="text-2xl ig-gradient-text font-bold">F</span>
      </div>

      <nav className="flex-1 flex flex-col gap-1">
        {/* Home */}
        <NavLink to="/" className={itemBase} onClick={() => setSearchOpen(false)}>
          <span className="relative"><HomeIcon size={24} filled={location.pathname === '/'} /></span>
          <HoverLabel>Home</HoverLabel>
        </NavLink>

        {/* Search (panel) */}
        <button onClick={() => setSearchOpen(o => !o)} className={`${itemBase} ${searchOpen ? 'bg-secondary' : ''}`}>
          <SearchLucide size={24} strokeWidth={searchOpen ? 2.5 : 2} />
          <HoverLabel>Search</HoverLabel>
        </button>

        {/* Explore */}
        <NavLink to="/explore" className={itemBase} onClick={() => setSearchOpen(false)}>
          <Compass size={24} strokeWidth={location.pathname === '/explore' ? 2.5 : 2} />
          <HoverLabel>Explore</HoverLabel>
        </NavLink>

        {/* Reels */}
        <NavLink to="/reels" className={itemBase} onClick={() => setSearchOpen(false)}>
          <ReelsIcon size={24} filled={location.pathname === '/reels'} />
          <HoverLabel>Reels</HoverLabel>
        </NavLink>

        {/* Messages */}
        <NavLink to="/messages" className={itemBase} onClick={() => setSearchOpen(false)}>
          <MessengerIcon size={24} filled={location.pathname === '/messages'} />
          <HoverLabel>Messages</HoverLabel>
        </NavLink>

        {/* Notifications */}
        <button
          onClick={() => { setNotifOpen(o => !o); setSearchOpen(false); }}
          className={`${itemBase} ${notifOpen ? 'bg-secondary' : ''}`}
        >
          <span className="relative">
            <NotificationsIcon size={24} filled={notifOpen} />
            {hasNotifications && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#ff3040] border-2 border-background" />
            )}
          </span>
          <HoverLabel>Notifications</HoverLabel>
        </button>

        <button onClick={() => { setCreateOpen(true); setSearchOpen(false); setNotifOpen(false); }} className={itemBase}>
          <CreateIcon size={24} />
          <HoverLabel>Create</HoverLabel>
        </button>

        {activeAccount && (
          <NavLink
            to={`/profile/${activeAccount.id}`}
            className={itemBase}
            onClick={() => setSearchOpen(false)}
          >
            {activeAccount.profilePicture ? (
              <img
                src={activeAccount.profilePicture}
                alt=""
                className={`w-7 h-7 rounded-full object-cover ${
                  location.pathname === `/profile/${activeAccount.id}` ? 'ring-2 ring-foreground' : ''
                }`}
              />
            ) : (
              <User size={24} />
            )}
            <HoverLabel>Profile</HoverLabel>
          </NavLink>
        )}
      </nav>

      <button
        type="button"
        onClick={() => setTheme(isLight ? 'dark' : 'light')}
        className={`${itemBase} mt-auto ${isLight ? 'bg-secondary text-primary' : ''}`}
        aria-label={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
      >
        <Lightbulb size={22} fill={isLight ? 'currentColor' : 'none'} />
        <HoverLabel>{isLight ? 'Dark mode' : 'Light mode'}</HoverLabel>
      </button>

      <NavLink to="/accounts" className={itemBase} onClick={() => setSearchOpen(false)}>
        <User size={22} />
        <HoverLabel>Manage Accounts</HoverLabel>
      </NavLink>

      <CreatePostModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <SearchPanel open={searchOpen} onClose={() => setSearchOpen(false)} />
      <NotificationsPanel open={notifOpen} onClose={() => setNotifOpen(false)} />
    </aside>
  );
};

export default Sidebar;
