'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { listenForeground } from '@/lib/push';

interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, string>;
  readAt: string | null;
  createdAt: string;
  leagueId?: string;
}

function timeAgo(dateStr: string): string {
  const m = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const TYPE_ICON: Record<string, string> = {
  tradeProposed:   '🔄',
  tradeUpdated:    '🤝',
  waiverUpdated:   '📋',
  leagueInvite:    '✉️',
  auctionStarting: '🏁',
  auctionEnded:    '🏆',
  auctionResults:  '📊',
  rankChanged:     '📈',
  finalStandings:  '🎯',
};

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const unreadCount = notifications.filter(n => !n.readAt).length;

  const fetchNotifications = useCallback(async () => {
    try {
      const data = await api.get<AppNotification[]>('/notifications');
      setNotifications(data);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30_000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Inject foreground push messages directly into the list without a re-fetch
  useEffect(() => {
    return listenForeground(({ title, body, data }) => {
      const newNotif: AppNotification = {
        id: `fg-${Date.now()}`,
        type: data.type ?? 'general',
        title,
        body,
        data,
        readAt: null,
        createdAt: new Date().toISOString(),
        leagueId: data.leagueId,
      };
      setNotifications(prev => [newNotif, ...prev]);
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  function handleBellClick() {
    setOpen(o => {
      if (!o) fetchNotifications();
      return !o;
    });
  }

  async function markRead(id: string) {
    try {
      await api.post(`/notifications/${id}/read`);
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, readAt: new Date().toISOString() } : n),
      );
    } catch { /* silent */ }
  }

  async function markAllRead() {
    setMarkingAll(true);
    try {
      await api.post('/notifications/read-all');
      const now = new Date().toISOString();
      setNotifications(prev => prev.map(n => ({ ...n, readAt: n.readAt ?? now })));
    } catch { /* silent */ }
    finally { setMarkingAll(false); }
  }

  function handleItemClick(n: AppNotification) {
    if (!n.readAt) markRead(n.id);
    setOpen(false);
    if (n.leagueId) router.push(`/leagues/${n.leagueId}`);
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={handleBellClick}
        aria-label="Notifications"
        className="relative w-8 h-8 rounded-md flex items-center justify-center text-copy-2 hover:text-copy hover:bg-field transition-colors"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-danger text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-10 w-80 bg-card border border-line rounded-2xl shadow-2xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-line">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-copy">Notifications</h3>
              {unreadCount > 0 && (
                <span className="text-xs bg-danger/20 text-danger font-semibold px-1.5 py-0.5 rounded-full">
                  {unreadCount}
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                disabled={markingAll}
                className="text-xs text-brand hover:text-brand-2 disabled:opacity-50 transition-colors"
              >
                {markingAll ? 'Marking…' : 'Mark all read'}
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[400px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-copy-3 mx-auto mb-3">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" />
                </svg>
                <p className="text-copy-3 text-sm">No notifications yet.</p>
              </div>
            ) : (
              notifications.map(n => (
                <button
                  key={n.id}
                  onClick={() => handleItemClick(n)}
                  className={`w-full text-left px-4 py-3 border-b border-line/40 last:border-0 hover:bg-field transition-colors flex gap-3 items-start ${!n.readAt ? 'bg-brand-dim/20' : ''}`}
                >
                  {/* Type icon */}
                  <span className="text-base flex-shrink-0 mt-0.5" aria-hidden>
                    {TYPE_ICON[n.type] ?? '🔔'}
                  </span>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm leading-snug ${!n.readAt ? 'font-semibold text-copy' : 'font-medium text-copy-2'}`}>
                        {n.title}
                      </p>
                      {!n.readAt && (
                        <div className="w-2 h-2 rounded-full bg-brand flex-shrink-0 mt-1.5" />
                      )}
                    </div>
                    <p className="text-xs text-copy-3 mt-0.5 leading-snug line-clamp-2">{n.body}</p>
                    <p className="text-xs text-copy-3 mt-1">{timeAgo(n.createdAt)}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
