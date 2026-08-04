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

  // Co-manager inline input
  const [coOwnerInputFor, setCoOwnerInputFor] = useState<string | null>(null);
  const [coOwnerEmail, setCoOwnerEmail] = useState('');
  const [coOwnerSaving, setCoOwnerSaving] = useState(false);
  const [coOwnerError, setCoOwnerError] = useState<string | null>(null);

  // Placeholder invite — per-team email input + sent history
  const [placeholderInviteEmails, setPlaceholderInviteEmails] = useState<Record<string, string>>({});
  const [placeholderInviteSaving, setPlaceholderInviteSaving] = useState(false);
  const [placeholderInviteMsg, setPlaceholderInviteMsg] = useState<Record<string, { type: 'success' | 'error'; text: string }>>({});
  const [placeholderSentEmails, setPlaceholderSentEmails] = useState<Record<string, string[]>>({});

  // Placeholder creation
  const [placeholderName, setPlaceholderName] = useState('');
  const [addingPlaceholder, setAddingPlaceholder] = useState(false);

  // Row-level action states
  const [removingTeam, setRemovingTeam] = useState<string | null>(null);
  const [removingCoOwner, setRemovingCoOwner] = useState<string | null>(null);
  const [inviteActions, setInviteActions] = useState<Record<string, 'cancelling' | 'resending' | null>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);

  const memberNameMap = Object.fromEntries(
    members.filter(m => m.displayName).map(m => [m.userId, m.displayName!]),
  );

  useEffect(() => {
    api.get<LeagueInvite[]>(`/leagues/${leagueId}/invites`)
      .then(setInvites)
      .catch(() => {})
      .finally(() => setLoadingInvites(false));
  }, [leagueId]);

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
      setTeams((prev: FantasyTeam[]) => prev.map((t: FantasyTeam) => {
        if (t.id !== teamId) return t;
        const idx = (t.coOwnerIds ?? []).indexOf(uid);
        return {
          ...t,
          coOwnerIds: (t.coOwnerIds ?? []).filter((id: string) => id !== uid),
          coOwnerDisplayNames: (t.coOwnerDisplayNames ?? []).filter((_: string, i: number) => i !== idx),
        };
      }));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to remove co-manager');
    } finally {
      setRemovingCoOwner(null);
    }
  }

  async function removeMember(team: FantasyTeam) {
    const label = team.isPlaceholder ? 'placeholder slot' : team.displayName;
    if (!confirm(`Remove ${label} from the league? This cannot be undone.`)) return;
    setRemovingTeam(team.id);
    try {
      await api.delete(`/leagues/${leagueId}/teams/${team.id}`);
      setTeams((prev: FantasyTeam[]) => prev.filter((t: FantasyTeam) => t.id !== team.id));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to remove member');
    } finally {
      setRemovingTeam(null);
    }
  }

  async function sendPlaceholderInvite(teamId: string) {
    const email = (placeholderInviteEmails[teamId] ?? '').trim();
    if (!email) return;
    setPlaceholderInviteSaving(true);
    try {
      const invite = await api.post<LeagueInvite>(`/leagues/${leagueId}/invites`, { email, placeholderTeamId: teamId });
      setInvites((prev: LeagueInvite[]) => [...prev, invite]);
      setPlaceholderInviteEmails((m: Record<string, string>) => ({ ...m, [teamId]: '' }));
      setPlaceholderSentEmails((m: Record<string, string[]>) => ({ ...m, [teamId]: [...(m[teamId] ?? []), email] }));
      setPlaceholderInviteMsg((m: Record<string, { type: 'success' | 'error'; text: string }>) => ({ ...m, [teamId]: { type: 'success', text: `Invite sent to ${email}` } }));
    } catch (e) {
      setPlaceholderInviteMsg((m: Record<string, { type: 'success' | 'error'; text: string }>) => ({ ...m, [teamId]: { type: 'error', text: e instanceof Error ? e.message : 'Failed' } }));
    } finally {
      setPlaceholderInviteSaving(false);
    }
  }

  async function addPlaceholder(e: React.FormEvent) {
    e.preventDefault();
    if (!placeholderName.trim()) return;
    setAddingPlaceholder(true);
    try {
      const team = await api.post<FantasyTeam>(`/leagues/${leagueId}/members/placeholder`, { displayName: placeholderName.trim() });
      setTeams((prev: FantasyTeam[]) => [...prev, team]);
      setPlaceholderName('');
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to add placeholder');
    } finally {
      setAddingPlaceholder(false);
    }
  }

  async function cancelInvite(inviteId: string) {
    setInviteActions((a: Record<string, 'cancelling' | 'resending' | null>) => ({ ...a, [inviteId]: 'cancelling' }));
    try {
      await api.delete(`/leagues/${leagueId}/invites/${inviteId}`);
      setInvites((prev: LeagueInvite[]) => prev.filter((i: LeagueInvite) => i.id !== inviteId));
    } catch {
      // ignore
    } finally {
      setInviteActions((a: Record<string, 'cancelling' | 'resending' | null>) => ({ ...a, [inviteId]: null }));
    }
  }

  async function resendInvite(inviteId: string) {
    setInviteActions((a: Record<string, 'cancelling' | 'resending' | null>) => ({ ...a, [inviteId]: 'resending' }));
    try {
      await api.post(`/leagues/${leagueId}/invites/${inviteId}/resend`);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to resend');
    } finally {
      setInviteActions((a: Record<string, 'cancelling' | 'resending' | null>) => ({ ...a, [inviteId]: null }));
    }
  }

  const realTeams = teams.filter(t => !t.isPlaceholder);
  const placeholderTeams = teams.filter(t => t.isPlaceholder);
  const pending = invites.filter(i => i.status === 'pending');

  const btnBase = 'text-xs font-semibold px-2.5 py-1 rounded-lg border transition-colors whitespace-nowrap disabled:opacity-40';
  const btnBrand = `${btnBase} text-brand border-brand/30 bg-brand-dim hover:bg-brand/15`;
  const btnDanger = `${btnBase} text-danger border-danger/30 bg-danger/5 hover:bg-danger/10`;

  const renderCoOwnerRows = (team: FantasyTeam) => {
    const coOwnerIds = team.coOwnerIds ?? [];
    const coOwnerNames = team.coOwnerDisplayNames ?? [];
    const showInput = coOwnerInputFor === team.id;
    return (
      <>
        {coOwnerIds.map((uid: string, i: number) => (
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

        {coOwnerIds.length > 0 && !showInput && (
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

        {showInput && (
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
      </>
    );
  };

  const renderPlaceholderInviteRow = (team: FantasyTeam) => {
    const sentEmails = placeholderSentEmails[team.id] ?? [];
    const msg = placeholderInviteMsg[team.id];
    const inputVal = placeholderInviteEmails[team.id] ?? '';
    return (
      <tr className="border-b border-line/30 bg-field/10">
        <td className="px-4 py-2.5" />
        <td className="px-4 py-2.5 pl-10" colSpan={3}>
          {sentEmails.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {sentEmails.map(email => (
                <span key={email} className="text-[10px] bg-positive/10 text-positive border border-positive/20 px-2 py-0.5 rounded-full">
                  ✓ {email}
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-1.5">
            <input
              type="email"
              value={inputVal}
              onChange={e => setPlaceholderInviteEmails(m => ({ ...m, [team.id]: e.target.value }))}
              placeholder="Invite by email…"
              onKeyDown={e => e.key === 'Enter' && sendPlaceholderInvite(team.id)}
              className="flex-1 bg-field border border-line-2 rounded-lg px-3 py-1.5 text-xs text-copy placeholder-copy-3 focus:outline-none focus:border-brand transition-colors"
            />
            <button
              onClick={() => sendPlaceholderInvite(team.id)}
              disabled={placeholderInviteSaving || !inputVal.trim()}
              className="text-xs font-semibold text-white bg-brand hover:bg-brand-2 disabled:opacity-40 px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap"
            >
              {placeholderInviteSaving ? 'Sending…' : 'Send Invite'}
            </button>
          </div>
          {msg && (
            <p className={`text-[10px] mt-1 ${msg.type === 'success' ? 'text-positive' : 'text-danger'}`}>{msg.text}</p>
          )}
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-4">
      {actionError && (
        <div className="bg-danger/10 border border-danger/30 text-danger text-sm rounded-xl px-4 py-3 flex items-center justify-between gap-3">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="flex-shrink-0 text-danger/70 hover:text-danger text-lg leading-none">×</button>
        </div>
      )}
      {/* Add Team — draft only */}
      {league.state === 'draft' && (
        <div className="bg-card border border-line rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-copy mb-0.5">Add Team</h2>
          <p className="text-xs text-copy-3 mb-4">Reserve a draft slot for a player who hasn't joined yet. Send them invites from the table below.</p>
          <form onSubmit={addPlaceholder} className="flex gap-2">
            <input
              value={placeholderName}
              onChange={e => setPlaceholderName(e.target.value)}
              placeholder="Team name…"
              required
              className="flex-1 bg-field border border-line-2 rounded-xl px-4 py-2.5 text-sm text-copy placeholder-copy-3 focus:outline-none focus:border-brand transition-colors"
            />
            <button
              type="submit"
              disabled={addingPlaceholder || !placeholderName.trim()}
              className="flex-shrink-0 bg-brand hover:bg-brand-2 disabled:opacity-40 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors whitespace-nowrap"
            >
              {addingPlaceholder ? 'Adding…' : '+ Add Team'}
            </button>
          </form>
        </div>
      )}

      {/* Members table */}
      <div className="bg-card border border-line rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-line">
          <h2 className="text-sm font-semibold text-copy">Members ({realTeams.length})</h2>
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
              {realTeams.map((team, idx) => {
                const isCommissionerTeam = team.userId === league.commissionerId;
                const coOwnerIds = team.coOwnerIds ?? [];
                const managerName = memberNameMap[team.userId] ?? team.displayName;
                const showCoOwnerInput = coOwnerInputFor === team.id;

                return (
                  <React.Fragment key={team.id}>
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
                          {isCommissionerTeam && (
                            <span className="hidden sm:inline text-[10px] font-semibold bg-brand-dim text-brand px-1.5 py-0.5 rounded-md border border-brand/20 whitespace-nowrap">Comm.</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-copy-2 text-sm align-middle">{managerName}</td>
                      <td className="px-4 py-3 align-middle">
                        <div className="flex items-center justify-end gap-2">
                          {coOwnerIds.length === 0 && !showCoOwnerInput && (
                            <button
                              onClick={() => { setCoOwnerInputFor(team.id); setCoOwnerEmail(''); setCoOwnerError(null); }}
                              className={btnBrand}
                            >
                              Add Co-Manager
                            </button>
                          )}
                          {!isCommissionerTeam && (
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
                    {renderCoOwnerRows(team)}
                  </React.Fragment>
                );
              })}

              {/* Placeholder teams */}
              {placeholderTeams.length > 0 && (
                <tr className="border-b border-line bg-field/40">
                  <td colSpan={4} className="px-4 py-2 text-[10px] font-semibold text-copy-3 uppercase tracking-wide">
                    Placeholder Slots
                  </td>
                </tr>
              )}
              {placeholderTeams.map(team => (
                <React.Fragment key={team.id}>
                  <tr className="border-b border-line/50 hover:bg-field/20 transition-colors">
                    <td className="px-4 py-3 align-middle">
                      <span className="text-[10px] font-semibold text-warn bg-warn-bg border border-warn/20 px-1.5 py-0.5 rounded-md">open</span>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-field-2 border border-line flex items-center justify-center flex-shrink-0">
                          <span className="text-[10px] text-copy-3">?</span>
                        </div>
                        <span className="font-medium text-copy-2 text-sm">{team.displayName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-copy-3 text-xs align-middle italic">Awaiting invite</td>
                    <td className="px-4 py-3 align-middle">
                      <div className="flex items-center justify-end">
                        <button
                          onClick={() => removeMember(team)}
                          disabled={removingTeam === team.id}
                          className={btnDanger}
                        >
                          {removingTeam === team.id ? 'Removing…' : 'Remove'}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {renderPlaceholderInviteRow(team)}
                </React.Fragment>
              ))}
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
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/invite/${invite.inviteCode}`);
                        setCopiedInviteId(invite.id);
                        setTimeout(() => setCopiedInviteId(null), 2000);
                      }}
                      className={btnBrand}
                    >
                      {copiedInviteId === invite.id ? 'Copied!' : 'Copy Link'}
                    </button>
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
