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

interface AuctionStats {
  avgPrice: number | null;
  leaguesDrafted: number;
  leaguePrice: number | null;
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
  points: number | null;   // league points (soccer)
  pct: number | null;      // win pct (American sports)
  pointDiff: number | null; // goal/point differential
}

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

// Extra ESPN query params for standings (e.g. group=80 for NCAAF FBS)
const ESPN_STANDINGS_PARAMS: Record<string, Record<string, string>> = {
  'ncaa-football': { group: '80' },
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
  } catch {
    return [];
  }
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

function extractStandingEntries(node: any): any[] {
  const entries: any[] = [];
  if (node?.standings?.entries) entries.push(...node.standings.entries);
  if (Array.isArray(node?.children)) {
    for (const child of node.children) entries.push(...extractStandingEntries(child));
  }
  return entries;
}

function getStat(stats: any[], name: string): number {
  return stats.find((s: any) => s.name === name || s.abbreviation === name)?.value ?? 0;
}

async function fetchLeagueStandings(sportLeagueId: string): Promise<StandingEntry[]> {
  const espnPath = ESPN_PATH[sportLeagueId];
  if (!espnPath) return [];
  const extraParams = ESPN_STANDINGS_PARAMS[sportLeagueId] ?? {};
  const query = new URLSearchParams({ ...extraParams }).toString();
  try {
    const res = await fetch(
      `https://site.api.espn.com/apis/v2/sports/${espnPath}/standings${query ? `?${query}` : ''}`,
    );
    if (!res.ok) return [];
    const data = await res.json();
    const rawEntries = extractStandingEntries(data);
    const isSoccer = SOCCER_LEAGUES.has(sportLeagueId);

    const seen = new Set<string>();
    const entries: StandingEntry[] = [];
    for (const e of rawEntries) {
      const team = e.team ?? {};
      const teamId = String(team.id ?? '');
      if (!teamId || seen.has(teamId)) continue;
      seen.add(teamId);
      const stats: any[] = e.stats ?? [];
      const logoUrl = team.logos?.[0]?.href ?? null;
      const wins = getStat(stats, 'wins');
      const losses = getStat(stats, 'losses');
      const draws = isSoccer ? getStat(stats, 'ties') : 0;
      const gp = getStat(stats, 'gamesPlayed') || (wins + losses + draws);
      const pts = isSoccer ? (getStat(stats, 'points') || null) : null;
      const pct = !isSoccer ? (getStat(stats, 'winPercent') || (gp > 0 ? wins / gp : 0)) : null;
      const diff = getStat(stats, 'pointDifferential') || getStat(stats, 'differential') || null;
      entries.push({
        teamId,
        teamName: team.displayName ?? team.shortDisplayName ?? team.name ?? teamId,
        logoUrl,
        wins, losses, draws, gamesPlayed: gp,
        points: pts, pct, pointDiff: diff || null,
      });
    }
    // Sort: soccer by points desc, others by win pct desc, then wins desc
    entries.sort((a, b) => {
      if (isSoccer) return (b.points ?? 0) - (a.points ?? 0);
      return (b.pct ?? 0) - (a.pct ?? 0) || b.wins - a.wins;
    });
    return entries;
  } catch {
    return [];
  }
}

export function TeamProfileModal() {
  const { profile, closeProfile } = useTeamProfile();
  const [activeTab, setActiveTab] = useState<'overview' | 'standings'>('overview');
  const [form, setForm] = useState<FormResult[] | null>(null);
  const [auctionStats, setAuctionStats] = useState<AuctionStats | null>(null);
  const [news, setNews] = useState<TeamNews | null>(null);
  const [standings, setStandings] = useState<StandingEntry[] | null>(null);
  const [loadingForm, setLoadingForm] = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);
  const [loadingNews, setLoadingNews] = useState(false);
  const [loadingStandings, setLoadingStandings] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Reset + fetch whenever a new profile is opened
  useEffect(() => {
    if (!profile) {
      setForm(null); setAuctionStats(null); setNews(null);
      setStandings(null); setActiveTab('overview');
      return;
    }

    setForm(null); setAuctionStats(null); setNews(null);
    setStandings(null); setActiveTab('overview');

    setLoadingForm(true);
    api.get<FormResult[]>(`/sports/teams/${profile.teamId}/form`)
      .then(setForm).catch(() => setForm([])).finally(() => setLoadingForm(false));

    setLoadingStats(true);
    const leagueQ = profile.leagueId ? `?leagueId=${profile.leagueId}` : '';
    api.get<AuctionStats>(`/sports/teams/${profile.teamId}/auction-stats${leagueQ}`)
      .then(setAuctionStats).catch(() => setAuctionStats(null)).finally(() => setLoadingStats(false));

    setLoadingNews(true);
    fetchTeamNews(profile.teamId, profile.sportLeagueId)
      .then(setNews).catch(() => setNews(null)).finally(() => setLoadingNews(false));
  }, [profile?.teamId]);

  // Lazy-load standings when the standings tab is first opened
  useEffect(() => {
    if (activeTab !== 'standings' || !profile?.sportLeagueId || standings !== null) return;
    setLoadingStandings(true);
    fetchLeagueStandings(profile.sportLeagueId)
      .then(setStandings).catch(() => setStandings([]))
      .finally(() => setLoadingStandings(false));
  }, [activeTab, profile?.sportLeagueId]);

  // Close on backdrop click
  function handleBackdrop(e: React.MouseEvent) {
    if (!panelRef.current?.contains(e.target as Node)) closeProfile();
  }

  // Close on Escape
  useEffect(() => {
    if (!profile) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeProfile(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [profile, closeProfile]);

  const isOpen = !!profile;
  const isSoccer = SOCCER_LEAGUES.has(profile?.sportLeagueId ?? '');
  // Extract ESPN team ID from the stored teamId (format: "{sportLeagueId}_{espnId}")
  const espnTeamId = profile?.teamId.split('_').pop();

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

            {/* Tab bar */}
            <div className="flex border-b border-line flex-shrink-0">
              {(['overview', 'standings'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-2.5 text-xs font-semibold transition-colors border-b-2 -mb-px ${
                    activeTab === tab
                      ? 'text-brand border-brand'
                      : 'text-copy-3 border-transparent hover:text-copy'
                  }`}
                >
                  {tab === 'overview' ? 'Overview' : 'League Standings'}
                </button>
              ))}
            </div>

            {/* ── Overview tab ── */}
            {activeTab === 'overview' && (
              <div className="flex-1">
                {/* Form — last 5 results */}
                <div className="px-5 py-4 border-b border-line">
                  <p className="text-xs font-semibold text-copy-3 uppercase tracking-wider mb-3">Last 5 Results</p>
                  {loadingForm ? (
                    <div className="flex gap-2">
                      {[...Array(5)].map((_, i) => (
                        <div key={i} className="w-8 h-8 rounded-lg bg-field-2 animate-pulse" />
                      ))}
                    </div>
                  ) : form && form.length > 0 ? (
                    <div className="space-y-1.5">
                      {form.map((r, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${RESULT_COLORS[r.result]}`}>
                              {r.result}
                            </span>
                            <span className="text-copy-3 truncate">
                              {r.wasHome ? 'vs' : '@'} {r.opponent.shortName || r.opponent.name}
                            </span>
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

                {/* League context */}
                {(profile.wins != null || profile.draftPrice != null) && (
                  <div className="px-5 py-4 border-b border-line">
                    <div className="grid grid-cols-2 gap-3">
                      {profile.wins != null && (
                        <div className="bg-field rounded-xl px-3 py-2.5">
                          <p className="text-[10px] text-copy-3 mb-1">Record</p>
                          <p className="text-sm font-bold text-copy">
                            {profile.wins}W–{profile.draws ?? 0}D–{profile.losses ?? 0}L
                          </p>
                        </div>
                      )}
                      {profile.points != null && (
                        <div className="bg-field rounded-xl px-3 py-2.5">
                          <p className="text-[10px] text-copy-3 mb-1">Points</p>
                          <p className="text-sm font-bold text-copy">
                            {((profile.points ?? 0) + (profile.bonusPoints ?? 0)).toFixed(1)}
                          </p>
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

                    {/* Bonus breakdown */}
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
                          <span className="text-copy font-semibold">
                            {((profile.points ?? 0) + (profile.bonusPoints ?? 0)).toFixed(1)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Global auction stats (shown when no league context passed) */}
                {profile.draftPrice == null && (
                  <div className="px-5 py-4 border-b border-line">
                    <p className="text-xs font-semibold text-copy-3 uppercase tracking-wider mb-3">Auction History</p>
                    {loadingStats ? (
                      <div className="space-y-2 animate-pulse">
                        <div className="h-4 bg-field-2 rounded w-32" />
                        <div className="h-4 bg-field-2 rounded w-24" />
                      </div>
                    ) : auctionStats ? (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-field rounded-xl px-3 py-2.5">
                          <p className="text-[10px] text-copy-3 mb-1">Avg. draft price</p>
                          <p className="text-sm font-bold text-copy">
                            {auctionStats.avgPrice != null ? `$${auctionStats.avgPrice}` : '—'}
                          </p>
                        </div>
                        <div className="bg-field rounded-xl px-3 py-2.5">
                          <p className="text-[10px] text-copy-3 mb-1">Draft Price</p>
                          <p className="text-sm font-bold text-brand">
                            {auctionStats.leaguePrice != null ? `$${auctionStats.leaguePrice}` : '—'}
                          </p>
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}

                {/* Standalone auction stats row when league context IS provided */}
                {profile.draftPrice != null && auctionStats && !loadingStats && auctionStats.leaguesDrafted > 0 && (
                  <div className="px-5 py-3 border-b border-line">
                    <p className="text-xs text-copy-3">
                      Drafted in{' '}
                      <span className="text-copy font-medium">{auctionStats.leaguesDrafted}</span>{' '}
                      {auctionStats.leaguesDrafted === 1 ? 'league' : 'leagues'} total
                      {auctionStats.avgPrice != null && (
                        <> · avg <span className="text-copy font-medium">${auctionStats.avgPrice}</span></>
                      )}
                    </p>
                  </div>
                )}

                {/* News articles via ESPN */}
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
                              <a
                                href={a.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs font-semibold text-copy hover:text-brand transition-colors leading-snug block mb-1"
                              >
                                {a.title}
                              </a>
                            ) : (
                              <p className="text-xs font-semibold text-copy leading-snug mb-1">{a.title}</p>
                            )}
                            {a.summary && (
                              <p className="text-xs text-copy-3 leading-relaxed line-clamp-2">{a.summary}</p>
                            )}
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
              <div className="flex-1">
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
                ) : standings && standings.length > 0 ? (
                  <div>
                    {/* Column headers */}
                    <div className="flex items-center gap-2 px-4 py-2 border-b border-line bg-field/30">
                      <span className="w-5 text-[10px] text-copy-3 text-right flex-shrink-0">#</span>
                      <span className="flex-1 text-[10px] text-copy-3 ml-9">Team</span>
                      <span className="w-14 text-[10px] text-copy-3 text-right flex-shrink-0">W-L{isSoccer ? '-D' : ''}</span>
                      {isSoccer
                        ? <span className="w-8 text-[10px] text-copy-3 text-right flex-shrink-0">Pts</span>
                        : <span className="w-8 text-[10px] text-copy-3 text-right flex-shrink-0">PCT</span>
                      }
                    </div>
                    <div className="divide-y divide-line/30">
                      {standings.map((s, idx) => {
                        const isThis = s.teamId === espnTeamId;
                        return (
                          <div
                            key={s.teamId}
                            className={`flex items-center gap-2 px-4 py-2 ${isThis ? 'bg-brand-dim/30' : ''}`}
                          >
                            <span className={`w-5 text-[10px] text-right flex-shrink-0 ${isThis ? 'text-brand font-bold' : 'text-copy-3'}`}>
                              {idx + 1}
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
                ) : (
                  <div className="px-5 py-10 text-center">
                    <p className="text-copy-3 text-sm">No standings available.</p>
                    <p className="text-xs text-copy-3/60 mt-1">Check back during the active season.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
