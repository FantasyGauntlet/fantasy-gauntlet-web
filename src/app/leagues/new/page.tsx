'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

interface SportLeague { id: string; name: string; sport: string; logoUrl?: string | null; }

const BASE = 'https://fantasy-gauntlet-backend-production.up.railway.app/api/v1';

const SPORT_ICONS: Record<string, string> = {
  'american-football': '🏈',
  basketball: '🏀',
  hockey: '🏒',
  baseball: '⚾',
  soccer: '⚽',
};

// ESPN has no proper league logos for NCAA sports — use local SVG assets instead.
const SPORT_LOGO_OVERRIDES: Record<string, string> = {
  'ncaa-football':   '/ncaa-football.svg',
  'ncaa-basketball': '/ncaa-basketball.svg',
};

export default function NewLeaguePage() {
  const router = useRouter();
  const [sportLeagues, setSportLeagues] = useState<SportLeague[]>([]);
  const [form, setForm] = useState({
    name: '',
    selectedSports: [] as string[],
    memberCap: '',
    isPublic: false,
    waiverType: 'reserve-standings' as 'reserve-standings' | 'faab',
    faabStartingBudget: 1000,
    rosterSize: 10,
  });
  const [retroMode, setRetroMode] = useState(false);
  const [retroYear, setRetroYear] = useState(new Date().getFullYear() - 1);
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
    setForm(f => {
      const next = f.selectedSports.includes(id)
        ? f.selectedSports.filter(s => s !== id)
        : [...f.selectedSports, id];
      return {
        ...f,
        selectedSports: next,
        rosterSize: Math.max(f.rosterSize, next.length),
      };
    });
  }

  const wildcards = Math.max(0, form.rosterSize - form.selectedSports.length);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.selectedSports.length === 0) { setError('Select at least one sport.'); return; }
    if (form.selectedSports.length > form.rosterSize) { setError('Roster size must be at least equal to the number of selected sports.'); return; }
    setError('');
    setLoading(true);
    try {
      const league = await api.post<{ id: string }>('/leagues', {
        name: form.name,
        selectedSports: form.selectedSports,
        memberCap: form.memberCap ? Number(form.memberCap) : null,
        isPublic: form.isPublic,
        waiverType: form.waiverType,
        maxWildcard: wildcards,
        ...(form.waiverType === 'faab' ? { faabStartingBudget: form.faabStartingBudget } : {}),
        ...(retroMode ? { referenceDate: `${retroYear}-08-01` } : {}),
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
                  onClick={() => setForm(f => {
                    const next = f.selectedSports.length === sportLeagues.length ? [] : sportLeagues.map(sl => sl.id);
                    return { ...f, selectedSports: next, rosterSize: Math.max(f.rosterSize, next.length) };
                  })}
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
                    {(SPORT_LOGO_OVERRIDES[sl.id] ?? sl.logoUrl)
                      ? <img src={SPORT_LOGO_OVERRIDES[sl.id] ?? sl.logoUrl!} alt={sl.name} className="w-6 h-6 object-contain flex-shrink-0" />
                      : <span className="text-base leading-none flex-shrink-0">{icon}</span>
                    }
                    <span className="font-medium truncate">{sl.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Waiver system */}
        <div className="bg-card border border-line rounded-2xl p-5 space-y-3">
          <div>
            <p className="text-sm font-semibold text-copy mb-0.5">Waiver System</p>
            <p className="text-xs text-copy-3">How free agent claims are resolved</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(['reserve-standings', 'faab'] as const).map(type => (
              <button
                key={type}
                type="button"
                onClick={() => setForm(f => ({ ...f, waiverType: type }))}
                className={`rounded-xl border px-4 py-3 text-left transition-all ${
                  form.waiverType === type
                    ? 'bg-brand-dim border-brand text-brand'
                    : 'bg-field border-line text-copy-2 hover:border-line-2 hover:text-copy'
                }`}
              >
                <p className="text-sm font-semibold">
                  {type === 'reserve-standings' ? 'Reserve Standings' : 'FAAB'}
                </p>
                <p className="text-xs mt-0.5 leading-snug opacity-75">
                  {type === 'reserve-standings'
                    ? 'Worst-ranked team picks first'
                    : 'Blind bidding — highest bid wins'}
                </p>
              </button>
            ))}
          </div>
          {form.waiverType === 'faab' && (
            <div>
              <label className={labelCls}>Starting FAAB budget per team</label>
              <input
                type="number"
                min={1}
                value={form.faabStartingBudget}
                onChange={e => setForm(f => ({ ...f, faabStartingBudget: Number(e.target.value) || 1000 }))}
                className={inputCls}
              />
            </div>
          )}
        </div>

        {/* Roster size & wildcards */}
        <div className="bg-card border border-line rounded-2xl p-5 space-y-3">
          <div>
            <p className="text-sm font-semibold text-copy mb-0.5">Roster Size</p>
            <p className="text-xs text-copy-3">Total sport teams per manager. Wildcards fill slots beyond your sport count.</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className={labelCls}>Total roster slots</label>
              <input
                type="number"
                min={form.selectedSports.length || 1}
                max={30}
                value={form.rosterSize}
                onChange={e => setForm(f => ({ ...f, rosterSize: Math.max(f.selectedSports.length || 1, Number(e.target.value) || 10) }))}
                className={inputCls}
              />
            </div>
            <div className="flex-1 bg-field border border-line rounded-xl px-4 py-3 text-center">
              <p className="text-2xl font-bold text-copy">{wildcards}</p>
              <p className="text-xs text-copy-3 mt-0.5">Wildcard slots</p>
              <p className="text-xs text-copy-3/70">({form.rosterSize} − {form.selectedSports.length} sports)</p>
            </div>
          </div>
        </div>

        {/* Retroactive league (temporary feature) */}
        <div className="bg-card border border-warn/30 rounded-2xl p-5">
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => setRetroMode(r => !r)}
              className={`w-9 h-5 rounded-full transition-colors relative flex-shrink-0 ${retroMode ? 'bg-warn' : 'bg-field-2 border border-line-2'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${retroMode ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </div>
            <div>
              <p className="text-sm font-medium text-copy">Past season league</p>
              <p className="text-xs text-copy-3">Retroactively create a league for a previous year</p>
            </div>
          </label>
          {retroMode && (
            <div className="mt-4">
              <label className={labelCls}>Season year</label>
              <select
                value={retroYear}
                onChange={e => setRetroYear(Number(e.target.value))}
                className={inputCls}
              >
                {[2025, 2024, 2023, 2022].map(y => (
                  <option key={y} value={y}>{y}–{y + 1} season</option>
                ))}
              </select>
              <p className="text-xs text-copy-3 mt-2">
                Uses Aug 1, {retroYear} as the reference date to find the correct seasons for each sport.
              </p>
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
