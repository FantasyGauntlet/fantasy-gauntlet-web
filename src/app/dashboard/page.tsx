'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

interface League {
  id: string;
  name: string;
  sport: string;
  state: string;
  memberCount: number;
  maxMembers: number;
  commissionerId: string;
  selectedSports?: string[];
  startDate?: string;
  endDate?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SPORT_ACRONYMS = new Set(['nhl', 'nba', 'nfl', 'mlb', 'ucl', 'ncaa', 'mls', 'fifa', 'ufc']);

function formatSport(id: string) {
  return id.split('-').map(w =>
    SPORT_ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : (w[0]?.toUpperCase() ?? '') + w.slice(1)
  ).join(' ');
}

function formatSeason(start?: string, end?: string): string | null {
  if (!start && !end) return null;
  const fmt = (d: string) => {
    try { return new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', year: '2-digit' }); }
    catch { return d; }
  };
  if (start && end) return `${fmt(start)} – ${fmt(end)}`;
  if (start) return `From ${fmt(start)}`;
  return null;
}

const STATE_META: Record<string, { label: string; cls: string }> = {
  draft:     { label: 'Draft',     cls: 'bg-warn-bg text-warn border-warn/20' },
  auction:   { label: 'Draft',     cls: 'bg-info-bg text-info border-info/20' },
  active:    { label: 'Active',    cls: 'bg-brand-dim text-brand border-brand/20' },
  completed: { label: 'Completed', cls: 'bg-field text-copy-3 border-line' },
  cancelled: { label: 'Cancelled', cls: 'bg-danger-bg text-danger border-danger/20' },
};

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-card border border-line rounded-2xl p-5 animate-pulse">
      <div className="flex items-start justify-between mb-3">
        <div className="h-5 bg-field-2 rounded-lg w-40" />
        <div className="h-6 bg-field-2 rounded-full w-16" />
      </div>
      <div className="flex gap-1.5 mb-4">
        <div className="h-5 bg-field-2 rounded-md w-16" />
        <div className="h-5 bg-field-2 rounded-md w-12" />
        <div className="h-5 bg-field-2 rounded-md w-14" />
      </div>
      <div className="flex justify-between">
        <div className="h-3.5 bg-field-2 rounded w-20" />
        <div className="h-3.5 bg-field-2 rounded w-24" />
      </div>
    </div>
  );
}

// ─── League card ──────────────────────────────────────────────────────────────

function LeagueCard({ league, muted = false, starred = false, onToggleStar }: { league: League; muted?: boolean; starred?: boolean; onToggleStar?: () => void }) {
  const meta = STATE_META[league.state] ?? STATE_META.completed;
  const season = formatSeason(league.startDate, league.endDate);
  return (
    <Link
      href={`/leagues/${league.id}`}
      className={`group border rounded-2xl p-5 transition-all block ${
        muted
          ? 'bg-field border-line hover:border-line-2 hover:bg-card'
          : starred
            ? 'bg-card hover:bg-card-hover border-brand/40 hover:border-brand/60'
            : 'bg-card hover:bg-card-hover border-line hover:border-brand/30'
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <h3 className={`font-semibold leading-snug transition-colors ${muted ? 'text-copy-2 group-hover:text-copy' : 'text-copy group-hover:text-brand'}`}>
          {league.name}
        </h3>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {onToggleStar && (
            <button
              onClick={e => { e.preventDefault(); onToggleStar(); }}
              title={starred ? 'Unstar league' : 'Star league'}
              className={`p-0.5 transition-colors ${starred ? 'text-amber-400 hover:text-amber-300' : 'text-copy-3 opacity-0 group-hover:opacity-100 hover:text-amber-400'}`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill={starred ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </button>
          )}
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full border inline-flex items-center gap-1.5 ${meta.cls}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70 flex-shrink-0" />
            {meta.label}
          </span>
        </div>
      </div>
      {league.selectedSports && league.selectedSports.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {league.selectedSports.slice(0, 3).map(s => (
            <span key={s} className="text-xs bg-field border border-line text-copy-3 px-2 py-0.5 rounded-md">
              {formatSport(s)}
            </span>
          ))}
          {league.selectedSports.length > 3 && (
            <span className="text-xs text-copy-3 self-center">+{league.selectedSports.length - 3}</span>
          )}
        </div>
      )}
      <div className="flex items-center justify-between gap-2 text-xs text-copy-3">
        <span className="flex items-center gap-1">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
          </svg>
          {league.memberCount}{league.maxMembers ? ` / ${league.maxMembers}` : ''}
        </span>
        {season && <span>{season}</span>}
      </div>
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user } = useAuth();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<League[]>('/leagues/mine')
      .then(setLeagues)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const firstName = user?.displayName?.split(' ')[0] ?? user?.email?.split('@')[0] ?? 'there';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const [showPast, setShowPast] = useState(false);
  const [starred, setStarred] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('fg_starred_leagues') ?? '[]')); }
    catch { return new Set<string>(); }
  });

  function toggleStar(id: string) {
    setStarred(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem('fg_starred_leagues', JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  }

  const activeLeagues = leagues.filter(l => l.state !== 'completed' && l.state !== 'cancelled');
  const pastLeagues   = leagues.filter(l => l.state === 'completed' || l.state === 'cancelled');
  const sortedActiveLeagues = [
    ...activeLeagues.filter(l => starred.has(l.id)),
    ...activeLeagues.filter(l => !starred.has(l.id)),
  ];
  const activeCount   = leagues.filter(l => l.state === 'active' || l.state === 'auction').length;
  const draftingCount = leagues.filter(l => l.state === 'draft' || l.state === 'auction').length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-copy-3 text-sm mb-0.5">{greeting}</p>
          <h1 className="text-2xl font-bold text-copy">{firstName}</h1>
        </div>
        <Link
          href="/leagues/new"
          className="flex items-center gap-2 bg-brand hover:bg-brand-2 text-white font-semibold px-4 py-2.5 rounded-xl transition-colors text-sm flex-shrink-0"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New League
        </Link>
      </div>

      {/* Stats */}
      {!loading && leagues.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'My Leagues', value: leagues.length },
            { label: 'In Season',  value: activeCount },
            { label: 'Drafting',   value: draftingCount },
          ].map(s => (
            <div key={s.label} className="bg-card border border-line rounded-xl p-4">
              <p className="text-2xl font-bold text-copy tabular-nums">{s.value}</p>
              <p className="text-copy-3 text-xs mt-0.5 font-medium">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-danger-bg border border-danger/20 rounded-xl p-4 text-danger text-sm">{error}</div>
      )}

      {/* League grid */}
      {loading ? (
        <div>
          <div className="h-3.5 bg-field-2 rounded w-20 mb-3 animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}
          </div>
        </div>
      ) : leagues.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-line rounded-2xl">
          <div className="w-14 h-14 rounded-2xl bg-brand-dim border border-brand/20 flex items-center justify-center mx-auto mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-brand">
              <path d="M6 9H4.5a2.5 2.5 0 010-5H6M18 9h1.5a2.5 2.5 0 000-5H18M3 4h18M6 9v10a1 1 0 001 1h10a1 1 0 001-1V9M9 12h6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-copy mb-1">No leagues yet</h2>
          <p className="text-copy-3 text-sm mb-6 max-w-xs mx-auto">Create your first league or ask a commissioner for an invite.</p>
          <Link
            href="/leagues/new"
            className="inline-flex items-center gap-2 bg-brand hover:bg-brand-2 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Create a League
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Active leagues */}
          {activeLeagues.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-copy-3 uppercase tracking-widest mb-3">My Leagues</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {sortedActiveLeagues.map(league => (
                  <LeagueCard key={league.id} league={league} starred={starred.has(league.id)} onToggleStar={() => toggleStar(league.id)} />
                ))}
              </div>
            </div>
          )}

          {/* Past seasons */}
          {pastLeagues.length > 0 && (
            <div>
              <button
                onClick={() => setShowPast(v => !v)}
                className="flex items-center gap-2 group mb-3"
              >
                <h2 className="text-xs font-semibold text-copy-3 uppercase tracking-widest group-hover:text-copy-2 transition-colors">
                  Past Seasons
                </h2>
                <span className="text-xs text-copy-3 bg-field border border-line px-1.5 py-0.5 rounded-full group-hover:border-line-2 transition-colors">
                  {pastLeagues.length}
                </span>
                <svg
                  width="12" height="12" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                  className={`text-copy-3 transition-transform ${showPast ? 'rotate-180' : ''}`}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {showPast && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {pastLeagues.map(league => <LeagueCard key={league.id} league={league} muted />)}
                </div>
              )}
            </div>
          )}

          {/* Fallback: only past leagues (no active ones) */}
          {activeLeagues.length === 0 && pastLeagues.length === 0 && null}
        </div>
      )}
    </div>
  );
}
