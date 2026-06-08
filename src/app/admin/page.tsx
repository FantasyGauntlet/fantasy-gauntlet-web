'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import NavBar from '@/components/NavBar';

interface SyncResult {
  label: string;
  status: 'idle' | 'loading' | 'success' | 'error';
  message: string;
}

const SYNCS = [
  { key: 'teams', label: 'Sync Teams', endpoint: '/admin/ingestion/teams' },
  { key: 'schedule', label: 'Sync Schedule', endpoint: '/admin/ingestion/schedule' },
  { key: 'records', label: 'Sync Records', endpoint: '/admin/ingestion/records' },
];

export default function AdminPage() {
  const { user } = useAuth();
  const [results, setResults] = useState<Record<string, SyncResult>>({});

  async function runSync(key: string, label: string, endpoint: string) {
    setResults((r) => ({ ...r, [key]: { label, status: 'loading', message: 'Running...' } }));
    try {
      const res = await api.post<{ synced?: number; message?: string }>(endpoint);
      setResults((r) => ({
        ...r,
        [key]: { label, status: 'success', message: res.message ?? `Synced ${res.synced ?? ''}` },
      }));
    } catch (e: unknown) {
      setResults((r) => ({
        ...r,
        [key]: { label, status: 'error', message: e instanceof Error ? e.message : 'Failed' },
      }));
    }
  }

  async function runAll() {
    for (const s of SYNCS) {
      await runSync(s.key, s.label, s.endpoint);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <NavBar />
      <main className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-white mb-2">Admin Panel</h1>
        <p className="text-gray-400 text-sm mb-8">Signed in as {user?.email}</p>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold text-white">Data Sync</h2>
            <button
              onClick={runAll}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              Run All
            </button>
          </div>

          {SYNCS.map((s) => {
            const r = results[s.key];
            return (
              <div key={s.key} className="flex items-center justify-between py-3 border-b border-gray-800 last:border-0">
                <div>
                  <p className="text-white font-medium">{s.label}</p>
                  {r && (
                    <p className={`text-xs mt-1 ${
                      r.status === 'success' ? 'text-green-400' :
                      r.status === 'error' ? 'text-red-400' : 'text-gray-400'
                    }`}>{r.message}</p>
                  )}
                </div>
                <button
                  onClick={() => runSync(s.key, s.label, s.endpoint)}
                  disabled={r?.status === 'loading'}
                  className="bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors"
                >
                  {r?.status === 'loading' ? 'Running...' : 'Run'}
                </button>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
