'use client';

import React from 'react';

export const STATE_META: Record<string, { label: string; cls: string }> = {
  draft:     { label: 'Draft',     cls: 'bg-warn-bg text-warn border-warn/20' },
  auction:   { label: 'Draft',     cls: 'bg-info-bg text-info border-info/20' },
  active:    { label: 'Active',    cls: 'bg-brand-dim text-brand border-brand/20' },
  completed: { label: 'Completed', cls: 'bg-field text-copy-3 border-line' },
  cancelled: { label: 'Cancelled', cls: 'bg-danger-bg text-danger border-danger/20' },
};

export const SPORT_ORDER = ['nfl', 'nba', 'mlb', 'nhl', 'ncaa-football', 'ncaa-basketball', 'premier-league', 'ucl', 'world-cup'];

export const LEAGUE_ACRONYMS = new Set(['nhl', 'nba', 'nfl', 'mlb', 'ucl', 'ncaa', 'mls', 'fifa', 'ufc']);

export function formatLeagueName(id: string): string {
  return id.split('-').map(word =>
    LEAGUE_ACRONYMS.has(word.toLowerCase())
      ? word.toUpperCase()
      : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  ).join(' ');
}

export function formatRecord(wins: number, draws: number, losses: number, sport: string): string {
  if (sport === 'soccer') return `${wins}W ${draws}D ${losses}L`;
  const parts = [`${wins}W`, `${losses}L`];
  if (draws > 0) parts.push(`${draws}D`);
  return parts.join(' ');
}

export function timeAgo(dateStr: string): string {
  const m = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const s = size === 'sm' ? 'w-5 h-5 border-[1.5px]' : 'w-8 h-8 border-2';
  return <div className={`${s} border-brand border-t-transparent rounded-full animate-spin`} />;
}

export function Lightbox({ url, onClose }: { url: string | null; onClose: () => void }) {
  if (!url) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <button onClick={onClose} className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors" aria-label="Close">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
      <img src={url} alt="" className="max-w-[90vw] max-h-[90vh] rounded-xl object-contain shadow-2xl" onClick={e => e.stopPropagation()} />
    </div>
  );
}
