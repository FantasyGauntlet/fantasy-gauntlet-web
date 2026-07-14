'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useTeamProfile } from '@/context/TeamProfileContext';
import { api, WS_URL } from '@/lib/api';
import { io, type Socket } from 'socket.io-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface League {
  id: string; name: string; commissionerId: string; state: string;
  selectedSports: string[];
  rosterRules: { maxPerSport: Record<string, number | null> };
  auctionConfig: {
    startingBudget: number; minOpeningBid: number; minBidIncrement: number;
    nominationMode: string; countdownSeconds: number; maxWildcard?: number;
  } | null;
}

interface FantasyTeam { id: string; userId: string; displayName: string; remainingBudget: number; isPlaceholder: boolean; }
interface SportTeam { id: string; name: string; shortName: string; sportLeagueId: string; logoUrl: string | null; }
interface SportGroup { sport: string; teams: SportTeam[]; }

interface CurrentLot {
  teamId: string; teamName: string | null; logoUrl: string | null; sportLeagueId: string;
  currentBid: number; currentBidderId: string | null; totalSeconds: number;
}

interface SoldLot {
  teamId: string; teamName: string; logoUrl: string | null;
  winnerId: string | null; winnerName: string | null; winningBid: number; passed: boolean;
}

interface SnakePick {
  pickIndex: number; pickerUserId: string; pickerName: string;
  teamId: string; teamName: string; logoUrl: string | null;
}

interface Toast { id: number; type: 'success' | 'error' | 'info' | 'warn'; message: string; }

type AuctionStatus = 'connecting' | 'waiting' | 'active' | 'closed' | 'error';

// ─── Constants ────────────────────────────────────────────────────────────────

const ACRONYMS = new Set(['nhl', 'nba', 'nfl', 'mlb', 'ucl', 'ncaa', 'ncaaf', 'ncaab', 'mls', 'fifa', 'ufc']);
const SPORT_ORDER = ['nfl', 'nba', 'nhl', 'mlb', 'ncaaf', 'ncaab', 'premier-league', 'ucl'];
const fln = (id: string) =>
  id.split('-').map(w => ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w[0]?.toUpperCase() + w.slice(1).toLowerCase()).join(' ');

const TIMER_R = 40;
const TIMER_CIRC = 2 * Math.PI * TIMER_R;

// ─── Sub-components ───────────────────────────────────────────────────────────

function Dot({ color }: { color: 'green' | 'red' | 'yellow' }) {
  const cls = { green: 'bg-positive', red: 'bg-danger', yellow: 'bg-warn' }[color];
  return <div className={`w-2 h-2 rounded-full ${cls} animate-pulse`} />;
}

function TeamLogo({ logoUrl, name, size = 10 }: { logoUrl: string | null; name: string | null; size?: number }) {
  const [err, setErr] = useState(false);
  if (logoUrl && !err) {
    return (
      <img
        src={logoUrl} alt={name ?? ''}
        className={`w-${size} h-${size} object-contain`}
        onError={() => setErr(true)}
      />
    );
  }
  return (
    <div className={`w-${size} h-${size} rounded-lg bg-field-2 border border-line flex items-center justify-center text-copy-3 text-xs font-bold`}>
      {name ? name.slice(0, 2).toUpperCase() : '??'}
    </div>
  );
}

function TimerRing({ remaining, total, paused }: { remaining: number; total: number; paused?: boolean }) {
  const pct = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
  const offset = TIMER_CIRC * (1 - pct);
  const strokeColor = paused ? '#8b5cf6' : (pct > 0.5 ? '#22c55e' : pct > 0.25 ? '#f59e0b' : '#ef4444');
  const textCls = paused ? 'text-copy-2' : (pct > 0.5 ? 'text-positive' : pct > 0.25 ? 'text-warn' : 'text-danger');
  return (
    <div className="relative w-24 h-24 flex items-center justify-center flex-shrink-0">
      <svg width="96" height="96" className="absolute inset-0 -rotate-90">
        <circle cx="48" cy="48" r={TIMER_R} fill="none" stroke="var(--color-line)" strokeWidth="5" />
        <circle
          cx="48" cy="48" r={TIMER_R} fill="none" stroke={strokeColor} strokeWidth="5"
          strokeDasharray={TIMER_CIRC} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: paused ? 'none' : 'stroke-dashoffset 0.9s linear', stroke: strokeColor }}
        />
      </svg>
      {paused ? (
        <span className="relative z-10 flex flex-col items-center gap-0.5">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-copy-3">
            <rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>
          </svg>
          <span className="text-[10px] font-bold text-copy-3 leading-none">{remaining}s</span>
        </span>
      ) : (
        <span className={`relative z-10 text-2xl font-bold tabular-nums ${textCls}`}>{remaining}</span>
      )}
    </div>
  );
}

function ToastStack({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none max-w-xs">
      {toasts.map(t => (
        <div key={t.id} className={`px-4 py-3 rounded-xl shadow-lg text-sm font-medium border ${
          t.type === 'success' ? 'bg-positive/10 border-positive/20 text-positive' :
          t.type === 'error'   ? 'bg-danger/10 border-danger/20 text-danger' :
          t.type === 'warn'    ? 'bg-warn/10 border-warn/20 text-warn' :
          'bg-card border-line text-copy'
        }`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function AuctionPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { openProfile } = useTeamProfile();
  const router = useRouter();

  // ── Data ──────────────────────────────────────────────────────────────────
  const [league, setLeague] = useState<League | null>(null);
  const [fantasyTeams, setFantasyTeams] = useState<FantasyTeam[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);

  // These refs let socket handlers always see fresh data without stale closures
  const teamMapRef = useRef<Map<string, SportTeam>>(new Map());
  const fantasyTeamsRef = useRef<FantasyTeam[]>([]);
  const userRef = useRef(user);
  useEffect(() => { userRef.current = user; }, [user]);

  // ── Auction state ──────────────────────────────────────────────────────────
  const [status, setStatus] = useState<AuctionStatus>('connecting');
  const [connected, setConnected] = useState(false);
  const [currentLot, setCurrentLot] = useState<CurrentLot | null>(null);
  const [soldLots, setSoldLots] = useState<SoldLot[]>([]);
  const [upcomingQueue, setUpcomingQueue] = useState<string[]>([]);
  const [hiddenQueueSize, setHiddenQueueSize] = useState<number>(0);
  const [nominationMode, setNominationMode] = useState('random');
  const [minBidIncrement, setMinBidIncrement] = useState(1);
  const [minOpeningBid, setMinOpeningBid] = useState(1);
  const [lotFlash, setLotFlash] = useState<'sold' | 'passed' | null>(null);
  const [paused, setPaused] = useState(false);
  // Separated from currentLot so timer ticks only re-render the TimerRing, not the whole lot card
  const [timerRemaining, setTimerRemaining] = useState(0);

  // ── UI ────────────────────────────────────────────────────────────────────
  const [bidInput, setBidInput] = useState('');
  const [bidError, setBidError] = useState('');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [rosterView, setRosterView] = useState(''); // empty = current user
  const [nominating, setNominating] = useState(false);
  const [selectedNomination, setSelectedNomination] = useState('');
  const [nominatorUserId, setNominatorUserId] = useState<string | null>(null);
  const [nominationOrderState, setNominationOrderState] = useState<string[]>([]);
  const [auctionErrorMsg, setAuctionErrorMsg] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [bidFlash, setBidFlash] = useState(false);
  const [pendingBidAmt, setPendingBidAmt] = useState<number | null>(null);
  const [availableFilter, setAvailableFilter] = useState('');
  const [teamViewMode, setTeamViewMode] = useState<'available' | 'all' | 'drafted'>('available');
  // Snake draft state
  const [snakeDraftOrder, setSnakeDraftOrder] = useState<string[]>([]);
  const [snakePickerUserId, setSnakePickerUserId] = useState<string | null>(null);
  const [snakePickIndex, setSnakePickIndex] = useState(0);
  const [snakePickHistory, setSnakePickHistory] = useState<SnakePick[]>([]);
  const [snakePickSearch, setSnakePickSearch] = useState('');
  const [snakePickPending, setSnakePickPending] = useState(false);
  // Commissioner: set draft order for snake-defined
  const [settingDraftOrder, setSettingDraftOrder] = useState(false);
  const [draftOrderInput, setDraftOrderInput] = useState<string[]>([]);

  const socketRef = useRef<Socket | null>(null);
  const toastId = useRef(0);
  const lotFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks the last server-sent timer value and when we received it, so we can
  // interpolate the countdown between server ticks (prevents timer drift/jumpiness)
  const timerSyncRef = useRef<{ remaining: number; receivedAt: number } | null>(null);
  const pausedRef = useRef(false);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const isCommissioner = league?.commissionerId === user?.uid;
  const myFt = fantasyTeams.find(ft => ft.userId === user?.uid && !ft.isPlaceholder);
  const myBudget = myFt?.remainingBudget ?? 0;
  const startingBudget = league?.auctionConfig?.startingBudget ?? 100;
  const iAmHighBidder = currentLot?.currentBidderId === user?.uid;
  const minNextBid = currentLot
    ? (currentLot.currentBidderId === null ? minOpeningBid : currentLot.currentBid + minBidIncrement)
    : minOpeningBid;

  // ── Local timer interpolation ─────────────────────────────────────────────
  // Runs every 250ms to count down between server ticks. Without this, the
  // display only updates once per second when the server event arrives, which
  // can look stale due to network jitter. The server tick is still authoritative.
  useEffect(() => {
    const tick = setInterval(() => {
      if (!timerSyncRef.current || pausedRef.current) return;
      const { remaining, receivedAt } = timerSyncRef.current;
      const elapsed = (Date.now() - receivedAt) / 1000;
      const local = Math.max(0, remaining - Math.floor(elapsed));
      setTimerRemaining(local);
    }, 100);
    return () => clearInterval(tick);
  }, []);

  // ── Toast helper ──────────────────────────────────────────────────────────
  function toast(type: Toast['type'], message: string) {
    const id = ++toastId.current;
    setToasts(t => [...t, { id, type, message }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  }

  // ── Helpers that use refs ─────────────────────────────────────────────────
  function teamInfo(teamId: string) {
    return teamMapRef.current.get(teamId);
  }
  function participantName(userId: string) {
    return fantasyTeamsRef.current.find(ft => ft.userId === userId)?.displayName ?? userId;
  }

  // ── Load initial data ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    Promise.all([
      api.get<League>(`/leagues/${id}`),
      api.get<FantasyTeam[]>(`/leagues/${id}/teams`),
      api.get<SportGroup[]>(`/leagues/${id}/sport-teams`),
    ]).then(([l, fts, groups]) => {
      setLeague(l);
      setFantasyTeams(fts);
      fantasyTeamsRef.current = fts;
      setNominationMode(l.auctionConfig?.nominationMode ?? 'random');
      setMinBidIncrement(l.auctionConfig?.minBidIncrement ?? 1);
      setMinOpeningBid(l.auctionConfig?.minOpeningBid ?? 1);
      const map = new Map<string, SportTeam>();
      for (const g of groups) for (const t of g.teams) map.set(t.id, t);
      teamMapRef.current = map;
      setDataLoaded(true);
    }).catch(() => router.replace('/dashboard'));
  }, [id, router]);

  // ── WebSocket ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!dataLoaded || !user) return;

    let socket: Socket;

    (async () => {
      const token = await user.getIdToken();
      socket = io(`${WS_URL}/auction`, {
        auth: { token },
        query: { leagueId: id },
        transports: ['websocket'],
      });
      socketRef.current = socket;

      socket.on('connect', () => setConnected(true));
      socket.on('disconnect', () => setConnected(false));
      socket.on('connect_error', () => { setConnected(false); setStatus('error'); });

      socket.on('auction_state', (data: any) => {
        const session = data?.session;
        if (!session) { setStatus('waiting'); return; }

        setStatus(session.status as AuctionStatus);
        setPaused(session.paused ?? false);
        if (session.minBidIncrement) setMinBidIncrement(session.minBidIncrement);
        if (session.minOpeningBid) setMinOpeningBid(session.minOpeningBid);
        if (session.nominationMode) setNominationMode(session.nominationMode);

        // Remaining queue: only revealed for non-hidden modes
        const remaining: string[] = session.nominationMode !== 'random-hidden'
          ? (session.queue?.slice((session.currentIndex ?? -1) + 1) ?? [])
          : [];
        setUpcomingQueue(remaining);
        if (session.nominationMode === 'random-hidden' && session.queueSize) {
          setHiddenQueueSize(session.queueSize);
        }

        // Restore manual nomination state on reconnect
        if (session.nominationMode === 'manual') {
          if (session.nominationOrder) setNominationOrderState(session.nominationOrder);
          if (session.nominationOrder && session.nominationIndex !== undefined) {
            const idx = session.nominationIndex % session.nominationOrder.length;
            setNominatorUserId(session.nominationOrder[idx]);
          }
        }

        // Reconstruct snake draft state on reconnect
        const isSnake = session.nominationMode === 'snake-random' || session.nominationMode === 'snake-defined';
        if (isSnake && session.draftOrder) {
          setSnakeDraftOrder(session.draftOrder);
          setSnakePickIndex(session.currentIndex ?? 0);
          if (session.currentLot?.teamId === '' && session.currentLot.currentBidderId) {
            setSnakePickerUserId(session.currentLot.currentBidderId);
            const r = session.currentLot.timerRemaining ?? session.countdownSeconds ?? 60;
            timerSyncRef.current = { remaining: r, receivedAt: Date.now() };
            setTimerRemaining(r);
          }
        }

        // Reconstruct current lot if in-progress (auction mode only)
        if (session.currentLot && session.status === 'active') {
          const { teamId, currentBid, currentBidderId, timerRemaining } = session.currentLot;
          // In random-hidden mode teamId may be null (concealed by the server)
          const isHiddenLot = !teamId || session.nominationMode === 'random-hidden';
          const info = (!isHiddenLot && teamId) ? teamInfo(teamId) : undefined;
          setCurrentLot({
            teamId: teamId ?? '',
            teamName: isHiddenLot ? '???' : (info?.name ?? teamId ?? ''),
            logoUrl: isHiddenLot ? null : (info?.logoUrl ?? null),
            sportLeagueId: isHiddenLot ? '' : (info?.sportLeagueId ?? ''),
            currentBid,
            currentBidderId,
            totalSeconds: session.countdownSeconds ?? 30,
          });
          const initRemaining = timerRemaining ?? session.countdownSeconds ?? 30;
          timerSyncRef.current = { remaining: initRemaining, receivedAt: Date.now() };
          setTimerRemaining(initRemaining);
        }

        // Reconstruct completed lots / snake pick history
        if (data.completedLots?.length) {
          const lots: SoldLot[] = (data.completedLots as any[]).map((l: any) => {
            const info = teamInfo(l.teamId);
            return {
              teamId: l.teamId,
              teamName: info?.name ?? l.teamId,
              logoUrl: info?.logoUrl ?? null,
              winnerId: l.winnerId,
              winnerName: l.winnerId ? participantName(l.winnerId) : null,
              winningBid: l.winningBid ?? 0,
              passed: l.status === 'passed',
            };
          });
          setSoldLots(lots.reverse());
          if (isSnake) {
            const picks: SnakePick[] = (data.completedLots as any[])
              .filter((l: any) => l.winnerId)
              .sort((a: any, b: any) => a.startedAt.localeCompare(b.startedAt))
              .map((l: any, i: number) => {
                const info = teamInfo(l.teamId);
                return {
                  pickIndex: i,
                  pickerUserId: l.winnerId,
                  pickerName: participantName(l.winnerId),
                  teamId: l.teamId,
                  teamName: info?.name ?? l.teamId,
                  logoUrl: info?.logoUrl ?? null,
                };
              });
            setSnakePickHistory(picks);
          }
        }
      });

      socket.on('auction_started', (data: any) => {
        setStatus('waiting');
        if (data.nominationMode) setNominationMode(data.nominationMode);
        if (data.queue) setUpcomingQueue(data.queue);
        if (data.nominationOrder) setNominationOrderState(data.nominationOrder);
        toast('info', 'The auction has started!');
      });

      // ── Snake draft events ─────────────────────────────────────────────
      socket.on('snake_draft_started', (data: any) => {
        if (data.draftOrder) setSnakeDraftOrder(data.draftOrder);
        setSnakePickHistory([]);
        setSnakePickIndex(0);
        setSnakePickerUserId(null);
        toast('info', 'Snake draft has started!');
      });

      socket.on('snake_pick_turn', (data: any) => {
        setSnakePickerUserId(data.pickerUserId);
        setSnakePickIndex(data.pickIndex ?? 0);
        setSnakePickSearch('');
        setSnakePickPending(false);
        setStatus('active');
        const t = data.timerSeconds ?? 60;
        timerSyncRef.current = { remaining: t, receivedAt: Date.now() };
        setTimerRemaining(t);
      });

      socket.on('pick_made', (data: any) => {
        const info = teamMapRef.current.get(data.teamId);
        setSnakePickHistory(prev => [...prev, {
          pickIndex: data.pickIndex,
          pickerUserId: data.pickerUserId,
          pickerName: participantName(data.pickerUserId),
          teamId: data.teamId,
          teamName: data.teamName ?? info?.name ?? data.teamId,
          logoUrl: info?.logoUrl ?? null,
        }]);
        setSnakePickerUserId(data.nextPickerUserId ?? null);
        setSnakePickIndex(data.nextPickIndex ?? 0);
        setSnakePickPending(false);
        setSnakePickSearch('');
        // Update the winner's roster locally (mirrors team_sold path)
        if (data.pickerUserId) {
          setFantasyTeams(prev => {
            const updated = prev.map(ft =>
              ft.userId === data.pickerUserId
                ? { ...ft, remainingBudget: ft.remainingBudget } // budget unchanged in snake
                : ft
            );
            fantasyTeamsRef.current = updated;
            return updated;
          });
          setSoldLots(prev => [{
            teamId: data.teamId,
            teamName: data.teamName ?? info?.name ?? data.teamId,
            logoUrl: info?.logoUrl ?? null,
            winnerId: data.pickerUserId,
            winnerName: participantName(data.pickerUserId),
            winningBid: 0,
            passed: false,
          }, ...prev]);
          if (data.pickerUserId === userRef.current?.uid) {
            toast('success', `You drafted ${data.teamName ?? data.teamId}!`);
          }
        }
      });

      socket.on('pick_skipped', (data: any) => {
        setSnakePickPending(false);
        setSnakePickSearch('');
        toast('warn', `Pick skipped${data.reason === 'timeout' ? ' (time expired)' : ''}`);
      });

      socket.on('pick_rejected', (data: any) => {
        setSnakePickPending(false);
        toast('error', data.reason ?? 'Pick rejected');
      });
      // ──────────────────────────────────────────────────────────────────

      socket.on('lot_opened', (data: any) => {
        // Cancel any pending "clear lot" timeout from team_sold / team_passed
        if (lotFlashTimerRef.current) {
          clearTimeout(lotFlashTimerRef.current);
          lotFlashTimerRef.current = null;
        }
        // data.teamId is null in random-hidden mode — identity is concealed until lot closes
        const isHidden = data.teamId === null;
        const info = !isHidden ? teamInfo(data.teamId) : undefined;
        const lotTimer = data.timerSeconds ?? 30;
        setCurrentLot({
          teamId: data.teamId ?? '',
          teamName: isHidden ? '???' : (data.teamName ?? info?.name ?? data.teamId ?? ''),
          logoUrl: isHidden ? null : (info?.logoUrl ?? null),
          sportLeagueId: isHidden ? '' : (data.sportLeagueId ?? info?.sportLeagueId ?? ''),
          currentBid: data.openingBid ?? minOpeningBid,
          currentBidderId: null,
          totalSeconds: lotTimer,
        });
        timerSyncRef.current = { remaining: lotTimer, receivedAt: Date.now() };
        setTimerRemaining(lotTimer);
        setStatus('active');
        setLotFlash(null);
        setPaused(false);
        setBidInput('');
        setBidError('');
        setPendingBidAmt(null);
        setNominatorUserId(null);
        setUpcomingQueue(q => q.filter(tid => tid !== data.teamId));
      });

      socket.on('lot_paused', (data: any) => {
        setPaused(true);
        if (data.timerRemaining !== undefined) {
          timerSyncRef.current = null; // stop interpolation while paused
          setTimerRemaining(data.timerRemaining);
        }
      });

      socket.on('lot_resumed', (data: any) => {
        setPaused(false);
        if (data.timerRemaining !== undefined) {
          timerSyncRef.current = { remaining: data.timerRemaining, receivedAt: Date.now() };
          setTimerRemaining(data.timerRemaining);
        }
      });

      socket.on('new_high_bid', (data: any) => {
        setCurrentLot(prev => {
          if (!prev) return prev;
          const wasMe = prev.currentBidderId === userRef.current?.uid;
          const isNowMe = data.bidderId === userRef.current?.uid;
          if (wasMe && !isNowMe) toast('warn', `Outbid! New high bid: $${data.amount}`);
          return { ...prev, currentBid: data.amount, currentBidderId: data.bidderId };
        });
        setBidFlash(true);
        setTimeout(() => setBidFlash(false), 500);
        if (data.timerRemaining !== undefined) {
          timerSyncRef.current = { remaining: data.timerRemaining, receivedAt: Date.now() };
          setTimerRemaining(data.timerRemaining);
        }
      });

      socket.on('timer_update', (data: any) => {
        timerSyncRef.current = { remaining: data.remaining, receivedAt: Date.now() };
        setTimerRemaining(data.remaining);
      });

      socket.on('team_sold', (data: any) => {
        setLotFlash('sold');
        const info = teamInfo(data.teamId);
        const sold: SoldLot = {
          teamId: data.teamId,
          teamName: info?.name ?? data.teamId,
          logoUrl: info?.logoUrl ?? null,
          winnerId: data.winnerId,
          winnerName: participantName(data.winnerId),
          winningBid: data.winningBid,
          passed: false,
        };
        setSoldLots(prev => [sold, ...prev]);
        // Reveal the real team identity on the lot card (was hidden in random-hidden mode)
        setCurrentLot(prev => prev ? {
          ...prev,
          teamId: data.teamId,
          teamName: info?.name ?? data.teamId,
          logoUrl: info?.logoUrl ?? null,
          sportLeagueId: info?.sportLeagueId ?? prev.sportLeagueId,
        } : null);
        // Deduct from the winner's budget
        setFantasyTeams(prev => {
          const updated = prev.map(ft =>
            ft.userId === data.winnerId ? { ...ft, remainingBudget: ft.remainingBudget - data.winningBid } : ft
          );
          fantasyTeamsRef.current = updated;
          return updated;
        });
        if (data.winnerId === userRef.current?.uid) {
          toast('success', `You won ${info?.name ?? data.teamId} for $${data.winningBid}!`);
        }
        timerSyncRef.current = null;
        lotFlashTimerRef.current = setTimeout(() => {
          lotFlashTimerRef.current = null;
          setLotFlash(null); setCurrentLot(null); setStatus('waiting');
        }, 1800);
      });

      socket.on('team_passed', (data: any) => {
        setLotFlash('passed');
        const info = teamInfo(data.teamId);
        const passed: SoldLot = {
          teamId: data.teamId,
          teamName: info?.name ?? data.teamId,
          logoUrl: info?.logoUrl ?? null,
          winnerId: null, winnerName: null, winningBid: 0, passed: true,
        };
        setSoldLots(prev => [passed, ...prev]);
        // Reveal the real team identity on the lot card (was hidden in random-hidden mode)
        setCurrentLot(prev => prev ? {
          ...prev,
          teamId: data.teamId,
          teamName: info?.name ?? data.teamId,
          logoUrl: info?.logoUrl ?? null,
          sportLeagueId: info?.sportLeagueId ?? prev.sportLeagueId,
        } : null);
        timerSyncRef.current = null;
        lotFlashTimerRef.current = setTimeout(() => {
          lotFlashTimerRef.current = null;
          setLotFlash(null); setCurrentLot(null); setStatus('waiting');
        }, 1800);
      });

      socket.on('team_assigned', (data: any) => {
        const info = teamInfo(data.teamId);
        const assigned: SoldLot = {
          teamId: data.teamId,
          teamName: info?.name ?? data.teamId,
          logoUrl: info?.logoUrl ?? null,
          winnerId: data.winnerId,
          winnerName: participantName(data.winnerId),
          winningBid: data.price,
          passed: false,
        };
        setSoldLots(prev => [assigned, ...prev]);
        setFantasyTeams(prev => {
          const updated = prev.map(ft =>
            ft.userId === data.winnerId ? { ...ft, remainingBudget: ft.remainingBudget - data.price } : ft
          );
          fantasyTeamsRef.current = updated;
          return updated;
        });
      });

      socket.on('queue_updated', (data: any) => {
        if (data.queue) setUpcomingQueue(data.queue);
      });

      socket.on('nomination_turn', (data: any) => {
        setNominatorUserId(data.nominatorUserId ?? null);
        setNominating(false);
        setSelectedNomination('');
      });

      socket.on('nomination_order_updated', (data: any) => {
        if (data.nominationOrder) setNominationOrderState(data.nominationOrder);
      });

      socket.on('auction_closed', () => {
        setStatus('closed');
        setCurrentLot(null);
        toast('info', 'The auction has ended.');
      });

      socket.on('auction_reset', () => {
        // Auction wiped — redirect everyone back to the league page
        router.replace(`/leagues/${id}`);
      });

      socket.on('bid_accepted', (data: any) => {
        toast('success', `Bid of $${data.amount} placed`);
        setBidInput('');
        setBidError('');
        setPendingBidAmt(null);
      });

      socket.on('bid_rejected', (data: any) => {
        setBidError(data.reason ?? 'Bid rejected');
        toast('error', data.reason ?? 'Bid rejected');
        setPendingBidAmt(null);
      });

      socket.on('error', (data: any) => {
        toast('error', data.message ?? 'An error occurred');
      });

      socket.on('auction_error', (data: any) => {
        setAuctionErrorMsg(data.message ?? 'An error occurred');
        toast('error', data.message ?? 'An error occurred');
      });
    })();

    return () => { socket?.disconnect(); socketRef.current = null; };
  }, [dataLoaded, user, id]);

  // ── Actions ───────────────────────────────────────────────────────────────

  function placeBid(amount: number) {
    if (!socketRef.current) return;
    setBidError('');
    setPendingBidAmt(amount);
    socketRef.current.emit('place_bid', { amount });
  }

  function makePick(teamId: string) {
    if (!socketRef.current || snakePickPending) return;
    setSnakePickPending(true);
    socketRef.current.emit('make_pick', { teamId });
  }

  async function saveDraftOrder() {
    if (!id) return;
    try {
      await api.put(`/leagues/${id}/auction/draft-order`, { userIds: draftOrderInput });
      setSettingDraftOrder(false);
      toast('success', 'Draft order saved');
    } catch (e: unknown) {
      toast('error', e instanceof Error ? e.message : 'Failed to save draft order');
    }
  }

  function handleBidSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(bidInput);
    if (!amount || amount < minNextBid) { setBidError(`Minimum bid is $${minNextBid}`); return; }
    if (amount > myBudget) { setBidError(`You only have $${myBudget} remaining`); return; }
    placeBid(amount);
  }

  function skipLot() { socketRef.current?.emit('commissioner_skip'); }

  function forceNextLot() { socketRef.current?.emit('commissioner_advance'); }

  function handleNominate() {
    if (!selectedNomination) return;
    setNominating(true);
    socketRef.current?.emit('submit_nomination', { teamId: selectedNomination });
    setSelectedNomination('');
  }

  async function handleStartAuction() {
    try {
      await api.post(`/leagues/${id}/auction/start`);
      toast('info', 'Auction started!');
    } catch (e: unknown) {
      toast('error', e instanceof Error ? e.message : 'Failed to start auction');
    }
  }

  async function handleRestartAuction() {
    try {
      setAuctionErrorMsg('');
      await api.post(`/leagues/${id}/auction/restart`);
      toast('info', 'Auction session restarted.');
    } catch (e: unknown) {
      toast('error', e instanceof Error ? e.message : 'Failed to restart auction');
    }
  }

  async function handleResetAuction() {
    try {
      setConfirmReset(false);
      await api.post(`/leagues/${id}/auction/reset`);
      // auction_reset socket event will redirect all clients
    } catch (e: unknown) {
      toast('error', e instanceof Error ? e.message : 'Failed to reset auction');
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const nominationOptions = upcomingQueue
    .map(tid => teamMapRef.current.get(tid))
    .filter(Boolean) as SportTeam[];

  const sortedParticipants = [...fantasyTeams]
    .filter(ft => !ft.isPlaceholder)
    .sort((a, b) => b.remainingBudget - a.remainingBudget);

  // Roster viewer — sport-ordered slots with empty placeholders
  const rosterUserId = rosterView || user?.uid || '';
  const ownedLots = soldLots.filter(l => !l.passed && l.winnerId === rosterUserId);
  const leagueSports = league?.selectedSports ?? [];
  const orderedLeagueSports = SPORT_ORDER
    .filter(s => leagueSports.includes(s))
    .concat(leagueSports.filter(s => !SPORT_ORDER.includes(s)));
  function getMaxForSport(sport: string): number {
    const configured = league?.rosterRules?.maxPerSport?.[sport];
    if (configured !== null && configured !== undefined) return configured;
    return sport === 'premier-league' ? 1 : 2;
  }

  const isSnake = nominationMode === 'snake-random' || nominationMode === 'snake-defined';

  const soldOrPassedIds = new Set(soldLots.map(l => l.teamId));
  const allAuctionTeams = [...teamMapRef.current.values()];
  // For non-hidden modes, derive available teams from the actual queue (preset-filtered by backend)
  // rather than all sport teams. For hidden mode, fall back to allAuctionTeams for display only.
  const availableTeams = nominationMode !== 'random-hidden'
    ? upcomingQueue
        .map(tid => teamMapRef.current.get(tid))
        .filter((t): t is SportTeam => !!t && !soldOrPassedIds.has(t.id) && t.id !== currentLot?.teamId)
        .sort((a, b) => a.name.localeCompare(b.name))
    : allAuctionTeams
        .filter(t => !soldOrPassedIds.has(t.id) && t.id !== currentLot?.teamId)
        .sort((a, b) => a.name.localeCompare(b.name));
  const filteredAvailableTeams = availableFilter
    ? availableTeams.filter(t => t.sportLeagueId === availableFilter)
    : availableTeams;

  // Won teams (not passed), with full SportTeam data for sport filtering
  const draftedTeams = soldLots
    .filter(l => !l.passed)
    .map(l => teamMapRef.current.get(l.teamId))
    .filter((t): t is SportTeam => !!t);

  // Base list for the Teams panel depending on view mode
  const teamPanelBase: SportTeam[] = (() => {
    if (teamViewMode === 'drafted') return draftedTeams;
    if (teamViewMode === 'all') {
      const takenTeams = [...soldOrPassedIds]
        .map(id => teamMapRef.current.get(id))
        .filter((t): t is SportTeam => !!t);
      return [...availableTeams, ...takenTeams].sort((a, b) => a.name.localeCompare(b.name));
    }
    return availableTeams;
  })();

  const teamPanelList = availableFilter
    ? teamPanelBase.filter(t => t.sportLeagueId === availableFilter)
    : teamPanelBase;

  // Set of IDs that should appear greyscale (sold/passed)
  const greyedIds = teamViewMode !== 'available' ? soldOrPassedIds : new Set<string>();

  return (
    <div className="max-w-6xl mx-auto">
      <ToastStack toasts={toasts} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href={`/leagues/${id}`} className="flex items-center gap-1.5 text-copy-3 hover:text-copy text-sm transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back
          </Link>
          <span className="text-copy-3">/</span>
          <span className="text-copy font-semibold">{league?.name ?? '...'}</span>
          <span className="text-copy-3">/</span>
          <span className="text-brand font-semibold">Draft Room</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-copy-2">
          <Dot color={connected ? 'green' : 'red'} />
          <span>{connected ? 'Live' : 'Disconnected'}</span>
        </div>
      </div>

      {/* Connecting / Error */}
      {status === 'connecting' && (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-copy-2">
          <div className="w-10 h-10 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          <p>Joining draft room…</p>
        </div>
      )}

      {status === 'error' && (
        <div className="text-center py-24">
          <p className="text-danger text-lg font-semibold mb-2">Connection failed</p>
          <p className="text-copy-3 text-sm mb-6">Could not connect to the auction server.</p>
          <button onClick={() => window.location.reload()} className="bg-brand hover:bg-brand-2 text-white font-medium px-6 py-2.5 rounded-xl transition-colors text-sm">
            Retry
          </button>
        </div>
      )}

      {/* Active auction UI */}
      {(status === 'waiting' || status === 'active' || status === 'closed') && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_272px] gap-4">

          {/* ── Left column ──────────────────────────────────────── */}
          <div className="space-y-4 min-w-0">

            {/* Closed banner */}
            {status === 'closed' && (
              <div className="bg-card border border-line rounded-2xl p-6 text-center">
                <p className="text-2xl font-bold text-copy mb-1">Auction Complete</p>
                <p className="text-copy-3 text-sm">All {soldLots.length} teams have been processed.</p>
                <Link href={`/leagues/${id}`} className="inline-block mt-4 bg-brand hover:bg-brand-2 text-white font-medium px-6 py-2 rounded-xl transition-colors text-sm">
                  View League
                </Link>
              </div>
            )}

            {/* Persistent auction error banner */}
            {auctionErrorMsg && (
              <div className="bg-danger-bg/30 border border-danger/30 rounded-2xl p-4 flex items-start gap-3">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-danger flex-shrink-0 mt-0.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-danger">Auction Error</p>
                  <p className="text-xs text-copy-3 mt-0.5">{auctionErrorMsg}</p>
                </div>
                {isCommissioner && (
                  <button onClick={handleRestartAuction} className="flex-shrink-0 bg-danger/10 hover:bg-danger/20 text-danger text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                    Restart Auction
                  </button>
                )}
                <button onClick={() => setAuctionErrorMsg('')} className="flex-shrink-0 text-copy-3 hover:text-copy">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            )}

            {/* Waiting for lot */}
            {status === 'waiting' && (
              <div className="bg-card border border-line rounded-2xl p-6 text-center">
                <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-copy-2 text-sm mb-1">
                  {isSnake
                    ? (snakeDraftOrder.length > 0 ? 'Preparing next pick…' : 'Waiting for snake draft to begin…')
                    : nominationMode === 'manual' && nominatorUserId
                    ? nominatorUserId === user?.uid
                      ? 'It\'s your turn to nominate!'
                      : `Waiting for ${participantName(nominatorUserId)} to nominate…`
                    : nominationMode === 'manual'
                    ? 'Waiting for nomination…'
                    : 'Preparing next team…'}
                </p>
                {nominationMode === 'manual' && nominatorUserId && nominatorUserId !== user?.uid && !isCommissioner && (
                  <p className="text-copy-3 text-xs mt-1">{participantName(nominatorUserId)} will pick the next team to auction.</p>
                )}
              </div>
            )}

            {/* Snake Draft Clock */}
            {isSnake && status === 'active' && (
              <div className="bg-card border border-brand/30 rounded-2xl p-5">
                <div className="flex items-start gap-4 mb-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-copy-3 uppercase tracking-wide mb-1">
                      {snakePickerUserId === user?.uid ? 'Your Pick' : 'On The Clock'}
                    </p>
                    <h2 className="text-xl font-bold text-copy leading-tight">
                      {snakePickerUserId === user?.uid ? 'You' : participantName(snakePickerUserId ?? '')}
                    </h2>
                    <p className="text-xs text-copy-3 mt-1">
                      Pick #{snakePickIndex + 1}
                      {snakeDraftOrder.length > 0 && ` · Round ${Math.floor(snakePickIndex / snakeDraftOrder.length) + 1}`}
                    </p>
                  </div>
                  <TimerRing
                    remaining={timerRemaining}
                    total={league?.auctionConfig?.countdownSeconds ?? 60}
                    paused={paused}
                  />
                </div>

                {snakePickerUserId === user?.uid ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      placeholder="Search teams…"
                      value={snakePickSearch}
                      onChange={e => setSnakePickSearch(e.target.value)}
                      className="w-full bg-field border border-line-2 rounded-xl px-4 py-2.5 text-copy text-sm placeholder-copy-3 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors"
                    />
                    <div className="max-h-52 overflow-y-auto space-y-1 -mr-1 pr-1">
                      {(() => {
                        const q = snakePickSearch.toLowerCase();
                        const filtered = availableTeams.filter(
                          t => !q || t.name.toLowerCase().includes(q) || t.shortName.toLowerCase().includes(q)
                        );
                        if (filtered.length === 0) {
                          return <p className="text-xs text-copy-3 text-center py-4">No teams match your search</p>;
                        }
                        return filtered.map(team => (
                          <button
                            key={team.id}
                            onClick={() => makePick(team.id)}
                            disabled={snakePickPending}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl bg-field hover:bg-field-2 transition-all active:scale-[0.98] text-left disabled:opacity-50"
                          >
                            <TeamLogo logoUrl={team.logoUrl} name={team.name} size={7} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-copy truncate">{team.name}</p>
                              <p className="text-xs text-copy-3">{fln(team.sportLeagueId)}</p>
                            </div>
                            <span className="text-xs font-semibold text-brand flex-shrink-0">
                              {snakePickPending ? '…' : 'Pick'}
                            </span>
                          </button>
                        ));
                      })()}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-2 space-y-2">
                    <p className="text-xs text-copy-3">
                      Waiting for {participantName(snakePickerUserId ?? '')} to make their pick…
                    </p>
                    {(() => {
                      const n = snakeDraftOrder.length;
                      if (!n) return null;
                      const nextIdx = snakePickIndex + 1;
                      const round = Math.floor(nextIdx / n);
                      const pos = nextIdx % n;
                      const nextUid = round % 2 === 0 ? snakeDraftOrder[pos] : snakeDraftOrder[n - 1 - pos];
                      if (!nextUid) return null;
                      const isMe = nextUid === user?.uid;
                      return (
                        <p className={`text-xs font-medium ${isMe ? 'text-brand' : 'text-copy-2'}`}>
                          {isMe ? 'You are up next!' : `Up next: ${participantName(nextUid)}`}
                          <span className="text-copy-3 font-normal"> · Pick #{nextIdx + 1}</span>
                        </p>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* Current Lot — auction mode only */}
            {!isSnake && (status === 'active' || lotFlash) && currentLot && (
              <div className={`bg-card border rounded-2xl p-5 transition-colors ${
                lotFlash === 'sold'   ? 'border-positive/50 bg-positive/5' :
                lotFlash === 'passed' ? 'border-line' : 'border-brand/30'
              }`}>
                <div className="flex items-start gap-4 mb-4">
                  <TeamLogo logoUrl={currentLot.logoUrl} name={currentLot.teamName} size={14} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-copy-3 uppercase tracking-wide mb-0.5">
                      {currentLot.sportLeagueId ? fln(currentLot.sportLeagueId) : '???'}
                    </p>
                    <h2 className="text-xl font-bold text-copy leading-tight truncate">{currentLot.teamName ?? '???'}</h2>
                    {lotFlash && (
                      <span className={`inline-block mt-1 text-xs font-bold px-2 py-0.5 rounded-full ${
                        lotFlash === 'sold' ? 'bg-positive/20 text-positive' : 'bg-line text-copy-3'
                      }`}>
                        {lotFlash === 'sold' ? 'SOLD' : 'PASSED'}
                      </span>
                    )}
                  </div>
                  <TimerRing remaining={timerRemaining} total={currentLot.totalSeconds} paused={paused} />
                </div>

                {/* Bid info */}
                <div className="flex items-end gap-4 mb-4">
                  <div>
                    <p className="text-xs text-copy-3 mb-0.5">Current bid</p>
                    <p className={`text-4xl font-bold tabular-nums transition-colors duration-300 ${bidFlash ? 'text-brand' : 'text-copy'}`}>${currentLot.currentBid}</p>
                  </div>
                  {currentLot.currentBidderId && (
                    <div className="mb-1">
                      <p className="text-xs text-copy-3">by</p>
                      <p className={`text-sm font-semibold ${iAmHighBidder ? 'text-brand' : 'text-copy-2'}`}>
                        {iAmHighBidder ? 'You' : participantName(currentLot.currentBidderId)}
                      </p>
                    </div>
                  )}
                  {!currentLot.currentBidderId && (
                    <p className="text-xs text-copy-3 mb-1">Opening bid — no bids yet</p>
                  )}
                </div>

                {/* Bid form */}
                {!lotFlash && (
                  <form onSubmit={handleBidSubmit} className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min={minNextBid}
                        max={myBudget}
                        value={bidInput}
                        onChange={e => { setBidInput(e.target.value); setBidError(''); }}
                        placeholder={`Min $${minNextBid}`}
                        className="flex-1 bg-field border border-line-2 rounded-xl px-4 py-2.5 text-copy text-sm placeholder-copy-3 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors"
                      />
                      <button
                        type="submit"
                        disabled={myBudget < minNextBid}
                        className="bg-brand hover:bg-brand-2 disabled:opacity-40 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm whitespace-nowrap"
                      >
                        {iAmHighBidder ? 'Raise Bid' : 'Place Bid'}
                      </button>
                    </div>
                    {bidError && <p className="text-danger text-xs">{bidError}</p>}
                    {/* Quick bid buttons */}
                    {myBudget >= minNextBid && (
                      <div className="flex gap-2">
                        {[minNextBid, minNextBid + minBidIncrement * 4, minNextBid + minBidIncrement * 9, minNextBid + minBidIncrement * 24]
                          .filter((a, i, arr) => a <= myBudget && arr.indexOf(a) === i)
                          .slice(0, 4)
                          .map(amt => (
                            <button
                              key={amt}
                              type="button"
                              onClick={() => placeBid(amt)}
                              disabled={pendingBidAmt !== null}
                              className={`flex-1 text-xs border border-line text-copy-2 py-2 rounded-lg transition-all active:scale-95 ${
                                pendingBidAmt === amt
                                  ? 'bg-brand/10 border-brand/30 text-brand'
                                  : 'bg-field hover:bg-field-2'
                              }`}
                            >
                              {pendingBidAmt === amt ? '…' : `$${amt}`}
                            </button>
                          ))}
                      </div>
                    )}
                    {myBudget < minNextBid && (
                      <p className="text-xs text-copy-3">Insufficient budget to bid</p>
                    )}
                  </form>
                )}
              </div>
            )}

            {/* Commissioner controls */}
            {isCommissioner && (
              <div className="bg-card border border-line rounded-2xl p-4 space-y-3">
                <p className="text-xs font-semibold text-copy-3 uppercase tracking-wide">Commissioner</p>
                <div className="flex flex-wrap gap-2">
                  {/* Start draft/auction */}
                  {status === 'waiting' && connected && league?.state === 'draft' && (
                    <button
                      onClick={handleStartAuction}
                      disabled={!league.auctionConfig}
                      title={!league.auctionConfig ? 'Configure auction settings first' : undefined}
                      className="bg-brand hover:bg-brand-2 disabled:opacity-40 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
                    >
                      {isSnake ? 'Start Draft' : 'Start Auction'}
                    </button>
                  )}

                  {/* Snake: set draft order (snake-defined, pre-start) */}
                  {isSnake && nominationMode === 'snake-defined' && league?.state === 'draft' && (
                    <button
                      onClick={() => {
                        setDraftOrderInput(
                          snakeDraftOrder.length > 0
                            ? snakeDraftOrder
                            : sortedParticipants.map(ft => ft.userId)
                        );
                        setSettingDraftOrder(true);
                      }}
                      className="bg-field hover:bg-field-2 border border-line text-copy-2 text-sm font-medium px-4 py-2 rounded-xl transition-colors"
                    >
                      Set Draft Order
                    </button>
                  )}

                  {/* Snake: skip current pick */}
                  {isSnake && status === 'active' && (
                    <button
                      onClick={skipLot}
                      className="bg-field hover:bg-field-2 border border-line text-copy-2 text-sm font-medium px-4 py-2 rounded-xl transition-colors"
                    >
                      Skip Pick
                    </button>
                  )}

                  {/* Auction: active-lot controls */}
                  {!isSnake && status === 'active' && currentLot && (
                    <>
                      <button
                        onClick={() => socketRef.current?.emit(paused ? 'commissioner_resume' : 'commissioner_pause')}
                        className={`text-sm font-medium px-4 py-2 rounded-xl transition-colors border ${
                          paused
                            ? 'bg-brand/10 border-brand/30 text-brand hover:bg-brand/20'
                            : 'bg-field hover:bg-field-2 border-line text-copy-2'
                        }`}
                      >
                        {paused ? 'Resume Clock' : 'Pause Clock'}
                      </button>
                      <button
                        onClick={() => socketRef.current?.emit('commissioner_add_time', { seconds: 30 })}
                        className="bg-field hover:bg-field-2 border border-line text-copy-2 text-sm font-medium px-3 py-2 rounded-xl transition-colors"
                      >
                        +30s
                      </button>
                      <button
                        onClick={() => socketRef.current?.emit('commissioner_add_time', { seconds: 60 })}
                        className="bg-field hover:bg-field-2 border border-line text-copy-2 text-sm font-medium px-3 py-2 rounded-xl transition-colors"
                      >
                        +60s
                      </button>
                      <button
                        onClick={() => socketRef.current?.emit('commissioner_reset_timer')}
                        className="bg-field hover:bg-field-2 border border-line text-copy-2 text-sm font-medium px-4 py-2 rounded-xl transition-colors"
                      >
                        Reset Timer
                      </button>
                      <button
                        onClick={skipLot}
                        className="bg-field hover:bg-field-2 border border-line text-copy-2 text-sm font-medium px-4 py-2 rounded-xl transition-colors"
                      >
                        Skip / Pass Team
                      </button>
                    </>
                  )}
                  {/* Manual mode: commissioner can always nominate (fallback for any turn) */}
                  {nominationMode === 'manual' && status === 'waiting' && league?.state === 'auction' && (
                    <div className="flex gap-2 w-full">
                      <select
                        value={selectedNomination}
                        onChange={e => setSelectedNomination(e.target.value)}
                        className="flex-1 bg-field border border-line-2 rounded-xl px-3 py-2 text-copy text-sm focus:outline-none focus:border-brand"
                      >
                        <option value="">
                          {nominatorUserId && nominatorUserId !== user?.uid
                            ? `Nominate on behalf of ${participantName(nominatorUserId)}…`
                            : 'Pick a team to nominate…'}
                        </option>
                        {nominationOptions.map(t => (
                          <option key={t.id} value={t.id}>{t.name} ({fln(t.sportLeagueId)})</option>
                        ))}
                      </select>
                      <button
                        onClick={handleNominate}
                        disabled={!selectedNomination || nominating}
                        className="bg-brand hover:bg-brand-2 disabled:opacity-40 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors whitespace-nowrap"
                      >
                        {nominating ? 'Nominating…' : 'Nominate'}
                      </button>
                    </div>
                  )}
                  {/* Force-advance if stuck between lots */}
                  {!isSnake && status === 'waiting' && league?.state === 'auction' && (
                    <button
                      onClick={forceNextLot}
                      className="bg-field hover:bg-field-2 border border-line text-copy-2 text-sm font-medium px-4 py-2 rounded-xl transition-colors"
                    >
                      Force Next Team
                    </button>
                  )}
                </div>

                {/* Snake: set draft order panel */}
                {settingDraftOrder && (
                  <div className="border-t border-line pt-3 space-y-2">
                    <p className="text-xs font-semibold text-copy-2">Draft Order (Round 1)</p>
                    <p className="text-xs text-copy-3">Round 2 reverses automatically (snake).</p>
                    <div className="space-y-1">
                      {draftOrderInput.map((uid, idx) => (
                        <div key={uid} className="flex items-center gap-2 bg-field rounded-lg px-3 py-2">
                          <span className="text-xs text-copy-3 w-4 text-right flex-shrink-0">{idx + 1}</span>
                          <span className="flex-1 text-sm text-copy truncate">
                            {uid === user?.uid ? 'You' : participantName(uid)}
                          </span>
                          <button
                            disabled={idx === 0}
                            onClick={() => setDraftOrderInput(prev => {
                              const next = [...prev];
                              [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                              return next;
                            })}
                            className="text-copy-3 hover:text-copy disabled:opacity-20 transition-colors p-0.5"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="18 15 12 9 6 15"/></svg>
                          </button>
                          <button
                            disabled={idx === draftOrderInput.length - 1}
                            onClick={() => setDraftOrderInput(prev => {
                              const next = [...prev];
                              [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
                              return next;
                            })}
                            className="text-copy-3 hover:text-copy disabled:opacity-20 transition-colors p-0.5"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={saveDraftOrder}
                        className="flex-1 bg-brand hover:bg-brand-2 text-white text-sm font-semibold py-2 rounded-xl transition-colors"
                      >
                        Save Order
                      </button>
                      <button
                        onClick={() => setSettingDraftOrder(false)}
                        className="flex-1 bg-field hover:bg-field-2 border border-line text-copy-2 text-sm font-medium py-2 rounded-xl transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
                {/* Recovery / reset tools — always visible during an active auction */}
                {league?.state === 'auction' && (
                  <div className="border-t border-line pt-3 space-y-2">
                    <button
                      onClick={handleRestartAuction}
                      className="w-full bg-field hover:bg-field-2 border border-line text-copy-2 text-sm font-medium px-4 py-2 rounded-xl transition-colors text-left"
                    >
                      Restart Auction
                      <span className="block text-xs font-normal text-copy-3 mt-0.5">Recovers a stuck session without wiping data</span>
                    </button>

                    {!confirmReset ? (
                      <button
                        onClick={() => setConfirmReset(true)}
                        className="w-full bg-field hover:bg-danger/10 border border-danger/30 text-danger text-sm font-medium px-4 py-2 rounded-xl transition-colors text-left"
                      >
                        Reset Auction
                        <span className="block text-xs font-normal text-danger/60 mt-0.5">Wipe all bids &amp; assignments — start over from draft</span>
                      </button>
                    ) : (
                      <div className="bg-danger/10 border border-danger/30 rounded-xl p-3 space-y-2">
                        <p className="text-xs font-semibold text-danger">This will permanently delete all lots, bids, and team assignments. Everyone is sent back to draft.</p>
                        <div className="flex gap-2">
                          <button
                            onClick={handleResetAuction}
                            className="flex-1 bg-danger text-white text-xs font-bold py-1.5 rounded-lg hover:bg-danger/80 transition-colors"
                          >
                            Yes, Reset Everything
                          </button>
                          <button
                            onClick={() => setConfirmReset(false)}
                            className="flex-1 bg-field border border-line text-copy-2 text-xs font-medium py-1.5 rounded-lg hover:bg-field-2 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Non-commissioner nomination UI: shown when it's the user's turn */}
            {nominationMode === 'manual' && !isCommissioner && nominatorUserId === user?.uid && status === 'waiting' && league?.state === 'auction' && (
              <div className="bg-card border border-brand/40 rounded-2xl p-4 space-y-3">
                <p className="text-xs font-semibold text-brand uppercase tracking-wide">Your Turn to Nominate</p>
                <div className="flex gap-2">
                  <select
                    value={selectedNomination}
                    onChange={e => setSelectedNomination(e.target.value)}
                    className="flex-1 bg-field border border-line-2 rounded-xl px-3 py-2 text-copy text-sm focus:outline-none focus:border-brand"
                  >
                    <option value="">Pick a team to nominate…</option>
                    {nominationOptions.map(t => (
                      <option key={t.id} value={t.id}>{t.name} ({fln(t.sportLeagueId)})</option>
                    ))}
                  </select>
                  <button
                    onClick={handleNominate}
                    disabled={!selectedNomination || nominating}
                    className="bg-brand hover:bg-brand-2 disabled:opacity-40 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors whitespace-nowrap"
                  >
                    {nominating ? 'Nominating…' : 'Nominate'}
                  </button>
                </div>
              </div>
            )}

            {/* Teams remaining count for random-hidden (no queue revealed) */}
            {nominationMode === 'random-hidden' && hiddenQueueSize > 0 && (
              <div className="bg-card border border-line rounded-2xl px-4 py-3 flex items-center justify-between">
                <p className="text-xs font-semibold text-copy-3 uppercase tracking-wide">Teams Remaining</p>
                <span className="text-2xl font-bold text-copy tabular-nums">
                  {hiddenQueueSize - soldLots.length}
                </span>
              </div>
            )}

            {/* Up Next queue — auction mode, non-hidden */}
            {!isSnake && upcomingQueue.length > 0 && nominationMode !== 'random-hidden' && (
              <div className="bg-card border border-line rounded-2xl p-4">
                <p className="text-xs font-semibold text-copy-3 uppercase tracking-wide mb-3">
                  Up Next — {upcomingQueue.length} remaining
                </p>
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                  {upcomingQueue.slice(0, 12).map(tid => {
                    const info = teamMapRef.current.get(tid);
                    return (
                      <div key={tid} className="flex flex-col items-center gap-1 flex-shrink-0 w-14">
                        <TeamLogo logoUrl={info?.logoUrl ?? null} name={info?.name ?? tid} size={10} />
                        <p className="text-[10px] text-copy-3 text-center leading-tight w-full truncate">{info?.shortName ?? tid.split('_')[0]}</p>
                      </div>
                    );
                  })}
                  {upcomingQueue.length > 12 && (
                    <div className="flex flex-col items-center justify-center flex-shrink-0 w-14">
                      <span className="text-xs text-copy-3">+{upcomingQueue.length - 12}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Snake: upcoming pick order */}
            {isSnake && snakeDraftOrder.length > 0 && status !== 'closed' && (
              <div className="bg-card border border-line rounded-2xl p-4">
                <p className="text-xs font-semibold text-copy-3 uppercase tracking-wide mb-3">
                  Pick Order — {availableTeams.length} team{availableTeams.length !== 1 ? 's' : ''} remaining
                </p>
                <div className="space-y-0.5 max-h-52 overflow-y-auto -mr-1 pr-1">
                  {(() => {
                    const n = snakeDraftOrder.length;
                    const totalPicks = snakePickHistory.length + availableTeams.length;
                    const rows = [];
                    const start = Math.max(0, snakePickIndex - 1);
                    const end = Math.min(totalPicks, snakePickIndex + n * 2 + 1);
                    for (let i = start; i < end; i++) {
                      const round = Math.floor(i / n);
                      const posInRound = i % n;
                      const uid = round % 2 === 0
                        ? snakeDraftOrder[posInRound]
                        : snakeDraftOrder[n - 1 - posInRound];
                      const isCurrent = i === snakePickIndex && status === 'active';
                      const isNext = i === snakePickIndex + 1;
                      const isDone = i < snakePickIndex;
                      const isMe = uid === user?.uid;
                      rows.push(
                        <div key={i} className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg ${isCurrent ? 'bg-brand/10' : isNext ? 'bg-warn/8' : ''}`}>
                          <span className={`text-xs tabular-nums w-5 text-right flex-shrink-0 ${isDone ? 'text-copy-3' : isCurrent ? 'text-brand font-bold' : isNext ? 'text-warn font-semibold' : 'text-copy-3'}`}>
                            {i + 1}
                          </span>
                          <span className={`text-sm flex-1 truncate ${isDone ? 'text-copy-3 line-through' : isCurrent ? 'text-brand font-semibold' : isNext ? (isMe ? 'text-brand font-semibold' : 'text-warn font-semibold') : isMe ? 'text-brand font-medium' : 'text-copy'}`}>
                            {isMe ? 'You' : participantName(uid)}
                          </span>
                          {isDone && snakePickHistory[i] && (
                            <span className="text-xs text-copy-3 truncate max-w-[90px]">{snakePickHistory[i].teamName}</span>
                          )}
                          {isCurrent && (
                            <span className="text-[10px] font-bold bg-brand text-white px-1.5 py-0.5 rounded-full flex-shrink-0">NOW</span>
                          )}
                          {isNext && (
                            <span className="text-[10px] font-bold bg-warn text-white px-1.5 py-0.5 rounded-full flex-shrink-0">NEXT</span>
                          )}
                          {!isCurrent && !isNext && !isDone && posInRound === 0 && (
                            <span className="text-[10px] text-copy-3 flex-shrink-0">R{round + 1}</span>
                          )}
                        </div>
                      );
                    }
                    return rows;
                  })()}
                </div>
              </div>
            )}

            {/* Results — auction mode */}
            {!isSnake && soldLots.length > 0 && (
              <div className="bg-card border border-line rounded-2xl p-4">
                <p className="text-xs font-semibold text-copy-3 uppercase tracking-wide mb-3">
                  Results — {soldLots.filter(l => !l.passed).length} sold, {soldLots.filter(l => l.passed).length} passed
                </p>
                <div className="space-y-2 max-h-64 overflow-y-auto -mr-1 pr-1">
                  {soldLots.map((lot, i) => (
                    <div key={`${lot.teamId}-${i}`} className="flex items-center gap-3 py-2 border-b border-line last:border-0">
                      <TeamLogo logoUrl={lot.logoUrl} name={lot.teamName} size={8} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-copy truncate">{lot.teamName}</p>
                        {lot.passed
                          ? <p className="text-xs text-copy-3">Passed</p>
                          : <p className="text-xs text-copy-2">{lot.winnerName} — <span className="text-copy font-semibold">${lot.winningBid}</span></p>
                        }
                      </div>
                      {lot.passed
                        ? <span className="text-xs text-copy-3 font-medium px-2 py-0.5 rounded-full bg-field">PASS</span>
                        : <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${lot.winnerId === user?.uid ? 'bg-brand/15 text-brand' : 'bg-positive/10 text-positive'}`}>
                            {lot.winnerId === user?.uid ? 'YOURS' : 'SOLD'}
                          </span>
                      }
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Snake: draft pick history */}
            {isSnake && snakePickHistory.length > 0 && (
              <div className="bg-card border border-line rounded-2xl p-4">
                <p className="text-xs font-semibold text-copy-3 uppercase tracking-wide mb-3">
                  Draft Picks — {snakePickHistory.length} made
                </p>
                <div className="space-y-2 max-h-64 overflow-y-auto -mr-1 pr-1">
                  {[...snakePickHistory].reverse().map((pick, i) => (
                    <div key={pick.pickIndex} className="flex items-center gap-3 py-2 border-b border-line last:border-0">
                      <span className="text-xs text-copy-3 tabular-nums w-6 text-right flex-shrink-0">
                        {pick.pickIndex + 1}
                      </span>
                      <TeamLogo logoUrl={pick.logoUrl} name={pick.teamName} size={8} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-copy truncate">{pick.teamName}</p>
                        <p className="text-xs text-copy-2 truncate">
                          {pick.pickerUserId === user?.uid ? 'You' : pick.pickerName}
                        </p>
                      </div>
                      {pick.pickerUserId === user?.uid && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-brand/15 text-brand flex-shrink-0">
                          YOURS
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Teams panel — auction mode only (snake shows teams in draft clock card) */}
            {!isSnake && allAuctionTeams.length > 0 && status !== 'closed' && (
              <div className="bg-card border border-line rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-copy-3 uppercase tracking-wide">Teams</p>
                  <select
                    value={teamViewMode}
                    onChange={e => setTeamViewMode(e.target.value as typeof teamViewMode)}
                    className="bg-field border border-line-2 rounded-lg px-2 py-1 text-xs text-copy-2 focus:outline-none focus:border-brand transition-colors cursor-pointer"
                  >
                    <option value="available">Available</option>
                    <option value="all">All</option>
                    <option value="drafted">Drafted</option>
                  </select>
                </div>

                {/* Sport filter tabs */}
                {orderedLeagueSports.length > 1 && (
                  <div className="flex gap-1.5 flex-wrap mb-3">
                    <button
                      onClick={() => setAvailableFilter('')}
                      className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                        availableFilter === '' ? 'bg-brand text-white' : 'bg-field text-copy-2 hover:bg-field-2'
                      }`}
                    >
                      All
                    </button>
                    {orderedLeagueSports.map(sport => {
                      const count = teamPanelBase.filter(t => t.sportLeagueId === sport).length;
                      return (
                        <button
                          key={sport}
                          onClick={() => setAvailableFilter(sport)}
                          className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                            availableFilter === sport ? 'bg-brand text-white' : 'bg-field text-copy-2 hover:bg-field-2'
                          }`}
                        >
                          {fln(sport)} <span className="opacity-70">({count})</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {teamPanelList.length > 0 ? (
                  <div className="grid gap-1.5 max-h-72 overflow-y-auto" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(56px, 1fr))' }}>
                    {teamPanelList.map(team => {
                      const greyed = greyedIds.has(team.id);
                      return (
                        <div
                          key={team.id}
                          onClick={() => openProfile({ teamId: team.id, leagueId: id, name: team.name, logoUrl: team.logoUrl, sportLeagueId: team.sportLeagueId })}
                          className={`flex flex-col items-center gap-1 p-1.5 rounded-lg cursor-pointer hover:bg-field transition-colors ${greyed ? 'opacity-40 grayscale' : ''}`}
                          title={team.name}
                        >
                          <TeamLogo logoUrl={team.logoUrl} name={team.name} size={8} />
                          <p className="text-[10px] text-copy-3 text-center leading-tight w-full truncate">{team.shortName}</p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-copy-3 text-center py-4">
                    {teamViewMode === 'drafted'
                      ? (availableFilter ? `No ${fln(availableFilter)} teams drafted yet` : 'No teams drafted yet')
                      : (availableFilter ? `No ${fln(availableFilter)} teams remaining` : 'All teams have been auctioned')}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* ── Right sidebar ─────────────────────────────────────── */}
          <div className="space-y-4">

            {/* Nomination order — manual mode only */}
            {nominationMode === 'manual' && nominationOrderState.length > 0 && status !== 'closed' && (
              <div className="bg-card border border-line rounded-2xl p-4">
                <p className="text-xs font-semibold text-copy-3 uppercase tracking-wide mb-3">Nomination Order</p>
                <div className="space-y-0.5">
                  {nominationOrderState.map((uid, idx) => {
                    const currentIdx = nominationOrderState.findIndex(id => id === nominatorUserId);
                    const offset = currentIdx >= 0 ? (idx - currentIdx + nominationOrderState.length) % nominationOrderState.length : -1;
                    const isNow = offset === 0 && nominatorUserId !== null;
                    const isNext = offset === 1 && nominatorUserId !== null;
                    const isMe = uid === user?.uid;
                    return (
                      <div key={uid} className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg ${isNow ? 'bg-brand/10' : isNext ? 'bg-warn/8' : ''}`}>
                        <span className={`text-xs tabular-nums w-4 text-right flex-shrink-0 ${isNow ? 'text-brand font-bold' : isNext ? 'text-warn font-semibold' : 'text-copy-3'}`}>
                          {idx + 1}
                        </span>
                        <span className={`text-sm flex-1 truncate ${isNow ? 'text-brand font-semibold' : isNext ? (isMe ? 'text-brand font-semibold' : 'text-warn font-semibold') : isMe ? 'text-brand font-medium' : 'text-copy'}`}>
                          {isMe ? 'You' : participantName(uid)}
                        </span>
                        {isNow && (
                          <span className="text-[10px] font-bold bg-brand text-white px-1.5 py-0.5 rounded-full flex-shrink-0">NOW</span>
                        )}
                        {isNext && (
                          <span className="text-[10px] font-bold bg-warn text-white px-1.5 py-0.5 rounded-full flex-shrink-0">NEXT</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* My budget — auction mode only */}
            {!isSnake && (
              <div className="bg-card border border-line rounded-2xl p-4">
                <p className="text-xs font-semibold text-copy-3 uppercase tracking-wide mb-2">Your Budget</p>
                <p className="text-3xl font-bold text-copy tabular-nums mb-1">${myBudget}</p>
                <div className="w-full h-1.5 rounded-full bg-field-2 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-brand transition-all"
                    style={{ width: `${startingBudget > 0 ? Math.round((myBudget / startingBudget) * 100) : 0}%` }}
                  />
                </div>
                <p className="text-xs text-copy-3 mt-1">of ${startingBudget} remaining</p>
              </div>
            )}

            {/* Roster viewer */}
            {(() => {
              const maxWildcard = league?.auctionConfig?.maxWildcard ?? 0;
              // Compute wildcard lots: teams that fill slots beyond each sport's per-sport max
              const wildcardLots: typeof ownedLots = [];
              const normalLotsByLot = new Set<string>();
              if (maxWildcard > 0) {
                const bySport: Record<string, typeof ownedLots> = {};
                for (const l of ownedLots) {
                  const sport = teamMapRef.current.get(l.teamId)?.sportLeagueId ?? '';
                  (bySport[sport] ??= []).push(l);
                }
                for (const [sport, lots] of Object.entries(bySport)) {
                  const max = getMaxForSport(sport);
                  lots.slice(0, max).forEach(l => normalLotsByLot.add(l.teamId));
                  lots.slice(max).forEach(l => wildcardLots.push(l));
                }
              }
              return (
                <div className="bg-card border border-line rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-copy-3 uppercase tracking-wide">Roster</p>
                    <select
                      value={rosterView}
                      onChange={e => setRosterView(e.target.value)}
                      className="text-xs bg-field border border-line-2 rounded-lg px-2 py-1 text-copy focus:outline-none focus:border-brand max-w-[130px]"
                    >
                      <option value="">You</option>
                      {sortedParticipants
                        .filter(ft => ft.userId !== user?.uid)
                        .map(ft => <option key={ft.userId} value={ft.userId}>{ft.displayName}</option>)}
                    </select>
                  </div>
                  <div className="space-y-3">
                    {orderedLeagueSports.map(sport => {
                      const max = getMaxForSport(sport);
                      const allInSport = ownedLots.filter(l => teamMapRef.current.get(l.teamId)?.sportLeagueId === sport);
                      const wonInSport = maxWildcard > 0 ? allInSport.slice(0, max) : allInSport;
                      const emptyCount = Math.max(0, max - wonInSport.length);
                      const isFull = wonInSport.length >= max;
                      return (
                        <div key={sport}>
                          <div className="flex items-center justify-between mb-1.5">
                            <p className="text-xs font-semibold text-copy-2">{fln(sport)}</p>
                            <span className={`text-[10px] font-medium ${isFull ? 'text-positive' : 'text-copy-3'}`}>
                              {wonInSport.length}/{max}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {wonInSport.map(t => {
                              const info = teamMapRef.current.get(t.teamId);
                              return (
                                <div key={t.teamId} title={t.teamName} className="flex flex-col items-center gap-0.5 w-10">
                                  <TeamLogo logoUrl={t.logoUrl} name={t.teamName} size={8} />
                                  <p className="text-[10px] text-copy-3 text-center leading-tight w-full truncate">
                                    {info?.shortName ?? t.teamName.split(' ').pop() ?? ''}
                                  </p>
                                </div>
                              );
                            })}
                            {Array.from({ length: emptyCount }).map((_, i) => (
                              <div key={`empty-${i}`} className="w-8 h-8 rounded-lg border-2 border-dashed border-line flex-shrink-0" />
                            ))}
                          </div>
                        </div>
                      );
                    })}

                  </div>
                </div>
              );
            })()}

            {/* Participants */}
            <div className="bg-card border border-line rounded-2xl p-4">
              <p className="text-xs font-semibold text-copy-3 uppercase tracking-wide mb-3">Participants</p>
              <div className="space-y-2">
                {(isSnake
                  ? [...sortedParticipants].sort((a, b) => {
                      const aPicks = snakePickHistory.filter(p => p.pickerUserId === a.userId).length;
                      const bPicks = snakePickHistory.filter(p => p.pickerUserId === b.userId).length;
                      return bPicks - aPicks;
                    })
                  : sortedParticipants
                ).map(ft => {
                  const isMe = ft.userId === user?.uid;
                  const isHighBidder = !isSnake && currentLot?.currentBidderId === ft.userId;
                  const isOnClock = isSnake && snakePickerUserId === ft.userId;
                  const wonCount = isSnake
                    ? snakePickHistory.filter(p => p.pickerUserId === ft.userId).length
                    : soldLots.filter(l => !l.passed && l.winnerId === ft.userId).length;
                  return (
                    <div key={ft.id} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg ${isMe ? 'bg-brand/8' : isOnClock ? 'bg-warn/8' : ''}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className={`text-sm font-medium truncate ${isMe ? 'text-brand' : 'text-copy'}`}>
                            {isMe ? 'You' : ft.displayName}
                          </p>
                          {isHighBidder && (
                            <span className="text-[10px] font-bold bg-brand text-white px-1.5 py-0.5 rounded-full">HIGH</span>
                          )}
                          {isOnClock && (
                            <span className="text-[10px] font-bold bg-warn text-white px-1.5 py-0.5 rounded-full">PICK</span>
                          )}
                        </div>
                        {wonCount > 0 && <p className="text-[10px] text-copy-3">{wonCount} team{wonCount !== 1 ? 's' : ''}</p>}
                      </div>
                      {!isSnake && (
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-bold tabular-nums text-copy">${ft.remainingBudget}</p>
                          <div className="w-12 h-1 rounded-full bg-field-2 mt-0.5 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-positive transition-all"
                              style={{ width: `${startingBudget > 0 ? Math.round((ft.remainingBudget / startingBudget) * 100) : 0}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
