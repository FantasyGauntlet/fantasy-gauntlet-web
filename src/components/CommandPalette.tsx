'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

interface League { id: string; name: string; state: string; }

const STATIC_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', sub: 'Home', href: '/dashboard', icon: 'home' },
  { id: 'new-league', label: 'New League', sub: 'Create', href: '/leagues/new', icon: 'plus' },
  { id: 'browse', label: 'Browse Leagues', sub: 'Explore', href: '/leagues', icon: 'search' },
  { id: 'settings', label: 'Settings', sub: 'Account & notifications', href: '/settings', icon: 'settings' },
];

const STATE_LABELS: Record<string, string> = { active: 'Active', draft: 'Draft', auction: 'Draft', completed: 'Ended' };

function NavIcon({ type }: { type: string }) {
  const cls = 'flex-shrink-0';
  if (type === 'home') return <svg className={cls} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
  if (type === 'plus') return <svg className={cls} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
  if (type === 'search') return <svg className={cls} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
  if (type === 'settings') return <svg className={cls} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>;
  return <svg className={cls} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 9H4.5a2.5 2.5 0 010-5H6M18 9h1.5a2.5 2.5 0 000-5H18M3 4h18M6 9v10a1 1 0 001 1h10a1 1 0 001-1V9"/></svg>;
}

export function CommandPalette() {
  const { user } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [leagues, setLeagues] = useState<League[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(v => !v);
      }
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 10);
      if (user && leagues.length === 0) {
        api.get<League[]>('/leagues/mine').then(setLeagues).catch(() => {});
      }
    }
  }, [open, user]);

  const leagueItems = leagues.map(l => ({
    id: l.id,
    label: l.name,
    sub: STATE_LABELS[l.state] ?? l.state,
    href: `/leagues/${l.id}`,
    icon: 'league',
  }));

  const allItems = [...STATIC_ITEMS, ...leagueItems];
  const filtered = query.trim()
    ? allItems.filter(i => i.label.toLowerCase().includes(query.toLowerCase()) || i.sub.toLowerCase().includes(query.toLowerCase()))
    : allItems;

  const navigate = useCallback((href: string) => {
    setOpen(false);
    router.push(href);
  }, [router]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, filtered.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && filtered[activeIdx]) navigate(filtered[activeIdx].href);
  }

  useEffect(() => {
    const el = listRef.current?.children[activeIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  if (!user || !open) return null;

  return (
    <div className="fixed inset-0 z-[9998] flex items-start justify-center pt-[15vh] px-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-lg bg-card border border-line rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-line">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-copy-3 flex-shrink-0">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search leagues, pages…"
            className="flex-1 bg-transparent text-sm text-copy placeholder-copy-3 focus:outline-none"
          />
          <kbd className="hidden sm:inline text-[10px] text-copy-3 border border-line rounded px-1.5 py-0.5 font-mono">Esc</kbd>
        </div>
        <div ref={listRef} className="overflow-y-auto max-h-72 py-1">
          {filtered.length === 0 ? (
            <p className="text-center text-copy-3 text-sm py-8">No results for &ldquo;{query}&rdquo;</p>
          ) : (
            filtered.map((item, i) => (
              <button
                key={item.id}
                onClick={() => navigate(item.href)}
                onMouseEnter={() => setActiveIdx(i)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${i === activeIdx ? 'bg-brand-dim text-brand' : 'text-copy-2 hover:bg-field'}`}
              >
                <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${i === activeIdx ? 'bg-brand/20 text-brand' : 'bg-field text-copy-3'}`}>
                  <NavIcon type={item.icon} />
                </div>
                <span className="flex-1 text-sm font-medium truncate">{item.label}</span>
                <span className="text-xs text-copy-3 flex-shrink-0">{item.sub}</span>
              </button>
            ))
          )}
        </div>
        <div className="border-t border-line px-4 py-2 flex items-center gap-4 text-[10px] text-copy-3">
          <span><kbd className="font-mono border border-line rounded px-1 py-0.5">↑↓</kbd> navigate</span>
          <span><kbd className="font-mono border border-line rounded px-1 py-0.5">↵</kbd> open</span>
          <span><kbd className="font-mono border border-line rounded px-1 py-0.5">Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
