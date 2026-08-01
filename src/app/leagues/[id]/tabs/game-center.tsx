'use client';

import { SPORT_ORDER, formatLeagueName } from '../_components';
import type { ScoreboardGame } from '../_types';

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatGameTime(scheduledAt: string): string {
  if (!scheduledAt) return '—';
  const d = new Date(scheduledAt);
  const now = new Date();
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return time;
  const tomorrow = new Date(now.getTime() + 86_400_000);
  if (d.toDateString() === tomorrow.toDateString()) return `Tomorrow · ${time}`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ` · ${time}`;
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
      {/* Card header: status left, sport+owned badge right */}
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
      {/* Teams */}
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

function GameCenterTab({ games, myOwnedTeamIds }: {
  games: ScoreboardGame[];
  myOwnedTeamIds: Set<string>;
}) {
  if (games.length === 0) {
    return (
      <div className="text-center py-16 border border-dashed border-line rounded-2xl">
        <p className="text-copy-2 font-medium text-sm">No games today</p>
        <p className="text-copy-3 text-xs mt-1">Check back when the season is underway.</p>
      </div>
    );
  }

  const myGames = games.filter(g =>
    myOwnedTeamIds.has(g.homeTeamId) || myOwnedTeamIds.has(g.awayTeamId)
  );
  const myLiveCount  = myGames.filter(g => g.isLive).length;
  const allLiveCount = games.filter(g => g.isLive).length;

  // Group all games by sport, preserve sort order
  const bySport = new Map<string, ScoreboardGame[]>();
  for (const g of games) {
    if (!bySport.has(g.sportLeagueId)) bySport.set(g.sportLeagueId, []);
    bySport.get(g.sportLeagueId)!.push(g);
  }
  const sports = [...bySport.keys()].sort((a, b) => {
    const ai = SPORT_ORDER.indexOf(a), bi = SPORT_ORDER.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

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

      {/* ── All Games ── */}
      <section>
        <div className="flex items-center gap-2.5 mb-4">
          <h2 className="text-xs font-semibold text-copy-3 uppercase tracking-widest">All Games</h2>
          <span className="text-[11px] text-copy-3/60">{games.length} today</span>
          {allLiveCount > 0 && (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-positive">
              <LiveDot /> {allLiveCount} live
            </span>
          )}
        </div>

        <div className="space-y-6">
          {sports.map(sport => {
            const sportGames = sortGamesByRelevance(bySport.get(sport)!, myOwnedTeamIds);
            const ownedCount = sportGames.filter(g =>
              myOwnedTeamIds.has(g.homeTeamId) || myOwnedTeamIds.has(g.awayTeamId)
            ).length;
            return (
              <div key={sport}>
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-xs font-semibold text-copy-3 uppercase tracking-wide">
                    {formatLeagueName(sport)}
                  </h3>
                  <span className="text-[11px] text-copy-3/60">
                    {sportGames.length} game{sportGames.length !== 1 ? 's' : ''}
                  </span>
                  {ownedCount > 0 && (
                    <span className="text-[11px] font-semibold text-brand">{ownedCount} owned</span>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {sportGames.map(g => (
                    <GameCard
                      key={g.eventId} game={g}
                      isMyHome={myOwnedTeamIds.has(g.homeTeamId)}
                      isMyAway={myOwnedTeamIds.has(g.awayTeamId)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

    </div>
  );
}

export { GameCenterTab };
