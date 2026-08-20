'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

interface MyLeague {
  id: string;
  name: string;
  state: string;
  myTeamId: string | null;
  myTeamName: string | null;
  myRank: number | null;
  totalMembers: number;
}

const ACTIVE_STATES = new Set(['active', 'draft', 'auction']);

const STATE_LABEL: Record<string, string> = {
  active: 'Active',
  draft: 'Draft',
  auction: 'Auction',
};

const STATE_STYLE: Record<string, string> = {
  active:  'bg-positive-bg text-positive border-positive/20',
  draft:   'bg-warn-bg text-warn border-warn/30',
  auction: 'bg-info-bg text-info border-info/20',
};

const NAV_ITEMS = [
  {
    href: '/dashboard',
    label: 'Home',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    href: '/leagues',
    label: 'Leagues',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 9H4.5a2.5 2.5 0 010-5H6M18 9h1.5a2.5 2.5 0 000-5H18M3 4h18M6 9v10a1 1 0 001 1h10a1 1 0 001-1V9M9 12h6" />
      </svg>
    ),
  },
  {
    href: '/settings',
    label: 'Settings',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
      </svg>
    ),
  },
];

function RosterSheetIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 7h6M9 12h6M9 17h4" />
    </svg>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400 flex-shrink-0">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

export function BottomNav() {
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [leagues, setLeagues] = useState<MyLeague[]>([]);
  const [loading, setLoading] = useState(false);
  const [starred, setStarred] = useState<Set<string>>(new Set());
  const fetchedRef = useRef(false);

  // Load starred leagues from localStorage (same key as dashboard)
  useEffect(() => {
    try {
      setStarred(new Set(JSON.parse(localStorage.getItem('fg_starred_leagues') ?? '[]')));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!sheetOpen || fetchedRef.current || !user) return;
    fetchedRef.current = true;
    setLoading(true);
    api.get<MyLeague[]>('/leagues/mine')
      .then(data => setLeagues(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [sheetOpen, user]);

  // Close on route change
  useEffect(() => { setSheetOpen(false); }, [pathname]);

  if (!user) return null;

  const handleTeamClick = (leagueId: string) => {
    setSheetOpen(false);
    router.push(`/leagues/${leagueId}?tab=roster`);
  };

  // Filter to active/draft/auction only, then sort: starred first
  const visibleLeagues = leagues
    .filter(l => ACTIVE_STATES.has(l.state))
    .sort((a, b) => {
      const aStarred = starred.has(a.id) ? 0 : 1;
      const bStarred = starred.has(b.id) ? 0 : 1;
      return aStarred - bStarred;
    });

  return (
    <>
      {/* Bottom sheet overlay */}
      {sheetOpen && (
        <div
          className="sm:hidden fixed inset-0 z-50 flex flex-col justify-end"
          onClick={() => setSheetOpen(false)}
        >
          <div className="absolute inset-0 bg-black/40" />

          <div
            className="relative bg-card rounded-t-2xl border-t border-line pb-safe-bottom max-h-[70vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 rounded-full bg-line" />
            </div>

            <div className="px-4 pb-3 border-b border-line flex-shrink-0">
              <h2 className="text-base font-semibold text-copy">My Rosters</h2>
              <p className="text-xs text-copy-3 mt-0.5">Tap a team to view its roster</p>
            </div>

            <div className="overflow-y-auto flex-1">
              {loading && (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                </div>
              )}

              {!loading && visibleLeagues.length === 0 && (
                <div className="text-center py-8 px-4">
                  <p className="text-sm text-copy-3">No active leagues right now.</p>
                </div>
              )}

              {!loading && visibleLeagues.map(league => (
                <button
                  key={league.id}
                  onClick={() => handleTeamClick(league.id)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-field active:bg-field transition-colors border-b border-line/50 last:border-b-0 text-left"
                >
                  {/* Star indicator */}
                  <div className="w-3 flex-shrink-0 flex items-center justify-center">
                    {starred.has(league.id) && <StarIcon filled />}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p className="text-sm font-semibold text-copy truncate">
                        {league.myTeamName ?? 'My Team'}
                      </p>
                      <span className={`flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${STATE_STYLE[league.state] ?? 'bg-field text-copy-3 border-line'}`}>
                        {STATE_LABEL[league.state] ?? league.state}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-xs text-copy-3 truncate">{league.name}</p>
                      {league.myRank != null && (
                        <span className="text-xs text-copy-3 flex-shrink-0">
                          · #{league.myRank}{league.totalMembers > 0 ? `/${league.totalMembers}` : ''}
                        </span>
                      )}
                    </div>
                  </div>

                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-copy-3 flex-shrink-0">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              ))}

              <div className="h-4" />
            </div>
          </div>
        </div>
      )}

      {/* Nav bar */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-card/95 backdrop-blur-sm border-t border-line safe-area-pb">
        <div className="flex items-stretch">
          {(() => {
            const item = NAV_ITEMS[0];
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                href={item.href}
                className={`flex-1 flex flex-col items-center justify-center gap-1 py-2.5 transition-colors ${
                  isActive ? 'text-brand' : 'text-copy-3 hover:text-copy-2'
                }`}
              >
                {item.icon}
                <span className="text-[10px] font-medium leading-none">{item.label}</span>
              </Link>
            );
          })()}

          <button
            onClick={() => setSheetOpen(true)}
            className={`flex-1 flex flex-col items-center justify-center gap-1 py-2.5 transition-colors ${
              sheetOpen ? 'text-brand' : 'text-copy-3 hover:text-copy-2'
            }`}
          >
            <RosterSheetIcon />
            <span className="text-[10px] font-medium leading-none">Rosters</span>
          </button>

          {NAV_ITEMS.slice(1).map(item => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex-1 flex flex-col items-center justify-center gap-1 py-2.5 transition-colors ${
                  isActive ? 'text-brand' : 'text-copy-3 hover:text-copy-2'
                }`}
              >
                {item.icon}
                <span className="text-[10px] font-medium leading-none">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
