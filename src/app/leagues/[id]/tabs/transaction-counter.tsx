'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Spinner, Lightbox } from '../_components';
import type { WaiverHistoryClaim, FantasyTeam } from '../_types';

function TransactionCounterTab({
  leagueId, fantasyTeams, waiverType, faabStartingBudget, userId,
}: {
  leagueId: string;
  fantasyTeams: FantasyTeam[];
  waiverType: 'reserve-standings' | 'faab';
  faabStartingBudget: number;
  userId?: string;
}) {
  const [claims, setClaims] = useState<WaiverHistoryClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  useEffect(() => {
    api.get<WaiverHistoryClaim[]>(`/leagues/${leagueId}/waivers/history`)
      .then(setClaims).catch(() => {}).finally(() => setLoading(false));
  }, [leagueId]);

  const approvedClaims = claims.filter(c => c.status === 'approved');

  const moveCounts = new Map<string, number>();
  for (const c of approvedClaims) {
    moveCounts.set(c.claimantUserId, (moveCounts.get(c.claimantUserId) ?? 0) + 1);
  }

  const rows = [...fantasyTeams]
    .filter(ft => !ft.isPlaceholder)
    .map(ft => ({
      ft,
      moves: moveCounts.get(ft.userId) ?? 0,
      isMe: ft.userId === userId || (ft.coOwnerIds ?? []).includes(userId ?? ''),
    }))
    .sort((a, b) => b.moves - a.moves);

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;

  const isFaab = waiverType === 'faab';

  return (
    <div className="bg-card border border-line rounded-2xl overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-line bg-field/50">
            <th className="text-left px-4 py-3 text-xs font-semibold text-copy-3 uppercase tracking-wider">Manager</th>
            {isFaab && (
              <th className="text-right px-4 py-3 text-xs font-semibold text-copy-3 uppercase tracking-wider">FAAB Left</th>
            )}
            <th className="text-right px-4 py-3 text-xs font-semibold text-copy-3 uppercase tracking-wider">Moves</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ ft, moves, isMe }) => (
            <tr key={ft.id} className={`border-b border-line/40 ${isMe ? 'bg-brand-dim/30' : ''}`}>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2.5">
                  {ft.logoUrl ? (
                    <img src={ft.logoUrl} alt={ft.displayName} className="w-7 h-7 rounded-full object-cover flex-shrink-0 cursor-pointer" onClick={() => setLightboxUrl(ft.logoUrl!)} />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-field border border-line flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-semibold text-copy-3">{ft.displayName.charAt(0).toUpperCase()}</span>
                    </div>
                  )}
                  <span className={`text-sm font-medium ${isMe ? 'text-brand' : 'text-copy'}`}>
                    {ft.displayName}{isMe && <span className="text-copy-3 font-normal text-xs ml-1">(you)</span>}
                  </span>
                </div>
              </td>
              {isFaab && (
                <td className="px-4 py-3 text-right">
                  <span className={`text-sm font-semibold tabular-nums ${isMe ? 'text-brand' : 'text-copy'}`}>
                    ${ft.faabRemaining ?? 0}
                  </span>
                </td>
              )}
              <td className="px-4 py-3 text-right">
                <span className={`text-sm font-semibold tabular-nums ${moves > 0 ? 'text-copy' : 'text-copy-3'}`}>
                  {moves}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <p className="text-copy-3 text-sm px-4 py-6 text-center">No teams yet.</p>
      )}
      <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
    </div>
  );
}

export { TransactionCounterTab };
