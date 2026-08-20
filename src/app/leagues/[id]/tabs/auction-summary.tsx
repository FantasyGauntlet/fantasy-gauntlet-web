'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Spinner, formatLeagueName } from '../_components';
import type { SportGroup, SportTeam, FantasyTeam } from '../_types';

interface AuctionLot {
  teamId: string;
  winnerId: string | null;
  winningBid: number;
  passed: boolean;
}

interface AuctionResultDoc {
  id: string;
  leagueId: string;
  completedAt: string;
  lots: AuctionLot[];
}

interface DraftPick {
  pickIndex: number;
  pickerUserId: string;
  teamId: string;
}

interface DraftResultDoc {
  id: string;
  leagueId: string;
  completedAt: string;
  nominationMode: string;
  picks: DraftPick[];
}

function AuctionSummaryTab({
  leagueId, fantasyTeams, isSnake,
}: {
  leagueId: string;
  fantasyTeams: FantasyTeam[];
  isSnake?: boolean;
}) {
  const [result, setResult] = useState<AuctionResultDoc | null>(null);
  const [draftResult, setDraftResult] = useState<DraftResultDoc | null>(null);
  const [sportTeams, setSportTeams] = useState<Map<string, SportTeam>>(new Map());
  const [loading, setLoading] = useState(true);

  const [view, setView] = useState<'results' | 'managers'>('results');
  const [search, setSearch] = useState('');
  const [sportFilter, setSportFilter] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [sortBy, setSortBy] = useState<'bid-desc' | 'bid-asc' | 'team' | 'owner'>('bid-desc');

  useEffect(() => {
    const resultsCall = isSnake
      ? api.get<DraftResultDoc | null>(`/leagues/${leagueId}/auction/draft-results`).catch(() => null)
      : api.get<AuctionResultDoc | null>(`/leagues/${leagueId}/auction/results`).catch(() => null);

    Promise.all([
      resultsCall,
      api.get<SportGroup[]>(`/leagues/${leagueId}/sport-teams`).catch(() => [] as SportGroup[]),
    ]).then(([res, groups]) => {
      if (isSnake) setDraftResult(res as DraftResultDoc | null);
      else setResult(res as AuctionResultDoc | null);
      const map = new Map<string, SportTeam>();
      for (const g of groups) for (const t of g.teams) map.set(t.id, t);
      setSportTeams(map);
    }).finally(() => setLoading(false));
  }, [leagueId, isSnake]);

  const ownerByUserId = new Map(fantasyTeams.map(ft => [ft.userId, ft.displayName]));

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;

  // ── Snake draft ADP view ───────────────────────────────────────────────────
  if (isSnake) {
    if (!draftResult) {
      return (
        <div className="text-center py-16 border border-dashed border-line rounded-2xl">
          <p className="text-copy-3 text-sm">No draft results yet — the ADP summary appears once the draft is complete.</p>
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <div className="bg-card border border-line rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-line flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-copy">ADP — Average Draft Position</p>
              <p className="text-xs text-copy-3 mt-0.5">{draftResult.picks.length} picks · {new Date(draftResult.completedAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}</p>
            </div>
          </div>
          <div className="divide-y divide-line">
            {draftResult.picks.map((pick) => {
              const team = sportTeams.get(pick.teamId);
              const manager = ownerByUserId.get(pick.pickerUserId) ?? pick.pickerUserId;
              const ft = fantasyTeams.find(f => f.userId === pick.pickerUserId);
              return (
                <div key={pick.pickIndex} className="flex items-center gap-3 px-4 py-3 hover:bg-field/40 transition-colors">
                  <span className="text-sm font-bold tabular-nums text-copy-3 w-8 text-right flex-shrink-0">
                    #{pick.pickIndex + 1}
                  </span>
                  {team?.logoUrl ? (
                    <img src={team.logoUrl} alt={team.name} className="w-8 h-8 object-contain flex-shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded-lg bg-field border border-line flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-copy truncate">{team?.name ?? pick.teamId}</p>
                    <p className="text-xs text-copy-3">{formatLeagueName(team?.sportLeagueId ?? '')}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-semibold text-copy">{ft?.displayName ?? manager}</p>
                    <p className="text-xs text-copy-3">Pick #{pick.pickIndex + 1}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── Auction summary view ───────────────────────────────────────────────────
  if (!result) {
    return (
      <div className="text-center py-16 border border-dashed border-line rounded-2xl">
        <p className="text-copy-3 text-sm">No auction results yet — the summary appears once the draft is complete.</p>
      </div>
    );
  }

  const sold: AuctionLot[] = result.lots.filter((l: AuctionLot) => !l.passed && l.winnerId);
  const passed: AuctionLot[] = result.lots.filter((l: AuctionLot) => l.passed);
  const totalSpent = sold.reduce((s: number, l: AuctionLot) => s + l.winningBid, 0);

  const managerRows = fantasyTeams
    .map(ft => {
      const wins = sold.filter(l => l.winnerId === ft.userId);
      const spent = wins.reduce((s, l) => s + l.winningBid, 0);
      const bySport: Record<string, { count: number; spent: number }> = {};
      for (const lot of wins) {
        const sport = sportTeams.get(lot.teamId)?.sportLeagueId ?? 'other';
        if (!bySport[sport]) bySport[sport] = { count: 0, spent: 0 };
        bySport[sport].count++;
        bySport[sport].spent += lot.winningBid;
      }
      const topLot = wins.length > 0 ? wins.reduce((a, b) => b.winningBid > a.winningBid ? b : a) : null;
      return {
        ft,
        teamsBought: wins.length,
        totalSpent: spent,
        avgPrice: wins.length > 0 ? Math.round((spent / wins.length) * 10) / 10 : 0,
        bySport,
        topPick: topLot ? { name: sportTeams.get(topLot.teamId)?.name ?? topLot.teamId, bid: topLot.winningBid } : null,
      };
    })
    .sort((a, b) => b.totalSpent - a.totalSpent);

  // Derive unique sports and owners from the sold lots for filter options
  const availableSports = [...new Set(
    sold.map((l: AuctionLot) => sportTeams.get(l.teamId)?.sportLeagueId).filter(Boolean) as string[]
  )].sort();
  const availableOwners = [...new Set(
    sold.map((l: AuctionLot) => l.winnerId ? (ownerByUserId.get(l.winnerId) ?? 'Unknown') : null).filter(Boolean) as string[]
  )].sort();

  const q = search.trim().toLowerCase();
  const filtered: AuctionLot[] = sold
    .filter((l: AuctionLot) => {
      const st = sportTeams.get(l.teamId);
      const ownerName = l.winnerId ? (ownerByUserId.get(l.winnerId) ?? 'Unknown') : '';
      if (sportFilter && st?.sportLeagueId !== sportFilter) return false;
      if (ownerFilter && ownerName !== ownerFilter) return false;
      if (q && !st?.name.toLowerCase().includes(q) && !ownerName.toLowerCase().includes(q)) return false;
      return true;
    })
    .sort((a: AuctionLot, b: AuctionLot) => {
      if (sortBy === 'bid-desc') return b.winningBid - a.winningBid;
      if (sortBy === 'bid-asc') return a.winningBid - b.winningBid;
      if (sortBy === 'team') return (sportTeams.get(a.teamId)?.name ?? '').localeCompare(sportTeams.get(b.teamId)?.name ?? '');
      if (sortBy === 'owner') {
        const oa = a.winnerId ? (ownerByUserId.get(a.winnerId) ?? '') : '';
        const ob = b.winnerId ? (ownerByUserId.get(b.winnerId) ?? '') : '';
        return oa.localeCompare(ob);
      }
      return 0;
    });

  const isFiltered = q || sportFilter || ownerFilter;

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card border border-line rounded-2xl p-4">
          <p className="text-xs text-copy-3 uppercase tracking-wider mb-1">Teams Sold</p>
          <p className="text-2xl font-bold text-copy">{sold.length}</p>
        </div>
        <div className="bg-card border border-line rounded-2xl p-4">
          <p className="text-xs text-copy-3 uppercase tracking-wider mb-1">Total Spent</p>
          <p className="text-2xl font-bold text-copy">${totalSpent}</p>
        </div>
        <div className="bg-card border border-line rounded-2xl p-4">
          <p className="text-xs text-copy-3 uppercase tracking-wider mb-1">Passed</p>
          <p className="text-2xl font-bold text-copy">{passed.length}</p>
        </div>
      </div>

      {/* View toggle */}
      <div className="flex bg-field border border-line rounded-xl p-1 w-fit">
        {(['results', 'managers'] as const).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              view === v ? 'bg-card text-copy shadow-sm border border-line' : 'text-copy-3 hover:text-copy-2'
            }`}
          >
            {v === 'results' ? 'Results' : 'By Manager'}
          </button>
        ))}
      </div>

      {/* Manager breakdown */}
      {view === 'managers' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {managerRows.map(({ ft, teamsBought, totalSpent: spent, avgPrice, bySport, topPick }) => {
            const initials = ft.displayName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
            return (
              <div key={ft.id} className="bg-card border border-line rounded-2xl p-4 space-y-3">
                {/* Header */}
                <div className="flex items-center gap-3">
                  {ft.logoUrl ? (
                    <img src={ft.logoUrl} alt={ft.displayName} className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-brand-dim border border-brand/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-semibold text-brand">{initials}</span>
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-copy truncate">{ft.displayName}</p>
                    <p className="text-xs text-copy-3">{teamsBought} team{teamsBought !== 1 ? 's' : ''} drafted</p>
                  </div>
                  <p className="ml-auto text-lg font-bold text-copy tabular-nums">${spent}</p>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-field rounded-xl px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wider text-copy-3 mb-0.5">Avg price</p>
                    <p className="text-sm font-bold text-copy tabular-nums">${avgPrice}</p>
                  </div>
                  <div className="bg-field rounded-xl px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wider text-copy-3 mb-0.5">Top pick</p>
                    <p className="text-sm font-bold text-copy truncate">{topPick ? `${topPick.name} ($${topPick.bid})` : '—'}</p>
                  </div>
                </div>

                {/* Sport breakdown */}
                {Object.keys(bySport).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(bySport).map(([sport, { count, spent: s }]) => (
                      <span key={sport} className="inline-flex items-center gap-1 bg-field border border-line rounded-lg px-2 py-1 text-xs text-copy-2">
                        <span className="font-medium">{formatLeagueName(sport)}</span>
                        <span className="text-copy-3">· {count} · ${s}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Results table */}
      {view === 'results' && (
      <div className="bg-card border border-line rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-line flex items-center justify-between">
          <p className="text-sm font-semibold text-copy">Auction Results</p>
          <p className="text-xs text-copy-3">
            {new Date(result.completedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
        </div>

        {/* Search + filters */}
        <div className="px-4 py-3 border-b border-line space-y-2.5 bg-field/20">
          <input
            type="text"
            value={search}
            onChange={(e: { target: HTMLInputElement }) => setSearch(e.target.value)}
            placeholder="Search team or owner…"
            className="w-full bg-field border border-line-2 rounded-xl px-3 py-2 text-sm text-copy placeholder-copy-3 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors"
          />
          <div className="flex gap-2 flex-wrap">
            <select
              value={sportFilter}
              onChange={e => setSportFilter(e.target.value)}
              className="bg-field border border-line-2 rounded-lg px-3 py-1.5 text-xs text-copy focus:outline-none focus:border-brand transition-colors"
            >
              <option value="">All Sports</option>
              {availableSports.map(s => (
                <option key={s} value={s}>{formatLeagueName(s)}</option>
              ))}
            </select>
            <select
              value={ownerFilter}
              onChange={e => setOwnerFilter(e.target.value)}
              className="bg-field border border-line-2 rounded-lg px-3 py-1.5 text-xs text-copy focus:outline-none focus:border-brand transition-colors"
            >
              <option value="">All Owners</option>
              {availableOwners.map(o => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as typeof sortBy)}
              className="bg-field border border-line-2 rounded-lg px-3 py-1.5 text-xs text-copy focus:outline-none focus:border-brand transition-colors"
            >
              <option value="bid-desc">Bid: High → Low</option>
              <option value="bid-asc">Bid: Low → High</option>
              <option value="team">Team Name A–Z</option>
              <option value="owner">Owner A–Z</option>
            </select>
            {isFiltered && (
              <button
                onClick={() => { setSearch(''); setSportFilter(''); setOwnerFilter(''); }}
                className="text-xs text-copy-3 hover:text-copy px-2 py-1.5 rounded-lg hover:bg-field transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-line bg-field/50">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-copy-3 uppercase tracking-wider">Team</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-copy-3 uppercase tracking-wider hidden sm:table-cell">Sport</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-copy-3 uppercase tracking-wider">Owner</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-copy-3 uppercase tracking-wider">Bid</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-copy-3">
                    No results match your filters.
                  </td>
                </tr>
              ) : filtered.map(lot => {
                const st = sportTeams.get(lot.teamId);
                const ownerName = lot.winnerId ? (ownerByUserId.get(lot.winnerId) ?? 'Unknown') : '—';
                return (
                  <tr key={lot.teamId} className="border-b border-line/40 hover:bg-field/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        {st?.logoUrl ? (
                          <img src={st.logoUrl} alt={st.name} className="w-7 h-7 object-contain flex-shrink-0" />
                        ) : (
                          <div className="w-7 h-7 rounded-lg bg-field-2 border border-line flex items-center justify-center flex-shrink-0">
                            <span className="text-[10px] font-bold text-copy-3">{(st?.name ?? '?').slice(0, 2).toUpperCase()}</span>
                          </div>
                        )}
                        <span className="text-sm font-medium text-copy">{st?.name ?? lot.teamId}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className="text-xs text-copy-3">{st ? formatLeagueName(st.sportLeagueId) : '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-copy-2">{ownerName}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-bold text-copy">${lot.winningBid}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {passed.length > 0 && (
          <div className="px-4 py-3 border-t border-line/50 bg-field/20">
            <p className="text-xs text-copy-3">
              {passed.length} team{passed.length !== 1 ? 's' : ''} passed (no bids): {passed.map(l => sportTeams.get(l.teamId)?.name ?? l.teamId).join(', ')}
            </p>
          </div>
        )}
      </div>
      )}
    </div>
  );
}

export { AuctionSummaryTab };
