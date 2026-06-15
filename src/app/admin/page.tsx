'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import NavBar from '@/components/NavBar';

const BASE = 'https://fantasy-gauntlet-backend-production.up.railway.app/api/v1';

interface SyncResult { label: string; status: 'idle' | 'loading' | 'success' | 'error'; message: string; }
interface SportLeague { id: string; name: string; }
interface Team { id: string; name: string; }
interface Season { id: string; label: string; }
interface BonusPoint { id: string; teamId: string; seasonId: string; sportLeagueId: string; label: string; points: number; awardedAt: string; }

const SYNCS = [
  { key: 'seed',         label: 'Seed Sports',             endpoint: '/sports/seed' },
  { key: 'seed-seasons', label: 'Seed Seasons (2022–2026)', endpoint: '/sports/seed-seasons' },
  { key: 'teams',        label: 'Sync Teams',               endpoint: '/admin/ingestion/teams' },
  { key: 'schedule',     label: 'Sync Schedule',            endpoint: '/admin/ingestion/schedule' },
  { key: 'records',      label: 'Sync Records',             endpoint: '/admin/ingestion/records' },
];

type Tab = 'sync' | 'bonus' | 'scoring';

export default function AdminPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('sync');

  // ── Data Sync tab ──────────────────────────────────────────────────────────
  const [results, setResults] = useState<Record<string, SyncResult>>({});

  async function runSync(key: string, label: string, endpoint: string) {
    setResults(r => ({ ...r, [key]: { label, status: 'loading', message: 'Running...' } }));
    try {
      const res = await api.post<{ synced?: number; message?: string }>(endpoint);
      setResults(r => ({ ...r, [key]: { label, status: 'success', message: res.message ?? `Synced ${res.synced ?? ''}` } }));
    } catch (e: unknown) {
      setResults(r => ({ ...r, [key]: { label, status: 'error', message: e instanceof Error ? e.message : 'Failed' } }));
    }
  }

  async function runAll() {
    for (const s of SYNCS) await runSync(s.key, s.label, s.endpoint);
  }

  // ── Bonus Points tab ───────────────────────────────────────────────────────
  const [sports, setSports] = useState<SportLeague[]>([]);
  const [selectedSport, setSelectedSport] = useState('');
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamFilter, setTeamFilter] = useState('');
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [bonusForm, setBonusForm] = useState({ teamId: '', seasonId: '', label: '', points: '' });
  const [awardStatus, setAwardStatus] = useState<{ status: 'idle' | 'loading' | 'success' | 'error'; message: string }>({ status: 'idle', message: '' });
  const [bonusList, setBonusList] = useState<BonusPoint[]>([]);

  useEffect(() => {
    fetch(`${BASE}/sports/leagues`).then(r => r.json()).then(setSports).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedSport) { setTeams([]); setSeasons([]); return; }
    setBonusForm(f => ({ ...f, teamId: '', seasonId: '' }));
    setTeamFilter('');
    Promise.all([
      fetch(`${BASE}/sports/leagues/${selectedSport}/teams`).then(r => r.json()),
      fetch(`${BASE}/sports/leagues/${selectedSport}/seasons`).then(r => r.json()),
    ]).then(([t, s]: [Team[], Season[]]) => {
      setTeams([...t].sort((a, b) => a.name.localeCompare(b.name)));
      setSeasons([...s].sort((a, b) => b.label.localeCompare(a.label)));
    }).catch(() => {});
  }, [selectedSport]);

  const loadBonuses = () =>
    api.get<BonusPoint[]>('/admin/bonus-points').then(setBonusList).catch(() => {});

  useEffect(() => { if (tab === 'bonus') loadBonuses(); }, [tab]);

  async function awardBonus(e: React.FormEvent) {
    e.preventDefault();
    setAwardStatus({ status: 'loading', message: 'Awarding...' });
    try {
      await api.post('/admin/bonus-points', {
        teamId: bonusForm.teamId,
        seasonId: bonusForm.seasonId,
        sportLeagueId: selectedSport,
        label: bonusForm.label,
        points: Number(bonusForm.points),
      });
      setAwardStatus({ status: 'success', message: 'Bonus points awarded!' });
      setBonusForm(f => ({ ...f, label: '', points: '' }));
      loadBonuses();
    } catch (e: unknown) {
      setAwardStatus({ status: 'error', message: e instanceof Error ? e.message : 'Failed' });
    }
  }

  async function deleteBonus(id: string) {
    try {
      await api.delete(`/admin/bonus-points/${id}`);
      setBonusList(b => b.filter(x => x.id !== id));
    } catch {}
  }

  const filteredTeams = teams.filter(t =>
    t.name.toLowerCase().includes(teamFilter.toLowerCase())
  );

  // ── League Scoring tab ─────────────────────────────────────────────────────
  const [leagueId, setLeagueId] = useState('');
  const [scoringResult, setScoringResult] = useState<{ status: 'idle' | 'loading' | 'success' | 'error'; message: string }>({ status: 'idle', message: '' });

  async function recalculateScoring() {
    const id = leagueId.trim();
    if (!id) return;
    setScoringResult({ status: 'loading', message: 'Recalculating...' });
    try {
      const res = await api.post<{ message: string; updated: number }>(`/admin/leagues/${id}/recalculate-scoring`);
      setScoringResult({ status: 'success', message: `${res.message} (${res.updated} sports updated)` });
    } catch (e: unknown) {
      setScoringResult({ status: 'error', message: e instanceof Error ? e.message : 'Failed' });
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const tabs: { key: Tab; label: string }[] = [
    { key: 'sync',    label: 'Data Sync' },
    { key: 'bonus',   label: 'Bonus Points' },
    { key: 'scoring', label: 'League Scoring' },
  ];

  const inputCls = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';

  return (
    <div className="min-h-screen bg-gray-950">
      <NavBar />
      <main className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-white mb-2">Admin Panel</h1>
        <p className="text-gray-400 text-sm mb-6">Signed in as {user?.email}</p>

        <div className="flex gap-1 mb-6 bg-gray-900 border border-gray-800 rounded-xl p-1">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t.key ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Data Sync ── */}
        {tab === 'sync' && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold text-white">Data Sync</h2>
              <button onClick={runAll} className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
                Run All
              </button>
            </div>
            {SYNCS.map(s => {
              const r = results[s.key];
              return (
                <div key={s.key} className="flex items-center justify-between py-3 border-b border-gray-800 last:border-0">
                  <div>
                    <p className="text-white font-medium">{s.label}</p>
                    {r && <p className={`text-xs mt-1 ${r.status === 'success' ? 'text-green-400' : r.status === 'error' ? 'text-red-400' : 'text-gray-400'}`}>{r.message}</p>}
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
        )}

        {/* ── Bonus Points ── */}
        {tab === 'bonus' && (
          <div className="space-y-6">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Award Bonus Points</h2>
              <form onSubmit={awardBonus} className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Sport</label>
                  <select value={selectedSport} onChange={e => setSelectedSport(e.target.value)} required className={inputCls}>
                    <option value="">Select sport...</option>
                    {sports.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>

                {selectedSport && (
                  <>
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Team</label>
                      <input
                        value={teamFilter}
                        onChange={e => setTeamFilter(e.target.value)}
                        placeholder="Filter teams..."
                        className={`${inputCls} mb-2`}
                      />
                      <select
                        value={bonusForm.teamId}
                        onChange={e => setBonusForm(f => ({ ...f, teamId: e.target.value }))}
                        required
                        size={6}
                        className={inputCls}
                      >
                        <option value="">Select team...</option>
                        {filteredTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Season</label>
                      <select value={bonusForm.seasonId} onChange={e => setBonusForm(f => ({ ...f, seasonId: e.target.value }))} required className={inputCls}>
                        <option value="">Select season...</option>
                        {seasons.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                      </select>
                    </div>
                  </>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Label</label>
                    <input
                      value={bonusForm.label}
                      onChange={e => setBonusForm(f => ({ ...f, label: e.target.value }))}
                      placeholder="e.g. Super Bowl Champion"
                      required
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Points</label>
                    <input
                      type="number"
                      value={bonusForm.points}
                      onChange={e => setBonusForm(f => ({ ...f, points: e.target.value }))}
                      placeholder="50"
                      required
                      min={1}
                      className={inputCls}
                    />
                  </div>
                </div>

                {awardStatus.status !== 'idle' && (
                  <p className={`text-xs ${awardStatus.status === 'success' ? 'text-green-400' : awardStatus.status === 'error' ? 'text-red-400' : 'text-gray-400'}`}>
                    {awardStatus.message}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={awardStatus.status === 'loading' || !bonusForm.teamId || !bonusForm.seasonId}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
                >
                  {awardStatus.status === 'loading' ? 'Awarding...' : 'Award Bonus Points'}
                </button>
              </form>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Awarded Bonus Points</h2>
              {bonusList.length === 0 ? (
                <p className="text-gray-500 text-sm">No bonus points awarded yet.</p>
              ) : (
                <div className="space-y-1">
                  {bonusList.map(b => (
                    <div key={b.id} className="flex items-center justify-between py-3 border-b border-gray-800 last:border-0">
                      <div>
                        <p className="text-white text-sm font-medium">{b.teamId} &mdash; {b.label}</p>
                        <p className="text-gray-400 text-xs mt-0.5">{b.sportLeagueId} · {b.seasonId} · +{b.points} pts</p>
                      </div>
                      <button
                        onClick={() => deleteBonus(b.id)}
                        className="text-red-400 hover:text-red-300 text-sm px-3 py-1 rounded-lg hover:bg-red-900/20 transition-colors ml-4 flex-shrink-0"
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── League Scoring ── */}
        {tab === 'scoring' && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-2">Recalculate League Scoring</h2>
            <p className="text-gray-400 text-sm mb-4">
              Overwrites locked scoring values (winValue, drawValue) for an existing league.
              Find the league ID in the URL when viewing the league.
            </p>
            <div className="flex gap-3">
              <input
                value={leagueId}
                onChange={e => setLeagueId(e.target.value)}
                placeholder="e.g. 6cG7dWz2BfRICs35j6kQ"
                className={`flex-1 ${inputCls}`}
              />
              <button
                onClick={recalculateScoring}
                disabled={scoringResult.status === 'loading' || !leagueId.trim()}
                className="bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
              >
                {scoringResult.status === 'loading' ? 'Running...' : 'Recalculate'}
              </button>
            </div>
            {scoringResult.status !== 'idle' && (
              <p className={`text-xs mt-3 ${scoringResult.status === 'success' ? 'text-green-400' : scoringResult.status === 'error' ? 'text-red-400' : 'text-gray-400'}`}>
                {scoringResult.message}
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
