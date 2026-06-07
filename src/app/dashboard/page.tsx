'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

interface League {
  id: string;
  name: string;
  sport: string;
  state: string;
  memberCount: number;
  maxMembers: number;
  commissionerId: string;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<League[]>('/leagues/mine')
      .then(setLeagues)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const stateColors: Record<string, string> = {
    draft: 'bg-yellow-900 text-yellow-300',
    auction: 'bg-blue-900 text-blue-300',
    active: 'bg-green-900 text-green-300',
    completed: 'bg-gray-700 text-gray-300',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">My Dashboard</h1>
          <p className="text-gray-400 mt-1">Welcome back, {user?.displayName ?? user?.email}</p>
        </div>
        <Link
          href="/leagues/new"
          className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + Create League
        </Link>
      </div>

      {loading && (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
        </div>
      )}

      {error && (
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 text-red-400">{error}</div>
      )}

      {!loading && !error && leagues.length === 0 && (
        <div className="text-center py-16">
          <div className="text-6xl mb-4">🏆</div>
          <h2 className="text-xl font-semibold text-white mb-2">No leagues yet</h2>
          <p className="text-gray-400 mb-6">Create your first league or join one with an invite code.</p>
          <Link
            href="/leagues/new"
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-6 py-3 rounded-lg transition-colors"
          >
            Create a League
          </Link>
        </div>
      )}

      {!loading && leagues.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {leagues.map((league) => (
            <Link
              key={league.id}
              href={`/leagues/${league.id}`}
              className="bg-gray-900 border border-gray-800 hover:border-indigo-500 rounded-xl p-5 transition-colors group"
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-semibold text-white group-hover:text-indigo-400 transition-colors">
                  {league.name}
                </h3>
                <span className={`text-xs font-medium px-2 py-1 rounded-full ${stateColors[league.state] ?? 'bg-gray-700 text-gray-300'}`}>
                  {league.state}
                </span>
              </div>
              <p className="text-gray-400 text-sm capitalize mb-3">{league.sport}</p>
              <div className="flex items-center justify-between text-sm text-gray-500">
                <span>{league.memberCount} / {league.maxMembers} members</span>
                {league.commissionerId === user?.uid && (
                  <span className="text-indigo-400 text-xs">Commissioner</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
