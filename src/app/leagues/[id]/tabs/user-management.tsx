'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import type { FantasyTeam, League, LeagueInvite, Member } from '../_types';

function UserManagementTab({
  leagueId,
  league,
  fantasyTeams: initialTeams,
  members,
}: {
  leagueId: string;
  league: League;
  fantasyTeams: FantasyTeam[];
  members: Member[];
}) {
  const [teams, setTeams] = useState<FantasyTeam[]>(initialTeams);
  const [invites, setInvites] = useState<LeagueInvite[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(true);

  const [coOwnerInputFor, setCoOwnerInputFor] = useState<string | null>(null);
  const [coOwnerEmail, setCoOwnerEmail] = useState('');
  const [coOwnerSaving, setCoOwnerSaving] = useState(false);
  const [coOwnerError, setCoOwnerError] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [removingTeam, setRemovingTeam] = useState<string | null>(null);
  const [removingCoOwner, setRemovingCoOwner] = useState<string | null>(null);
  const [inviteActions, setInviteActions] = useState<Record<string, 'cancelling' | 'resending' | null>>({});

  const memberNameMap = Object.fromEntries(
    members.filter(m => m.displayName).map(m => [m.userId, m.displayName!]),
  );

  useEffect(() => {
    api.get<LeagueInvite[]>(`/leagues/${leagueId}/invites`)
      .then(setInvites)
      .catch(() => {})
      .finally(() => setLoadingInvites(false));
  }, [leagueId]);

  async function sendMemberInvite() {
    const email = inviteEmail.trim();
    if (!email) return;
    setInviteSending(true);
    setInviteMsg(null);
    try {
      const invite = await api.post<LeagueInvite>(`/leagues/${leagueId}/invites`, { email });
      setInvites((prev: LeagueInvite[]) => [...prev, invite]);
      setInviteEmail('');
      setInviteMsg({ type: 'success', text: `Invite sent to ${email}.` });
    } catch (e) {
      setInviteMsg({ type: 'error', text: e instanceof Error ? e.message : 'Failed to send invite' });
    } finally {
      setInviteSending(false);
    }
  }

  async function addCoOwner(teamId: string) {
    const email = coOwnerEmail.trim();
    if (!email) return;
    setCoOwnerSaving(true);
    setCoOwnerError(null);
    try {
      await api.post(`/leagues/${leagueId}/teams/${teamId}/co-owners`, { email });
      const updated = await api.get<FantasyTeam[]>(`/leagues/${leagueId}/teams`);
      setTeams(updated);
      setCoOwnerInputFor(null);
      setCoOwnerEmail('');
    } catch (e) {
      setCoOwnerError(e instanceof Error ? e.message : 'Failed to add co-manager');
    } finally {
      setCoOwnerSaving(false);
    }
  }

  async function removeCoOwner(teamId: string, uid: string, name: string) {
    if (!confirm(`Remove ${name} as co-manager?`)) return;
    const key = `${teamId}_${uid}`;
    setRemovingCoOwner(key);
    try {
      await api.delete(`/leagues/${leagueId}/teams/${teamId}/co-owners/${uid}`);
      setTeams(prev => prev.map(t => {
        if (t.id !== teamId) return t;
        const idx = (t.coOwnerIds ?? []).indexOf(uid);
        return {
          ...t,
          coOwnerIds: (t.coOwnerIds ?? []).filter(id => id !== uid),
          coOwnerDisplayNames: (t.coOwnerDisplayNames ?? []).filter((_, i) => i !== idx),
        };
      }));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to remove co-manager');
    } finally {
      setRemovingCoOwner(null);
    }
  }

  async function removeMember(team: FantasyTeam) {
    if (!confirm(`Remove ${team.displayName} from the league? This cannot be undone.`)) return;
    setRemovingTeam(team.id);
    try {
      await api.delete(`/leagues/${leagueId}/teams/${team.id}`);
      setTeams(prev => prev.filter(t => t.id !== team.id));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to remove member');
    } finally {
      setRemovingTeam(null);
    }
  }

  async function cancelInvite(inviteId: string) {
    setInviteActions(a => ({ ...a, [inviteId]: 'cancelling' }));
    try {
      await api.delete(`/leagues/${leagueId}/invites/${inviteId}`);
      setInvites(prev => prev.filter(i => i.id !== inviteId));
    } catch {
      // ignore
    } finally {
      setInviteActions(a => ({ ...a, [inviteId]: null }));
    }
  }

  async function resendInvite(inviteId: string) {
    setInviteActions(a => ({ ...a, [inviteId]: 'resending' }));
    try {
      await api.post(`/leagues/${leagueId}/invites/${inviteId}/resend`);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to resend');
    } finally {
      setInviteActions(a => ({ ...a, [inviteId]: null }));
    }
  }

  const primaryTeams = teams.filter(t => !t.isPlaceholder);
  const pending = invites.filter(i => i.status === 'pending');

  const btnBase = 'text-xs font-semibold px-2.5 py-1 rounded-lg border transition-colors whitespace-nowrap disabled:opacity-40';
  const btnBrand = `${btnBase} text-brand border-brand/30 bg-brand-dim hover:bg-brand/15`;
  const btnDanger = `${btnBase} text-danger border-danger/30 bg-danger/5 hover:bg-danger/10`;

  return (
    <div className="space-y-4">
      {/* Invite member */}
      <div className="bg-card border border-line rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-copy mb-0.5">Invite Member</h2>
        <p className="text-xs text-copy-3 mb-4">Send an email invite to add a new member to this league.</p>
        <div className="flex gap-2">
          <input
            type="email"
            value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)}
            placeholder="Email address"
            onKeyDown={e => e.key === 'Enter' && sendMemberInvite()}
            className="flex-1 bg-field border border-line-2 rounded-xl px-4 py-2.5 text-sm text-copy placeholder-copy-3 focus:outline-none focus:border-brand transition-colors"
          />
          <button
            onClick={sendMemberInvite}
            disabled={inviteSending || !inviteEmail.trim()}
            className="flex-shrink-0 bg-brand hover:bg-brand-2 disabled:opacity-40 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
          >
            {inviteSending ? 'Sending…' : 'Send Invite'}
          </button>
        </div>
        {inviteMsg && (
          <p className={`text-xs mt-2 ${inviteMsg.type === 'success' ? 'text-positive' : 'text-danger'}`}>
            {inviteMsg.text}
          </p>
        )}
      </div>

      {/* Members table */}
      <div className="bg-card border border-line rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-line">
          <h2 className="text-sm font-semibold text-copy">Members ({primaryTeams.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: '520px' }}>
            <thead>
              <tr className="border-b border-line bg-field/40">
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-copy-3 uppercase tracking-wide w-8">#</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-copy-3 uppercase tracking-wide">Team</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-copy-3 uppercase tracking-wide">Manager</th>
                <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-copy-3 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody>
              {primaryTeams.map((team, idx) => {
                const isCommissioner = team.userId === league.commissionerId;
                const coOwnerIds = team.coOwnerIds ?? [];
                const coOwnerNames = team.coOwnerDisplayNames ?? [];
                const managerName = memberNameMap[team.userId] ?? team.displayName;
                const showInputHere = coOwnerInputFor === team.id;

                return (
                  <React.Fragment key={team.id}>
                    {/* Primary member row */}
                    <tr className="border-b border-line/50 hover:bg-field/20 transition-colors">
                      <td className="px-4 py-3 text-copy-3 text-xs tabular-nums align-middle">{idx + 1}</td>
                      <td className="px-4 py-3 align-middle">
                        <div className="flex items-center gap-2.5">
                          {team.logoUrl ? (
                            <img src={team.logoUrl} alt="" className="w-7 h-7 rounded-lg object-cover flex-shrink-0" />
                          ) : (
                            <div className="w-7 h-7 rounded-lg bg-brand-dim flex items-center justify-center flex-shrink-0">
                              <span className="text-[9px] font-bold text-brand">{team.displayName.slice(0, 2).toUpperCase()}</span>
                            </div>
                          )}
                          <span className="font-medium text-copy text-sm leading-tight">{team.displayName}</span>
                          {isCommissioner && (
                            <span className="hidden sm:inline text-[10px] font-semibold bg-brand-dim text-brand px-1.5 py-0.5 rounded-md border border-brand/20 whitespace-nowrap">
                              Comm.
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-copy-2 text-sm align-middle">{managerName}</td>
                      <td className="px-4 py-3 align-middle">
                        <div className="flex items-center justify-end gap-2">
                          {coOwnerIds.length === 0 && !showInputHere && (
                            <button
                              onClick={() => { setCoOwnerInputFor(team.id); setCoOwnerEmail(''); setCoOwnerError(null); }}
                              className={btnBrand}
                            >
                              Add Co-Manager
                            </button>
                          )}
                          {!isCommissioner && (
                            <button
                              onClick={() => removeMember(team)}
                              disabled={removingTeam === team.id}
                              className={btnDanger}
                            >
                              {removingTeam === team.id ? 'Removing…' : 'Remove'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Co-manager rows */}
                    {coOwnerIds.map((uid, i) => (
                      <tr key={`co_${uid}`} className="border-b border-line/30 bg-field/20 hover:bg-field/30 transition-colors">
                        <td className="px-4 py-2" />
                        <td className="px-4 py-2 pl-10" colSpan={2}>
                          <div className="flex items-center gap-1.5">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-copy-3 flex-shrink-0">
                              <polyline points="9 18 15 12 9 6" />
                            </svg>
                            <span className="text-xs text-copy-2">{coOwnerNames[i] ?? uid}</span>
                            <span className="text-[10px] font-medium text-copy-3 bg-field-2 border border-line px-1.5 py-0.5 rounded-md">Co-Manager</span>
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex justify-end">
                            <button
                              onClick={() => removeCoOwner(team.id, uid, coOwnerNames[i] ?? uid)}
                              disabled={removingCoOwner === `${team.id}_${uid}`}
                              className={btnDanger}
                            >
                              {removingCoOwner === `${team.id}_${uid}` ? 'Removing…' : 'Remove'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}

                    {/* "Add another co-manager" link when co-owners already exist */}
                    {coOwnerIds.length > 0 && !showInputHere && (
                      <tr className="border-b border-line/30">
                        <td className="px-4 py-1.5" />
                        <td className="px-4 py-1.5 pl-10" colSpan={3}>
                          <button
                            onClick={() => { setCoOwnerInputFor(team.id); setCoOwnerEmail(''); setCoOwnerError(null); }}
                            className="text-xs text-brand hover:underline"
                          >
                            + Add co-manager
                          </button>
                        </td>
                      </tr>
                    )}

                    {/* Inline co-owner email input */}
                    {showInputHere && (
                      <tr className="border-b border-line/30 bg-brand-dim/30">
                        <td className="px-4 py-2.5" />
                        <td className="px-4 py-2.5 pl-10" colSpan={2}>
                          <div className="space-y-1">
                            <input
                              type="email"
                              value={coOwnerEmail}
                              onChange={e => { setCoOwnerEmail(e.target.value); setCoOwnerError(null); }}
                              placeholder="Co-manager email address"
                              autoFocus
                              onKeyDown={e => e.key === 'Enter' && addCoOwner(team.id)}
                              className="w-full bg-field border border-line-2 rounded-lg px-3 py-1.5 text-xs text-copy placeholder-copy-3 focus:outline-none focus:border-brand transition-colors"
                            />
                            {coOwnerError && <p className="text-[10px] text-danger">{coOwnerError}</p>}
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => { setCoOwnerInputFor(null); setCoOwnerError(null); }}
                              className="text-xs text-copy-3 border border-line px-2 py-1 rounded-lg hover:bg-field transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => addCoOwner(team.id)}
                              disabled={coOwnerSaving || !coOwnerEmail.trim()}
                              className="text-xs font-semibold text-white bg-brand hover:bg-brand-2 disabled:opacity-40 px-2.5 py-1 rounded-lg transition-colors"
                            >
                              {coOwnerSaving ? 'Sending…' : 'Invite'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pending Invites */}
      {(loadingInvites || pending.length > 0) && (
        <div className="bg-card border border-line rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-line">
            <h2 className="text-sm font-semibold text-copy">Pending Invites</h2>
          </div>
          {loadingInvites ? (
            <div className="px-5 py-6 text-center text-xs text-copy-3">Loading…</div>
          ) : (
            <div className="divide-y divide-line/50">
              {pending.map(invite => (
                <div key={invite.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div>
                    <p className="text-sm text-copy">{invite.toEmail}</p>
                    <p className="text-xs text-copy-3 mt-0.5">
                      Sent {new Date(invite.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      {' · '}
                      Expires {new Date(invite.expiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => resendInvite(invite.id)}
                      disabled={inviteActions[invite.id] != null}
                      className={btnBrand}
                    >
                      {inviteActions[invite.id] === 'resending' ? 'Resending…' : 'Resend'}
                    </button>
                    <button
                      onClick={() => cancelInvite(invite.id)}
                      disabled={inviteActions[invite.id] != null}
                      className={btnDanger}
                    >
                      {inviteActions[invite.id] === 'cancelling' ? 'Cancelling…' : 'Cancel'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export { UserManagementTab };
