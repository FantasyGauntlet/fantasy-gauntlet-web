'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

interface SportLeague { id: string; name: string; sport: string; }

const BASE = 'https://fantasy-gauntlet-backend-production.up.railway.app/api/v1';

const SPORT_ICONS: Record<string, string> = {
  'american-football': '🏈',
  basketball: '🏀',
  hockey: '🏒',
  baseball: '⚾',
  soccer: '⚽',
};

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
      .catch(e => setSportsError(e.message));
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
    if (form.selectedSports.length === 0) { setError('Select at least one sport.'); return; }
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

  const inputCls = 'w-full bg-field border border-line-2 rounded-xl px-4 py-3 text-copy text-sm placeholder-copy-3 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors';
  const labelCls = 'block text-xs font-medium text-copy-2 mb-1.5';

  return (
    <div className="max-w-lg mx-auto">
      {/* Page header */}
      <div className="mb-8">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-copy-3 hover:text-copy text-sm mb-4 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </button>
        <h1 className="text-2xl font-bold text-copy">Create a League</h1>
        <p className="text-copy-3 text-sm mt-1">Set up your multi-sport fantasy league.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* League name */}
        <div className="bg-card border border-line rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-copy mb-4">League Details</h2>
          <div className="space-y-4">
            <div>
              <label className={labelCls}>League Name</label>
              <input
                required
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className={inputCls}
                placeholder="e.g. The Gauntlet 2025"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Start Date</label>
                <input
                  required type="date"
                  value={form.startDate}
                  onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>End Date</label>
                <input
                  required type="date"
                  value={form.endDate}
                  onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                  className={inputCls}
                />
              </div>
            </div>

            <div>
              <label className={labelCls}>
                Member Cap <span className="text-copy-3 font-normal">(optional)</span>
              </label>
              <input
                type="number" min={2} max={100}
                value={form.memberCap}
                onChange={e => setForm(f => ({ ...f, memberCap: e.target.value }))}
                className={inputCls}
                placeholder="No limit"
              />
            </div>

            <label className="flex items-center gap-3 cursor-pointer group">
              <div
                onClick={() => setForm(f => ({ ...f, isPublic: !f.isPublic }))}
                className={`w-9 h-5 rounded-full transition-colors relative flex-shrink-0 ${form.isPublic ? 'bg-brand' : 'bg-field-2 border border-line-2'}`}
              >
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.isPublic ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </div>
              <div>
                <p className="text-sm font-medium text-copy">Public league</p>
                <p className="text-xs text-copy-3">Anyone can discover and join without an invite</p>
              </div>
            </label>
          </div>
        </div>

        {/* Sports selection */}
        <div className="bg-card border border-line rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-copy">Select Sports</h2>
            <div className="flex items-center gap-3">
              {form.selectedSports.length > 0 && (
                <span className="text-xs text-brand font-medium">{form.selectedSports.length} selected</span>
              )}
              {sportLeagues.length > 0 && (
                <button
                  type="button"
                  onClick={() => setForm(f => ({
                    ...f,
                    selectedSports: f.selectedSports.length === sportLeagues.length
                      ? []
                      : sportLeagues.map(sl => sl.id),
                  }))}
                  className="text-xs text-copy-3 hover:text-copy-2 underline transition-colors"
                >
                  {form.selectedSports.length === sportLeagues.length ? 'Deselect all' : 'Select all'}
                </button>
              )}
            </div>
          </div>

          {sportsError ? (
            <p className="text-danger text-sm">{sportsError}</p>
          ) : sportLeagues.length === 0 ? (
            <div className="flex items-center gap-2 text-copy-3 text-sm py-4">
              <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
              Loading sports...
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {sportLeagues.map(sl => {
                const checked = form.selectedSports.includes(sl.id);
                const icon = SPORT_ICONS[sl.sport] ?? '🏆';
                return (
                  <button
                    key={sl.id}
                    type="button"
                    onClick={() => toggleSport(sl.id)}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left text-sm transition-all ${
                      checked
                        ? 'bg-brand-dim border-brand/40 text-copy'
                        : 'bg-field border-line text-copy-2 hover:border-line-2 hover:text-copy'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                      checked ? 'bg-brand border-brand' : 'border-line-2'
                    }`}>
                      {checked && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <span className="text-base leading-none">{icon}</span>
                    <span className="font-medium truncate">{sl.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {error && (
          <div className="bg-danger-bg border border-danger/20 rounded-xl px-4 py-3">
            <p className="text-danger text-sm">{error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex-1 bg-field hover:bg-field-2 border border-line text-copy-2 font-medium py-3 rounded-xl transition-colors text-sm"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || form.selectedSports.length === 0}
            className="flex-1 bg-brand hover:bg-brand-2 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors text-sm"
          >
            {loading ? 'Creating...' : 'Create League'}
          </button>
        </div>
      </form>
    </div>
  );
}
