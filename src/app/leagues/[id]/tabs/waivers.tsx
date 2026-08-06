'use client';

import { useState, useEffect, useMemo } from 'react';
import { api } from '@/lib/api';
import { useTeamProfile } from '@/context/TeamProfileContext';
import { Spinner, formatLeagueName, formatRecord } from '../_components';
import type { WaiverClaim, WaiverHistoryClaim, TeamWithRecord, SportGroup, FantasyTeam } from '../_types';

const WAIVER_STATUS_CLS: Record<string, string> = {
  pending:  'bg-warn-bg text-warn border-warn/20',
  approved: 'bg-positive-bg text-positive border-positive/20',
  denied:   'bg-danger-bg text-danger border-danger/20',
};

type DisplayTeam = {
  id: string; name: string; shortName: string; sportLeagueId: string;
  logoUrl: string | null | undefined; sport: string;
  wins: number; draws: number; losses: number; points: number;
  isAvailable: boolean; ownerName?: string; ownerLogoUrl?: string | null;
};
type RosterStat = { rosteredPct: number | null; trend: 'up' | 'down' | null; pickups30d: number; drops30d: number; delta30d: number | null };

function TrendCard({
  t, accent, stats, onOpen,
}: {
  t: DisplayTeam;
  accent: 'positive' | 'danger';
  stats: RosterStat;
  onOpen: () => void;
}) {
  const delta = stats.delta30d ?? 0;
  return (
    <div
      onClick={onOpen}
      className={`flex-shrink-0 bg-card border rounded-2xl p-3.5 w-[148px] cursor-pointer transition-all ${
        accent === 'positive'
          ? 'border-positive/25 hover:border-positive/50'
          : 'border-danger/25 hover:border-danger/50'
      }`}
    >
      <div className="flex flex-col items-center text-center gap-2">
        <div className="w-11 h-11 flex items-center justify-center">
          {t.logoUrl
            ? <img src={t.logoUrl} alt={t.name} className="w-11 h-11 object-contain" />
            : <div className="w-11 h-11 rounded-xl bg-field-2 flex items-center justify-center text-copy-3 text-xs font-bold">{t.shortName?.slice(0, 2).toUpperCase() ?? '?'}</div>
          }
        </div>
        <div className="w-full">
          <p className="text-xs font-semibold text-copy leading-snug line-clamp-2">{t.name}</p>
          <p className="text-[10px] text-copy-3 mt-0.5">{formatLeagueName(t.sportLeagueId)}</p>
        </div>
        <div>
          <p className={`text-xl font-bold tabular-nums leading-none ${accent === 'positive' ? 'text-positive' : 'text-danger'}`}>
            {delta >= 0 ? '+' : ''}{delta}%
          </p>
          {stats.rosteredPct != null && (
            <p className="text-[10px] text-copy-3 mt-0.5">{stats.rosteredPct}% rostered</p>
          )}
        </div>
        {t.isAvailable ? (
          <span className="text-[10px] font-semibold text-positive bg-positive/10 border border-positive/20 px-2.5 py-0.5 rounded-full leading-none">
            Free
          </span>
        ) : (
          <span className="text-[10px] text-copy-3 bg-field border border-line px-2.5 py-0.5 rounded-full leading-none">
            Rostered
          </span>
        )}
      </div>
    </div>
  );
}

function ClaimCard({
  claim, isCommissioner, teamMap, reviewing, denyingId, denyReason,
  onApprove, onStartDeny, onDenyReasonChange, onConfirmDeny, onCancelDeny, onWithdraw,
  waiverType, faabRemaining, onEditSave,
}: {
  claim: WaiverClaim;
  isCommissioner: boolean;
  teamMap: Map<string, TeamWithRecord>;
  reviewing: string | null;
  denyingId: string | null;
  denyReason: string;
  onApprove: (id: string) => void;
  onStartDeny: (id: string) => void;
  onDenyReasonChange: (v: string) => void;
  onConfirmDeny: (id: string) => void;
  onCancelDeny: () => void;
  onWithdraw?: (id: string) => void;
  waiverType?: 'reserve-standings' | 'faab';
  faabRemaining?: number;
  onEditSave?: (claimId: string, patch: { faabBid?: number }) => Promise<void>;
}) {
  const { openProfile } = useTeamProfile();
  const dropTeam = claim.dropTeamId ? teamMap.get(claim.dropTeamId) ?? null : null;
  const addTeam  = teamMap.get(claim.addTeamId);
  const isReviewing = reviewing === claim.id;
  const isDenying   = denyingId === claim.id;
  const [editMode, setEditMode] = useState(false);
  const [editBid, setEditBid] = useState(claim.faabBid ?? 0);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  return (
    <div className="bg-card border border-line rounded-2xl p-4">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <span className="font-semibold text-copy text-sm">{claim.claimantDisplayName}</span>
            {claim.claimantRank > 0 && (
              <span className="text-xs bg-field border border-line text-copy-3 px-2 py-0.5 rounded-full">
                #{claim.claimantRank} in standings
              </span>
            )}
            <span className={`text-xs px-2.5 py-0.5 rounded-full border font-medium ${WAIVER_STATUS_CLS[claim.status]}`}>
              {claim.status}
            </span>
          </div>

          {/* Team transfer */}
          <div className="flex items-center gap-2">
            {claim.dropTeamId ? (
              <div
                className={`flex-1 bg-danger-bg/40 border border-danger/15 rounded-xl px-3 py-2.5 ${dropTeam ? 'cursor-pointer hover:border-danger/40 transition-colors' : ''}`}
                onClick={() => dropTeam && openProfile({ teamId: claim.dropTeamId!, name: dropTeam.name, logoUrl: dropTeam.logoUrl, sportLeagueId: dropTeam.sportLeagueId, wins: dropTeam.wins, draws: dropTeam.draws, losses: dropTeam.losses, points: dropTeam.points })}
              >
                <p className="text-xs text-copy-3 mb-1">Drop</p>
                <div className="flex items-center gap-2">
                  {dropTeam?.logoUrl && <img src={dropTeam.logoUrl} alt={dropTeam.name} className="w-6 h-6 object-contain flex-shrink-0" />}
                  <p className="font-semibold text-copy text-xs leading-snug">{dropTeam?.name ?? claim.dropTeamId}</p>
                </div>
                {dropTeam && (
                  <>
                    <p className="text-xs text-copy-3 mt-0.5">{formatLeagueName(dropTeam.sportLeagueId)}</p>
                    <p className="text-xs text-copy-2 mt-0.5">
                      {formatRecord(dropTeam.wins, dropTeam.draws, dropTeam.losses, dropTeam.sport)} · {dropTeam.points.toFixed(1)} pts
                    </p>
                  </>
                )}
              </div>
            ) : (
              <div className="flex-1 bg-field border border-line/60 rounded-xl px-3 py-2.5">
                <p className="text-xs text-copy-3 mb-1">Drop</p>
                <p className="text-xs text-copy-3 italic">None — add only</p>
              </div>
            )}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-copy-3 flex-shrink-0">
              <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div
              className={`flex-1 bg-positive-bg/40 border border-positive/15 rounded-xl px-3 py-2.5 ${addTeam ? 'cursor-pointer hover:border-positive/40 transition-colors' : ''}`}
              onClick={() => addTeam && openProfile({ teamId: claim.addTeamId, name: addTeam.name, logoUrl: addTeam.logoUrl, sportLeagueId: addTeam.sportLeagueId, wins: addTeam.wins, draws: addTeam.draws, losses: addTeam.losses, points: addTeam.points })}
            >
              <p className="text-xs text-copy-3 mb-1">Add</p>
              <div className="flex items-center gap-2">
                {addTeam?.logoUrl && <img src={addTeam.logoUrl} alt={addTeam.name} className="w-6 h-6 object-contain flex-shrink-0" />}
                <p className="font-semibold text-copy text-xs leading-snug">{addTeam?.name ?? claim.addTeamId}</p>
              </div>
              {addTeam && (
                <>
                  <p className="text-xs text-copy-3 mt-0.5">{formatLeagueName(addTeam.sportLeagueId)}</p>
                  <p className="text-xs text-copy-2 mt-0.5">
                    {formatRecord(addTeam.wins, addTeam.draws, addTeam.losses, addTeam.sport)} · {addTeam.points.toFixed(1)} pts
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Meta */}
          <div className="flex items-center gap-3 mt-2.5 flex-wrap">
            {claim.groupId && (
              <span className="text-[11px] font-semibold text-copy-3 bg-field border border-line px-2 py-0.5 rounded-full">
                #{claim.priority ?? 1} priority
              </span>
            )}
            <p className="text-xs text-copy-3">
              {new Date(claim.requestedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              {' · '}
              {new Date(claim.requestedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
            {claim.reviewedAt && (
              <p className="text-xs text-copy-3">
                Reviewed {new Date(claim.reviewedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </p>
            )}
            {typeof claim.faabBid === 'number' && (
              <span className="text-xs bg-brand-dim text-brand border border-brand/20 px-2 py-0.5 rounded-full font-medium">
                ${claim.faabBid} bid
              </span>
            )}
          </div>
          {claim.denialReason && (
            <p className="text-xs text-danger mt-1.5 bg-danger-bg/40 rounded-lg px-2.5 py-1.5">
              Denied: {claim.denialReason}
            </p>
          )}
        </div>

        {/* Edit + Withdraw — own pending claim */}
        {onWithdraw && claim.status === 'pending' && !isCommissioner && (
          <div className="flex-shrink-0 flex flex-col gap-1.5 items-end">
            {editMode ? (
              <div className="flex flex-col gap-1.5 w-44">
                {waiverType === 'faab' && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-copy-3">Bid: $</span>
                    <input
                      autoFocus
                      type="number"
                      min={0}
                      max={faabRemaining ?? 9999}
                      value={editBid}
                      onFocus={e => e.target.select()}
                      onChange={e => setEditBid(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                      className="flex-1 bg-field border border-line-2 rounded-lg px-2 py-1.5 text-xs text-copy focus:outline-none focus:border-brand transition-colors"
                    />
                  </div>
                )}
                {editError && <p className="text-[10px] text-danger">{editError}</p>}
                <div className="flex gap-1.5">
                  <button
                    onClick={async () => {
                      if (!onEditSave) return;
                      setEditSaving(true); setEditError('');
                      try {
                        await onEditSave(claim.id, { faabBid: waiverType === 'faab' ? editBid : undefined });
                        setEditMode(false);
                      } catch (e: unknown) {
                        setEditError(e instanceof Error ? e.message : 'Failed to save');
                      } finally { setEditSaving(false); }
                    }}
                    disabled={editSaving}
                    className="flex-1 text-xs bg-brand text-white px-2 py-1.5 rounded-lg font-medium disabled:opacity-50"
                  >
                    {editSaving ? '...' : 'Save'}
                  </button>
                  <button
                    onClick={() => { setEditMode(false); setEditBid(claim.faabBid ?? 0); setEditError(''); }}
                    className="flex-1 text-xs bg-field border border-line text-copy-2 px-2 py-1.5 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-1.5">
                {(waiverType === 'faab' || onEditSave) && (
                  <button
                    onClick={() => { setEditMode(true); setEditBid(claim.faabBid ?? 0); }}
                    className="text-xs bg-field border border-line text-copy-3 hover:border-brand/40 hover:text-brand px-3 py-1.5 rounded-lg transition-colors font-medium"
                  >
                    Edit
                  </button>
                )}
                <button
                  onClick={() => onWithdraw(claim.id)}
                  className="text-xs bg-field border border-line text-copy-3 hover:border-danger/40 hover:text-danger px-3 py-1.5 rounded-lg transition-colors font-medium"
                >
                  Withdraw
                </button>
              </div>
            )}
          </div>
        )}

        {/* Commissioner delete — any claim, any status */}
        {onWithdraw && isCommissioner && (
          <div className="flex-shrink-0">
            <button
              onClick={() => onWithdraw(claim.id)}
              title="Delete claim"
              className="text-copy-3 hover:text-danger transition-colors p-1.5 rounded-lg hover:bg-danger-bg/40"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
              </svg>
            </button>
          </div>
        )}

        {/* Commissioner actions */}
        {isCommissioner && claim.status === 'pending' && (
          <div className="flex-shrink-0">
            {!isDenying ? (
              <div className="flex gap-2">
                <button
                  onClick={() => onApprove(claim.id)}
                  disabled={isReviewing}
                  className="text-xs bg-positive-bg border border-positive/20 text-positive hover:bg-positive hover:text-white px-3 py-1.5 rounded-lg transition-colors font-medium disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isReviewing
                    ? <span className="inline-block w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                    : 'Approve'}
                </button>
                <button
                  onClick={() => onStartDeny(claim.id)}
                  disabled={isReviewing}
                  className="text-xs bg-danger-bg border border-danger/20 text-danger hover:bg-danger hover:text-white px-3 py-1.5 rounded-lg transition-colors font-medium disabled:opacity-50"
                >
                  Deny
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5 w-52">
                <input
                  autoFocus
                  value={denyReason}
                  onChange={e => onDenyReasonChange(e.target.value)}
                  placeholder="Denial reason (optional)"
                  className="bg-field border border-line-2 rounded-lg px-3 py-1.5 text-xs text-copy focus:outline-none focus:border-danger transition-colors"
                />
                <div className="flex gap-1.5">
                  <button
                    onClick={() => onConfirmDeny(claim.id)}
                    disabled={isReviewing}
                    className="flex-1 text-xs bg-danger text-white px-3 py-1.5 rounded-lg font-medium disabled:opacity-50"
                  >
                    {isReviewing ? '...' : 'Confirm'}
                  </button>
                  <button
                    onClick={onCancelDeny}
                    className="flex-1 text-xs bg-field border border-line text-copy-2 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function WaiversTab({
  leagueId, isCommissioner, userId, fantasyTeams, selectedSports, waiverType, faabStartingBudget, rosterSize, waiverSettings, filterPush,
}: {
  leagueId: string;
  isCommissioner: boolean;
  userId?: string;
  fantasyTeams: FantasyTeam[];
  selectedSports: string[];
  waiverType: 'reserve-standings' | 'faab';
  faabStartingBudget: number;
  rosterSize: number;
  waiverSettings?: { processingDay: string; processingHour: number } | null;
  filterPush?: { sport: string | null; v: number };
}) {
  const [claims, setClaims] = useState<WaiverClaim[]>([]);
  const [leagueHistory, setLeagueHistory] = useState<WaiverHistoryClaim[]>([]);
  const [expandedLosingBids, setExpandedLosingBids] = useState<Set<string>>(new Set());
  const [pool, setPool] = useState<TeamWithRecord[]>([]);
  const [allLeagueTeams, setAllLeagueTeams] = useState<TeamWithRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [rosterStats, setRosterStats] = useState<Record<string, { rosteredPct: number | null; trend: 'up' | 'down' | null; pickups30d: number; drops30d: number; delta30d: number | null }>>({});

  // Team browser filters
  const [browseSport, setBrowseSport] = useState('all');
  const [browseSearch, setBrowseSearch] = useState('');
  const [browseSort, setBrowseSort] = useState<'points' | 'alpha' | 'rostered'>('points');
  const [browseAvailability, setBrowseAvailability] = useState<'available' | 'all'>('available');

  // Waiver claim form
  const [showForm, setShowForm] = useState(false);
  const [dropTeamId, setDropTeamId] = useState('');
  // Each slot is one priority claim (all share the same drop)
  const [slots, setSlots] = useState<{ addTeamId: string; faabBid: number; search: string }[]>([
    { addTeamId: '', faabBid: 0, search: '' },
  ]);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');

  // Commissioner state
  const [denyingId, setDenyingId] = useState<string | null>(null);
  const [denyReason, setDenyReason] = useState('');
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (filterPush) setBrowseSport(filterPush.sport ?? 'all');
  }, [filterPush?.v]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    Promise.all([
      api.get<WaiverClaim[]>(`/leagues/${leagueId}/waivers`),
      api.get<WaiverHistoryClaim[]>(`/leagues/${leagueId}/waivers/history`),
      api.get<TeamWithRecord[]>(`/leagues/${leagueId}/waiver-pool`),
      api.get<SportGroup[]>(`/leagues/${leagueId}/sport-teams`).catch(() => [] as SportGroup[]),
    ]).then(([c, hist, p, groups]) => {
      setClaims(c);
      setLeagueHistory(hist);
      setPool(p);
      const teams = groups.flatMap(g => g.teams.map(t => ({
        id: t.id, name: t.name, shortName: t.shortName,
        sportLeagueId: t.sportLeagueId, logoUrl: t.logoUrl,
        sport: g.sport, wins: 0, draws: 0, losses: 0, points: 0,
      })));
      setAllLeagueTeams(teams);
      // Fetch % rostered + trend for all teams in one shot
      const batchPayload = teams.map(t => ({ id: t.id, sportLeagueId: t.sportLeagueId }));
      api.post<Record<string, { rosteredPct: number | null; trend: 'up' | 'down' | null; pickups30d: number; drops30d: number; delta30d: number | null }>>('/sports/roster-stats/batch', { teams: batchPayload })
        .then(setRosterStats)
        .catch(() => {});
    }).catch(() => {}).finally(() => setLoading(false));
  }, [leagueId]);

  const ownerMap = useMemo(() => {
    const m = new Map<string, FantasyTeam>();
    for (const ft of fantasyTeams) {
      for (const id of ft.ownedTeamIds) m.set(id, ft);
    }
    return m;
  }, [fantasyTeams]);

  // Comprehensive map: all league teams as base, pool overrides with real stats
  const comprehensiveTeamMap = useMemo(() => {
    const m = new Map<string, TeamWithRecord>();
    for (const t of allLeagueTeams) m.set(t.id, t);
    for (const t of pool) m.set(t.id, t);
    return m;
  }, [allLeagueTeams, pool]);

  const myTeam = fantasyTeams.find(ft =>
    !ft.isPlaceholder && (ft.userId === userId || (ft.coOwnerIds ?? []).includes(userId ?? '')),
  );

  const allDisplayTeams = useMemo(() => allLeagueTeams.map(t => {
    const stats = comprehensiveTeamMap.get(t.id);
    return {
      ...t,
      wins: stats?.wins ?? 0, draws: stats?.draws ?? 0,
      losses: stats?.losses ?? 0, points: stats?.points ?? 0,
      sport: stats?.sport ?? t.sport,
      isAvailable: !ownerMap.has(t.id),
      ownerName: ownerMap.get(t.id)?.displayName,
      ownerLogoUrl: ownerMap.get(t.id)?.logoUrl ?? null,
    };
  }), [allLeagueTeams, comprehensiveTeamMap, ownerMap]);

  const filteredTeams = useMemo(() => {
    let list = browseAvailability === 'available'
      ? allDisplayTeams.filter(t => t.isAvailable)
      : allDisplayTeams;
    if (browseSport !== 'all') list = list.filter(t => t.sportLeagueId === browseSport);
    if (browseSearch.trim()) {
      const q = browseSearch.trim().toLowerCase();
      list = list.filter(t => t.name.toLowerCase().includes(q) || t.shortName.toLowerCase().includes(q));
    }
    if (browseSort === 'points') return [...list].sort((a, b) => b.points - a.points);
    if (browseSort === 'rostered') return [...list].sort((a, b) => {
      const aP = rosterStats[a.id]?.rosteredPct ?? -1;
      const bP = rosterStats[b.id]?.rosteredPct ?? -1;
      return bP - aP;
    });
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [allDisplayTeams, browseAvailability, browseSport, browseSearch, browseSort, rosterStats]);

  const myRosterTeams = useMemo(() =>
    (myTeam?.ownedTeamIds ?? []).map(id => comprehensiveTeamMap.get(id)).filter(Boolean) as TeamWithRecord[],
    [myTeam, comprehensiveTeamMap],
  );

  const isUnderRosterSize = myRosterTeams.length < rosterSize;

  function filteredPoolForSlot(search: string) {
    if (!search.trim()) return pool;
    const q = search.trim().toLowerCase();
    return pool.filter(t => t.name.toLowerCase().includes(q) || t.shortName.toLowerCase().includes(q));
  }

  const pending = claims.filter(c => c.status === 'pending');
  const history = claims.filter(c => c.status !== 'pending');
  const myTeamUserId = myTeam?.userId;
  const canSubmit = !!myTeam;

  function updateSlot(i: number, updates: Partial<{ addTeamId: string; faabBid: number; search: string }>) {
    setSlots(prev => prev.map((s, idx) => idx === i ? { ...s, ...updates } : s));
  }

  function moveSlot(fromIdx: number, toIdx: number) {
    setSlots(prev => {
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
  }

  function openAddForm(teamId?: string) {
    if (teamId) updateSlot(0, { addTeamId: teamId });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setDropTeamId('');
    setSlots([{ addTeamId: '', faabBid: 0, search: '' }]);
    setSubmitError('');
  }

  async function submitClaim() {
    const filledSlots = slots.filter(s => s.addTeamId);
    if (!filledSlots.length) return;
    if (!isUnderRosterSize && !dropTeamId) return;
    setSubmitting(true); setSubmitError('');
    try {
      if (filledSlots.length === 1) {
        const body: Record<string, unknown> = { addTeamId: filledSlots[0].addTeamId };
        if (dropTeamId) body.dropTeamId = dropTeamId;
        if (waiverType === 'faab') body.faabBid = filledSlots[0].faabBid;
        const claim = await api.post<WaiverClaim>(`/leagues/${leagueId}/waivers`, body);
        setClaims(c => [claim, ...c]);
      } else {
        const body: Record<string, unknown> = {
          claims: filledSlots.map(s => ({
            addTeamId: s.addTeamId,
            ...(waiverType === 'faab' ? { faabBid: s.faabBid } : {}),
          })),
        };
        if (dropTeamId) body.dropTeamId = dropTeamId;
        const newClaims = await api.post<WaiverClaim[]>(`/leagues/${leagueId}/waivers/group`, body);
        setClaims(c => [...newClaims, ...c]);
      }
      closeForm();
      setSubmitSuccess(filledSlots.length > 1 ? `Priority group of ${filledSlots.length} claims submitted.` : 'Claim submitted.');
      setTimeout(() => setSubmitSuccess(''), 4000);
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : 'Failed to submit claim');
    } finally { setSubmitting(false); }
  }

  async function withdraw(claimId: string) {
    try {
      await api.delete(`/leagues/${leagueId}/waivers/${claimId}`);
      setClaims(c => c.filter(x => x.id !== claimId));
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Failed to withdraw claim');
    }
  }

  async function editClaim(claimId: string, patch: { faabBid?: number }) {
    const updated = await api.patch<WaiverClaim>(`/leagues/${leagueId}/waivers/${claimId}`, patch);
    setClaims(c => c.map(x => x.id === claimId ? updated : x));
  }

  async function approve(claimId: string) {
    setReviewing(claimId);
    try {
      await api.patch(`/leagues/${leagueId}/waivers/${claimId}/approve`);
      setClaims(c => c.map(x => x.id === claimId
        ? { ...x, status: 'approved' as const, reviewedAt: new Date().toISOString() } : x));
    } catch (e: unknown) { setActionError(e instanceof Error ? e.message : 'Failed to approve'); }
    finally { setReviewing(null); }
  }

  async function deny(claimId: string) {
    setReviewing(claimId);
    try {
      await api.patch(`/leagues/${leagueId}/waivers/${claimId}/deny`, { reason: denyReason || undefined });
      setClaims(c => c.map(x => x.id === claimId
        ? { ...x, status: 'denied' as const, reviewedAt: new Date().toISOString(), denialReason: denyReason || null } : x));
      setDenyingId(null); setDenyReason('');
    } catch (e: unknown) { setActionError(e instanceof Error ? e.message : 'Failed to deny'); }
    finally { setReviewing(null); }
  }


  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;

  const { openProfile } = useTeamProfile();

  const claimCardProps = {
    isCommissioner, teamMap: comprehensiveTeamMap, reviewing, denyingId, denyReason,
    onApprove: approve,
    onStartDeny: (id: string) => { setDenyingId(id); setDenyReason(''); },
    onDenyReasonChange: setDenyReason,
    onConfirmDeny: deny,
    onCancelDeny: () => setDenyingId(null),
    waiverType,
    faabRemaining: myTeam?.faabRemaining ?? 0,
    onEditSave: editClaim,
  };

  const nextProcessingLabel = (() => {
    const day = waiverSettings?.processingDay ?? 'tuesday';
    const hour = waiverSettings?.processingHour ?? 11;
    const dayLabel = day.charAt(0).toUpperCase() + day.slice(1);
    const timeLabel = hour === 0 ? '12:00 AM' : hour < 12 ? `${hour}:00 AM` : hour === 12 ? '12:00 PM' : `${hour - 12}:00 PM`;
    // Convert ET processing hour to viewer's local time
    const etHourToLocal = (h: number) => {
      const now = new Date();
      const etNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
      const etTarget = new Date(etNow); etTarget.setHours(h, 0, 0, 0);
      return new Date(etTarget.getTime() + (now.getTime() - etNow.getTime()))
        .toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
    };
    // Compute how many days until next occurrence
    const dayIndex = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'].indexOf(day);
    if (dayIndex === -1) return `${dayLabel} at ${etHourToLocal(hour)}`;
    const now = new Date();
    const etNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const todayIdx = etNow.getDay();
    const etHour = etNow.getHours();
    let daysUntil = (dayIndex - todayIdx + 7) % 7;
    if (daysUntil === 0 && etHour >= hour) daysUntil = 7;
    const isToday = daysUntil === 0;
    const isTomorrow = daysUntil === 1;
    const when = isToday ? 'today' : isTomorrow ? 'tomorrow' : `${dayLabel}`;
    return `${when} at ${etHourToLocal(hour)}`;
  })();

  return (
    <div className="space-y-6">
      {actionError && (
        <div className="bg-danger/10 border border-danger/30 text-danger text-sm rounded-xl px-4 py-3 flex items-center justify-between gap-3">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="flex-shrink-0 text-danger/70 hover:text-danger text-lg leading-none">×</button>
        </div>
      )}
      {/* Processing schedule banner */}
      {(waiverSettings || true) && (
        <div className="flex items-center gap-3 bg-field border border-line rounded-xl px-4 py-3">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-copy-3 flex-shrink-0">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          <p className="text-sm text-copy-2">
            Waivers process <span className="font-semibold text-copy">{nextProcessingLabel}</span>
          </p>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-copy">Waivers</h2>
        </div>
        <div className="flex items-center gap-2">
          {canSubmit && !showForm && (
            <button
              onClick={() => openAddForm()}
              className="bg-brand hover:bg-brand-2 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
            >
              Waiver Claim
            </button>
          )}
        </div>
      </div>

      {submitSuccess && (
        <div className="bg-positive-bg border border-positive/20 rounded-xl px-4 py-3">
          <p className="text-positive text-sm">{submitSuccess}</p>
        </div>
      )}

      {/* Waiver claim form */}
      {showForm && canSubmit && (
        <div className="bg-card border border-line rounded-2xl p-5 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-copy">New Waiver Claim</h3>
            <button onClick={closeForm} className="text-copy-3 hover:text-copy transition-colors p-1">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* Step 1: Drop */}
          <div>
            <p className="text-xs font-semibold text-copy-3 uppercase tracking-wider mb-2">
              1. Drop from your roster
              {isUnderRosterSize && (
                <span className="ml-1.5 normal-case font-normal text-copy-3">(optional — you have room)</span>
              )}
            </p>
            {myRosterTeams.length === 0 ? (
              <p className="text-copy-3 text-xs py-2">You have no teams to drop.</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {myRosterTeams.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setDropTeamId(dropTeamId === t.id ? '' : t.id)}
                    className={`text-left px-3 py-2.5 rounded-xl border transition-all ${
                      dropTeamId === t.id
                        ? 'bg-danger-bg border-danger/40 text-copy'
                        : 'bg-field border-line text-copy-2 hover:border-line-2 hover:text-copy'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {t.logoUrl && <img src={t.logoUrl} alt={t.name} className="w-6 h-6 object-contain flex-shrink-0" />}
                      <p className="font-medium text-xs leading-snug">{t.name}</p>
                    </div>
                    <p className="text-xs text-copy-3">{formatLeagueName(t.sportLeagueId)}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Step 2: Priority slots */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-copy-3 uppercase tracking-wider">
              2. Add from available pool
              {slots.length > 1 && <span className="ml-1.5 normal-case font-normal text-copy-3">· priority order — #1 is first choice</span>}
            </p>

            {slots.map((slot, i) => {
              const slotTeam = slot.addTeamId ? comprehensiveTeamMap.get(slot.addTeamId) : null;
              const slotPool = filteredPoolForSlot(slot.search).filter(t =>
                !slots.some((s, si) => si !== i && s.addTeamId === t.id)
              );
              const isDragging = dragIdx === i;
              const isDropTarget = dragOverIdx === i && dragIdx !== i;

              return (
                <div
                  key={i}
                  draggable={slots.length > 1}
                  onDragStart={() => { setDragIdx(i); setDragOverIdx(i); }}
                  onDragOver={e => { e.preventDefault(); setDragOverIdx(i); }}
                  onDrop={e => { e.preventDefault(); if (dragIdx !== null && dragIdx !== i) moveSlot(dragIdx, i); setDragIdx(null); setDragOverIdx(null); }}
                  onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
                  className="border rounded-xl overflow-hidden transition-all"
                  style={{
                    opacity: isDragging ? 0.45 : 1,
                    borderColor: isDropTarget ? 'var(--color-brand)' : 'var(--color-line)',
                    boxShadow: isDropTarget ? '0 0 0 1px var(--color-brand)' : undefined,
                  }}
                >
                  <div className="flex items-center gap-2 px-3 py-2 bg-field/60 border-b border-line">
                    {slots.length > 1 && (
                      <svg
                        width="14" height="14" viewBox="0 0 24 24" fill="currentColor"
                        className="text-copy-3 flex-shrink-0 cursor-grab active:cursor-grabbing"
                        style={{ touchAction: 'none' }}
                      >
                        <circle cx="9" cy="5" r="1.5" /><circle cx="15" cy="5" r="1.5" />
                        <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
                        <circle cx="9" cy="19" r="1.5" /><circle cx="15" cy="19" r="1.5" />
                      </svg>
                    )}
                    <span className="text-[11px] font-bold text-brand tabular-nums">#{i + 1}</span>
                    <span className="text-[11px] font-semibold text-copy-3 uppercase tracking-wide flex-1">
                      {i === 0 ? 'First choice' : 'Backup'}
                    </span>
                    {slots.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setSlots(prev => prev.filter((_, idx) => idx !== i))}
                        className="text-copy-3 hover:text-danger transition-colors"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
                        </svg>
                      </button>
                    )}
                  </div>

                  <div className="p-3 space-y-2">
                    {slotTeam ? (
                      <div className="flex items-center gap-3 bg-brand-dim border border-brand/30 rounded-xl px-3 py-2.5">
                        <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center">
                          {slotTeam.logoUrl
                            ? <img src={slotTeam.logoUrl} alt={slotTeam.name} className="w-8 h-8 object-contain" />
                            : <div className="w-8 h-8 rounded bg-field-2 flex items-center justify-center text-copy-3 text-[10px] font-bold">{slotTeam.shortName?.slice(0, 2).toUpperCase() ?? '?'}</div>
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-brand truncate">{slotTeam.name}</p>
                          <p className="text-xs text-copy-3">{formatLeagueName(slotTeam.sportLeagueId)}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => updateSlot(i, { addTeamId: '', search: '' })}
                          className="text-copy-3 hover:text-copy transition-colors p-1 flex-shrink-0"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="relative">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-copy-3 pointer-events-none">
                            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" strokeLinecap="round" />
                          </svg>
                          <input
                            type="text"
                            value={slot.search}
                            onChange={e => updateSlot(i, { search: e.target.value })}
                            placeholder="Search available teams…"
                            className="w-full bg-field border border-line-2 rounded-lg pl-7 pr-3 py-1.5 text-xs text-copy placeholder-copy-3 focus:outline-none focus:border-brand transition-colors"
                          />
                        </div>
                        {slotPool.length === 0 ? (
                          <p className="text-copy-3 text-xs py-2 text-center">No available teams found.</p>
                        ) : (
                          <div className="border border-line rounded-xl overflow-hidden max-h-48 overflow-y-auto divide-y divide-line/50">
                            {slotPool.map(t => (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => updateSlot(i, { addTeamId: t.id, search: '' })}
                                className="w-full flex items-center gap-3 px-3 py-2.5 transition-colors text-left hover:bg-field"
                              >
                                <div className="w-7 h-7 flex-shrink-0 flex items-center justify-center">
                                  {t.logoUrl
                                    ? <img src={t.logoUrl} alt={t.name} className="w-7 h-7 object-contain" />
                                    : <div className="w-7 h-7 rounded bg-field-2 flex items-center justify-center text-copy-3 text-[10px] font-bold">{t.shortName?.slice(0, 2).toUpperCase() ?? '?'}</div>
                                  }
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-copy truncate">{t.name}</p>
                                  <p className="text-[10px] text-copy-3">{formatLeagueName(t.sportLeagueId)}</p>
                                </div>
                                <div className="text-right flex-shrink-0">
                                  <p className="text-xs font-semibold text-copy tabular-nums">{t.points.toFixed(1)}</p>
                                  <p className="text-[10px] text-copy-3">pts</p>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    )}

                    {/* Per-slot FAAB bid */}
                    {waiverType === 'faab' && slotTeam && (
                      <div className="flex items-center gap-2 pt-1">
                        <span className="text-xs text-copy-3">Bid:</span>
                        <span className="text-xs text-copy-2">$</span>
                        <input
                          type="number" min={0} step={1} max={myTeam?.faabRemaining ?? 0}
                          value={slot.faabBid}
                          onFocus={e => e.target.select()}
                          onChange={e => { const v = e.target.valueAsNumber; updateSlot(i, { faabBid: isNaN(v) ? 0 : Math.max(0, Math.floor(v)) }); }}
                          className="w-24 bg-field border border-line-2 rounded-lg px-3 py-1.5 text-xs text-copy focus:outline-none focus:border-brand transition-colors"
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Add backup slot */}
            {slots[slots.length - 1].addTeamId && (
              <button
                type="button"
                onClick={() => setSlots(prev => [...prev, { addTeamId: '', faabBid: 0, search: '' }])}
                className="w-full flex items-center justify-center gap-1.5 text-xs font-medium text-brand border border-dashed border-brand/40 rounded-xl py-2.5 hover:bg-brand-dim transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                </svg>
                Add backup claim
              </button>
            )}

            {myTeam && waiverType === 'faab' && (
              <p className="text-xs text-copy-3">
                Budget remaining: <span className="font-medium text-copy">${myTeam.faabRemaining ?? 0}</span>
              </p>
            )}
          </div>

          {/* Summary pill */}
          {(dropTeamId || slots[0].addTeamId) && (
            <div className="bg-field rounded-xl px-4 py-2.5 text-xs flex items-center gap-2 flex-wrap">
              {isUnderRosterSize && !dropTeamId ? (
                <span className="text-copy-3 italic">No drop needed</span>
              ) : (
                <span className={dropTeamId ? 'text-danger font-medium' : 'text-copy-3'}>
                  {dropTeamId ? (comprehensiveTeamMap.get(dropTeamId)?.name ?? dropTeamId) : 'Pick a team to drop'}
                </span>
              )}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-copy-3 flex-shrink-0">
                <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {slots.filter(s => s.addTeamId).length === 0 ? (
                <span className="text-copy-3">Pick a team to add</span>
              ) : slots.filter(s => s.addTeamId).length === 1 ? (
                <span className="text-brand font-medium">{comprehensiveTeamMap.get(slots[0].addTeamId)?.name ?? slots[0].addTeamId}</span>
              ) : (
                <span className="text-brand font-medium">{slots.filter(s => s.addTeamId).length} priority claims</span>
              )}
            </div>
          )}

          {submitError && (
            <div className="bg-danger-bg border border-danger/20 rounded-xl px-4 py-2.5">
              <p className="text-danger text-xs">{submitError}</p>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={closeForm}
              className="flex-1 bg-field hover:bg-field-2 border border-line text-copy-2 text-sm font-medium py-2.5 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={submitClaim}
              disabled={submitting || !slots[0].addTeamId || (!isUnderRosterSize && !dropTeamId)}
              className="flex-1 bg-brand hover:bg-brand-2 disabled:opacity-40 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
            >
              {submitting ? 'Submitting...' : slots.filter(s => s.addTeamId).length > 1 ? `Submit ${slots.filter(s => s.addTeamId).length} Priority Claims` : 'Submit Claim'}
            </button>
          </div>
        </div>
      )}

      {/* Trending section */}
      {(() => {
        const hot = allDisplayTeams
          .filter(t => rosterStats[t.id]?.trend === 'up' && rosterStats[t.id]?.delta30d != null)
          .sort((a, b) => (rosterStats[b.id]?.delta30d ?? 0) - (rosterStats[a.id]?.delta30d ?? 0))
          .slice(0, 12);
        if (!hot.length) return null;
        return (
          <div className="bg-card border border-line rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-line flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-copy">Trending</h3>
                <p className="text-xs text-copy-3 mt-0.5">30-day roster % movement</p>
              </div>
            </div>
            {hot.length > 0 && (
              <div className="px-4 pt-4 pb-3">
                <p className="text-xs font-semibold text-positive mb-3 flex items-center gap-1.5">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 19V5M5 12l7-7 7 7" />
                  </svg>
                  Rising
                </p>
                <div className="flex gap-2.5 overflow-x-auto pb-2" style={{ scrollbarWidth: 'thin' }}>
                  {hot.map(t => (
                    <TrendCard
                      key={t.id}
                      t={t}
                      accent="positive"
                      stats={rosterStats[t.id]}
                      onOpen={() => openProfile({ teamId: t.id, name: t.name, logoUrl: t.logoUrl, sportLeagueId: t.sportLeagueId, wins: t.wins, draws: t.draws, losses: t.losses, points: t.points, ownerDisplayName: t.ownerName })}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Team browser */}
      <div className="bg-card border border-line rounded-2xl overflow-hidden">
        {/* Filter toolbar */}
        <div className="px-4 pt-4 pb-3 border-b border-line space-y-3">
          {/* Sport pills */}
          <div className="flex gap-1.5 flex-wrap">
            {['all', ...selectedSports].map(s => (
              <button
                key={s}
                onClick={() => setBrowseSport(s)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  browseSport === s
                    ? 'bg-brand text-white'
                    : 'bg-field border border-line text-copy-3 hover:text-copy hover:border-line-2'
                }`}
              >
                {s === 'all' ? 'All' : formatLeagueName(s)}
              </button>
            ))}
          </div>

          {/* Search + Sort + Availability */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[130px]">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-copy-3 pointer-events-none">
                <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" strokeLinecap="round" />
              </svg>
              <input
                type="text"
                value={browseSearch}
                onChange={e => setBrowseSearch(e.target.value)}
                placeholder="Search teams…"
                className="w-full bg-field border border-line-2 rounded-lg pl-6 pr-3 py-1.5 text-xs text-copy placeholder-copy-3 focus:outline-none focus:border-brand transition-colors"
              />
            </div>
            <select
              value={browseSort}
              onChange={e => setBrowseSort(e.target.value as 'points' | 'alpha' | 'rostered')}
              className="bg-field border border-line-2 text-xs text-copy rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-brand transition-colors"
            >
              <option value="rostered">% Rostered</option>
              <option value="points">Most Points</option>
              <option value="alpha">A–Z</option>
            </select>
            <div className="flex rounded-lg border border-line overflow-hidden text-xs font-medium">
              {(['available', 'all'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setBrowseAvailability(v)}
                  className={`px-3 py-1.5 transition-colors ${
                    browseAvailability === v
                      ? 'bg-brand text-white'
                      : 'bg-field text-copy-3 hover:text-copy'
                  }`}
                >
                  {v === 'available' ? 'Available' : 'All Teams'}
                </button>
              ))}
            </div>
          </div>

          <p className="text-[11px] text-copy-3">
            {filteredTeams.length} {filteredTeams.length === 1 ? 'team' : 'teams'}
          </p>
        </div>

        {/* Team list */}
        <div className="divide-y divide-line/40 max-h-[520px] overflow-y-auto">
          {filteredTeams.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-copy-3 text-sm">No teams found.</p>
            </div>
          ) : filteredTeams.map(t => {
            const stats = rosterStats[t.id];
            return (
            <div
              key={t.id}
              className="flex items-center gap-3 px-4 py-3 hover:bg-field/40 transition-colors cursor-pointer"
              onClick={() => openProfile({ teamId: t.id, name: t.name, logoUrl: t.logoUrl, sportLeagueId: t.sportLeagueId, wins: t.wins, draws: t.draws, losses: t.losses, points: t.points, ownerDisplayName: t.ownerName })}
            >
              {/* Logo */}
              <div className="w-9 h-9 flex-shrink-0 flex items-center justify-center">
                {t.logoUrl
                  ? <img src={t.logoUrl} alt={t.name} className="w-9 h-9 object-contain" />
                  : <div className="w-9 h-9 rounded-lg bg-field-2 border border-line flex items-center justify-center text-copy-3 text-xs font-bold">{t.shortName?.slice(0, 2).toUpperCase() ?? '??'}</div>
                }
              </div>

              {/* Name + meta */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-sm font-semibold text-copy truncate">{t.name}</p>
                  {stats?.trend === 'up' && (
                    <span className="text-[10px] font-semibold text-positive bg-positive/10 border border-positive/20 px-1.5 py-0.5 rounded-full leading-none flex-shrink-0">↑ Trending</span>
                  )}
                  {stats?.trend === 'down' && (
                    <span className="text-[10px] font-semibold text-danger bg-danger/10 border border-danger/20 px-1.5 py-0.5 rounded-full leading-none flex-shrink-0">↓ Dropping</span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[11px] text-copy-3 bg-field border border-line px-1.5 py-0.5 rounded-full leading-none">
                    {formatLeagueName(t.sportLeagueId)}
                  </span>
                  {(t.wins > 0 || t.losses > 0) && (
                    <span className="text-[11px] text-copy-3">
                      {formatRecord(t.wins, t.draws, t.losses, t.sport)}
                    </span>
                  )}
                  {stats?.rosteredPct != null && (
                    <span className="text-[11px] text-copy-3">
                      {stats.rosteredPct}% rostered
                      {stats.delta30d != null && (
                        <span className={`ml-1 font-semibold ${stats.delta30d >= 0 ? 'text-positive' : 'text-danger'}`}>
                          {stats.delta30d >= 0 ? '+' : ''}{stats.delta30d}%
                        </span>
                      )}
                    </span>
                  )}
                </div>
              </div>

              {/* Points + action */}
              <div className="flex items-center gap-3 flex-shrink-0">
                <div className="w-12 text-right">
                  {t.points > 0 && (
                    <>
                      <p className="text-sm font-bold text-copy tabular-nums">{t.points.toFixed(1)}</p>
                      <p className="text-[10px] text-copy-3 leading-none">pts</p>
                    </>
                  )}
                </div>
                <div className="flex items-center justify-center flex-shrink-0">
                  {t.isAvailable ? (
                    canSubmit ? (
                      <button
                        onClick={e => { e.stopPropagation(); openAddForm(t.id); }}
                        className="text-xs bg-brand hover:bg-brand-2 text-white px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap"
                      >
                        Add
                      </button>
                    ) : (
                      <span className="text-[11px] text-positive font-medium px-2 py-0.5 bg-positive-bg border border-positive/20 rounded-full whitespace-nowrap">
                        Free
                      </span>
                    )
                  ) : (
                    t.ownerLogoUrl ? (
                      <img src={t.ownerLogoUrl} alt={t.ownerName ?? ''} className="w-7 h-7 rounded-full object-cover" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-field border border-line flex items-center justify-center" title={t.ownerName}>
                        <span className="text-xs font-semibold text-copy-3">{(t.ownerName ?? '?')[0].toUpperCase()}</span>
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>
          );
          })}
        </div>
      </div>

      {/* Pending claims — own only */}
      {myTeam && pending.length > 0 && (() => {
        const seenGroupIds = new Set<string>();
        const groups: WaiverClaim[][] = [];
        for (const claim of pending) {
          if (!claim.groupId) { groups.push([claim]); continue; }
          if (seenGroupIds.has(claim.groupId)) continue;
          seenGroupIds.add(claim.groupId);
          groups.push(pending.filter(c => c.groupId === claim.groupId).sort((a, b) => (a.priority ?? 1) - (b.priority ?? 1)));
        }
        return (
          <div>
            <p className="text-xs font-semibold text-copy-3 uppercase tracking-widest mb-2">
              Your Pending Claims · {pending.length}
            </p>
            <div className="space-y-3">
              {groups.map((group, gi) => (
                <div key={gi} className={group.length > 1 ? 'border border-brand/20 rounded-2xl overflow-hidden' : ''}>
                  {group.length > 1 && (
                    <div className="px-4 py-2 bg-brand-dim border-b border-brand/20">
                      <p className="text-[11px] font-semibold text-brand">Priority group · {group.length} claims</p>
                      <p className="text-[10px] text-copy-3 mt-0.5">If #1 is denied, #2 is tried next, and so on</p>
                    </div>
                  )}
                  <div className={group.length > 1 ? 'divide-y divide-line/60' : 'space-y-2'}>
                    {group.map(c => (
                      <div key={c.id} className={group.length > 1 ? 'rounded-none border-0' : ''}>
                        <ClaimCard claim={c} {...claimCardProps} onWithdraw={withdraw} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Claim history — own resolved claims */}
      {history.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-copy-3 uppercase tracking-widest mb-2">Your History</p>
          <div className="space-y-2">
            {history.map(c => (
              <ClaimCard key={c.id} claim={c} {...claimCardProps} />
            ))}
          </div>
        </div>
      )}

      {/* League-wide transaction history — grouped by team, winner + collapsible losing bids */}
      {leagueHistory.length > 0 && (() => {
        // Group by addTeamId, preserving order (backend already sorts by reviewedAt desc then groups by bid)
        const seenTeams = new Set<string>();
        const groups: WaiverHistoryClaim[][] = [];
        for (const c of leagueHistory) {
          if (seenTeams.has(c.addTeamId)) continue;
          seenTeams.add(c.addTeamId);
          const group = leagueHistory.filter(x => x.addTeamId === c.addTeamId);
          // winner first, then losers by bid desc
          group.sort((a, b) => {
            if (a.status === 'approved' && b.status !== 'approved') return -1;
            if (a.status !== 'approved' && b.status === 'approved') return 1;
            return (b.faabBid ?? 0) - (a.faabBid ?? 0);
          });
          groups.push(group);
        }

        const sportLabels: Record<string, string> = {
          nfl: 'NFL', nba: 'NBA', nhl: 'NHL', mlb: 'MLB',
          'premier-league': 'EPL', ucl: 'UCL',
          'ncaa-football': 'NCAAF', 'ncaa-basketball': 'NCAAB',
        };

        return (
          <div>
            <p className="text-xs font-semibold text-copy-3 uppercase tracking-widest mb-2">Transaction History</p>
            <div className="bg-card border border-line rounded-2xl overflow-hidden divide-y divide-line/50">
              {groups.map((group) => {
                const winner = group.find(c => c.status === 'approved');
                const losers = group.filter(c => c.status !== 'approved');
                const key = group[0].addTeamId;
                const isExpanded = expandedLosingBids.has(key);
                const sportLabel = sportLabels[group[0].addTeamSportLeagueId ?? ''] ?? (group[0].addTeamSportLeagueId ?? '').toUpperCase();

                return (
                  <div key={key}>
                    {/* Winner row */}
                    <div className="flex items-center gap-3 px-4 py-3">
                      {/* Team logo */}
                      <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center">
                        {group[0].addTeamLogoUrl
                          ? <img src={group[0].addTeamLogoUrl} alt={group[0].addTeamName ?? ''} className="w-8 h-8 object-contain" />
                          : <div className="w-8 h-8 rounded-lg bg-field-2 flex items-center justify-center text-copy-3 text-xs font-bold">?</div>
                        }
                      </div>
                      {/* Team + sport */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-sm font-semibold text-copy truncate">{group[0].addTeamName ?? group[0].addTeamId}</p>
                          {sportLabel && (
                            <span className="text-[10px] font-semibold text-copy-3 bg-field border border-line px-1.5 py-0.5 rounded-full leading-none flex-shrink-0">{sportLabel}</span>
                          )}
                        </div>
                        {winner ? (
                          <p className="text-xs text-copy-3 mt-0.5">
                            Added by <span className="font-medium text-copy-2">{winner.claimantDisplayName}</span>
                            {typeof winner.faabBid === 'number' && (
                              <span className="ml-1.5 text-brand font-medium">${winner.faabBid}</span>
                            )}
                            {winner.dropTeamName && (
                              <span className="text-copy-3"> · dropped {winner.dropTeamName}</span>
                            )}
                          </p>
                        ) : (
                          <p className="text-xs text-danger mt-0.5">All bids denied</p>
                        )}
                      </div>
                      {/* Status badge */}
                      <div className="flex-shrink-0 flex items-center gap-2">
                        {winner ? (
                          <span className="text-[11px] font-semibold text-positive bg-positive/10 border border-positive/20 px-2 py-0.5 rounded-full leading-none">Approved</span>
                        ) : (
                          <span className="text-[11px] font-semibold text-danger bg-danger/10 border border-danger/20 px-2 py-0.5 rounded-full leading-none">Denied</span>
                        )}
                        {/* Expand toggle if there are losing bids */}
                        {losers.length > 0 && (
                          <button
                            onClick={() => setExpandedLosingBids(prev => {
                              const next = new Set(prev);
                              if (next.has(key)) next.delete(key); else next.add(key);
                              return next;
                            })}
                            className="flex items-center gap-1 text-[11px] text-copy-3 hover:text-copy transition-colors"
                          >
                            <span>{losers.length} lost</span>
                            <svg
                              width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                              className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                            >
                              <polyline points="6 9 12 15 18 9" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                    {/* Losing bids — collapsible */}
                    {isExpanded && losers.length > 0 && (
                      <div className="bg-field/50 border-t border-line/40 divide-y divide-line/30">
                        {losers.map(loser => (
                          <div key={loser.id} className="flex items-center gap-3 px-4 py-2.5 pl-14">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-copy-2">
                                <span className="font-medium">{loser.claimantDisplayName}</span>
                                {typeof loser.faabBid === 'number' && (
                                  <span className="ml-1.5 text-copy-3">${loser.faabBid}</span>
                                )}
                              </p>
                              {loser.denialReason && (
                                <p className="text-[11px] text-copy-3 mt-0.5 italic">{loser.denialReason}</p>
                              )}
                            </div>
                            <span className="text-[11px] font-semibold text-danger/70 flex-shrink-0">✗ {loser.denialReason ?? 'denied'}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {claims.length === 0 && !showForm && (
        <div className="text-center py-8 border border-dashed border-line rounded-2xl">
          <p className="text-copy-3 text-sm">You have no waiver claims yet.</p>
        </div>
      )}
    </div>
  );
}

export { ClaimCard, WaiversTab };
