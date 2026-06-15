'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

interface League {
  id: string;
  name: string;
  sport: string;
  state: string;
  memberCount: number;
  maxMembers: number;
  commissionerId: string;
  selectedSports?: string[];
  startDate?: string;
  endDate?: string;
}

const STATE_META: Record<string, { label: string; cls: string }> = {
  draft:     { label: 'Draft',     cls: 'bg-warn-bg text-warn border-warn/20' },
  auction:   { label: 'Auction',   cls: 'bg-info-bg text-info border-info/20' },
  active:    { label: 'Active',    cls: 'bg-brand-dim text-brand border-brand/20' },
  completed: { label: 'Completed', cls: 'bg-field text-copy-3 border-line' },
  cancelled: { label: 'Cancelled', cls: 'bg-danger-bg text-danger border-danger/20' },
};

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<League[]>('/leagues/mine')
      .then(setLeagues)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const firstName = user?.displayName?.split(' ')[0] ?? user?.email?.split('@')[0] ?? 'there';

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <p className="text-copy-3 text-sm mb-1">Welcome back</p>
          <h1 className="text-2xl font-bold text-copy">{firstName}</h1>
        </div>
        <Link
          href="/leagues/new"
          className="flex items-center gap-2 bg-brand hover:bg-brand-2 text-white font-semibold px-4 py-2.5 rounded-xl transition-colors text-sm"
        >
          <PlusIcon />
          New League
        </Link>
      </div>

      {/* Stats row */}
      {!loading && leagues.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-8">
          {[
            { label: 'My Leagues', value: leagues.length },
            { label: 'Active', value: leagues.filter(l => l.state === 'active' || l.state === 'auction').length },
            { label: 'Commissioner', value: leagues.filter(l => l.commissionerId === user?.uid).length },
          ].map(s => (
            <div key={s.label} className="bg-card border border-line rounded-xl p-4">
              <p className="text-2xl font-bold text-copy">{s.value}</p>
              <p className="text-copy-3 text-xs mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Content */}
      {loading && (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {error && (
        <div className="bg-danger-bg border border-danger/20 rounded-xl p-4 text-danger text-sm">{error}</div>
      )}

      {!loading && !error && leagues.length === 0 && (
        <div className="text-center py-20 border border-dashed border-line rounded-2xl">
          <div className="w-14 h-14 rounded-2xl bg-brand-dim border border-brand/20 flex items-center justify-center mx-auto mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-brand">
              <path d="M6 9H4.5a2.5 2.5 0 010-5H6M18 9h1.5a2.5 2.5 0 000-5H18M3 4h18M6 9v10a1 1 0 001 1h10a1 1 0 001-1V9M9 12h6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-copy mb-1">No leagues yet</h2>
          <p className="text-copy-3 text-sm mb-6 max-w-xs mx-auto">Create your first league or ask a commissioner for an invite.</p>
          <Link
            href="/leagues/new"
            className="inline-flex items-center gap-2 bg-brand hover:bg-brand-2 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm"
          >
            <PlusIcon />
            Create a League
          </Link>
        </div>
      )}

      {!loading && leagues.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-copy-3 uppercase tracking-widest mb-3">My Leagues</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {leagues.map(league => {
              const meta = STATE_META[league.state] ?? STATE_META.completed;
              const isCommish = league.commissionerId === user?.uid;
              return (
                <Link
                  key={league.id}
                  href={`/leagues/${league.id}`}
                  className="group bg-card hover:bg-card-hover border border-line hover:border-brand/40 rounded-2xl p-5 transition-all"
                >
                  <div className="flex items-start justify-between mb-4">
                    <h3 className="font-semibold text-copy group-hover:text-brand transition-colors leading-tight pr-2">
                      {league.name}
                    </h3>
                    <span className={`flex-shrink-0 text-xs font-medium px-2.5 py-1 rounded-full border ${meta.cls}`}>
                      {meta.label}
                    </span>
                  </div>

                  {league.selectedSports && league.selectedSports.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-4">
                      {league.selectedSports.slice(0, 4).map(s => (
                        <span key={s} className="text-xs bg-field border border-line text-copy-3 px-2 py-0.5 rounded-md">
                          {s}
                        </span>
                      ))}
                      {league.selectedSports.length > 4 && (
                        <span className="text-xs text-copy-3">+{league.selectedSports.length - 4}</span>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-copy-3">
                      {league.startDate && league.endDate
                        ? `${league.startDate} – ${league.endDate}`
                        : 'Date TBD'}
                    </span>
                    {isCommish && (
                      <span className="text-xs font-medium text-brand">Commissioner</span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
