'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { updateProfile } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
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

  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [showProfile, setShowProfile] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    api.get<{ displayName: string }>('/users/me')
      .then(u => setDisplayName(u.displayName))
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    if (showProfile) {
      setNameInput(displayName);
      setSaveError('');
      setTimeout(() => nameRef.current?.focus(), 50);
    }
  }, [showProfile]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    const name = nameInput.trim();
    if (!name) return;
    setSaving(true);
    setSaveError('');
    try {
      await api.patch('/users/me', { displayName: name });
      if (auth?.currentUser) await updateProfile(auth.currentUser, { displayName: name });
      setDisplayName(name);
      setShowProfile(false);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  const initials = displayName
    ? displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : user?.email?.[0].toUpperCase() ?? '?';

  const leagueMatch = pathname.match(/^\/leagues\/([^/]+)(?:\/|$)/);
  const leagueId = leagueMatch?.[1] ?? null;

  const staticLinks = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/leagues',   label: 'Leagues' },
  ];

  return (
    <>
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

              {/* League hover menu */}
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
            {user && <NotificationBell />}

            <button
              onClick={toggle}
              aria-label="Toggle theme"
              className="w-8 h-8 rounded-md flex items-center justify-center text-copy-2 hover:text-copy hover:bg-field transition-colors"
            >
              {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </button>

            {user && (
              <>
                <div className="hidden sm:block w-px h-5 bg-line" />
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowProfile(true)}
                    className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-field transition-colors group"
                    title="Edit profile"
                  >
                    <div className="w-7 h-7 rounded-full bg-brand-dim border border-brand/30 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-semibold text-brand">{initials}</span>
                    </div>
                    <span className="hidden md:block text-xs text-copy-3 group-hover:text-copy max-w-[140px] truncate transition-colors">{user?.email}</span>
                  </button>
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

      {/* Profile edit modal */}
      {showProfile && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setShowProfile(false); }}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative bg-card border border-line rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-copy">Edit Profile</h2>
              <button
                onClick={() => setShowProfile(false)}
                className="w-7 h-7 rounded-md flex items-center justify-center text-copy-3 hover:text-copy hover:bg-field transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <form onSubmit={saveProfile} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-copy-2 mb-1.5">Full name</label>
                <input
                  ref={nameRef}
                  type="text"
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  required
                  className="w-full bg-field border border-line-2 rounded-xl px-4 py-3 text-copy text-sm placeholder-copy-3 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors"
                  placeholder="Your full name"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-copy-2 mb-1.5">Email</label>
                <input
                  type="text"
                  value={user?.email ?? ''}
                  disabled
                  className="w-full bg-field border border-line rounded-xl px-4 py-3 text-copy-3 text-sm cursor-not-allowed"
                />
                <p className="text-xs text-copy-3 mt-1">Email cannot be changed here</p>
              </div>

              {saveError && (
                <p className="text-danger text-xs">{saveError}</p>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowProfile(false)}
                  className="flex-1 bg-field hover:bg-field-2 border border-line text-copy-2 font-medium py-2.5 rounded-xl transition-colors text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !nameInput.trim()}
                  className="flex-1 bg-brand hover:bg-brand-2 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
