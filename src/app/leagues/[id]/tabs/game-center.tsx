'use client';

import { SPORT_ORDER, formatLeagueName } from '../_components';
import type { ScoreboardGame } from '../_types';

function TeamRow({ logo, name, shortName, score, isOwned }: {
  logo: string | null; name: string; shortName: string;
  score: string | null; isOwned: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        {logo ? (
          <img src={logo} alt={name} className="w-7 h-7 object-contain flex-shrink-0" />
        ) : (
          <div className="w-7 h-7 rounded bg-field-2 border border-line flex items-center justify-center text-xs font-bold text-copy-3 flex-shrink-0">
            {shortName?.slice(0, 2).toUpperCase() ?? '?'}
          </div>
        )}
        <span className={`text-sm truncate ${isOwned ? 'font-semibold text-copy' : 'text-copy-2'}`}>{name}</span>
      </div>
      {score !== null && (
        <span className={`text-sm font-bold tabular-nums flex-shrink-0 ${isOwned ? 'text-copy' : 'text-copy-2'}`}>{score}</span>
      )}
    </div>
  );
}

function GameCard({ game, isMyHome, isMyAway }: { game: ScoreboardGame; isMyHome: boolean; isMyAway: boolean; }) {
  const isOwned = isMyHome || isMyAway;
  return (
    <div className={`bg-card border rounded-xl overflow-hidden ${isOwned ? 'border-brand/40' : 'border-line'}`}>
      <div className={`flex items-center justify-between px-3 py-1.5 border-b ${isOwned ? 'border-brand/20 bg-brand-dim/30' : 'border-line bg-field/30'}`}>
        <div className="flex items-center gap-1.5">
          {game.isLive && (
            <span className="relative flex h-2 w-2 flex-shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-positive opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-positive" />
            </span>
          )}
          <span className={`text-xs font-medium ${game.isLive ? 'text-positive' : 'text-copy-3'}`}>
            {game.statusDisplay || '—'}
          </span>
        </div>
        {isOwned && (
          <span className="text-xs font-semibold" style={{ color: '#f59e0b' }}>★ Owned</span>
        )}
      </div>
      <div className="px-3 py-3 space-y-2.5">
        <TeamRow logo={game.awayLogo} name={game.awayName} shortName={game.awayShortName} score={game.awayScore} isOwned={isMyAway} />
        <TeamRow logo={game.homeLogo} name={game.homeName} shortName={game.homeShortName} score={game.homeScore} isOwned={isMyHome} />
      </div>
    </div>
  );
}

function GameCenterTab({ games, myOwnedTeamIds }: {
  games: ScoreboardGame[];
  myOwnedTeamIds: Set<string>;
}) {
  if (games.length === 0) {
    return (
      <div className="text-center py-16 border border-dashed border-line rounded-2xl">
        <p className="text-copy-3 text-sm">No games scheduled for today.</p>
        <p className="text-copy-3/60 text-xs mt-1">Check back during the regular season.</p>
      </div>
    );
  }

  const bySport = new Map<string, ScoreboardGame[]>();
  for (const g of games) {
    if (!bySport.has(g.sportLeagueId)) bySport.set(g.sportLeagueId, []);
    bySport.get(g.sportLeagueId)!.push(g);
  }

  const sports = [...bySport.keys()].sort((a, b) => {
    const ai = SPORT_ORDER.indexOf(a);
    const bi = SPORT_ORDER.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  function sortGames(gs: ScoreboardGame[]) {
    return [...gs].sort((a, b) => {
      const aOwned = myOwnedTeamIds.has(a.homeTeamId) || myOwnedTeamIds.has(a.awayTeamId) ? 0 : 1;
      const bOwned = myOwnedTeamIds.has(b.homeTeamId) || myOwnedTeamIds.has(b.awayTeamId) ? 0 : 1;
      if (aOwned !== bOwned) return aOwned - bOwned;
      const statusRank = (g: ScoreboardGame) => g.isLive ? 0 : !g.isFinished ? 1 : 2;
      if (statusRank(a) !== statusRank(b)) return statusRank(a) - statusRank(b);
      return a.scheduledAt.localeCompare(b.scheduledAt);
    });
  }

  return (
    <div className="space-y-6">
      {sports.map(sport => {
        const sportGames = sortGames(bySport.get(sport)!);
        return (
          <div key={sport}>
            <h2 className="text-xs font-semibold text-copy-3 uppercase tracking-widest mb-3">
              {formatLeagueName(sport)}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {sportGames.map(game => (
                <GameCard
                  key={game.eventId}
                  game={game}
                  isMyHome={myOwnedTeamIds.has(game.homeTeamId)}
                  isMyAway={myOwnedTeamIds.has(game.awayTeamId)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export { GameCenterTab };
