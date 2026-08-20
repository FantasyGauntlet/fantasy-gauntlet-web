/** Returns the ISO date string (YYYY-MM-DD) of the most recent Tuesday, including today if today is Tuesday. */
export function getMostRecentTuesdayKey(): string {
  const now = new Date();
  // getDay(): 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  const dayOfWeek = now.getDay();
  const daysBackToTuesday = dayOfWeek >= 2 ? dayOfWeek - 2 : dayOfWeek + 5;
  const tuesday = new Date(now);
  tuesday.setDate(now.getDate() - daysBackToTuesday);
  return tuesday.toISOString().slice(0, 10);
}

export interface RankSnapshot {
  prevRanks: Record<string, number>;
  curRanks: Record<string, number>;
  weekOf: string; // ISO date of the Tuesday that started this week
}

/**
 * Loads the stored rank snapshot for a league.
 * - If no snapshot exists, returns {} (no arrows shown yet).
 * - If the snapshot is from a prior week, rolls curRanks → prevRanks and
 *   returns those as the baseline for this week's arrows, then persists the roll.
 * - If the snapshot is from the current week, returns prevRanks as-is.
 *
 * The storage key is `fg_standings_${leagueId}` (shared with standings.tsx).
 */
export function loadPrevRanks(leagueId: string): Record<string, number> {
  const storageKey = `fg_standings_${leagueId}`;
  const weekOf = getMostRecentTuesdayKey();
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
    if (!raw) return {};

    // Migrate old format (pre-Tuesday system): flat { userId: rank } or weekKey-based
    if (typeof raw.weekOf !== 'string') {
      // Could be old { weekKey, prevRanks, curRanks } format — migrate in place
      const prevRanks = raw.curRanks ?? raw.prevRanks ?? {};
      const migrated: RankSnapshot = { prevRanks: {}, curRanks: prevRanks, weekOf };
      try { localStorage.setItem(storageKey, JSON.stringify(migrated)); } catch {}
      return {}; // no prior-week data after migration
    }

    const stored = raw as RankSnapshot;
    if (stored.weekOf !== weekOf) {
      // New week — roll curRanks → prevRanks with the fresh Tuesday key
      const rolled: RankSnapshot = { prevRanks: stored.curRanks ?? {}, curRanks: stored.curRanks ?? {}, weekOf };
      try { localStorage.setItem(storageKey, JSON.stringify(rolled)); } catch {}
      return rolled.prevRanks;
    }

    return stored.prevRanks ?? {};
  } catch { return {}; }
}

/**
 * Persists current ranks into the snapshot for a league.
 * Preserves prevRanks within the same week; only curRanks is updated.
 */
export function saveRankSnapshot(leagueId: string, curRanks: Record<string, number>): void {
  const storageKey = `fg_standings_${leagueId}`;
  const weekOf = getMostRecentTuesdayKey();
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as RankSnapshot | null;
    const snapshot: RankSnapshot = {
      prevRanks: raw?.weekOf === weekOf ? (raw.prevRanks ?? {}) : (raw?.curRanks ?? {}),
      curRanks,
      weekOf,
    };
    localStorage.setItem(storageKey, JSON.stringify(snapshot));
  } catch {}
}
