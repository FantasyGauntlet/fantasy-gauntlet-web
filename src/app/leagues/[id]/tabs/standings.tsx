'use client';

import { useState, useEffect, useRef, Fragment } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { api } from '@/lib/api';
import { db } from '@/lib/firebase';
import { useTeamProfile } from '@/context/TeamProfileContext';
import { Spinner, Lightbox, formatLeagueName, formatRecord, SPORT_ORDER } from '../_components';
import type { Standing, FantasyTeam } from '../_types';

function StandingsTab({ leagueId, userId, fantasyTeams, topZone, bottomZone, ownerNameByUserId, liveTeamIds, initialStandings, selectedSports, maxWildcard }: { leagueId: string; userId?: string; fantasyTeams: FantasyTeam[]; topZone?: number | null; bottomZone?: number | null; ownerNameByUserId: Record<string, string>; liveTeamIds?: Set<string>; initialStandings?: Standing[]; selectedSports?: string[]; maxWildcard?: number; }) {
  const [standings, setStandings] = useState<Standing[]>(() => initialStandings ?? []);
  const [loading, setLoading] = useState(!initialStandings?.length);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const { openProfile } = useTeamProfile();

  const storageKey = `fg_standings_${leagueId}`;
  const [prevRanks] = useState<Record<string, number>>(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) ?? '{}'); }
    catch { return {}; }
  });
  const storedRef = useRef(false);

  useEffect(() => {
    if (standings.length === 0 || storedRef.current) return;
    storedRef.current = true;
    const t = setTimeout(() => {
      const snap: Record<string, number> = {};
      standings.forEach(s => { snap[s.userId] = s.rank; });
      try { localStorage.setItem(storageKey, JSON.stringify(snap)); } catch {}
    }, 8000);
    return () => clearTimeout(t);
  }, [standings.length, storageKey]);

  const logoByUserId = new Map(fantasyTeams.map(ft => [ft.userId, ft.logoUrl ?? null]));
  const coOwnerNamesByUserId = new Map(fantasyTeams.map(ft => [ft.userId, ft.coOwnerDisplayNames ?? []]));

  // Set of primary-owner userIds where the current user is owner or co-owner
  const myTeamOwnerIds = new Set(
    fantasyTeams
      .filter(ft => ft.userId === userId || (ft.coOwnerIds ?? []).includes(userId ?? ''))
      .map(ft => ft.userId)
  );

  useEffect(() => {
    if (!db) return;
    setLoading(true);

    // Always call the REST endpoint on mount — it validates the Firestore cache against
    // the current member count and rewrites it if stale. onSnapshot picks up the update.
    api.get<Standing[]>(`/leagues/${leagueId}/standings`)
      .then(data => { setStandings(data); setLoading(false); })
      .catch(() => setLoading(false));

    // Real-time listener for live score pushes during active seasons
    const unsub = onSnapshot(
      doc(db, 'standingsCache', leagueId),
      snap => {
        if (snap.exists()) {
          setStandings((snap.data() as { standings: Standing[] }).standings);
          setLoading(false);
        }
      },
      () => {},
    );

    return () => { unsub(); };
  }, [leagueId]);

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;

  if (standings.length === 0) {
    return (
      <div className="text-center py-16 border border-dashed border-line rounded-2xl">
        <p className="text-copy-3 text-sm">No standings yet — assign teams and sync records to see points.</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-line rounded-2xl overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-line bg-field/50">
            <th className="text-left px-4 py-3 text-xs font-semibold text-copy-3 uppercase tracking-wider">Rank</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-copy-3 uppercase tracking-wider">Manager</th>
            <th className="text-right px-4 py-3 text-xs font-semibold text-copy-3 uppercase tracking-wider">Points</th>
            <th className="text-right px-4 py-3 text-xs font-semibold text-copy-3 uppercase tracking-wider hidden sm:table-cell">Active</th>
            <th className="text-right px-4 py-3 text-xs font-semibold text-copy-3 uppercase tracking-wider hidden sm:table-cell">Bonus</th>
          </tr>
        </thead>
        <tbody>
          {standings.map(s => {
            const isExpanded = expanded === s.userId;
            const isMe = myTeamOwnerIds.has(s.userId);
            const inTopZone = !!topZone && s.rank <= topZone;
            const inBottomZone = !!bottomZone && s.rank > standings.length - bottomZone;
            return (
              <Fragment key={s.userId}>
                <tr
                  onClick={() => setExpanded(isExpanded ? null : s.userId)}
                  className={`border-b border-line/50 cursor-pointer hover:bg-field/40 transition-colors ${
                    isMe ? 'bg-brand/[0.06]' : inTopZone ? 'bg-positive-bg/20' : inBottomZone ? 'bg-danger-bg/20' : ''
                  }`}
                >
                  <td className={`px-4 py-3.5 ${isMe ? 'border-l-2 border-l-brand' : inTopZone ? 'border-l-2 border-l-positive' : inBottomZone ? 'border-l-2 border-l-danger' : 'border-l-2 border-l-transparent'}`}>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-sm font-bold ${isMe ? 'text-brand' : inTopZone ? 'text-positive' : inBottomZone ? 'text-danger' : 'text-copy-2'}`}>
                        #{s.rank}
                      </span>
                      {(() => {
                        // Don't show rank changes when nothing has been scored yet —
                        // pre-season order is arbitrary and the deltas would be meaningless
                        if (standings.every(s2 => !s2.totalPoints)) return null;
                        const prev = prevRanks[s.userId];
                        if (!prev || prev === s.rank) return null;
                        const diff = prev - s.rank;
                        return diff > 0
                          ? <span className="text-[10px] font-bold text-positive leading-none">↑{diff}</span>
                          : <span className="text-[10px] font-bold text-danger leading-none">↓{Math.abs(diff)}</span>;
                      })()}
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2.5">
                      {logoByUserId.get(s.userId) ? (
                        <img src={logoByUserId.get(s.userId)!} alt={s.displayName} className="w-7 h-7 object-cover rounded-full flex-shrink-0 cursor-pointer" onClick={() => setLightboxUrl(logoByUserId.get(s.userId)!)} />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-field border border-line flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-semibold text-copy-3">{s.displayName.charAt(0).toUpperCase()}</span>
                        </div>
                      )}
                      <div>
                        <span className="text-sm font-medium text-copy">{s.displayName}</span>
                        {isMe && <span className="ml-2 text-xs text-brand font-medium">you</span>}
                        {(() => {
                          const primary = ownerNameByUserId[s.userId];
                          const coOwners = coOwnerNamesByUserId.get(s.userId) ?? [];
                          const names = [primary, ...coOwners].filter(Boolean);
                          return names.length > 0 ? (
                            <p className="text-xs text-copy-3/70 mt-0.5">{names.join(' & ')}</p>
                          ) : null;
                        })()}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <span className="text-sm font-bold text-copy">{s.totalPoints.toFixed(1)}</span>
                  </td>
                  <td className="px-4 py-3.5 text-right hidden sm:table-cell">
                    {(() => {
                      const active = s.teamBreakdown.filter(t => t.seasonActive && !t.eliminated).length;
                      const total = s.teamBreakdown.length;
                      return (
                        <span className="text-sm text-copy-3">
                          {active < total ? <><span className="text-copy font-medium">{active}</span>/{total}</> : active}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3.5 text-right hidden sm:table-cell">
                    <span className="text-sm text-positive">{s.bonusPoints > 0 ? `+${Math.round(s.bonusPoints)}` : '—'}</span>
                  </td>
                </tr>
                {isExpanded && s.teamBreakdown.length > 0 && (() => {
                  const wcIds = new Set<string>();
                  const seen = new Set<string>();
                  for (const t of s.teamBreakdown) {
                    if (seen.has(t.sportLeagueId)) wcIds.add(t.teamId);
                    else seen.add(t.sportLeagueId);
                  }
                  const missingSportSlots: string[] = [];
                  let missingWcCount = 0;
                  if (selectedSports?.length) {
                    const countBySport = new Map<string, number>();
                    for (const t of s.teamBreakdown) countBySport.set(t.sportLeagueId, (countBySport.get(t.sportLeagueId) ?? 0) + 1);
                    const totalExpected = selectedSports.length + (maxWildcard ?? 0);
                    const totalMissing = Math.max(0, totalExpected - s.teamBreakdown.length);
                    for (const sp of selectedSports) { if (!countBySport.has(sp)) missingSportSlots.push(sp); }
                    missingWcCount = Math.max(0, totalMissing - missingSportSlots.length);
                  }
                  return (
                  <tr key={`${s.userId}-bd`} className="border-b border-line/50 bg-field/20">
                    <td colSpan={5} className="px-3 sm:px-6 py-4 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                        {[...s.teamBreakdown].sort((a, b) => {
                            const ai = SPORT_ORDER.indexOf(a.sportLeagueId);
                            const bi = SPORT_ORDER.indexOf(b.sportLeagueId);
                            return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
                          }).map(t => {
                          const teamBonuses = s.bonusBreakdown?.filter(b => b.teamId === t.teamId) ?? [];
                          const teamBonusTotal = teamBonuses.reduce((sum, b) => sum + b.points, 0);
                          const teamTotal = t.points + teamBonusTotal;
                          const hasBonus = teamBonuses.length > 0;
                          const isWildCard = wcIds.has(t.teamId);
                          return (
                            <div
                              key={t.teamId}
                              onClick={() => openProfile({ teamId: t.teamId, leagueId, name: t.teamName, logoUrl: t.logoUrl, sportLeagueId: t.sportLeagueId, wins: t.wins, draws: t.draws, losses: t.losses, points: t.points, bonusPoints: teamBonusTotal, bonusBreakdown: teamBonuses.map(b => ({ label: b.label, points: b.points })), ownerDisplayName: s.displayName })}
                              className={`bg-card border rounded-lg overflow-hidden cursor-pointer transition-colors ${
                                hasBonus ? 'border-positive/30 hover:border-positive/60' : 'border-line hover:border-line-2'
                              }`}
                            >
                              <div className="flex items-center justify-between px-3 py-2 gap-2">
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  {t.logoUrl && (
                                    <img src={t.logoUrl} alt={t.teamName} className="w-7 h-7 object-contain flex-shrink-0" />
                                  )}
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1">
                                      <p className="text-xs font-medium truncate text-copy">{t.teamName}</p>
                                      {isWildCard && <span className="text-xs bg-warn-bg text-warn border border-warn/20 px-1.5 py-0.5 rounded-full whitespace-nowrap flex-shrink-0">Wild Card</span>}
                                      {liveTeamIds?.has(t.teamId) && (
                                        <span className="relative flex h-2 w-2 flex-shrink-0">
                                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-positive opacity-75" />
                                          <span className="relative inline-flex rounded-full h-2 w-2 bg-positive" />
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-xs text-copy-3 mt-0.5">{formatLeagueName(t.sportLeagueId)}</p>
                                  </div>
                                </div>
                                <div className="text-right flex-shrink-0">
                                  <p className="text-xs font-semibold text-copy">{teamTotal.toFixed(1)}</p>
                                  <p className="text-xs text-copy-3">{formatRecord(t.wins, t.draws, t.losses, t.sport)}</p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        {missingSportSlots.map(sp => (
                          <div key={`missing-${sp}`} className="bg-card border border-dashed border-line-2 rounded-lg overflow-hidden opacity-60">
                            <div className="flex items-center justify-between px-3 py-2 gap-2">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <div className="w-7 h-7 rounded bg-field border border-dashed border-line-2 flex items-center justify-center flex-shrink-0">
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-copy-3">
                                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                                  </svg>
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-medium text-copy-3">Missing team</p>
                                  <p className="text-xs text-copy-3/60">{formatLeagueName(sp)}</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                        {Array.from({ length: missingWcCount }, (_, i) => (
                          <div key={`missing-wc-${i}`} className="bg-card border border-dashed border-line-2 rounded-lg overflow-hidden opacity-60">
                            <div className="flex items-center justify-between px-3 py-2 gap-2">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <div className="w-7 h-7 rounded bg-field border border-dashed border-line-2 flex items-center justify-center flex-shrink-0">
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-copy-3">
                                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                                  </svg>
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-medium text-copy-3">Missing team</p>
                                  <p className="text-xs text-copy-3/60">Wild Card slot</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-copy-3 pt-1 border-t border-line/50">
                        <span>Season: <span className="text-copy font-medium">{(s.totalPoints - s.bonusPoints).toFixed(1)}</span></span>
                        {s.bonusPoints > 0 && <span>Bonus: <span className="text-positive font-medium">{Math.round(s.bonusPoints)}</span></span>}
                        <span>Total: <span className="text-copy font-semibold">{s.totalPoints.toFixed(1)}</span></span>
                      </div>
                    </td>
                  </tr>
                  );
                })()}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
    </div>
  );
}

export { StandingsTab };
