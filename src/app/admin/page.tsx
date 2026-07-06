'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import NavBar from '@/components/NavBar';

const BASE = 'https://fantasy-gauntlet-backend-production.up.railway.app/api/v1';

interface SyncResult { label: string; status: 'idle' | 'loading' | 'success' | 'error'; message: string; }
interface SportLeague { id: string; name: string; }
interface Team { id: string; name: string; logoUrl?: string | null; }
interface Season { id: string; label: string; }
interface BonusPoint { id: string; teamId: string; teamName: string; seasonId: string; seasonLabel: string; sportLeagueId: string; label: string; points: number; awardedAt: string; }
interface AdminLeague { id: string; name: string; state: 'draft' | 'auction' | 'active' | 'completed' | 'cancelled'; selectedSports: string[]; commissionerId: string; memberCap: number | null; createdAt: string; }

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

type Tab = 'sync' | 'bonus' | 'scoring' | 'preset' | 'deadlines' | 'leagues';

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

  // ── Per-sport team sync ────────────────────────────────────────────────────
  const [sportSyncTarget, setSportSyncTarget] = useState('');
  const [sportSyncStatus, setSportSyncStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [sportSyncMessage, setSportSyncMessage] = useState('');

  async function syncSingleSport() {
    if (!sportSyncTarget) return;
    setSportSyncStatus('loading');
    setSportSyncMessage('Syncing...');
    try {
      await api.post('/admin/ingestion/teams', { sportKeys: [sportSyncTarget] });
      setSportSyncStatus('success');
      setSportSyncMessage(`Teams synced for ${formatLeagueName(sportSyncTarget)}`);
    } catch (e: unknown) {
      setSportSyncStatus('error');
      setSportSyncMessage(e instanceof Error ? e.message : 'Failed');
    }
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

  const [bonusYearFilter, setBonusYearFilter] = useState('');

  const bonusYears = [...new Set(bonusList.map(b => b.seasonLabel.split('-')[0]))].sort((a, b) => b.localeCompare(a));

  const filteredBonusList = bonusYearFilter
    ? bonusList.filter(b => b.seasonLabel.split('-')[0] === bonusYearFilter)
    : bonusList;

  const bonusBySport = filteredBonusList.reduce<Record<string, BonusPoint[]>>((acc, b) => {
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

  // ── Auction Preset ─────────────────────────────────────────────────────────
  const [presetTeams, setPresetTeams] = useState<Record<string, Team[]>>({});
  const [presetLoading, setPresetLoading] = useState(false);
  const [selectedPresetIds, setSelectedPresetIds] = useState<Set<string>>(new Set());
  const [presetSportFilter, setPresetSportFilter] = useState<Record<string, string>>({});
  const [presetExpanded, setPresetExpanded] = useState<Set<string>>(new Set());
  const [presetSaveStatus, setPresetSaveStatus] = useState<{ status: 'idle' | 'loading' | 'success' | 'error'; message: string }>({ status: 'idle', message: '' });
  const presetLoadedRef = useRef(false);

  useEffect(() => {
    if (tab !== 'preset' || presetLoadedRef.current || presetLoading || sports.length === 0) return;
    presetLoadedRef.current = true;
    setPresetLoading(true);
    (async () => {
      try {
        const [entries, preset] = await Promise.all([
          Promise.all(
            sports.map(s =>
              fetch(`${BASE}/sports/leagues/${s.id}/teams`)
                .then(r => r.json())
                .then((ts: Team[]) => [s.id, [...ts].sort((a, b) => a.name.localeCompare(b.name))] as [string, Team[]])
                .catch(() => [s.id, []] as [string, Team[]])
            )
          ),
          api.get<{ teamIds: string[] } | null>('/sports/preset').catch(() => null),
        ]);
        setPresetTeams(Object.fromEntries(entries));
        if (preset && Array.isArray(preset.teamIds)) {
          setSelectedPresetIds(new Set(preset.teamIds));
        }
        setPresetExpanded(new Set(sports.map(s => s.id)));
      } finally {
        setPresetLoading(false);
      }
    })();
  }, [tab, sports, presetLoading]);

  function togglePresetSport(sportId: string) {
    setPresetExpanded(prev => {
      const next = new Set(prev);
      if (next.has(sportId)) next.delete(sportId); else next.add(sportId);
      return next;
    });
  }

  function togglePresetTeam(teamId: string) {
    setSelectedPresetIds(prev => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId); else next.add(teamId);
      return next;
    });
  }

  function selectAllForSport(sportId: string) {
    const ids = (presetTeams[sportId] ?? []).map(t => t.id);
    setSelectedPresetIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.add(id));
      return next;
    });
  }

  function deselectAllForSport(sportId: string) {
    const ids = new Set((presetTeams[sportId] ?? []).map(t => t.id));
    setSelectedPresetIds(prev => new Set([...prev].filter(id => !ids.has(id))));
  }

  async function savePreset() {
    setPresetSaveStatus({ status: 'loading', message: 'Saving...' });
    try {
      const res = await api.post<{ saved: number }>('/sports/preset', { teamIds: [...selectedPresetIds] });
      setPresetSaveStatus({ status: 'success', message: `Saved ${res.saved} teams to preset.` });
    } catch (e: unknown) {
      setPresetSaveStatus({ status: 'error', message: e instanceof Error ? e.message : 'Failed' });
    }
  }

  const totalPresetCount = Object.values(presetTeams).reduce((sum, ts) => sum + ts.length, 0);

  // ── Deadlines ──────────────────────────────────────────────────────────────
  const [savedDeadlines, setSavedDeadlines] = useState<Record<string, string>>({});
  const [deadlinesLoaded, setDeadlinesLoaded] = useState(false);
  const [deadlineDrafts, setDeadlineDrafts] = useState<Record<string, string>>({});
  const [deadlineStatuses, setDeadlineStatuses] = useState<Record<string, 'idle' | 'loading' | 'success' | 'error'>>({});

  useEffect(() => {
    if (tab !== 'deadlines' || deadlinesLoaded) return;
    setDeadlinesLoaded(true);
    api.get<Record<string, string>>('/sports/deadlines')
      .then(dl => {
        setSavedDeadlines(dl ?? {});
        setDeadlineDrafts(dl ?? {});
      })
      .catch(() => {});
  }, [tab, deadlinesLoaded]);

  async function saveDeadline(sportId: string) {
    setDeadlineStatuses(s => ({ ...s, [sportId]: 'loading' }));
    try {
      const date = deadlineDrafts[sportId] || null;
      await api.patch(`/sports/deadlines/${sportId}`, { date });
      setSavedDeadlines(d => date ? { ...d, [sportId]: date } : Object.fromEntries(Object.entries(d).filter(([k]) => k !== sportId)));
      setDeadlineStatuses(s => ({ ...s, [sportId]: 'success' }));
    } catch {
      setDeadlineStatuses(s => ({ ...s, [sportId]: 'error' }));
    }
  }

  async function clearDeadline(sportId: string) {
    setDeadlineDrafts(d => ({ ...d, [sportId]: '' }));
    setDeadlineStatuses(s => ({ ...s, [sportId]: 'loading' }));
    try {
      await api.patch(`/sports/deadlines/${sportId}`, { date: null });
      setSavedDeadlines(d => Object.fromEntries(Object.entries(d).filter(([k]) => k !== sportId)));
      setDeadlineStatuses(s => ({ ...s, [sportId]: 'success' }));
    } catch {
      setDeadlineStatuses(s => ({ ...s, [sportId]: 'error' }));
    }
  }

  // ── Leagues ────────────────────────────────────────────────────────────────
  const [allLeagues, setAllLeagues] = useState<AdminLeague[]>([]);
  const [leaguesLoaded, setLeaguesLoaded] = useState(false);
  const [leagueSearch, setLeagueSearch] = useState('');
  const [expandedLeagues, setExpandedLeagues] = useState<Set<string>>(new Set());
  const [leagueStatuses, setLeagueStatuses] = useState<Record<string, { status: 'idle' | 'loading' | 'success' | 'error'; message: string }>>({});

  useEffect(() => {
    if (tab !== 'leagues' || leaguesLoaded) return;
    setLeaguesLoaded(true);
    api.get<AdminLeague[]>('/admin/leagues').then(setAllLeagues).catch(() => {});
  }, [tab, leaguesLoaded]);

  function toggleLeague(id: string) {
    setExpandedLeagues(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function forceState(leagueId: string, state: AdminLeague['state']) {
    setLeagueStatuses(s => ({ ...s, [leagueId]: { status: 'loading', message: '' } }));
    try {
      const updated = await api.patch<AdminLeague>(`/admin/leagues/${leagueId}/state`, { state });
      setAllLeagues(ls => ls.map(l => l.id === leagueId ? { ...l, state: updated.state } : l));
      setLeagueStatuses(s => ({ ...s, [leagueId]: { status: 'success', message: `→ ${state}` } }));
    } catch (e: unknown) {
      setLeagueStatuses(s => ({ ...s, [leagueId]: { status: 'error', message: e instanceof Error ? e.message : 'Failed' } }));
    }
  }

  const STATE_TRANSITIONS: Record<AdminLeague['state'], AdminLeague['state'][]> = {
    draft:     ['auction', 'active', 'cancelled'],
    auction:   ['active', 'cancelled'],
    active:    ['completed', 'cancelled'],
    completed: [],
    cancelled: [],
  };

  const STATE_COLORS: Record<AdminLeague['state'], string> = {
    draft:     'bg-field text-copy-3 border-line',
    auction:   'bg-amber-50 text-amber-700 border-amber-200',
    active:    'bg-positive/10 text-positive border-positive/20',
    completed: 'bg-brand/10 text-brand border-brand/20',
    cancelled: 'bg-danger-bg text-danger border-danger/20',
  };

  const filteredLeagues = leagueSearch.trim()
    ? allLeagues.filter(l => l.name.toLowerCase().includes(leagueSearch.toLowerCase()))
    : allLeagues;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'sync',      label: 'Data Sync' },
    { key: 'bonus',     label: 'Bonus Points' },
    { key: 'scoring',   label: 'League Scoring' },
    { key: 'preset',    label: 'Auction Preset' },
    { key: 'deadlines', label: 'Deadlines' },
    { key: 'leagues',   label: 'Leagues' },
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
          <div className="space-y-4">
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

            {/* Per-sport team sync — useful for refreshing a single league's roster mid-season */}
            <div className="bg-card border border-line rounded-2xl p-5">
              <h2 className="text-sm font-semibold text-copy mb-4">Sync Teams by Sport</h2>
              <div className="flex gap-2">
                <select
                  value={sportSyncTarget}
                  onChange={e => { setSportSyncTarget(e.target.value); setSportSyncStatus('idle'); setSportSyncMessage(''); }}
                  className={`flex-1 ${inputCls}`}
                >
                  <option value="">Select sport...</option>
                  {['premier-league','ucl','world-cup','nfl','ncaa-football','nba','ncaa-basketball','nhl','mlb'].map(id => (
                    <option key={id} value={id}>{formatLeagueName(id)}</option>
                  ))}
                </select>
                <button
                  onClick={syncSingleSport}
                  disabled={!sportSyncTarget || sportSyncStatus === 'loading'}
                  className="flex items-center gap-1.5 bg-brand hover:bg-brand-2 text-white text-xs font-semibold px-4 py-2 rounded-xl disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  {sportSyncStatus === 'loading' ? <Spinner /> : null}
                  {sportSyncStatus === 'loading' ? 'Syncing...' : 'Sync Teams'}
                </button>
              </div>
              {sportSyncMessage && (
                <p className={`text-xs mt-2 ${
                  sportSyncStatus === 'success' ? 'text-positive' :
                  sportSyncStatus === 'error' ? 'text-danger' : 'text-copy-3'
                }`}>{sportSyncMessage}</p>
              )}
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
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-copy">Awarded Bonus Points</h2>
                {bonusYears.length > 0 && (
                  <select
                    value={bonusYearFilter}
                    onChange={e => setBonusYearFilter(e.target.value)}
                    className="bg-field border border-line-2 rounded-lg px-3 py-1.5 text-xs text-copy focus:outline-none focus:border-brand transition-colors"
                  >
                    <option value="">All years</option>
                    {bonusYears.map(y => {
                      const next = String(parseInt(y) + 1).slice(-2);
                      return <option key={y} value={y}>{y}-{next}</option>;
                    })}
                  </select>
                )}
              </div>
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

        {/* ── Auction Preset ── */}
        {tab === 'preset' && (
          <div className="space-y-4">
            {/* Header card */}
            <div className="bg-card border border-line rounded-2xl p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-sm font-semibold text-copy">Auction Draft Preset</h2>
                  <p className="text-xs text-copy-3 mt-1">
                    Select the teams available in every league&apos;s auction draft. Use this to trim the NCAA pool without removing teams from the system.
                  </p>
                  {!presetLoading && totalPresetCount > 0 && (
                    <p className="text-xs text-copy-2 mt-2">
                      <span className="font-semibold text-copy">{selectedPresetIds.size}</span>
                      <span className="text-copy-3"> / {totalPresetCount} teams selected</span>
                    </p>
                  )}
                </div>
                <button
                  onClick={savePreset}
                  disabled={presetLoading || presetSaveStatus.status === 'loading'}
                  className="flex-shrink-0 flex items-center gap-1.5 bg-brand hover:bg-brand-2 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
                >
                  {presetSaveStatus.status === 'loading' ? <Spinner /> : null}
                  {presetSaveStatus.status === 'loading' ? 'Saving...' : 'Save Preset'}
                </button>
              </div>
              {presetSaveStatus.status !== 'idle' && (
                <p className={`text-xs mt-3 ${
                  presetSaveStatus.status === 'success' ? 'text-positive' :
                  presetSaveStatus.status === 'error' ? 'text-danger' : 'text-copy-3'
                }`}>{presetSaveStatus.message}</p>
              )}
            </div>

            {/* Loading state */}
            {presetLoading && (
              <div className="flex items-center justify-center gap-3 py-12 text-copy-3">
                <Spinner size="md" />
                <span className="text-sm">Loading teams...</span>
              </div>
            )}

            {/* Sport sections */}
            {!presetLoading && sports.map(sport => {
              const sportTeams = presetTeams[sport.id] ?? [];
              const isOpen = presetExpanded.has(sport.id);
              const filterStr = presetSportFilter[sport.id] ?? '';
              const filteredSportTeams = filterStr.trim()
                ? sportTeams.filter(t => t.name.toLowerCase().includes(filterStr.toLowerCase()))
                : sportTeams;
              const selectedCount = sportTeams.filter(t => selectedPresetIds.has(t.id)).length;
              const allSelected = sportTeams.length > 0 && selectedCount === sportTeams.length;

              return (
                <div key={sport.id} className="bg-card border border-line rounded-2xl overflow-hidden">
                  {/* Section header */}
                  <button
                    type="button"
                    onClick={() => togglePresetSport(sport.id)}
                    className="w-full flex items-center justify-between px-5 py-4 hover:bg-field/30 transition-colors text-left"
                  >
                    <div className="flex items-center gap-2.5">
                      <svg
                        width="12" height="12" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                        className={`text-copy-3 transition-transform flex-shrink-0 ${isOpen ? 'rotate-90' : ''}`}
                      >
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                      <span className="text-sm font-semibold text-copy">{sport.name}</span>
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                      allSelected
                        ? 'bg-positive/10 text-positive border-positive/20'
                        : selectedCount > 0
                          ? 'bg-brand/10 text-brand border-brand/20'
                          : 'bg-field text-copy-3 border-line'
                    }`}>
                      {selectedCount}/{sportTeams.length}
                    </span>
                  </button>

                  {/* Section body */}
                  {isOpen && (
                    <div className="border-t border-line">
                      {/* Controls */}
                      <div className="px-5 py-3 flex items-center gap-3 border-b border-line/50 bg-field/20">
                        <input
                          value={filterStr}
                          onChange={e => setPresetSportFilter(f => ({ ...f, [sport.id]: e.target.value }))}
                          placeholder={`Search ${sport.name}...`}
                          className="flex-1 bg-field border border-line-2 rounded-lg px-3 py-1.5 text-xs text-copy placeholder-copy-3 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors"
                        />
                        <button
                          type="button"
                          onClick={() => allSelected ? deselectAllForSport(sport.id) : selectAllForSport(sport.id)}
                          className="flex-shrink-0 text-xs text-brand hover:text-brand-2 font-medium px-3 py-1.5 rounded-lg hover:bg-brand/5 transition-colors"
                        >
                          {allSelected ? 'Deselect all' : 'Select all'}
                        </button>
                      </div>

                      {/* Team list */}
                      <div className="max-h-72 overflow-y-auto divide-y divide-line/40">
                        {filteredSportTeams.length === 0 ? (
                          <p className="text-copy-3 text-xs px-5 py-4">
                            {filterStr.trim() ? 'No teams match your search.' : 'No teams loaded.'}
                          </p>
                        ) : filteredSportTeams.map(team => {
                          const checked = selectedPresetIds.has(team.id);
                          return (
                            <label
                              key={team.id}
                              className="flex items-center gap-3 px-5 py-2.5 cursor-pointer hover:bg-field/40 transition-colors"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => togglePresetTeam(team.id)}
                                className="w-4 h-4 rounded accent-brand flex-shrink-0"
                              />
                              {team.logoUrl && (
                                <img
                                  src={team.logoUrl}
                                  alt=""
                                  className="w-5 h-5 object-contain flex-shrink-0"
                                />
                              )}
                              <span className="text-sm text-copy">{team.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {/* ── Deadlines ── */}
        {tab === 'deadlines' && (
          <div className="bg-card border border-line rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-copy mb-1">Transaction Deadlines</h2>
            <p className="text-xs text-copy-3 mb-5">
              Set a sport-wide deadline. Once the date is reached, trades and waiver claims involving that sport are blocked across all leagues.
            </p>

            {sports.length === 0 ? (
              <div className="flex items-center gap-2 text-copy-3 text-sm py-2">
                <Spinner />
                Loading sports...
              </div>
            ) : (
              <div className="space-y-1">
                {sports.map(sport => {
                  const draft = deadlineDrafts[sport.id] ?? '';
                  const status = deadlineStatuses[sport.id] ?? 'idle';
                  const savedDate = savedDeadlines[sport.id];
                  const today = new Date().toISOString().slice(0, 10);
                  const isLocked = !!savedDate && today >= savedDate;

                  return (
                    <div key={sport.id} className="flex items-center gap-3 py-3 border-b border-line/50 last:border-0">
                      <p className="flex-1 text-sm font-medium text-copy">{sport.name}</p>

                      {isLocked && (
                        <span className="flex-shrink-0 text-xs font-medium text-danger bg-danger-bg border border-danger/20 px-2 py-0.5 rounded-full">
                          Locked
                        </span>
                      )}
                      {savedDate && !isLocked && (
                        <span className="flex-shrink-0 text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                          Set
                        </span>
                      )}

                      <input
                        type="date"
                        value={draft}
                        onChange={e => {
                          setDeadlineDrafts(d => ({ ...d, [sport.id]: e.target.value }));
                          setDeadlineStatuses(s => ({ ...s, [sport.id]: 'idle' }));
                        }}
                        className="bg-field border border-line-2 rounded-lg px-3 py-1.5 text-sm text-copy focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors"
                      />

                      <button
                        onClick={() => saveDeadline(sport.id)}
                        disabled={status === 'loading'}
                        className="flex-shrink-0 flex items-center gap-1 bg-brand hover:bg-brand-2 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                      >
                        {status === 'loading' ? <Spinner /> : null}
                        Save
                      </button>

                      {savedDate && (
                        <button
                          onClick={() => clearDeadline(sport.id)}
                          disabled={status === 'loading'}
                          className="flex-shrink-0 text-xs text-danger hover:text-danger/80 px-2 py-1.5 rounded-lg hover:bg-danger-bg transition-colors disabled:opacity-50"
                        >
                          Clear
                        </button>
                      )}

                      {status === 'success' && (
                        <svg className="w-4 h-4 text-positive flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                      {status === 'error' && (
                        <span className="text-xs text-danger flex-shrink-0">Failed</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {/* ── Leagues ── */}
        {tab === 'leagues' && (
          <div className="space-y-3">
            <div className="bg-card border border-line rounded-2xl p-5">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-semibold text-copy flex-1">All Leagues</h2>
                <input
                  value={leagueSearch}
                  onChange={e => setLeagueSearch(e.target.value)}
                  placeholder="Search leagues..."
                  className="bg-field border border-line-2 rounded-xl px-3 py-1.5 text-sm text-copy placeholder-copy-3 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors w-52"
                />
              </div>
            </div>

            {filteredLeagues.length === 0 ? (
              <p className="text-copy-3 text-sm px-1">{leaguesLoaded ? 'No leagues found.' : 'Loading...'}</p>
            ) : filteredLeagues.map(league => {
              const isOpen = expandedLeagues.has(league.id);
              const lStatus = leagueStatuses[league.id];
              const nextStates = STATE_TRANSITIONS[league.state];

              return (
                <div key={league.id} className="bg-card border border-line rounded-2xl overflow-hidden">
                  {/* Row header */}
                  <button
                    type="button"
                    onClick={() => toggleLeague(league.id)}
                    className="w-full flex items-center gap-3 px-5 py-4 hover:bg-field/30 transition-colors text-left"
                  >
                    <svg
                      width="12" height="12" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                      className={`text-copy-3 transition-transform flex-shrink-0 ${isOpen ? 'rotate-90' : ''}`}
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-copy truncate">{league.name}</p>
                      <p className="text-xs text-copy-3 mt-0.5">
                        {league.selectedSports.map(s => formatLeagueName(s)).join(' · ')}
                      </p>
                    </div>
                    <span className={`flex-shrink-0 text-xs font-medium px-2 py-0.5 rounded-full border ${STATE_COLORS[league.state]}`}>
                      {league.state}
                    </span>
                  </button>

                  {/* Expanded body */}
                  {isOpen && (
                    <div className="border-t border-line px-5 py-4 space-y-4">
                      {/* Meta */}
                      <div className="flex gap-6 text-xs text-copy-3">
                        <span>Created {new Date(league.createdAt).toLocaleDateString()}</span>
                        {league.memberCap && <span>Cap: {league.memberCap}</span>}
                        <span className="font-mono truncate">ID: {league.id}</span>
                      </div>

                      {/* State transitions */}
                      {nextStates.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-copy-2 mb-2">Force State</p>
                          <div className="flex flex-wrap gap-2">
                            {nextStates.map(s => (
                              <button
                                key={s}
                                onClick={() => forceState(league.id, s)}
                                disabled={lStatus?.status === 'loading'}
                                className="text-xs font-medium px-3 py-1.5 rounded-lg border bg-field hover:bg-field-2 border-line text-copy-2 disabled:opacity-50 transition-colors"
                              >
                                → {s}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Status feedback */}
                      {lStatus && lStatus.status !== 'idle' && (
                        <p className={`text-xs ${
                          lStatus.status === 'success' ? 'text-positive' :
                          lStatus.status === 'error' ? 'text-danger' : 'text-copy-3'
                        }`}>
                          {lStatus.status === 'loading' ? 'Working...' : lStatus.message}
                        </p>
                      )}

                      {/* Open league */}
                      <div className="pt-1 border-t border-line/50">
                        <a
                          href={`/leagues/${league.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-brand hover:text-brand-2 px-3 py-1.5 rounded-lg hover:bg-brand/5 transition-colors"
                        >
                          Open League
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
                          </svg>
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
