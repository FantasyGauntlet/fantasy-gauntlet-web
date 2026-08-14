'use client';

import { useState } from 'react';
import { SPORT_ORDER, formatLeagueName } from '../_components';
import type { FantasyTeam, ScoreboardGame } from '../_types';

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatMatchTime(scheduledAt: string): string {
  if (!scheduledAt) return 'TBD';
  const d = new Date(scheduledAt);
  if (isNaN(d.getTime())) return 'TBD';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function formatGameTime(scheduledAt: string): string {
  if (!scheduledAt) return 'TBD';
  const d = new Date(scheduledAt);
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 86_400_000);
  if (isNaN(d.getTime())) {
    const fallback = new Date(`${scheduledAt.slice(0, 10)}T12:00:00Z`);
    if (isNaN(fallback.getTime())) return 'TBD';
    if (fallback.toDateString() === now.toDateString()) return 'Today';
    if (fallback.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
    return fallback.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return time;
  if (d.toDateString() === tomorrow.toDateString()) return `Tomorrow · ${time}`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ` · ${time}`;
}

function formatDateHeader(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00Z`);
  const tomorrowKey = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  if (dateKey === tomorrowKey) return 'Tomorrow';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

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
    if (!a.scheduledAt || !b.scheduledAt) return 0;
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

function TeamLogo({ logo, name, shortName }: { logo: string | null; name: string; shortName: string }) {
  return logo ? (
    <img src={logo} alt="" className="w-5 h-5 object-contain flex-shrink-0" />
  ) : (
    <div className="w-5 h-5 rounded bg-field-2 border border-line/60 flex items-center justify-center text-[9px] font-bold text-copy-3 flex-shrink-0">
      {(shortName || name)?.slice(0, 2).toUpperCase() ?? '?'}
    </div>
  );
}

// ESPN-style compact row for the "All Leagues" list view
function MatchRow({ game, isMyHome, isMyAway }: {
  game: ScoreboardGame; isMyHome: boolean; isMyAway: boolean;
}) {
  const isOwned = isMyHome || isMyAway;
  const showScore = game.isLive || game.isFinished;

  return (
    <div className={`flex items-center gap-1.5 sm:gap-2 px-3 py-2.5 border-b border-line/40 last:border-0 ${isOwned ? 'bg-brand/5' : ''}`}>
      {/* Away team */}
      <div className={`flex items-center gap-1.5 flex-1 min-w-0 ${isMyAway ? 'font-semibold text-copy' : 'text-copy-2'}`}>
        <TeamLogo logo={game.awayLogo} name={game.awayName} shortName={game.awayShortName} />
        <span className="text-sm truncate">{game.awayShortName || game.awayName}</span>
        {showScore && game.awayScore != null && (
          <span className={`text-sm font-bold tabular-nums ml-auto pl-1 flex-shrink-0 ${isMyAway ? 'text-copy' : 'text-copy-3'}`}>
            {game.awayScore}
          </span>
        )}
      </div>

      <span className="text-[10px] text-copy-3/40 flex-shrink-0">@</span>

      {/* Home team */}
      <div className={`flex items-center gap-1.5 flex-1 min-w-0 ${isMyHome ? 'font-semibold text-copy' : 'text-copy-2'}`}>
        <TeamLogo logo={game.homeLogo} name={game.homeName} shortName={game.homeShortName} />
        <span className="text-sm truncate">{game.homeShortName || game.homeName}</span>
        {showScore && game.homeScore != null && (
          <span className={`text-sm font-bold tabular-nums ml-auto pl-1 flex-shrink-0 ${isMyHome ? 'text-copy' : 'text-copy-3'}`}>
            {game.homeScore}
          </span>
        )}
      </div>

      {/* Status */}
      <div className="flex-shrink-0 text-right w-14 sm:w-16">
        {game.isLive ? (
          <div className="flex items-center justify-end gap-1">
            <LiveDot />
            <span className="text-positive font-bold text-[11px]">{game.statusDisplay || 'LIVE'}</span>
          </div>
        ) : game.isFinished ? (
          <span className="text-[11px] text-copy-3">Final</span>
        ) : (
          <span className="text-[11px] text-copy-3">{formatMatchTime(game.scheduledAt)}</span>
        )}
      </div>

      {isOwned && <span className="text-brand text-[11px] flex-shrink-0">★</span>}
    </div>
  );
}

function MatchList({ games, viewingTeamIds }: { games: ScoreboardGame[]; viewingTeamIds: Set<string> }) {
  return (
    <div className="rounded-xl border border-line overflow-hidden bg-card">
      {games.map(g => (
        <MatchRow
          key={g.eventId} game={g}
          isMyHome={viewingTeamIds.has(g.homeTeamId)}
          isMyAway={viewingTeamIds.has(g.awayTeamId)}
        />
      ))}
    </div>
  );
}

// Card-style for "Your Teams Today"
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

function SkeletonCard() {
  return (
    <div className="bg-card border border-line rounded-xl overflow-hidden animate-pulse">
      <div className="h-8 bg-field/60 border-b border-line" />
      <div className="py-2 px-3 space-y-2">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded bg-field-2 flex-shrink-0" />
          <div className="h-4 bg-field-2 rounded flex-1" />
        </div>
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded bg-field-2 flex-shrink-0" />
          <div className="h-4 bg-field-2 rounded flex-1 max-w-[60%]" />
        </div>
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-2 px-3 py-3 border-b border-line/40 last:border-0 animate-pulse">
      <div className="w-5 h-5 rounded bg-field-2 flex-shrink-0" />
      <div className="h-3.5 bg-field-2 rounded flex-1" />
      <span className="text-[10px] text-transparent mx-0.5">@</span>
      <div className="w-5 h-5 rounded bg-field-2 flex-shrink-0" />
      <div className="h-3.5 bg-field-2 rounded flex-1 max-w-[40%]" />
      <div className="h-3 w-10 bg-field-2 rounded flex-shrink-0 ml-2" />
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

function GameCenterTab({
  games: rawGames,
  schedule,
  selectedSports,
  myOwnedTeamIds,
  allLeagueTeamIds,
  loading = false,
  fantasyTeams = [],
  userId = '',
}: {
  games: ScoreboardGame[];
  schedule: ScoreboardGame[];
  selectedSports: string[];
  myOwnedTeamIds: Set<string>;
  allLeagueTeamIds: Set<string>;
  loading?: boolean;
  fantasyTeams?: FantasyTeam[];
  userId?: string;
}) {
  const [expandedSports, setExpandedSports] = useState<Set<string>>(new Set());
  const [viewingFtId, setViewingFtId] = useState<string>('__me__');

  const viewingTeamIds: Set<string> = viewingFtId === '__me__'
    ? myOwnedTeamIds
    : new Set(fantasyTeams.find(ft => ft.id === viewingFtId)?.ownedTeamIds ?? []);

  const viewingLabel = viewingFtId === '__me__'
    ? 'My Teams'
    : (fantasyTeams.find(ft => ft.id === viewingFtId)?.displayName ?? 'Their Teams');

  const otherManagers = fantasyTeams.filter(ft =>
    ft.userId !== userId && !ft.isPlaceholder
  );

  const games = rawGames.filter(isRelevantGame);

  function toggleSport(sport: string) {
    setExpandedSports(prev => {
      const next = new Set(prev);
      if (next.has(sport)) next.delete(sport); else next.add(sport);
      return next;
    });
  }

  const myGames = games.filter(g =>
    viewingTeamIds.has(g.homeTeamId) || viewingTeamIds.has(g.awayTeamId)
  );
  const myLiveCount  = myGames.filter(g => g.isLive).length;
  const allLiveCount = games.filter(g => g.isLive).length;

  const allSports = [...new Set([
    ...selectedSports,
    ...games.map(g => g.sportLeagueId),
    ...schedule.map(g => g.sportLeagueId),
  ])].sort((a, b) => {
    const ai = SPORT_ORDER.indexOf(a), bi = SPORT_ORDER.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  const hasContent = games.length > 0 || schedule.length > 0 || selectedSports.length > 0;

  if (loading && !hasContent) {
    return (
      <div className="space-y-8">
        <section>
          <div className="h-3 w-28 bg-field-2 rounded animate-pulse mb-3" />
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
          </div>
        </section>
        <section>
          <div className="h-3 w-20 bg-field-2 rounded animate-pulse mb-3" />
          <div className="rounded-xl border border-line overflow-hidden bg-card">
            {[1, 2, 3, 4, 5].map(i => <SkeletonRow key={i} />)}
          </div>
        </section>
      </div>
    );
  }

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
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <h2 className="text-xs font-semibold text-copy-3 uppercase tracking-widest">
              {viewingFtId === '__me__' ? 'Your Teams Today' : `${viewingLabel} Today`}
            </h2>
            {myLiveCount > 0 && (
              <span className="flex items-center gap-1 text-[11px] font-semibold text-positive">
                <LiveDot /> {myLiveCount} live
              </span>
            )}
          </div>

          {otherManagers.length > 0 && (
            <select
              value={viewingFtId}
              onChange={e => setViewingFtId(e.target.value)}
              className="text-xs bg-field border border-line text-copy-2 rounded-lg px-2 py-1 max-w-[140px] truncate"
            >
              <option value="__me__">My Teams</option>
              {otherManagers.map(ft => (
                <option key={ft.id} value={ft.id}>{ft.displayName}</option>
              ))}
            </select>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {[1, 2].map(i => <SkeletonCard key={i} />)}
          </div>
        ) : myGames.length === 0 ? (
          <div className="bg-card border border-line rounded-xl px-4 py-5 text-center">
            <p className="text-copy-3 text-sm">
              {viewingFtId === '__me__' ? 'None of your teams play today.' : `${viewingLabel} have no games today.`}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {myGames.map(g => (
              <GameCard
                key={g.eventId} game={g}
                isMyHome={viewingTeamIds.has(g.homeTeamId)}
                isMyAway={viewingTeamIds.has(g.awayTeamId)}
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
          {allLiveCount > 0 && (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-positive">
              <LiveDot /> {allLiveCount} live
            </span>
          )}
        </div>

        <div className="space-y-5">
          {allSports.map(sport => {
            const todaySportGames = sortGamesByRelevance(
              games.filter(g => g.sportLeagueId === sport),
              viewingTeamIds,
            );
            const upcomingSportGames = schedule
              .filter(g => g.sportLeagueId === sport)
              .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));

            const myUpcomingSportGames = upcomingSportGames.filter(g =>
              viewingTeamIds.has(g.homeTeamId) || viewingTeamIds.has(g.awayTeamId)
            );

            const scheduleByDate = new Map<string, ScoreboardGame[]>();
            for (const g of myUpcomingSportGames) {
              const dateKey = g.scheduledAt.slice(0, 10);
              if (!scheduleByDate.has(dateKey)) scheduleByDate.set(dateKey, []);
              scheduleByDate.get(dateKey)!.push(g);
            }

            const isExpanded = expandedSports.has(sport);
            const hasMySchedule = myUpcomingSportGames.length > 0;
            const liveCount = todaySportGames.filter(g => g.isLive).length;
            const totalCount = todaySportGames.length + upcomingSportGames.length;

            return (
              <div key={sport}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-semibold text-copy-3 uppercase tracking-wide">
                      {formatLeagueName(sport)}
                    </h3>
                    {liveCount > 0 && (
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-positive">
                        <LiveDot /> {liveCount} live
                      </span>
                    )}
                  </div>
                  {hasMySchedule && (
                    <button
                      onClick={() => toggleSport(sport)}
                      className="text-[11px] font-medium text-brand hover:text-brand-2 transition-colors flex-shrink-0"
                    >
                      {isExpanded ? 'Show less ↑' : 'My schedule ↓'}
                    </button>
                  )}
                </div>

                {!isExpanded ? (
                  todaySportGames.length > 0 ? (
                    <MatchList games={todaySportGames} viewingTeamIds={viewingTeamIds} />
                  ) : totalCount > 0 ? (
                    <div className="bg-card border border-line rounded-xl px-4 py-3 text-center">
                      <p className="text-copy-3 text-sm">No games today.</p>
                    </div>
                  ) : (
                    <div className="bg-card border border-line rounded-xl px-4 py-3 text-center">
                      <p className="text-copy-3 text-sm">No schedule available yet.</p>
                    </div>
                  )
                ) : (
                  <div className="space-y-4">
                    {[...scheduleByDate.entries()].map(([dateKey, dateGames]) => (
                      <div key={dateKey}>
                        <p className="text-[11px] font-semibold text-copy-3 uppercase tracking-wide mb-1.5 px-0.5">
                          {formatDateHeader(dateKey)}
                        </p>
                        <MatchList games={dateGames} viewingTeamIds={viewingTeamIds} />
                      </div>
                    ))}
                    {scheduleByDate.size === 0 && (
                      <div className="bg-card border border-line rounded-xl px-4 py-3 text-center">
                        <p className="text-copy-3 text-sm">No upcoming games for your teams in this sport.</p>
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
