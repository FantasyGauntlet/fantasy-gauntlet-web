'use client';

import { useState, useEffect, useMemo } from 'react';
import { api } from '@/lib/api';
import { Spinner, timeAgo } from '../_components';
import type { TxEvent, SportTeam, SportGroup, FantasyTeam, WaiverHistoryClaim } from '../_types';

function RecentActivityTab({ leagueId, fantasyTeams, isActive = true }: { leagueId: string; fantasyTeams: FantasyTeam[]; isActive?: boolean }) {
  const [transactions, setTransactions] = useState<TxEvent[]>([]);
  const [allSportTeams, setAllSportTeams] = useState<SportTeam[]>([]);
  const [waiverHistory, setWaiverHistory] = useState<WaiverHistoryClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [expandedBids, setExpandedBids] = useState<Set<string>>(new Set());
  const [teamFilter, setTeamFilter] = useState<string>('');
  const [viewMode, setViewMode] = useState<'list' | 'timeline'>(() => {
    try { return (localStorage.getItem('fg_activity_view') as 'list' | 'timeline') ?? 'list'; }
    catch { return 'list'; }
  });

  useEffect(() => {
    if (!isActive) setTeamFilter('');
  }, [isActive]);

  useEffect(() => {
    Promise.all([
      api.get<TxEvent[]>(`/leagues/${leagueId}/transactions`).catch(() => [] as TxEvent[]),
      api.get<SportGroup[]>(`/leagues/${leagueId}/sport-teams`).catch(() => [] as SportGroup[]),
      api.get<WaiverHistoryClaim[]>(`/leagues/${leagueId}/waivers/history`).catch(() => [] as WaiverHistoryClaim[]),
    ]).then(([txs, groups, hist]) => {
      setTransactions(txs);
      setAllSportTeams(groups.flatMap(g => g.teams));
      setWaiverHistory(hist);
      if (txs.length > 0) {
        const latest = txs.reduce((max, t) => t.date > max ? t.date : max, txs[0].date);
        try { localStorage.setItem(`fg_activity_ts_${leagueId}`, latest); } catch {}
      }
    }).finally(() => setLoading(false));
  }, [leagueId]);

  function toggleBids(id: string) {
    setExpandedBids((prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const sportTeamById = useMemo(() => new Map(allSportTeams.map(t => [t.id, t])), [allSportTeams]);
  const ftById = useMemo(() => new Map(fantasyTeams.map(ft => [ft.id, ft])), [fantasyTeams]);

  const filteredTransactions = useMemo(() => {
    if (!teamFilter) return transactions;
    const ft = ftById.get(teamFilter);
    if (!ft) return transactions;
    return transactions.filter(tx => {
      if (tx.type === 'trade') {
        return tx.proposerFantasyTeamId === teamFilter || tx.receiverFantasyTeamId === teamFilter;
      }
      return tx.claimantUserId === ft.userId;
    });
  }, [transactions, teamFilter, ftById]);

  const PAGE = 10;
  const visible = showAll ? filteredTransactions : filteredTransactions.slice(0, PAGE);

  const timelineGroups = useMemo(() => {
    const groups = new Map<string, typeof filteredTransactions>();
    for (const tx of filteredTransactions) {
      const key = new Date(tx.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(tx);
    }
    return [...groups.entries()];
  }, [filteredTransactions]);

  return (
    <div className="bg-card border border-line rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-line flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-copy">Transaction History</p>
          <p className="text-xs text-copy-3 mt-0.5">All accepted trades and approved waiver pickups this season.</p>
        </div>
        {transactions.length > 0 && (
          <div className="flex items-center gap-2">
            <select
              value={teamFilter}
              onChange={e => { setTeamFilter(e.target.value); setShowAll(false); }}
              className="text-xs bg-field border border-line text-copy-2 rounded-lg px-2 py-1.5 focus:outline-none focus:border-brand transition-colors"
            >
              <option value="">All teams</option>
              {fantasyTeams
                .filter(ft => !ft.isPlaceholder)
                .map(ft => <option key={ft.id} value={ft.id}>{ft.displayName}</option>)}
            </select>
            <span className="text-xs text-copy-3 flex-shrink-0 hidden sm:inline">
              {teamFilter
                ? `${filteredTransactions.length} of ${transactions.length}`
                : `${transactions.length} total`}
            </span>
            <div className="flex items-center gap-0.5 bg-field border border-line rounded-lg p-0.5">
              <button
                onClick={() => { setViewMode('list'); try { localStorage.setItem('fg_activity_view', 'list'); } catch {} }}
                title="List view"
                className={`p-1.5 rounded transition-colors ${viewMode === 'list' ? 'bg-card text-copy shadow-sm' : 'text-copy-3 hover:text-copy-2'}`}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
                  <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
                </svg>
              </button>
              <button
                onClick={() => { setViewMode('timeline'); try { localStorage.setItem('fg_activity_view', 'timeline'); } catch {} }}
                title="Timeline view"
                className={`p-1.5 rounded transition-colors ${viewMode === 'timeline' ? 'bg-card text-copy shadow-sm' : 'text-copy-3 hover:text-copy-2'}`}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="2" x2="12" y2="22" /><circle cx="12" cy="7" r="2" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" /><circle cx="12" cy="17" r="2" fill="currentColor" stroke="none" />
                  <line x1="12" y1="7" x2="20" y2="7" /><line x1="12" y1="12" x2="20" y2="12" /><line x1="12" y1="17" x2="20" y2="17" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>
      {loading ? (
        <div className="flex justify-center py-10"><Spinner size="sm" /></div>
      ) : filteredTransactions.length === 0 ? (
        <div className="text-center py-12 px-6">
          <div className="w-10 h-10 rounded-xl bg-field border border-line flex items-center justify-center mx-auto mb-3">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-copy-3">
              <path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
            </svg>
          </div>
          <p className="text-copy-2 text-sm font-medium">
            {teamFilter ? 'No transactions for this team' : 'No transactions yet'}
          </p>
          <p className="text-copy-3 text-xs mt-1">
            {teamFilter ? 'Try a different team filter.' : 'Accepted trades and approved waivers will appear here.'}
          </p>
        </div>
      ) : viewMode === 'timeline' ? (
        <div className="px-5 py-4 space-y-6">
          {timelineGroups.map(([dateLabel, txs]) => (
            <div key={dateLabel} className="relative pl-5">
              <div className="absolute left-0 top-0 bottom-0 w-px bg-line/60" />
              <p className="text-[10px] font-semibold uppercase tracking-widest text-copy-3 mb-3 -ml-5 pl-5 relative before:absolute before:left-[-4.5px] before:top-[4px] before:w-2 before:h-2 before:rounded-full before:bg-line before:border-2 before:border-card">
                {dateLabel}
              </p>
              <div className="space-y-3">
                {txs.map(tx => {
                  const isTrade = tx.type === 'trade';
                  const proposerFt = isTrade ? ftById.get(tx.proposerFantasyTeamId) : null;
                  const receiverFt = isTrade ? ftById.get(tx.receiverFantasyTeamId) : null;
                  const offeredNames = isTrade ? tx.offeredSportTeamIds.map(txid => sportTeamById.get(txid)?.name ?? txid) : [];
                  const requestedNames = isTrade ? tx.requestedSportTeamIds.map(txid => sportTeamById.get(txid)?.name ?? txid) : [];
                  const addTeamName = !isTrade ? (sportTeamById.get(tx.addTeamId)?.name ?? tx.addTeamId) : '';
                  const dropTeamName = !isTrade && tx.dropTeamId ? (sportTeamById.get(tx.dropTeamId)?.name ?? tx.dropTeamId) : null;
                  return (
                    <div key={tx.id} className="flex gap-3">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 -ml-8 ${isTrade ? 'bg-info-bg border border-info/30' : 'bg-warn-bg border border-warn/30'}`}>
                        {isTrade ? (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-info">
                            <path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
                          </svg>
                        ) : (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-warn">
                            <path d="M8 7h12M8 12h12M8 17h12M4 7h.01M4 12h.01M4 17h.01" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0 bg-field/40 rounded-xl px-3 py-2.5 border border-line/40">
                        <p className="text-xs text-copy-3 mb-0.5">{timeAgo(tx.date)}</p>
                        {isTrade ? (
                          <p className="text-sm text-copy leading-snug">
                            <span className="font-semibold">{proposerFt?.displayName ?? '—'}</span>
                            <span className="text-copy-3"> traded </span>
                            <span className="text-danger font-medium">{offeredNames.join(', ')}</span>
                            <span className="text-copy-3"> for </span>
                            <span className="text-positive font-medium">{requestedNames.join(', ')}</span>
                            <span className="text-copy-3"> with </span>
                            <span className="font-semibold">{receiverFt?.displayName ?? '—'}</span>
                          </p>
                        ) : (
                          <p className="text-sm text-copy leading-snug">
                            <span className="font-semibold">{tx.claimantDisplayName}</span>
                            <span className="text-copy-3"> added </span>
                            <span className="text-positive font-medium">{addTeamName}</span>
                            {tx.faabBid != null && <span className="inline-block text-xs font-bold text-copy-3 bg-field border border-line rounded px-1.5 py-0.5 ml-1.5 align-middle">${tx.faabBid}</span>}
                            {dropTeamName && <><span className="text-copy-3"> · dropped </span><span className="text-danger font-medium">{dropTeamName}</span></>}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="divide-y divide-line/30">
            {visible.map(tx => {
              if (tx.type === 'trade') {
                const proposerFt = ftById.get(tx.proposerFantasyTeamId);
                const receiverFt = ftById.get(tx.receiverFantasyTeamId);
                const offeredNames = tx.offeredSportTeamIds.map(id => sportTeamById.get(id)?.name ?? id);
                const requestedNames = tx.requestedSportTeamIds.map(id => sportTeamById.get(id)?.name ?? id);
                return (
                  <div key={tx.id} className="px-5 py-3.5 flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-info-bg border border-info/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-info">
                        <path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-copy-3 mb-0.5">{timeAgo(tx.date)}</p>
                      <p className="text-sm text-copy leading-snug">
                        <span className="font-semibold">{proposerFt?.displayName ?? '—'}</span>
                        <span className="text-copy-3"> traded </span>
                        <span className="text-danger font-medium">{offeredNames.join(', ')}</span>
                        <span className="text-copy-3"> to </span>
                        <span className="font-semibold">{receiverFt?.displayName ?? '—'}</span>
                        <span className="text-copy-3"> for </span>
                        <span className="text-positive font-medium">{requestedNames.join(', ')}</span>
                      </p>
                    </div>
                  </div>
                );
              } else {
                const addTeamName = sportTeamById.get(tx.addTeamId)?.name ?? tx.addTeamId;
                const dropTeamName = tx.dropTeamId ? (sportTeamById.get(tx.dropTeamId)?.name ?? tx.dropTeamId) : null;
                const losers = waiverHistory.filter(
                  (c: WaiverHistoryClaim) => c.addTeamId === tx.addTeamId && c.status !== 'approved' &&
                    c.claimantUserId !== tx.claimantUserId &&
                    c.denialReason !== 'Superseded by higher priority claim',
                );
                const isExpanded = expandedBids.has(tx.id);
                return (
                  <div key={tx.id}>
                    <div className={`px-5 flex items-start gap-3 ${losers.length > 0 ? 'pt-4 pb-2' : 'py-4'}`}>
                      <div className="w-6 h-6 rounded-full bg-warn-bg border border-warn/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-warn">
                          <path d="M8 7h12M8 12h12M8 17h12M4 7h.01M4 12h.01M4 17h.01" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-copy-3 mb-0.5">{timeAgo(tx.date)}</p>
                        <p className="text-sm text-copy leading-snug">
                          <span className="font-semibold">{tx.claimantDisplayName}</span>
                          <span className="text-copy-3"> added </span>
                          <span className="text-positive font-medium">{addTeamName}</span>
                          {tx.faabBid != null && (
                            <span className="inline-block text-xs font-bold text-copy-3 bg-field border border-line rounded px-1.5 py-0.5 ml-1.5 align-middle">${tx.faabBid}</span>
                          )}
                          {dropTeamName && (
                            <>
                              <span className="text-copy-3"> and dropped </span>
                              <span className="text-danger font-medium">{dropTeamName}</span>
                            </>
                          )}
                        </p>
                        {losers.length > 0 && (
                          <button
                            onClick={() => toggleBids(tx.id)}
                            className="mt-2 flex items-center gap-1.5 text-[11px] text-copy-3 hover:text-copy transition-colors"
                          >
                            <svg
                              width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                              className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                            >
                              <polyline points="6 9 12 15 18 9" />
                            </svg>
                            {losers.length} competing bid{losers.length > 1 ? 's' : ''}
                          </button>
                        )}
                      </div>
                    </div>
                    {isExpanded && losers.length > 0 && (
                      <div className="mx-5 mb-5 ml-14">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-copy-3 mb-2 px-1">Competing bids</p>
                        <div className="rounded-xl overflow-hidden border border-line divide-y divide-line/50">
                          {losers
                            .sort((a, b) => (b.faabBid ?? 0) - (a.faabBid ?? 0))
                            .map(loser => (
                              <div key={loser.id} className="flex items-center justify-between px-4 py-3 bg-field">
                                <div className="flex items-center gap-2">
                                  <div className="w-1.5 h-1.5 rounded-full bg-danger/50 flex-shrink-0" />
                                  <span className="text-sm font-medium text-copy-2">{loser.claimantDisplayName}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                  {loser.faabBid != null && (
                                    <span className="text-sm font-semibold text-copy-3 tabular-nums">${loser.faabBid}</span>
                                  )}
                                  <span className="text-xs text-danger/80 font-medium bg-danger/10 px-2 py-0.5 rounded-full">
                                    lost
                                  </span>
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              }
            })}
          </div>
          {filteredTransactions.length > PAGE && (
            <div className="px-5 py-3 border-t border-line text-center">
              <button
                onClick={() => setShowAll(v => !v)}
                className="text-sm text-brand hover:text-brand-2 font-medium transition-colors"
              >
                {showAll ? 'Show less' : `Show all ${filteredTransactions.length} transactions`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export { RecentActivityTab };
