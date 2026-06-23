'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { storage } from '@/lib/firebase';

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
  seasonRefs: { sportLeagueId: string; winValue: number; drawValue: number | null; scalingValue: number; }[];
  auctionConfig: {
    startingBudget: number;
    minOpeningBid: number;
    minBidIncrement: number;
    nominationMode: string;
    countdownSeconds: number;
  } | null;
  previousLeagueId?: string;
  topZone?: number | null;
  bottomZone?: number | null;
  waiverSettings?: { processingDay: string; processingHour: number } | null;
}

interface Member { id: string; userId: string; role: 'commissioner' | 'member'; joinedAt: string; }

interface LeagueInvite {
  id: string; leagueId: string; toEmail: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled';
  createdAt: string; expiresAt: string;
}

interface FantasyTeam {
  id: string; userId: string; displayName: string;
  logoUrl?: string | null;
  isPlaceholder: boolean; ownedTeamIds: string[];
  remainingBudget: number; totalPoints: number;
  coOwnerIds?: string[];
}

interface SportTeam { id: string; name: string; shortName: string; sportLeagueId: string; logoUrl: string | null; }
interface SportGroup { sport: string; teams: SportTeam[]; }

interface TeamBreakdown { teamId: string; teamName: string; sportLeagueId: string; sport: string; logoUrl: string | null; wins: number; draws: number; losses: number; points: number; }
interface BonusBreakdownItem { teamId: string; teamName: string; label: string; points: number; }
interface Standing {
  userId: string; displayName: string; rank: number;
  totalPoints: number; teamBreakdown: TeamBreakdown[]; bonusPoints: number;
  bonusBreakdown: BonusBreakdownItem[];
}

interface TeamWithRecord {
  id: string;
  name: string;
  shortName: string;
  sportLeagueId: string;
  sport: string;
  logoUrl: string | null;
  wins: number;
  draws: number;
  losses: number;
  points: number;
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

interface Trade {
  id: string;
  leagueId: string;
  proposerFantasyTeamId: string;
  proposerUserId: string;
  receiverFantasyTeamId: string;
  receiverUserId: string;
  offeredSportTeamIds: string[];
  requestedSportTeamIds: string[];
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
  createdAt: string;
  updatedAt: string;
}

interface Announcement {
  id: string; leagueId: string; authorUserId: string;
  authorDisplayName: string; content: string; createdAt: string;
}

interface LeagueMessage {
  id: string; leagueId: string; authorUserId: string;
  authorDisplayName: string; content: string; createdAt: string;
}

type TxEvent =
  | { type: 'trade'; id: string; date: string; proposerFantasyTeamId: string; receiverFantasyTeamId: string; offeredSportTeamIds: string[]; requestedSportTeamIds: string[]; }
  | { type: 'waiver'; id: string; date: string; claimantUserId: string; claimantDisplayName: string; addTeamId: string; dropTeamId: string; };

type Tab = 'standings' | 'roster' | 'waivers' | 'settings';

const STATE_META: Record<string, { label: string; cls: string }> = {
  draft:     { label: 'Draft',     cls: 'bg-warn-bg text-warn border-warn/20' },
  auction:   { label: 'Auction',   cls: 'bg-info-bg text-info border-info/20' },
  active:    { label: 'Active',    cls: 'bg-brand-dim text-brand border-brand/20' },
  completed: { label: 'Completed', cls: 'bg-field text-copy-3 border-line' },
  cancelled: { label: 'Cancelled', cls: 'bg-danger-bg text-danger border-danger/20' },
};

const SPORT_ORDER = ['world-cup', 'nfl', 'nba', 'mlb', 'nhl', 'ncaa-football', 'ncaa-basketball', 'premier-league', 'ucl'];

const LEAGUE_ACRONYMS = new Set(['nhl', 'nba', 'nfl', 'mlb', 'ucl', 'ncaa', 'mls', 'fifa', 'ufc']);

function formatLeagueName(id: string): string {
  return id.split('-').map(word =>
    LEAGUE_ACRONYMS.has(word.toLowerCase())
      ? word.toUpperCase()
      : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  ).join(' ');
}

function formatRecord(wins: number, draws: number, losses: number, sport: string): string {
  if (sport === 'soccer') return `${wins}W ${draws}D ${losses}L`;
  const parts = [`${wins}W`, `${losses}L`];
  if (draws > 0) parts.push(`${draws}D`);
  return parts.join(' ');
}

function timeAgo(dateStr: string): string {
  const m = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

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
      await api.post(`/leagues/${id}/auction/start`);
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
    { key: 'settings', label: 'League' },
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

      {tab === 'standings' && <StandingsTab leagueId={id} userId={user?.uid} fantasyTeams={fantasyTeams} topZone={league.topZone} bottomZone={league.bottomZone} />}
      {tab === 'roster' && (
        <RosterTab
          leagueId={id}
          leagueState={league.state}
          fantasyTeams={fantasyTeams}
          setFantasyTeams={setFantasyTeams}
          isCommissioner={isCommissioner}
          selectedSports={league.selectedSports}
          userId={user?.uid}
        />
      )}
      {tab === 'waivers' && (
        <WaiversTab
          leagueId={id}
          isCommissioner={isCommissioner}
          userId={user?.uid}
          fantasyTeams={fantasyTeams}
          selectedSports={league.selectedSports}
        />
      )}
      {tab === 'settings' && (
        <SettingsTab league={league} setLeague={setLeague} isCommissioner={isCommissioner} leagueId={id} memberCount={members.length} previousLeagueId={league.previousLeagueId} userId={user?.uid} fantasyTeams={fantasyTeams} />
      )}
    </div>
  );
}

// ─── Standings Tab ────────────────────────────────────────────────────────────

function StandingsTab({ leagueId, userId, fantasyTeams, topZone, bottomZone }: { leagueId: string; userId?: string; fantasyTeams: FantasyTeam[]; topZone?: number | null; bottomZone?: number | null; }) {
  const [standings, setStandings] = useState<Standing[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);

  const logoByUserId = new Map(fantasyTeams.map(ft => [ft.userId, ft.logoUrl ?? null]));

  // Set of primary-owner userIds where the current user is owner or co-owner
  const myTeamOwnerIds = new Set(
    fantasyTeams
      .filter(ft => ft.userId === userId || (ft.coOwnerIds ?? []).includes(userId ?? ''))
      .map(ft => ft.userId)
  );

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
            const isMe = myTeamOwnerIds.has(s.userId);
            const inTopZone = !!topZone && s.rank <= topZone;
            const inBottomZone = !!bottomZone && s.rank > standings.length - bottomZone;
            return (
              <>
                <tr
                  key={s.userId}
                  onClick={() => setExpanded(isExpanded ? null : s.userId)}
                  className={`border-b border-line/50 cursor-pointer hover:bg-field/40 transition-colors ${
                    isMe ? 'bg-brand-dim/30' : inTopZone ? 'bg-positive-bg/20' : inBottomZone ? 'bg-danger-bg/20' : ''
                  }`}
                >
                  <td className={`px-4 py-3.5 ${inTopZone ? 'border-l-2 border-l-positive' : inBottomZone ? 'border-l-2 border-l-danger' : 'border-l-2 border-l-transparent'}`}>
                    <span className={`text-sm font-bold ${inTopZone ? 'text-positive' : inBottomZone ? 'text-danger' : 'text-copy-2'}`}>
                      #{s.rank}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2.5">
                      {logoByUserId.get(s.userId) && (
                        <img src={logoByUserId.get(s.userId)!} alt={s.displayName} className="w-7 h-7 object-cover rounded-full flex-shrink-0" />
                      )}
                      <div>
                        <span className="text-sm font-medium text-copy">{s.displayName}</span>
                        {isMe && <span className="ml-2 text-xs text-brand font-medium">you</span>}
                      </div>
                    </div>
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
                    <td colSpan={5} className="px-6 py-4 space-y-3">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {[...s.teamBreakdown].sort((a, b) => a.teamName.localeCompare(b.teamName)).map(t => {
                          const teamBonuses = s.bonusBreakdown?.filter(b => b.teamId === t.teamId) ?? [];
                          const teamBonusTotal = teamBonuses.reduce((sum, b) => sum + b.points, 0);
                          const teamTotal = t.points + teamBonusTotal;
                          const teamKey = `${s.userId}_${t.teamId}`;
                          const isTeamExpanded = expandedTeam === teamKey;
                          const hasBonus = teamBonuses.length > 0;
                          return (
                            <div
                              key={t.teamId}
                              onClick={() => hasBonus && setExpandedTeam(isTeamExpanded ? null : teamKey)}
                              className={`bg-card border rounded-lg overflow-hidden transition-colors ${
                                hasBonus ? 'border-positive/30 cursor-pointer hover:border-positive/60' : 'border-line'
                              }`}
                            >
                              <div className="flex items-center justify-between px-3 py-2 gap-2">
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  {t.logoUrl && (
                                    <img src={t.logoUrl} alt={t.teamName} className="w-7 h-7 object-contain flex-shrink-0" />
                                  )}
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1">
                                      <p className="text-xs font-medium text-copy truncate">{t.teamName}</p>
                                      {hasBonus && <span className="text-positive text-xs flex-shrink-0">★</span>}
                                    </div>
                                    <p className="text-xs text-copy-3 mt-0.5">{formatLeagueName(t.sportLeagueId)}</p>
                                  </div>
                                </div>
                                <div className="text-right flex-shrink-0">
                                  <p className="text-xs font-semibold text-copy">{teamTotal.toFixed(1)}</p>
                                  <p className="text-xs text-copy-3">{formatRecord(t.wins, t.draws, t.losses, t.sport)}</p>
                                </div>
                              </div>
                              {isTeamExpanded && (
                                <div className="border-t border-line/50 bg-field/40 px-3 py-2 space-y-1">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs text-copy-3">Season</span>
                                    <span className="text-xs text-copy">{t.points.toFixed(1)}</span>
                                  </div>
                                  {teamBonuses.map((b, i) => (
                                    <div key={i} className="flex items-center justify-between">
                                      <span className="text-xs text-positive">{b.label}</span>
                                      <span className="text-xs font-semibold text-positive">+{b.points.toFixed(1)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-copy-3 pt-1 border-t border-line/50">
                        <span>Season: <span className="text-copy font-medium">{(s.totalPoints - s.bonusPoints).toFixed(1)}</span></span>
                        {s.bonusPoints > 0 && <span>Bonus: <span className="text-positive font-medium">+{s.bonusPoints.toFixed(1)}</span></span>}
                        <span>Total: <span className="text-copy font-semibold">{s.totalPoints.toFixed(1)}</span></span>
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
  leagueId, leagueState, fantasyTeams, setFantasyTeams, isCommissioner, selectedSports, userId,
}: {
  leagueId: string;
  leagueState: string;
  fantasyTeams: FantasyTeam[];
  setFantasyTeams: React.Dispatch<React.SetStateAction<FantasyTeam[]>>;
  isCommissioner: boolean;
  selectedSports: string[];
  userId?: string;
}) {
  const [sportGroups, setSportGroups] = useState<SportGroup[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [placeholderName, setPlaceholderName] = useState('');
  const [addingPlaceholder, setAddingPlaceholder] = useState(false);
  const [inviteEmails, setInviteEmails] = useState<Record<string, string>>({});
  const [inviteStatus, setInviteStatus] = useState<Record<string, { status: 'idle' | 'loading' | 'success' | 'error'; message: string }>>({});
  const [invites, setInvites] = useState<LeagueInvite[]>([]);
  const [inviteActions, setInviteActions] = useState<Record<string, 'cancelling' | 'resending' | null>>({});
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

  const [coOwners, setCoOwners] = useState<{ uid: string; email: string }[]>([]);
  const [coOwnerEmail, setCoOwnerEmail] = useState('');
  const [coOwnerSaving, setCoOwnerSaving] = useState(false);
  const [coOwnerMsg, setCoOwnerMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
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

  useEffect(() => {
    api.get<SportGroup[]>(`/leagues/${leagueId}/sport-teams`)
      .then(setSportGroups).catch(() => {}).finally(() => setLoadingTeams(false));
    api.get<Standing[]>(`/leagues/${leagueId}/standings`).then(setStandings).catch(() => {});
    api.get<Trade[]>(`/leagues/${leagueId}/trades`).then(setTrades).catch(() => {});
  }, [leagueId]);

  useEffect(() => {
    if (!isCommissioner) return;
    api.get<LeagueInvite[]>(`/leagues/${leagueId}/invites`)
      .then(data => setInvites(data.filter(i => i.status === 'pending')))
      .catch(() => {});
  }, [leagueId, isCommissioner]);

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

  // Load co-owners when viewing a non-placeholder team (own team or commissioner viewing any team)
  useEffect(() => {
    setCoOwners([]);
    setCoOwnerMsg(null);
    setCoOwnerEmail('');
    const t = fantasyTeams.find(ft => ft.id === viewingId);
    if (!t || t.isPlaceholder) return;
    const mine = !t.isPlaceholder && (t.userId === userId || (t.coOwnerIds ?? []).includes(userId ?? ''));
    if (mine) {
      api.get<{ uid: string; email: string }[]>(`/leagues/${leagueId}/teams/my/co-owners`)
        .then(setCoOwners).catch(() => {});
    } else if (isCommissioner) {
      api.get<{ uid: string; email: string }[]>(`/leagues/${leagueId}/teams/${viewingId}/co-owners`)
        .then(setCoOwners).catch(() => {});
    }
  }, [viewingId, leagueId, fantasyTeams, userId, isCommissioner]);

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

  async function cancelInvite(inviteId: string) {
    setInviteActions(a => ({ ...a, [inviteId]: 'cancelling' }));
    try {
      await api.delete(`/leagues/${leagueId}/invites/${inviteId}`);
      setInvites(i => i.filter(x => x.id !== inviteId));
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Failed to cancel'); }
    finally { setInviteActions(a => ({ ...a, [inviteId]: null })); }
  }

  async function resendInvite(inviteId: string) {
    setInviteActions(a => ({ ...a, [inviteId]: 'resending' }));
    try {
      await api.post(`/leagues/${leagueId}/invites/${inviteId}/resend`);
      setInviteActions(a => ({ ...a, [inviteId]: null }));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to resend');
      setInviteActions(a => ({ ...a, [inviteId]: null }));
    }
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

  async function handleAddCoOwner(e: React.FormEvent) {
    e.preventDefault();
    if (!coOwnerEmail.trim()) return;
    setCoOwnerSaving(true); setCoOwnerMsg(null);
    try {
      const updated = await api.post<{ uid: string; email: string }[]>(
        `/leagues/${leagueId}/teams/my/co-owners`,
        { email: coOwnerEmail.trim() },
      );
      setCoOwners(updated);
      setCoOwnerEmail('');
      setCoOwnerMsg({ type: 'success', text: 'Co-owner added.' });
      setTimeout(() => setCoOwnerMsg(null), 3000);
    } catch (err: unknown) {
      setCoOwnerMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to add co-owner' });
    } finally { setCoOwnerSaving(false); }
  }

  async function handleRemoveCoOwner(coOwnerUid: string) {
    try {
      const endpoint = viewingIsPrimaryOwner
        ? `/leagues/${leagueId}/teams/my/co-owners/${coOwnerUid}`
        : `/leagues/${leagueId}/teams/${viewingId}/co-owners/${coOwnerUid}`;
      const updated = await api.delete<{ uid: string; email: string }[]>(endpoint);
      setCoOwners(updated);
    } catch (err: unknown) {
      setCoOwnerMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to remove co-owner' });
    }
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

  async function sendInvite(fantasyTeamId: string) {
    const email = (inviteEmails[fantasyTeamId] ?? '').trim();
    if (!email) return;
    setInviteStatus(s => ({ ...s, [fantasyTeamId]: { status: 'loading', message: 'Sending...' } }));
    try {
      const invite = await api.post<LeagueInvite>(`/leagues/${leagueId}/invites`, { email, placeholderTeamId: fantasyTeamId });
      setInviteStatus(s => ({ ...s, [fantasyTeamId]: { status: 'success', message: `Invite sent to ${email}` } }));
      setInviteEmails(e => ({ ...e, [fantasyTeamId]: '' }));
      setInvites(i => [...i, invite]);
    } catch (err: unknown) {
      setInviteStatus(s => ({ ...s, [fantasyTeamId]: { status: 'error', message: err instanceof Error ? err.message : 'Failed' } }));
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
              <img src={viewingTeam.logoUrl} alt={viewingTeam.displayName} className="w-10 h-10 object-cover rounded-full flex-shrink-0" />
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
              <p className="text-xs text-copy-3 mt-0.5">{viewingOwnedTeams.length} team{viewingOwnedTeams.length !== 1 ? 's' : ''}</p>
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
        {viewingOwnedTeams.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-copy-3 text-sm">No teams assigned yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-line/50">
            {viewingOwnedTeams.map(t => {
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
                    <div className="flex items-center gap-3 min-w-0">
                      {t.logoUrl && (
                        <img src={t.logoUrl} alt={t.name} className="w-9 h-9 object-contain flex-shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-copy truncate">{t.name}</p>
                          {isWildCard && (
                            <span className="text-xs bg-warn-bg text-warn border border-warn/20 px-1.5 py-0.5 rounded-full whitespace-nowrap flex-shrink-0">Wild Card</span>
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
        )}
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
                onClick={() => !logoUploading && logoInputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setLogoDragging(true); }}
                onDragLeave={() => setLogoDragging(false)}
                onDrop={e => {
                  e.preventDefault();
                  setLogoDragging(false);
                  const f = e.dataTransfer.files[0];
                  if (f && f.type.startsWith('image/')) uploadLogo(f);
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
                      {logoUploading ? `Uploading ${logoUploadProgress}%…` : 'Drop a new image or click to replace'}
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
                      {logoUploading ? `Uploading ${logoUploadProgress}%…` : 'Drop your logo here'}
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

      {/* ── Co-owners ── */}
      {viewingTeam && !viewingTeam.isPlaceholder && (viewingIsMe || isCommissioner) && (
        <div className="bg-card border border-line rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-copy mb-1">Co-owners</h2>
          <p className="text-xs text-copy-3 mb-4">
            {viewingIsMe
              ? 'Allow another account to manage this team alongside you.'
              : `Co-owners linked to ${viewingTeam.displayName}.`}
          </p>
          {coOwners.length > 0 && (
            <div className="space-y-2 mb-4">
              {coOwners.map(co => (
                <div key={co.uid} className="flex items-center justify-between bg-field border border-line rounded-xl px-4 py-2.5">
                  <span className="text-sm text-copy">{co.email}</span>
                  {(viewingIsPrimaryOwner || isCommissioner) && (
                    <button
                      type="button"
                      onClick={() => handleRemoveCoOwner(co.uid)}
                      className="text-xs text-danger hover:text-danger/80 transition-colors font-medium ml-3"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {coOwners.length === 0 && (
            <p className="text-xs text-copy-3 mb-4">No co-owners.</p>
          )}
          {viewingIsPrimaryOwner && (
            <form onSubmit={handleAddCoOwner} className="flex gap-2">
              <input
                type="email"
                value={coOwnerEmail}
                onChange={e => setCoOwnerEmail(e.target.value)}
                placeholder="Email address..."
                className="flex-1 bg-field border border-line-2 rounded-xl px-4 py-2 text-copy text-sm placeholder-copy-3 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors"
              />
              <button
                type="submit"
                disabled={!coOwnerEmail.trim() || coOwnerSaving}
                className="bg-field-2 hover:bg-line border border-line text-copy-2 text-sm font-medium px-4 py-2 rounded-xl transition-colors whitespace-nowrap disabled:opacity-50"
              >
                {coOwnerSaving ? '...' : 'Add'}
              </button>
            </form>
          )}
          {coOwnerMsg && (
            <p className={`text-xs mt-2 ${coOwnerMsg.type === 'error' ? 'text-danger' : 'text-positive'}`}>
              {coOwnerMsg.text}
            </p>
          )}
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
          {/* Add placeholder */}
          {leagueState === 'draft' && (
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

          {/* Invite placeholders */}
          {fantasyTeams.filter(ft => ft.isPlaceholder).map(ft => (
            <div key={ft.id} className="bg-card border border-line rounded-2xl px-4 py-3">
              <p className="text-xs font-medium text-copy mb-2">{ft.displayName} — Send Invite</p>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={inviteEmails[ft.id] ?? ''}
                  onChange={e => setInviteEmails(s => ({ ...s, [ft.id]: e.target.value }))}
                  placeholder="Email address..."
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
          ))}

          {/* Pending invites */}
          {invites.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-copy-3 uppercase tracking-widest mb-3">
                Pending Invites · {invites.length}
              </h2>
              <div className="space-y-2">
                {invites.map(invite => {
                  const action = inviteActions[invite.id];
                  return (
                    <div key={invite.id} className="bg-card border border-line rounded-2xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <p className="text-sm font-medium text-copy">{invite.toEmail}</p>
                        <p className="text-xs text-copy-3 mt-0.5">
                          Sent {new Date(invite.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          <span className="mx-1.5">·</span>
                          Expires {new Date(invite.expiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </p>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button onClick={() => resendInvite(invite.id)} disabled={!!action}
                          className="text-xs bg-field hover:bg-field-2 border border-line text-copy-2 hover:text-copy px-3 py-1.5 rounded-lg transition-colors font-medium disabled:opacity-50">
                          {action === 'resending' ? 'Sending...' : 'Resend'}
                        </button>
                        <button onClick={() => cancelInvite(invite.id)} disabled={!!action}
                          className="text-xs bg-danger-bg border border-danger/20 text-danger hover:bg-danger hover:text-white px-3 py-1.5 rounded-lg transition-colors font-medium disabled:opacity-50">
                          {action === 'cancelling' ? 'Cancelling...' : 'Cancel'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Assign teams */}
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
          )}
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
  claim, isCommissioner, userId, teamMap, reviewing, denyingId, denyReason,
  onApprove, onStartDeny, onDenyReasonChange, onConfirmDeny, onCancelDeny,
}: {
  claim: WaiverClaim;
  isCommissioner: boolean;
  userId?: string;
  teamMap: Map<string, TeamWithRecord>;
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
  const showClaimant = isCommissioner || claim.claimantUserId === userId;

  return (
    <div className="bg-card border border-line rounded-2xl p-4">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <span className="font-semibold text-copy text-sm">{showClaimant ? claim.claimantDisplayName : 'Anonymous'}</span>
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
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-copy-3 flex-shrink-0">
              <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="flex-1 bg-positive-bg/40 border border-positive/15 rounded-xl px-3 py-2.5">
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
  leagueId, isCommissioner, userId, fantasyTeams, selectedSports,
}: {
  leagueId: string;
  isCommissioner: boolean;
  userId?: string;
  fantasyTeams: FantasyTeam[];
  selectedSports: string[];
}) {
  const [claims, setClaims] = useState<WaiverClaim[]>([]);
  const [pool, setPool] = useState<TeamWithRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Submit form
  const [showForm, setShowForm] = useState(false);
  const [dropTeamId, setDropTeamId] = useState('');
  const [addTeamId, setAddTeamId] = useState('');
  const [sportFilter, setSportFilter] = useState('all');
  const [poolSearch, setPoolSearch] = useState('');
  const [poolSort, setPoolSort] = useState<'alpha' | 'points'>('alpha');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');

  // Inline deny state
  const [denyingId, setDenyingId] = useState<string | null>(null);
  const [denyReason, setDenyReason] = useState('');
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get<WaiverClaim[]>(`/leagues/${leagueId}/waivers`),
      api.get<TeamWithRecord[]>(`/leagues/${leagueId}/waiver-pool`),
    ]).then(([c, p]) => { setClaims(c); setPool(p); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [leagueId]);

  const teamMap = useMemo(() => {
    const m = new Map<string, TeamWithRecord>();
    for (const t of pool) m.set(t.id, t);
    return m;
  }, [pool]);

  const allOwnedIds = useMemo(() => {
    const s = new Set<string>();
    for (const ft of fantasyTeams) for (const id of ft.ownedTeamIds) s.add(id);
    return s;
  }, [fantasyTeams]);

  const myTeam = fantasyTeams.find(ft =>
    !ft.isPlaceholder && (ft.userId === userId || (ft.coOwnerIds ?? []).includes(userId ?? '')),
  );

  const availableTeams = useMemo(
    () => pool.filter(t => !allOwnedIds.has(t.id)),
    [pool, allOwnedIds],
  );

  const filteredAvailable = useMemo(() => {
    let list = sportFilter === 'all' ? availableTeams : availableTeams.filter(t => t.sportLeagueId === sportFilter);
    if (poolSearch.trim()) {
      const q = poolSearch.trim().toLowerCase();
      list = list.filter(t => t.name.toLowerCase().includes(q) || t.shortName.toLowerCase().includes(q));
    }
    return poolSort === 'points'
      ? [...list].sort((a, b) => b.points - a.points)
      : [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [availableTeams, sportFilter, poolSearch, poolSort]);

  const myRosterTeams = (myTeam?.ownedTeamIds ?? [])
    .map(id => teamMap.get(id)).filter(Boolean) as TeamWithRecord[];

  const pending = claims.filter(c => c.status === 'pending');
  const history = claims.filter(c => c.status !== 'pending');
  const canSubmit = !!myTeam;

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

  async function processWaivers() {
    setProcessing(true);
    try {
      const result = await api.post<{ approved: number; denied: number }>(`/leagues/${leagueId}/waivers/process`);
      const fresh = await api.get<WaiverClaim[]>(`/leagues/${leagueId}/waivers`);
      setClaims(fresh);
      alert(`Processing complete: ${result.approved} approved, ${result.denied} denied.`);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to process waivers');
    } finally { setProcessing(false); }
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;

  const claimCardProps = {
    isCommissioner, userId, teamMap, reviewing, denyingId, denyReason,
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
        </div>
        <div className="flex items-center gap-2">
          {isCommissioner && pending.length > 0 && (
            <button
              onClick={processWaivers}
              disabled={processing}
              className="bg-positive hover:bg-positive/90 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
            >
              {processing ? 'Processing...' : 'Process Waivers'}
            </button>
          )}
          {canSubmit && !showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="bg-brand hover:bg-brand-2 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
            >
              + Submit Claim
            </button>
          )}
        </div>
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
                    <div className="flex items-center gap-2 mb-1">
                      {t.logoUrl && <img src={t.logoUrl} alt={t.name} className="w-6 h-6 object-contain flex-shrink-0" />}
                      <p className="font-medium text-xs leading-snug">{t.name}</p>
                    </div>
                    <p className="text-xs text-copy-3">{formatLeagueName(t.sportLeagueId)}</p>
                    <p className="text-xs text-copy-2 mt-1">
                      {formatRecord(t.wins, t.draws, t.losses, t.sport)} · {t.points.toFixed(1)} pts
                    </p>
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
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={sportFilter}
                  onChange={e => setSportFilter(e.target.value)}
                  className="bg-field border border-line-2 text-xs text-copy rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-brand transition-colors"
                >
                  <option value="all">All sports</option>
                  {selectedSports.map(s => <option key={s} value={s}>{formatLeagueName(s)}</option>)}
                </select>
                <button
                  type="button"
                  onClick={() => setPoolSort(s => s === 'alpha' ? 'points' : 'alpha')}
                  className="bg-field border border-line-2 text-xs text-copy-2 rounded-lg px-2.5 py-1.5 hover:border-brand hover:text-copy transition-colors"
                >
                  {poolSort === 'alpha' ? 'A–Z' : 'Top Pts'}
                </button>
              </div>
            </div>
            <div className="mb-2">
              <input
                type="text"
                value={poolSearch}
                onChange={e => setPoolSearch(e.target.value)}
                placeholder="Search teams..."
                className="w-full bg-field border border-line-2 rounded-lg px-3 py-1.5 text-xs text-copy placeholder-copy-3 focus:outline-none focus:border-brand transition-colors"
              />
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
                    <div className="flex items-center gap-2 mb-1">
                      {t.logoUrl && <img src={t.logoUrl} alt={t.name} className="w-6 h-6 object-contain flex-shrink-0" />}
                      <p className="font-medium text-xs leading-snug">{t.name}</p>
                    </div>
                    <p className="text-xs text-copy-3">{formatLeagueName(t.sportLeagueId)}</p>
                    <p className="text-xs text-copy-2 mt-1">
                      {formatRecord(t.wins, t.draws, t.losses, t.sport)} · {t.points.toFixed(1)} pts
                    </p>
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
  league, setLeague, isCommissioner, leagueId, memberCount, previousLeagueId, userId, fantasyTeams,
}: {
  league: League;
  setLeague: React.Dispatch<React.SetStateAction<League | null>>;
  isCommissioner: boolean;
  leagueId: string;
  memberCount: number;
  previousLeagueId?: string;
  userId?: string;
  fantasyTeams: FantasyTeam[];
}) {
  const router = useRouter();
  const msgEndRef = useRef<HTMLDivElement>(null);

  const [auctionForm, setAuctionForm] = useState({
    startingBudget:   league.auctionConfig?.startingBudget   ?? 100,
    minOpeningBid:    league.auctionConfig?.minOpeningBid    ?? 1,
    minBidIncrement:  league.auctionConfig?.minBidIncrement  ?? 1,
    nominationMode:   league.auctionConfig?.nominationMode   ?? 'manual',
    countdownSeconds: league.auctionConfig?.countdownSeconds ?? 30,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteInput, setDeleteInput] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [renewing, setRenewing] = useState(false);

  const [topZoneEnabled, setTopZoneEnabled] = useState(!!(league.topZone));
  const [topZoneCount, setTopZoneCount] = useState(league.topZone ?? 4);
  const [bottomZoneEnabled, setBottomZoneEnabled] = useState(!!(league.bottomZone));
  const [bottomZoneCount, setBottomZoneCount] = useState(league.bottomZone ?? 3);
  const [zonesSaving, setZonesSaving] = useState(false);

  const [waiverDay, setWaiverDay] = useState(league.waiverSettings?.processingDay ?? 'tuesday');
  const [waiverHour, setWaiverHour] = useState(league.waiverSettings?.processingHour ?? 10);
  const [waiverSettingsSaving, setWaiverSettingsSaving] = useState(false);

  const [transactions, setTransactions] = useState<TxEvent[]>([]);
  const [txLoading, setTxLoading] = useState(true);
  const [allSportTeams, setAllSportTeams] = useState<SportTeam[]>([]);

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [newAnnouncement, setNewAnnouncement] = useState('');
  const [announcementSaving, setAnnouncementSaving] = useState(false);
  const [showAnnounceForm, setShowAnnounceForm] = useState(false);

  const [messages, setMessages] = useState<LeagueMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [messageSending, setMessageSending] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get<TxEvent[]>(`/leagues/${leagueId}/transactions`).catch(() => [] as TxEvent[]),
      api.get<SportGroup[]>(`/leagues/${leagueId}/sport-teams`).catch(() => [] as SportGroup[]),
      api.get<Announcement[]>(`/leagues/${leagueId}/announcements`).catch(() => [] as Announcement[]),
      api.get<LeagueMessage[]>(`/leagues/${leagueId}/messages`).catch(() => [] as LeagueMessage[]),
    ]).then(([txs, groups, anns, msgs]) => {
      setTransactions(txs);
      setAllSportTeams(groups.flatMap(g => g.teams));
      setAnnouncements(anns);
      setMessages(msgs);
    }).finally(() => setTxLoading(false));
  }, [leagueId]);

  const sportTeamById = useMemo(
    () => new Map(allSportTeams.map(t => [t.id, t])),
    [allSportTeams],
  );

  const ftById = useMemo(
    () => new Map(fantasyTeams.map(ft => [ft.id, ft])),
    [fantasyTeams],
  );

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

  async function handleDeleteLeague() {
    if (deleteInput !== 'delete') return;
    setDeleting(true);
    try {
      await api.delete(`/leagues/${leagueId}`);
      router.replace('/leagues');
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to delete league');
      setDeleting(false);
    }
  }

  async function handleRenew() {
    if (!confirm('Start a new season? Members will be carried over and the new league will be in draft state.')) return;
    setRenewing(true);
    try {
      const newLeague = await api.post<{ id: string }>(`/leagues/${leagueId}/renew`);
      router.push(`/leagues/${newLeague.id}`);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to renew league');
      setRenewing(false);
    }
  }

  async function saveTableZones() {
    setZonesSaving(true);
    try {
      const updated = await api.patch<League>(`/leagues/${leagueId}/table-zones`, {
        topZone: topZoneEnabled ? topZoneCount : null,
        bottomZone: bottomZoneEnabled ? bottomZoneCount : null,
      });
      setLeague(updated);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setZonesSaving(false);
    }
  }

  async function saveWaiverSettings() {
    setWaiverSettingsSaving(true);
    try {
      const updated = await api.patch<League>(`/leagues/${leagueId}/waiver-settings`, {
        processingDay: waiverDay,
        processingHour: waiverHour,
      });
      setLeague(updated);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to save waiver settings');
    } finally {
      setWaiverSettingsSaving(false);
    }
  }

  async function handleAddAnnouncement(e: React.FormEvent) {
    e.preventDefault();
    if (!newAnnouncement.trim()) return;
    setAnnouncementSaving(true);
    try {
      const ann = await api.post<Announcement>(`/leagues/${leagueId}/announcements`, { content: newAnnouncement.trim() });
      setAnnouncements(prev => [ann, ...prev]);
      setNewAnnouncement('');
      setShowAnnounceForm(false);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to post');
    } finally {
      setAnnouncementSaving(false);
    }
  }

  async function handleDeleteAnnouncement(id: string) {
    try {
      await api.delete(`/leagues/${leagueId}/announcements/${id}`);
      setAnnouncements(prev => prev.filter(a => a.id !== id));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to delete');
    }
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!newMessage.trim()) return;
    setMessageSending(true);
    try {
      const msg = await api.post<LeagueMessage>(`/leagues/${leagueId}/messages`, { content: newMessage.trim() });
      setMessages(prev => [...prev, msg]);
      setNewMessage('');
      setTimeout(() => msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to send');
    } finally {
      setMessageSending(false);
    }
  }

  async function handleDeleteMessage(id: string) {
    try {
      await api.delete(`/leagues/${leagueId}/messages/${id}`);
      setMessages(prev => prev.filter(m => m.id !== id));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to delete');
    }
  }

  return (
    <div className="space-y-4">
      {/* Delete modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-line rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl bg-danger/10 flex items-center justify-center flex-shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-danger">
                  <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-copy">Delete League</h3>
                <p className="text-xs text-copy-3">This cannot be undone</p>
              </div>
            </div>
            <p className="text-sm text-copy-2 mb-4">
              This will permanently delete <span className="font-semibold text-copy">{league.name}</span> along with all members, rosters, and auction data.
            </p>
            <label className="block text-xs font-medium text-copy-2 mb-1.5">
              Type <span className="font-mono font-bold text-danger">delete</span> to confirm
            </label>
            <input
              value={deleteInput}
              onChange={e => setDeleteInput(e.target.value)}
              placeholder="delete"
              className="w-full bg-field border border-line-2 rounded-xl px-4 py-2.5 text-copy text-sm placeholder-copy-3 focus:outline-none focus:border-danger focus:ring-1 focus:ring-danger transition-colors mb-4"
              onKeyDown={e => e.key === 'Enter' && deleteInput === 'delete' && handleDeleteLeague()}
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setShowDeleteModal(false); setDeleteInput(''); }}
                className="flex-1 bg-field hover:bg-field-2 border border-line text-copy-2 font-medium py-2.5 rounded-xl transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteLeague}
                disabled={deleteInput !== 'delete' || deleting}
                className="flex-1 bg-danger hover:bg-danger/80 disabled:opacity-40 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm"
              >
                {deleting ? 'Deleting…' : 'Delete League'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Message Board ──────────────────────────────────────────────────────── */}
      <div className="bg-card border border-line rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-line">
          <p className="text-sm font-semibold text-copy">Message Board</p>
          <p className="text-xs text-copy-3 mt-0.5">Share thoughts, predictions, and trash talk with your league.</p>
        </div>
        <div className="divide-y divide-line/30 max-h-72 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-copy-3 text-sm">No messages yet — say something!</p>
            </div>
          ) : messages.map(msg => {
            const isOwn = msg.authorUserId === userId;
            return (
              <div key={msg.id} className={`px-5 py-3 flex items-start gap-3 group ${isOwn ? 'bg-brand-dim/20' : ''}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap mb-0.5">
                    <span className="text-xs font-semibold text-copy">{msg.authorDisplayName}</span>
                    {isOwn && <span className="text-xs text-brand">you</span>}
                    <span className="text-xs text-copy-3">{timeAgo(msg.createdAt)}</span>
                  </div>
                  <p className="text-sm text-copy-2 break-words">{msg.content}</p>
                </div>
                {(isOwn || isCommissioner) && (
                  <button
                    onClick={() => handleDeleteMessage(msg.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-copy-3 hover:text-danger flex-shrink-0 p-1 mt-0.5"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            );
          })}
          <div ref={msgEndRef} />
        </div>
        <div className="px-5 py-3 border-t border-line">
          <form onSubmit={handleSendMessage} className="flex gap-2">
            <input
              value={newMessage}
              onChange={e => setNewMessage(e.target.value)}
              placeholder="Send a message..."
              maxLength={500}
              className="flex-1 bg-field border border-line-2 rounded-xl px-4 py-2 text-copy text-sm placeholder-copy-3 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors"
            />
            <button
              type="submit"
              disabled={!newMessage.trim() || messageSending}
              className="bg-brand hover:bg-brand-2 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors whitespace-nowrap"
            >
              {messageSending ? '...' : 'Send'}
            </button>
          </form>
        </div>
      </div>

      {/* ── Commissioner Board ─────────────────────────────────────────────────── */}
      <div className="bg-card border border-line rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-line flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-copy">Commissioner Board</p>
            <p className="text-xs text-copy-3 mt-0.5">Custom rules and announcements from the commissioner.</p>
          </div>
          {isCommissioner && (
            <button
              onClick={() => setShowAnnounceForm(v => !v)}
              className="flex-shrink-0 bg-field hover:bg-field-2 border border-line text-copy-2 text-xs font-medium px-3 py-1.5 rounded-xl transition-colors"
            >
              {showAnnounceForm ? 'Cancel' : '+ Post'}
            </button>
          )}
        </div>
        {isCommissioner && showAnnounceForm && (
          <form onSubmit={handleAddAnnouncement} className="px-5 py-4 border-b border-line bg-field/30 space-y-2">
            <textarea
              value={newAnnouncement}
              onChange={e => setNewAnnouncement(e.target.value)}
              placeholder="Write an announcement or custom rule..."
              rows={3}
              maxLength={1000}
              className="w-full bg-card border border-line-2 rounded-xl px-4 py-2.5 text-copy text-sm placeholder-copy-3 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors resize-none"
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={!newAnnouncement.trim() || announcementSaving}
                className="bg-brand hover:bg-brand-2 disabled:opacity-50 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors"
              >
                {announcementSaving ? 'Posting...' : 'Post Announcement'}
              </button>
            </div>
          </form>
        )}
        {announcements.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-copy-3 text-sm">No announcements yet.</p>
            {isCommissioner && <p className="text-xs text-copy-3 mt-1">Post custom rules or notes for your league.</p>}
          </div>
        ) : (
          <div className="divide-y divide-line/30">
            {announcements.map(ann => (
              <div key={ann.id} className="px-5 py-4 flex items-start gap-3 group">
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap mb-1">
                    <span className="text-xs font-semibold text-copy-2">{ann.authorDisplayName}</span>
                    <span className="text-xs text-copy-3">{timeAgo(ann.createdAt)}</span>
                  </div>
                  <p className="text-sm text-copy leading-relaxed break-words">{ann.content}</p>
                </div>
                {isCommissioner && (
                  <button
                    onClick={() => handleDeleteAnnouncement(ann.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-copy-3 hover:text-danger flex-shrink-0 p-1 mt-0.5"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Transaction History ────────────────────────────────────────────────── */}
      <div className="bg-card border border-line rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-line">
          <p className="text-sm font-semibold text-copy">Transaction History</p>
          <p className="text-xs text-copy-3 mt-0.5">Accepted trades and approved waiver pickups.</p>
        </div>
        {txLoading ? (
          <div className="flex justify-center py-8"><Spinner size="sm" /></div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-copy-3 text-sm">No transactions yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-line/30">
            {transactions.map(tx => {
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
                const dropTeamName = sportTeamById.get(tx.dropTeamId)?.name ?? tx.dropTeamId;
                return (
                  <div key={tx.id} className="px-5 py-3.5 flex items-start gap-3">
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
                        <span className="text-copy-3"> and dropped </span>
                        <span className="text-danger font-medium">{dropTeamName}</span>
                      </p>
                    </div>
                  </div>
                );
              }
            })}
          </div>
        )}
      </div>

      {/* ── League Info ────────────────────────────────────────────────────────── */}
      <div className="bg-card border border-line rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-copy mb-4">League Info</h2>
        <div className="grid grid-cols-2 gap-3 text-sm mb-4">
          {[
            { label: 'League ID', value: <code className="text-xs font-mono text-copy-2">{league.id}</code> },
            { label: 'Visibility', value: <span className="text-copy">{league.isPublic ? 'Public' : 'Private'}</span> },
            { label: 'Start', value: <span className="text-copy">{league.startDate}</span> },
            { label: 'End', value: <span className="text-copy">{league.endDate}</span> },
            { label: 'Members', value: <span className="text-copy">{memberCount}{league.memberCap ? ` / ${league.memberCap}` : ''}</span> },
          ].map(row => (
            <div key={row.label}>
              <p className="text-xs text-copy-3 mb-0.5">{row.label}</p>
              {row.value}
            </div>
          ))}
        </div>
        <div>
          <p className="text-xs text-copy-3 mb-2">Sports</p>
          <div className="flex gap-1.5 flex-wrap">
            {league.selectedSports.map(s => (
              <span key={s} className="text-xs bg-field border border-line text-copy-2 px-2.5 py-1 rounded-lg">{formatLeagueName(s)}</span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Previous Season ────────────────────────────────────────────────────── */}
      <div className="bg-card border border-line rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-copy mb-4">Previous Season</h2>
        <div className="text-center py-8 border border-dashed border-line rounded-xl">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-copy-3 mx-auto mb-3">
            <path d="M12 8v4l3 3" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M3.05 11a9 9 0 1 1 .5 4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M3 16v-5h5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p className="text-copy-2 text-sm font-medium">No previous seasons on record.</p>
          <p className="text-copy-3 text-xs mt-1">
            {previousLeagueId
              ? 'Previous season data will appear here once available.'
              : 'This is the first season of this league.'}
          </p>
        </div>
      </div>

      {/* ── Commissioner Tools ─────────────────────────────────────────────────── */}
      {isCommissioner && (
        <>
          {(league.state === 'draft' || league.state === 'completed') && (
            <div className="bg-card border border-line rounded-2xl p-5">
              <h2 className="text-sm font-semibold text-copy mb-4">Commissioner Controls</h2>
              {league.state === 'draft' && (
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-copy">Skip auction &amp; go live</p>
                    <p className="text-xs text-copy-3 mt-0.5">Transition directly to active without running an auction.</p>
                  </div>
                  <button
                    onClick={async () => {
                      if (!confirm('Set league to active? This skips the auction and cannot be undone.')) return;
                      try {
                        const updated = await api.patch<League>(`/leagues/${leagueId}/state`, { state: 'active' });
                        setLeague(updated);
                      } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Failed'); }
                    }}
                    className="flex-shrink-0 bg-brand hover:bg-brand-2 text-white text-xs font-semibold px-3 py-2 rounded-xl transition-colors whitespace-nowrap"
                  >
                    Set Active
                  </button>
                </div>
              )}
              {league.state === 'completed' && (
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-copy">Renew this league</p>
                    <p className="text-xs text-copy-3 mt-0.5">Start a new season. Members carry over; a new draft league is created.</p>
                  </div>
                  <button
                    onClick={handleRenew}
                    disabled={renewing}
                    className="flex-shrink-0 bg-brand hover:bg-brand-2 disabled:opacity-50 text-white text-xs font-semibold px-3 py-2 rounded-xl transition-colors whitespace-nowrap"
                  >
                    {renewing ? 'Creating...' : 'Renew League'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Table Zones */}
          <div className="bg-card border border-line rounded-2xl p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="text-sm font-semibold text-copy">Table Zones</h2>
                <p className="text-xs text-copy-3 mt-0.5">Highlight positions on the standings table.</p>
              </div>
              <button
                onClick={saveTableZones}
                disabled={zonesSaving}
                className="flex-shrink-0 bg-brand hover:bg-brand-2 disabled:opacity-50 text-white text-xs font-semibold px-3 py-2 rounded-xl transition-colors whitespace-nowrap"
              >
                {zonesSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-2.5 cursor-pointer select-none flex-1">
                  <input
                    type="checkbox"
                    checked={topZoneEnabled}
                    onChange={e => setTopZoneEnabled(e.target.checked)}
                    className="w-4 h-4 rounded accent-positive"
                  />
                  <div>
                    <p className="text-xs font-medium text-copy">Top Zone</p>
                    <p className="text-xs text-copy-3">Highlighted in green — qualification / prize spots</p>
                  </div>
                </label>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={topZoneCount}
                    disabled={!topZoneEnabled}
                    onChange={e => setTopZoneCount(Math.max(1, Number(e.target.value)))}
                    className="w-14 bg-field border border-line-2 rounded-lg px-2 py-1 text-xs text-copy text-center focus:outline-none focus:border-brand disabled:opacity-40 transition-colors"
                  />
                  <span className="text-xs text-copy-3">teams</span>
                </div>
              </div>
              <div className="h-px bg-line" />
              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-2.5 cursor-pointer select-none flex-1">
                  <input
                    type="checkbox"
                    checked={bottomZoneEnabled}
                    onChange={e => setBottomZoneEnabled(e.target.checked)}
                    className="w-4 h-4 rounded accent-danger"
                  />
                  <div>
                    <p className="text-xs font-medium text-copy">Relegation Zone</p>
                    <p className="text-xs text-copy-3">Highlighted in red — bottom of the table</p>
                  </div>
                </label>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={bottomZoneCount}
                    disabled={!bottomZoneEnabled}
                    onChange={e => setBottomZoneCount(Math.max(1, Number(e.target.value)))}
                    className="w-14 bg-field border border-line-2 rounded-lg px-2 py-1 text-xs text-copy text-center focus:outline-none focus:border-brand disabled:opacity-40 transition-colors"
                  />
                  <span className="text-xs text-copy-3">teams</span>
                </div>
              </div>
            </div>
          </div>

          {/* Waiver Processing */}
          <div className="bg-card border border-line rounded-2xl p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="text-sm font-semibold text-copy">Waiver Processing</h2>
                <p className="text-xs text-copy-3 mt-0.5">Configure when pending claims are automatically processed.</p>
              </div>
              <button
                onClick={saveWaiverSettings}
                disabled={waiverSettingsSaving}
                className="flex-shrink-0 bg-brand hover:bg-brand-2 disabled:opacity-50 text-white text-xs font-semibold px-3 py-2 rounded-xl transition-colors whitespace-nowrap"
              >
                {waiverSettingsSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-copy-2 mb-1.5">Processing Day</label>
                <select value={waiverDay} onChange={e => setWaiverDay(e.target.value)} className={inputCls}>
                  {['sunday','monday','tuesday','wednesday','thursday','friday','saturday'].map(d => (
                    <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-copy-2 mb-1.5">Processing Time (EST)</label>
                <select value={waiverHour} onChange={e => setWaiverHour(Number(e.target.value))} className={inputCls}>
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>
                      {i === 0 ? '12:00 AM' : i < 12 ? `${i}:00 AM` : i === 12 ? '12:00 PM' : `${i - 12}:00 PM`}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="bg-card border border-line rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-copy mb-1">Auction Settings</h2>
            <p className="text-xs text-copy-3 mb-5">Must be configured before starting the auction.</p>
            <form onSubmit={saveAuctionConfig} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-copy-2 mb-1.5">Starting Budget ($)</label>
                  <input type="number" min={1} required value={auctionForm.startingBudget}
                    onChange={e => setAuctionForm(f => ({ ...f, startingBudget: Number(e.target.value) }))}
                    className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-copy-2 mb-1.5">Min Opening Bid ($)</label>
                  <input type="number" min={1} required value={auctionForm.minOpeningBid}
                    onChange={e => setAuctionForm(f => ({ ...f, minOpeningBid: Number(e.target.value) }))}
                    className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-copy-2 mb-1.5">Min Bid Increment ($)</label>
                  <input type="number" min={1} required value={auctionForm.minBidIncrement}
                    onChange={e => setAuctionForm(f => ({ ...f, minBidIncrement: Number(e.target.value) }))}
                    className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-copy-2 mb-1.5">Countdown (sec)</label>
                  <input type="number" min={5} max={120} required value={auctionForm.countdownSeconds}
                    onChange={e => setAuctionForm(f => ({ ...f, countdownSeconds: Number(e.target.value) }))}
                    className={inputCls} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-copy-2 mb-1.5">Nomination Mode</label>
                <select value={auctionForm.nominationMode}
                  onChange={e => setAuctionForm(f => ({ ...f, nominationMode: e.target.value }))}
                  className={inputCls}>
                  <option value="manual">Manual — commissioner picks who nominates</option>
                  <option value="random-disclosed">Random (disclosed) — order shown to all</option>
                  <option value="random-hidden">Random (hidden) — revealed one at a time</option>
                  <option value="defined">Defined — set order in advance</option>
                </select>
              </div>
              <button type="submit" disabled={saving}
                className="bg-brand hover:bg-brand-2 disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm">
                {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save Auction Settings'}
              </button>
            </form>
          </div>

          <div className="bg-card border border-danger/20 rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-danger mb-1">Danger Zone</h2>
            <p className="text-xs text-copy-3 mb-4">Destructive actions that cannot be reversed.</p>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-copy">Delete this league</p>
                <p className="text-xs text-copy-3 mt-0.5">Permanently removes all members, rosters, and data.</p>
              </div>
              <button
                onClick={() => setShowDeleteModal(true)}
                className="flex-shrink-0 bg-danger/10 hover:bg-danger/20 border border-danger/30 text-danger text-sm font-semibold px-4 py-2 rounded-xl transition-colors whitespace-nowrap"
              >
                Delete League
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── League Rules ──────────────────────────────────────────────────────── */}
      <div className="bg-card border border-line rounded-2xl p-5 space-y-6">
        <h2 className="text-sm font-semibold text-copy">League Rules</h2>

        <section>
          <h3 className="text-xs font-semibold text-copy-3 uppercase tracking-widest mb-3">General Rules</h3>
          <ol className="space-y-2 list-decimal list-inside">
            {(() => {
              const ws = league.waiverSettings;
              const wDay = ws?.processingDay ?? 'tuesday';
              const wHour = ws?.processingHour ?? 10;
              const wDayLabel = wDay.charAt(0).toUpperCase() + wDay.slice(1) + 's';
              const wTimeLabel = wHour === 0 ? '12:00 AM' : wHour < 12 ? `${wHour}:00 AM` : wHour === 12 ? '12:00 PM' : `${wHour - 12}:00 PM`;
              return [
                'Every team must own at least 1 team per selected sport in the league.',
                '2 Wildcard slots per roster — can be any team from any sport except the Premier League.',
                'Maximum 2 teams per sport. Premier League is capped at 1 (wildcards are non-PL only).',
                `Waivers are processed every ${wDayLabel} at ${wTimeLabel} EST. Priority is determined by reverse standings — the lowest-ranked team gets first pick.`,
                'Trades are allowed as long as both teams maintain roster minimums and maximums after the swap. Transaction deadlines per sport are set by the admin panel.',
                'Points are earned based on Wins, Draws, and Playoff performance. Bonus points are awarded for Conference and Division Champions. NCAAF awards bonus for Power 4 teams (SEC, Big Ten, ACC, Big 12); NCAAB for Power 5 (Power 4 + Big East).',
                'Buy-in is $100. Payout details are listed under the Payout Rules tab.',
              ];
            })().map((rule, i) => (
              <li key={i} className="text-sm text-copy-2 leading-relaxed pl-1">{rule}</li>
            ))}
          </ol>
        </section>

        <div className="border-t border-line" />

        <section>
          <h3 className="text-xs font-semibold text-copy-3 uppercase tracking-widest mb-3">Auction Rules</h3>
          <ol className="space-y-2 list-decimal list-inside">
            {[
              'Each player has $1,000 to spend — this is a hard cap.',
              'Teams are presented in randomized order.',
              'Each team has a 15-second bidding window. The timer resets with every new bid.',
              'Teams not won at auction become free agent teams available on waivers.',
              'College Football (NCAAF) and College Basketball (NCAAB) only include the preseason top 25. Additional teams may be acquired through the waiver wire.',
            ].map((rule, i) => (
              <li key={i} className="text-sm text-copy-2 leading-relaxed pl-1">{rule}</li>
            ))}
          </ol>
        </section>

        <div className="border-t border-line" />

        <section>
          <h3 className="text-xs font-semibold text-copy-3 uppercase tracking-widest mb-3">Bonus Payouts · $75 per winner</h3>
          <div className="space-y-2">
            {[
              { label: 'Bonus 1', desc: 'Manager whose lowest-scoring roster team earns the fewest points.' },
              { label: 'Bonus 2', desc: 'Manager with the highest points-to-auction-cost ratio across their roster.' },
            ].map(b => (
              <div key={b.label} className="flex gap-3 bg-field border border-line rounded-xl px-4 py-3">
                <span className="text-xs font-semibold text-brand whitespace-nowrap mt-0.5">{b.label}</span>
                <p className="text-sm text-copy-2">{b.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {league.seasonRefs.length > 0 && (
          <>
            <div className="border-t border-line" />
            <section>
              <h3 className="text-xs font-semibold text-copy-3 uppercase tracking-widest mb-3">Scoring Breakdown</h3>
              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-field/60 border-b border-line">
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-copy-3">Sport</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-copy-3">Win</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-copy-3">Draw</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-copy-3">Bonus Scale</th>
                    </tr>
                  </thead>
                  <tbody>
                    {league.seasonRefs.map((ref, i) => (
                      <tr key={ref.sportLeagueId} className={i > 0 ? 'border-t border-line/50' : ''}>
                        <td className="px-4 py-2.5 font-medium text-copy">{formatLeagueName(ref.sportLeagueId)}</td>
                        <td className="px-4 py-2.5 text-right text-copy-2">{ref.winValue}</td>
                        <td className="px-4 py-2.5 text-right text-copy-2">{ref.drawValue ?? '—'}</td>
                        <td className="px-4 py-2.5 text-right text-copy-2">{ref.scalingValue}×</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-copy-3 mt-2">Bonus Scale applies to playoff and championship bonus points.</p>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
