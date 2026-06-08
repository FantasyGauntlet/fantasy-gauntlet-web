'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

interface SportLeague { id: number; name: string; }
interface Season { id: number; year: number; regularSeasonStart: string; regularSeasonEnd: string; }

export default function NewLeaguePage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [sportLeagues, setSportLeagues] = useState<SportLeague[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [form, setForm] = useState({
    name: '',
    sportLeagueId: '',
    seasonId: '',
    maxMembers: 10,
    isPublic: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const BASE = 'https://fantasy-gauntlet-backend-production.up.railway.app/api/v1';

  useEffect(() => {
    fetch(`${BASE}/sports/leagues`)
      .then(r => r.json())
      .then(setSportLeagues)
      .catch(() => {});
  }, [BASE]);

  useEffect(() => {
    if (form.sportLeagueId) {
      fetch(`${BASE}/sports/leagues/${form.sportLeagueId}/seasons`)
        .then(r => r.json())
        .then(setSeasons)
        .catch(() => {});
    }
  }, [form.sportLeagueId, BASE]);

  function set(key: string, value: unknown) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const league = await api.post<{ id: string }>('/leagues', {
        name: form.name,
        sportLeagueId: Number(form.sportLeagueId),
        seasonId: Number(form.seasonId),
        maxMembers: form.maxMembers,
        isPublic: form.isPublic,
      });
      router.push(`/leagues/${league.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create league');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-white mb-8">Create a League</h1>

      <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">League Name</label>
          <input
            required
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="My Fantasy League"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Sport</label>
          <select
            required
            value={form.sportLeagueId}
            onChange={(e) => set('sportLeagueId', e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Select a sport...</option>
            {sportLeagues.map((sl) => (
              <option key={sl.id} value={sl.id}>{sl.name}</option>
            ))}
          </select>
        </div>

        {seasons.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Season</label>
            <select
              required
              value={form.seasonId}
              onChange={(e) => set('seasonId', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Select a season...</option>
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>{s.year}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Max Members</label>
          <input
            type="number"
            min={2}
            max={20}
            value={form.maxMembers}
            onChange={(e) => set('maxMembers', Number(e.target.value))}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="isPublic"
            checked={form.isPublic}
            onChange={(e) => set('isPublic', e.target.checked)}
            className="w-4 h-4 rounded border-gray-700 bg-gray-800 accent-indigo-600"
          />
          <label htmlFor="isPublic" className="text-sm text-gray-300">Make league public (anyone can join)</label>
        </div>

        {error && (
          <p className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex-1 bg-gray-800 hover:bg-gray-700 text-white font-medium py-2.5 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors"
          >
            {loading ? 'Creating...' : 'Create League'}
          </button>
        </div>
      </form>
    </div>
  );
}
