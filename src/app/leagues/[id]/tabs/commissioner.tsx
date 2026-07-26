'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import type { League } from '../_types';

function CommissionerTab({
  league, setLeague, leagueId,
}: {
  league: League;
  setLeague: React.Dispatch<React.SetStateAction<League | null>>;
  leagueId: string;
}) {
  const router = useRouter();

  const [auctionForm, setAuctionForm] = useState({
    startingBudget:         league.auctionConfig?.startingBudget         ?? 1000,
    minOpeningBid:          league.auctionConfig?.minOpeningBid          ?? 1,
    minBidIncrement:        league.auctionConfig?.minBidIncrement        ?? 1,
    nominationMode:         league.auctionConfig?.nominationMode         ?? 'random-hidden',
    countdownSeconds:       league.auctionConfig?.countdownSeconds       ?? 15,
    maxWildcard:            league.auctionConfig?.maxWildcard            ?? league.maxWildcard ?? 0,
    noBidPenaltyPct:        league.auctionConfig?.noBidPenaltyPct        ?? 2.5,
    nominationTimerSeconds: league.auctionConfig?.nominationTimerSeconds ?? 30,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [scheduleInput, setScheduleInput] = useState(() => {
    const s = league.auctionConfig?.scheduledStartAt;
    if (!s) return '';
    const d = new Date(s);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  });
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteInput, setDeleteInput] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [renewing, setRenewing] = useState(false);

  const [topZoneEnabled, setTopZoneEnabled] = useState(!!(league.topZone));
  const [topZoneCount, setTopZoneCount] = useState(league.topZone ?? 4);
  const [bottomZoneEnabled, setBottomZoneEnabled] = useState(!!(league.bottomZone));
  const [bottomZoneCount, setBottomZoneCount] = useState(league.bottomZone ?? 3);
  const [zonesSaving, setZonesSaving] = useState(false);

  const [waiverDay, setWaiverDay] = useState(league.waiverSettings?.processingDay ?? 'tuesday');
  const [waiverHour, setWaiverHour] = useState(league.waiverSettings?.processingHour ?? 11);
  const [waiverSettingsSaving, setWaiverSettingsSaving] = useState(false);

  const [leagueName, setLeagueName] = useState(league.name ?? '');
  const [leagueNameSaving, setLeagueNameSaving] = useState(false);

  const [isPublic, setIsPublic] = useState(league.isPublic);
  const [visibilitySaving, setVisibilitySaving] = useState(false);

  const [leagueWaiverType, setLeagueWaiverType] = useState<'reserve-standings' | 'faab'>(league.waiverType ?? 'reserve-standings');
  const [leagueFaabBudget, setLeagueFaabBudget] = useState(league.faabStartingBudget ?? 100);
  const [leagueSports, setLeagueSports] = useState<string[]>(league.selectedSports ?? []);
  const [leagueSettingsSaving, setLeagueSettingsSaving] = useState(false);

  const inputCls = 'w-full bg-field border border-line-2 rounded-xl px-4 py-2.5 text-copy text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors';

  async function saveAuctionConfig(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await api.patch<League>(`/leagues/${leagueId}/auction-config`, auctionForm);
      setLeague(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function saveSchedule(clear = false) {
    setSavingSchedule(true);
    try {
      const scheduledStartAt = clear ? null : (scheduleInput ? new Date(scheduleInput).toISOString() : null);
      await api.patch(`/leagues/${leagueId}/auction/schedule`, { scheduledStartAt });
      if (league) setLeague({ ...league, auctionConfig: league.auctionConfig ? { ...league.auctionConfig, scheduledStartAt } : league.auctionConfig });
      if (clear) setScheduleInput('');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to save schedule');
    } finally {
      setSavingSchedule(false);
    }
  }

  async function handleDeleteLeague() {
    if (deleteInput !== 'delete') return;
    setDeleting(true);
    try {
      await api.delete(`/leagues/${leagueId}`);
      router.replace('/leagues');
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to delete league');
      setDeleting(false);
    }
  }

  async function handleRenew() {
    if (!confirm('Start a new season? Members will be carried over and the new league will be in draft state.')) return;
    setRenewing(true);
    try {
      const newLeague = await api.post<{ id: string }>(`/leagues/${leagueId}/renew`);
      router.push(`/leagues/${newLeague.id}`);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to renew league');
      setRenewing(false);
    }
  }

  async function saveTableZones() {
    setZonesSaving(true);
    try {
      const updated = await api.patch<League>(`/leagues/${leagueId}/table-zones`, {
        topZone: topZoneEnabled ? topZoneCount : null,
        bottomZone: bottomZoneEnabled ? bottomZoneCount : null,
      });
      setLeague(updated);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setZonesSaving(false);
    }
  }

  async function saveLeagueSettings() {
    setLeagueSettingsSaving(true);
    try {
      const body: Record<string, unknown> = {
        waiverType: leagueWaiverType,
        selectedSports: leagueSports,
      };
      if (leagueWaiverType === 'faab') body.faabStartingBudget = leagueFaabBudget;
      const updated = await api.patch<League>(`/leagues/${leagueId}/settings`, body);
      setLeague(updated);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to save league settings');
    } finally {
      setLeagueSettingsSaving(false);
    }
  }

  async function saveLeagueName() {
    const trimmed = leagueName.trim();
    if (!trimmed) return;
    setLeagueNameSaving(true);
    try {
      const updated = await api.patch<League>(`/leagues/${leagueId}/settings`, { name: trimmed });
      setLeague(updated);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to save league name');
    } finally {
      setLeagueNameSaving(false);
    }
  }

  async function saveVisibility(next: boolean) {
    setVisibilitySaving(true);
    try {
      const updated = await api.patch<League>(`/leagues/${leagueId}/settings`, { isPublic: next });
      setLeague(updated);
      setIsPublic(next);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to save visibility');
    } finally {
      setVisibilitySaving(false);
    }
  }

  async function saveWaiverSettings() {
    setWaiverSettingsSaving(true);
    try {
      const updated = await api.patch<League>(`/leagues/${leagueId}/waiver-settings`, {
        processingDay: waiverDay,
        processingHour: waiverHour,
      });
      setLeague(updated);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to save waiver settings');
    } finally {
      setWaiverSettingsSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* League name */}
      <div className="bg-card border border-line rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-copy mb-4">League Name</h2>
        <div className="flex gap-2">
          <input
            value={leagueName}
            onChange={e => setLeagueName(e.target.value)}
            placeholder="League name"
            className={inputCls}
            onKeyDown={e => e.key === 'Enter' && saveLeagueName()}
          />
          <button
            onClick={saveLeagueName}
            disabled={leagueNameSaving || !leagueName.trim() || leagueName.trim() === league.name}
            className="flex-shrink-0 bg-brand hover:bg-brand-2 disabled:opacity-40 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
          >
            {leagueNameSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* Visibility */}
      <div className="bg-card border border-line rounded-2xl p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-copy">League Visibility</h2>
            <p className="text-xs text-copy-3 mt-0.5">
              {isPublic
                ? 'Public — anyone can find this league on the Browse page.'
                : 'Private — only people with an invite link can join.'}
            </p>
          </div>
          <button
            onClick={() => saveVisibility(!isPublic)}
            disabled={visibilitySaving}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50 ${isPublic ? 'bg-brand' : 'bg-field-2'}`}
            role="switch"
            aria-checked={isPublic}
          >
            <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${isPublic ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>
      </div>

      {/* League settings — waiver type, FAAB budget, sports (draft-only) */}
      {league.state === 'draft' && <div className="bg-card border border-line rounded-2xl p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-sm font-semibold text-copy">League Settings</h2>
            <p className="text-xs text-copy-3 mt-0.5">
              {league.state === 'draft'
                ? 'Locked once the draft begins.'
                : 'Locked — draft has started.'}
            </p>
          </div>
          <button
            onClick={saveLeagueSettings}
            disabled={leagueSettingsSaving || league.state !== 'draft' || leagueSports.length === 0}
            className="flex-shrink-0 bg-brand hover:bg-brand-2 disabled:opacity-40 text-white text-xs font-semibold px-3 py-2 rounded-xl transition-colors whitespace-nowrap"
          >
            {leagueSettingsSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
        <div className="space-y-4">
          {/* Waiver type */}
          <div>
            <p className="text-xs font-medium text-copy-2 mb-2">Waiver Type</p>
            <div className="flex gap-2">
              {(['reserve-standings', 'faab'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => setLeagueWaiverType(type)}
                  disabled={league.state !== 'draft'}
                  className={`flex-1 py-2 rounded-xl border text-xs font-semibold transition-colors disabled:opacity-50 ${
                    leagueWaiverType === type
                      ? 'bg-brand text-white border-brand'
                      : 'bg-field border-line text-copy-2 hover:border-brand hover:text-brand'
                  }`}
                >
                  {type === 'faab' ? 'FAAB' : 'Standard (Standings)'}
                </button>
              ))}
            </div>
          </div>
          {/* FAAB budget */}
          {leagueWaiverType === 'faab' && (
            <div>
              <label className="block text-xs font-medium text-copy-2 mb-1.5">Starting FAAB Budget</label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-copy-3">$</span>
                <input
                  type="number"
                  min={1}
                  value={leagueFaabBudget}
                  disabled={league.state !== 'draft'}
                  onChange={e => setLeagueFaabBudget(Math.max(1, Number(e.target.value)))}
                  className="w-28 bg-field border border-line-2 rounded-xl px-3 py-2 text-sm text-copy focus:outline-none focus:border-brand disabled:opacity-50 transition-colors"
                />
              </div>
            </div>
          )}
          {/* Sports */}
          <div>
            <p className="text-xs font-medium text-copy-2 mb-2">Sports</p>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { key: 'nhl',             label: 'NHL' },
                { key: 'nba',             label: 'NBA' },
                { key: 'nfl',             label: 'NFL' },
                { key: 'mlb',             label: 'MLB' },
                { key: 'premier-league',  label: 'Premier League' },
                { key: 'ucl',             label: 'UCL' },
                { key: 'ncaa-football',   label: 'NCAA Football' },
                { key: 'ncaa-basketball', label: 'NCAA Basketball' },
                { key: 'world-cup',       label: 'World Cup' },
              ].map(({ key, label }) => {
                const checked = leagueSports.includes(key);
                return (
                  <label
                    key={key}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border select-none transition-colors ${
                      checked ? 'bg-brand-dim border-brand/30' : 'bg-field border-line'
                    } ${league.state !== 'draft' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={league.state !== 'draft'}
                      onChange={() => {
                        if (league.state !== 'draft') return;
                        setLeagueSports(prev =>
                          prev.includes(key) ? prev.filter(s => s !== key) : [...prev, key],
                        );
                      }}
                      className="w-3.5 h-3.5 accent-brand"
                    />
                    <span className="text-xs font-medium text-copy">{label}</span>
                  </label>
                );
              })}
            </div>
            {leagueSports.length === 0 && (
              <p className="text-xs text-danger mt-2">Select at least one sport.</p>
            )}
          </div>
        </div>
      </div>}

      {/* Delete modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-line rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl bg-danger/10 flex items-center justify-center flex-shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-danger">
                  <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-copy">Delete League</h3>
                <p className="text-xs text-copy-3">This cannot be undone</p>
              </div>
            </div>
            <p className="text-sm text-copy-2 mb-4">
              This will permanently delete <span className="font-semibold text-copy">{league.name}</span> along with all members, rosters, and auction data.
            </p>
            <label className="block text-xs font-medium text-copy-2 mb-1.5">
              Type <span className="font-mono font-bold text-danger">delete</span> to confirm
            </label>
            <input
              value={deleteInput}
              onChange={e => setDeleteInput(e.target.value)}
              placeholder="delete"
              className="w-full bg-field border border-line-2 rounded-xl px-4 py-2.5 text-copy text-sm placeholder-copy-3 focus:outline-none focus:border-danger focus:ring-1 focus:ring-danger transition-colors mb-4"
              onKeyDown={e => e.key === 'Enter' && deleteInput === 'delete' && handleDeleteLeague()}
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setShowDeleteModal(false); setDeleteInput(''); }}
                className="flex-1 bg-field hover:bg-field-2 border border-line text-copy-2 font-medium py-2.5 rounded-xl transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteLeague}
                disabled={deleteInput !== 'delete' || deleting}
                className="flex-1 bg-danger hover:bg-danger/80 disabled:opacity-40 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm"
              >
                {deleting ? 'Deleting…' : 'Delete League'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* State controls */}
      {(league.state === 'draft' || league.state === 'completed' || league.state === 'active') && (
        <div className="bg-card border border-line rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-copy mb-4">Commissioner Controls</h2>
          {league.state === 'draft' && (
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-copy">Skip auction &amp; go live</p>
                <p className="text-xs text-copy-3 mt-0.5">Transition directly to active without running an auction.</p>
              </div>
              <button
                onClick={async () => {
                  if (!confirm('Set league to active? This skips the auction and cannot be undone.')) return;
                  try {
                    const updated = await api.patch<League>(`/leagues/${leagueId}/state`, { state: 'active' });
                    setLeague(updated);
                  } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Failed'); }
                }}
                className="flex-shrink-0 bg-brand hover:bg-brand-2 text-white text-xs font-semibold px-3 py-2 rounded-xl transition-colors whitespace-nowrap"
              >
                Set Active
              </button>
            </div>
          )}
          {league.state === 'active' && (
            <div className="flex items-center justify-between gap-3 pb-4 mb-4 border-b border-line">
              <div>
                <p className="text-xs font-medium text-copy">End Season</p>
                <p className="text-xs text-copy-3 mt-0.5">
                  Marks the season as complete and locks all rosters.
                  {league.endDate && (
                    <> Planned end: <span className="font-medium text-copy-2">{new Date(league.endDate + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>.</>
                  )}
                </p>
              </div>
              <button
                onClick={async () => {
                  if (!confirm('End the season now? This marks the league as completed and cannot be undone.')) return;
                  try {
                    const updated = await api.patch<League>(`/leagues/${leagueId}/state`, { state: 'completed' });
                    setLeague(updated);
                  } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Failed'); }
                }}
                className="flex-shrink-0 bg-danger hover:bg-danger/80 text-white text-xs font-semibold px-3 py-2 rounded-xl transition-colors whitespace-nowrap"
              >
                End Season
              </button>
            </div>
          )}
          {(league.state === 'completed' || league.state === 'active') && (
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-copy">Start New Season</p>
                <p className="text-xs text-copy-3 mt-0.5">Creates a brand-new draft league for the next season. This league stays intact and continues running.</p>
              </div>
              <button
                onClick={handleRenew}
                disabled={renewing}
                className="flex-shrink-0 bg-brand hover:bg-brand-2 disabled:opacity-50 text-white text-xs font-semibold px-3 py-2 rounded-xl transition-colors whitespace-nowrap"
              >
                {renewing ? 'Creating...' : 'New Season'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Table Zones */}
      <div className="bg-card border border-line rounded-2xl p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-sm font-semibold text-copy">Table Zones</h2>
            <p className="text-xs text-copy-3 mt-0.5">Highlight positions on the standings table.</p>
          </div>
          <button
            onClick={saveTableZones}
            disabled={zonesSaving}
            className="flex-shrink-0 bg-brand hover:bg-brand-2 disabled:opacity-50 text-white text-xs font-semibold px-3 py-2 rounded-xl transition-colors whitespace-nowrap"
          >
            {zonesSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <label className="flex items-center gap-2.5 cursor-pointer select-none flex-1">
              <input
                type="checkbox"
                checked={topZoneEnabled}
                onChange={e => setTopZoneEnabled(e.target.checked)}
                className="w-4 h-4 rounded accent-positive"
              />
              <div>
                <p className="text-xs font-medium text-copy">Top Zone</p>
                <p className="text-xs text-copy-3">Highlighted in green — qualification / prize spots</p>
              </div>
            </label>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <input
                type="number"
                min={1}
                max={20}
                value={topZoneCount}
                disabled={!topZoneEnabled}
                onChange={e => setTopZoneCount(Math.max(1, Number(e.target.value)))}
                className="w-14 bg-field border border-line-2 rounded-lg px-2 py-1 text-xs text-copy text-center focus:outline-none focus:border-brand disabled:opacity-40 transition-colors"
              />
              <span className="text-xs text-copy-3">teams</span>
            </div>
          </div>
          <div className="h-px bg-line" />
          <div className="flex items-center justify-between gap-3">
            <label className="flex items-center gap-2.5 cursor-pointer select-none flex-1">
              <input
                type="checkbox"
                checked={bottomZoneEnabled}
                onChange={e => setBottomZoneEnabled(e.target.checked)}
                className="w-4 h-4 rounded accent-danger"
              />
              <div>
                <p className="text-xs font-medium text-copy">Relegation Zone</p>
                <p className="text-xs text-copy-3">Highlighted in red — bottom of the table</p>
              </div>
            </label>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <input
                type="number"
                min={1}
                max={20}
                value={bottomZoneCount}
                disabled={!bottomZoneEnabled}
                onChange={e => setBottomZoneCount(Math.max(1, Number(e.target.value)))}
                className="w-14 bg-field border border-line-2 rounded-lg px-2 py-1 text-xs text-copy text-center focus:outline-none focus:border-brand disabled:opacity-40 transition-colors"
              />
              <span className="text-xs text-copy-3">teams</span>
            </div>
          </div>
        </div>
      </div>

      {/* Waiver Processing */}
      {league.state === 'draft' && <div className="bg-card border border-line rounded-2xl p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-sm font-semibold text-copy">Waiver Processing</h2>
            <p className="text-xs text-copy-3 mt-0.5">Configure when pending claims are automatically processed.</p>
          </div>
          <button
            onClick={saveWaiverSettings}
            disabled={waiverSettingsSaving}
            className="flex-shrink-0 bg-brand hover:bg-brand-2 disabled:opacity-50 text-white text-xs font-semibold px-3 py-2 rounded-xl transition-colors whitespace-nowrap"
          >
            {waiverSettingsSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-copy-2 mb-1.5">Processing Day</label>
            <select value={waiverDay} onChange={e => setWaiverDay(e.target.value)} className={inputCls}>
              {['sunday','monday','tuesday','wednesday','thursday','friday','saturday'].map(d => (
                <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-copy-2 mb-1.5">Processing Time (EST)</label>
            <select value={waiverHour} onChange={e => setWaiverHour(Number(e.target.value))} className={inputCls}>
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>
                  {i === 0 ? '12:00 AM' : i < 12 ? `${i}:00 AM` : i === 12 ? '12:00 PM' : `${i - 12}:00 PM`}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>}

      {/* Auction Settings */}
      {league.state === 'draft' && <div className="bg-card border border-line rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-copy mb-1">Auction Settings</h2>
        <p className="text-xs text-copy-3 mb-5">Must be configured before starting the auction.</p>
        <form onSubmit={saveAuctionConfig} className="space-y-4">
          {(() => {
            const isSnake = auctionForm.nominationMode === 'snake-random' || auctionForm.nominationMode === 'snake-defined';
            return (
              <div className="grid grid-cols-2 gap-3">
                {!isSnake && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-copy-2 mb-1.5">Starting Budget ($)</label>
                      <input type="number" min={1} required value={auctionForm.startingBudget}
                        onFocus={e => e.target.select()}
                        onChange={e => { const v = e.target.valueAsNumber; if (!isNaN(v)) setAuctionForm(f => ({ ...f, startingBudget: v })); }}
                        className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-copy-2 mb-1.5">Min Opening Bid ($)</label>
                      <input type="number" min={1} required value={auctionForm.minOpeningBid}
                        onFocus={e => e.target.select()}
                        onChange={e => { const v = e.target.valueAsNumber; if (!isNaN(v)) setAuctionForm(f => ({ ...f, minOpeningBid: v })); }}
                        className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-copy-2 mb-1.5">Min Bid Increment ($)</label>
                      <input type="number" min={1} required value={auctionForm.minBidIncrement}
                        onFocus={e => e.target.select()}
                        onChange={e => { const v = e.target.valueAsNumber; if (!isNaN(v)) setAuctionForm(f => ({ ...f, minBidIncrement: v })); }}
                        className={inputCls} />
                    </div>
                  </>
                )}
                <div>
                  <label className="block text-xs font-medium text-copy-2 mb-1.5">Pick Clock (sec)</label>
                  <input type="number" min={5} max={300} required value={auctionForm.countdownSeconds}
                    onFocus={e => e.target.select()}
                    onChange={e => { const v = e.target.valueAsNumber; if (!isNaN(v)) setAuctionForm(f => ({ ...f, countdownSeconds: v })); }}
                    className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-copy-2 mb-1.5">Wildcard Slots</label>
                  <input type="number" min={0} max={10} required value={auctionForm.maxWildcard}
                    onFocus={e => e.target.select()}
                    onChange={e => { const v = e.target.valueAsNumber; if (!isNaN(v)) setAuctionForm(f => ({ ...f, maxWildcard: v })); }}
                    className={inputCls} />
                </div>
              </div>
            );
          })()}
          <div>
            <label className="block text-xs font-medium text-copy-2 mb-1.5">Nomination Mode</label>
            <select value={auctionForm.nominationMode}
              onChange={e => setAuctionForm(f => ({ ...f, nominationMode: e.target.value }))}
              className={inputCls}>
              <option value="manual">Manual — commissioner picks who nominates</option>
              <option value="random-disclosed">Random (disclosed) — order shown to all</option>
              <option value="random-hidden">Random (hidden) — revealed one at a time</option>
              <option value="snake-random">Snake Draft — random pick order</option>
              <option value="snake-defined">Snake Draft — commissioner sets order</option>
            </select>
          </div>
          {auctionForm.nominationMode === 'manual' && (
            <div className="col-span-2 border border-line rounded-xl p-3 space-y-3 bg-field/40">
              <p className="text-xs font-semibold text-copy-2 uppercase tracking-wide">Nomination Auction</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-copy-2 mb-1.5">No-Bid Penalty (%)</label>
                  <input type="number" min={0} max={50} step={0.5} value={auctionForm.noBidPenaltyPct}
                    onFocus={e => e.target.select()}
                    onChange={e => { const v = e.target.valueAsNumber; if (!isNaN(v)) setAuctionForm((f: typeof auctionForm) => ({ ...f, noBidPenaltyPct: v })); }}
                    className={inputCls} />
                  <p className="text-[11px] text-copy-3 mt-1">
                    Charged when nominator wins uncontested. Default 2.5% = ${Math.round(auctionForm.startingBudget * auctionForm.noBidPenaltyPct / 100)} on ${auctionForm.startingBudget}.
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-copy-2 mb-1.5">Nomination Timer (sec)</label>
                  <input type="number" min={0} max={300} value={auctionForm.nominationTimerSeconds}
                    onFocus={e => e.target.select()}
                    onChange={e => { const v = e.target.valueAsNumber; if (!isNaN(v)) setAuctionForm((f: typeof auctionForm) => ({ ...f, nominationTimerSeconds: v })); }}
                    className={inputCls} />
                  <p className="text-[11px] text-copy-3 mt-1">Seconds to pick before auto-skip. Set to 0 to disable.</p>
                </div>
              </div>
            </div>
          )}
          <button type="submit" disabled={saving}
            className="bg-brand hover:bg-brand-2 disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm">
            {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save Auction Settings'}
          </button>
        </form>
      </div>}

      {/* Schedule */}
      {league.state === 'draft' && <div className="bg-card border border-line rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-copy mb-1">Schedule Draft</h2>
        <p className="text-xs text-copy-3 mb-4">Set a date and time for the draft to auto-start. The room opens to members 1 hour beforehand.</p>
        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-copy-2 mb-1.5">Date &amp; Time (local)</label>
            <input
              type="datetime-local"
              value={scheduleInput}
              onChange={e => setScheduleInput(e.target.value)}
              className="w-full bg-field border border-line-2 rounded-xl px-3 py-2 text-sm text-copy focus:outline-none focus:border-brand transition-colors"
            />
          </div>
          <button
            onClick={() => saveSchedule(false)}
            disabled={savingSchedule || !scheduleInput}
            className="bg-brand hover:bg-brand-2 disabled:opacity-50 text-white font-semibold px-4 py-2.5 rounded-xl transition-colors text-sm whitespace-nowrap"
          >
            {savingSchedule ? 'Saving…' : 'Set Schedule'}
          </button>
          {league.auctionConfig?.scheduledStartAt && (
            <button
              onClick={() => saveSchedule(true)}
              disabled={savingSchedule}
              className="bg-field hover:bg-field-2 border border-line text-copy-2 font-medium px-4 py-2.5 rounded-xl transition-colors text-sm whitespace-nowrap"
            >
              Clear
            </button>
          )}
        </div>
        {league.auctionConfig?.scheduledStartAt && (
          <p className="text-xs text-copy-3 mt-3">
            Scheduled: <span className="text-copy font-medium">{new Date(league.auctionConfig.scheduledStartAt).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' })}</span>
          </p>
        )}
      </div>}

      {/* Danger Zone */}
      <div className="bg-card border border-danger/20 rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-danger mb-1">Danger Zone</h2>
        <p className="text-xs text-copy-3 mb-4">Destructive actions that cannot be reversed.</p>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-copy">Delete this league</p>
            <p className="text-xs text-copy-3 mt-0.5">Permanently removes all members, rosters, and data.</p>
          </div>
          <button
            onClick={() => setShowDeleteModal(true)}
            className="flex-shrink-0 bg-danger/10 hover:bg-danger/20 border border-danger/30 text-danger text-sm font-semibold px-4 py-2 rounded-xl transition-colors whitespace-nowrap"
          >
            Delete League
          </button>
        </div>
      </div>
    </div>
  );
}

export { CommissionerTab };
