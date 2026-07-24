'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

const SPORT_LABELS: Record<string, string> = {
  nfl: 'NFL', nba: 'NBA', nhl: 'NHL', mlb: 'MLB',
  'premier-league': 'PL', ucl: 'UCL', mls: 'MLS', ncaa: 'NCAA',
};

const STATE_STYLES: Record<string, string> = {
  draft:     'bg-warn-bg text-warn border-warn/30',
  auction:   'bg-info-bg text-info border-info/20',
  active:    'bg-positive-bg text-positive border-positive/20',
  completed: 'bg-field text-copy-3 border-line',
  cancelled: 'bg-danger-bg text-danger border-danger/20',
};

interface PublicLeague {
  id: string;
  name: string;
  state: string;
  selectedSports: string[];
  memberCap: number | null;
  startDate: string;
  endDate: string;
}

export default function BrowsePage() {
  const [leagues, setLeagues] = useState<PublicLeague[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sportFilter, setSportFilter] = useState('');

  useEffect(() => {
    api.get<PublicLeague[]>('/leagues/public')
      .then(setLeagues)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const allSports = [...new Set(leagues.flatMap(l => l.selectedSports))].sort();

  const filtered = leagues.filter(l => {
    if (l.state !== 'active') return false;
    if (search && !l.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (sportFilter && !l.selectedSports.includes(sportFilter)) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-copy">Browse Leagues</h1>
        <p className="text-copy-3 text-sm mt-1">Find public leagues to request an invite from the commissioner.</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search leagues..."
          className="bg-card border border-line-2 rounded-xl px-4 py-2.5 text-copy text-sm placeholder-copy-3 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors w-64"
        />
        <select
          value={sportFilter}
          onChange={e => setSportFilter(e.target.value)}
          className="bg-card border border-line-2 rounded-xl px-4 py-2.5 text-copy text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors"
        >
          <option value="">All sports</option>
          {allSports.map(s => (
            <option key={s} value={s}>{SPORT_LABELS[s] ?? s}</option>
          ))}
        </select>
      </div>

      {loading && (
        <div className="flex justify-center py-16">
          <div className="w-7 h-7 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="text-center py-16 border border-dashed border-line rounded-2xl">
          <p className="text-copy-2 font-medium text-sm">No leagues found</p>
          <p className="text-copy-3 text-xs mt-1">
            {search || sportFilter ? 'Try clearing your filters.' : 'No public leagues are listed right now.'}
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map(league => (
          <div key={league.id} className="bg-card border border-line rounded-2xl p-5 flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-copy text-sm leading-tight truncate">{league.name}</p>
                <p className="text-xs text-copy-3 mt-0.5">
                  {new Date(league.startDate).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                  {' – '}
                  {new Date(league.endDate).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                </p>
              </div>
              <span className={`flex-shrink-0 text-xs font-medium px-2 py-0.5 rounded-full border ${STATE_STYLES[league.state] ?? STATE_STYLES.completed}`}>
                {league.state}
              </span>
            </div>

            {/* Sports chips */}
            <div className="flex flex-wrap gap-1.5">
              {league.selectedSports.map(s => (
                <span key={s} className="text-xs font-medium px-2 py-0.5 bg-field border border-line rounded-full text-copy-2">
                  {SPORT_LABELS[s] ?? s}
                </span>
              ))}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-2 mt-auto pt-2 border-t border-line/50">
              <span className="text-xs text-copy-3">
                {league.memberCap ? `${league.memberCap} members max` : 'Open roster'}
              </span>
              <Link
                href={`/leagues/${league.id}`}
                className="text-xs font-semibold text-brand hover:text-brand-2 px-3 py-1.5 rounded-lg hover:bg-brand/5 transition-colors"
              >
                View league →
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
