'use client';

import { useState, useEffect, useRef } from 'react';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { api } from '@/lib/api';
import { storage } from '@/lib/firebase';
import { useTeamProfile } from '@/context/TeamProfileContext';
import { Spinner, Lightbox, formatLeagueName, formatRecord, SPORT_ORDER } from '../_components';
import type { SportGroup, Standing, FantasyTeam, SportTeam, Trade, TeamBreakdown, BonusBreakdownItem } from '../_types';

function RosterTab({
  leagueId, leagueState, fantasyTeams, setFantasyTeams, isCommissioner, userId, ownerNameByUserId, liveTeamIds,
  selectedSports, maxWildcard, onGoToWaivers,
}: {
  leagueId: string;
  leagueState: string;
  fantasyTeams: FantasyTeam[];
  setFantasyTeams: React.Dispatch<React.SetStateAction<FantasyTeam[]>>;
  isCommissioner: boolean;
  userId?: string;
  ownerNameByUserId: Record<string, string>;
  liveTeamIds?: Set<string>;
  selectedSports?: string[];
  maxWildcard?: number;
  onGoToWaivers?: (sport: string | null) => void;
}) {
  const [sportGroups, setSportGroups] = useState<SportGroup[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [assignTeamsOpen, setAssignTeamsOpen] = useState(false);
  const [viewingId, setViewingId] = useState<string>('');
  const [standings, setStandings] = useState<Standing[]>([]);
  const [editName, setEditName] = useState('');
  const [editLogoUrl, setEditLogoUrl] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editMsg, setEditMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoUploadProgress, setLogoUploadProgress] = useState(0);
  const [logoDragging, setLogoDragging] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const [removingTeam, setRemovingTeam] = useState(false);
  const [expandedRosterTeam, setExpandedRosterTeam] = useState<string | null>(null);

  const [trades, setTrades] = useState<Trade[]>([]);
  const [tradeModal, setTradeModal] = useState<{
    mode: 'propose' | 'counter';
    otherFtId: string;
    counterTradeId?: string;
  } | null>(null);
  const [tradeOffered, setTradeOffered] = useState<string[]>([]);
  const [tradeRequested, setTradeRequested] = useState<string[]>([]);
  const [tradeSubmitting, setTradeSubmitting] = useState(false);
  const [tradeMsg, setTradeMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [actingTrade, setActingTrade] = useState<string | null>(null);
  const { openProfile } = useTeamProfile();

  useEffect(() => {
    api.get<SportGroup[]>(`/leagues/${leagueId}/sport-teams`)
      .then(setSportGroups).catch(() => {}).finally(() => setLoadingTeams(false));
    api.get<Standing[]>(`/leagues/${leagueId}/standings`).then(setStandings).catch(() => {});
    api.get<Trade[]>(`/leagues/${leagueId}/trades`).then(setTrades).catch(() => {});
  }, [leagueId]);


  const isMyTeam = (ft: FantasyTeam) =>
    !ft.isPlaceholder && (ft.userId === userId || (ft.coOwnerIds ?? []).includes(userId ?? ''));

  // Default to the logged-in user's own team
  useEffect(() => {
    if (viewingId) return;
    const myTeam = fantasyTeams.find(ft => isMyTeam(ft));
    setViewingId(myTeam?.id ?? fantasyTeams[0]?.id ?? '');
  }, [fantasyTeams, userId, viewingId]);

  // Sync edit fields when the viewed team changes
  useEffect(() => {
    const t = fantasyTeams.find(ft => ft.id === viewingId);
    if (t && isMyTeam(t)) {
      setEditName(t.displayName);
      setEditLogoUrl(t.logoUrl ?? '');
      setEditMsg(null);
    }
  }, [viewingId, fantasyTeams, userId]);


  const ownerMap: Record<string, FantasyTeam> = {};
  for (const ft of fantasyTeams) {
    for (const tid of (ft.ownedTeamIds ?? [])) ownerMap[tid] = ft;
  }

  const allSportTeams = sportGroups.flatMap(g => g.teams);
  const sportTeamById = new Map(allSportTeams.map(t => [t.id, t]));

  // Build per-team record/points from standings
  const teamStatsMap = new Map<string, TeamBreakdown>();
  const teamBonusMap = new Map<string, number>();
  const teamBonusBreakdownMap = new Map<string, BonusBreakdownItem[]>();
  for (const s of standings) {
    for (const td of s.teamBreakdown) teamStatsMap.set(td.teamId, td);
    for (const bd of s.bonusBreakdown) {
      teamBonusMap.set(bd.teamId, (teamBonusMap.get(bd.teamId) ?? 0) + bd.points);
      teamBonusBreakdownMap.set(bd.teamId, [...(teamBonusBreakdownMap.get(bd.teamId) ?? []), bd]);
    }
  }

  const viewingTeam = fantasyTeams.find(ft => ft.id === viewingId);
  const viewingIsMe = viewingTeam ? isMyTeam(viewingTeam) : false;
  const viewingIsPrimaryOwner = viewingTeam?.userId === userId;
  const viewingOwnedTeams = (viewingTeam?.ownedTeamIds ?? [])
    .map(id => sportTeamById.get(id))
    .filter(Boolean)
    .sort((a, b) => {
      const ai = SPORT_ORDER.indexOf((a as SportTeam).sportLeagueId);
      const bi = SPORT_ORDER.indexOf((b as SportTeam).sportLeagueId);
      const ao = ai === -1 ? 999 : ai;
      const bo = bi === -1 ? 999 : bi;
      if (ao !== bo) return ao - bo;
      return (a as SportTeam).name.localeCompare((b as SportTeam).name);
    }) as SportTeam[];

  const viewingWildCardIds = new Set<string>();
  { const seen = new Set<string>();
    for (const t of viewingOwnedTeams) {
      if (seen.has(t.sportLeagueId)) viewingWildCardIds.add(t.id);
      else seen.add(t.sportLeagueId);
    }
  }

  // Compute missing roster slots
  type RosterRenderItem = { kind: 'team'; team: SportTeam } | { kind: 'missing'; sportLeagueId: string; isWildcard: boolean };
  const rosterRenderItems: RosterRenderItem[] = (() => {
    if (!selectedSports?.length) return viewingOwnedTeams.map(t => ({ kind: 'team' as const, team: t }));
    const countBySport = new Map<string, number>();
    for (const t of viewingOwnedTeams) countBySport.set(t.sportLeagueId, (countBySport.get(t.sportLeagueId) ?? 0) + 1);
    const totalExpected = selectedSports.length + (maxWildcard ?? 0);
    const totalMissing = Math.max(0, totalExpected - viewingOwnedTeams.length);
    const missingSportIds = selectedSports.filter(s => !countBySport.has(s));
    const missingWcCount = Math.max(0, totalMissing - missingSportIds.length);
    const items: RosterRenderItem[] = [
      ...viewingOwnedTeams.map(t => ({ kind: 'team' as const, team: t })),
      ...missingSportIds.map(s => ({ kind: 'missing' as const, sportLeagueId: s, isWildcard: false })),
      ...Array.from({ length: missingWcCount }, () => ({ kind: 'missing' as const, sportLeagueId: 'wildcard', isWildcard: true })),
    ];
    items.sort((a, b) => {
      const as_ = a.kind === 'team' ? a.team.sportLeagueId : a.sportLeagueId;
      const bs_ = b.kind === 'team' ? b.team.sportLeagueId : b.sportLeagueId;
      const ai = as_ === 'wildcard' ? 9999 : SPORT_ORDER.indexOf(as_);
      const bi = bs_ === 'wildcard' ? 9999 : SPORT_ORDER.indexOf(bs_);
      const ao = ai === -1 ? 998 : ai;
      const bo = bi === -1 ? 998 : bi;
      if (ao !== bo) return ao - bo;
      if (a.kind === 'team' && b.kind === 'missing') return -1;
      if (a.kind === 'missing' && b.kind === 'team') return 1;
      if (a.kind === 'team' && b.kind === 'team') return a.team.name.localeCompare(b.team.name);
      return 0;
    });
    return items;
  })();

  const myFantasyTeam = fantasyTeams.find(ft => isMyTeam(ft));
  const myOwnedTeams = (myFantasyTeam?.ownedTeamIds ?? [])
    .map(id => sportTeamById.get(id))
    .filter(Boolean)
    .sort((a, b) => (a as SportTeam).name.localeCompare((b as SportTeam).name)) as SportTeam[];

  const incomingTrades = trades.filter(t =>
    t.status === 'pending' && t.receiverFantasyTeamId === myFantasyTeam?.id
  );
  const outgoingTrades = trades.filter(t =>
    t.status === 'pending' && t.proposerFantasyTeamId === myFantasyTeam?.id
  );
  const fantasyTeamById = new Map(fantasyTeams.map(ft => [ft.id, ft]));

  const modalOtherTeam = tradeModal ? fantasyTeams.find(ft => ft.id === tradeModal.otherFtId) : null;
  const modalOtherOwnedTeams = (modalOtherTeam?.ownedTeamIds ?? [])
    .map(id => sportTeamById.get(id))
    .filter(Boolean)
    .sort((a, b) => {
      const ai = SPORT_ORDER.indexOf((a as SportTeam).sportLeagueId);
      const bi = SPORT_ORDER.indexOf((b as SportTeam).sportLeagueId);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi) || (a as SportTeam).name.localeCompare((b as SportTeam).name);
    }) as SportTeam[];

  const canProposeTrade = !viewingIsMe && !!myFantasyTeam && myOwnedTeams.length > 0;

  async function submitTrade() {
    if (!tradeModal || !tradeOffered.length || !tradeRequested.length) return;
    setTradeSubmitting(true);
    setTradeMsg(null);
    try {
      if (tradeModal.mode === 'counter' && tradeModal.counterTradeId) {
        await api.post(`/leagues/${leagueId}/trades/${tradeModal.counterTradeId}/respond`, { action: 'reject' });
      }
      const created = await api.post<Trade>(`/leagues/${leagueId}/trades`, {
        offeredSportTeamIds: tradeOffered,
        requestedSportTeamIds: tradeRequested,
        receiverFantasyTeamId: tradeModal.otherFtId,
      });
      setTrades(prev => {
        const updated = tradeModal.counterTradeId
          ? prev.map(t => t.id === tradeModal.counterTradeId ? { ...t, status: 'rejected' as const } : t)
          : [...prev];
        return [...updated, created];
      });
      setTradeMsg({ type: 'success', text: tradeModal.mode === 'counter' ? 'Counter offer sent!' : 'Trade offer sent!' });
      setTimeout(() => { setTradeModal(null); setTradeMsg(null); }, 1500);
    } catch (err: unknown) {
      setTradeMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to send trade offer' });
    } finally {
      setTradeSubmitting(false);
    }
  }

  async function respondToTrade(tradeId: string, action: 'accept' | 'reject' | 'cancel') {
    setActingTrade(tradeId);
    try {
      const updated = await api.post<Trade>(`/leagues/${leagueId}/trades/${tradeId}/respond`, { action });
      setTrades(prev => prev.map(t => t.id === tradeId ? updated : t));
      if (action === 'accept') {
        const freshTeams = await api.get<FantasyTeam[]>(`/leagues/${leagueId}/teams`);
        setFantasyTeams(freshTeams);
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed');
    } finally {
      setActingTrade(null);
    }
  }

  // Dropdown: logged-in user's team first, then others alphabetically
  const orderedTeams = [
    ...fantasyTeams.filter(ft => isMyTeam(ft)),
    ...fantasyTeams.filter(ft => !isMyTeam(ft)).sort((a, b) => a.displayName.localeCompare(b.displayName)),
  ];

  function toggleGroup(sport: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(sport)) next.delete(sport); else next.add(sport);
      return next;
    });
  }

  async function assign(teamId: string, fantasyTeamId: string) {
    setAssigning(teamId);
    try {
      const updated = await api.post<FantasyTeam>(`/leagues/${leagueId}/roster/assign`, { fantasyTeamId, teamId });
      setFantasyTeams(prev => prev.map(ft => ft.id === fantasyTeamId ? updated : ft));
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Failed'); }
    finally { setAssigning(null); }
  }

  async function remove(teamId: string, fantasyTeamId: string) {
    setAssigning(teamId);
    try {
      const updated = await api.post<FantasyTeam>(`/leagues/${leagueId}/roster/remove`, { fantasyTeamId, teamId });
      setFantasyTeams(prev => prev.map(ft => ft.id === fantasyTeamId ? updated : ft));
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Failed'); }
    finally { setAssigning(null); }
  }


  async function saveTeam(e: React.FormEvent) {
    e.preventDefault();
    setEditSaving(true); setEditMsg(null);
    try {
      const updated = await api.patch<FantasyTeam>(`/leagues/${leagueId}/teams/my`, {
        displayName: editName.trim() || undefined,
        logoUrl: editLogoUrl.trim() || null,
      });
      setFantasyTeams(prev => prev.map(ft => ft.id === updated.id ? updated : ft));
      setEditMsg({ type: 'success', text: 'Team updated.' });
      setTimeout(() => setEditMsg(null), 3000);
    } catch (e: unknown) {
      setEditMsg({ type: 'error', text: e instanceof Error ? e.message : 'Failed to save' });
    } finally { setEditSaving(false); }
  }


  async function handleRemoveTeam() {
    if (!viewingTeam) return;
    if (!confirm(`Remove "${viewingTeam.displayName}" from the league? Their sport teams will return to the pool. This cannot be undone.`)) return;
    setRemovingTeam(true);
    try {
      await api.delete(`/leagues/${leagueId}/teams/${viewingId}`);
      setFantasyTeams(prev => prev.filter(ft => ft.id !== viewingId));
      setViewingId('');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to remove team');
    } finally {
      setRemovingTeam(false);
    }
  }

  async function uploadLogo(file: File) {
    if (!userId) return;
    if (!storage) {
      setEditMsg({ type: 'error', text: 'Firebase Storage not initialized.' });
      return;
    }
    setLogoUploading(true);
    setLogoUploadProgress(0);
    setEditMsg(null);
    try {
      const ext = file.name.split('.').pop() ?? 'png';
      const path = `team-logos/${leagueId}_${userId}.${ext}`;
      const sRef = storageRef(storage, path);
      await new Promise<void>((resolve, reject) => {
        const task = uploadBytesResumable(sRef, file, { contentType: file.type });
        const timeout = setTimeout(() => {
          task.cancel();
          reject(new Error('Upload timed out — make sure Firebase Storage is enabled and rules allow writes.'));
        }, 20000);
        task.on(
          'state_changed',
          snap => setLogoUploadProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
          err => { clearTimeout(timeout); reject(err); },
          () => { clearTimeout(timeout); resolve(); },
        );
      });
      const url = await getDownloadURL(sRef);
      const updated = await api.patch<FantasyTeam>(`/leagues/${leagueId}/teams/my`, { logoUrl: url });
      setFantasyTeams(prev => prev.map(ft => ft.id === updated.id ? updated : ft));
      setEditLogoUrl(url);
      setEditMsg({ type: 'success', text: 'Logo uploaded!' });
      setTimeout(() => setEditMsg(null), 3000);
    } catch (e: unknown) {
      setEditMsg({ type: 'error', text: e instanceof Error ? e.message : 'Upload failed' });
    } finally {
      setLogoUploading(false);
      setLogoUploadProgress(0);
    }
  }

  async function removeLogo() {
    const updated = await api.patch<FantasyTeam>(`/leagues/${leagueId}/teams/my`, { logoUrl: null }).catch(() => null);
    if (updated) {
      setFantasyTeams(prev => prev.map(ft => ft.id === updated.id ? updated : ft));
      setEditLogoUrl('');
    }
  }


  return (
    <div className="space-y-6">

      {/* ── Pending trades ── */}
      {(incomingTrades.length > 0 || outgoingTrades.length > 0) && (
        <div className="bg-card border border-line rounded-2xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-line">
            <p className="text-sm font-semibold text-copy">
              Pending Trades
              <span className="ml-2 text-xs bg-warn-bg text-warn border border-warn/20 px-2 py-0.5 rounded-full">
                {incomingTrades.length + outgoingTrades.length}
              </span>
            </p>
          </div>
          <div className="divide-y divide-line/50">
            {incomingTrades.map(trade => {
              const offeredTeams = (trade.offeredSportTeamIds ?? []).map(id => sportTeamById.get(id)).filter(Boolean) as SportTeam[];
              const requestedTeams = (trade.requestedSportTeamIds ?? []).map(id => sportTeamById.get(id)).filter(Boolean) as SportTeam[];
              const proposerFt = fantasyTeamById.get(trade.proposerFantasyTeamId);
              const isActing = actingTrade === trade.id;
              return (
                <div key={trade.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-xs text-copy-3 mb-2">Incoming offer from <span className="font-semibold text-copy-2">{proposerFt?.displayName ?? '—'}</span></p>
                      <div className="flex items-start gap-3">
                        <div className="space-y-1.5">
                          {offeredTeams.map(t => (
                            <div key={t.id} className="flex items-center gap-2">
                              {t.logoUrl && <img src={t.logoUrl} alt={t.name} className="w-7 h-7 object-contain flex-shrink-0" />}
                              <div>
                                <p className="text-sm font-semibold text-copy leading-tight">{t.name}</p>
                                <p className="text-xs text-copy-3">{formatLeagueName(t.sportLeagueId)}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-copy-3 flex-shrink-0 mt-1.5">
                          <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <div className="space-y-1.5">
                          {requestedTeams.map(t => (
                            <div key={t.id} className="flex items-center gap-2">
                              {t.logoUrl && <img src={t.logoUrl} alt={t.name} className="w-7 h-7 object-contain flex-shrink-0" />}
                              <div>
                                <p className="text-sm font-semibold text-copy leading-tight">{t.name}</p>
                                <p className="text-xs text-copy-3">{formatLeagueName(t.sportLeagueId)}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => respondToTrade(trade.id, 'accept')}
                        disabled={isActing}
                        className="text-xs bg-positive-bg border border-positive/20 text-positive hover:bg-positive hover:text-white px-3 py-2 rounded-xl transition-colors font-semibold disabled:opacity-50"
                      >
                        {isActing ? '...' : 'Accept'}
                      </button>
                      <button
                        onClick={() => {
                          setTradeModal({ mode: 'counter', otherFtId: trade.proposerFantasyTeamId, counterTradeId: trade.id });
                          setTradeOffered([...(trade.requestedSportTeamIds ?? [])]);
                          setTradeRequested([...(trade.offeredSportTeamIds ?? [])]);
                          setTradeMsg(null);
                        }}
                        disabled={isActing}
                        className="text-xs bg-warn-bg border border-warn/20 text-warn hover:bg-warn hover:text-white px-3 py-2 rounded-xl transition-colors font-semibold disabled:opacity-50"
                      >
                        Counter
                      </button>
                      <button
                        onClick={() => respondToTrade(trade.id, 'reject')}
                        disabled={isActing}
                        className="text-xs bg-danger-bg border border-danger/20 text-danger hover:bg-danger hover:text-white px-3 py-2 rounded-xl transition-colors font-semibold disabled:opacity-50"
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            {outgoingTrades.map(trade => {
              const offeredTeams = (trade.offeredSportTeamIds ?? []).map(id => sportTeamById.get(id)).filter(Boolean) as SportTeam[];
              const requestedTeams = (trade.requestedSportTeamIds ?? []).map(id => sportTeamById.get(id)).filter(Boolean) as SportTeam[];
              const receiverFt = fantasyTeamById.get(trade.receiverFantasyTeamId);
              const isActing = actingTrade === trade.id;
              return (
                <div key={trade.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-xs text-copy-3 mb-2">Offer sent to <span className="font-semibold text-copy-2">{receiverFt?.displayName ?? '—'}</span></p>
                      <div className="flex items-start gap-3">
                        <div className="space-y-1.5">
                          {offeredTeams.map(t => (
                            <div key={t.id} className="flex items-center gap-2">
                              {t.logoUrl && <img src={t.logoUrl} alt={t.name} className="w-7 h-7 object-contain flex-shrink-0" />}
                              <div>
                                <p className="text-sm font-semibold text-copy leading-tight">{t.name}</p>
                                <p className="text-xs text-copy-3">{formatLeagueName(t.sportLeagueId)}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-copy-3 flex-shrink-0 mt-1.5">
                          <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <div className="space-y-1.5">
                          {requestedTeams.map(t => (
                            <div key={t.id} className="flex items-center gap-2">
                              {t.logoUrl && <img src={t.logoUrl} alt={t.name} className="w-7 h-7 object-contain flex-shrink-0" />}
                              <div>
                                <p className="text-sm font-semibold text-copy leading-tight">{t.name}</p>
                                <p className="text-xs text-copy-3">{formatLeagueName(t.sportLeagueId)}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => respondToTrade(trade.id, 'cancel')}
                      disabled={isActing}
                      className="text-xs bg-field border border-line text-copy-2 hover:bg-field-2 px-3 py-2 rounded-xl transition-colors font-medium disabled:opacity-50 flex-shrink-0"
                    >
                      {isActing ? '...' : 'Cancel'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Roster viewer ── */}
      <div className="bg-card border border-line rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <div className="flex items-center gap-3 min-w-0">
            {viewingTeam?.logoUrl && (
              <img src={viewingTeam.logoUrl} alt={viewingTeam.displayName} className="w-10 h-10 object-cover rounded-full flex-shrink-0 cursor-pointer" onClick={() => setLightboxUrl(viewingTeam.logoUrl!)} />
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-copy">
                {viewingTeam?.displayName ?? '—'}
                {viewingTeam?.isPlaceholder && (
                  <span className="ml-2 text-xs bg-warn-bg text-warn border border-warn/20 px-2 py-0.5 rounded-full align-middle">placeholder</span>
                )}
              </p>
              {viewingIsMe && (
                <p className="text-xs text-brand mt-0.5">
                  {viewingIsPrimaryOwner ? 'Your team' : 'Your team (co-owner)'}
                </p>
              )}
              {!viewingIsMe && viewingTeam && ownerNameByUserId[viewingTeam.userId] && (
                <p className="text-xs text-copy-3/70 mt-0.5">{ownerNameByUserId[viewingTeam.userId]}</p>
              )}
              {!loadingTeams && (
                <p className="text-xs text-copy-3 mt-0.5">{viewingOwnedTeams.length} team{viewingOwnedTeams.length !== 1 ? 's' : ''}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canProposeTrade && (
              <button
                type="button"
                onClick={() => {
                  setTradeModal({ mode: 'propose', otherFtId: viewingId });
                  setTradeOffered([]);
                  setTradeRequested([]);
                  setTradeMsg(null);
                }}
                className="bg-brand/10 hover:bg-brand/20 border border-brand/30 text-brand text-sm font-semibold px-4 py-2 rounded-xl transition-colors whitespace-nowrap"
              >
                Trade
              </button>
            )}
            {orderedTeams.length > 1 && (
              <select
                value={viewingId}
                onChange={e => setViewingId(e.target.value)}
                className="bg-field border border-line-2 text-sm text-copy rounded-xl px-3 py-2 focus:outline-none focus:border-brand transition-colors"
              >
                {orderedTeams.map(ft => (
                  <option key={ft.id} value={ft.id}>
                    {ft.displayName}{isMyTeam(ft) ? ' (You)' : ''}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
        <div className="divide-y divide-line/50">
          {loadingTeams && (
            <div className="divide-y divide-line/50">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="px-5 py-4 flex items-center gap-3 animate-pulse">
                  <div className="w-9 h-9 rounded-lg bg-field-2 flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 bg-field-2 rounded w-32" />
                    <div className="h-3 bg-field-2 rounded w-20" />
                  </div>
                  <div className="h-4 bg-field-2 rounded w-12" />
                </div>
              ))}
            </div>
          )}
          {!loadingTeams && rosterRenderItems.length === 0 && (
            <div className="px-5 py-8 text-center">
              <p className="text-copy-3 text-sm">No teams yet</p>
            </div>
          )}
          {rosterRenderItems.map((item, idx) => {
            if (item.kind === 'missing') {
              return (
                <div key={`missing-${item.sportLeagueId}-${idx}`} className="flex items-center justify-between px-5 py-3.5 gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg border-2 border-dashed border-line-2 flex items-center justify-center flex-shrink-0">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-copy-3">
                        <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-copy-3">Missing team</p>
                      <p className="text-xs text-copy-3/70 mt-0.5">
                        {item.isWildcard ? 'Wild Card slot' : formatLeagueName(item.sportLeagueId)}
                      </p>
                    </div>
                  </div>
                  {viewingIsMe && onGoToWaivers && (
                    <button
                      onClick={() => onGoToWaivers(item.isWildcard ? null : item.sportLeagueId)}
                      className="text-xs bg-brand/10 hover:bg-brand/20 border border-brand/30 text-brand font-semibold px-3 py-1.5 rounded-xl transition-colors whitespace-nowrap flex-shrink-0"
                    >
                      Find on Waivers →
                    </button>
                  )}
                </div>
              );
            }
            const t = item.team;
            const stats = teamStatsMap.get(t.id);
            const bonus = teamBonusMap.get(t.id) ?? 0;
            const total = (stats?.points ?? 0) + bonus;
            const isWildCard = viewingWildCardIds.has(t.id);
            const bonusItems = teamBonusBreakdownMap.get(t.id) ?? [];
            const isExpanded = expandedRosterTeam === t.id;
            return (
              <div key={t.id}>
                <div
                  onClick={() => stats && setExpandedRosterTeam(isExpanded ? null : t.id)}
                  className={`flex items-center justify-between px-5 py-3.5 hover:bg-field/30 transition-colors gap-3 ${stats ? 'cursor-pointer' : ''}`}
                >
                  <div
                    className="flex items-center gap-3 min-w-0 cursor-pointer hover:opacity-75 transition-opacity"
                    onClick={e => {
                      e.stopPropagation();
                      openProfile({ teamId: t.id, leagueId, name: t.name, logoUrl: t.logoUrl, sportLeagueId: t.sportLeagueId, wins: stats?.wins, draws: stats?.draws, losses: stats?.losses, points: stats?.points, bonusPoints: bonus > 0 ? bonus : undefined, bonusBreakdown: bonusItems.length > 0 ? bonusItems.map(b => ({ label: b.label, points: b.points })) : undefined, ownerDisplayName: viewingTeam?.displayName });
                    }}
                  >
                    {t.logoUrl ? (
                      <img src={t.logoUrl} alt={t.name} className="w-9 h-9 object-contain flex-shrink-0" />
                    ) : (
                      <div className="w-9 h-9 rounded-lg bg-field-2 border border-line flex items-center justify-center text-copy-3 text-xs font-bold flex-shrink-0">
                        {t.shortName?.slice(0, 2).toUpperCase() ?? '??'}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-copy truncate">{t.name}</p>
                        {isWildCard && (
                          <span className="text-xs bg-warn-bg text-warn border border-warn/20 px-1.5 py-0.5 rounded-full whitespace-nowrap flex-shrink-0">Wild Card</span>
                        )}
                        {liveTeamIds?.has(t.id) && (
                          <span className="relative flex h-2 w-2 flex-shrink-0">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-positive opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-positive" />
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-copy-3 mt-0.5">{formatLeagueName(t.sportLeagueId)}</p>
                    </div>
                  </div>
                  {stats && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <p className="text-sm font-semibold text-copy">{total.toFixed(1)} pts</p>
                      <svg
                        width="14" height="14" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                        className={`text-copy-3 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
                      >
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </div>
                  )}
                </div>
                {isExpanded && stats && (
                  <div className="px-5 pb-4 bg-field/20 border-t border-line/30">
                    <div className="pl-12 pt-3 space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-copy-3">Season pts</span>
                        <span className="text-copy">{stats.points.toFixed(1)}</span>
                      </div>
                      {bonusItems.map((b, i) => (
                        <div key={i} className="flex justify-between text-xs">
                          <span className="text-positive">{b.label}</span>
                          <span className="text-positive font-semibold">+{b.points.toFixed(1)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between text-xs pt-1.5 border-t border-line/50">
                        <span className="text-copy-3">{formatRecord(stats.wins, stats.draws, stats.losses, stats.sport)}</span>
                        <span className="text-copy font-semibold">{total.toFixed(1)} total</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Team customization (owner only) ── */}
      {viewingIsMe && (
        <div className="bg-card border border-line rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-copy mb-4">Customize Your Team</h2>
          <form onSubmit={saveTeam} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-copy-2 mb-1.5">Team Name</label>
              <input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                placeholder="Team display name..."
                className="w-full bg-field border border-line-2 rounded-xl px-4 py-2.5 text-copy text-sm placeholder-copy-3 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-copy-2 mb-1.5">Team Logo</label>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.target.value = ''; }}
              />
              <div
                tabIndex={0}
                onClick={() => !logoUploading && logoInputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setLogoDragging(true); }}
                onDragLeave={() => setLogoDragging(false)}
                onDrop={e => {
                  e.preventDefault();
                  setLogoDragging(false);
                  const f = e.dataTransfer.files[0];
                  if (f && f.type.startsWith('image/')) uploadLogo(f);
                }}
                onPaste={e => {
                  const item = [...e.clipboardData.items].find(i => i.type.startsWith('image/'));
                  if (!item) return;
                  const f = item.getAsFile();
                  if (f) { e.preventDefault(); uploadLogo(f); }
                }}
                className={`relative border-2 border-dashed rounded-xl transition-colors ${logoUploading ? 'cursor-wait' : 'cursor-pointer'} ${
                  logoDragging ? 'border-brand bg-brand/5' : 'border-line-2 hover:border-brand/40 hover:bg-field/40'
                }`}
              >
                {editLogoUrl ? (
                  <div className="flex flex-col items-center gap-2 py-4">
                    <img
                      src={editLogoUrl}
                      alt="Team logo"
                      className="w-16 h-16 object-cover rounded-full"
                      onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    />
                    <p className="text-xs text-copy-3">
                      {logoUploading ? `Uploading ${logoUploadProgress}%…` : 'Drop, paste, or click to replace'}
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 py-8">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-copy-3">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    <p className="text-sm font-medium text-copy-2">
                      {logoUploading ? `Uploading ${logoUploadProgress}%…` : 'Drop or paste your logo here'}
                    </p>
                    <p className="text-xs text-copy-3">or click to browse — PNG, JPG, SVG</p>
                  </div>
                )}
                {logoUploading && (
                  <div
                    className="absolute bottom-0 left-0 h-1 bg-brand rounded-b-xl transition-all duration-200"
                    style={{ width: `${logoUploadProgress}%` }}
                  />
                )}
              </div>
              {editLogoUrl && !logoUploading && (
                <button
                  type="button"
                  onClick={removeLogo}
                  className="mt-1.5 text-xs text-danger hover:text-danger/80 transition-colors"
                >
                  Remove logo
                </button>
              )}
            </div>
            {editMsg && (
              <p className={`text-xs ${editMsg.type === 'success' ? 'text-positive' : 'text-danger'}`}>
                {editMsg.text}
              </p>
            )}
            <button
              type="submit"
              disabled={editSaving}
              className="bg-brand hover:bg-brand-2 disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm"
            >
              {editSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </form>
        </div>
      )}

      {/* ── Remove team (commissioner only, not own team) ── */}
      {isCommissioner && viewingTeam && viewingTeam.userId !== userId && (
        <div className="bg-card border border-danger/20 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-copy mb-1">Remove Team</h2>
          <p className="text-xs text-copy-3 mb-4">
            Permanently removes {viewingTeam.displayName} from this league. Their sport teams return to the available pool.
          </p>
          <button
            type="button"
            onClick={handleRemoveTeam}
            disabled={removingTeam}
            className="bg-danger-bg border border-danger/20 hover:bg-danger hover:text-white text-danger text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors disabled:opacity-50"
          >
            {removingTeam ? 'Removing...' : `Remove ${viewingTeam.displayName}`}
          </button>
        </div>
      )}

      {/* ── Commissioner tools ── */}
      {isCommissioner && (
        <div className="space-y-4">
          {/* Assign teams */}
          <div>
            <button
              type="button"
              onClick={() => setAssignTeamsOpen(o => !o)}
              className="w-full flex items-center justify-between mb-3 group"
            >
              <h2 className="text-xs font-semibold text-copy-3 uppercase tracking-widest">Assign Teams</h2>
              <svg
                width="12" height="12" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                className={`text-copy-3 transition-transform ${assignTeamsOpen ? 'rotate-180' : ''}`}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          {assignTeamsOpen && (
            loadingTeams ? (
              <div className="flex justify-center py-8"><Spinner /></div>
            ) : sportGroups.every(g => g.teams.length === 0) ? (
              <div className="bg-card border border-line rounded-2xl p-6 text-center">
                <p className="text-copy-3 text-sm">No teams synced. Run <strong className="text-copy-2">Sync Teams</strong> in the admin panel first.</p>
              </div>
            ) : (
            <div className="space-y-2">
              {sportGroups.map(group => {
                if (group.teams.length === 0) return null;
                const isOpen = expandedGroups.has(group.sport);
                const assignedCount = group.teams.filter(t => ownerMap[t.id]).length;
                return (
                  <div key={group.sport} className="bg-card border border-line rounded-2xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.sport)}
                      className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-field/40 transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <svg
                          width="12" height="12" viewBox="0 0 24 24" fill="none"
                          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                          className={`text-copy-3 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                        >
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                        <span className="text-sm font-semibold text-copy uppercase tracking-wide">{group.sport}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        {assignedCount > 0 && (
                          <span className="text-xs font-medium text-brand">{assignedCount} assigned</span>
                        )}
                        <span className="text-xs text-copy-3">{group.teams.length} teams</span>
                      </div>
                    </button>
                    {isOpen && (
                      <div className="border-t border-line divide-y divide-line/50">
                        {[...group.teams].sort((a, b) => a.name.localeCompare(b.name)).map(team => {
                          const owner = ownerMap[team.id];
                          return (
                            <div key={team.id} className="flex items-center justify-between px-4 py-3 hover:bg-field/20 transition-colors">
                              <div>
                                <p className="text-sm text-copy font-medium">{team.name}</p>
                                {owner && <p className="text-xs text-brand mt-0.5">→ {owner.displayName}</p>}
                              </div>
                              {owner ? (
                                <button
                                  onClick={() => remove(team.id, owner.id)}
                                  disabled={assigning === team.id}
                                  className="text-xs text-danger hover:text-danger/80 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
                                >
                                  {assigning === team.id ? '...' : 'Remove'}
                                </button>
                              ) : (
                                <select
                                  disabled={assigning === team.id}
                                  defaultValue=""
                                  onChange={e => { if (e.target.value) assign(team.id, e.target.value); e.target.value = ''; }}
                                  className="bg-field border border-line-2 text-xs text-copy rounded-lg px-2 py-1.5 disabled:opacity-50 focus:outline-none focus:border-brand"
                                >
                                  <option value="">Assign to...</option>
                                  {fantasyTeams.map(ft => (
                                    <option key={ft.id} value={ft.id}>{ft.displayName}</option>
                                  ))}
                                </select>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        </div>
      )}

      {/* ── Trade modal ── */}
      {tradeModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={() => setTradeModal(null)}
        >
          <div
            className="bg-card border border-line rounded-2xl w-full max-w-2xl shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-line">
              <h2 className="text-base font-bold text-copy">
                {tradeModal.mode === 'counter' ? 'Counter Offer' : `Trade with ${modalOtherTeam?.displayName ?? '—'}`}
              </h2>
              <p className="text-xs text-copy-3 mt-0.5">Select one team from each side, then send your offer.</p>
            </div>

            <div className="grid grid-cols-2 gap-0 divide-x divide-line" style={{ maxHeight: '60vh', overflow: 'hidden' }}>
              {/* Their roster */}
              <div className="flex flex-col" style={{ maxHeight: '60vh' }}>
                <p className="text-xs font-semibold text-copy-3 uppercase tracking-widest px-4 py-3 border-b border-line/50">
                  {modalOtherTeam?.displayName ?? 'Their roster'}
                </p>
                <div className="overflow-y-auto flex-1">
                  {modalOtherOwnedTeams.length === 0 ? (
                    <p className="text-xs text-copy-3 px-4 py-6 text-center">No teams</p>
                  ) : modalOtherOwnedTeams.map(t => {
                    const sel = tradeRequested.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTradeRequested(prev => sel ? prev.filter(id => id !== t.id) : [...prev, t.id])}
                        className={`w-full flex items-center gap-3 px-4 py-3 border-b border-line/30 transition-colors text-left ${
                          sel ? 'bg-brand/10 border-l-2 border-l-brand' : 'hover:bg-field/50'
                        }`}
                      >
                        {t.logoUrl && <img src={t.logoUrl} alt={t.name} className="w-8 h-8 object-contain flex-shrink-0" />}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-copy truncate">{t.name}</p>
                          <p className="text-xs text-copy-3">{formatLeagueName(t.sportLeagueId)}</p>
                        </div>
                        {sel && (
                          <svg className="ml-auto text-brand flex-shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* My roster */}
              <div className="flex flex-col" style={{ maxHeight: '60vh' }}>
                <p className="text-xs font-semibold text-copy-3 uppercase tracking-widest px-4 py-3 border-b border-line/50">
                  Your roster
                </p>
                <div className="overflow-y-auto flex-1">
                  {myOwnedTeams.length === 0 ? (
                    <p className="text-xs text-copy-3 px-4 py-6 text-center">No teams</p>
                  ) : myOwnedTeams.map(t => {
                    const sel = tradeOffered.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTradeOffered(prev => sel ? prev.filter(id => id !== t.id) : [...prev, t.id])}
                        className={`w-full flex items-center gap-3 px-4 py-3 border-b border-line/30 transition-colors text-left ${
                          sel ? 'bg-brand/10 border-l-2 border-l-brand' : 'hover:bg-field/50'
                        }`}
                      >
                        {t.logoUrl && <img src={t.logoUrl} alt={t.name} className="w-8 h-8 object-contain flex-shrink-0" />}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-copy truncate">{t.name}</p>
                          <p className="text-xs text-copy-3">{formatLeagueName(t.sportLeagueId)}</p>
                        </div>
                        {sel && (
                          <svg className="ml-auto text-brand flex-shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-line flex items-center justify-between gap-3">
              {tradeMsg ? (
                <p className={`text-xs ${tradeMsg.type === 'success' ? 'text-positive' : 'text-danger'}`}>{tradeMsg.text}</p>
              ) : (
                <p className="text-xs text-copy-3">
                  {tradeOffered.length > 0 && tradeRequested.length > 0
                    ? `Offering ${tradeOffered.length} team${tradeOffered.length !== 1 ? 's' : ''} for ${tradeRequested.length} team${tradeRequested.length !== 1 ? 's' : ''}`
                    : 'Select at least one team from each column'}
                </p>
              )}
              <div className="flex gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setTradeModal(null)}
                  className="bg-field hover:bg-field-2 border border-line text-copy-2 text-sm font-medium px-4 py-2 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submitTrade}
                  disabled={!tradeOffered.length || !tradeRequested.length || tradeSubmitting}
                  className="bg-brand hover:bg-brand-2 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
                >
                  {tradeSubmitting ? 'Sending...' : 'Send Offer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
    </div>
  );
}

export { RosterTab };
