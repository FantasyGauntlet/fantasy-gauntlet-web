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
}

interface TeamNews {
  description: string | null;
  articles: { title: string; summary: string; published: string; url: string }[];
}

const SPORT_LABELS: Record<string, string> = {
  nfl: 'NFL', nba: 'NBA', mlb: 'MLB', nhl: 'NHL',
  'ncaa-football': 'NCAA Football', 'ncaa-basketball': 'NCAA Basketball',
  'premier-league': 'Premier League', ucl: 'UEFA Champions League',
  'world-cup': 'FIFA World Cup',
};

const RESULT_COLORS = {
  W: 'bg-positive text-white',
  L: 'bg-danger text-white',
  D: 'bg-warn text-white',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function TeamProfileModal() {
  const { profile, closeProfile } = useTeamProfile();
  const [form, setForm] = useState<FormResult[] | null>(null);
  const [auctionStats, setAuctionStats] = useState<AuctionStats | null>(null);
  const [news, setNews] = useState<TeamNews | null>(null);
  const [loadingForm, setLoadingForm] = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);
  const [loadingNews, setLoadingNews] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Reset + fetch whenever a new profile is opened
  useEffect(() => {
    if (!profile) { setForm(null); setAuctionStats(null); setNews(null); return; }

    setForm(null);
    setAuctionStats(null);
    setNews(null);

    setLoadingForm(true);
    api.get<FormResult[]>(`/sports/teams/${profile.teamId}/form`)
      .then(setForm).catch(() => setForm([])).finally(() => setLoadingForm(false));

    setLoadingStats(true);
    api.get<AuctionStats>(`/sports/teams/${profile.teamId}/auction-stats`)
      .then(setAuctionStats).catch(() => setAuctionStats(null)).finally(() => setLoadingStats(false));

    setLoadingNews(true);
    api.get<TeamNews>(`/sports/teams/${profile.teamId}/news`)
      .then(setNews).catch(() => setNews(null)).finally(() => setLoadingNews(false));
  }, [profile?.teamId]);

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
          <div className="flex-1 overflow-y-auto">
            {/* Team identity */}
            <div className="px-5 py-5 border-b border-line">
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
                <div className="space-y-2">
                  <div className="flex gap-1.5">
                    {form.map((r, i) => (
                      <div
                        key={i}
                        title={`${r.wasHome ? 'vs' : '@'} ${r.opponent.name}: ${r.myScore}–${r.theirScore}`}
                        className={`w-8 h-8 rounded-lg text-xs font-bold flex items-center justify-center flex-shrink-0 ${RESULT_COLORS[r.result]}`}
                      >
                        {r.result}
                      </div>
                    ))}
                  </div>
                  <div className="space-y-1.5 mt-3">
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
                </div>
              ) : form !== null ? (
                <p className="text-xs text-copy-3">No completed results yet.</p>
              ) : null}
            </div>

            {/* League context */}
            {(profile.wins != null || profile.draftPrice != null) && (
              <div className="px-5 py-4 border-b border-line">
                <p className="text-xs font-semibold text-copy-3 uppercase tracking-wider mb-3">This League</p>
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
                      <p className="text-[10px] text-copy-3 mb-1">Times drafted</p>
                      <p className="text-sm font-bold text-copy">{auctionStats.leaguesDrafted}</p>
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

            {/* Description (soccer via TheSportsDB) */}
            {(loadingNews || news?.description) && (
              <div className="px-5 py-4 border-b border-line">
                <p className="text-xs font-semibold text-copy-3 uppercase tracking-wider mb-2">About</p>
                {loadingNews && !news ? (
                  <div className="space-y-1.5 animate-pulse">
                    <div className="h-3 bg-field-2 rounded w-full" />
                    <div className="h-3 bg-field-2 rounded w-5/6" />
                    <div className="h-3 bg-field-2 rounded w-4/6" />
                  </div>
                ) : news?.description ? (
                  <p className="text-xs text-copy-2 leading-relaxed">{news.description}</p>
                ) : null}
              </div>
            )}

            {/* News articles (American sports via ESPN) */}
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
      </div>
    </>
  );
}
