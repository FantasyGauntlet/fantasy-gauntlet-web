'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { STATE_META, Spinner } from './_components';
import { VALID_TABS } from './_types';
import type { League, Member, FantasyTeam, Tab, ScoreboardGame } from './_types';
import { StandingsTab } from './tabs/standings';
import { RosterTab } from './tabs/roster';
import { WaiversTab } from './tabs/waivers';
import { TransactionCounterTab } from './tabs/transaction-counter';
import { AuctionSummaryTab } from './tabs/auction-summary';
import { LeagueHomeTab } from './tabs/home';
import { HistoryTab } from './tabs/history';
import { RulesTab } from './tabs/rules';
import { RecentActivityTab } from './tabs/recent-activity';
import { CommissionerTab } from './tabs/commissioner';
import { UserManagementTab } from './tabs/user-management';
import { GameCenterTab } from './tabs/game-center';

export default function LeaguePage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const [league, setLeague] = useState<League | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [fantasyTeams, setFantasyTeams] = useState<FantasyTeam[]>([]);
  const [tab, setTab] = useState<Tab>('standings');
  const [mountedTabs, setMountedTabs] = useState<Set<Tab>>(() => new Set<Tab>(['standings']));
  const [loading, setLoading] = useState(true);
  const [openDropdown, setOpenDropdown] = useState<'teams' | 'league' | null>(null);
  const [dropdownAnchor, setDropdownAnchor] = useState<{ left: number; top: number } | null>(null);
  const [scoreboard, setScoreboard] = useState<ScoreboardGame[]>([]);
  const [scoreboardLoading, setScoreboardLoading] = useState(false);
  const [schedule, setSchedule] = useState<ScoreboardGame[]>([]);
  const [scheduleLoaded, setScheduleLoaded] = useState(false);
  const [waiverFilterPush, setWaiverFilterPush] = useState<{ sport: string | null; v: number }>({ sport: null, v: 0 });
  const [startAuctionError, setStartAuctionError] = useState<string | null>(null);
  const tabBarRef = useRef<HTMLDivElement>(null);
  const dropdownPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent | TouchEvent) {
      const target = e.target as Node;
      const inTabBar = tabBarRef.current?.contains(target);
      const inDropdown = dropdownPanelRef.current?.contains(target);
      if (!inTabBar && !inDropdown) {
        setOpenDropdown(null);
        setDropdownAnchor(null);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, []);

  const switchTab = useCallback((next: Tab) => {
    setMountedTabs((prev: Set<Tab>) => prev.has(next) ? prev : new Set<Tab>([...prev, next]));
    setTab(next);
    setOpenDropdown(null);
    setDropdownAnchor(null);
  }, []);

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
    if (t && VALID_TABS.includes(t)) switchTab(t);
  }, [switchTab]);


  useEffect(() => {
    if (league?.state !== 'active' || !league.selectedSports.length) return;
    const sports = league.selectedSports.join(',');
    const teamIds = fantasyTeams.flatMap(ft => ft.ownedTeamIds).join(',');
    const qs = teamIds ? `sports=${sports}&teamIds=${teamIds}` : `sports=${sports}`;
    setScoreboardLoading(true);
    function fetchScoreboard() {
      api.get<ScoreboardGame[]>(`/sports/scoreboard?${qs}`)
        .then(data => { setScoreboard(data); setScoreboardLoading(false); })
        .catch(() => { setScoreboardLoading(false); });
    }
    fetchScoreboard();
    const interval = setInterval(fetchScoreboard, 60_000);
    return () => clearInterval(interval);
  }, [league?.state, league?.selectedSports, fantasyTeams]);

  useEffect(() => {
    if (!mountedTabs.has('games') || scheduleLoaded) return;
    if (!league?.selectedSports.length || league.state !== 'active') return;
    setScheduleLoaded(true);
    const sports = league.selectedSports.join(',');
    const teamIds = fantasyTeams.flatMap(ft => ft.ownedTeamIds).join(',');
    const qs = teamIds ? `sports=${sports}&teamIds=${teamIds}` : `sports=${sports}`;
    api.get<ScoreboardGame[]>(`/sports/schedule?${qs}&days=120`)
      .then(setSchedule).catch(() => {});
  }, [mountedTabs, scheduleLoaded, league?.selectedSports, league?.state, fantasyTeams]);

  const liveTeamIds = useMemo(() => {
    const ids = new Set<string>();
    for (const g of scoreboard) {
      if (g.isLive) { ids.add(g.homeTeamId); ids.add(g.awayTeamId); }
    }
    return ids;
  }, [scoreboard]);

  const myOwnedTeamIds = useMemo(() => new Set(
    fantasyTeams
      .filter(ft => ft.userId === user?.uid || (ft.coOwnerIds ?? []).includes(user?.uid ?? ''))
      .flatMap(ft => ft.ownedTeamIds)
  ), [fantasyTeams, user?.uid]);

  const allLeagueTeamIds = useMemo(() => new Set(
    fantasyTeams.flatMap(ft => ft.ownedTeamIds)
  ), [fantasyTeams]);

  const hasLiveGames = scoreboard.some(g => g.isLive);

  async function startAuction() {
    try {
      await api.post(`/leagues/${id}/auction/start`);
      setLeague((l: League | null) => l ? { ...l, state: 'auction' } : l);
      router.push(`/leagues/${id}/auction`);
    } catch (e: unknown) {
      setStartAuctionError(e instanceof Error ? e.message : 'Failed to start auction');
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
    }, 30_000);
    return () => clearInterval(poll);
  }, [league?.state, id, router]);

  if (loading) {
    return (
      <div className="animate-pulse">
        {/* Header skeleton */}
        <div className="mb-6">
          <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
            <div className="flex-1 min-w-0 space-y-2">
              <div className="h-8 bg-field rounded-xl w-56" />
              <div className="h-4 bg-field rounded-lg w-32" />
            </div>
          </div>
        </div>
        {/* Tab bar skeleton */}
        <div className="flex gap-2 overflow-x-auto pb-1 mb-6">
          {[80, 72, 64, 88, 72].map((w, i) => (
            <div key={i} className="flex-shrink-0 h-9 bg-field rounded-xl" style={{ width: w }} />
          ))}
        </div>
        {/* Content skeleton */}
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-16 bg-field rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }
  if (!league) return null;

  const isCommissioner = league.commissionerId === user?.uid;
  const stateMeta = STATE_META[league.state] ?? STATE_META.completed;

  const teamsSubTabs: { key: Tab; label: string }[] = [
    { key: 'waivers',             label: 'Waivers' },
    { key: 'transaction-counter', label: 'Transaction Counter' },
    { key: 'auction-summary',     label: 'Auction Summary' },
  ];
  const isTeamsTab = teamsSubTabs.some(t => t.key === tab);
  const activeTeamsLabel = teamsSubTabs.find(t => t.key === tab)?.label ?? 'Teams';

  const leagueSubTabs: { key: Tab; label: string }[] = [
    { key: 'home',        label: 'League Home' },
    { key: 'activity',    label: 'Recent Activity' },
    { key: 'rules',       label: 'Rules' },
    { key: 'history',     label: 'History' },
    ...(isCommissioner ? [{ key: 'commissioner' as Tab, label: 'Commissioner Settings' }] : []),
    ...(isCommissioner ? [{ key: 'user-management' as Tab, label: 'User Management' }] : []),
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
              {(league.state === 'auction' || league.state === 'draft') && (
                <Link
                  href={`/leagues/${id}/auction`}
                  className="bg-info text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors hover:opacity-90"
                >
                  Enter Draft Room
                </Link>
              )}
              {isCommissioner && league.state === 'draft' && (
                <div className="flex flex-col items-end gap-1">
                  <button
                    onClick={() => { setStartAuctionError(null); startAuction(); }}
                    disabled={!league.auctionConfig}
                    title={!league.auctionConfig ? 'Set auction config in Settings first' : undefined}
                    className="bg-brand hover:bg-brand-2 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
                  >
                    Start Draft
                  </button>
                  {startAuctionError && (
                    <p className="text-xs text-danger">{startAuctionError}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tab bar — no overflow scroll; tabs sized to fit mobile. Dropdowns rendered
          via position:fixed below so they are never clipped by any ancestor. */}
      <div ref={tabBarRef} className="flex gap-0.5 mb-6 border-b border-line">
        {(['standings', 'roster'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => switchTab(t)}
            className={`px-2.5 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-medium transition-colors -mb-px border-b-2 capitalize ${
              tab === t
                ? 'border-brand text-brand'
                : 'border-transparent text-copy-3 hover:text-copy-2 hover:border-line-2'
            }`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}

        {/* Teams dropdown trigger */}
        <div className="relative -mb-px">
          <button
            onClick={(e) => {
              if (openDropdown === 'teams') {
                setOpenDropdown(null);
                setDropdownAnchor(null);
              } else {
                const rect = e.currentTarget.getBoundingClientRect();
                setDropdownAnchor({ left: rect.left, top: rect.bottom });
                setOpenDropdown('teams');
              }
            }}
            className={`px-2.5 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-medium transition-colors flex items-center gap-1 border-b-2 ${
              isTeamsTab || openDropdown === 'teams'
                ? 'border-brand text-brand'
                : 'border-transparent text-copy-3 hover:text-copy-2 hover:border-line-2'
            }`}
          >
            <span className="sm:hidden">Teams</span>
            <span className="hidden sm:inline">{activeTeamsLabel}</span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`flex-shrink-0 transition-transform ${openDropdown === 'teams' ? 'rotate-180' : ''}`}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>

        {league.state === 'active' && (
          <button
            onClick={() => switchTab('games')}
            className={`px-2.5 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-medium transition-colors -mb-px border-b-2 relative ${
              tab === 'games'
                ? 'border-brand text-brand'
                : 'border-transparent text-copy-3 hover:text-copy-2 hover:border-line-2'
            }`}
          >
            <span className="sm:hidden">Games</span>
            <span className="hidden sm:inline">Game Center</span>
            {hasLiveGames && (
              <span className="absolute top-1.5 right-0.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-positive opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-positive" />
                </span>
              </span>
            )}
          </button>
        )}

        {/* League dropdown trigger */}
        <div className="relative -mb-px">
          <button
            onClick={(e) => {
              if (openDropdown === 'league') {
                setOpenDropdown(null);
                setDropdownAnchor(null);
              } else {
                const rect = e.currentTarget.getBoundingClientRect();
                setDropdownAnchor({ left: rect.left, top: rect.bottom });
                setOpenDropdown('league');
              }
            }}
            className={`px-2.5 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-medium transition-colors flex items-center gap-1 border-b-2 ${
              isLeagueTab || openDropdown === 'league'
                ? 'border-brand text-brand'
                : 'border-transparent text-copy-3 hover:text-copy-2 hover:border-line-2'
            }`}
          >
            <span className="sm:hidden">League</span>
            <span className="hidden sm:inline">{activeLeagueLabel}</span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`flex-shrink-0 transition-transform ${openDropdown === 'league' ? 'rotate-180' : ''}`}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>
      </div>

      {/* Dropdown panels — position:fixed so they escape any overflow context */}
      {dropdownAnchor && (openDropdown === 'teams' || openDropdown === 'league') && (
        <div
          ref={dropdownPanelRef}
          style={{
            position: 'fixed',
            left: Math.min(dropdownAnchor.left, window.innerWidth - 216),
            top: dropdownAnchor.top + 4,
            zIndex: 9999,
            minWidth: 200,
          }}
        >
          <div className="bg-card border border-line rounded-xl shadow-xl py-1 overflow-hidden">
            {(openDropdown === 'teams' ? teamsSubTabs : leagueSubTabs).map(t => (
              <button
                key={t.key}
                onClick={() => switchTab(t.key)}
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
      )}

      {mountedTabs.has('standings') && (
        <div className={tab !== 'standings' ? 'hidden' : ''}>
          <StandingsTab leagueId={id} userId={user?.uid} fantasyTeams={fantasyTeams} topZone={league.topZone} bottomZone={league.bottomZone} ownerNameByUserId={Object.fromEntries(members.filter((m: Member) => m.displayName).map((m: Member) => [m.userId, m.displayName!]))} liveTeamIds={liveTeamIds} selectedSports={league.selectedSports} maxWildcard={league.maxWildcard ?? 0} />
        </div>
      )}
      {mountedTabs.has('roster') && (
        <div className={tab !== 'roster' ? 'hidden' : ''}>
          <RosterTab
            leagueId={id}
            leagueState={league.state}
            fantasyTeams={fantasyTeams}
            setFantasyTeams={setFantasyTeams}
            isCommissioner={isCommissioner}
            userId={user?.uid}
            ownerNameByUserId={Object.fromEntries(members.filter((m: Member) => m.displayName).map((m: Member) => [m.userId, m.displayName!]))}
            liveTeamIds={liveTeamIds}
            selectedSports={league.selectedSports}
            maxWildcard={league.maxWildcard ?? 0}
            onGoToWaivers={(sport) => {
              setWaiverFilterPush(prev => ({ sport, v: prev.v + 1 }));
              switchTab('waivers');
            }}
          />
        </div>
      )}
      {mountedTabs.has('waivers') && (
        <div className={tab !== 'waivers' ? 'hidden' : ''}>
          <WaiversTab
            leagueId={id}
            isCommissioner={isCommissioner}
            userId={user?.uid}
            fantasyTeams={fantasyTeams}
            selectedSports={league.selectedSports}
            waiverType={league.waiverType ?? 'reserve-standings'}
            faabStartingBudget={league.faabStartingBudget ?? 100}
            rosterSize={league.selectedSports.length + (league.maxWildcard ?? 0)}
            waiverSettings={league.waiverSettings}
            filterPush={waiverFilterPush}
          />
        </div>
      )}
      {mountedTabs.has('transaction-counter') && (
        <div className={tab !== 'transaction-counter' ? 'hidden' : ''}>
          <TransactionCounterTab
            leagueId={id}
            fantasyTeams={fantasyTeams}
            waiverType={league.waiverType ?? 'reserve-standings'}
            faabStartingBudget={league.faabStartingBudget ?? 100}
            userId={user?.uid}
          />
        </div>
      )}
      {mountedTabs.has('auction-summary') && (
        <div className={tab !== 'auction-summary' ? 'hidden' : ''}>
          <AuctionSummaryTab leagueId={id} fantasyTeams={fantasyTeams} />
        </div>
      )}
      {mountedTabs.has('games') && (
        <div className={tab !== 'games' ? 'hidden' : ''}>
          <GameCenterTab games={scoreboard} schedule={schedule} selectedSports={league.selectedSports} myOwnedTeamIds={myOwnedTeamIds} allLeagueTeamIds={allLeagueTeamIds} loading={scoreboardLoading} fantasyTeams={fantasyTeams} userId={user?.uid ?? ''} />
        </div>
      )}
      {mountedTabs.has('home') && (
        <div className={tab !== 'home' ? 'hidden' : ''}>
          <LeagueHomeTab league={league} isCommissioner={isCommissioner} leagueId={id} memberCount={members.length} userId={user?.uid} fantasyTeams={fantasyTeams} />
        </div>
      )}
      {mountedTabs.has('history') && (
        <div className={tab !== 'history' ? 'hidden' : ''}>
          <HistoryTab leagueId={id} leagueGroupId={league.leagueGroupId} previousLeagueId={league.previousLeagueId} />
        </div>
      )}
      {mountedTabs.has('rules') && (
        <div className={tab !== 'rules' ? 'hidden' : ''}>
          <RulesTab league={league} />
        </div>
      )}
      {mountedTabs.has('activity') && (
        <div className={tab !== 'activity' ? 'hidden' : ''}>
          <RecentActivityTab leagueId={id} fantasyTeams={fantasyTeams} />
        </div>
      )}
      {mountedTabs.has('user-management') && isCommissioner && (
        <div className={tab !== 'user-management' ? 'hidden' : ''}>
          <UserManagementTab leagueId={id} league={league} fantasyTeams={fantasyTeams} members={members} />
        </div>
      )}
      {mountedTabs.has('commissioner') && isCommissioner && (
        <div className={tab !== 'commissioner' ? 'hidden' : ''}>
          <div className="space-y-4">
            <CommissionerTab league={league} setLeague={setLeague} leagueId={id} />
          </div>
        </div>
      )}
    </div>
  );
}
