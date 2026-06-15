'use client';

import { useEffect, useState } from 'react';
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

interface Member {
  id: string;
  userId: string;
  role: 'commissioner' | 'member';
  joinedAt: string;
}

interface FantasyTeam {
  id: string;
  userId: string;
  displayName: string;
  isPlaceholder: boolean;
  ownedTeamIds: string[];
  remainingBudget: number;
  totalPoints: number;
}

interface SportTeam {
  id: string;
  name: string;
  shortName: string;
  sportLeagueId: string;
  logoUrl: string | null;
}

interface SportGroup {
  sport: string;
  teams: SportTeam[];
}

interface TeamBreakdown {
  teamId: string;
  teamName: string;
  sportLeagueId: string;
  wins: number;
  draws: number;
  points: number;
}

interface Standing {
  userId: string;
  displayName: string;
  rank: number;
  totalPoints: number;
  teamBreakdown: TeamBreakdown[];
  bonusPoints: number;
}

type Tab = 'standings' | 'roster' | 'waivers' | 'settings';

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
      setLeague(l);
      setMembers(m);
      setFantasyTeams(ft);
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
      <div className="flex justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
      </div>
    );
  }

  if (!league) return null;

  const isCommissioner = league.commissionerId === user?.uid;
  const stateColors: Record<string, string> = {
    draft: 'bg-yellow-900 text-yellow-300',
    auction: 'bg-blue-900 text-blue-300',
    active: 'bg-green-900 text-green-300',
    completed: 'bg-gray-700 text-gray-300',
    cancelled: 'bg-red-900 text-red-300',
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">{league.name}</h1>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <span className={`text-xs font-medium px-2 py-1 rounded-full ${stateColors[league.state] ?? 'bg-gray-700 text-gray-300'}`}>
              {league.state}
            </span>
            <span className="text-gray-400 text-sm">{members.length}{league.memberCap ? ` / ${league.memberCap}` : ''} members</span>
            <span className="text-gray-400 text-sm">{league.startDate} – {league.endDate}</span>
          </div>
          <div className="flex gap-1.5 flex-wrap mt-2">
            {league.selectedSports.map(s => (
              <span key={s} className="text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded">{s}</span>
            ))}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          {league.state === 'auction' && (
            <Link
              href={`/leagues/${id}/auction`}
              className="bg-blue-600 hover:bg-blue-500 text-white font-medium px-4 py-2 rounded-lg transition-colors text-sm"
            >
              Enter Auction Room
            </Link>
          )}
          {isCommissioner && league.state === 'draft' && (
            <button
              onClick={startAuction}
              disabled={!league.auctionConfig}
              title={!league.auctionConfig ? 'Set auction config in Settings first' : undefined}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium px-4 py-2 rounded-lg transition-colors text-sm"
            >
              Start Auction
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-800 rounded-lg p-1 mb-6 w-fit">
        {(['standings', 'roster', 'waivers', 'settings'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${
              tab === t ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'standings' && (
        <StandingsTab leagueId={id} userId={user?.uid} />
      )}

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
        <WaiversTab leagueId={id} isCommissioner={isCommissioner} />
      )}

      {tab === 'settings' && (
        <SettingsTab
          league={league}
          setLeague={setLeague}
          isCommissioner={isCommissioner}
          leagueId={id}
        />
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
      .then(setStandings)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [leagueId]);

  if (loading) return <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500" /></div>;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-800">
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Rank</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Manager</th>
            <th className="text-right px-4 py-3 text-xs font-medium text-gray-400 uppercase">Points</th>
            <th className="text-right px-4 py-3 text-xs font-medium text-gray-400 uppercase">Teams</th>
            <th className="text-right px-4 py-3 text-xs font-medium text-gray-400 uppercase">Bonus</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s) => {
            const totalWins = s.teamBreakdown.reduce((sum, t) => sum + t.wins, 0);
            const isExpanded = expanded === s.userId;
            return (
              <>
                <tr
                  key={s.userId}
                  onClick={() => setExpanded(isExpanded ? null : s.userId)}
                  className={`border-b border-gray-800/50 cursor-pointer hover:bg-gray-800/30 ${s.userId === userId ? 'bg-indigo-900/10' : ''}`}
                >
                  <td className="px-4 py-3 text-white font-medium">#{s.rank}</td>
                  <td className="px-4 py-3 text-white">
                    {s.displayName}
                    {s.userId === userId && <span className="ml-2 text-xs text-indigo-400">(you)</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-white font-medium">{s.totalPoints.toFixed(1)}</td>
                  <td className="px-4 py-3 text-right text-gray-400">{s.teamBreakdown.length} ({totalWins}W)</td>
                  <td className="px-4 py-3 text-right text-gray-400">{s.bonusPoints > 0 ? `+${s.bonusPoints.toFixed(1)}` : '—'}</td>
                </tr>
                {isExpanded && s.teamBreakdown.length > 0 && (
                  <tr key={`${s.userId}-breakdown`} className="border-b border-gray-800/50 bg-gray-800/20">
                    <td colSpan={5} className="px-6 py-3">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {s.teamBreakdown.map(t => (
                          <div key={t.teamId} className="text-xs">
                            <span className="text-white">{t.teamName}</span>
                            <span className="text-gray-500 ml-2">{t.wins}W{t.draws > 0 ? ` ${t.draws}D` : ''} · {t.points.toFixed(1)}pts</span>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
          {standings.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                No standings yet — assign teams and sync records to see points.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── Roster Tab ───────────────────────────────────────────────────────────────

function RosterTab({
  leagueId,
  leagueState,
  fantasyTeams,
  setFantasyTeams,
  isCommissioner,
  selectedSports,
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

  function toggleGroup(sport: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(sport)) next.delete(sport); else next.add(sport);
      return next;
    });
  }

  useEffect(() => {
    api.get<SportGroup[]>(`/leagues/${leagueId}/sport-teams`)
      .then(setSportGroups)
      .catch(() => {})
      .finally(() => setLoadingTeams(false));
  }, [leagueId]);

  // Build a lookup: teamId → fantasy team that owns it
  const ownerMap: Record<string, FantasyTeam> = {};
  for (const ft of fantasyTeams) {
    for (const tid of ft.ownedTeamIds) {
      ownerMap[tid] = ft;
    }
  }

  async function assign(teamId: string, fantasyTeamId: string) {
    setAssigning(teamId);
    try {
      const updated = await api.post<FantasyTeam>(`/leagues/${leagueId}/roster/assign`, { fantasyTeamId, teamId });
      setFantasyTeams(prev => prev.map(ft => ft.id === fantasyTeamId ? updated : ft));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to assign team');
    } finally {
      setAssigning(null);
    }
  }

  async function remove(teamId: string, fantasyTeamId: string) {
    setAssigning(teamId);
    try {
      const updated = await api.post<FantasyTeam>(`/leagues/${leagueId}/roster/remove`, { fantasyTeamId, teamId });
      setFantasyTeams(prev => prev.map(ft => ft.id === fantasyTeamId ? updated : ft));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to remove team');
    } finally {
      setAssigning(null);
    }
  }

  async function addPlaceholder(e: React.FormEvent) {
    e.preventDefault();
    if (!placeholderName.trim()) return;
    setAddingPlaceholder(true);
    try {
      const team = await api.post<FantasyTeam>(`/leagues/${leagueId}/members/placeholder`, { displayName: placeholderName.trim() });
      setFantasyTeams(prev => [...prev, team]);
      setPlaceholderName('');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to add player');
    } finally {
      setAddingPlaceholder(false);
    }
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
      setInviteStatus(s => ({ ...s, [fantasyTeamId]: { status: 'error', message: err instanceof Error ? err.message : 'Failed to send invite' } }));
    }
  }

  // Per-member roster summary at the top
  const memberRosters = fantasyTeams.map(ft => ({
    ft,
    teams: ft.ownedTeamIds
      .map(tid => sportGroups.flatMap(g => g.teams).find(t => t.id === tid))
      .filter(Boolean) as SportTeam[],
  }));

  return (
    <div className="space-y-6">
      {/* Add Placeholder Player — commissioner + draft only */}
      {isCommissioner && leagueState === 'draft' && (
        <form onSubmit={addPlaceholder} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex gap-3">
          <input
            value={placeholderName}
            onChange={e => setPlaceholderName(e.target.value)}
            placeholder="New player name..."
            required
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="submit"
            disabled={addingPlaceholder || !placeholderName.trim()}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
          >
            {addingPlaceholder ? 'Adding...' : '+ Add Player'}
          </button>
        </form>
      )}

      {/* Member roster cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {memberRosters.map(({ ft, teams }) => (
          <div key={ft.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-medium text-white">{ft.displayName}</p>
                {ft.isPlaceholder && (
                  <span className="text-xs bg-yellow-900/40 text-yellow-400 border border-yellow-800/60 px-1.5 py-0.5 rounded">placeholder</span>
                )}
              </div>
              <span className="text-xs text-gray-500">{teams.length} team{teams.length !== 1 ? 's' : ''}</span>
            </div>
            {teams.length === 0 ? (
              <p className="text-gray-600 text-sm">No teams assigned yet</p>
            ) : (
              <div className="space-y-1">
                {teams.map(t => (
                  <div key={t.id} className="flex items-center justify-between text-sm">
                    <span className="text-gray-300">{t.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-600 uppercase">{t.sportLeagueId}</span>
                      {isCommissioner && (
                        <button
                          onClick={() => remove(t.id, ft.id)}
                          disabled={assigning === t.id}
                          className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {/* Email invite for placeholder players */}
            {isCommissioner && ft.isPlaceholder && (
              <div className="mt-3 pt-3 border-t border-gray-800">
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={inviteEmails[ft.id] ?? ''}
                    onChange={e => setInviteEmails(s => ({ ...s, [ft.id]: e.target.value }))}
                    placeholder="Invite by email..."
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => sendInvite(ft.id)}
                    disabled={inviteStatus[ft.id]?.status === 'loading' || !inviteEmails[ft.id]?.trim()}
                    className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                  >
                    {inviteStatus[ft.id]?.status === 'loading' ? '...' : 'Send Invite'}
                  </button>
                </div>
                {inviteStatus[ft.id] && inviteStatus[ft.id].status !== 'idle' && (
                  <p className={`text-xs mt-1 ${
                    inviteStatus[ft.id].status === 'success' ? 'text-green-400' :
                    inviteStatus[ft.id].status === 'error' ? 'text-red-400' : 'text-gray-400'
                  }`}>{inviteStatus[ft.id].message}</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Available teams by sport */}
      {isCommissioner && (
        <div>
          <h2 className="text-lg font-semibold text-white mb-4">Assign Teams</h2>
          {loadingTeams ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500" />
            </div>
          ) : sportGroups.every(g => g.teams.length === 0) ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center">
              <p className="text-gray-400 mb-2">No teams found for this league's sports.</p>
              <p className="text-gray-500 text-sm">Run <strong className="text-gray-400">Sync Teams</strong> in the admin panel first, then return here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sportGroups.map(group => {
                if (group.teams.length === 0) return null;
                const isOpen = expandedGroups.has(group.sport);
                const assignedCount = group.teams.filter(t => ownerMap[t.id]).length;
                return (
                  <div key={group.sport} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                    {/* Clickable header — acts as the dropdown toggle */}
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.sport)}
                      className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-800/40 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className={`transition-transform duration-200 text-gray-400 text-xs ${isOpen ? 'rotate-90' : ''}`}>▶</span>
                        <h3 className="font-medium text-white uppercase text-sm tracking-wide">{group.sport}</h3>
                      </div>
                      <div className="flex items-center gap-3">
                        {assignedCount > 0 && (
                          <span className="text-xs text-indigo-400">{assignedCount} assigned</span>
                        )}
                        <span className="text-xs text-gray-500">{group.teams.length} teams</span>
                      </div>
                    </button>

                    {/* Collapsible team list */}
                    {isOpen && (
                      <div className="border-t border-gray-800 divide-y divide-gray-800/50">
                        {group.teams.map(team => {
                          const owner = ownerMap[team.id];
                          return (
                            <div key={team.id} className="flex items-center justify-between px-4 py-3">
                              <div>
                                <p className="text-white text-sm">{team.name}</p>
                                {owner && (
                                  <p className="text-xs text-indigo-400 mt-0.5">→ {owner.displayName}</p>
                                )}
                              </div>
                              {owner ? (
                                <button
                                  onClick={() => remove(team.id, owner.id)}
                                  disabled={assigning === team.id}
                                  className="text-sm text-red-400 hover:text-red-300 disabled:opacity-50 px-3 py-1 rounded"
                                >
                                  {assigning === team.id ? '...' : 'Remove'}
                                </button>
                              ) : (
                                <select
                                  disabled={assigning === team.id}
                                  defaultValue=""
                                  onChange={e => { if (e.target.value) assign(team.id, e.target.value); e.target.value = ''; }}
                                  className="bg-gray-800 border border-gray-700 text-sm text-white rounded-lg px-2 py-1 disabled:opacity-50"
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

function WaiversTab({ leagueId, isCommissioner }: { leagueId: string; isCommissioner: boolean }) {
  const [claims, setClaims] = useState<Array<{
    id: string; claimantDisplayName: string; dropTeamId: string;
    addTeamId: string; status: string; requestedAt: string;
  }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<typeof claims>(`/leagues/${leagueId}/waivers`)
      .then(setClaims)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [leagueId]);

  async function approve(claimId: string) {
    await api.patch(`/leagues/${leagueId}/waivers/${claimId}/approve`);
    setClaims(c => c.map(x => x.id === claimId ? { ...x, status: 'approved' } : x));
  }

  async function deny(claimId: string) {
    const reason = prompt('Reason for denial (optional):') ?? '';
    await api.patch(`/leagues/${leagueId}/waivers/${claimId}/deny`, { reason });
    setClaims(c => c.map(x => x.id === claimId ? { ...x, status: 'denied' } : x));
  }

  if (loading) return <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500" /></div>;

  return (
    <div className="space-y-3">
      {claims.length === 0 && <p className="text-gray-500 text-center py-8">No waiver claims yet.</p>}
      {claims.map(c => (
        <div key={c.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-white font-medium">{c.claimantDisplayName}</p>
            <p className="text-gray-400 text-sm">Drop {c.dropTeamId} → Add {c.addTeamId}</p>
            <p className="text-gray-500 text-xs mt-1">{new Date(c.requestedAt).toLocaleDateString()}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${
              c.status === 'pending' ? 'bg-yellow-900 text-yellow-300' :
              c.status === 'approved' ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'
            }`}>{c.status}</span>
            {isCommissioner && c.status === 'pending' && (
              <>
                <button onClick={() => approve(c.id)} className="text-sm bg-green-700 hover:bg-green-600 text-white px-3 py-1 rounded-lg">Approve</button>
                <button onClick={() => deny(c.id)} className="text-sm bg-red-800 hover:bg-red-700 text-white px-3 py-1 rounded-lg">Deny</button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

function SettingsTab({
  league,
  setLeague,
  isCommissioner,
  leagueId,
}: {
  league: League;
  setLeague: React.Dispatch<React.SetStateAction<League | null>>;
  isCommissioner: boolean;
  leagueId: string;
}) {
  const [auctionForm, setAuctionForm] = useState({
    startingBudget: league.auctionConfig?.startingBudget ?? 100,
    minOpeningBid: league.auctionConfig?.minOpeningBid ?? 1,
    minBidIncrement: league.auctionConfig?.minBidIncrement ?? 1,
    nominationMode: league.auctionConfig?.nominationMode ?? 'manual',
    countdownSeconds: league.auctionConfig?.countdownSeconds ?? 30,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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
    <div className="space-y-6">
      {/* League info */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-3">
        <h2 className="text-white font-semibold mb-4">League Info</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-400 mb-0.5">League ID</p>
            <code className="text-gray-300 font-mono text-xs">{league.id}</code>
          </div>
          <div>
            <p className="text-gray-400 mb-0.5">Visibility</p>
            <p className="text-white">{league.isPublic ? 'Public' : 'Private'}</p>
          </div>
          <div>
            <p className="text-gray-400 mb-0.5">Start Date</p>
            <p className="text-white">{league.startDate}</p>
          </div>
          <div>
            <p className="text-gray-400 mb-0.5">End Date</p>
            <p className="text-white">{league.endDate}</p>
          </div>
        </div>
        {isCommissioner && (
          <p className="text-xs text-indigo-400 pt-2">You are the commissioner of this league.</p>
        )}
      </div>

      {/* Auction config */}
      {isCommissioner && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-white font-semibold mb-1">Auction Settings</h2>
          <p className="text-gray-500 text-sm mb-5">Must be configured before starting the auction.</p>
          <form onSubmit={saveAuctionConfig} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-300 mb-1">Starting Budget ($)</label>
                <input
                  type="number" min={1} required
                  value={auctionForm.startingBudget}
                  onChange={e => setAuctionForm(f => ({ ...f, startingBudget: Number(e.target.value) }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">Min Opening Bid ($)</label>
                <input
                  type="number" min={1} required
                  value={auctionForm.minOpeningBid}
                  onChange={e => setAuctionForm(f => ({ ...f, minOpeningBid: Number(e.target.value) }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">Min Bid Increment ($)</label>
                <input
                  type="number" min={1} required
                  value={auctionForm.minBidIncrement}
                  onChange={e => setAuctionForm(f => ({ ...f, minBidIncrement: Number(e.target.value) }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">Countdown (seconds)</label>
                <input
                  type="number" min={5} max={120} required
                  value={auctionForm.countdownSeconds}
                  onChange={e => setAuctionForm(f => ({ ...f, countdownSeconds: Number(e.target.value) }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">Nomination Mode</label>
              <select
                value={auctionForm.nominationMode}
                onChange={e => setAuctionForm(f => ({ ...f, nominationMode: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white"
              >
                <option value="manual">Manual — commissioner picks who nominates</option>
                <option value="random-disclosed">Random (disclosed) — random order shown to all</option>
                <option value="random-hidden">Random (hidden) — order revealed one at a time</option>
                <option value="defined">Defined — set order in advance</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium px-5 py-2 rounded-lg transition-colors"
            >
              {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save Auction Settings'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
