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
interface BonusPoint { id: string; teamId: string; teamName: string; seasonId: string; seasonLabel: string; sportLeagueId: string; label: string; points: number; awardedAt: string; }

const LEAGUE_ACRONYMS = new Set(['nhl', 'nba', 'nfl', 'mlb', 'ucl', 'ncaa', 'mls', 'fifa', 'ufc']);
function formatLeagueName(id: string): string {
  return id.split('-').map(w =>
    LEAGUE_ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)
  ).join(' ');
}

const SYNCS = [
  { key: 'seed',         label: 'Seed Sports',              endpoint: '/sports/seed' },
  { key: 'seed-seasons', label: 'Seed Seasons (2022–2027)', endpoint: '/sports/seed-seasons' },
  { key: 'teams',        label: 'Sync Teams',               endpoint: '/admin/ingestion/teams' },
  { key: 'logos',        label: 'Sync Logos',               endpoint: '/admin/sync-logos' },
  { key: 'schedule',     label: 'Sync Schedule',            endpoint: '/admin/ingestion/schedule' },
  { key: 'records',      label: 'Sync Records',             endpoint: '/admin/ingestion/records' },
];

type Tab = 'sync' | 'bonus' | 'scoring';

function Spinner({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const s = size === 'sm' ? 'w-4 h-4 border-[1.5px]' : 'w-6 h-6 border-2';
  return <div className={`${s} border-brand border-t-transparent rounded-full animate-spin`} />;
}

const inputCls = 'w-full bg-field border border-line-2 rounded-xl px-4 py-2.5 text-copy text-sm placeholder-copy-3 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors';

export default function AdminPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('sync');

  // ── Data Sync ──────────────────────────────────────────────────────────────
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

  // ── Bonus Points ───────────────────────────────────────────────────────────
  const [sports, setSports] = useState<SportLeague[]>([]);
  const [selectedSport, setSelectedSport] = useState('');
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamFilter, setTeamFilter] = useState('');
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [bonusForm, setBonusForm] = useState({ teamId: '', seasonId: '', label: '', points: '' });
  const [awardStatus, setAwardStatus] = useState<{ status: 'idle' | 'loading' | 'success' | 'error'; message: string }>({ status: 'idle', message: '' });
  const [bonusList, setBonusList] = useState<BonusPoint[]>([]);
  const [expandedSports, setExpandedSports] = useState<Set<string>>(new Set());

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
    } catch { /* ignore */ }
  }

  const selectedTeamName = teams.find(t => t.id === bonusForm.teamId)?.name ?? '';
  const filteredTeams = teams.filter(t =>
    !teamFilter.trim() || t.name.toLowerCase().includes(teamFilter.toLowerCase())
  );

  // Group bonus list by sport league
  const bonusBySport = bonusList.reduce<Record<string, BonusPoint[]>>((acc, b) => {
    (acc[b.sportLeagueId] ??= []).push(b);
    return acc;
  }, {});

  function toggleSport(sportId: string) {
    setExpandedSports(prev => {
      const next = new Set(prev);
      if (next.has(sportId)) next.delete(sportId); else next.add(sportId);
      return next;
    });
  }

  // ── League Scoring ─────────────────────────────────────────────────────────
  const [scoringResult, setScoringResult] = useState<{ status: 'idle' | 'loading' | 'success' | 'error'; message: string }>({ status: 'idle', message: '' });

  async function recalculateScoring() {
    setScoringResult({ status: 'loading', message: 'Recalculating...' });
    try {
      const res = await api.post<{ leagues: number; refs: number }>('/admin/ingestion/recalculate-scoring');
      setScoringResult({ status: 'success', message: `Done — patched ${res.refs} season refs across ${res.leagues} leagues.` });
    } catch (e: unknown) {
      setScoringResult({ status: 'error', message: e instanceof Error ? e.message : 'Failed' });
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'sync',    label: 'Data Sync' },
    { key: 'bonus',   label: 'Bonus Points' },
    { key: 'scoring', label: 'League Scoring' },
  ];

  return (
    <div className="min-h-screen bg-base">
      <NavBar />
      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-copy">Admin Panel</h1>
          <p className="text-copy-3 text-sm mt-1">Signed in as {user?.email}</p>
        </div>

        {/* Tab bar */}
        <div className="flex gap-0.5 mb-6 border-b border-line">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors -mb-px border-b-2 ${
                tab === t.key
                  ? 'border-brand text-brand'
                  : 'border-transparent text-copy-3 hover:text-copy-2 hover:border-line-2'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Data Sync ── */}
        {tab === 'sync' && (
          <div className="bg-card border border-line rounded-2xl p-5">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-semibold text-copy">Data Sync</h2>
              <button
                onClick={runAll}
                className="bg-brand hover:bg-brand-2 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
              >
                Run All
              </button>
            </div>
            <div className="space-y-1">
              {SYNCS.map(s => {
                const r = results[s.key];
                return (
                  <div key={s.key} className="flex items-center justify-between py-3 border-b border-line/50 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-copy">{s.label}</p>
                      {r && (
                        <p className={`text-xs mt-0.5 ${
                          r.status === 'success' ? 'text-positive' :
                          r.status === 'error' ? 'text-danger' : 'text-copy-3'
                        }`}>{r.message}</p>
                      )}
                    </div>
                    <button
                      onClick={() => runSync(s.key, s.label, s.endpoint)}
                      disabled={r?.status === 'loading'}
                      className="flex items-center gap-1.5 bg-field hover:bg-field-2 border border-line disabled:opacity-50 text-copy-2 text-xs px-3 py-1.5 rounded-lg transition-colors"
                    >
                      {r?.status === 'loading' ? <Spinner /> : null}
                      {r?.status === 'loading' ? 'Running...' : 'Run'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Bonus Points ── */}
        {tab === 'bonus' && (
          <div className="space-y-4">
            <div className="bg-card border border-line rounded-2xl p-5">
              <h2 className="text-sm font-semibold text-copy mb-5">Award Bonus Points</h2>
              <form onSubmit={awardBonus} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-copy-2 mb-1.5">Sport</label>
                  <select value={selectedSport} onChange={e => setSelectedSport(e.target.value)} required className={inputCls}>
                    <option value="">Select sport...</option>
                    {sports.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>

                {selectedSport && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-copy-2 mb-1.5">
                        Team
                        {selectedTeamName && (
                          <span className="ml-2 text-brand font-semibold">{selectedTeamName}</span>
                        )}
                      </label>
                      <input
                        value={teamFilter}
                        onChange={e => {
                          setTeamFilter(e.target.value);
                          setBonusForm(f => ({ ...f, teamId: '' }));
                        }}
                        onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}
                        placeholder="Search teams..."
                        className={inputCls}
                      />
                      {(teamFilter.trim() || !bonusForm.teamId) && (
                        <div className="mt-1.5 max-h-52 overflow-y-auto border border-line-2 rounded-xl bg-field">
                          {filteredTeams.length === 0 ? (
                            <p className="text-copy-3 text-xs px-3 py-3">No teams found</p>
                          ) : filteredTeams.map(t => (
                            <button
                              key={t.id}
                              type="button"
                              onMouseDown={e => {
                                e.preventDefault();
                                setBonusForm(f => ({ ...f, teamId: t.id }));
                                setTeamFilter('');
                              }}
                              className={`w-full text-left px-3 py-2.5 text-sm transition-colors border-b border-line/50 last:border-0 ${
                                bonusForm.teamId === t.id
                                  ? 'bg-brand text-white'
                                  : 'text-copy-2 hover:bg-field-2 hover:text-copy'
                              }`}
                            >
                              {t.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-copy-2 mb-1.5">Season</label>
                      <select value={bonusForm.seasonId} onChange={e => setBonusForm(f => ({ ...f, seasonId: e.target.value }))} required className={inputCls}>
                        <option value="">Select season...</option>
                        {seasons.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                      </select>
                    </div>
                  </>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-copy-2 mb-1.5">Label</label>
                    <input
                      value={bonusForm.label}
                      onChange={e => setBonusForm(f => ({ ...f, label: e.target.value }))}
                      placeholder="e.g. Super Bowl Champion"
                      required className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-copy-2 mb-1.5">Points</label>
                    <input
                      type="number" value={bonusForm.points}
                      onChange={e => setBonusForm(f => ({ ...f, points: e.target.value }))}
                      placeholder="50" required min={1} className={inputCls}
                    />
                  </div>
                </div>

                {awardStatus.status !== 'idle' && (
                  <p className={`text-xs ${
                    awardStatus.status === 'success' ? 'text-positive' :
                    awardStatus.status === 'error' ? 'text-danger' : 'text-copy-3'
                  }`}>{awardStatus.message}</p>
                )}

                <button
                  type="submit"
                  disabled={awardStatus.status === 'loading' || !bonusForm.teamId || !bonusForm.seasonId}
                  className="w-full bg-brand hover:bg-brand-2 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm"
                >
                  {awardStatus.status === 'loading' ? 'Awarding...' : 'Award Bonus Points'}
                </button>
              </form>
            </div>

            {/* Awarded bonus points grouped by league */}
            <div className="bg-card border border-line rounded-2xl p-5">
              <h2 className="text-sm font-semibold text-copy mb-4">Awarded Bonus Points</h2>
              {bonusList.length === 0 ? (
                <p className="text-copy-3 text-sm">No bonus points awarded yet.</p>
              ) : (
                <div className="space-y-2">
                  {Object.entries(bonusBySport).sort(([a], [b]) => a.localeCompare(b)).map(([sportId, entries]) => {
                    const isOpen = expandedSports.has(sportId);
                    return (
                      <div key={sportId} className="border border-line rounded-xl overflow-hidden">
                        <button
                          type="button"
                          onClick={() => toggleSport(sportId)}
                          className="w-full flex items-center justify-between px-4 py-3 bg-field/50 hover:bg-field transition-colors text-left"
                        >
                          <div className="flex items-center gap-2">
                            <svg
                              width="12" height="12" viewBox="0 0 24 24" fill="none"
                              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                              className={`text-copy-3 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                            >
                              <polyline points="9 18 15 12 9 6" />
                            </svg>
                            <span className="text-sm font-medium text-copy">{formatLeagueName(sportId)}</span>
                          </div>
                          <span className="text-xs text-copy-3 bg-field border border-line px-2 py-0.5 rounded-full">
                            {entries.length}
                          </span>
                        </button>
                        {isOpen && (
                          <div className="divide-y divide-line/50">
                            {entries.map(b => (
                              <div key={b.id} className="flex items-center justify-between px-4 py-3">
                                <div>
                                  <p className="text-sm font-medium text-copy">{b.teamName} — {b.label}</p>
                                  <p className="text-xs text-copy-3 mt-0.5">{b.seasonLabel} · +{b.points} pts</p>
                                </div>
                                <button
                                  onClick={() => deleteBonus(b.id)}
                                  className="text-xs text-danger hover:text-danger/80 px-3 py-1.5 rounded-lg hover:bg-danger-bg transition-colors ml-4 flex-shrink-0"
                                >
                                  Delete
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── League Scoring ── */}
        {tab === 'scoring' && (
          <div className="bg-card border border-line rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-copy mb-1">Recalculate All League Scoring</h2>
            <p className="text-xs text-copy-3 mb-5">
              Re-derives winValue / drawValue / scalingValue for every league from the current season docs and patches Firestore. Use this to fix leagues created before the NFL 17-game correction.
            </p>
            <button
              onClick={recalculateScoring}
              disabled={scoringResult.status === 'loading'}
              className="flex items-center gap-1.5 bg-field hover:bg-field-2 border border-line disabled:opacity-50 text-copy-2 text-sm px-4 py-2.5 rounded-xl transition-colors"
            >
              {scoringResult.status === 'loading' ? <Spinner /> : null}
              {scoringResult.status === 'loading' ? 'Running...' : 'Recalculate Scoring'}
            </button>
            {scoringResult.status !== 'idle' && (
              <p className={`text-xs mt-3 ${
                scoringResult.status === 'success' ? 'text-positive' :
                scoringResult.status === 'error' ? 'text-danger' : 'text-copy-3'
              }`}>{scoringResult.message}</p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
