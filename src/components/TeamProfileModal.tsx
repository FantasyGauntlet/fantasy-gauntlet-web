'use client';

import { useEffect, useRef, useState } from 'react';
import { useTeamProfile } from '@/context/TeamProfileContext';
import { api } from '@/lib/api';

interface FormResult {
  date: string;
  opponent: { id: string; name: string; shortName: string; logoUrl: string | null };
  result: 'W' | 'L' | 'D';
  myScore: number;
  theirScore: number;
  wasHome: boolean;
}

interface AuctionBreakdownRow {
  leagueId: string;
  leagueName: string;
  completedAt: string;
  price: number;
  excluded: boolean;
}

interface AuctionStats {
  avgPrice: number | null;
  leaguesDrafted: number;
  leaguePrice: number | null;
  breakdown: AuctionBreakdownRow[];
}

interface RosterStats {
  rosteredPct: number | null;
  trend: 'up' | 'down' | null;
  pickups7d: number;
  drops7d: number;
  delta30d: number | null;
}

interface TeamNews {
  articles: { title: string; summary: string; published: string; url: string }[];
}

interface StandingEntry {
  teamId: string;
  teamName: string;
  logoUrl: string | null;
  wins: number;
  losses: number;
  draws: number;
  gamesPlayed: number;
  points: number | null;
  pct: number | null;
  pointDiff: number | null;
}

interface ParsedTeamRow extends StandingEntry {
  confName: string;
  confAbbr: string;
  divName: string;
  divAbbr: string;
}

interface StandingGroup {
  name: string;
  entries: ParsedTeamRow[];
  isWildcard?: boolean;
}

interface PollEntry {
  rank: number;
  teamId: string;
  teamName: string;
  logoUrl: string | null;
  record: string;
  points: number;
  firstPlaceVotes: number;
}

type StandingsViewKey = 'division' | 'conference' | 'league' | 'poll';
interface StandingsViewOption { key: StandingsViewKey; label: string; }

const STANDINGS_VIEW_OPTIONS: Record<string, StandingsViewOption[]> = {
  nfl:               [{ key: 'division', label: 'Division' }, { key: 'conference', label: 'Conference' }, { key: 'league', label: 'League' }],
  nba:               [{ key: 'conference', label: 'Conference' }, { key: 'league', label: 'League' }],
  nhl:               [{ key: 'division', label: 'Division' }, { key: 'conference', label: 'Conference' }, { key: 'league', label: 'League' }],
  mlb:               [{ key: 'division', label: 'Division' }, { key: 'conference', label: 'Conference' }, { key: 'league', label: 'League' }],
  'ncaa-football':   [{ key: 'poll', label: 'AP Poll' }],
  'ncaa-basketball': [{ key: 'poll', label: 'AP Poll' }],
  'premier-league':  [{ key: 'league', label: 'Table' }],
  ucl:               [{ key: 'league', label: 'Table' }],
  'world-cup':       [{ key: 'league', label: 'Table' }],
};

// How many wildcard spots per conference (for the WC race section)
const WILDCARD_SPOTS: Record<string, number> = { nfl: 3, nhl: 2, mlb: 3 };

const SPORT_LABELS: Record<string, string> = {
  nfl: 'NFL', nba: 'NBA', mlb: 'MLB', nhl: 'NHL',
  'ncaa-football': 'NCAA Football', 'ncaa-basketball': 'NCAA Basketball',
  'premier-league': 'Premier League', ucl: 'UEFA Champions League',
  'world-cup': 'FIFA World Cup',
};

const ESPN_PATH: Record<string, string> = {
  'premier-league': 'soccer/eng.1',
  ucl:              'soccer/uefa.champions',
  'world-cup':      'soccer/fifa.world',
  nfl:              'football/nfl',
  'ncaa-football':  'football/college-football',
  nba:              'basketball/nba',
  'ncaa-basketball':'basketball/mens-college-basketball',
  nhl:              'hockey/nhl',
  mlb:              'baseball/mlb',
};

const ESPN_STANDINGS_PARAMS: Record<string, Record<string, string>> = {
  'ncaa-football': { group: '80' },
};

// Static division lookup for sports where ESPN's standings API returns only
// conference-level groupings (no division children) during the offseason.
// Keyed by team.displayName as returned by ESPN.
const SPORT_DIVISIONS: Record<string, Record<string, [string, string]>> = {
  nfl: {
    'Buffalo Bills':         ['AFC East',  'AFC'],
    'Miami Dolphins':        ['AFC East',  'AFC'],
    'New England Patriots':  ['AFC East',  'AFC'],
    'New York Jets':         ['AFC East',  'AFC'],
    'Baltimore Ravens':      ['AFC North', 'AFC'],
    'Cincinnati Bengals':    ['AFC North', 'AFC'],
    'Cleveland Browns':      ['AFC North', 'AFC'],
    'Pittsburgh Steelers':   ['AFC North', 'AFC'],
    'Houston Texans':        ['AFC South', 'AFC'],
    'Indianapolis Colts':    ['AFC South', 'AFC'],
    'Jacksonville Jaguars':  ['AFC South', 'AFC'],
    'Tennessee Titans':      ['AFC South', 'AFC'],
    'Denver Broncos':        ['AFC West',  'AFC'],
    'Kansas City Chiefs':    ['AFC West',  'AFC'],
    'Las Vegas Raiders':     ['AFC West',  'AFC'],
    'Los Angeles Chargers':  ['AFC West',  'AFC'],
    'Dallas Cowboys':        ['NFC East',  'NFC'],
    'New York Giants':       ['NFC East',  'NFC'],
    'Philadelphia Eagles':   ['NFC East',  'NFC'],
    'Washington Commanders': ['NFC East',  'NFC'],
    'Chicago Bears':         ['NFC North', 'NFC'],
    'Detroit Lions':         ['NFC North', 'NFC'],
    'Green Bay Packers':     ['NFC North', 'NFC'],
    'Minnesota Vikings':     ['NFC North', 'NFC'],
    'Atlanta Falcons':       ['NFC South', 'NFC'],
    'Carolina Panthers':     ['NFC South', 'NFC'],
    'New Orleans Saints':    ['NFC South', 'NFC'],
    'Tampa Bay Buccaneers':  ['NFC South', 'NFC'],
    'Arizona Cardinals':     ['NFC West',  'NFC'],
    'Los Angeles Rams':      ['NFC West',  'NFC'],
    'Seattle Seahawks':      ['NFC West',  'NFC'],
    'San Francisco 49ers':   ['NFC West',  'NFC'],
  },
  nhl: {
    'Boston Bruins':         ['Atlantic',     'Eastern'],
    'Buffalo Sabres':        ['Atlantic',     'Eastern'],
    'Detroit Red Wings':     ['Atlantic',     'Eastern'],
    'Florida Panthers':      ['Atlantic',     'Eastern'],
    'Montréal Canadiens':    ['Atlantic',     'Eastern'],
    'Montreal Canadiens':    ['Atlantic',     'Eastern'],
    'Ottawa Senators':       ['Atlantic',     'Eastern'],
    'Tampa Bay Lightning':   ['Atlantic',     'Eastern'],
    'Toronto Maple Leafs':   ['Atlantic',     'Eastern'],
    'Carolina Hurricanes':   ['Metropolitan', 'Eastern'],
    'Columbus Blue Jackets': ['Metropolitan', 'Eastern'],
    'New Jersey Devils':     ['Metropolitan', 'Eastern'],
    'New York Islanders':    ['Metropolitan', 'Eastern'],
    'New York Rangers':      ['Metropolitan', 'Eastern'],
    'Philadelphia Flyers':   ['Metropolitan', 'Eastern'],
    'Pittsburgh Penguins':   ['Metropolitan', 'Eastern'],
    'Washington Capitals':   ['Metropolitan', 'Eastern'],
    'Chicago Blackhawks':    ['Central',      'Western'],
    'Colorado Avalanche':    ['Central',      'Western'],
    'Dallas Stars':          ['Central',      'Western'],
    'Minnesota Wild':        ['Central',      'Western'],
    'Nashville Predators':   ['Central',      'Western'],
    'St. Louis Blues':       ['Central',      'Western'],
    'St Louis Blues':        ['Central',      'Western'],
    'Utah Hockey Club':      ['Central',      'Western'],
    'Winnipeg Jets':         ['Central',      'Western'],
    'Anaheim Ducks':         ['Pacific',      'Western'],
    'Calgary Flames':        ['Pacific',      'Western'],
    'Edmonton Oilers':       ['Pacific',      'Western'],
    'Los Angeles Kings':     ['Pacific',      'Western'],
    'San Jose Sharks':       ['Pacific',      'Western'],
    'Seattle Kraken':        ['Pacific',      'Western'],
    'Vancouver Canucks':     ['Pacific',      'Western'],
    'Vegas Golden Knights':  ['Pacific',      'Western'],
  },
  mlb: {
    'Baltimore Orioles':     ['AL East',    'American League'],
    'Boston Red Sox':        ['AL East',    'American League'],
    'New York Yankees':      ['AL East',    'American League'],
    'Tampa Bay Rays':        ['AL East',    'American League'],
    'Toronto Blue Jays':     ['AL East',    'American League'],
    'Chicago White Sox':     ['AL Central', 'American League'],
    'Cleveland Guardians':   ['AL Central', 'American League'],
    'Detroit Tigers':        ['AL Central', 'American League'],
    'Kansas City Royals':    ['AL Central', 'American League'],
    'Minnesota Twins':       ['AL Central', 'American League'],
    'Houston Astros':        ['AL West',    'American League'],
    'Los Angeles Angels':    ['AL West',    'American League'],
    'Oakland Athletics':     ['AL West',    'American League'],
    'Sacramento Athletics':  ['AL West',    'American League'],
    'Athletics':             ['AL West',    'American League'],
    'Seattle Mariners':      ['AL West',    'American League'],
    'Texas Rangers':         ['AL West',    'American League'],
    'Atlanta Braves':        ['NL East',    'National League'],
    'Miami Marlins':         ['NL East',    'National League'],
    'New York Mets':         ['NL East',    'National League'],
    'Philadelphia Phillies': ['NL East',    'National League'],
    'Washington Nationals':  ['NL East',    'National League'],
    'Chicago Cubs':          ['NL Central', 'National League'],
    'Cincinnati Reds':       ['NL Central', 'National League'],
    'Milwaukee Brewers':     ['NL Central', 'National League'],
    'Pittsburgh Pirates':    ['NL Central', 'National League'],
    'St. Louis Cardinals':   ['NL Central', 'National League'],
    'St Louis Cardinals':    ['NL Central', 'National League'],
    'Arizona Diamondbacks':  ['NL West',    'National League'],
    'Colorado Rockies':      ['NL West',    'National League'],
    'Los Angeles Dodgers':   ['NL West',    'National League'],
    'San Diego Padres':      ['NL West',    'National League'],
    'San Francisco Giants':  ['NL West',    'National League'],
  },
};

const SOCCER_LEAGUES = new Set(['premier-league', 'ucl', 'world-cup']);

const RESULT_COLORS = {
  W: 'bg-positive text-white',
  L: 'bg-danger text-white',
  D: 'bg-warn text-white',
};

function formatDate(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function getStat(stats: any[], name: string): number {
  return stats.find((s: any) => s.name === name || s.abbreviation === name)?.value ?? 0;
}

function sortFn(a: StandingEntry, b: StandingEntry, isSoccer: boolean) {
  if (isSoccer) return (b.points ?? 0) - (a.points ?? 0) || (b.pointDiff ?? 0) - (a.pointDiff ?? 0);
  return (b.pct ?? 0) - (a.pct ?? 0) || b.wins - a.wins;
}

// Walk the ESPN standings tree, tagging each entry with conf/div ancestry
function parseEspnTree(root: any, isSoccer: boolean): ParsedTeamRow[] {
  const rows: ParsedTeamRow[] = [];
  const seen = new Set<string>();

  function walk(node: any, ancestors: { name: string; abbr: string }[]) {
    // Recurse into children FIRST so deeper (division-level) entries win over
    // duplicate entries that ESPN also includes at the conference level.
    for (const child of node.children ?? []) {
      walk(child, [...ancestors, { name: child.name ?? '', abbr: child.abbreviation ?? '' }]);
    }
    for (const e of node.standings?.entries ?? []) {
      const team = e.team ?? {};
      const teamId = String(team.id ?? '');
      if (!teamId || seen.has(teamId)) continue;
      seen.add(teamId);
      const stats: any[] = e.stats ?? [];
      const wins = getStat(stats, 'wins');
      const losses = getStat(stats, 'losses');
      const draws = isSoccer ? getStat(stats, 'ties') : 0;
      const gp = getStat(stats, 'gamesPlayed') || (wins + losses + draws);
      const pts = isSoccer ? (getStat(stats, 'points') || null) : null;
      const pct = !isSoccer ? (getStat(stats, 'winPercent') || (gp > 0 ? wins / gp : 0)) : null;
      const diff = getStat(stats, 'pointDifferential') || getStat(stats, 'differential') || null;
      rows.push({
        teamId,
        teamName: team.displayName ?? team.shortDisplayName ?? team.name ?? teamId,
        logoUrl: team.logos?.[0]?.href ?? null,
        wins, losses, draws, gamesPlayed: gp,
        points: pts, pct, pointDiff: diff || null,
        confName: ancestors[0]?.name ?? '',
        confAbbr: ancestors[0]?.abbr ?? '',
        divName:  ancestors[1]?.name ?? ancestors[0]?.name ?? '',
        divAbbr:  ancestors[1]?.abbr ?? ancestors[0]?.abbr ?? '',
      });
    }
  }

  walk(root, []);
  return rows;
}

function groupRowsBy(rows: ParsedTeamRow[], field: 'confName' | 'divName'): { name: string; rows: ParsedTeamRow[] }[] {
  const map = new Map<string, ParsedTeamRow[]>();
  for (const row of rows) {
    const key = row[field];
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(row);
  }
  return [...map.entries()].map(([name, rows]) => ({ name, rows }));
}

function buildGroups(rows: ParsedTeamRow[], view: StandingsViewKey, sport: string, isSoccer: boolean): StandingGroup[] {
  const hasDivisions = rows.some(r => r.divName && r.divName !== r.confName);
  const hasConfs = rows.some(r => r.confName);

  if (view === 'league' || !hasConfs) {
    return [{ name: '', entries: [...rows].sort((a, b) => sortFn(a, b, isSoccer)) }];
  }

  if (view === 'conference' || (!hasDivisions && view === 'division')) {
    return groupRowsBy(rows, 'confName').map(({ name, rows: cr }) => ({
      name,
      entries: [...cr].sort((a, b) => sortFn(a, b, isSoccer)),
    }));
  }

  // Division view — with optional wildcard race sections
  const wildcardSpots = WILDCARD_SPOTS[sport] ?? 0;
  const result: StandingGroup[] = [];

  for (const { name: confName, rows: confRows } of groupRowsBy(rows, 'confName')) {
    // Division sub-groups (use ESPN's original ordering)
    for (const { name: divName, rows: divRows } of groupRowsBy(confRows, 'divName')) {
      result.push({ name: divName, entries: divRows });
    }

    // Wildcard race section
    if (wildcardSpots > 0) {
      // Division leaders = 1st place (by record) in each division
      const divLeaderIds = new Set<string>();
      for (const { rows: divRows } of groupRowsBy(confRows, 'divName')) {
        const sorted = [...divRows].sort((a, b) => sortFn(a, b, false));
        if (sorted[0]) divLeaderIds.add(sorted[0].teamId);
      }
      const wcRace = confRows
        .filter(t => !divLeaderIds.has(t.teamId))
        .sort((a, b) => sortFn(a, b, false));
      result.push({
        name: confName ? `${confName} Wild Card` : 'Wild Card Race',
        entries: wcRace,
        isWildcard: true,
      });
    }
  }

  return result;
}

async function fetchStandingsRows(sportLeagueId: string): Promise<ParsedTeamRow[]> {
  const espnPath = ESPN_PATH[sportLeagueId];
  if (!espnPath) return [];
  const extra = ESPN_STANDINGS_PARAMS[sportLeagueId] ?? {};
  const query = new URLSearchParams(extra).toString();
  const isSoccer = SOCCER_LEAGUES.has(sportLeagueId);
  try {
    const res = await fetch(`https://site.api.espn.com/apis/v2/sports/${espnPath}/standings${query ? `?${query}` : ''}`);
    if (!res.ok) return [];
    const data = await res.json();
    let rows = parseEspnTree(data, isSoccer);

    // ESPN's standings API only returns conference-level groupings during the offseason;
    // fill in division info from the static lookup table when the tree has no divisions.
    if (!isSoccer && rows.length > 0 && !rows.some(r => r.divName !== r.confName)) {
      const divLookup = SPORT_DIVISIONS[sportLeagueId];
      if (divLookup) {
        rows = rows.map(r => {
          const d = divLookup[r.teamName];
          return d ? { ...r, divName: d[0], confName: d[1] } : r;
        });
      }
    }

    return rows;
  } catch { return []; }
}

async function fetchApPoll(sportLeagueId: string): Promise<PollEntry[]> {
  const espnPath = ESPN_PATH[sportLeagueId];
  if (!espnPath) return [];
  try {
    const res = await fetch(`https://site.api.espn.com/apis/v2/sports/${espnPath}/rankings`);
    if (!res.ok) return [];
    const data = await res.json();
    const polls: any[] = data.rankings ?? [];
    const apPoll = polls.find((p: any) => /\bap\b/i.test(p.name ?? '')) ?? polls[0];
    if (!apPoll) return [];
    return (apPoll.ranks ?? []).slice(0, 25).map((r: any) => ({
      rank: r.current ?? 0,
      teamId: String(r.team?.id ?? ''),
      teamName: r.team?.displayName ?? r.team?.name ?? '',
      logoUrl: r.team?.logos?.[0]?.href ?? null,
      record: r.recordSummary ?? '',
      points: r.points ?? 0,
      firstPlaceVotes: r.firstPlaceVotes ?? 0,
    }));
  } catch { return []; }
}

async function fetchEspnArticles(espnPath: string, espnTeamId: string): Promise<TeamNews['articles']> {
  try {
    const res = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/${espnPath}/news?teams=${espnTeamId}&limit=10`,
    );
    if (!res.ok) return [];
    const data = await res.json();
    const raw = (data.articles ?? data.feed ?? []) as any[];
    const teamIdNum = Number(espnTeamId);
    const teamArticles = raw.filter((a: any) =>
      (a.categories ?? []).some(
        (c: any) => c.type === 'team' && (c.id === teamIdNum || c.teamId === teamIdNum),
      ),
    );
    return teamArticles.slice(0, 5).map((a: any) => ({
      title:     a.headline ?? a.title ?? '',
      summary:   a.description ?? a.story ?? '',
      published: a.published ?? a.lastModified ?? '',
      url:       a.links?.web?.href ?? a.links?.mobile?.href ?? a.link ?? '',
    })).filter((a: any) => a.title);
  } catch { return []; }
}

async function fetchTeamNews(teamId: string, sportLeagueId: string | undefined): Promise<TeamNews> {
  const empty: TeamNews = { articles: [] };
  if (!sportLeagueId || /_m\d+$/.test(teamId)) return empty;
  const espnPath = ESPN_PATH[sportLeagueId];
  const espnTeamId = teamId.split('_').pop();
  if (!espnPath || !espnTeamId || isNaN(Number(espnTeamId))) return empty;
  const articles = await fetchEspnArticles(espnPath, espnTeamId);
  return { articles };
}

function AuctionBreakdownList({ rows }: { rows: AuctionBreakdownRow[] }) {
  return (
    <div className="border-t border-line/50 divide-y divide-line/30">
      {rows.map(r => {
        const year = r.completedAt ? new Date(r.completedAt).getFullYear() : null;
        return (
          <div key={r.leagueId} className={`flex items-center gap-3 px-5 py-2.5 ${r.excluded ? 'opacity-50' : ''}`}>
            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${r.excluded ? 'bg-copy-3' : 'bg-positive'}`} />
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-medium truncate ${r.excluded ? 'line-through text-copy-3' : 'text-copy'}`}>
                {r.leagueName}
              </p>
              {year && <p className="text-[10px] text-copy-3">{year}</p>}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {r.excluded && (
                <span className="text-[10px] text-copy-3 bg-field border border-line px-1.5 py-0.5 rounded-full">excluded</span>
              )}
              <span className={`text-xs font-semibold tabular-nums ${r.excluded ? 'text-copy-3' : 'text-copy'}`}>
                ${r.price}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export function TeamProfileModal() {
  const { profile, closeProfile } = useTeamProfile();
  const [activeTab, setActiveTab] = useState<'overview' | 'standings'>('overview');

  const [form, setForm] = useState<FormResult[] | null>(null);
  const [auctionStats, setAuctionStats] = useState<AuctionStats | null>(null);
  const [rosterStats, setRosterStats] = useState<RosterStats | null>(null);
  const [news, setNews] = useState<TeamNews | null>(null);
  const [loadingForm, setLoadingForm] = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);
  const [loadingRosterStats, setLoadingRosterStats] = useState(false);
  const [loadingNews, setLoadingNews] = useState(false);
  const [auctionBreakdownOpen, setAuctionBreakdownOpen] = useState(false);

  const [parsedRows, setParsedRows] = useState<ParsedTeamRow[] | null>(null);
  const [pollData, setPollData] = useState<PollEntry[] | null>(null);
  const [loadingStandings, setLoadingStandings] = useState(false);
  const [standingsView, setStandingsView] = useState<StandingsViewKey>('league');

  const panelRef = useRef<HTMLDivElement>(null);

  // Reset + fetch overview data whenever a new profile opens
  useEffect(() => {
    if (!profile) {
      setForm(null); setAuctionStats(null); setRosterStats(null); setNews(null);
      setParsedRows(null); setPollData(null); setActiveTab('overview');
      setAuctionBreakdownOpen(false);
      return;
    }

    setForm(null); setAuctionStats(null); setRosterStats(null); setNews(null);
    setParsedRows(null); setPollData(null); setActiveTab('overview');
    setAuctionBreakdownOpen(false);

    // Reset standings view to the default for this sport
    const viewOpts = STANDINGS_VIEW_OPTIONS[profile.sportLeagueId ?? ''] ?? [];
    setStandingsView(viewOpts[0]?.key ?? 'league');

    setLoadingForm(true);
    api.get<FormResult[]>(`/sports/teams/${profile.teamId}/form`)
      .then(setForm).catch(() => setForm([])).finally(() => setLoadingForm(false));

    setLoadingStats(true);
    const leagueQ = profile.leagueId ? `?leagueId=${profile.leagueId}` : '';
    api.get<AuctionStats>(`/sports/teams/${profile.teamId}/auction-stats${leagueQ}`)
      .then(setAuctionStats).catch(() => setAuctionStats(null)).finally(() => setLoadingStats(false));

    if (profile.sportLeagueId) {
      setLoadingRosterStats(true);
      api.get<RosterStats>(`/sports/teams/${profile.teamId}/roster-stats?sportLeagueId=${profile.sportLeagueId}`)
        .then(setRosterStats).catch(() => setRosterStats(null)).finally(() => setLoadingRosterStats(false));
    }

    setLoadingNews(true);
    fetchTeamNews(profile.teamId, profile.sportLeagueId)
      .then(setNews).catch(() => setNews(null)).finally(() => setLoadingNews(false));
  }, [profile?.teamId]);

  // Lazy-load standings when the tab first opens
  useEffect(() => {
    if (activeTab !== 'standings' || !profile?.sportLeagueId) return;
    if (parsedRows !== null || pollData !== null) return;
    const sport = profile.sportLeagueId;
    const isPoll = STANDINGS_VIEW_OPTIONS[sport]?.[0]?.key === 'poll';

    setLoadingStandings(true);
    if (isPoll) {
      fetchApPoll(sport)
        .then(setPollData).catch(() => setPollData([]))
        .finally(() => setLoadingStandings(false));
    } else {
      fetchStandingsRows(sport)
        .then(setParsedRows).catch(() => setParsedRows([]))
        .finally(() => setLoadingStandings(false));
    }
  }, [activeTab, profile?.sportLeagueId]);

  // Keyboard close
  useEffect(() => {
    if (!profile) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeProfile(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [profile, closeProfile]);

  function handleBackdrop(e: React.MouseEvent) {
    if (!panelRef.current?.contains(e.target as Node)) closeProfile();
  }

  const isOpen = !!profile;
  const isSoccer = SOCCER_LEAGUES.has(profile?.sportLeagueId ?? '');
  const espnTeamId = profile?.teamId.split('_').pop() ?? '';
  const sport = profile?.sportLeagueId ?? '';
  const viewOptions = STANDINGS_VIEW_OPTIONS[sport] ?? [{ key: 'league' as const, label: 'Table' }];
  const wildcardSpots = WILDCARD_SPOTS[sport] ?? 0;

  // Build the groups for the current view
  const standingGroups: StandingGroup[] = parsedRows
    ? buildGroups(parsedRows, standingsView, sport, isSoccer)
    : [];

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={handleBackdrop}
        className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-200 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className={`fixed right-0 top-0 bottom-0 z-50 w-full max-w-sm bg-card border-l border-line shadow-2xl flex flex-col transition-transform duration-300 ease-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-line flex-shrink-0">
          <p className="text-xs font-semibold text-copy-3 uppercase tracking-wider">Team Profile</p>
          <button
            onClick={closeProfile}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-field text-copy-3 hover:text-copy transition-colors"
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {profile && (
          <div className="flex-1 overflow-y-auto flex flex-col">
            {/* Team identity */}
            <div className="px-5 py-5 border-b border-line flex-shrink-0">
              <div className="flex items-center gap-4">
                {profile.logoUrl ? (
                  <img src={profile.logoUrl} alt={profile.name ?? ''} className="w-16 h-16 object-contain flex-shrink-0" />
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-field-2 border border-line flex items-center justify-center text-copy-3 text-lg font-bold flex-shrink-0">
                    {(profile.name ?? '?').slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-copy leading-tight">{profile.name ?? profile.teamId}</h2>
                  {profile.sportLeagueId && (
                    <p className="text-xs text-copy-3 mt-0.5">{SPORT_LABELS[profile.sportLeagueId] ?? profile.sportLeagueId}</p>
                  )}
                  {profile.ownerDisplayName && (
                    <p className="text-xs text-brand mt-1 font-medium">Owner: {profile.ownerDisplayName}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Overview / Standings tab bar */}
            <div className="flex border-b border-line flex-shrink-0">
              {(['overview', 'standings'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-2.5 text-xs font-semibold transition-colors border-b-2 -mb-px ${
                    activeTab === tab ? 'text-brand border-brand' : 'text-copy-3 border-transparent hover:text-copy'
                  }`}
                >
                  {tab === 'overview' ? 'Overview' : 'League Standings'}
                </button>
              ))}
            </div>

            {/* ── Overview tab ── */}
            {activeTab === 'overview' && (
              <div className="flex-1">
                {/* Form */}
                <div className="px-5 py-4 border-b border-line">
                  <p className="text-xs font-semibold text-copy-3 uppercase tracking-wider mb-3">Last 5 Results</p>
                  {loadingForm ? (
                    <div className="flex gap-2">
                      {[...Array(5)].map((_, i) => <div key={i} className="w-8 h-8 rounded-lg bg-field-2 animate-pulse" />)}
                    </div>
                  ) : form && form.length > 0 ? (
                    <div className="space-y-1.5">
                      {form.map((r, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${RESULT_COLORS[r.result]}`}>
                              {r.result}
                            </span>
                            <span className="text-copy-3 truncate">{r.wasHome ? 'vs' : '@'} {r.opponent.shortName || r.opponent.name}</span>
                          </div>
                          <span className="text-copy font-medium ml-2 flex-shrink-0">
                            {r.myScore}–{r.theirScore}
                            <span className="text-copy-3 ml-1.5">{formatDate(r.date)}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : form !== null ? (
                    <p className="text-xs text-copy-3">No completed results yet.</p>
                  ) : null}
                </div>

                {/* Roster presence + trends */}
                {(loadingRosterStats || rosterStats) && (
                  <div className="px-5 py-4 border-b border-line">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-semibold text-copy-3 uppercase tracking-wider">League Presence</p>
                      {!loadingRosterStats && rosterStats?.trend && (
                        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                          rosterStats.trend === 'up'
                            ? 'bg-positive/10 text-positive border border-positive/20'
                            : 'bg-danger/10 text-danger border border-danger/20'
                        }`}>
                          {rosterStats.trend === 'up' ? '↑' : '↓'}
                          {rosterStats.trend === 'up' ? 'Trending' : 'Dropping'}
                        </span>
                      )}
                    </div>
                    {loadingRosterStats ? (
                      <div className="animate-pulse">
                        <div className="h-14 bg-field-2 rounded-xl" />
                      </div>
                    ) : rosterStats ? (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-field rounded-xl px-3 py-2.5">
                          <p className="text-[10px] text-copy-3 mb-1">% Rostered</p>
                          <div className="flex items-baseline gap-1.5">
                            <p className="text-sm font-bold text-copy">
                              {rosterStats.rosteredPct != null ? `${rosterStats.rosteredPct}%` : '—'}
                            </p>
                            {rosterStats.delta30d != null && (
                              <span className={`text-xs font-semibold ${rosterStats.delta30d >= 0 ? 'text-positive' : 'text-danger'}`}>
                                {rosterStats.delta30d >= 0 ? '+' : ''}{rosterStats.delta30d}%
                              </span>
                            )}
                          </div>
                        </div>
                        {(rosterStats.pickups7d > 0 || rosterStats.drops7d > 0) && (
                          <div className="bg-field rounded-xl px-3 py-2.5">
                            <p className="text-[10px] text-copy-3 mb-1">Last 7 days</p>
                            <div className="flex items-center gap-2">
                              {rosterStats.pickups7d > 0 && (
                                <span className="text-xs font-semibold text-positive">+{rosterStats.pickups7d}</span>
                              )}
                              {rosterStats.drops7d > 0 && (
                                <span className="text-xs font-semibold text-danger">−{rosterStats.drops7d}</span>
                              )}
                            </div>
                            <p className="text-[10px] text-copy-3 mt-0.5">adds / drops</p>
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                )}

                {/* League context stats */}
                {(profile.wins != null || profile.draftPrice != null) && (
                  <div className="px-5 py-4 border-b border-line">
                    <div className="grid grid-cols-2 gap-3">
                      {profile.wins != null && (
                        <div className="bg-field rounded-xl px-3 py-2.5">
                          <p className="text-[10px] text-copy-3 mb-1">Record</p>
                          <p className="text-sm font-bold text-copy">{profile.wins}W–{profile.draws ?? 0}D–{profile.losses ?? 0}L</p>
                        </div>
                      )}
                      {profile.points != null && (
                        <div className="bg-field rounded-xl px-3 py-2.5">
                          <p className="text-[10px] text-copy-3 mb-1">Points</p>
                          <p className="text-sm font-bold text-copy">{((profile.points ?? 0) + (profile.bonusPoints ?? 0)).toFixed(1)}</p>
                        </div>
                      )}
                      {profile.draftPrice != null && (
                        <div className="bg-field rounded-xl px-3 py-2.5">
                          <p className="text-[10px] text-copy-3 mb-1">Draft Price</p>
                          <p className="text-sm font-bold text-brand">${profile.draftPrice}</p>
                        </div>
                      )}
                      {loadingStats ? (
                        <div className="bg-field rounded-xl px-3 py-2.5 animate-pulse">
                          <div className="h-2.5 bg-field-2 rounded w-16 mb-1.5" />
                          <div className="h-4 bg-field-2 rounded w-10" />
                        </div>
                      ) : auctionStats?.avgPrice != null && (
                        <div className="bg-field rounded-xl px-3 py-2.5">
                          <p className="text-[10px] text-copy-3 mb-1">Avg. across leagues</p>
                          <p className="text-sm font-bold text-copy">${auctionStats.avgPrice}</p>
                        </div>
                      )}
                    </div>
                    {profile.bonusBreakdown && profile.bonusBreakdown.length > 0 && (
                      <div className="mt-3 border-t border-line/50 pt-3 space-y-1.5">
                        <p className="text-[10px] font-semibold text-copy-3 uppercase tracking-wider mb-2">Bonus Points</p>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-copy-3">Season pts</span>
                          <span className="text-copy">{(profile.points ?? 0).toFixed(1)}</span>
                        </div>
                        {profile.bonusBreakdown.map((b, i) => (
                          <div key={i} className="flex items-center justify-between text-xs">
                            <span className="text-positive">{b.label}</span>
                            <span className="text-positive font-semibold">+{b.points.toFixed(1)}</span>
                          </div>
                        ))}
                        <div className="flex items-center justify-between text-xs pt-1.5 border-t border-line/50">
                          <span className="text-copy-3">Total</span>
                          <span className="text-copy font-semibold">{((profile.points ?? 0) + (profile.bonusPoints ?? 0)).toFixed(1)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Global auction stats */}
                {profile.draftPrice == null && (
                  <div className="border-b border-line">
                    <div className="px-5 py-4">
                      <p className="text-xs font-semibold text-copy-3 uppercase tracking-wider mb-3">Auction History</p>
                      {loadingStats ? (
                        <div className="space-y-2 animate-pulse">
                          <div className="h-4 bg-field-2 rounded w-32" />
                          <div className="h-4 bg-field-2 rounded w-24" />
                        </div>
                      ) : auctionStats ? (
                        <>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="bg-field rounded-xl px-3 py-2.5">
                              <p className="text-[10px] text-copy-3 mb-1">Avg. draft price</p>
                              <p className="text-sm font-bold text-copy">{auctionStats.avgPrice != null ? `$${auctionStats.avgPrice}` : '—'}</p>
                            </div>
                            <div className="bg-field rounded-xl px-3 py-2.5">
                              <p className="text-[10px] text-copy-3 mb-1">Draft Price</p>
                              <p className="text-sm font-bold text-brand">{auctionStats.leaguePrice != null ? `$${auctionStats.leaguePrice}` : '—'}</p>
                            </div>
                          </div>
                          {auctionStats.breakdown.length > 0 && (
                            <button
                              onClick={() => setAuctionBreakdownOpen(o => !o)}
                              className="mt-3 flex items-center gap-1.5 text-xs text-copy-3 hover:text-copy transition-colors"
                            >
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className={`transition-transform ${auctionBreakdownOpen ? 'rotate-90' : ''}`}>
                                <polyline points="9 18 15 12 9 6" />
                              </svg>
                              {auctionBreakdownOpen ? 'Hide' : 'Show'} breakdown ({auctionStats.breakdown.length} {auctionStats.breakdown.length === 1 ? 'league' : 'leagues'})
                            </button>
                          )}
                        </>
                      ) : null}
                    </div>
                    {auctionBreakdownOpen && auctionStats && auctionStats.breakdown.length > 0 && (
                      <AuctionBreakdownList rows={auctionStats.breakdown} />
                    )}
                  </div>
                )}

                {profile.draftPrice != null && auctionStats && !loadingStats && (auctionStats.breakdown.length > 0) && (
                  <div className="border-b border-line">
                    <button
                      onClick={() => setAuctionBreakdownOpen(o => !o)}
                      className="w-full flex items-center justify-between px-5 py-3 hover:bg-field/30 transition-colors text-left"
                    >
                      <p className="text-xs text-copy-3">
                        Drafted in <span className="text-copy font-medium">{auctionStats.leaguesDrafted}</span>{' '}
                        {auctionStats.leaguesDrafted === 1 ? 'league' : 'leagues'} (included)
                        {auctionStats.avgPrice != null && <> · avg <span className="text-copy font-medium">${auctionStats.avgPrice}</span></>}
                      </p>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className={`text-copy-3 transition-transform flex-shrink-0 ml-2 ${auctionBreakdownOpen ? 'rotate-90' : ''}`}>
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </button>
                    {auctionBreakdownOpen && (
                      <AuctionBreakdownList rows={auctionStats.breakdown} />
                    )}
                  </div>
                )}

                {/* News */}
                {(loadingNews || (news?.articles && news.articles.length > 0)) && (
                  <div className="px-5 py-4">
                    <p className="text-xs font-semibold text-copy-3 uppercase tracking-wider mb-3">Latest News</p>
                    {loadingNews && !news ? (
                      <div className="space-y-3 animate-pulse">
                        {[...Array(3)].map((_, i) => (
                          <div key={i} className="space-y-1.5">
                            <div className="h-3.5 bg-field-2 rounded w-4/5" />
                            <div className="h-3 bg-field-2 rounded w-full" />
                            <div className="h-3 bg-field-2 rounded w-2/3" />
                          </div>
                        ))}
                      </div>
                    ) : news?.articles && news.articles.length > 0 ? (
                      <div className="space-y-3">
                        {news.articles.map((a, i) => (
                          <div key={i} className="border-b border-line/40 pb-3 last:border-0 last:pb-0">
                            {a.url ? (
                              <a href={a.url} target="_blank" rel="noopener noreferrer"
                                className="text-xs font-semibold text-copy hover:text-brand transition-colors leading-snug block mb-1">
                                {a.title}
                              </a>
                            ) : (
                              <p className="text-xs font-semibold text-copy leading-snug mb-1">{a.title}</p>
                            )}
                            {a.summary && <p className="text-xs text-copy-3 leading-relaxed line-clamp-2">{a.summary}</p>}
                            {a.published && (
                              <p className="text-[10px] text-copy-3/60 mt-1">
                                {new Date(a.published).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            )}

            {/* ── League Standings tab ── */}
            {activeTab === 'standings' && (
              <div className="flex-1 flex flex-col">
                {/* View selector — only shown when multiple views exist */}
                {viewOptions.length > 1 && (
                  <div className="flex gap-1 px-4 py-2.5 border-b border-line flex-shrink-0">
                    {viewOptions.map(opt => (
                      <button
                        key={opt.key}
                        onClick={() => setStandingsView(opt.key)}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                          standingsView === opt.key
                            ? 'bg-brand text-white'
                            : 'bg-field text-copy-3 hover:text-copy'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}

                {loadingStandings ? (
                  <div className="px-5 py-6 space-y-3">
                    {[...Array(8)].map((_, i) => (
                      <div key={i} className="flex items-center gap-3 animate-pulse">
                        <div className="w-4 h-3 bg-field-2 rounded flex-shrink-0" />
                        <div className="w-7 h-7 bg-field-2 rounded-full flex-shrink-0" />
                        <div className="flex-1 h-3 bg-field-2 rounded" />
                        <div className="w-12 h-3 bg-field-2 rounded flex-shrink-0" />
                      </div>
                    ))}
                  </div>

                ) : standingsView === 'poll' && pollData !== null ? (
                  /* ── AP Poll ── */
                  <div>
                    <div className="flex items-center gap-2 px-4 py-2 border-b border-line bg-field/30">
                      <span className="w-6 text-[10px] text-copy-3 text-center flex-shrink-0">Rk</span>
                      <span className="flex-1 text-[10px] text-copy-3 ml-8">Team</span>
                      <span className="w-12 text-[10px] text-copy-3 text-right flex-shrink-0">Record</span>
                      <span className="w-10 text-[10px] text-copy-3 text-right flex-shrink-0">Pts</span>
                    </div>
                    <div className="divide-y divide-line/30">
                      {pollData.length === 0 ? (
                        <p className="px-5 py-8 text-center text-sm text-copy-3">Poll not available right now.</p>
                      ) : pollData.map(p => {
                        const isThis = p.teamId === espnTeamId;
                        return (
                          <div key={p.rank} className={`flex items-center gap-2 px-4 py-2 ${isThis ? 'bg-brand-dim/30' : ''}`}>
                            <span className={`w-6 text-xs font-bold text-center flex-shrink-0 ${isThis ? 'text-brand' : 'text-copy-3'}`}>
                              {p.rank}
                            </span>
                            {p.logoUrl ? (
                              <img src={p.logoUrl} alt={p.teamName} className="w-6 h-6 object-contain flex-shrink-0" />
                            ) : (
                              <div className="w-6 h-6 rounded-full bg-field-2 flex-shrink-0" />
                            )}
                            <span className={`flex-1 text-xs truncate ${isThis ? 'text-brand font-semibold' : 'text-copy'}`}>
                              {p.teamName}
                            </span>
                            <span className="w-12 text-[10px] text-right text-copy-3 flex-shrink-0 tabular-nums">{p.record}</span>
                            <span className={`w-10 text-xs font-semibold text-right flex-shrink-0 tabular-nums ${isThis ? 'text-brand' : 'text-copy-2'}`}>
                              {p.points.toLocaleString()}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                ) : standingGroups.length > 0 ? (
                  /* ── Grouped / flat standings ── */
                  <div>
                    {/* Column headers */}
                    <div className="flex items-center gap-2 px-4 py-2 border-b border-line bg-field/30">
                      <span className="w-5 text-[10px] text-copy-3 text-right flex-shrink-0">#</span>
                      <span className="flex-1 text-[10px] text-copy-3 ml-9">Team</span>
                      <span className="w-14 text-[10px] text-copy-3 text-right flex-shrink-0">
                        {isSoccer ? 'W-L-D' : 'W-L'}
                      </span>
                      {isSoccer
                        ? <span className="w-8 text-[10px] text-copy-3 text-right flex-shrink-0">Pts</span>
                        : <span className="w-8 text-[10px] text-copy-3 text-right flex-shrink-0">PCT</span>
                      }
                    </div>

                    {standingGroups.map((group, gi) => (
                      <div key={gi}>
                        {/* Group header (shown when the group has a name) */}
                        {group.name && (
                          <div className={`px-4 py-1.5 flex items-center gap-2 ${
                            group.isWildcard
                              ? 'bg-warn-bg/40 border-y border-warn/20'
                              : 'bg-field/50 border-y border-line/40'
                          }`}>
                            {group.isWildcard && (
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-warn flex-shrink-0">
                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                              </svg>
                            )}
                            <span className={`text-[10px] font-bold uppercase tracking-wider ${group.isWildcard ? 'text-warn' : 'text-copy-3'}`}>
                              {group.name}
                            </span>
                          </div>
                        )}

                        {/* Rows */}
                        <div className="divide-y divide-line/30">
                          {group.entries.map((s, idx) => {
                            const isThis = s.teamId === espnTeamId;
                            const isWcSpot = group.isWildcard && idx < wildcardSpots;
                            return (
                              <div
                                key={s.teamId}
                                className={`flex items-center gap-2 px-4 py-2 ${
                                  isThis ? 'bg-brand-dim/30' : isWcSpot ? 'bg-positive-bg/10' : ''
                                }`}
                              >
                                <span className={`w-5 text-[10px] text-right flex-shrink-0 ${isThis ? 'text-brand font-bold' : 'text-copy-3'}`}>
                                  {group.isWildcard
                                    ? (isWcSpot ? <span className="text-positive font-bold">✓</span> : '–')
                                    : idx + 1
                                  }
                                </span>
                                {s.logoUrl ? (
                                  <img src={s.logoUrl} alt={s.teamName} className="w-6 h-6 object-contain flex-shrink-0" />
                                ) : (
                                  <div className="w-6 h-6 rounded-full bg-field-2 flex-shrink-0" />
                                )}
                                <span className={`flex-1 text-xs truncate ${isThis ? 'text-brand font-semibold' : 'text-copy'}`}>
                                  {s.teamName}
                                </span>
                                <span className={`w-14 text-xs text-right flex-shrink-0 tabular-nums ${isThis ? 'text-brand font-semibold' : 'text-copy-2'}`}>
                                  {s.wins}-{s.losses}{isSoccer ? `-${s.draws}` : ''}
                                </span>
                                {isSoccer ? (
                                  <span className={`w-8 text-xs font-semibold text-right flex-shrink-0 tabular-nums ${isThis ? 'text-brand' : 'text-copy'}`}>
                                    {s.points ?? '—'}
                                  </span>
                                ) : (
                                  <span className={`w-8 text-xs text-right flex-shrink-0 tabular-nums ${isThis ? 'text-brand font-semibold' : 'text-copy-2'}`}>
                                    {s.pct != null ? s.pct.toFixed(3).replace(/^0/, '') : '—'}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>

                ) : parsedRows !== null || pollData !== null ? (
                  <div className="px-5 py-10 text-center">
                    <p className="text-copy-3 text-sm">No standings available.</p>
                    <p className="text-xs text-copy-3/60 mt-1">Check back during the active season.</p>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
