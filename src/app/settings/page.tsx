'use client';

import { useState, useEffect } from 'react';
import { updateProfile } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { api } from '@/lib/api';
import { initPush } from '@/lib/push';
import { useAuth } from '@/context/AuthContext';

interface NotificationPrefs {
  auctionStarting: boolean;
  auctionEnded:    boolean;
  auctionResults:  boolean;
  rankChanged:     boolean;
  leagueInvite:    boolean;
  waiverUpdated:   boolean;
  finalStandings:  boolean;
}

const EVENT_LABELS: Record<keyof NotificationPrefs, string> = {
  auctionStarting: 'Auction starting',
  auctionEnded:    'Auction completed',
  auctionResults:  'Your auction results',
  rankChanged:     'Rank changes',
  leagueInvite:    'League invitations',
  waiverUpdated:   'Waiver claim results',
  finalStandings:  'Final standings',
};

const DEFAULT_PREFS: NotificationPrefs = {
  auctionStarting: true,
  auctionEnded:    true,
  auctionResults:  true,
  rankChanged:     true,
  leagueInvite:    true,
  waiverUpdated:   true,
  finalStandings:  true,
};

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${on ? 'bg-brand' : 'bg-field-2'}`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${on ? 'translate-x-4' : 'translate-x-0'}`}
      />
    </button>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();

  const [displayName, setDisplayName]     = useState('');
  const [nameInput, setNameInput]         = useState('');
  const [nameSaving, setNameSaving]       = useState(false);
  const [nameMsg, setNameMsg]             = useState<{ ok: boolean; text: string } | null>(null);

  const [pushPrefs, setPushPrefs]   = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [emailPrefs, setEmailPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [prefsSaving, setPrefsSaving]     = useState(false);
  const [prefsMsg, setPrefsMsg]           = useState<{ ok: boolean; text: string } | null>(null);

  const [pushPermission, setPushPermission] = useState<NotificationPermission | null>(null);
  const [enablingPush, setEnablingPush]     = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPushPermission(Notification.permission);
    }
    api.get<{ displayName: string; notificationPreferences?: { push: NotificationPrefs; email: NotificationPrefs } }>('/users/me')
      .then(u => {
        setDisplayName(u.displayName);
        setNameInput(u.displayName);
        if (u.notificationPreferences) {
          setPushPrefs({ ...DEFAULT_PREFS, ...u.notificationPreferences.push });
          setEmailPrefs({ ...DEFAULT_PREFS, ...u.notificationPreferences.email });
        }
      })
      .catch(() => {});
  }, []);

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    const name = nameInput.trim();
    if (!name || name === displayName) return;
    setNameSaving(true);
    setNameMsg(null);
    try {
      await api.patch('/users/me', { displayName: name });
      if (auth?.currentUser) await updateProfile(auth.currentUser, { displayName: name });
      setDisplayName(name);
      setNameMsg({ ok: true, text: 'Name updated.' });
    } catch (err: unknown) {
      setNameMsg({ ok: false, text: err instanceof Error ? err.message : 'Failed to save' });
    } finally {
      setNameSaving(false);
    }
  }

  async function savePrefs() {
    setPrefsSaving(true);
    setPrefsMsg(null);
    try {
      await api.patch('/users/me/notifications', { push: pushPrefs, email: emailPrefs });
      setPrefsMsg({ ok: true, text: 'Preferences saved.' });
    } catch (err: unknown) {
      setPrefsMsg({ ok: false, text: err instanceof Error ? err.message : 'Failed to save' });
    } finally {
      setPrefsSaving(false);
    }
  }

  async function enablePush() {
    setEnablingPush(true);
    await initPush();
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPushPermission(Notification.permission);
    }
    setEnablingPush(false);
  }

  const inputCls = 'w-full bg-field border border-line-2 rounded-xl px-4 py-3 text-copy text-sm placeholder-copy-3 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors';

  const EVENTS = Object.keys(EVENT_LABELS) as (keyof NotificationPrefs)[];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-copy">Settings</h1>
        <p className="text-copy-3 text-sm mt-1">Manage your profile and notification preferences.</p>
      </div>

      {/* Profile */}
      <div className="bg-card border border-line rounded-2xl p-6">
        <h2 className="text-base font-semibold text-copy mb-5">Profile</h2>
        <form onSubmit={saveName} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-copy-2 mb-1.5">Full name</label>
            <input
              type="text"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              required
              className={inputCls}
              placeholder="Your full name"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-copy-2 mb-1.5">Email</label>
            <input
              type="text"
              value={user?.email ?? ''}
              disabled
              className="w-full bg-field border border-line rounded-xl px-4 py-3 text-copy-3 text-sm cursor-not-allowed"
            />
            <p className="text-xs text-copy-3 mt-1">Email cannot be changed here.</p>
          </div>
          {nameMsg && (
            <p className={`text-xs ${nameMsg.ok ? 'text-brand' : 'text-danger'}`}>{nameMsg.text}</p>
          )}
          <button
            type="submit"
            disabled={nameSaving || !nameInput.trim() || nameInput.trim() === displayName}
            className="bg-brand hover:bg-brand-2 disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm"
          >
            {nameSaving ? 'Saving…' : 'Save name'}
          </button>
        </form>
      </div>

      {/* Push notifications opt-in */}
      {pushPermission !== 'granted' && (
        <div className="bg-card border border-line rounded-2xl p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-copy">Push notifications</h2>
              <p className="text-copy-3 text-sm mt-1">
                {pushPermission === 'denied'
                  ? 'Notifications are blocked. Enable them in your browser settings and reload.'
                  : 'Get notified about waivers, trades, and rank changes even when the app is closed.'}
              </p>
            </div>
            {pushPermission !== 'denied' && (
              <button
                onClick={enablePush}
                disabled={enablingPush}
                className="flex-shrink-0 bg-brand hover:bg-brand-2 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-xl transition-colors text-sm"
              >
                {enablingPush ? 'Enabling…' : 'Enable'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Notification preferences */}
      <div className="bg-card border border-line rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-line">
          <h2 className="text-base font-semibold text-copy">Notification preferences</h2>
          <p className="text-copy-3 text-xs mt-0.5">Choose how you want to be notified for each event.</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-line bg-field/40">
                <th className="text-left px-6 py-3 text-xs font-semibold text-copy-3 uppercase tracking-wider">Event</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-copy-3 uppercase tracking-wider">Push</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-copy-3 uppercase tracking-wider">Email</th>
              </tr>
            </thead>
            <tbody>
              {EVENTS.map(key => (
                <tr key={key} className="border-b border-line/40 last:border-0">
                  <td className="px-6 py-4 text-sm text-copy">{EVENT_LABELS[key]}</td>
                  <td className="px-4 py-4 text-center">
                    <div className="flex justify-center">
                      <Toggle
                        on={pushPrefs[key]}
                        onToggle={() => setPushPrefs(p => ({ ...p, [key]: !p[key] }))}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <div className="flex justify-center">
                      <Toggle
                        on={emailPrefs[key]}
                        onToggle={() => setEmailPrefs(p => ({ ...p, [key]: !p[key] }))}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-6 py-4 border-t border-line bg-field/20 flex items-center justify-between">
          {prefsMsg && (
            <p className={`text-xs ${prefsMsg.ok ? 'text-brand' : 'text-danger'}`}>{prefsMsg.text}</p>
          )}
          <div className="ml-auto">
            <button
              onClick={savePrefs}
              disabled={prefsSaving}
              className="bg-brand hover:bg-brand-2 disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm"
            >
              {prefsSaving ? 'Saving…' : 'Save preferences'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
