'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { useAuth } from '@/context/AuthContext';
import { useTeamProfile } from '@/context/TeamProfileContext';
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
  rosterRules: { maxPerSport: Record<string, number | null> };
  auctionConfig: {
    startingBudget: number;
    minOpeningBid: number;
    minBidIncrement: number;
    nominationMode: string;
    countdownSeconds: number;
    maxWildcard?: number;
    scheduledStartAt?: string | null;
  } | null;
  previousLeagueId?: string;
  topZone?: number | null;
  bottomZone?: number | null;
  maxWildcard?: number;
  waiverSettings?: { processingDay: string; processingHour: number } | null;
  waiverType?: 'reserve-standings' | 'faab';
  faabStartingBudget?: number;
}

interface Member { id: string; userId: string; role: 'commissioner' | 'member'; joinedAt: string; displayName?: string; }

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
  faabRemaining?: number;
  coOwnerIds?: string[];
  coOwnerDisplayNames?: string[];
}

interface SportTeam { id: string; name: string; shortName: string; sportLeagueId: string; logoUrl: string | null; }
interface SportGroup { sport: string; teams: SportTeam[]; }

interface TeamBreakdown { teamId: string; teamName: string; sportLeagueId: string; sport: string; logoUrl: string | null; wins: number; draws: number; losses: number; points: number; eliminated?: boolean; seasonActive?: boolean; }
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
  dropTeamId: string | null;
  addTeamId: string;
  status: 'pending' | 'approved' | 'denied';
  claimantRank: number;
  faabBid?: number;
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
  | { type: 'waiver'; id: string; date: string; claimantUserId: string; claimantDisplayName: string; addTeamId: string; dropTeamId: string | null; };

type Tab = 'standings' | 'roster' | 'waivers' | 'transaction-counter' | 'auction-summary' | 'home' | 'history' | 'rules' | 'activity' | 'commissioner';
const VALID_TABS: Tab[] = ['standings', 'roster', 'waivers', 'transaction-counter', 'auction-summary', 'home', 'history', 'rules', 'activity', 'commissioner'];

const STATE_META: Record<string, { label: string; cls: string }> = {
  draft:     { label: 'Draft',     cls: 'bg-warn-bg text-warn border-warn/20' },
  auction:   { label: 'Draft',     cls: 'bg-info-bg text-info border-info/20' },
  active:    { label: 'Active',    cls: 'bg-brand-dim text-brand border-brand/20' },
  completed: { label: 'Completed', cls: 'bg-field text-copy-3 border-line' },
  cancelled: { label: 'Cancelled', cls: 'bg-danger-bg text-danger border-danger/20' },
};

const SPORT_ORDER = ['nfl', 'nba', 'mlb', 'nhl', 'ncaa-football', 'ncaa-basketball', 'premier-league', 'ucl', 'world-cup'];

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

  // Read initial tab from URL search param (set by NavBar dropdown links)
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab') as Tab | null;
    if (t && VALID_TABS.includes(t)) setTab(t);
  }, []);

  async function startAuction() {
    try {
      await api.post(`/leagues/${id}/auction/start`);
      setLeague(l => l ? { ...l, state: 'auction' } : l);
      router.push(`/leagues/${id}/auction`);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to start auction');
    }
  }

  // Poll for auction start so everyone on the league page gets auto-redirected
  // when the commissioner fires the draft — no manual refresh needed.
  useEffect(() => {
    if (league?.state !== 'draft') return;
    const poll = setInterval(async () => {
      try {
        const fresh = await api.get<League>(`/leagues/${id}`);
        if (fresh.state === 'auction') {
          setLeague(fresh);
          router.push(`/leagues/${id}/auction`);
        }
      } catch {}
    }, 3000);
    return () => clearInterval(poll);
  }, [league?.state, id, router]);

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

  const leagueSubTabs: { key: Tab; label: string }[] = [
    { key: 'home',        label: 'League Home' },
    { key: 'history',     label: 'History' },
    { key: 'rules',       label: 'Rules' },
    { key: 'activity',    label: 'Recent Activity' },
    ...(isCommissioner ? [{ key: 'commissioner' as Tab, label: 'Commissioner Settings' }] : []),
  ];
  const isLeagueTab = leagueSubTabs.some(t => t.key === tab);
  const activeLeagueLabel = leagueSubTabs.find(t => t.key === tab)?.label ?? 'League';

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
          <div className="flex flex-col items-end gap-2">
            {league.state === 'draft' && league.auctionConfig?.scheduledStartAt && (
              <div className="text-right">
                <p className="text-xs text-copy-3">Draft scheduled for</p>
                <p className="text-sm font-semibold text-copy">
                  {new Date(league.auctionConfig.scheduledStartAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
                {new Date(league.auctionConfig.scheduledStartAt).getTime() - Date.now() <= 60 * 60 * 1000 && (
                  <Link href={`/leagues/${id}/auction`} className="text-xs text-brand underline">Room is open — join now</Link>
                )}
              </div>
            )}
            <div className="flex gap-2 flex-wrap">
              {league.state === 'auction' && (
                <Link
                  href={`/leagues/${id}/auction`}
                  className="bg-info text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors hover:opacity-90"
                >
                  Enter Draft Room
                </Link>
              )}
              {isCommissioner && league.state === 'draft' && (
                <button
                  onClick={startAuction}
                  disabled={!league.auctionConfig}
                  title={!league.auctionConfig ? 'Set auction config in Settings first' : undefined}
                  className="bg-brand hover:bg-brand-2 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
                >
                  Start Draft
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-0.5 mb-6 border-b border-line">
        {(['standings', 'roster'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors -mb-px border-b-2 capitalize ${
              tab === t
                ? 'border-brand text-brand'
                : 'border-transparent text-copy-3 hover:text-copy-2 hover:border-line-2'
            }`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}

        {/* Teams dropdown */}
        {(() => {
          const teamsSubTabs: { key: Tab; label: string }[] = [
            { key: 'waivers', label: 'Waivers' },
            { key: 'transaction-counter', label: 'Transaction Counter' },
            { key: 'auction-summary', label: 'Auction Summary' },
          ];
          const isTeamsTab = teamsSubTabs.some(t => t.key === tab);
          const activeTeamsLabel = teamsSubTabs.find(t => t.key === tab)?.label ?? 'Teams';
          return (
            <div className="relative group -mb-px">
              <button
                className={`px-4 py-2.5 text-sm font-medium transition-colors flex items-center gap-1 border-b-2 ${
                  isTeamsTab
                    ? 'border-brand text-brand'
                    : 'border-transparent text-copy-3 hover:text-copy-2 hover:border-line-2'
                }`}
              >
                {activeTeamsLabel}
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              <div className="absolute hidden group-hover:block left-0 top-full pt-1 z-50 min-w-[200px]">
                <div className="bg-card border border-line rounded-xl shadow-xl py-1 overflow-hidden">
                  {teamsSubTabs.map(t => (
                    <button
                      key={t.key}
                      onClick={() => setTab(t.key)}
                      className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                        tab === t.key
                          ? 'bg-brand-dim text-brand font-medium'
                          : 'text-copy-2 hover:bg-field hover:text-copy'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}

        {/* League dropdown tab */}
        <div className="relative group -mb-px">
          <button
            className={`px-4 py-2.5 text-sm font-medium transition-colors flex items-center gap-1 border-b-2 ${
              isLeagueTab
                ? 'border-brand text-brand'
                : 'border-transparent text-copy-3 hover:text-copy-2 hover:border-line-2'
            }`}
          >
            {activeLeagueLabel}
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          <div className="absolute hidden group-hover:block left-0 top-full pt-1 z-50 min-w-[200px]">
            <div className="bg-card border border-line rounded-xl shadow-xl py-1 overflow-hidden">
              {leagueSubTabs.map(t => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                    tab === t.key
                      ? 'bg-brand-dim text-brand font-medium'
                      : 'text-copy-2 hover:bg-field hover:text-copy'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {tab === 'standings' && <StandingsTab leagueId={id} userId={user?.uid} fantasyTeams={fantasyTeams} topZone={league.topZone} bottomZone={league.bottomZone} ownerNameByUserId={Object.fromEntries(members.filter(m => m.displayName).map(m => [m.userId, m.displayName!]))} />}
      {tab === 'roster' && (
        <RosterTab
          leagueId={id}
          leagueState={league.state}
          fantasyTeams={fantasyTeams}
          setFantasyTeams={setFantasyTeams}
          isCommissioner={isCommissioner}
          userId={user?.uid}
          ownerNameByUserId={Object.fromEntries(members.filter(m => m.displayName).map(m => [m.userId, m.displayName!]))}
        />
      )}
      {tab === 'waivers' && (
        <WaiversTab
          leagueId={id}
          isCommissioner={isCommissioner}
          userId={user?.uid}
          fantasyTeams={fantasyTeams}
          selectedSports={league.selectedSports}
          waiverType={league.waiverType ?? 'reserve-standings'}
          faabStartingBudget={league.faabStartingBudget ?? 100}
          rosterSize={league.selectedSports.length + (league.maxWildcard ?? 0)}
        />
      )}
      {tab === 'transaction-counter' && (
        <TransactionCounterTab
          leagueId={id}
          fantasyTeams={fantasyTeams}
          waiverType={league.waiverType ?? 'reserve-standings'}
          faabStartingBudget={league.faabStartingBudget ?? 100}
          userId={user?.uid}
        />
      )}
      {tab === 'auction-summary' && (
        <AuctionSummaryTab
          leagueId={id}
          fantasyTeams={fantasyTeams}
        />
      )}
      {tab === 'home' && (
        <LeagueHomeTab league={league} isCommissioner={isCommissioner} leagueId={id} memberCount={members.length} userId={user?.uid} fantasyTeams={fantasyTeams} />
      )}
      {tab === 'history' && (
        <HistoryTab leagueId={id} previousLeagueId={league.previousLeagueId} />
      )}
      {tab === 'rules' && <RulesTab league={league} />}
      {tab === 'activity' && (
        <RecentActivityTab leagueId={id} fantasyTeams={fantasyTeams} />
      )}
      {tab === 'commissioner' && isCommissioner && (
        <div className="space-y-4">
          <CommissionerTab league={league} setLeague={setLeague} leagueId={id} />
        </div>
      )}
    </div>
  );
}

// ─── Standings Tab ────────────────────────────────────────────────────────────

function StandingsTab({ leagueId, userId, fantasyTeams, topZone, bottomZone, ownerNameByUserId }: { leagueId: string; userId?: string; fantasyTeams: FantasyTeam[]; topZone?: number | null; bottomZone?: number | null; ownerNameByUserId: Record<string, string>; }) {
  const [standings, setStandings] = useState<Standing[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const { openProfile } = useTeamProfile();

  const logoByUserId = new Map(fantasyTeams.map(ft => [ft.userId, ft.logoUrl ?? null]));
  const coOwnerNamesByUserId = new Map(fantasyTeams.map(ft => [ft.userId, ft.coOwnerDisplayNames ?? []]));

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
                      {logoByUserId.get(s.userId) ? (
                        <img src={logoByUserId.get(s.userId)!} alt={s.displayName} className="w-7 h-7 object-cover rounded-full flex-shrink-0" />
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
                  return (
                  <tr key={`${s.userId}-bd`} className="border-b border-line/50 bg-field/20">
                    <td colSpan={5} className="px-6 py-4 space-y-3">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
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
  leagueId, leagueState, fantasyTeams, setFantasyTeams, isCommissioner, userId, ownerNameByUserId,
}: {
  leagueId: string;
  leagueState: string;
  fantasyTeams: FantasyTeam[];
  setFantasyTeams: React.Dispatch<React.SetStateAction<FantasyTeam[]>>;
  isCommissioner: boolean;
  userId?: string;
  ownerNameByUserId: Record<string, string>;
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
  const { openProfile } = useTeamProfile();

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
      const endpoint = viewingIsPrimaryOwner
        ? `/leagues/${leagueId}/teams/my/co-owners`
        : `/leagues/${leagueId}/teams/${viewingId}/co-owners`;
      const updated = await api.post<{ uid: string; email: string }[]>(
        endpoint,
        { email: coOwnerEmail.trim() },
      );
      setCoOwnerEmail('');
      setCoOwnerMsg({ type: 'success', text: `Invite sent to ${coOwnerEmail.trim()}.` });
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
          {!loadingTeams && viewingOwnedTeams.length === 0 && (
            <div className="px-5 py-8 text-center">
              <p className="text-copy-3 text-sm">No teams yet</p>
            </div>
          )}
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
          {(viewingIsPrimaryOwner || (isCommissioner && viewingTeam && !viewingIsMe)) && (
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
  claim, isCommissioner, teamMap, reviewing, denyingId, denyReason,
  onApprove, onStartDeny, onDenyReasonChange, onConfirmDeny, onCancelDeny,
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
}) {
  const { openProfile } = useTeamProfile();
  const dropTeam = claim.dropTeamId ? teamMap.get(claim.dropTeamId) ?? null : null;
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
  leagueId, isCommissioner, userId, fantasyTeams, selectedSports, waiverType, faabStartingBudget, rosterSize,
}: {
  leagueId: string;
  isCommissioner: boolean;
  userId?: string;
  fantasyTeams: FantasyTeam[];
  selectedSports: string[];
  waiverType: 'reserve-standings' | 'faab';
  faabStartingBudget: number;
  rosterSize: number;
}) {
  const [claims, setClaims] = useState<WaiverClaim[]>([]);
  const [pool, setPool] = useState<TeamWithRecord[]>([]);
  const [allLeagueTeams, setAllLeagueTeams] = useState<TeamWithRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Team browser filters
  const [browseSport, setBrowseSport] = useState('all');
  const [browseSearch, setBrowseSearch] = useState('');
  const [browseSort, setBrowseSort] = useState<'points' | 'alpha'>('points');
  const [browseAvailability, setBrowseAvailability] = useState<'available' | 'all'>('available');

  // Waiver claim form
  const [showForm, setShowForm] = useState(false);
  const [dropTeamId, setDropTeamId] = useState('');
  const [addTeamId, setAddTeamId] = useState('');
  const [formSearch, setFormSearch] = useState('');
  const [faabBid, setFaabBid] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');

  // Commissioner state
  const [denyingId, setDenyingId] = useState<string | null>(null);
  const [denyReason, setDenyReason] = useState('');
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get<WaiverClaim[]>(`/leagues/${leagueId}/waivers`),
      api.get<TeamWithRecord[]>(`/leagues/${leagueId}/waiver-pool`),
      api.get<SportGroup[]>(`/leagues/${leagueId}/sport-teams`).catch(() => [] as SportGroup[]),
    ]).then(([c, p, groups]) => {
      setClaims(c);
      setPool(p);
      setAllLeagueTeams(
        groups.flatMap(g => g.teams.map(t => ({
          id: t.id, name: t.name, shortName: t.shortName,
          sportLeagueId: t.sportLeagueId, logoUrl: t.logoUrl,
          sport: g.sport, wins: 0, draws: 0, losses: 0, points: 0,
        }))),
      );
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
    return browseSort === 'points'
      ? [...list].sort((a, b) => b.points - a.points)
      : [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [allDisplayTeams, browseAvailability, browseSport, browseSearch, browseSort]);

  const myRosterTeams = useMemo(() =>
    (myTeam?.ownedTeamIds ?? []).map(id => comprehensiveTeamMap.get(id)).filter(Boolean) as TeamWithRecord[],
    [myTeam, comprehensiveTeamMap],
  );

  const isUnderRosterSize = myRosterTeams.length < rosterSize;

  const formFilteredPool = useMemo(() => {
    if (!formSearch.trim()) return pool;
    const q = formSearch.trim().toLowerCase();
    return pool.filter(t => t.name.toLowerCase().includes(q) || t.shortName.toLowerCase().includes(q));
  }, [pool, formSearch]);

  const pending = claims.filter(c => c.status === 'pending');
  const history = isCommissioner
    ? claims.filter(c => c.status !== 'pending')
    : claims.filter(c => c.status === 'approved');
  const canSubmit = !!myTeam;

  function openAddForm(teamId?: string) {
    if (teamId) setAddTeamId(teamId);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false); setDropTeamId(''); setAddTeamId('');
    setFaabBid(0); setSubmitError(''); setFormSearch('');
  }

  async function submitClaim() {
    if (!addTeamId) return;
    if (!isUnderRosterSize && !dropTeamId) return;
    setSubmitting(true); setSubmitError('');
    try {
      const body: Record<string, unknown> = { addTeamId };
      if (dropTeamId) body.dropTeamId = dropTeamId;
      if (waiverType === 'faab') body.faabBid = faabBid;
      const claim = await api.post<WaiverClaim>(`/leagues/${leagueId}/waivers`, body);
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

  const { openProfile } = useTeamProfile();

  const claimCardProps = {
    isCommissioner, teamMap: comprehensiveTeamMap, reviewing, denyingId, denyReason,
    onApprove: approve,
    onStartDeny: (id: string) => { setDenyingId(id); setDenyReason(''); },
    onDenyReasonChange: setDenyReason,
    onConfirmDeny: deny,
    onCancelDeny: () => setDenyingId(null),
  };

  const addedTeam = addTeamId ? comprehensiveTeamMap.get(addTeamId) : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-copy">Waivers</h2>
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

          {/* Step 2: Add */}
          <div>
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <p className="text-xs font-semibold text-copy-3 uppercase tracking-wider">
                2. Add from available pool
              </p>
            </div>

            {/* Step 2 content: selected team chip or search picker */}
            {addedTeam ? (
              <div className="flex items-center gap-3 bg-brand-dim border border-brand/30 rounded-xl px-3 py-2.5">
                <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center">
                  {addedTeam.logoUrl
                    ? <img src={addedTeam.logoUrl} alt={addedTeam.name} className="w-8 h-8 object-contain" />
                    : <div className="w-8 h-8 rounded bg-field-2 flex items-center justify-center text-copy-3 text-[10px] font-bold">{addedTeam.shortName?.slice(0, 2).toUpperCase() ?? '?'}</div>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-brand truncate">{addedTeam.name}</p>
                  <p className="text-xs text-copy-3">{formatLeagueName(addedTeam.sportLeagueId)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => { setAddTeamId(''); setFormSearch(''); }}
                  className="text-copy-3 hover:text-copy transition-colors p-1 flex-shrink-0"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-copy-3 pointer-events-none">
                    <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" strokeLinecap="round" />
                  </svg>
                  <input
                    type="text"
                    value={formSearch}
                    onChange={e => setFormSearch(e.target.value)}
                    placeholder="Search available teams…"
                    className="w-full bg-field border border-line-2 rounded-lg pl-7 pr-3 py-1.5 text-xs text-copy placeholder-copy-3 focus:outline-none focus:border-brand transition-colors"
                  />
                </div>
                {formFilteredPool.length === 0 ? (
                  <p className="text-copy-3 text-xs py-2 text-center">No available teams found.</p>
                ) : (
                  <div className="border border-line rounded-xl overflow-hidden max-h-64 overflow-y-auto divide-y divide-line/50">
                    {formFilteredPool.map(t => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setAddTeamId(t.id)}
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
              </div>
            )}
          </div>

          {/* FAAB bid */}
          {waiverType === 'faab' && (
            <div>
              <p className="text-xs font-semibold text-copy-3 uppercase tracking-wider mb-2">
                3. Your FAAB bid
              </p>
              <div className="flex items-center gap-2">
                <span className="text-copy-2 text-sm">$</span>
                <input
                  type="number"
                  min={0}
                  max={myTeam?.faabRemaining ?? 0}
                  value={faabBid}
                  onFocus={e => e.target.select()}
                  onChange={e => { const v = e.target.valueAsNumber; setFaabBid(isNaN(v) ? 0 : Math.max(0, v)); }}
                  className="w-full bg-field border border-line-2 rounded-xl px-4 py-2.5 text-sm text-copy focus:outline-none focus:border-brand transition-colors"
                  placeholder="0"
                />
              </div>
              {myTeam && (
                <p className="text-xs text-copy-3 mt-1.5">
                  Budget remaining: <span className="font-medium text-copy">${myTeam.faabRemaining ?? 0}</span>
                </p>
              )}
            </div>
          )}

          {/* Summary pill */}
          {(dropTeamId || addTeamId) && (
            <div className="bg-field rounded-xl px-4 py-2.5 text-xs flex items-center gap-2">
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
              <span className={addTeamId ? 'text-brand font-medium' : 'text-copy-3'}>
                {addTeamId ? (comprehensiveTeamMap.get(addTeamId)?.name ?? addTeamId) : 'Pick a team to add'}
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
              disabled={submitting || !addTeamId || (!isUnderRosterSize && !dropTeamId)}
              className="flex-1 bg-brand hover:bg-brand-2 disabled:opacity-40 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
            >
              {submitting ? 'Submitting...' : 'Submit Claim'}
            </button>
          </div>
        </div>
      )}

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
              onChange={e => setBrowseSort(e.target.value as 'points' | 'alpha')}
              className="bg-field border border-line-2 text-xs text-copy rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-brand transition-colors"
            >
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
          ) : filteredTeams.map(t => (
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
                <p className="text-sm font-semibold text-copy truncate">{t.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[11px] text-copy-3 bg-field border border-line px-1.5 py-0.5 rounded-full leading-none">
                    {formatLeagueName(t.sportLeagueId)}
                  </span>
                  {(t.wins > 0 || t.losses > 0) && (
                    <span className="text-[11px] text-copy-3">
                      {formatRecord(t.wins, t.draws, t.losses, t.sport)}
                    </span>
                  )}
                </div>
              </div>

              {/* Points + action — fixed widths so columns never shift */}
              <div className="flex items-center gap-3 flex-shrink-0">
                <div className="w-12 text-right">
                  {t.points > 0 && (
                    <>
                      <p className="text-sm font-bold text-copy tabular-nums">{t.points.toFixed(1)}</p>
                      <p className="text-[10px] text-copy-3 leading-none">pts</p>
                    </>
                  )}
                </div>
                <div className="w-10 flex items-center justify-center flex-shrink-0">
                  {t.isAvailable ? (
                    canSubmit ? (
                      <button
                        onClick={e => { e.stopPropagation(); openAddForm(t.id); }}
                        className="text-xs bg-brand hover:bg-brand-2 text-white px-3 py-1.5 rounded-lg font-medium transition-colors"
                      >
                        Add
                      </button>
                    ) : (
                      <span className="text-[11px] text-positive font-medium px-2 py-0.5 bg-positive-bg border border-positive/20 rounded-full">
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
          ))}
        </div>
      </div>

      {/* My pending claims — visible to the claimant */}
      {!isCommissioner && userId && pending.filter(c => c.claimantUserId === userId).length > 0 && (
        <div>
          <p className="text-xs font-semibold text-copy-3 uppercase tracking-widest mb-2">
            Your Pending Claims · {pending.filter(c => c.claimantUserId === userId).length}
          </p>
          <div className="space-y-2">
            {pending.filter(c => c.claimantUserId === userId).map(c => (
              <ClaimCard key={c.id} claim={c} {...claimCardProps} />
            ))}
          </div>
        </div>
      )}

      {/* Pending claims — commissioner only */}
      {isCommissioner && pending.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-copy-3 uppercase tracking-widest mb-2">
            Pending · {pending.length}
          </p>
          <div className="space-y-2">
            {pending.map(c => <ClaimCard key={c.id} claim={c} {...claimCardProps} />)}
          </div>
        </div>
      )}

      {/* Claim history */}
      {history.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-copy-3 uppercase tracking-widest mb-2">History</p>
          <div className="space-y-2">
            {history.map(c => <ClaimCard key={c.id} claim={c} {...claimCardProps} />)}
          </div>
        </div>
      )}

      {/* Empty state for claims */}
      {claims.length === 0 && !showForm && (
        <div className="text-center py-8 border border-dashed border-line rounded-2xl">
          <p className="text-copy-3 text-sm">No waiver claims yet.</p>
        </div>
      )}
    </div>
  );
}

// ─── Transaction Counter Tab ──────────────────────────────────────────────────

function TransactionCounterTab({
  leagueId, fantasyTeams, waiverType, faabStartingBudget, userId,
}: {
  leagueId: string;
  fantasyTeams: FantasyTeam[];
  waiverType: 'reserve-standings' | 'faab';
  faabStartingBudget: number;
  userId?: string;
}) {
  const [claims, setClaims] = useState<WaiverClaim[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<WaiverClaim[]>(`/leagues/${leagueId}/waivers`)
      .then(setClaims).catch(() => {}).finally(() => setLoading(false));
  }, [leagueId]);

  const approvedClaims = claims.filter((c: WaiverClaim) => c.status === 'approved');

  const moveCounts = new Map<string, number>();
  for (const c of approvedClaims) {
    moveCounts.set(c.claimantUserId, (moveCounts.get(c.claimantUserId) ?? 0) + 1);
  }

  const rows = [...fantasyTeams]
    .filter(ft => !ft.isPlaceholder)
    .map(ft => ({
      ft,
      moves: moveCounts.get(ft.userId) ?? 0,
      isMe: ft.userId === userId || (ft.coOwnerIds ?? []).includes(userId ?? ''),
    }))
    .sort((a, b) => b.moves - a.moves);

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;

  const isFaab = waiverType === 'faab';

  return (
    <div className="bg-card border border-line rounded-2xl overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-line bg-field/50">
            <th className="text-left px-4 py-3 text-xs font-semibold text-copy-3 uppercase tracking-wider">Manager</th>
            {isFaab && (
              <th className="text-right px-4 py-3 text-xs font-semibold text-copy-3 uppercase tracking-wider">FAAB Left</th>
            )}
            <th className="text-right px-4 py-3 text-xs font-semibold text-copy-3 uppercase tracking-wider">Moves</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ ft, moves, isMe }) => (
            <tr key={ft.id} className={`border-b border-line/40 ${isMe ? 'bg-brand-dim/30' : ''}`}>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2.5">
                  {ft.logoUrl ? (
                    <img src={ft.logoUrl} alt={ft.displayName} className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-field border border-line flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-semibold text-copy-3">{ft.displayName.charAt(0).toUpperCase()}</span>
                    </div>
                  )}
                  <span className={`text-sm font-medium ${isMe ? 'text-brand' : 'text-copy'}`}>
                    {ft.displayName}{isMe && <span className="text-copy-3 font-normal text-xs ml-1">(you)</span>}
                  </span>
                </div>
              </td>
              {isFaab && (
                <td className="px-4 py-3 text-right">
                  <span className={`text-sm font-semibold tabular-nums ${isMe ? 'text-brand' : 'text-copy'}`}>
                    ${ft.faabRemaining ?? 0}
                  </span>
                </td>
              )}
              <td className="px-4 py-3 text-right">
                <span className={`text-sm font-semibold tabular-nums ${moves > 0 ? 'text-copy' : 'text-copy-3'}`}>
                  {moves}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <p className="text-copy-3 text-sm px-4 py-6 text-center">No teams yet.</p>
      )}
    </div>
  );
}

// ─── Auction Summary Tab ───────────────────────────────────────────────────────

interface AuctionResultDoc {
  id: string;
  leagueId: string;
  completedAt: string;
  lots: { teamId: string; winnerId: string | null; winningBid: number; passed: boolean }[];
}

function AuctionSummaryTab({
  leagueId, fantasyTeams,
}: {
  leagueId: string;
  fantasyTeams: FantasyTeam[];
}) {
  const [result, setResult] = useState<AuctionResultDoc | null>(null);
  const [sportTeams, setSportTeams] = useState<Map<string, SportTeam>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<AuctionResultDoc | null>(`/leagues/${leagueId}/auction/results`).catch(() => null),
      api.get<SportGroup[]>(`/leagues/${leagueId}/sport-teams`).catch(() => [] as SportGroup[]),
    ]).then(([res, groups]) => {
      setResult(res);
      const map = new Map<string, SportTeam>();
      for (const g of groups) for (const t of g.teams) map.set(t.id, t);
      setSportTeams(map);
    }).finally(() => setLoading(false));
  }, [leagueId]);

  const ownerByUserId = new Map(fantasyTeams.map(ft => [ft.userId, ft.displayName]));

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;

  if (!result) {
    return (
      <div className="text-center py-16 border border-dashed border-line rounded-2xl">
        <p className="text-copy-3 text-sm">No auction results yet — the summary appears once the draft is complete.</p>
      </div>
    );
  }

  const sold = result.lots.filter(l => !l.passed && l.winnerId);
  const passed = result.lots.filter(l => l.passed);
  const totalSpent = sold.reduce((s, l) => s + l.winningBid, 0);

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

      {/* Results by owner */}
      <div className="bg-card border border-line rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-line flex items-center justify-between">
          <p className="text-sm font-semibold text-copy">Auction Results</p>
          <p className="text-xs text-copy-3">
            {new Date(result.completedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
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
            {[...sold]
              .sort((a, b) => b.winningBid - a.winningBid)
              .map(lot => {
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
        {passed.length > 0 && (
          <div className="px-4 py-3 border-t border-line/50 bg-field/20">
            <p className="text-xs text-copy-3">
              {passed.length} team{passed.length !== 1 ? 's' : ''} passed (no bids): {passed.map(l => sportTeams.get(l.teamId)?.name ?? l.teamId).join(', ')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

function LeagueHomeTab({
  league, isCommissioner, leagueId, memberCount, userId, fantasyTeams,
}: {
  league: League;
  isCommissioner: boolean;
  leagueId: string;
  memberCount: number;
  userId?: string;
  fantasyTeams: FantasyTeam[];
}) {
  const msgEndRef = useRef<HTMLDivElement>(null);

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [newAnnouncement, setNewAnnouncement] = useState('');
  const [announcementSaving, setAnnouncementSaving] = useState(false);
  const [showAnnounceForm, setShowAnnounceForm] = useState(false);
  const [showAnnImageInput, setShowAnnImageInput] = useState(false);
  const [annImageUrl, setAnnImageUrl] = useState('');

  const [messages, setMessages] = useState<LeagueMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [messageSending, setMessageSending] = useState(false);
  const [showMsgImageInput, setShowMsgImageInput] = useState(false);
  const [msgImageUrl, setMsgImageUrl] = useState('');

  function renderContent(content: string) {
    const imagePattern = /https?:\/\/\S+\.(?:gif|jpg|jpeg|png|webp)(?:[?#]\S*)?|https?:\/\/(?:media\.tenor\.com|media(?:\d+)?\.giphy\.com|i\.imgur\.com)\S*/gi;
    const parts: { type: 'text' | 'image'; value: string }[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = imagePattern.exec(content)) !== null) {
      if (m.index > last) parts.push({ type: 'text', value: content.slice(last, m.index) });
      parts.push({ type: 'image', value: m[0] });
      last = m.index + m[0].length;
    }
    if (last < content.length) parts.push({ type: 'text', value: content.slice(last) });
    return parts;
  }

  function buildMessageContent(text: string, imageUrl: string) {
    const t = text.trim();
    const u = imageUrl.trim();
    if (t && u) return `${t}\n${u}`;
    return t || u;
  }

  useEffect(() => {
    Promise.all([
      api.get<Announcement[]>(`/leagues/${leagueId}/announcements`).catch(() => [] as Announcement[]),
      api.get<LeagueMessage[]>(`/leagues/${leagueId}/messages`).catch(() => [] as LeagueMessage[]),
    ]).then(([anns, msgs]) => {
      setAnnouncements(anns);
      setMessages(msgs);
    });
  }, [leagueId]);

  async function handleAddAnnouncement(e: React.FormEvent) {
    e.preventDefault();
    const content = buildMessageContent(newAnnouncement, annImageUrl);
    if (!content) return;
    setAnnouncementSaving(true);
    try {
      const ann = await api.post<Announcement>(`/leagues/${leagueId}/announcements`, { content });
      setAnnouncements(prev => [ann, ...prev]);
      setNewAnnouncement('');
      setAnnImageUrl('');
      setShowAnnImageInput(false);
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
    const content = buildMessageContent(newMessage, msgImageUrl);
    if (!content) return;
    setMessageSending(true);
    try {
      const msg = await api.post<LeagueMessage>(`/leagues/${leagueId}/messages`, { content });
      setMessages(prev => [...prev, msg]);
      setNewMessage('');
      setMsgImageUrl('');
      setShowMsgImageInput(false);
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
                  <div className="text-sm text-copy-2 break-words space-y-1">
                    {renderContent(msg.content).map((part, i) =>
                      part.type === 'image'
                        ? <img key={i} src={part.value} alt="" className="max-w-xs max-h-48 rounded-lg object-contain" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        : part.value ? <span key={i} className="whitespace-pre-wrap">{part.value}</span> : null
                    )}
                  </div>
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
          {showMsgImageInput && (
            <div className="flex gap-2 mb-2">
              <input
                type="url"
                value={msgImageUrl}
                onChange={e => setMsgImageUrl(e.target.value)}
                placeholder="Paste image or GIF URL..."
                className="flex-1 bg-field border border-line-2 rounded-xl px-3 py-1.5 text-copy text-xs placeholder-copy-3 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors"
              />
              <button type="button" onClick={() => { setShowMsgImageInput(false); setMsgImageUrl(''); }} className="text-copy-3 hover:text-danger text-xs px-2">✕</button>
            </div>
          )}
          <form onSubmit={handleSendMessage} className="flex gap-2">
            <input
              value={newMessage}
              onChange={e => setNewMessage(e.target.value)}
              placeholder="Send a message..."
              maxLength={500}
              className="flex-1 bg-field border border-line-2 rounded-xl px-4 py-2 text-copy text-sm placeholder-copy-3 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowMsgImageInput(v => !v)}
              title="Attach image or GIF"
              className={`flex-shrink-0 border text-sm px-3 py-2 rounded-xl transition-colors ${showMsgImageInput ? 'bg-brand-dim border-brand text-brand' : 'bg-field border-line-2 text-copy-3 hover:text-copy hover:border-line'}`}
            >
              🖼
            </button>
            <button
              type="submit"
              disabled={(!newMessage.trim() && !msgImageUrl.trim()) || messageSending}
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
            {showAnnImageInput && (
              <div className="flex gap-2">
                <input
                  type="url"
                  value={annImageUrl}
                  onChange={e => setAnnImageUrl(e.target.value)}
                  placeholder="Paste image or GIF URL..."
                  className="flex-1 bg-card border border-line-2 rounded-xl px-3 py-1.5 text-copy text-xs placeholder-copy-3 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors"
                />
                <button type="button" onClick={() => { setShowAnnImageInput(false); setAnnImageUrl(''); }} className="text-copy-3 hover:text-danger text-xs px-2">✕</button>
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setShowAnnImageInput(v => !v)}
                title="Attach image or GIF"
                className={`border text-xs px-3 py-1.5 rounded-xl transition-colors ${showAnnImageInput ? 'bg-brand-dim border-brand text-brand' : 'bg-field border-line text-copy-3 hover:text-copy hover:border-line-2'}`}
              >
                🖼 Image
              </button>
              <button
                type="submit"
                disabled={(!newAnnouncement.trim() && !annImageUrl.trim()) || announcementSaving}
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
                  <div className="text-sm text-copy leading-relaxed break-words space-y-1">
                    {renderContent(ann.content).map((part, i) =>
                      part.type === 'image'
                        ? <img key={i} src={part.value} alt="" className="max-w-xs max-h-48 rounded-lg object-contain" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        : part.value ? <span key={i} className="whitespace-pre-wrap">{part.value}</span> : null
                    )}
                  </div>
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

    </div>
  );
}

// ─── History Tab ──────────────────────────────────────────────────────────────

function HistoryTab({ leagueId, previousLeagueId }: { leagueId: string; previousLeagueId?: string }) {
  const [standings, setStandings] = useState<Standing[] | null>(null);
  const [loading, setLoading] = useState(!!previousLeagueId);

  useEffect(() => {
    if (!previousLeagueId) return;
    api.get<Standing[]>(`/leagues/${previousLeagueId}/standings`)
      .then(s => setStandings(s))
      .catch(() => setStandings([]))
      .finally(() => setLoading(false));
  }, [previousLeagueId]);

  if (!previousLeagueId) {
    return (
      <div className="bg-card border border-line rounded-2xl p-10 text-center">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-copy-3 mx-auto mb-3">
          <path d="M12 8v4l3 3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M3.05 11a9 9 0 1 1 .5 4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M3 16v-5h5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <p className="text-copy-2 text-sm font-medium">No previous seasons on record.</p>
        <p className="text-copy-3 text-xs mt-1">This is the first season of this league.</p>
      </div>
    );
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;

  return (
    <div className="space-y-4">
      <div className="bg-card border border-line rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-line">
          <p className="text-sm font-semibold text-copy">Previous Season Final Standings</p>
          <p className="text-xs text-copy-3 mt-0.5">League ID: {previousLeagueId}</p>
        </div>
        {!standings || standings.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-copy-3 text-sm">No standings data available for the previous season.</p>
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
    </div>
  );
}

// ─── Recent Activity Tab ──────────────────────────────────────────────────────

function RecentActivityTab({ leagueId, fantasyTeams }: { leagueId: string; fantasyTeams: FantasyTeam[] }) {
  const [transactions, setTransactions] = useState<TxEvent[]>([]);
  const [allSportTeams, setAllSportTeams] = useState<SportTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get<TxEvent[]>(`/leagues/${leagueId}/transactions`).catch(() => [] as TxEvent[]),
      api.get<SportGroup[]>(`/leagues/${leagueId}/sport-teams`).catch(() => [] as SportGroup[]),
    ]).then(([txs, groups]) => {
      setTransactions(txs);
      setAllSportTeams(groups.flatMap(g => g.teams));
    }).finally(() => setLoading(false));
  }, [leagueId]);

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
                        {dropTeamName && (
                          <>
                            <span className="text-copy-3"> and dropped </span>
                            <span className="text-danger font-medium">{dropTeamName}</span>
                          </>
                        )}
                      </p>
                    </div>
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

// ─── Commissioner Tab ─────────────────────────────────────────────────────────

function CommissionerTab({
  league, setLeague, leagueId,
}: {
  league: League;
  setLeague: React.Dispatch<React.SetStateAction<League | null>>;
  leagueId: string;
}) {
  const router = useRouter();

  const [auctionForm, setAuctionForm] = useState({
    startingBudget:   league.auctionConfig?.startingBudget   ?? 1000,
    minOpeningBid:    league.auctionConfig?.minOpeningBid    ?? 1,
    minBidIncrement:  league.auctionConfig?.minBidIncrement  ?? 1,
    nominationMode:   league.auctionConfig?.nominationMode   ?? 'random-hidden',
    countdownSeconds: league.auctionConfig?.countdownSeconds ?? 15,
    maxWildcard:      league.auctionConfig?.maxWildcard      ?? league.maxWildcard ?? 0,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [scheduleInput, setScheduleInput] = useState(() => {
    const s = league.auctionConfig?.scheduledStartAt;
    if (!s) return '';
    const d = new Date(s);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  });
  const [savingSchedule, setSavingSchedule] = useState(false);
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
  const [waiverHour, setWaiverHour] = useState(league.waiverSettings?.processingHour ?? 17);
  const [waiverSettingsSaving, setWaiverSettingsSaving] = useState(false);

  const [leagueName, setLeagueName] = useState(league.name ?? '');
  const [leagueNameSaving, setLeagueNameSaving] = useState(false);

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

  async function saveSchedule(clear = false) {
    setSavingSchedule(true);
    try {
      const scheduledStartAt = clear ? null : (scheduleInput ? new Date(scheduleInput).toISOString() : null);
      await api.patch(`/leagues/${leagueId}/auction/schedule`, { scheduledStartAt });
      if (league) setLeague({ ...league, auctionConfig: league.auctionConfig ? { ...league.auctionConfig, scheduledStartAt } : league.auctionConfig });
      if (clear) setScheduleInput('');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to save schedule');
    } finally {
      setSavingSchedule(false);
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

  async function saveLeagueName() {
    const trimmed = leagueName.trim();
    if (!trimmed) return;
    setLeagueNameSaving(true);
    try {
      const updated = await api.patch<League>(`/leagues/${leagueId}/settings`, { name: trimmed });
      setLeague(updated);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to save league name');
    } finally {
      setLeagueNameSaving(false);
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

  return (
    <div className="space-y-4">
      {/* League name */}
      <div className="bg-card border border-line rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-copy mb-4">League Name</h2>
        <div className="flex gap-2">
          <input
            value={leagueName}
            onChange={e => setLeagueName(e.target.value)}
            placeholder="League name"
            className={inputCls}
            onKeyDown={e => e.key === 'Enter' && saveLeagueName()}
          />
          <button
            onClick={saveLeagueName}
            disabled={leagueNameSaving || !leagueName.trim() || leagueName.trim() === league.name}
            className="flex-shrink-0 bg-brand hover:bg-brand-2 disabled:opacity-40 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
          >
            {leagueNameSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

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

      {/* State controls */}
      {(league.state === 'draft' || league.state === 'completed' || league.state === 'active') && (
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
          {(league.state === 'completed' || league.state === 'active') && (
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-copy">Start New Season</p>
                <p className="text-xs text-copy-3 mt-0.5">Creates a brand-new draft league for the next season. This league stays intact and continues running.</p>
              </div>
              <button
                onClick={handleRenew}
                disabled={renewing}
                className="flex-shrink-0 bg-brand hover:bg-brand-2 disabled:opacity-50 text-white text-xs font-semibold px-3 py-2 rounded-xl transition-colors whitespace-nowrap"
              >
                {renewing ? 'Creating...' : 'New Season'}
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

      {/* Auction Settings */}
      <div className="bg-card border border-line rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-copy mb-1">Auction Settings</h2>
        <p className="text-xs text-copy-3 mb-5">Must be configured before starting the auction.</p>
        <form onSubmit={saveAuctionConfig} className="space-y-4">
          {(() => {
            const isSnake = auctionForm.nominationMode === 'snake-random' || auctionForm.nominationMode === 'snake-defined';
            return (
              <div className="grid grid-cols-2 gap-3">
                {!isSnake && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-copy-2 mb-1.5">Starting Budget ($)</label>
                      <input type="number" min={1} required value={auctionForm.startingBudget}
                        onFocus={e => e.target.select()}
                        onChange={e => { const v = e.target.valueAsNumber; if (!isNaN(v)) setAuctionForm(f => ({ ...f, startingBudget: v })); }}
                        className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-copy-2 mb-1.5">Min Opening Bid ($)</label>
                      <input type="number" min={1} required value={auctionForm.minOpeningBid}
                        onFocus={e => e.target.select()}
                        onChange={e => { const v = e.target.valueAsNumber; if (!isNaN(v)) setAuctionForm(f => ({ ...f, minOpeningBid: v })); }}
                        className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-copy-2 mb-1.5">Min Bid Increment ($)</label>
                      <input type="number" min={1} required value={auctionForm.minBidIncrement}
                        onFocus={e => e.target.select()}
                        onChange={e => { const v = e.target.valueAsNumber; if (!isNaN(v)) setAuctionForm(f => ({ ...f, minBidIncrement: v })); }}
                        className={inputCls} />
                    </div>
                  </>
                )}
                <div>
                  <label className="block text-xs font-medium text-copy-2 mb-1.5">Pick Clock (sec)</label>
                  <input type="number" min={5} max={300} required value={auctionForm.countdownSeconds}
                    onFocus={e => e.target.select()}
                    onChange={e => { const v = e.target.valueAsNumber; if (!isNaN(v)) setAuctionForm(f => ({ ...f, countdownSeconds: v })); }}
                    className={inputCls} />
                </div>
              </div>
            );
          })()}
          <div>
            <label className="block text-xs font-medium text-copy-2 mb-1.5">Nomination Mode</label>
            <select value={auctionForm.nominationMode}
              onChange={e => setAuctionForm(f => ({ ...f, nominationMode: e.target.value }))}
              className={inputCls}>
              <option value="manual">Manual — commissioner picks who nominates</option>
              <option value="random-disclosed">Random (disclosed) — order shown to all</option>
              <option value="random-hidden">Random (hidden) — revealed one at a time</option>
              <option value="snake-random">Snake Draft — random pick order</option>
              <option value="snake-defined">Snake Draft — commissioner sets order</option>
            </select>
          </div>
          <button type="submit" disabled={saving}
            className="bg-brand hover:bg-brand-2 disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm">
            {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save Auction Settings'}
          </button>
        </form>
      </div>

      {/* Schedule */}
      <div className="bg-card border border-line rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-copy mb-1">Schedule Draft</h2>
        <p className="text-xs text-copy-3 mb-4">Set a date and time for the draft to auto-start. The room opens to members 1 hour beforehand.</p>
        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-copy-2 mb-1.5">Date &amp; Time (local)</label>
            <input
              type="datetime-local"
              value={scheduleInput}
              onChange={e => setScheduleInput(e.target.value)}
              className="w-full bg-field border border-line-2 rounded-xl px-3 py-2 text-sm text-copy focus:outline-none focus:border-brand transition-colors"
            />
          </div>
          <button
            onClick={() => saveSchedule(false)}
            disabled={savingSchedule || !scheduleInput}
            className="bg-brand hover:bg-brand-2 disabled:opacity-50 text-white font-semibold px-4 py-2.5 rounded-xl transition-colors text-sm whitespace-nowrap"
          >
            {savingSchedule ? 'Saving…' : 'Set Schedule'}
          </button>
          {league.auctionConfig?.scheduledStartAt && (
            <button
              onClick={() => saveSchedule(true)}
              disabled={savingSchedule}
              className="bg-field hover:bg-field-2 border border-line text-copy-2 font-medium px-4 py-2.5 rounded-xl transition-colors text-sm whitespace-nowrap"
            >
              Clear
            </button>
          )}
        </div>
        {league.auctionConfig?.scheduledStartAt && (
          <p className="text-xs text-copy-3 mt-3">
            Scheduled: <span className="text-copy font-medium">{new Date(league.auctionConfig.scheduledStartAt).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' })}</span>
          </p>
        )}
      </div>

      {/* Danger Zone */}
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
    </div>
  );
}

// ─── Rules Tab ────────────────────────────────────────────────────────────────

function RulesTab({ league }: { league: League }) {
  const [deadlines, setDeadlines] = useState<Record<string, string>>({});

  useEffect(() => {
    api.get<Record<string, string>>('/sports/deadlines')
      .then(setDeadlines)
      .catch(() => {});
  }, []);

  const today = new Date().toISOString().slice(0, 10);

  // Only show deadlines for sports this league actually uses
  const leagueDeadlines = league.selectedSports
    .filter(s => deadlines[s])
    .map(s => {
      const date = deadlines[s];
      const msUntil = new Date(date + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime();
      const daysUntil = Math.ceil(msUntil / 86_400_000);
      return { sport: s, date, daysUntil, locked: daysUntil <= 0 };
    });

  return (
    <div className="space-y-6">
      <section className="space-y-5">
        <h3 className="text-xs font-semibold text-copy-3 uppercase tracking-widest">General Rules</h3>

        <div>
          <p className="text-xs font-semibold text-copy-2 uppercase tracking-wide mb-2">Roster</p>
          <ul className="space-y-1.5 list-disc list-inside">
            {[
              'Minimum 1 team owned per sport',
              '2 Wildcard Teams — additional team in any sport but Premier League',
              'Limits: 1 EPL team per player, max 2 teams in any given sport',
            ].map((r, i) => <li key={i} className="text-sm text-copy-2 leading-relaxed pl-1">{r}</li>)}
          </ul>
        </div>

        <div>
          <p className="text-xs font-semibold text-copy-2 uppercase tracking-wide mb-2">Points</p>
          <ul className="space-y-1.5 list-disc list-inside">
            <li className="text-sm text-copy-2 leading-relaxed pl-1">Points are based on Wins, Draws and Playoffs. The Table is based on the total accumulation throughout the season.</li>
            <li className="text-sm text-copy-2 leading-relaxed pl-1">A bonus is given for Conference and Division Champions. (See &ldquo;Points&rdquo; tab for criteria)</li>
            <li className="text-sm text-copy-2 leading-relaxed pl-1">NCAAF bonus points will only be given out for Power 4 teams; NCAAB bonus will only be given out for Power 5 teams</li>
            <li className="text-sm text-copy-2 leading-relaxed pl-1">Power 4 = SEC, Big Ten, ACC, Big 12</li>
            <li className="text-sm text-copy-2 leading-relaxed pl-1">Power 5 = Power 4 + Big East</li>
          </ul>
        </div>

        <div>
          <p className="text-xs font-semibold text-copy-2 uppercase tracking-wide mb-2">Transactions</p>
          <ul className="space-y-1.5 list-disc list-inside">
            {(() => {
              const ws = league.waiverSettings;
              const wDay = ws?.processingDay ?? 'tuesday';
              const wHour = ws?.processingHour ?? 17;
              const wDayLabel = wDay.charAt(0).toUpperCase() + wDay.slice(1);
              const wTimeLabel = wHour === 0 ? '12:00 AM' : wHour < 12 ? `${wHour}:00 AM` : wHour === 12 ? '12:00 PM' : `${wHour - 12}:00 PM`;
              return [
                'Teams are added and removed by submitting a waiver request on the "Waivers" tab.',
                `Waivers are processed every ${wDayLabel} morning at ${wTimeLabel} EST by standard rule sets.`,
                'Tiebreaker order is reverse current standings (Lowest in the standings is #1 priority.)',
                'Trades are allowed to be made as long as both teams are upholding roster limits.',
              ];
            })().map((r, i) => <li key={i} className="text-sm text-copy-2 leading-relaxed pl-1">{r}</li>)}
          </ul>
        </div>

        {/* Waiver Deadlines */}
        <div>
          <p className="text-xs font-semibold text-copy-2 uppercase tracking-wide mb-2">Waiver Deadlines</p>
          {leagueDeadlines.length === 0 ? (
            <p className="text-sm text-copy-3">No deadlines currently set.</p>
          ) : (
            <div className="space-y-2">
              {leagueDeadlines.map(({ sport, date, daysUntil, locked }) => {
                const formatted = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
                  month: 'long', day: 'numeric', year: 'numeric',
                });
                const urgentSoon = !locked && daysUntil <= 7;
                return (
                  <div key={sport} className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border ${
                    locked ? 'bg-danger-bg border-danger/20' : urgentSoon ? 'bg-warn/5 border-warn/20' : 'bg-field border-line'
                  }`}>
                    <div>
                      <p className={`text-sm font-medium ${locked ? 'text-danger' : 'text-copy'}`}>
                        {formatLeagueName(sport)}
                      </p>
                      <p className="text-xs text-copy-3 mt-0.5">{formatted}</p>
                    </div>
                    {locked ? (
                      <span className="text-[10px] font-bold bg-danger text-white px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0">LOCKED</span>
                    ) : daysUntil === 1 ? (
                      <span className="text-[10px] font-bold bg-danger text-white px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0">1 DAY LEFT</span>
                    ) : urgentSoon ? (
                      <span className="text-[10px] font-bold bg-warn text-white px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0">{daysUntil} DAYS LEFT</span>
                    ) : (
                      <span className="text-xs text-copy-3 whitespace-nowrap flex-shrink-0">{daysUntil}d left</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <div className="border-t border-line" />

      <section className="space-y-3">
        <h3 className="text-xs font-semibold text-copy-3 uppercase tracking-widest">Draft Rules</h3>
        <ul className="space-y-1.5 list-disc list-inside">
          {[
            '3 options for Drafts: Randomized order Auction, Nomination Auction, Snake draft',
            'For Auction: Players will have $1,000 to bid on all their teams — this is a hard cap.',
            'Players will have 15 seconds to bid on a team; once a bid is placed the 15-second timer restarts until it expires.',
            'Teams not drafted during the auction will become free agent teams available on waivers.',
          ].map((r, i) => <li key={i} className="text-sm text-copy-2 leading-relaxed pl-1">{r}</li>)}
        </ul>
      </section>

      {league.seasonRefs.length > 0 && (
        <>
          <div className="border-t border-line" />
          <section>
            <h3 className="text-xs font-semibold text-copy-3 uppercase tracking-widest mb-3">Scoring Breakdown</h3>
            <div className="overflow-x-auto rounded-xl border border-line">
              <table
                className="w-full table-fixed text-sm"
                style={{ minWidth: `${180 + league.seasonRefs.length * 88}px` }}
              >
                <thead>
                  <tr className="bg-field/60 border-b border-line">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-copy-3 w-[180px]"></th>
                    {league.seasonRefs.map(ref => (
                      <th key={ref.sportLeagueId} className="text-center px-3 py-2.5 text-xs font-semibold text-copy-3 leading-snug">
                        {formatLeagueName(ref.sportLeagueId)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-line/50 bg-field/30">
                    <td colSpan={league.seasonRefs.length + 1} className="px-4 py-1.5 text-xs font-semibold text-copy-3">
                      Points per:
                    </td>
                  </tr>
                  <tr className="border-t border-line/50">
                    <td className="px-4 py-2.5 font-medium text-copy">Win</td>
                    {league.seasonRefs.map(ref => (
                      <td key={ref.sportLeagueId} className="px-3 py-2.5 text-center tabular-nums text-copy-2">
                        {ref.winValue.toFixed(1)}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-t border-line/50">
                    <td className="px-4 py-2.5 font-medium text-copy">Draw / OT Loss</td>
                    {league.seasonRefs.map(ref => (
                      <td key={ref.sportLeagueId} className="px-3 py-2.5 text-center tabular-nums text-copy-2">
                        {(ref.drawValue ?? 0).toFixed(1)}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-t-2 border-line bg-field/30">
                    <td colSpan={league.seasonRefs.length + 1} className="px-4 py-1.5 text-xs font-semibold text-copy-3">
                      Playoff structure:
                    </td>
                  </tr>
                  {[
                    { label: '1st round winner', pts: 10 },
                    { label: '2nd round winner', pts: 15 },
                    { label: '3rd round winner', pts: 25 },
                    { label: 'Champion',          pts: 50 },
                    { label: 'Max playoff points', pts: 100 },
                  ].map(({ label, pts }, i) => (
                    <tr key={label} className={`border-t border-line/50${i === 3 ? ' font-semibold' : ''}`}>
                      <td className={`px-4 py-2.5 text-copy ${i === 3 ? 'font-semibold' : 'font-medium'}`}>{label}</td>
                      {league.seasonRefs.map(ref => (
                        <td key={ref.sportLeagueId} className={`px-3 py-2.5 text-center tabular-nums ${i === 3 ? 'text-copy font-semibold' : 'text-copy-2'}`}>
                          {pts}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <div className="border-t border-line" />

      <section className="space-y-4">
        <h3 className="text-xs font-semibold text-copy-3 uppercase tracking-widest">Playoff Points — Special Cases</h3>
        <p className="text-xs text-copy-3">Playoff points stack as your team advances. Some leagues map rounds differently:</p>
        <div className="space-y-3">
          {[
            {
              sport: 'UCL',
              rules: ['1st Round Win = Round of 16 Win'],
            },
            {
              sport: 'Premier League',
              rules: [
                '1st Round Win = Top 8 League position',
                '2nd Round Win = Top 4 League position',
                '3rd Round Win = Top 2 League position',
              ],
            },
            {
              sport: 'NCAA Basketball',
              rules: ['1st Round Win = Sweet 16 Win'],
            },
          ].map(({ sport, rules }) => (
            <div key={sport} className="bg-field border border-line rounded-xl px-4 py-3">
              <p className="text-xs font-semibold text-copy mb-1.5">{sport}</p>
              <ul className="space-y-1 list-disc list-inside">
                {rules.map((r, i) => <li key={i} className="text-xs text-copy-2 pl-1">{r}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <div className="border-t border-line" />

      <section className="space-y-4">
        <h3 className="text-xs font-semibold text-copy-3 uppercase tracking-widest">Bonus Points</h3>
        <p className="text-xs text-copy-3">Awarded in addition to regular win/draw points for finishing in qualifying positions:</p>
        <div className="space-y-2">
          {[
            { sport: 'NHL',            rules: ['10 pts — Top 2 in each division'] },
            { sport: 'NBA',            rules: ['10 pts — Top 3 in each conference'] },
            { sport: 'NFL',            rules: ['10 pts — Each Division Winner'] },
            { sport: 'MLB',            rules: ['10 pts — Each Division Winner + 4 seed (Top Wildcard team)'] },
            { sport: 'UCL',            rules: ['10 pts — Top 8 in the Final Table'] },
            { sport: 'EPL',            rules: ['5 pts — Top 6 in the League', '15 pts — FA and EFL Cup Winners'] },
            { sport: 'NCAA Football',  rules: ['20 pts — Power 4 Champions (B1G, SEC, B12, ACC)'] },
            { sport: 'NCAA Basketball',rules: ['8 pts — (Power 4 + Big East) conference winner', '8 pts — (Power 4 + Big East) conference tournament winner'] },
          ].map(({ sport, rules }) => (
            <div key={sport} className="flex gap-3 bg-field border border-line rounded-xl px-4 py-3">
              <span className="text-xs font-semibold text-brand whitespace-nowrap w-28 flex-shrink-0 mt-0.5">{sport}</span>
              <ul className="space-y-1 list-disc list-inside flex-1">
                {rules.map((r, i) => <li key={i} className="text-xs text-copy-2">{r}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
