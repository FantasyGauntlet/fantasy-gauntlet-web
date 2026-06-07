'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { io, Socket } from 'socket.io-client';

interface AuctionState {
  status: 'idle' | 'nominating' | 'bidding' | 'closed';
  currentItem: { teamId: number; teamName: string; nominatedBy: string } | null;
  currentBid: { amount: number; userId: string; displayName: string } | null;
  countdown: number;
  queue: number[];
}

interface BidEvent {
  teamId: number;
  amount: number;
  userId: string;
  displayName: string;
}

export default function AuctionPage() {
  const { id: leagueId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const [auctionState, setAuctionState] = useState<AuctionState | null>(null);
  const [bidAmount, setBidAmount] = useState('');
  const [budget, setBudget] = useState<number | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log]);

  useEffect(() => {
    let socket: Socket;

    async function connect() {
      const token = await user!.getIdToken();
      socket = io(`${process.env.NEXT_PUBLIC_WS_URL}/auction`, {
        auth: { token },
        transports: ['websocket'],
      });
      socketRef.current = socket;

      socket.on('connect', () => {
        setConnected(true);
        socket.emit('join_league', { leagueId });
        addLog('Connected to auction room');
      });
      socket.on('disconnect', () => {
        setConnected(false);
        addLog('Disconnected');
      });
      socket.on('auction_state', (state: AuctionState) => setAuctionState(state));
      socket.on('bid_placed', (bid: BidEvent) => {
        addLog(`${bid.displayName} bid $${bid.amount} on Team #${bid.teamId}`);
        setAuctionState((prev) => prev ? { ...prev, currentBid: { amount: bid.amount, userId: bid.userId, displayName: bid.displayName } } : prev);
      });
      socket.on('item_sold', ({ teamId, amount, winnerId }: { teamId: number; amount: number; winnerId: string }) => {
        addLog(`Team #${teamId} sold for $${amount}`);
        if (winnerId === user?.uid && budget !== null) setBudget((b) => (b ?? 0) - amount);
      });
      socket.on('countdown', ({ seconds }: { seconds: number }) => {
        setAuctionState((prev) => prev ? { ...prev, countdown: seconds } : prev);
      });
      socket.on('error', ({ message }: { message: string }) => addLog(`Error: ${message}`));
    }

    if (user) connect();
    return () => { socket?.disconnect(); };
  }, [user, leagueId]);

  useEffect(() => {
    api.get<{ budget: number }>(`/leagues/${leagueId}/auction/state`)
      .then((s) => setBudget(s.budget))
      .catch(() => {});
  }, [leagueId]);

  function addLog(msg: string) {
    setLog((l) => [...l.slice(-99), `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }

  function placeBid() {
    const amount = Number(bidAmount);
    if (!amount || !auctionState?.currentItem) return;
    socketRef.current?.emit('place_bid', { leagueId, teamId: auctionState.currentItem.teamId, amount });
    setBidAmount('');
  }

  const minBid = (auctionState?.currentBid?.amount ?? 0) + 1;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Auction Room</h1>
        <div className={`flex items-center gap-2 text-sm ${connected ? 'text-green-400' : 'text-red-400'}`}>
          <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400'}`} />
          {connected ? 'Live' : 'Disconnected'}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Current Item */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="text-sm font-medium text-gray-400 uppercase mb-4">On the Block</h2>
            {auctionState?.currentItem ? (
              <div>
                <p className="text-3xl font-bold text-white mb-1">{auctionState.currentItem.teamName}</p>
                <p className="text-gray-400 text-sm mb-6">Team #{auctionState.currentItem.teamId}</p>

                <div className="flex items-end justify-between mb-6">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Current Bid</p>
                    <p className="text-4xl font-bold text-indigo-400">
                      ${auctionState.currentBid?.amount ?? 1}
                    </p>
                    {auctionState.currentBid && (
                      <p className="text-sm text-gray-400 mt-1">by {auctionState.currentBid.displayName}</p>
                    )}
                  </div>
                  {auctionState.countdown > 0 && (
                    <div className={`text-5xl font-bold ${auctionState.countdown <= 5 ? 'text-red-400' : 'text-white'}`}>
                      {auctionState.countdown}s
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <input
                    type="number"
                    min={minBid}
                    value={bidAmount}
                    onChange={(e) => setBidAmount(e.target.value)}
                    placeholder={`Min $${minBid}`}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    onKeyDown={(e) => e.key === 'Enter' && placeBid()}
                  />
                  <button
                    onClick={placeBid}
                    disabled={!bidAmount || Number(bidAmount) < minBid}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium px-6 py-2.5 rounded-lg transition-colors"
                  >
                    Bid
                  </button>
                </div>

                {/* Quick bid buttons */}
                <div className="flex gap-2 mt-3">
                  {[minBid, minBid + 4, minBid + 9, minBid + 24].map((amt) => (
                    <button
                      key={amt}
                      onClick={() => { setBidAmount(String(amt)); }}
                      className="flex-1 text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 py-2 rounded-lg transition-colors"
                    >
                      ${amt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">
                {auctionState?.status === 'idle' ? 'Waiting for auction to start...' : 'Waiting for next nomination...'}
              </p>
            )}
          </div>

          {/* Activity Log */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <h2 className="text-sm font-medium text-gray-400 uppercase mb-3">Activity</h2>
            <div className="h-40 overflow-y-auto space-y-1">
              {log.map((entry, i) => (
                <p key={i} className="text-xs text-gray-400 font-mono">{entry}</p>
              ))}
              {log.length === 0 && <p className="text-xs text-gray-600">Waiting for activity...</p>}
              <div ref={logEndRef} />
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {budget !== null && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <p className="text-xs text-gray-400 uppercase mb-1">Your Budget</p>
              <p className="text-3xl font-bold text-green-400">${budget}</p>
            </div>
          )}

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-xs text-gray-400 uppercase mb-3">Queue</p>
            {auctionState?.queue?.length ? (
              <div className="space-y-1">
                {auctionState.queue.map((teamId) => (
                  <div key={teamId} className="text-sm text-gray-300 py-1 border-b border-gray-800 last:border-0">
                    Team #{teamId}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-600">Queue is empty</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
