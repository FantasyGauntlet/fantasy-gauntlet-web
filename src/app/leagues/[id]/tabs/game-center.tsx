'use client';

import { useState } from 'react';
import { SPORT_ORDER, formatLeagueName } from '../_components';
import type { ScoreboardGame } from '../_types';

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatGameTime(scheduledAt: string): string {
  if (!scheduledAt) return '—';
  const d = new Date(scheduledAt);
  if (isNaN(d.getTime())) return '—';
  const now = new Date();
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return time;
  const tomorrow = new Date(now.getTime() + 86_400_000);
  if (d.toDateString() === tomorrow.toDateString()) return `Tomorrow · ${time}`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ` · ${time}`;
}

function formatDateHeader(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00Z`);
  const tomorrowKey = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  if (dateKey === tomorrowKey) return 'Tomorrow';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

// Keep live games always; drop finished games from a previous local date.
function isRelevantGame(g: ScoreboardGame): boolean {
  if (g.isLive || !g.isFinished) return true;
  if (!g.scheduledAt) return true;
  return new Date(g.scheduledAt).toDateString() === new Date().toDateString();
}

function sortGamesByRelevance(gs: ScoreboardGame[], myOwnedTeamIds: Set<string>): ScoreboardGame[] {
  const owned = (g: ScoreboardGame) =>
    myOwnedTeamIds.has(g.homeTeamId) || myOwnedTeamIds.has(g.awayTeamId) ? 0 : 1;
  const rank = (g: ScoreboardGame) => (g.isLive ? 0 : !g.isFinished ? 1 : 2);
  return [...gs].sort((a, b) => {
    if (owned(a) !== owned(b)) return owned(a) - owned(b);
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    return a.scheduledAt.localeCompare(b.scheduledAt);
  });
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function LiveDot() {
  return (
    <span className="relative flex h-1.5 w-1.5 flex-shrink-0">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-positive opacity-75" />
      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-positive" />
    </span>
  );
}

function TeamRow({ logo, name, shortName, score, isOwned, showScore }: {
  logo: string | null; name: string; shortName: string;
  score: string | null; isOwned: boolean; showScore: boolean;
}) {
  const display = name || shortName || '—';
  return (
    <div className={`flex items-center gap-2.5 px-3 py-2 ${isOwned ? 'bg-brand/8 rounded-lg' : ''}`}>
      {logo ? (
        <img src={logo} alt={display} className="w-6 h-6 object-contain flex-shrink-0" />
      ) : (
        <div className="w-6 h-6 rounded bg-field-2 border border-line flex items-center justify-center text-[10px] font-bold text-copy-3 flex-shrink-0">
          {(shortName || name)?.slice(0, 2).toUpperCase() ?? '?'}
        </div>
      )}
      <span className={`text-sm truncate flex-1 ${isOwned ? 'font-semibold text-copy' : 'text-copy-2'}`}>
        {display}
      </span>
      {showScore && (
        <span className={`text-sm font-bold tabular-nums flex-shrink-0 min-w-[1.25rem] text-right ${isOwned ? 'text-copy' : 'text-copy-2'}`}>
          {score ?? '—'}
        </span>
      )}
    </div>
  );
}

function GameCard({ game, isMyHome, isMyAway, showSport = false }: {
  game: ScoreboardGame; isMyHome: boolean; isMyAway: boolean; showSport?: boolean;
}) {
  const isOwned = isMyHome || isMyAway;
  const showScore = game.isLive || game.isFinished;

  return (
    <div className={`bg-card border rounded-xl overflow-hidden ${isOwned ? 'border-brand/40' : 'border-line'}`}>
      <div className={`flex items-center justify-between px-3 py-1.5 border-b text-xs ${
        isOwned ? 'border-brand/20 bg-brand/5' : 'border-line bg-field/40'
      }`}>
        <div className="flex items-center gap-1.5">
          {game.isLive && <LiveDot />}
          <span className={`font-medium ${game.isLive ? 'text-positive' : 'text-copy-3'}`}>
            {game.isLive
              ? (game.statusDisplay || 'Live')
              : game.isFinished
              ? 'Final'
              : formatGameTime(game.scheduledAt)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {showSport && (
            <span className="text-copy-3/70 font-medium">{formatLeagueName(game.sportLeagueId)}</span>
          )}
          {isOwned && <span className="font-bold text-brand text-[11px]">★ YOURS</span>}
        </div>
      </div>
      <div className="py-1.5 space-y-0.5">
        <TeamRow
          logo={game.awayLogo} name={game.awayName} shortName={game.awayShortName}
          score={game.awayScore} isOwned={isMyAway} showScore={showScore}
        />
        <TeamRow
          logo={game.homeLogo} name={game.homeName} shortName={game.homeShortName}
          score={game.homeScore} isOwned={isMyHome} showScore={showScore}
        />
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

function GameCenterTab({ games: rawGames, schedule, selectedSports, myOwnedTeamIds }: {
  games: ScoreboardGame[];
  schedule: ScoreboardGame[];
  selectedSports: string[];
  myOwnedTeamIds: Set<string>;
}) {
  const [expandedSports, setExpandedSports] = useState<Set<string>>(new Set());

  const games = rawGames.filter(isRelevantGame);

  function toggleSport(sport: string) {
    setExpandedSports(prev => {
      const next = new Set(prev);
      if (next.has(sport)) next.delete(sport); else next.add(sport);
      return next;
    });
  }

  const myGames = games.filter(g =>
    myOwnedTeamIds.has(g.homeTeamId) || myOwnedTeamIds.has(g.awayTeamId)
  );
  const myLiveCount  = myGames.filter(g => g.isLive).length;
  const allLiveCount = games.filter(g => g.isLive).length;

  // All sports to show: union of selectedSports + sports that have games today
  const allSports = [...new Set([
    ...selectedSports,
    ...games.map(g => g.sportLeagueId),
  ])].sort((a, b) => {
    const ai = SPORT_ORDER.indexOf(a), bi = SPORT_ORDER.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  const hasContent = games.length > 0 || schedule.length > 0 || selectedSports.length > 0;

  if (!hasContent) {
    return (
      <div className="text-center py-16 border border-dashed border-line rounded-2xl">
        <p className="text-copy-2 font-medium text-sm">No games found</p>
        <p className="text-copy-3 text-xs mt-1">Check back when the season is underway.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">

      {/* ── Your Teams Today ── */}
      <section>
        <div className="flex items-center gap-2.5 mb-3">
          <h2 className="text-xs font-semibold text-copy-3 uppercase tracking-widest">Your Teams Today</h2>
          {myLiveCount > 0 && (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-positive">
              <LiveDot /> {myLiveCount} live
            </span>
          )}
        </div>

        {myGames.length === 0 ? (
          <div className="bg-card border border-line rounded-xl px-4 py-5 text-center">
            <p className="text-copy-3 text-sm">None of your teams play today.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {myGames.map(g => (
              <GameCard
                key={g.eventId} game={g}
                isMyHome={myOwnedTeamIds.has(g.homeTeamId)}
                isMyAway={myOwnedTeamIds.has(g.awayTeamId)}
                showSport
              />
            ))}
          </div>
        )}
      </section>

      {/* ── All Leagues ── */}
      <section>
        <div className="flex items-center gap-2.5 mb-4">
          <h2 className="text-xs font-semibold text-copy-3 uppercase tracking-widest">All Leagues</h2>
          {games.length > 0 && (
            <span className="text-[11px] text-copy-3/60">{games.length} today</span>
          )}
          {allLiveCount > 0 && (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-positive">
              <LiveDot /> {allLiveCount} live
            </span>
          )}
        </div>

        <div className="space-y-6">
          {allSports.map(sport => {
            const todaySportGames = sortGamesByRelevance(
              games.filter(g => g.sportLeagueId === sport),
              myOwnedTeamIds,
            );
            const upcomingSportGames = schedule
              .filter(g => g.sportLeagueId === sport)
              .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));

            const ownedTodayGames = todaySportGames.filter(g =>
              myOwnedTeamIds.has(g.homeTeamId) || myOwnedTeamIds.has(g.awayTeamId)
            );
            const ownedUpcomingGames = upcomingSportGames.filter(g =>
              myOwnedTeamIds.has(g.homeTeamId) || myOwnedTeamIds.has(g.awayTeamId)
            );

            // Default collapsed view: today's owned games, or the single next upcoming owned game
            const ownedDefaultGames = ownedTodayGames.length > 0
              ? ownedTodayGames
              : ownedUpcomingGames.slice(0, 1);

            const isExpanded = expandedSports.has(sport);
            const totalCount = todaySportGames.length + upcomingSportGames.length;

            // Group upcoming games by date for expanded view
            const upcomingByDate = new Map<string, ScoreboardGame[]>();
            for (const g of upcomingSportGames) {
              const dateKey = g.scheduledAt.slice(0, 10);
              if (!upcomingByDate.has(dateKey)) upcomingByDate.set(dateKey, []);
              upcomingByDate.get(dateKey)!.push(g);
            }

            const liveCount = todaySportGames.filter(g => g.isLive).length;

            return (
              <div key={sport}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-semibold text-copy-3 uppercase tracking-wide">
                      {formatLeagueName(sport)}
                    </h3>
                    {totalCount > 0 && (
                      <span className="text-[11px] text-copy-3/60">
                        {todaySportGames.length > 0 && `${todaySportGames.length} today`}
                        {todaySportGames.length > 0 && upcomingSportGames.length > 0 && ' · '}
                        {upcomingSportGames.length > 0 && `${upcomingSportGames.length} upcoming`}
                      </span>
                    )}
                    {liveCount > 0 && (
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-positive">
                        <LiveDot /> {liveCount} live
                      </span>
                    )}
                  </div>
                  {totalCount > 0 && (
                    <button
                      onClick={() => toggleSport(sport)}
                      className="text-[11px] font-medium text-brand hover:text-brand-2 transition-colors flex-shrink-0"
                    >
                      {isExpanded ? 'Show less' : `Full schedule`}
                    </button>
                  )}
                </div>

                {!isExpanded ? (
                  // Collapsed: show owned team games only
                  ownedDefaultGames.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                      {ownedDefaultGames.map(g => (
                        <GameCard
                          key={g.eventId} game={g}
                          isMyHome={myOwnedTeamIds.has(g.homeTeamId)}
                          isMyAway={myOwnedTeamIds.has(g.awayTeamId)}
                        />
                      ))}
                    </div>
                  ) : totalCount > 0 ? (
                    <div className="bg-card border border-line rounded-xl px-4 py-3 text-center">
                      <p className="text-copy-3 text-sm">You don't own any teams in this league.</p>
                      <button
                        onClick={() => toggleSport(sport)}
                        className="text-[11px] text-brand mt-1 hover:underline"
                      >
                        View full schedule
                      </button>
                    </div>
                  ) : (
                    <div className="bg-card border border-line rounded-xl px-4 py-3 text-center">
                      <p className="text-copy-3 text-sm">No schedule available yet.</p>
                    </div>
                  )
                ) : (
                  // Expanded: all today's games + upcoming grouped by date
                  <div className="space-y-4">
                    {todaySportGames.length > 0 && (
                      <div>
                        <p className="text-[11px] font-semibold text-copy-3 uppercase tracking-wide mb-2">Today</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                          {todaySportGames.map(g => (
                            <GameCard
                              key={g.eventId} game={g}
                              isMyHome={myOwnedTeamIds.has(g.homeTeamId)}
                              isMyAway={myOwnedTeamIds.has(g.awayTeamId)}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    {[...upcomingByDate.entries()].map(([dateKey, dateGames]) => (
                      <div key={dateKey}>
                        <p className="text-[11px] font-semibold text-copy-3 uppercase tracking-wide mb-2">
                          {formatDateHeader(dateKey)}
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                          {dateGames.map(g => (
                            <GameCard
                              key={g.eventId} game={g}
                              isMyHome={myOwnedTeamIds.has(g.homeTeamId)}
                              isMyAway={myOwnedTeamIds.has(g.awayTeamId)}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                    {todaySportGames.length === 0 && upcomingByDate.size === 0 && (
                      <div className="bg-card border border-line rounded-xl px-4 py-3 text-center">
                        <p className="text-copy-3 text-sm">No schedule available yet.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

    </div>
  );
}

export { GameCenterTab };
