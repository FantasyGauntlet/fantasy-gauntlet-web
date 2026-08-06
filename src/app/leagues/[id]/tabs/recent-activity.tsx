'use client';

import { useState, useEffect, useMemo } from 'react';
import { api } from '@/lib/api';
import { Spinner, timeAgo } from '../_components';
import type { TxEvent, SportTeam, SportGroup, FantasyTeam, WaiverHistoryClaim } from '../_types';

function RecentActivityTab({ leagueId, fantasyTeams }: { leagueId: string; fantasyTeams: FantasyTeam[] }) {
  const [transactions, setTransactions] = useState<TxEvent[]>([]);
  const [allSportTeams, setAllSportTeams] = useState<SportTeam[]>([]);
  const [waiverHistory, setWaiverHistory] = useState<WaiverHistoryClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [expandedBids, setExpandedBids] = useState<Set<string>>(new Set());

  useEffect(() => {
    Promise.all([
      api.get<TxEvent[]>(`/leagues/${leagueId}/transactions`).catch(() => [] as TxEvent[]),
      api.get<SportGroup[]>(`/leagues/${leagueId}/sport-teams`).catch(() => [] as SportGroup[]),
      api.get<WaiverHistoryClaim[]>(`/leagues/${leagueId}/waivers/history`).catch(() => [] as WaiverHistoryClaim[]),
    ]).then(([txs, groups, hist]) => {
      setTransactions(txs);
      setAllSportTeams(groups.flatMap(g => g.teams));
      setWaiverHistory(hist);
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

  const PAGE = 10;
  const visible = showAll ? transactions : transactions.slice(0, PAGE);

  return (
    <div className="bg-card border border-line rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-line flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-copy">Transaction History</p>
          <p className="text-xs text-copy-3 mt-0.5">All accepted trades and approved waiver pickups this season.</p>
        </div>
        {transactions.length > 0 && (
          <span className="text-xs text-copy-3">{transactions.length} total</span>
        )}
      </div>
      {loading ? (
        <div className="flex justify-center py-10"><Spinner size="sm" /></div>
      ) : transactions.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-copy-3 text-sm">No transactions yet.</p>
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
          {transactions.length > PAGE && (
            <div className="px-5 py-3 border-t border-line text-center">
              <button
                onClick={() => setShowAll(v => !v)}
                className="text-sm text-brand hover:text-brand-2 font-medium transition-colors"
              >
                {showAll ? 'Show less' : `Show all ${transactions.length} transactions`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export { RecentActivityTab };
