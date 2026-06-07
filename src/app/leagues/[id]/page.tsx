'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

interface League {
  id: string;
  name: string;
  sport: string;
  state: string;
  maxMembers: number;
  commissionerId: string;
  inviteCode: string;
  memberUserIds: string[];
}

interface Standing {
  userId: string;
  displayName: string;
  rank: number;
  totalPoints: number;
  wins: number;
  losses: number;
  ownedTeamIds: number[];
}

export default function LeaguePage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const [league, setLeague] = useState<League | null>(null);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [tab, setTab] = useState<'standings' | 'waivers' | 'settings'>('standings');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get<League>(`/leagues/${id}`),
      api.get<Standing[]>(`/leagues/${id}/standings`),
    ]).then(([l, s]) => {
      setLeague(l);
      setStandings(s);
    }).catch(() => router.replace('/dashboard'))
      .finally(() => setLoading(false));
  }, [id, router]);

  function copyInviteCode() {
    if (!league) return;
    navigator.clipboard.writeText(league.inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function startAuction() {
    await api.post(`/leagues/${id}/auction/start`);
    router.push(`/leagues/${id}/auction`);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
      </div>
    );
  }

  if (!league) return null;

  const isCommissioner = league.commissionerId === user?.uid;
  const stateColors: Record<string, string> = {
    draft: 'bg-yellow-900 text-yellow-300',
    auction: 'bg-blue-900 text-blue-300',
    active: 'bg-green-900 text-green-300',
    completed: 'bg-gray-700 text-gray-300',
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">{league.name}</h1>
          <div className="flex items-center gap-3 mt-2">
            <span className={`text-xs font-medium px-2 py-1 rounded-full ${stateColors[league.state] ?? 'bg-gray-700 text-gray-300'}`}>
              {league.state}
            </span>
            <span className="text-gray-400 text-sm capitalize">{league.sport}</span>
            <span className="text-gray-400 text-sm">{league.memberUserIds?.length ?? 0} / {league.maxMembers} members</span>
          </div>
        </div>
        <div className="flex gap-2">
          {league.state === 'auction' && (
            <Link
              href={`/leagues/${id}/auction`}
              className="bg-blue-600 hover:bg-blue-500 text-white font-medium px-4 py-2 rounded-lg transition-colors text-sm"
            >
              Enter Auction Room
            </Link>
          )}
          {isCommissioner && league.state === 'draft' && (
            <button
              onClick={startAuction}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-4 py-2 rounded-lg transition-colors text-sm"
            >
              Start Auction
            </button>
          )}
          <button
            onClick={copyInviteCode}
            className="bg-gray-800 hover:bg-gray-700 text-white font-medium px-4 py-2 rounded-lg transition-colors text-sm"
          >
            {copied ? '✓ Copied!' : 'Copy Invite Code'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-800 rounded-lg p-1 mb-6 w-fit">
        {(['standings', 'waivers', 'settings'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${
              tab === t ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Standings Tab */}
      {tab === 'standings' && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Rank</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Manager</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-400 uppercase">Points</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-400 uppercase">W-L</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-400 uppercase">Teams</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s) => (
                <tr key={s.userId} className={`border-b border-gray-800/50 ${s.userId === user?.uid ? 'bg-indigo-900/10' : ''}`}>
                  <td className="px-4 py-3 text-white font-medium">#{s.rank}</td>
                  <td className="px-4 py-3 text-white">
                    {s.displayName}
                    {s.userId === user?.uid && <span className="ml-2 text-xs text-indigo-400">(you)</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-white">{s.totalPoints.toFixed(1)}</td>
                  <td className="px-4 py-3 text-right text-gray-400">{s.wins}-{s.losses}</td>
                  <td className="px-4 py-3 text-right text-gray-400">{s.ownedTeamIds?.length ?? 0}</td>
                </tr>
              ))}
              {standings.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    No standings yet — auction must complete first.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Waivers Tab */}
      {tab === 'waivers' && (
        <WaiversTab leagueId={id} isCommissioner={isCommissioner} />
      )}

      {/* Settings Tab */}
      {tab === 'settings' && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
          <div>
            <p className="text-sm text-gray-400 mb-1">Invite Code</p>
            <code className="text-indigo-300 font-mono text-lg">{league.inviteCode}</code>
          </div>
          <div>
            <p className="text-sm text-gray-400 mb-1">League ID</p>
            <code className="text-gray-300 font-mono text-sm">{league.id}</code>
          </div>
          {isCommissioner && (
            <p className="text-xs text-indigo-400">You are the commissioner of this league.</p>
          )}
        </div>
      )}
    </div>
  );
}

function WaiversTab({ leagueId, isCommissioner }: { leagueId: string; isCommissioner: boolean }) {
  const [claims, setClaims] = useState<Array<{
    id: string; claimantDisplayName: string; dropTeamId: number;
    addTeamId: number; status: string; requestedAt: string;
  }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<typeof claims>(`/leagues/${leagueId}/waivers`)
      .then(setClaims)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [leagueId]);

  async function approve(claimId: string) {
    await api.patch(`/leagues/${leagueId}/waivers/${claimId}/approve`);
    setClaims((c) => c.map((x) => x.id === claimId ? { ...x, status: 'approved' } : x));
  }

  async function deny(claimId: string) {
    const reason = prompt('Reason for denial (optional):') ?? '';
    await api.patch(`/leagues/${leagueId}/waivers/${claimId}/deny`, { reason });
    setClaims((c) => c.map((x) => x.id === claimId ? { ...x, status: 'denied' } : x));
  }

  if (loading) return <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500" /></div>;

  return (
    <div className="space-y-3">
      {claims.length === 0 && (
        <p className="text-gray-500 text-center py-8">No waiver claims yet.</p>
      )}
      {claims.map((c) => (
        <div key={c.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-white font-medium">{c.claimantDisplayName}</p>
            <p className="text-gray-400 text-sm">Drop #{c.dropTeamId} → Add #{c.addTeamId}</p>
            <p className="text-gray-500 text-xs mt-1">{new Date(c.requestedAt).toLocaleDateString()}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${
              c.status === 'pending' ? 'bg-yellow-900 text-yellow-300' :
              c.status === 'approved' ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'
            }`}>{c.status}</span>
            {isCommissioner && c.status === 'pending' && (
              <>
                <button onClick={() => approve(c.id)} className="text-sm bg-green-700 hover:bg-green-600 text-white px-3 py-1 rounded-lg">Approve</button>
                <button onClick={() => deny(c.id)} className="text-sm bg-red-800 hover:bg-red-700 text-white px-3 py-1 rounded-lg">Deny</button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
