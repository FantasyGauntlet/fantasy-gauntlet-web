'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

function prefetchLeague(id: string) {
  api.prefetch([
    `/leagues/${id}`,
    `/leagues/${id}/members`,
    `/leagues/${id}/teams`,
    `/leagues/${id}/standings`,
  ]);
}

interface League {
  id: string;
  name: string;
  sport: string;
  state: string;
  memberCount: number;
  maxMembers: number;
  commissionerId: string;
  selectedSports?: string[];
  startDate?: string;
  endDate?: string;
  myRank?: number | null;
  totalMembers?: number;
  scheduledStartAt?: string | null;
}

interface PendingInvite {
  id: string;
  leagueId: string;
  leagueName: string;
  inviteCode: string;
  fromUserId: string;
  fromDisplayName: string;
  createdAt: string;
  expiresAt: string;
}

interface Announcement {
  id: string;
  title: string;
  body: string;
  imageUrl?: string | null;
  channels: { website: boolean; email: boolean };
  scheduledAt: string | null;
  sentAt: string | null;
  createdAt: string;
}

interface DashStanding {
  userId: string; rank: number; totalPoints: number;
  teamBreakdown: Array<{ teamId: string; teamName: string; sport: string; sportLeagueId: string; points: number; logoUrl?: string | null; formTag?: 'hot' | 'cold' | null; seasonActive?: boolean }>;
}

interface RankHistoryEntry { weekOf: string; ranks: Record<string, number>; }

interface LeagueSummary { myPoints: number | null; rankDelta: number | null; }

interface WaiverActivity {
  id: string; leagueId: string; leagueName: string;
  claimantDisplayName: string;
  addTeamName?: string; addTeamLogoUrl?: string | null;
  dropTeamName?: string; dropTeamLogoUrl?: string | null;
  reviewedAt: string | null; requestedAt: string; status: string;
}

interface BestTeam { teamName: string; sport: string; points: number; formTag: 'hot' | 'cold' | null; logoUrl?: string | null; }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SPORT_ACRONYMS = new Set(['nhl', 'nba', 'nfl', 'mlb', 'ucl', 'ncaa', 'mls', 'fifa', 'ufc']);

function formatSport(id: string) {
  return id.split('-').map(w =>
    SPORT_ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : (w[0]?.toUpperCase() ?? '') + w.slice(1)
  ).join(' ');
}

function formatSeason(start?: string, end?: string): string | null {
  if (!start && !end) return null;
  const fmt = (d: string) => {
    try { return new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', year: '2-digit' }); }
    catch { return d; }
  };
  if (start && end) return `${fmt(start)} – ${fmt(end)}`;
  if (start) return `From ${fmt(start)}`;
  return null;
}

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(diff / 86400000);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function draftCountdown(scheduledStartAt?: string | null): string {
  if (!scheduledStartAt) return 'Draft open';
  const diff = new Date(scheduledStartAt).getTime() - Date.now();
  if (diff <= 0) return 'Draft open';
  const days = Math.floor(diff / 86400000);
  if (days >= 1) return `Starts in ${days}d`;
  const hours = Math.floor(diff / 3600000);
  if (hours >= 1) return `Starts in ${hours}h`;
  const mins = Math.floor(diff / 60000);
  return mins > 0 ? `Starts in ${mins}m` : 'Draft open';
}

const STATE_META: Record<string, { label: string; cls: string }> = {
  draft:     { label: 'Draft',     cls: 'bg-warn-bg text-warn border-warn/20' },
  auction:   { label: 'Draft',     cls: 'bg-info-bg text-info border-info/20' },
  active:    { label: 'Active',    cls: 'bg-brand-dim text-brand border-brand/20' },
  completed: { label: 'Completed', cls: 'bg-field text-copy-3 border-line' },
  cancelled: { label: 'Cancelled', cls: 'bg-danger-bg text-danger border-danger/20' },
};

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-card border border-line rounded-2xl p-5 animate-pulse">
      <div className="flex items-start justify-between mb-3">
        <div className="h-5 bg-field-2 rounded-lg w-40" />
        <div className="h-6 bg-field-2 rounded-full w-16" />
      </div>
      <div className="flex gap-1.5 mb-4">
        <div className="h-5 bg-field-2 rounded-md w-16" />
        <div className="h-5 bg-field-2 rounded-md w-12" />
        <div className="h-5 bg-field-2 rounded-md w-14" />
      </div>
      <div className="flex justify-between">
        <div className="h-3.5 bg-field-2 rounded w-20" />
        <div className="h-3.5 bg-field-2 rounded w-24" />
      </div>
    </div>
  );
}

// ─── League row (compact list view) ──────────────────────────────────────────

function LeagueRow({ league, muted = false, starred = false, onToggleStar }: { league: League; muted?: boolean; starred?: boolean; onToggleStar?: () => void }) {
  const meta = STATE_META[league.state] ?? STATE_META.completed;
  const isDrafting = league.state === 'draft' || league.state === 'auction';
  const countdown = isDrafting ? draftCountdown(league.scheduledStartAt) : null;
  const season = formatSeason(league.startDate, league.endDate);
  return (
    <Link
      href={`/leagues/${league.id}`}
      onMouseEnter={() => prefetchLeague(league.id)}
      className={`group flex items-center gap-3 px-4 py-3 transition-colors ${muted ? 'hover:bg-field/50' : 'hover:bg-card-hover'}`}
    >
      {onToggleStar && (
        <button
          onClick={e => { e.preventDefault(); onToggleStar(); }}
          title={starred ? 'Unstar league' : 'Star league'}
          className={`flex-shrink-0 p-0.5 transition-colors ${starred ? 'text-amber-400 hover:text-amber-300' : 'text-copy-3 opacity-0 group-hover:opacity-100 hover:text-amber-400'}`}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill={starred ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </button>
      )}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span className={`font-semibold text-sm truncate transition-colors ${muted ? 'text-copy-2 group-hover:text-copy' : 'text-copy group-hover:text-brand'}`}>
          {league.name}
        </span>
        {league.myRank != null && league.state === 'active' && (
          <span className="text-[11px] text-copy-3 flex-shrink-0">
            #{league.myRank}{league.totalMembers ? ` / ${league.totalMembers}` : ''}
          </span>
        )}
      </div>
      {/* Right-side columns — each has a fixed width so rows stay aligned */}
      <div className="flex items-center gap-4 flex-shrink-0">
        {/* Status badge */}
        <div className="w-[4.5rem] flex justify-center">
          <span className={`whitespace-nowrap text-xs font-medium px-2 py-0.5 rounded-full border inline-flex items-center gap-1 ${meta.cls}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70 flex-shrink-0" />
            {meta.label}
          </span>
        </div>
        {/* Sport tags */}
        <div className="hidden sm:flex items-center gap-1 w-32">
          {league.selectedSports && league.selectedSports.slice(0, 2).map(s => (
            <span key={s} className="text-[11px] bg-field border border-line text-copy-3 px-1.5 py-0.5 rounded whitespace-nowrap">
              {formatSport(s)}
            </span>
          ))}
          {league.selectedSports && league.selectedSports.length > 2 && (
            <span className="text-[11px] text-copy-3 flex-shrink-0" title={league.selectedSports.slice(2).map(formatSport).join(', ')}>
              +{league.selectedSports.length - 2}
            </span>
          )}
        </div>
        {/* Member count */}
        <div className="hidden sm:flex items-center gap-1 text-xs text-copy-3 w-10 flex-shrink-0">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
          </svg>
          <span className="tabular-nums">{league.memberCount}{league.maxMembers ? ` / ${league.maxMembers}` : ''}</span>
        </div>
        {/* Season / countdown */}
        <div className="hidden sm:block text-xs text-copy-3 w-28 text-right flex-shrink-0">
          {countdown
            ? <span className="text-warn font-medium whitespace-nowrap">{countdown}</span>
            : season
              ? <span className="whitespace-nowrap">{season}</span>
              : null}
        </div>
        {/* Chevron */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-copy-3 flex-shrink-0 opacity-0 group-hover:opacity-60 transition-opacity">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </div>
    </Link>
  );
}

// ─── League card ──────────────────────────────────────────────────────────────

function LeagueCard({ league, muted = false, starred = false, onToggleStar }: { league: League; muted?: boolean; starred?: boolean; onToggleStar?: () => void }) {
  const meta = STATE_META[league.state] ?? STATE_META.completed;
  const season = formatSeason(league.startDate, league.endDate);
  const isDrafting = league.state === 'draft' || league.state === 'auction';
  const countdown = isDrafting ? draftCountdown(league.scheduledStartAt) : null;
  return (
    <Link
      href={`/leagues/${league.id}`}
      onMouseEnter={() => prefetchLeague(league.id)}
      className={`group border rounded-2xl p-5 transition-all block ${
        muted
          ? 'bg-field border-line hover:border-line-2 hover:bg-card'
          : starred
            ? 'bg-card hover:bg-card-hover border-brand/40 hover:border-brand/60'
            : 'bg-card hover:bg-card-hover border-line hover:border-brand/30'
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className={`font-semibold leading-snug transition-colors ${muted ? 'text-copy-2 group-hover:text-copy' : 'text-copy group-hover:text-brand'}`}>
            {league.name}
          </h3>
          {league.myRank != null && league.state === 'active' && (
            <p className="text-[11px] text-copy-3 mt-0.5">
              Rank <span className="font-semibold text-copy-2">#{league.myRank}</span>
              {league.totalMembers ? ` of ${league.totalMembers}` : ''}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {onToggleStar && (
            <button
              onClick={e => { e.preventDefault(); onToggleStar(); }}
              title={starred ? 'Unstar league' : 'Star league'}
              className={`p-0.5 transition-colors ${starred ? 'text-amber-400 hover:text-amber-300' : 'text-copy-3 opacity-0 group-hover:opacity-100 hover:text-amber-400'}`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill={starred ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </button>
          )}
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full border inline-flex items-center gap-1.5 ${meta.cls}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70 flex-shrink-0" />
            {meta.label}
          </span>
        </div>
      </div>
      {league.selectedSports && league.selectedSports.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {league.selectedSports.slice(0, 3).map(s => (
            <span key={s} className="text-xs bg-field border border-line text-copy-3 px-2 py-0.5 rounded-md">
              {formatSport(s)}
            </span>
          ))}
          {league.selectedSports.length > 3 && (
            <span
              className="text-xs text-copy-3 self-center"
              title={league.selectedSports.slice(3).map(formatSport).join(', ')}
            >
              +{league.selectedSports.length - 3}
            </span>
          )}
        </div>
      )}
      <div className="flex items-center justify-between gap-2 text-xs text-copy-3">
        <span className="flex items-center gap-1">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
          </svg>
          {league.memberCount}{league.maxMembers ? ` / ${league.maxMembers}` : ''}
        </span>
        {countdown ? (
          <span className="flex items-center gap-1 text-warn font-medium">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
            </svg>
            {countdown}
          </span>
        ) : season ? (
          <span>{season}</span>
        ) : null}
      </div>
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [acceptingInvite, setAcceptingInvite] = useState<Record<string, boolean>>({});
  const [decliningInvite, setDecliningInvite] = useState<Record<string, boolean>>({});
  const [inviteError, setInviteError] = useState<string | null>(null);

  const [fetchKey, setFetchKey] = useState(0);

  const [leagueSummaries, setLeagueSummaries] = useState<Map<string, LeagueSummary>>(new Map());
  const [recentActivity, setRecentActivity] = useState<WaiverActivity[]>([]);
  const [sportDeadlines, setSportDeadlines] = useState<Record<string, string>>({});
  const [bestTeam, setBestTeam] = useState<BestTeam | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;
    setLoading(true);
    setError('');
    api.get<League[]>('/leagues/mine')
      .then(setLeagues)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
    api.get<PendingInvite[]>('/leagues/invites/mine')
      .then(setPendingInvites)
      .catch(() => {});
  }, [authLoading, user, fetchKey]);

  // Fetch standings summaries + waiver activity for all active leagues
  useEffect(() => {
    if (authLoading || !user) return;
    const active = leagues.filter(l => l.state === 'active');
    if (!active.length) { setLeagueSummaries(new Map()); setRecentActivity([]); setBestTeam(null); return; }

    // Standings: rank delta + points + best team
    Promise.all(
      active.map(league =>
        api.get<{ standings: DashStanding[]; rankHistory: RankHistoryEntry[] }>(`/leagues/${league.id}/standings`)
          .then(({ standings, rankHistory }) => ({ leagueId: league.id, standings, rankHistory }))
          .catch(() => null)
      )
    ).then(results => {
      const map = new Map<string, LeagueSummary>();
      let best: BestTeam | null = null;
      let bestPoints = -1;

      for (const r of results) {
        if (!r) continue;
        const mine = r.standings.find(s => s.userId === user.uid);
        if (!mine) continue;

        let rankDelta: number | null = null;
        if (r.rankHistory.length >= 2) {
          const sorted = [...r.rankHistory].sort((a, b) => b.weekOf.localeCompare(a.weekOf));
          const cur = sorted[0].ranks[user.uid];
          const prev = sorted[1].ranks[user.uid];
          if (cur != null && prev != null) rankDelta = prev - cur;
        }
        map.set(r.leagueId, { myPoints: mine.totalPoints ?? null, rankDelta });

        // Best performing team: prefer hot-tagged, then highest points
        for (const tb of mine.teamBreakdown ?? []) {
          if (tb.seasonActive === false) continue;
          const isHot = tb.formTag === 'hot';
          if (!best || tb.points > bestPoints || (isHot && best.formTag !== 'hot')) {
            bestPoints = tb.points;
            best = { teamName: tb.teamName, sport: tb.sport, points: tb.points, formTag: tb.formTag ?? null, logoUrl: tb.logoUrl ?? null };
          }
        }
      }
      setLeagueSummaries(map);
      setBestTeam(best);
    });

    // Waiver activity across all active leagues
    Promise.all(
      active.map(league =>
        api.get<Array<{ id: string; claimantDisplayName: string; addTeamName?: string; addTeamLogoUrl?: string | null; dropTeamName?: string; dropTeamLogoUrl?: string | null; reviewedAt: string | null; requestedAt: string; status: string }>>(`/leagues/${league.id}/waivers/history`)
          .then(claims => claims.map(c => ({ ...c, leagueId: league.id, leagueName: league.name })))
          .catch(() => [] as WaiverActivity[])
      )
    ).then(results => {
      const all = results.flat()
        .filter(c => c.status === 'approved')
        .sort((a, b) => (b.reviewedAt ?? b.requestedAt).localeCompare(a.reviewedAt ?? a.requestedAt))
        .slice(0, 6);
      setRecentActivity(all);
    });

    // Sport transaction deadlines
    api.get<Record<string, string>>('/sports/deadlines').then(setSportDeadlines).catch(() => {});
  }, [authLoading, user, leagues]);

  async function acceptInvite(invite: PendingInvite) {
    setAcceptingInvite(s => ({ ...s, [invite.id]: true }));
    try {
      await api.post(`/leagues/invites/${invite.inviteCode}/accept`, {});
      setPendingInvites(p => p.filter(i => i.id !== invite.id));
      const updated = await api.get<League[]>('/leagues/mine');
      setLeagues(updated);
    } catch (e: unknown) {
      setInviteError(e instanceof Error ? e.message : 'Failed to accept invite');
    } finally {
      setAcceptingInvite(s => ({ ...s, [invite.id]: false }));
    }
  }

  async function declineInvite(invite: PendingInvite) {
    setDecliningInvite(s => ({ ...s, [invite.id]: true }));
    try {
      await api.post(`/leagues/invites/${invite.inviteCode}/decline`, {});
      setPendingInvites(p => p.filter(i => i.id !== invite.id));
    } catch (e: unknown) {
      setInviteError(e instanceof Error ? e.message : 'Failed to decline invite');
    } finally {
      setDecliningInvite(s => ({ ...s, [invite.id]: false }));
    }
  }

  const firstName = user?.displayName?.split(' ')[0] ?? user?.email?.split('@')[0] ?? 'there';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  // ── Announcements ─────────────────────────────────────────────────────────
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [showChangelog, setShowChangelog] = useState(false);
  const [popupAnn, setPopupAnn] = useState<Announcement | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;
    api.get<Announcement[]>('/announcements').then(list => {
      setAnnouncements(list);
      try {
        const seen: string[] = JSON.parse(localStorage.getItem('fg_seen_announcements') ?? '[]');
        const unseen = list.filter(a => !seen.includes(a.id));
        if (unseen.length > 0) setPopupAnn(unseen[0]);
      } catch { /* ignore */ }
    }).catch(() => {});
  }, [authLoading, user]);

  function dismissPopup() {
    if (!popupAnn) return;
    try {
      const seen: string[] = JSON.parse(localStorage.getItem('fg_seen_announcements') ?? '[]');
      if (!seen.includes(popupAnn.id)) seen.push(popupAnn.id);
      localStorage.setItem('fg_seen_announcements', JSON.stringify(seen));
    } catch { /* ignore */ }
    setPopupAnn(null);
  }

  const [showPast, setShowPast] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    try { return (localStorage.getItem('fg_league_view') as 'grid' | 'list') ?? 'grid'; }
    catch { return 'grid'; }
  });
  const [starred, setStarred] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('fg_starred_leagues') ?? '[]')); }
    catch { return new Set<string>(); }
  });

  function toggleStar(id: string) {
    setStarred(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem('fg_starred_leagues', JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  }

  function switchView(mode: 'grid' | 'list') {
    setViewMode(mode);
    try { localStorage.setItem('fg_league_view', mode); } catch { /* ignore */ }
  }

  const activeLeagues = leagues.filter(l => l.state !== 'completed' && l.state !== 'cancelled');
  const pastLeagues   = leagues.filter(l => l.state === 'completed' || l.state === 'cancelled');
  const sortedActiveLeagues = [
    ...activeLeagues.filter(l => starred.has(l.id)),
    ...activeLeagues.filter(l => !starred.has(l.id)),
  ];
  const activeCount   = leagues.filter(l => l.state === 'active' || l.state === 'auction').length;
  const draftingCount = leagues.filter(l => l.state === 'draft' || l.state === 'auction').length;

  return (
    <div className="space-y-8">
      {/* Announcement popup */}
      {popupAnn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={dismissPopup}>
          <div
            className="bg-card border border-line rounded-2xl p-6 w-full max-w-md shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-brand-dim border border-brand/20 flex items-center justify-center flex-shrink-0">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand">
                    <path d="M22 10v6M2 10l10-5 10 5-10 5z" /><path d="M6 12v5c3 3 9 3 12 0v-5" />
                  </svg>
                </div>
                <span className="text-xs font-semibold text-copy-3 uppercase tracking-widest">What's New</span>
              </div>
              <button onClick={dismissPopup} className="text-copy-3 hover:text-copy transition-colors p-1 -mr-1 -mt-1">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <h2 className="text-lg font-bold text-copy mb-2">{popupAnn.title}</h2>
            <p className="text-sm text-copy-2 leading-relaxed whitespace-pre-wrap mb-4">{popupAnn.body}</p>
            {popupAnn.imageUrl && (
              <img src={popupAnn.imageUrl} alt="" className="w-full rounded-xl border border-line object-contain mb-4 max-h-64" />
            )}
            {popupAnn.sentAt && (
              <p className="text-xs text-copy-3 mb-4">{new Date(popupAnn.sentAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
            )}
            <button
              onClick={dismissPopup}
              className="w-full bg-brand hover:bg-brand-2 text-white font-semibold text-sm py-2.5 rounded-xl transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* Changelog drawer */}
      {showChangelog && (
        <div className="fixed inset-0 z-40 flex" onClick={() => setShowChangelog(false)}>
          <div className="flex-1" />
          <div
            className="w-full max-w-sm bg-card border-l border-line h-full overflow-y-auto shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-card border-b border-line px-5 py-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-copy">Site Updates</h2>
              <button onClick={() => setShowChangelog(false)} className="text-copy-3 hover:text-copy transition-colors">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="p-5 space-y-5">
              {announcements.length === 0 && (
                <p className="text-sm text-copy-3">No updates yet.</p>
              )}
              {announcements.map(a => (
                <div key={a.id} className="border-b border-line pb-5 last:border-0 last:pb-0">
                  <p className="text-xs text-copy-3 mb-1">
                    {a.sentAt
                      ? new Date(a.sentAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                      : new Date(a.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </p>
                  <h3 className="text-sm font-semibold text-copy mb-1">{a.title}</h3>
                  <p className="text-sm text-copy-2 whitespace-pre-wrap leading-relaxed mb-2">{a.body}</p>
                  {a.imageUrl && (
                    <img src={a.imageUrl} alt="" className="w-full rounded-xl border border-line object-contain max-h-48" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-copy-3 text-sm mb-0.5">{greeting}</p>
          <h1 className="text-2xl font-bold text-copy">{firstName}</h1>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {announcements.length > 0 && (
            <button
              onClick={() => setShowChangelog(true)}
              title="Site updates"
              className="relative flex items-center gap-1.5 text-copy-3 hover:text-copy border border-line hover:border-line-2 bg-field hover:bg-card px-3 py-2 rounded-xl transition-colors text-sm"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              <span className="hidden sm:inline text-xs font-medium">What's New</span>
              {(() => {
                try {
                  const seen: string[] = JSON.parse(localStorage.getItem('fg_seen_announcements') ?? '[]');
                  const unseenCount = announcements.filter(a => !seen.includes(a.id)).length;
                  return unseenCount > 0 ? (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-brand text-white text-[10px] font-bold rounded-full flex items-center justify-center">{unseenCount}</span>
                  ) : null;
                } catch { return null; }
              })()}
            </button>
          )}
          <Link
            href="/leagues/new"
            className="flex items-center gap-2 bg-brand hover:bg-brand-2 text-white font-semibold px-4 py-2.5 rounded-xl transition-colors text-sm"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New League
          </Link>
        </div>
      </div>


      {/* This Week */}
      {leagueSummaries.size > 0 && (() => {
        const activeWithRank = activeLeagues.filter(l => l.state === 'active' && l.myRank != null);
        if (!activeWithRank.length) return null;
        return (
          <div className="flex items-center gap-2 overflow-x-auto pb-0.5 -mb-0.5">
            <span className="text-[10px] font-semibold text-copy-3 uppercase tracking-widest flex-shrink-0">This Week</span>
            <div className="w-px h-3 bg-line flex-shrink-0" />
            {activeWithRank.map(league => {
              const summary = leagueSummaries.get(league.id);
              const delta = summary?.rankDelta ?? null;
              return (
                <Link key={league.id} href={`/leagues/${league.id}`}
                  className="group flex items-center gap-1.5 bg-field border border-line hover:border-brand/40 rounded-full px-3 py-1 transition-colors flex-shrink-0"
                >
                  <span className="text-xs text-copy-2 group-hover:text-copy transition-colors truncate max-w-[120px]">{league.name}</span>
                  <span className="text-xs font-bold text-copy tabular-nums">#{league.myRank}</span>
                  {league.totalMembers && <span className="text-[10px] text-copy-3">/{league.totalMembers}</span>}
                  {delta != null && delta !== 0 && (
                    <span className={`text-[10px] font-bold ${delta > 0 ? 'text-positive' : 'text-danger'}`}>
                      {delta > 0 ? '↑' : '↓'}{Math.abs(delta)}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        );
      })()}

      {/* Best performer */}
      {bestTeam && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${bestTeam.formTag === 'hot' ? 'bg-orange-500/5 border-orange-500/20' : 'bg-card border-line'}`}>
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden ${bestTeam.formTag === 'hot' ? 'bg-orange-500/10 border border-orange-500/20' : 'bg-field border border-line'}`}>
            {bestTeam.logoUrl
              ? <img src={bestTeam.logoUrl} alt={bestTeam.teamName} className="w-6 h-6 object-contain" />
              : bestTeam.formTag === 'hot'
                ? <svg width="13" height="13" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-orange-400"><path d="M5 8V2M2 5l3-3 3 3"/></svg>
                : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-copy-3"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-copy truncate">{bestTeam.teamName}</p>
            <p className="text-xs text-copy-3">{bestTeam.formTag === 'hot' ? 'Hot team on your roster' : 'Top scorer on your roster'} · {formatSport(bestTeam.sport)} · {bestTeam.points.toFixed(1)} pts</p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-danger-bg border border-danger/20 rounded-xl p-4 flex items-center justify-between gap-4">
          <p className="text-danger text-sm">Could not load your leagues. Check your connection and try again.</p>
          <button
            onClick={() => setFetchKey(k => k + 1)}
            className="text-xs font-semibold text-danger border border-danger/30 hover:bg-danger hover:text-white px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* Pending invites */}
      {pendingInvites.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-copy-3 uppercase tracking-widest mb-3">
            Pending Invites · {pendingInvites.length}
          </h2>
          {inviteError && (
            <div className="mb-2 bg-danger/10 border border-danger/30 text-danger text-sm rounded-xl px-4 py-3 flex items-center justify-between gap-3">
              <span>{inviteError}</span>
              <button onClick={() => setInviteError(null)} className="flex-shrink-0 text-danger/70 hover:text-danger text-lg leading-none">×</button>
            </div>
          )}
          <div className="space-y-2">
            {pendingInvites.map(invite => {
              const accepting = acceptingInvite[invite.id];
              const declining = decliningInvite[invite.id];
              const busy = accepting || declining;
              const msLeft = new Date(invite.expiresAt).getTime() - Date.now();
              const daysLeft = Math.ceil(msLeft / 86400000);
              const expired = msLeft <= 0;
              return (
                <div key={invite.id} className={`bg-card border rounded-2xl px-5 py-4 flex items-center gap-4 ${expired ? 'border-line opacity-60' : 'border-brand/20'}`}>
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${expired ? 'bg-field border border-line' : 'bg-brand-dim border border-brand/20'}`}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={expired ? 'text-copy-3' : 'text-brand'}>
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                      <polyline points="22,6 12,13 2,6" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-copy truncate">{invite.leagueName}</p>
                    <p className="text-xs text-copy-3 mt-0.5">
                      Invited by {invite.fromDisplayName}
                      <span className="mx-1.5 opacity-40">·</span>
                      {expired ? <span className="text-danger">Expired</span> : `Expires in ${daysLeft}d`}
                    </p>
                  </div>
                  {expired ? (
                    <span className="text-xs text-copy-3 flex-shrink-0">Expired</span>
                  ) : (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => declineInvite(invite)}
                        disabled={busy}
                        className="text-xs font-medium text-copy-3 hover:text-copy px-3 py-1.5 rounded-lg hover:bg-field disabled:opacity-50 transition-colors"
                      >
                        {declining ? 'Declining…' : 'Decline'}
                      </button>
                      <button
                        onClick={() => acceptInvite(invite)}
                        disabled={busy}
                        className="text-xs font-semibold bg-brand hover:bg-brand-2 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg transition-colors"
                      >
                        {accepting ? 'Joining…' : 'Accept'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Upcoming deadlines */}
      {(() => {
        const now = Date.now();
        const endingSoon = activeLeagues.filter(l => {
          if (!l.endDate) return false;
          const days = (new Date(l.endDate + 'T00:00:00').getTime() - now) / 86400000;
          return days > 0 && days <= 30;
        });
        const deadlineItems = Object.entries(sportDeadlines)
          .map(([sport, iso]) => ({ sport, date: new Date(iso), days: Math.ceil((new Date(iso).getTime() - now) / 86400000) }))
          .filter(d => d.days > 0 && d.days <= 10)
          .sort((a, b) => a.date.getTime() - b.date.getTime());

        if (!endingSoon.length && !deadlineItems.length) return null;
        return (
          <div className="bg-warn/5 border border-warn/20 rounded-xl px-4 py-3 space-y-1.5">
            <div className="flex items-center gap-1.5 mb-2">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-warn">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              <span className="text-xs font-semibold text-warn uppercase tracking-widest">Coming Up</span>
            </div>
            {deadlineItems.map(d => (
              <div key={d.sport} className="flex items-center justify-between">
                <span className="text-sm text-copy-2">{formatSport(d.sport)} transaction deadline</span>
                <span className="text-xs font-medium text-warn">{d.days === 1 ? 'Tomorrow' : `${d.days} days`}</span>
              </div>
            ))}
            {endingSoon.map(l => {
              const days = Math.ceil((new Date(l.endDate! + 'T00:00:00').getTime() - now) / 86400000);
              return (
                <Link key={l.id} href={`/leagues/${l.id}`} className="flex items-center justify-between group">
                  <span className="text-sm text-copy-2 group-hover:text-copy transition-colors truncate">{l.name} ends</span>
                  <span className="text-xs font-medium text-warn flex-shrink-0 ml-2">{days === 1 ? 'Tomorrow' : `${days} days`}</span>
                </Link>
              );
            })}
          </div>
        );
      })()}

      {/* League grid */}
      {!error && loading ? (
        <div>
          <div className="h-3.5 bg-field-2 rounded w-20 mb-3 animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}
          </div>
        </div>
      ) : !error && leagues.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-line rounded-2xl">
          <div className="w-14 h-14 rounded-2xl bg-brand-dim border border-brand/20 flex items-center justify-center mx-auto mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-brand">
              <path d="M6 9H4.5a2.5 2.5 0 010-5H6M18 9h1.5a2.5 2.5 0 000-5H18M3 4h18M6 9v10a1 1 0 001 1h10a1 1 0 001-1V9M9 12h6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-copy mb-1">No leagues yet</h2>
          <p className="text-copy-3 text-sm mb-6 max-w-xs mx-auto">Create your first league or ask a commissioner for an invite.</p>
          <Link
            href="/leagues/new"
            className="inline-flex items-center gap-2 bg-brand hover:bg-brand-2 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Create a League
          </Link>
        </div>
      ) : !error ? (
        <div className="space-y-8">
          {/* Active leagues */}
          {activeLeagues.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-semibold text-copy-3 uppercase tracking-widest">My Leagues</h2>
                <div className="flex items-center gap-0.5 bg-field border border-line rounded-lg p-0.5">
                  <button
                    onClick={() => switchView('grid')}
                    title="Grid view"
                    className={`p-1.5 rounded transition-colors ${viewMode === 'grid' ? 'bg-card text-copy shadow-sm' : 'text-copy-3 hover:text-copy-2'}`}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                      <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
                    </svg>
                  </button>
                  <button
                    onClick={() => switchView('list')}
                    title="List view"
                    className={`p-1.5 rounded transition-colors ${viewMode === 'list' ? 'bg-card text-copy shadow-sm' : 'text-copy-3 hover:text-copy-2'}`}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
                      <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
                    </svg>
                  </button>
                </div>
              </div>
              {viewMode === 'grid' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {sortedActiveLeagues.map(league => (
                    <LeagueCard key={league.id} league={league} starred={starred.has(league.id)} onToggleStar={() => toggleStar(league.id)} />
                  ))}
                </div>
              ) : (
                <div className="border border-line rounded-2xl overflow-hidden bg-card divide-y divide-line/40">
                  {sortedActiveLeagues.map(league => (
                    <LeagueRow key={league.id} league={league} starred={starred.has(league.id)} onToggleStar={() => toggleStar(league.id)} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Past seasons */}
          {pastLeagues.length > 0 && (
            <div>
              <button
                onClick={() => setShowPast(v => !v)}
                className="flex items-center gap-2 group mb-3"
              >
                <h2 className="text-xs font-semibold text-copy-3 uppercase tracking-widest group-hover:text-copy-2 transition-colors">
                  Past Seasons
                </h2>
                <span className="text-xs text-copy-3 bg-field border border-line px-1.5 py-0.5 rounded-full group-hover:border-line-2 transition-colors">
                  {pastLeagues.length}
                </span>
                <svg
                  width="12" height="12" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                  className={`text-copy-3 transition-transform ${showPast ? 'rotate-180' : ''}`}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {showPast && (
                viewMode === 'grid' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {pastLeagues.map(league => <LeagueCard key={league.id} league={league} muted />)}
                  </div>
                ) : (
                  <div className="border border-line rounded-2xl overflow-hidden bg-card divide-y divide-line/40">
                    {pastLeagues.map(league => <LeagueRow key={league.id} league={league} muted />)}
                  </div>
                )
              )}
            </div>
          )}

          {/* Fallback: only past leagues (no active ones) */}
          {activeLeagues.length === 0 && pastLeagues.length === 0 && null}
        </div>
      ) : null}

      {/* Recent activity */}
      {recentActivity.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-copy-3 uppercase tracking-widest mb-3">Recent Activity</h2>
          <div className="bg-card border border-line rounded-2xl divide-y divide-line/40 overflow-hidden">
            {recentActivity.map(item => {
              const when = formatTimeAgo(item.reviewedAt ?? item.requestedAt);
              const action = item.addTeamName
                ? `${item.claimantDisplayName} added ${item.addTeamName}${item.dropTeamName ? `, dropped ${item.dropTeamName}` : ''}`
                : `${item.claimantDisplayName} made a waiver claim`;
              return (
                <Link key={item.id} href={`/leagues/${item.leagueId}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-field/50 transition-colors group"
                >
                  <div className="w-7 h-7 rounded-lg bg-field border border-line flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {item.addTeamLogoUrl
                      ? <img src={item.addTeamLogoUrl} alt={item.addTeamName ?? ''} className="w-5 h-5 object-contain" />
                      : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-copy-3">
                          <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/>
                          <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/>
                        </svg>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-copy truncate group-hover:text-brand transition-colors">{action}</p>
                    <p className="text-xs text-copy-3 mt-0.5">{item.leagueName}</p>
                  </div>
                  <span className="text-xs text-copy-3 flex-shrink-0 tabular-nums">{when}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
