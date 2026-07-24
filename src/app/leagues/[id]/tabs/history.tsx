'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Spinner } from '../_components';
import type { Standing } from '../_types';

function HistoryTab({ leagueId, leagueGroupId, previousLeagueId }: { leagueId: string; leagueGroupId?: string; previousLeagueId?: string }) {
  const router = useRouter();
  const [seasons, setSeasons] = useState<{ id: string; name: string; createdAt: string }[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [standings, setStandings] = useState<Standing[] | null>(null);
  const hasSource = !!leagueGroupId || !!previousLeagueId;
  const [loadingSeasons, setLoadingSeasons] = useState(hasSource);
  const [loadingStandings, setLoadingStandings] = useState(false);

  useEffect(() => {
    if (leagueGroupId) {
      api.get<{ id: string; name: string; createdAt: string }[]>(`/leagues/group/${leagueGroupId}`)
        .then(all => {
          const past = all.filter(s => s.id !== leagueId);
          setSeasons(past);
          if (past.length > 0) setSelectedId(past[past.length - 1].id);
        })
        .catch(() => {})
        .finally(() => setLoadingSeasons(false));
    } else if (previousLeagueId) {
      api.get<{ id: string; name: string; createdAt: string }>(`/leagues/${previousLeagueId}`)
        .then(prev => { setSeasons([prev]); setSelectedId(prev.id); })
        .catch(() => {})
        .finally(() => setLoadingSeasons(false));
    }
  }, [leagueGroupId, previousLeagueId, leagueId]);

  useEffect(() => {
    if (!selectedId) return;
    setLoadingStandings(true);
    setStandings(null);
    api.get<Standing[]>(`/leagues/${selectedId}/standings`)
      .then(setStandings)
      .catch(() => setStandings([]))
      .finally(() => setLoadingStandings(false));
  }, [selectedId]);

  if (!hasSource || (!loadingSeasons && seasons.length === 0)) {
    return (
      <div className="bg-card border border-line rounded-2xl p-10 text-center">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-copy-3 mx-auto mb-3">
          <path d="M12 8v4l3 3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M3.05 11a9 9 0 1 1 .5 4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M3 16v-5h5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <p className="text-copy-2 text-sm font-medium">No previous seasons on record.</p>
        <p className="text-copy-3 text-xs mt-1">This is the first season of this franchise.</p>
      </div>
    );
  }

  if (loadingSeasons) return <div className="flex justify-center py-12"><Spinner /></div>;

  const selectedSeason = seasons.find(s => s.id === selectedId);

  return (
    <div className="space-y-4">
      {/* Season selector */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-copy-3 uppercase tracking-widest">Season</span>
        {seasons.map(season => {
          const year = new Date(season.createdAt).getFullYear();
          const isSelected = season.id === selectedId;
          return (
            <button
              key={season.id}
              onClick={() => setSelectedId(season.id)}
              className={`text-xs font-semibold px-3 py-1 rounded-full transition-colors ${
                isSelected
                  ? 'bg-brand text-white'
                  : 'bg-field border border-line text-copy-3 hover:text-copy hover:border-line-2'
              }`}
            >
              {year}
            </button>
          );
        })}
      </div>

      {/* Standings for selected season */}
      {loadingStandings && <div className="flex justify-center py-12"><Spinner /></div>}
      {!loadingStandings && selectedSeason && (
        <div className="bg-card border border-line rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-line flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-copy">
                {new Date(selectedSeason.createdAt).getFullYear()} Final Standings
              </p>
              <p className="text-xs text-copy-3 mt-0.5">{selectedSeason.name}</p>
            </div>
            <button
              onClick={() => router.push(`/leagues/${selectedSeason.id}`)}
              className="text-xs text-brand hover:underline flex-shrink-0"
            >
              View full season →
            </button>
          </div>
          {!standings || standings.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-copy-3 text-sm">No standings data available for this season.</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-line bg-field/50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-copy-3 uppercase tracking-wider">Rank</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-copy-3 uppercase tracking-wider">Manager</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-copy-3 uppercase tracking-wider">Points</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-copy-3 uppercase tracking-wider hidden sm:table-cell">Bonus</th>
                </tr>
              </thead>
              <tbody>
                {standings.map(s => (
                  <tr key={s.userId} className="border-b border-line/50">
                    <td className="px-4 py-3 text-sm font-bold text-copy-2">#{s.rank}</td>
                    <td className="px-4 py-3 text-sm font-medium text-copy">{s.displayName}</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold text-copy">{s.totalPoints.toFixed(1)}</td>
                    <td className="px-4 py-3 text-sm text-right text-copy-3 hidden sm:table-cell">{s.bonusPoints > 0 ? `+${Math.round(s.bonusPoints)}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

export { HistoryTab };
