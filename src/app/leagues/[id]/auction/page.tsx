'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { api, WS_URL } from '@/lib/api';
import { io, type Socket } from 'socket.io-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface League {
  id: string; name: string; commissionerId: string; state: string;
  auctionConfig: {
    startingBudget: number; minOpeningBid: number; minBidIncrement: number;
    nominationMode: string; countdownSeconds: number;
  } | null;
}

interface FantasyTeam { id: string; userId: string; displayName: string; remainingBudget: number; isPlaceholder: boolean; }
interface SportTeam { id: string; name: string; shortName: string; sportLeagueId: string; logoUrl: string | null; }
interface SportGroup { sport: string; teams: SportTeam[]; }

interface CurrentLot {
  teamId: string; teamName: string; logoUrl: string | null; sportLeagueId: string;
  currentBid: number; currentBidderId: string | null; timerRemaining: number; totalSeconds: number;
}

interface SoldLot {
  teamId: string; teamName: string; logoUrl: string | null;
  winnerId: string | null; winnerName: string | null; winningBid: number; passed: boolean;
}

interface Toast { id: number; type: 'success' | 'error' | 'info' | 'warn'; message: string; }

type AuctionStatus = 'connecting' | 'waiting' | 'active' | 'closed' | 'error';

// ─── Constants ────────────────────────────────────────────────────────────────

const ACRONYMS = new Set(['nhl', 'nba', 'nfl', 'mlb', 'ucl', 'ncaa', 'mls', 'fifa', 'ufc']);
const fln = (id: string) =>
  id.split('-').map(w => ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w[0]?.toUpperCase() + w.slice(1).toLowerCase()).join(' ');

const TIMER_R = 40;
const TIMER_CIRC = 2 * Math.PI * TIMER_R;

// ─── Sub-components ───────────────────────────────────────────────────────────

function Dot({ color }: { color: 'green' | 'red' | 'yellow' }) {
  const cls = { green: 'bg-positive', red: 'bg-danger', yellow: 'bg-warn' }[color];
  return <div className={`w-2 h-2 rounded-full ${cls} animate-pulse`} />;
}

function TeamLogo({ logoUrl, name, size = 10 }: { logoUrl: string | null; name: string; size?: number }) {
  const [err, setErr] = useState(false);
  if (logoUrl && !err) {
    return (
      <img
        src={logoUrl} alt={name}
        className={`w-${size} h-${size} object-contain`}
        onError={() => setErr(true)}
      />
    );
  }
  return (
    <div className={`w-${size} h-${size} rounded-lg bg-field-2 border border-line flex items-center justify-center text-copy-3 text-xs font-bold`}>
      {name.slice(0, 2).toUpperCase()}
    </div>
  );
}

function TimerRing({ remaining, total }: { remaining: number; total: number }) {
  const pct = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
  const offset = TIMER_CIRC * (1 - pct);
  const strokeColor = pct > 0.5 ? '#22c55e' : pct > 0.25 ? '#f59e0b' : '#ef4444';
  const textCls = pct > 0.5 ? 'text-positive' : pct > 0.25 ? 'text-warn' : 'text-danger';
  return (
    <div className="relative w-24 h-24 flex items-center justify-center flex-shrink-0">
      <svg width="96" height="96" className="absolute inset-0 -rotate-90">
        <circle cx="48" cy="48" r={TIMER_R} fill="none" stroke="var(--color-line)" strokeWidth="5" />
        <circle
          cx="48" cy="48" r={TIMER_R} fill="none" stroke={strokeColor} strokeWidth="5"
          strokeDasharray={TIMER_CIRC} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.9s linear, stroke 0.3s' }}
        />
      </svg>
      <span className={`relative z-10 text-2xl font-bold tabular-nums ${textCls}`}>{remaining}</span>
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
  const [nominationMode, setNominationMode] = useState('random');
  const [minBidIncrement, setMinBidIncrement] = useState(1);
  const [minOpeningBid, setMinOpeningBid] = useState(1);
  const [lotFlash, setLotFlash] = useState<'sold' | 'passed' | null>(null);

  // ── UI ────────────────────────────────────────────────────────────────────
  const [bidInput, setBidInput] = useState('');
  const [bidError, setBidError] = useState('');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [nominating, setNominating] = useState(false);
  const [selectedNomination, setSelectedNomination] = useState('');
  const [auctionErrorMsg, setAuctionErrorMsg] = useState('');

  const socketRef = useRef<Socket | null>(null);
  const toastId = useRef(0);
  const lotFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Derived ───────────────────────────────────────────────────────────────
  const isCommissioner = league?.commissionerId === user?.uid;
  const myFt = fantasyTeams.find(ft => ft.userId === user?.uid && !ft.isPlaceholder);
  const myBudget = myFt?.remainingBudget ?? 0;
  const startingBudget = league?.auctionConfig?.startingBudget ?? 100;
  const iAmHighBidder = currentLot?.currentBidderId === user?.uid;
  const minNextBid = currentLot
    ? (currentLot.currentBidderId === null ? minOpeningBid : currentLot.currentBid + minBidIncrement)
    : minOpeningBid;

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
        if (session.minBidIncrement) setMinBidIncrement(session.minBidIncrement);
        if (session.minOpeningBid) setMinOpeningBid(session.minOpeningBid);
        if (session.nominationMode) setNominationMode(session.nominationMode);

        // Remaining queue: everything after the current index
        const remaining: string[] = session.queue?.slice((session.currentIndex ?? -1) + 1) ?? [];
        setUpcomingQueue(remaining);

        // Reconstruct current lot if in-progress
        if (session.currentLot && session.status === 'active') {
          const { teamId, currentBid, currentBidderId, timerRemaining } = session.currentLot;
          const info = teamInfo(teamId);
          setCurrentLot({
            teamId,
            teamName: info?.name ?? teamId,
            logoUrl: info?.logoUrl ?? null,
            sportLeagueId: info?.sportLeagueId ?? '',
            currentBid,
            currentBidderId,
            timerRemaining,
            totalSeconds: session.countdownSeconds ?? 30,
          });
        }

        // Reconstruct completed lots
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
        }
      });

      socket.on('auction_started', (data: any) => {
        setStatus('waiting');
        if (data.nominationMode) setNominationMode(data.nominationMode);
        // Queue is sent for manual and disclosed modes; null for random-hidden
        if (data.queue) setUpcomingQueue(data.queue);
        toast('info', 'The auction has started!');
      });

      socket.on('lot_opened', (data: any) => {
        // Cancel any pending "clear lot" timeout from team_sold / team_passed
        if (lotFlashTimerRef.current) {
          clearTimeout(lotFlashTimerRef.current);
          lotFlashTimerRef.current = null;
        }
        const info = teamInfo(data.teamId);
        setCurrentLot({
          teamId: data.teamId,
          teamName: data.teamName ?? info?.name ?? data.teamId,
          logoUrl: info?.logoUrl ?? null,
          sportLeagueId: data.sportLeagueId ?? info?.sportLeagueId ?? '',
          currentBid: data.openingBid ?? minOpeningBid,
          currentBidderId: null,
          timerRemaining: data.timerSeconds ?? 30,
          totalSeconds: data.timerSeconds ?? 30,
        });
        setStatus('active');
        setLotFlash(null);
        setBidInput('');
        setBidError('');
        setUpcomingQueue(q => q.filter(tid => tid !== data.teamId));
      });

      socket.on('new_high_bid', (data: any) => {
        setCurrentLot(prev => {
          if (!prev) return prev;
          const wasMe = prev.currentBidderId === userRef.current?.uid;
          const isNowMe = data.bidderId === userRef.current?.uid;
          if (wasMe && !isNowMe) toast('warn', `Outbid! New high bid: $${data.amount}`);
          return { ...prev, currentBid: data.amount, currentBidderId: data.bidderId, timerRemaining: data.timerRemaining };
        });
      });

      socket.on('timer_update', (data: any) => {
        setCurrentLot(prev => prev ? { ...prev, timerRemaining: data.remaining } : prev);
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

      socket.on('auction_closed', () => {
        setStatus('closed');
        setCurrentLot(null);
        toast('info', 'The auction has ended.');
      });

      socket.on('bid_accepted', (data: any) => {
        toast('success', `Bid of $${data.amount} placed`);
        setBidInput('');
        setBidError('');
      });

      socket.on('bid_rejected', (data: any) => {
        setBidError(data.reason ?? 'Bid rejected');
        toast('error', data.reason ?? 'Bid rejected');
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
    socketRef.current.emit('place_bid', { amount });
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
    socketRef.current?.emit('commissioner_nominate', { teamId: selectedNomination });
    setSelectedNomination('');
    setTimeout(() => setNominating(false), 800);
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

  // ── Render ────────────────────────────────────────────────────────────────

  const nominationOptions = upcomingQueue
    .map(tid => teamMapRef.current.get(tid))
    .filter(Boolean) as SportTeam[];

  const sortedParticipants = [...fantasyTeams]
    .filter(ft => !ft.isPlaceholder)
    .sort((a, b) => b.remainingBudget - a.remainingBudget);

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
          <span className="text-brand font-semibold">Auction Room</span>
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
          <p>Joining auction room…</p>
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
                  {nominationMode === 'manual' ? 'Waiting for commissioner to nominate a team…' : 'Preparing next team…'}
                </p>
                {nominationMode === 'manual' && !isCommissioner && (
                  <p className="text-copy-3 text-xs mt-1">The commissioner will pick the next team to auction.</p>
                )}
              </div>
            )}

            {/* Current Lot */}
            {(status === 'active' || lotFlash) && currentLot && (
              <div className={`bg-card border rounded-2xl p-5 transition-colors ${
                lotFlash === 'sold'   ? 'border-positive/50 bg-positive/5' :
                lotFlash === 'passed' ? 'border-line' : 'border-brand/30'
              }`}>
                <div className="flex items-start gap-4 mb-4">
                  <TeamLogo logoUrl={currentLot.logoUrl} name={currentLot.teamName} size={14} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-copy-3 uppercase tracking-wide mb-0.5">
                      {fln(currentLot.sportLeagueId)}
                    </p>
                    <h2 className="text-xl font-bold text-copy leading-tight truncate">{currentLot.teamName}</h2>
                    {lotFlash && (
                      <span className={`inline-block mt-1 text-xs font-bold px-2 py-0.5 rounded-full ${
                        lotFlash === 'sold' ? 'bg-positive/20 text-positive' : 'bg-line text-copy-3'
                      }`}>
                        {lotFlash === 'sold' ? 'SOLD' : 'PASSED'}
                      </span>
                    )}
                  </div>
                  <TimerRing remaining={currentLot.timerRemaining} total={currentLot.totalSeconds} />
                </div>

                {/* Bid info */}
                <div className="flex items-end gap-4 mb-4">
                  <div>
                    <p className="text-xs text-copy-3 mb-0.5">Current bid</p>
                    <p className="text-4xl font-bold text-copy tabular-nums">${currentLot.currentBid}</p>
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
                        disabled={iAmHighBidder || myBudget < minNextBid}
                        className="bg-brand hover:bg-brand-2 disabled:opacity-40 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm whitespace-nowrap"
                      >
                        {iAmHighBidder ? 'High Bidder' : 'Place Bid'}
                      </button>
                    </div>
                    {bidError && <p className="text-danger text-xs">{bidError}</p>}
                    {/* Quick bid buttons */}
                    {!iAmHighBidder && myBudget >= minNextBid && (
                      <div className="flex gap-2">
                        {[minNextBid, minNextBid + minBidIncrement * 4, minNextBid + minBidIncrement * 9, minNextBid + minBidIncrement * 24]
                          .filter((a, i, arr) => a <= myBudget && arr.indexOf(a) === i)
                          .slice(0, 4)
                          .map(amt => (
                            <button
                              key={amt}
                              type="button"
                              onClick={() => placeBid(amt)}
                              className="flex-1 text-xs bg-field hover:bg-field-2 border border-line text-copy-2 py-2 rounded-lg transition-colors"
                            >
                              ${amt}
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
              <div className="bg-card border border-line rounded-2xl p-4">
                <p className="text-xs font-semibold text-copy-3 uppercase tracking-wide mb-3">Commissioner</p>
                <div className="flex flex-wrap gap-2">
                  {/* Start auction if not yet started */}
                  {status === 'waiting' && connected && league?.state === 'draft' && (
                    <button
                      onClick={handleStartAuction}
                      disabled={!league.auctionConfig}
                      title={!league.auctionConfig ? 'Configure auction settings first' : undefined}
                      className="bg-brand hover:bg-brand-2 disabled:opacity-40 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
                    >
                      Start Auction
                    </button>
                  )}
                  {/* Skip current lot */}
                  {status === 'active' && currentLot && (
                    <button
                      onClick={skipLot}
                      className="bg-field hover:bg-field-2 border border-line text-copy-2 text-sm font-medium px-4 py-2 rounded-xl transition-colors"
                    >
                      Skip / Pass Team
                    </button>
                  )}
                  {/* Manual mode: pick next team */}
                  {nominationMode === 'manual' && status === 'waiting' && league?.state === 'auction' && (
                    <div className="flex gap-2 w-full">
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
                  )}
                  {/* Auto/manual modes: force-advance if stuck (e.g. after server restart) */}
                  {status === 'waiting' && league?.state === 'auction' && (
                    <button
                      onClick={forceNextLot}
                      className="bg-field hover:bg-field-2 border border-line text-copy-2 text-sm font-medium px-4 py-2 rounded-xl transition-colors"
                    >
                      Force Next Team
                    </button>
                  )}
                  {/* Restart button — rebuilds the session if it's unrecoverable */}
                  {status === 'waiting' && league?.state === 'auction' && (
                    <button
                      onClick={handleRestartAuction}
                      className="bg-field hover:bg-field-2 border border-danger/30 text-danger text-sm font-medium px-4 py-2 rounded-xl transition-colors"
                    >
                      Restart Auction
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Up Next queue */}
            {upcomingQueue.length > 0 && (
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

            {/* Results */}
            {soldLots.length > 0 && (
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
          </div>

          {/* ── Right sidebar ─────────────────────────────────────── */}
          <div className="space-y-4">

            {/* My budget */}
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

            {/* Participants */}
            <div className="bg-card border border-line rounded-2xl p-4">
              <p className="text-xs font-semibold text-copy-3 uppercase tracking-wide mb-3">Participants</p>
              <div className="space-y-2">
                {sortedParticipants.map(ft => {
                  const isMe = ft.userId === user?.uid;
                  const isHighBidder = currentLot?.currentBidderId === ft.userId;
                  const wonCount = soldLots.filter(l => !l.passed && l.winnerId === ft.userId).length;
                  return (
                    <div key={ft.id} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg ${isMe ? 'bg-brand/8' : ''}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className={`text-sm font-medium truncate ${isMe ? 'text-brand' : 'text-copy'}`}>
                            {isMe ? 'You' : ft.displayName}
                          </p>
                          {isHighBidder && (
                            <span className="text-[10px] font-bold bg-brand text-white px-1.5 py-0.5 rounded-full">HIGH</span>
                          )}
                        </div>
                        {wonCount > 0 && <p className="text-[10px] text-copy-3">{wonCount} team{wonCount !== 1 ? 's' : ''}</p>}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-bold tabular-nums text-copy">${ft.remainingBudget}</p>
                        <div className="w-12 h-1 rounded-full bg-field-2 mt-0.5 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-positive transition-all"
                            style={{ width: `${startingBudget > 0 ? Math.round((ft.remainingBudget / startingBudget) * 100) : 0}%` }}
                          />
                        </div>
                      </div>
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
