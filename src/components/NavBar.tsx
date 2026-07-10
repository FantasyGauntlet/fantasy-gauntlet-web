'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import NotificationBell from './NotificationBell';

const LEAGUE_MENU = [
  { label: 'League Home', tab: 'home' },
  { label: 'History',     tab: 'history' },
  { label: 'Rules',       tab: 'rules' },
  { label: 'Recent Activity', tab: 'activity' },
];

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

export default function NavBar() {
  const { user, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const pathname = usePathname();

  const initials = user?.displayName
    ? user.displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : user?.email?.[0].toUpperCase() ?? '?';

  const leagueMatch = pathname.match(/^\/leagues\/([^/]+)(?:\/|$)/);
  const leagueId = leagueMatch?.[1] ?? null;

  const staticLinks = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/leagues',   label: 'Leagues' },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-card/90 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">

        {/* Brand */}
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="flex items-center gap-2 group">
            <img src="/logo.png" alt="Fantasy Gauntlet" className="w-8 h-8 object-contain rounded-lg" />
            <span className="font-bold text-sm text-copy group-hover:text-brand transition-colors">
              Fantasy Gauntlet
            </span>
          </Link>

          {/* Nav links */}
          <nav className="hidden sm:flex items-center gap-1">
            {staticLinks.map(l => {
              const active = l.href === '/leagues'
                ? pathname === '/leagues'
                : pathname.startsWith(l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    active
                      ? 'bg-brand-dim text-brand'
                      : 'text-copy-2 hover:text-copy hover:bg-field'
                  }`}
                >
                  {l.label}
                </Link>
              );
            })}

            {/* League hover menu — shown when inside a league */}
            {leagueId && (
              <div className="relative group">
                <button className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1 ${
                  leagueId ? 'bg-brand-dim text-brand' : 'text-copy-2 hover:text-copy hover:bg-field'
                }`}>
                  League
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                {/* Dropdown — stays open while cursor is anywhere in the group */}
                <div className="absolute hidden group-hover:block left-0 top-full pt-1 z-50 min-w-[180px]">
                  <div className="bg-card border border-line rounded-xl shadow-xl py-1 overflow-hidden">
                    {LEAGUE_MENU.map(item => (
                      <Link
                        key={item.tab}
                        href={`/leagues/${leagueId}?tab=${item.tab}`}
                        className="flex items-center px-4 py-2.5 text-sm text-copy-2 hover:bg-field hover:text-copy transition-colors"
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </nav>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2">
          {/* Notifications */}
          {user && <NotificationBell />}

          {/* Theme toggle */}
          <button
            onClick={toggle}
            aria-label="Toggle theme"
            className="w-8 h-8 rounded-md flex items-center justify-center text-copy-2 hover:text-copy hover:bg-field transition-colors"
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>

          {/* User avatar + sign out */}
          {user && (
            <>
              <div className="hidden sm:block w-px h-5 bg-line" />
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-brand-dim border border-brand/30 flex items-center justify-center">
                  <span className="text-xs font-semibold text-brand">{initials}</span>
                </div>
                <span className="hidden md:block text-xs text-copy-3 max-w-[140px] truncate">{user.email}</span>
                <button
                  onClick={signOut}
                  className="text-xs text-copy-3 hover:text-copy px-2.5 py-1.5 rounded-md hover:bg-field transition-colors"
                >
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
