'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

interface SportLeague { id: string; name: string; sport: string; }

const BASE = 'https://fantasy-gauntlet-backend-production.up.railway.app/api/v1';

export default function NewLeaguePage() {
  const router = useRouter();
  const [sportLeagues, setSportLeagues] = useState<SportLeague[]>([]);
  const [form, setForm] = useState({
    name: '',
    selectedSports: [] as string[],
    startDate: '',
    endDate: '',
    memberCap: '',
    isPublic: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sportsError, setSportsError] = useState('');

  useEffect(() => {
    fetch(`${BASE}/sports/leagues`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(setSportLeagues)
      .catch((e) => setSportsError(e.message));
  }, []);

  function toggleSport(id: string) {
    setForm(f => ({
      ...f,
      selectedSports: f.selectedSports.includes(id)
        ? f.selectedSports.filter(s => s !== id)
        : [...f.selectedSports, id],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.selectedSports.length === 0) {
      setError('Select at least one sport.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const league = await api.post<{ id: string }>('/leagues', {
        name: form.name,
        selectedSports: form.selectedSports,
        startDate: form.startDate,
        endDate: form.endDate,
        memberCap: form.memberCap ? Number(form.memberCap) : null,
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
            onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="My Fantasy League"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Sports <span className="text-gray-500 font-normal">(select all that apply)</span>
          </label>
          {sportsError ? (
            <p className="text-red-400 text-sm">{sportsError}</p>
          ) : sportLeagues.length === 0 ? (
            <p className="text-gray-500 text-sm">Loading sports...</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {sportLeagues.map((sl) => {
                const checked = form.selectedSports.includes(sl.id);
                return (
                  <button
                    key={sl.id}
                    type="button"
                    onClick={() => toggleSport(sl.id)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-left text-sm transition-colors ${
                      checked
                        ? 'bg-indigo-600/20 border-indigo-500 text-white'
                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${
                      checked ? 'bg-indigo-600 border-indigo-600' : 'border-gray-600'
                    }`}>
                      {checked && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    {sl.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Start Date</label>
            <input
              required
              type="date"
              value={form.startDate}
              onChange={(e) => setForm(f => ({ ...f, startDate: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">End Date</label>
            <input
              required
              type="date"
              value={form.endDate}
              onChange={(e) => setForm(f => ({ ...f, endDate: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Member Cap <span className="text-gray-500 font-normal">(optional)</span>
          </label>
          <input
            type="number"
            min={2}
            max={100}
            value={form.memberCap}
            onChange={(e) => setForm(f => ({ ...f, memberCap: e.target.value }))}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="No limit"
          />
        </div>

        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="isPublic"
            checked={form.isPublic}
            onChange={(e) => setForm(f => ({ ...f, isPublic: e.target.checked }))}
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
            disabled={loading || form.selectedSports.length === 0}
            className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors"
          >
            {loading ? 'Creating...' : 'Create League'}
          </button>
        </div>
      </form>
    </div>
  );
}
