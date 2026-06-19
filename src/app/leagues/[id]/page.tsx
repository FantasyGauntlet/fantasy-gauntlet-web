'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

interface League {
  id: string;
  name: string;
  commissionerId: string;
  state: 'draft' | 'auction' | 'active' | 'completed' | 'cancelled';
  isPublic: boolean;
  memberCap: number | null;
  startDate: string;
  endDate: string;
  selectedSports: string[];
  auctionConfig: {
    startingBudget: number;
    minOpeningBid: number;
    minBidIncrement: number;
    nominationMode: string;
    countdownSeconds: number;
  } | null;
}

interface Member { id: string; userId: string; role: 'commissioner' | 'member'; joinedAt: string; }

interface FantasyTeam {
  id: string; userId: string; displayName: string;
  isPlaceholder: boolean; ownedTeamIds: string[];
  remainingBudget: number; totalPoints: number;
}

interface SportTeam { id: string; name: string; shortName: string; sportLeagueId: string; logoUrl: string | null; }
interface SportGroup { sport: string; teams: SportTeam[]; }

interface TeamBreakdown { teamId: string; teamName: string; sportLeagueId: string; wins: number; draws: number; points: number; }
interface Standing {
  userId: string; displayName: string; rank: number;
  totalPoints: number; teamBreakdown: TeamBreakdown[]; bonusPoints: number;
}

interface WaiverClaim {
  id: string;
  leagueId: string;
  claimantUserId: string;
  claimantDisplayName: string;
  dropTeamId: string;
  addTeamId: string;
  status: 'pending' | 'approved' | 'denied';
  claimantRank: number;
  requestedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  denialReason: string | null;
}

type Tab = 'standings' | 'roster' | 'waivers' | 'settings';

const STATE_META: Record<string, { label: string; cls: string }> = {
  draft:     { label: 'Draft',     cls: 'bg-warn-bg text-warn border-warn/20' },
  auction:   { label: 'Auction',   cls: 'bg-info-bg text-info border-info/20' },
  active:    { label: 'Active',    cls: 'bg-brand-dim text-brand border-brand/20' },
  completed: { label: 'Completed', cls: 'bg-field text-copy-3 border-line' },
  cancelled: { label: 'Cancelled', cls: 'bg-danger-bg text-danger border-danger/20' },
};

function Spinner({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const s = size === 'sm' ? 'w-5 h-5 border-[1.5px]' : 'w-8 h-8 border-2';
  return <div className={`${s} border-brand border-t-transparent rounded-full animate-spin`} />;
}

export default function LeaguePage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const [league, setLeague] = useState<League | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [fantasyTeams, setFantasyTeams] = useState<FantasyTeam[]>([]);
  const [tab, setTab] = useState<Tab>('standings');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<League>(`/leagues/${id}`),
      api.get<Member[]>(`/leagues/${id}/members`),
      api.get<FantasyTeam[]>(`/leagues/${id}/teams`),
    ]).then(([l, m, ft]) => {
      setLeague(l); setMembers(m); setFantasyTeams(ft);
    }).catch(() => router.replace('/dashboard'))
      .finally(() => setLoading(false));
  }, [id, router]);

  async function startAuction() {
    try {
      await api.patch(`/leagues/${id}/state`, { state: 'auction' });
      setLeague(l => l ? { ...l, state: 'auction' } : l);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to start auction');
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }
  if (!league) return null;

  const isCommissioner = league.commissionerId === user?.uid;
  const stateMeta = STATE_META[league.state] ?? STATE_META.completed;
  const tabs: { key: Tab; label: string }[] = [
    { key: 'standings', label: 'Standings' },
    { key: 'roster', label: 'Roster' },
    { key: 'waivers', label: 'Waivers' },
    { key: 'settings', label: 'Settings' },
  ];

  return (
    <div>
      {/* League header */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap mb-1">
              <h1 className="text-2xl font-bold text-copy">{league.name}</h1>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${stateMeta.cls}`}>
                {stateMeta.label}
              </span>
            </div>
            <p className="text-copy-3 text-sm">
              {league.startDate} – {league.endDate}
              <span className="mx-2 text-line-2">·</span>
              {members.length}{league.memberCap ? ` / ${league.memberCap}` : ''} members
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {league.state === 'auction' && (
              <Link
                href={`/leagues/${id}/auction`}
                className="bg-info text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors hover:opacity-90"
              >
                Enter Auction Room
              </Link>
            )}
            {isCommissioner && league.state === 'draft' && (
              <button
                onClick={startAuction}
                disabled={!league.auctionConfig}
                title={!league.auctionConfig ? 'Set auction config in Settings first' : undefined}
                className="bg-brand hover:bg-brand-2 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
              >
                Start Auction
              </button>
            )}
          </div>
        </div>
        {/* Sport tags */}
        <div className="flex gap-1.5 flex-wrap">
          {league.selectedSports.map(s => (
            <span key={s} className="text-xs bg-field border border-line text-copy-3 px-2.5 py-0.5 rounded-lg">{s}</span>
          ))}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-0.5 mb-6 border-b border-line">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors -mb-px border-b-2 ${
              tab === t.key
                ? 'border-brand text-brand'
                : 'border-transparent text-copy-3 hover:text-copy-2 hover:border-line-2'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'standings' && <StandingsTab leagueId={id} userId={user?.uid} />}
      {tab === 'roster' && (
        <RosterTab
          leagueId={id}
          leagueState={league.state}
          fantasyTeams={fantasyTeams}
          setFantasyTeams={setFantasyTeams}
          isCommissioner={isCommissioner}
          selectedSports={league.selectedSports}
        />
      )}
      {tab === 'waivers' && (
        <WaiversTab
          leagueId={id}
          leagueState={league.state}
          isCommissioner={isCommissioner}
          userId={user?.uid}
          fantasyTeams={fantasyTeams}
          selectedSports={league.selectedSports}
        />
      )}
      {tab === 'settings' && (
        <SettingsTab league={league} setLeague={setLeague} isCommissioner={isCommissioner} leagueId={id} />
      )}
    </div>
  );
}

// ─── Standings Tab ────────────────────────────────────────────────────────────

function StandingsTab({ leagueId, userId }: { leagueId: string; userId?: string }) {
  const [standings, setStandings] = useState<Standing[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api.get<Standing[]>(`/leagues/${leagueId}/standings`)
      .then(setStandings).catch(() => {}).finally(() => setLoading(false));
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
            <th className="text-right px-4 py-3 text-xs font-semibold text-copy-3 uppercase tracking-wider hidden sm:table-cell">Teams</th>
            <th className="text-right px-4 py-3 text-xs font-semibold text-copy-3 uppercase tracking-wider hidden sm:table-cell">Bonus</th>
          </tr>
        </thead>
        <tbody>
          {standings.map(s => {
            const totalWins = s.teamBreakdown.reduce((sum, t) => sum + t.wins, 0);
            const isExpanded = expanded === s.userId;
            const isMe = s.userId === userId;
            return (
              <>
                <tr
                  key={s.userId}
                  onClick={() => setExpanded(isExpanded ? null : s.userId)}
                  className={`border-b border-line/50 cursor-pointer hover:bg-field/40 transition-colors ${isMe ? 'bg-brand-dim/30' : ''}`}
                >
                  <td className="px-4 py-3.5">
                    <span className={`text-sm font-bold ${s.rank <= 3 ? 'text-brand' : 'text-copy-2'}`}>
                      #{s.rank}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="text-sm font-medium text-copy">{s.displayName}</span>
                    {isMe && <span className="ml-2 text-xs text-brand font-medium">you</span>}
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <span className="text-sm font-bold text-copy">{s.totalPoints.toFixed(1)}</span>
                  </td>
                  <td className="px-4 py-3.5 text-right hidden sm:table-cell">
                    <span className="text-sm text-copy-3">{s.teamBreakdown.length} · {totalWins}W</span>
                  </td>
                  <td className="px-4 py-3.5 text-right hidden sm:table-cell">
                    <span className="text-sm text-positive">{s.bonusPoints > 0 ? `+${s.bonusPoints.toFixed(1)}` : '—'}</span>
                  </td>
                </tr>
                {isExpanded && s.teamBreakdown.length > 0 && (
                  <tr key={`${s.userId}-bd`} className="border-b border-line/50 bg-field/20">
                    <td colSpan={5} className="px-6 py-4">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {s.teamBreakdown.map(t => (
                          <div key={t.teamId} className="flex items-center justify-between bg-card border border-line rounded-lg px-3 py-2">
                            <div>
                              <p className="text-xs font-medium text-copy">{t.teamName}</p>
                              <p className="text-xs text-copy-3 uppercase mt-0.5">{t.sportLeagueId}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs font-semibold text-copy">{t.points.toFixed(1)}</p>
                              <p className="text-xs text-copy-3">{t.wins}W{t.draws > 0 ? ` ${t.draws}D` : ''}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Roster Tab ───────────────────────────────────────────────────────────────

function RosterTab({
  leagueId, leagueState, fantasyTeams, setFantasyTeams, isCommissioner, selectedSports,
}: {
  leagueId: string;
  leagueState: string;
  fantasyTeams: FantasyTeam[];
  setFantasyTeams: React.Dispatch<React.SetStateAction<FantasyTeam[]>>;
  isCommissioner: boolean;
  selectedSports: string[];
}) {
  const [sportGroups, setSportGroups] = useState<SportGroup[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [placeholderName, setPlaceholderName] = useState('');
  const [addingPlaceholder, setAddingPlaceholder] = useState(false);
  const [inviteEmails, setInviteEmails] = useState<Record<string, string>>({});
  const [inviteStatus, setInviteStatus] = useState<Record<string, { status: 'idle' | 'loading' | 'success' | 'error'; message: string }>>({});

  useEffect(() => {
    api.get<SportGroup[]>(`/leagues/${leagueId}/sport-teams`)
      .then(setSportGroups).catch(() => {}).finally(() => setLoadingTeams(false));
  }, [leagueId]);

  const ownerMap: Record<string, FantasyTeam> = {};
  for (const ft of fantasyTeams) {
    for (const tid of ft.ownedTeamIds) ownerMap[tid] = ft;
  }

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

  async function addPlaceholder(e: React.FormEvent) {
    e.preventDefault();
    if (!placeholderName.trim()) return;
    setAddingPlaceholder(true);
    try {
      const team = await api.post<FantasyTeam>(`/leagues/${leagueId}/members/placeholder`, { displayName: placeholderName.trim() });
      setFantasyTeams(prev => [...prev, team]);
      setPlaceholderName('');
    } catch (err: unknown) { alert(err instanceof Error ? err.message : 'Failed to add player'); }
    finally { setAddingPlaceholder(false); }
  }

  async function sendInvite(fantasyTeamId: string) {
    const email = (inviteEmails[fantasyTeamId] ?? '').trim();
    if (!email) return;
    setInviteStatus(s => ({ ...s, [fantasyTeamId]: { status: 'loading', message: 'Sending...' } }));
    try {
      await api.post(`/leagues/${leagueId}/invites`, { email });
      setInviteStatus(s => ({ ...s, [fantasyTeamId]: { status: 'success', message: `Invite sent to ${email}` } }));
      setInviteEmails(e => ({ ...e, [fantasyTeamId]: '' }));
    } catch (err: unknown) {
      setInviteStatus(s => ({ ...s, [fantasyTeamId]: { status: 'error', message: err instanceof Error ? err.message : 'Failed' } }));
    }
  }

  const memberRosters = fantasyTeams.map(ft => ({
    ft,
    teams: ft.ownedTeamIds
      .map(tid => sportGroups.flatMap(g => g.teams).find(t => t.id === tid))
      .filter(Boolean) as SportTeam[],
  }));

  return (
    <div className="space-y-6">
      {/* Add placeholder player */}
      {isCommissioner && leagueState === 'draft' && (
        <form onSubmit={addPlaceholder} className="flex gap-2">
          <input
            value={placeholderName}
            onChange={e => setPlaceholderName(e.target.value)}
            placeholder="Add placeholder player name..."
            required
            className="flex-1 bg-field border border-line-2 rounded-xl px-4 py-2.5 text-copy text-sm placeholder-copy-3 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors"
          />
          <button
            type="submit"
            disabled={addingPlaceholder || !placeholderName.trim()}
            className="bg-brand hover:bg-brand-2 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors whitespace-nowrap"
          >
            {addingPlaceholder ? '...' : '+ Add Player'}
          </button>
        </form>
      )}

      {/* Roster cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {memberRosters.map(({ ft, teams }) => (
          <div key={ft.id} className="bg-card border border-line rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-copy text-sm">{ft.displayName}</p>
                {ft.isPlaceholder && (
                  <span className="text-xs bg-warn-bg text-warn border border-warn/20 px-2 py-0.5 rounded-full">placeholder</span>
                )}
              </div>
              <span className="text-xs text-copy-3">{teams.length} team{teams.length !== 1 ? 's' : ''}</span>
            </div>

            {teams.length === 0 ? (
              <p className="text-copy-3 text-xs py-2">No teams assigned yet</p>
            ) : (
              <div className="space-y-1.5">
                {teams.map(t => (
                  <div key={t.id} className="flex items-center justify-between bg-field rounded-lg px-3 py-2">
                    <div>
                      <p className="text-xs font-medium text-copy">{t.name}</p>
                      <p className="text-xs text-copy-3 uppercase">{t.sportLeagueId}</p>
                    </div>
                    {isCommissioner && (
                      <button
                        onClick={() => remove(t.id, ft.id)}
                        disabled={assigning === t.id}
                        className="text-xs text-danger hover:text-danger/80 disabled:opacity-50 transition-colors"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {isCommissioner && ft.isPlaceholder && (
              <div className="mt-3 pt-3 border-t border-line">
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={inviteEmails[ft.id] ?? ''}
                    onChange={e => setInviteEmails(s => ({ ...s, [ft.id]: e.target.value }))}
                    placeholder="Invite by email..."
                    className="flex-1 bg-field border border-line-2 rounded-lg px-3 py-1.5 text-copy text-xs placeholder-copy-3 focus:outline-none focus:border-brand transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => sendInvite(ft.id)}
                    disabled={inviteStatus[ft.id]?.status === 'loading' || !inviteEmails[ft.id]?.trim()}
                    className="bg-field-2 hover:bg-line border border-line text-copy-2 text-xs px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap disabled:opacity-50"
                  >
                    {inviteStatus[ft.id]?.status === 'loading' ? '...' : 'Send Invite'}
                  </button>
                </div>
                {inviteStatus[ft.id] && inviteStatus[ft.id].status !== 'idle' && (
                  <p className={`text-xs mt-1.5 ${
                    inviteStatus[ft.id].status === 'success' ? 'text-positive' :
                    inviteStatus[ft.id].status === 'error' ? 'text-danger' : 'text-copy-3'
                  }`}>{inviteStatus[ft.id].message}</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Assign teams — commissioner only */}
      {isCommissioner && (
        <div>
          <h2 className="text-xs font-semibold text-copy-3 uppercase tracking-widest mb-3">Assign Teams</h2>
          {loadingTeams ? (
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
                        {group.teams.map(team => {
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
          )}
        </div>
      )}
    </div>
  );
}

// ─── Waivers Tab ──────────────────────────────────────────────────────────────

const WAIVER_STATUS_CLS: Record<string, string> = {
  pending:  'bg-warn-bg text-warn border-warn/20',
  approved: 'bg-positive-bg text-positive border-positive/20',
  denied:   'bg-danger-bg text-danger border-danger/20',
};

function ClaimCard({
  claim, isCommissioner, teamMap, reviewing, denyingId, denyReason,
  onApprove, onStartDeny, onDenyReasonChange, onConfirmDeny, onCancelDeny,
}: {
  claim: WaiverClaim;
  isCommissioner: boolean;
  teamMap: Map<string, SportTeam>;
  reviewing: string | null;
  denyingId: string | null;
  denyReason: string;
  onApprove: (id: string) => void;
  onStartDeny: (id: string) => void;
  onDenyReasonChange: (v: string) => void;
  onConfirmDeny: (id: string) => void;
  onCancelDeny: () => void;
}) {
  const dropTeam = teamMap.get(claim.dropTeamId);
  const addTeam  = teamMap.get(claim.addTeamId);
  const isReviewing = reviewing === claim.id;
  const isDenying   = denyingId === claim.id;

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
            <div className="flex-1 bg-danger-bg/40 border border-danger/15 rounded-xl px-3 py-2.5">
              <p className="text-xs text-copy-3 mb-0.5">Drop</p>
              <p className="font-semibold text-copy text-xs leading-snug">{dropTeam?.name ?? claim.dropTeamId}</p>
              {dropTeam && <p className="text-xs text-copy-3 uppercase mt-0.5">{dropTeam.sportLeagueId}</p>}
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-copy-3 flex-shrink-0">
              <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="flex-1 bg-positive-bg/40 border border-positive/15 rounded-xl px-3 py-2.5">
              <p className="text-xs text-copy-3 mb-0.5">Add</p>
              <p className="font-semibold text-copy text-xs leading-snug">{addTeam?.name ?? claim.addTeamId}</p>
              {addTeam && <p className="text-xs text-copy-3 uppercase mt-0.5">{addTeam.sportLeagueId}</p>}
            </div>
          </div>

          {/* Meta */}
          <div className="flex items-center gap-3 mt-2.5 flex-wrap">
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
          </div>
          {claim.denialReason && (
            <p className="text-xs text-danger mt-1.5 bg-danger-bg/40 rounded-lg px-2.5 py-1.5">
              Denied: {claim.denialReason}
            </p>
          )}
        </div>

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
  leagueId, leagueState, isCommissioner, userId, fantasyTeams, selectedSports,
}: {
  leagueId: string;
  leagueState: string;
  isCommissioner: boolean;
  userId?: string;
  fantasyTeams: FantasyTeam[];
  selectedSports: string[];
}) {
  const [claims, setClaims] = useState<WaiverClaim[]>([]);
  const [sportGroups, setSportGroups] = useState<SportGroup[]>([]);
  const [loading, setLoading] = useState(true);

  // Submit form
  const [showForm, setShowForm] = useState(false);
  const [dropTeamId, setDropTeamId] = useState('');
  const [addTeamId, setAddTeamId] = useState('');
  const [sportFilter, setSportFilter] = useState('all');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');

  // Inline deny state
  const [denyingId, setDenyingId] = useState<string | null>(null);
  const [denyReason, setDenyReason] = useState('');
  const [reviewing, setReviewing] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<WaiverClaim[]>(`/leagues/${leagueId}/waivers`),
      api.get<SportGroup[]>(`/leagues/${leagueId}/sport-teams`),
    ]).then(([c, sg]) => { setClaims(c); setSportGroups(sg); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [leagueId]);

  const teamMap = useMemo(() => {
    const m = new Map<string, SportTeam>();
    for (const g of sportGroups) for (const t of g.teams) m.set(t.id, t);
    return m;
  }, [sportGroups]);

  const allOwnedIds = useMemo(() => {
    const s = new Set<string>();
    for (const ft of fantasyTeams) for (const id of ft.ownedTeamIds) s.add(id);
    return s;
  }, [fantasyTeams]);

  const myTeam = fantasyTeams.find(ft => ft.userId === userId && !ft.isPlaceholder);

  const availableTeams = useMemo(
    () => sportGroups.flatMap(g => g.teams).filter(t => !allOwnedIds.has(t.id)),
    [sportGroups, allOwnedIds],
  );

  const filteredAvailable = sportFilter === 'all'
    ? availableTeams
    : availableTeams.filter(t => t.sportLeagueId === sportFilter);

  const myRosterTeams = (myTeam?.ownedTeamIds ?? [])
    .map(id => teamMap.get(id)).filter(Boolean) as SportTeam[];

  const pending = claims.filter(c => c.status === 'pending');
  const history = claims.filter(c => c.status !== 'pending');
  const canSubmit = leagueState === 'active' && !isCommissioner && !!myTeam;

  function closeForm() {
    setShowForm(false); setDropTeamId(''); setAddTeamId(''); setSubmitError('');
  }

  async function submitClaim() {
    if (!dropTeamId || !addTeamId) return;
    setSubmitting(true); setSubmitError('');
    try {
      const claim = await api.post<WaiverClaim>(`/leagues/${leagueId}/waivers`, { dropTeamId, addTeamId });
      setClaims(c => [claim, ...c]);
      closeForm();
      setSubmitSuccess('Claim submitted.');
      setTimeout(() => setSubmitSuccess(''), 4000);
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : 'Failed to submit claim');
    } finally { setSubmitting(false); }
  }

  async function approve(claimId: string) {
    setReviewing(claimId);
    try {
      await api.patch(`/leagues/${leagueId}/waivers/${claimId}/approve`);
      setClaims(c => c.map(x => x.id === claimId
        ? { ...x, status: 'approved' as const, reviewedAt: new Date().toISOString() } : x));
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Failed to approve'); }
    finally { setReviewing(null); }
  }

  async function deny(claimId: string) {
    setReviewing(claimId);
    try {
      await api.patch(`/leagues/${leagueId}/waivers/${claimId}/deny`, { reason: denyReason || undefined });
      setClaims(c => c.map(x => x.id === claimId
        ? { ...x, status: 'denied' as const, reviewedAt: new Date().toISOString(), denialReason: denyReason || null } : x));
      setDenyingId(null); setDenyReason('');
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Failed to deny'); }
    finally { setReviewing(null); }
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;

  const claimCardProps = {
    isCommissioner, teamMap, reviewing, denyingId, denyReason,
    onApprove: approve,
    onStartDeny: (id: string) => { setDenyingId(id); setDenyReason(''); },
    onDenyReasonChange: setDenyReason,
    onConfirmDeny: deny,
    onCancelDeny: () => setDenyingId(null),
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-copy">Waiver Claims</h2>
          {leagueState !== 'active' && (
            <p className="text-xs text-copy-3 mt-0.5">
              Claims can only be submitted during an active league.
            </p>
          )}
        </div>
        {canSubmit && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="bg-brand hover:bg-brand-2 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
          >
            + Submit Claim
          </button>
        )}
      </div>

      {submitSuccess && (
        <div className="bg-positive-bg border border-positive/20 rounded-xl px-4 py-3">
          <p className="text-positive text-sm">{submitSuccess}</p>
        </div>
      )}

      {/* Submit form */}
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
                    <p className="font-medium text-xs leading-snug">{t.name}</p>
                    <p className="text-xs text-copy-3 uppercase mt-0.5">{t.sportLeagueId}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Step 2: Add */}
          <div>
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <p className="text-xs font-semibold text-copy-3 uppercase tracking-wider">
                2. Add from available pool
              </p>
              <select
                value={sportFilter}
                onChange={e => setSportFilter(e.target.value)}
                className="bg-field border border-line-2 text-xs text-copy rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-brand transition-colors"
              >
                <option value="all">All sports</option>
                {selectedSports.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {filteredAvailable.length === 0 ? (
              <div className="text-center py-6 border border-dashed border-line rounded-xl">
                <p className="text-copy-3 text-xs">
                  No available teams{sportFilter !== 'all' ? ` in ${sportFilter}` : ''}.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-56 overflow-y-auto pr-0.5">
                {filteredAvailable.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setAddTeamId(addTeamId === t.id ? '' : t.id)}
                    className={`text-left px-3 py-2.5 rounded-xl border transition-all ${
                      addTeamId === t.id
                        ? 'bg-brand-dim border-brand/40 text-copy'
                        : 'bg-field border-line text-copy-2 hover:border-line-2 hover:text-copy'
                    }`}
                  >
                    <p className="font-medium text-xs leading-snug">{t.name}</p>
                    <p className="text-xs text-copy-3 uppercase mt-0.5">{t.sportLeagueId}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Summary pill */}
          {(dropTeamId || addTeamId) && (
            <div className="bg-field rounded-xl px-4 py-2.5 text-xs flex items-center gap-2">
              <span className={dropTeamId ? 'text-danger font-medium' : 'text-copy-3'}>
                {dropTeamId ? (teamMap.get(dropTeamId)?.name ?? dropTeamId) : 'Pick a team to drop'}
              </span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-copy-3 flex-shrink-0">
                <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className={addTeamId ? 'text-brand font-medium' : 'text-copy-3'}>
                {addTeamId ? (teamMap.get(addTeamId)?.name ?? addTeamId) : 'Pick a team to add'}
              </span>
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
              disabled={!dropTeamId || !addTeamId || submitting}
              className="flex-1 bg-brand hover:bg-brand-2 disabled:opacity-40 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
            >
              {submitting ? 'Submitting...' : 'Submit Claim'}
            </button>
          </div>
        </div>
      )}

      {/* Pending */}
      {pending.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-copy-3 uppercase tracking-widest mb-2">
            Pending · {pending.length}
          </p>
          <div className="space-y-2">
            {pending.map(c => <ClaimCard key={c.id} claim={c} {...claimCardProps} />)}
          </div>
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-copy-3 uppercase tracking-widest mb-2">History</p>
          <div className="space-y-2">
            {history.map(c => <ClaimCard key={c.id} claim={c} {...claimCardProps} />)}
          </div>
        </div>
      )}

      {/* Empty state */}
      {claims.length === 0 && !showForm && (
        <div className="text-center py-16 border border-dashed border-line rounded-2xl">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-copy-3 mx-auto mb-3">
            <path d="M8 7h12M8 12h12M8 17h12M4 7h.01M4 12h.01M4 17h.01" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p className="text-copy-3 text-sm">No waiver claims yet.</p>
          {canSubmit && (
            <button
              onClick={() => setShowForm(true)}
              className="mt-3 text-brand text-sm hover:text-brand-2 transition-colors font-medium"
            >
              Submit the first claim →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

function SettingsTab({
  league, setLeague, isCommissioner, leagueId,
}: {
  league: League;
  setLeague: React.Dispatch<React.SetStateAction<League | null>>;
  isCommissioner: boolean;
  leagueId: string;
}) {
  const [auctionForm, setAuctionForm] = useState({
    startingBudget:   league.auctionConfig?.startingBudget   ?? 100,
    minOpeningBid:    league.auctionConfig?.minOpeningBid    ?? 1,
    minBidIncrement:  league.auctionConfig?.minBidIncrement  ?? 1,
    nominationMode:   league.auctionConfig?.nominationMode   ?? 'manual',
    countdownSeconds: league.auctionConfig?.countdownSeconds ?? 30,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const inputCls = 'w-full bg-field border border-line-2 rounded-xl px-4 py-2.5 text-copy text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors';

  async function saveAuctionConfig(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await api.patch<League>(`/leagues/${leagueId}/auction-config`, auctionForm);
      setLeague(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 max-w-xl">
      {/* League info */}
      <div className="bg-card border border-line rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-copy mb-4">League Info</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          {[
            { label: 'League ID', value: <code className="text-xs font-mono text-copy-2">{league.id}</code> },
            { label: 'Visibility', value: <span className="text-copy">{league.isPublic ? 'Public' : 'Private'}</span> },
            { label: 'Start', value: <span className="text-copy">{league.startDate}</span> },
            { label: 'End', value: <span className="text-copy">{league.endDate}</span> },
          ].map(row => (
            <div key={row.label}>
              <p className="text-xs text-copy-3 mb-0.5">{row.label}</p>
              {row.value}
            </div>
          ))}
        </div>
        {isCommissioner && (
          <p className="text-xs text-brand mt-4 pt-3 border-t border-line">You are the commissioner of this league.</p>
        )}
      </div>

      {/* Auction config */}
      {isCommissioner && (
        <div className="bg-card border border-line rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-copy mb-1">Auction Settings</h2>
          <p className="text-xs text-copy-3 mb-5">Must be configured before starting the auction.</p>
          <form onSubmit={saveAuctionConfig} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-copy-2 mb-1.5">Starting Budget ($)</label>
                <input
                  type="number" min={1} required value={auctionForm.startingBudget}
                  onChange={e => setAuctionForm(f => ({ ...f, startingBudget: Number(e.target.value) }))}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-copy-2 mb-1.5">Min Opening Bid ($)</label>
                <input
                  type="number" min={1} required value={auctionForm.minOpeningBid}
                  onChange={e => setAuctionForm(f => ({ ...f, minOpeningBid: Number(e.target.value) }))}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-copy-2 mb-1.5">Min Bid Increment ($)</label>
                <input
                  type="number" min={1} required value={auctionForm.minBidIncrement}
                  onChange={e => setAuctionForm(f => ({ ...f, minBidIncrement: Number(e.target.value) }))}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-copy-2 mb-1.5">Countdown (sec)</label>
                <input
                  type="number" min={5} max={120} required value={auctionForm.countdownSeconds}
                  onChange={e => setAuctionForm(f => ({ ...f, countdownSeconds: Number(e.target.value) }))}
                  className={inputCls}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-copy-2 mb-1.5">Nomination Mode</label>
              <select
                value={auctionForm.nominationMode}
                onChange={e => setAuctionForm(f => ({ ...f, nominationMode: e.target.value }))}
                className={inputCls}
              >
                <option value="manual">Manual — commissioner picks who nominates</option>
                <option value="random-disclosed">Random (disclosed) — order shown to all</option>
                <option value="random-hidden">Random (hidden) — revealed one at a time</option>
                <option value="defined">Defined — set order in advance</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="bg-brand hover:bg-brand-2 disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm"
            >
              {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save Auction Settings'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
