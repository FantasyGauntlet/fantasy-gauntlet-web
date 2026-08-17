'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { api } from '@/lib/api';
import { storage } from '@/lib/firebase';
import { Lightbox, timeAgo, formatLeagueName } from '../_components';
import type { League, Announcement, LeagueMessage, FantasyTeam } from '../_types';

function LeagueHomeTab({
  league, isCommissioner, leagueId, memberCount, userId, fantasyTeams,
}: {
  league: League;
  isCommissioner: boolean;
  leagueId: string;
  memberCount: number;
  userId?: string;
  fantasyTeams: FantasyTeam[];
}) {
  const msgEndRef = useRef<HTMLDivElement>(null);
  const annImageInputRef = useRef<HTMLInputElement>(null);
  const msgImageInputRef = useRef<HTMLInputElement>(null);

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [newAnnouncement, setNewAnnouncement] = useState('');
  const [announcementSaving, setAnnouncementSaving] = useState(false);
  const [showAnnounceForm, setShowAnnounceForm] = useState(false);
  const [showAnnImageInput, setShowAnnImageInput] = useState(false);
  const [annImageUrl, setAnnImageUrl] = useState('');
  const [annImageUploading, setAnnImageUploading] = useState(false);
  const [annImageProgress, setAnnImageProgress] = useState(0);

  const [messages, setMessages] = useState<LeagueMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [messageSending, setMessageSending] = useState(false);
  const [showMsgImageInput, setShowMsgImageInput] = useState(false);
  const [msgImageUrl, setMsgImageUrl] = useState('');
  const [msgImageUploading, setMsgImageUploading] = useState(false);
  const [msgImageProgress, setMsgImageProgress] = useState(0);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveLoading, setLeaveLoading] = useState(false);
  const leaveRouter = useRouter();
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleLeaveLeague() {
    setLeaveLoading(true);
    try {
      await api.delete(`/leagues/${leagueId}/members/me`);
      leaveRouter.replace('/dashboard');
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Failed to leave league');
      setLeaveLoading(false);
    }
  }

  function renderContent(content: string) {
    const imagePattern = /https?:\/\/\S+\.(?:gif|jpg|jpeg|png|webp)(?:[?#]\S*)?|https?:\/\/(?:media\.tenor\.com|media(?:\d+)?\.giphy\.com|i\.imgur\.com)\S*/gi;
    const parts: { type: 'text' | 'image'; value: string }[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = imagePattern.exec(content)) !== null) {
      if (m.index > last) parts.push({ type: 'text', value: content.slice(last, m.index) });
      parts.push({ type: 'image', value: m[0] });
      last = m.index + m[0].length;
    }
    if (last < content.length) parts.push({ type: 'text', value: content.slice(last) });
    return parts;
  }

  function buildMessageContent(text: string, imageUrl: string) {
    const t = text.trim();
    const u = imageUrl.trim();
    if (t && u) return `${t}\n${u}`;
    return t || u;
  }

  async function uploadImage(
    file: File,
    setUrl: (url: string) => void,
    setUploading: (v: boolean) => void,
    setProgress: (v: number) => void,
  ) {
    if (!storage) { setActionError('Firebase Storage not initialized.'); return; }
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `message-images/${leagueId}_${Date.now()}.${ext}`;
    const sRef = storageRef(storage, path);
    setUploading(true);
    setProgress(0);
    try {
      await new Promise<void>((resolve, reject) => {
        const task = uploadBytesResumable(sRef, file, { contentType: file.type });
        const timeout = setTimeout(() => { task.cancel(); reject(new Error('Upload timed out.')); }, 30000);
        task.on('state_changed',
          (snap: { bytesTransferred: number; totalBytes: number }) => setProgress(Math.round(snap.bytesTransferred / snap.totalBytes * 100)),
          (err: unknown) => { clearTimeout(timeout); reject(err); },
          () => { clearTimeout(timeout); resolve(); },
        );
      });
      setUrl(await getDownloadURL(sRef));
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  useEffect(() => {
    Promise.all([
      api.get<Announcement[]>(`/leagues/${leagueId}/announcements`).catch(() => [] as Announcement[]),
      api.get<LeagueMessage[]>(`/leagues/${leagueId}/messages`).catch(() => [] as LeagueMessage[]),
    ]).then(([anns, msgs]) => {
      setAnnouncements(anns);
      setMessages(msgs);
    });
  }, [leagueId]);

  async function handleAddAnnouncement(e: React.FormEvent) {
    e.preventDefault();
    const content = buildMessageContent(newAnnouncement, annImageUrl);
    if (!content) return;
    setAnnouncementSaving(true);
    try {
      const ann = await api.post<Announcement>(`/leagues/${leagueId}/announcements`, { content });
      setAnnouncements(prev => [ann, ...prev]);
      setNewAnnouncement('');
      setAnnImageUrl('');
      setShowAnnImageInput(false);
      setShowAnnounceForm(false);
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Failed to post');
    } finally {
      setAnnouncementSaving(false);
    }
  }

  async function handleDeleteAnnouncement(id: string) {
    try {
      await api.delete(`/leagues/${leagueId}/announcements/${id}`);
      setAnnouncements(prev => prev.filter(a => a.id !== id));
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Failed to delete');
    }
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    const content = buildMessageContent(newMessage, msgImageUrl);
    if (!content) return;
    setMessageSending(true);
    try {
      const msg = await api.post<LeagueMessage>(`/leagues/${leagueId}/messages`, { content });
      setMessages(prev => [...prev, msg]);
      setNewMessage('');
      setMsgImageUrl('');
      setShowMsgImageInput(false);
      setTimeout(() => msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Failed to send');
    } finally {
      setMessageSending(false);
    }
  }

  async function handleDeleteMessage(id: string) {
    try {
      await api.delete(`/leagues/${leagueId}/messages/${id}`);
      setMessages(prev => prev.filter(m => m.id !== id));
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Failed to delete');
    }
  }

  return (
    <div className="space-y-4">
      {actionError && (
        <div className="bg-danger/10 border border-danger/30 text-danger text-sm rounded-xl px-4 py-3 flex items-center justify-between gap-3">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="flex-shrink-0 text-danger/70 hover:text-danger text-lg leading-none">×</button>
        </div>
      )}
      {/* ── Message Board ──────────────────────────────────────────────────────── */}
      <div className="bg-card border border-line rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-line">
          <p className="text-sm font-semibold text-copy">Message Board</p>
          <p className="text-xs text-copy-3 mt-0.5">Share thoughts, predictions, and trash talk with your league.</p>
        </div>
        <div className="divide-y divide-line/30 max-h-72 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="text-center py-10 px-6">
              <div className="w-10 h-10 rounded-xl bg-field border border-line flex items-center justify-center mx-auto mb-3">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-copy-3">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                </svg>
              </div>
              <p className="text-copy-2 text-sm font-medium">No messages yet</p>
              <p className="text-copy-3 text-xs mt-1">Say something to kick off the conversation.</p>
            </div>
          ) : messages.map(msg => {
            const isOwn = msg.authorUserId === userId;
            return (
              <div key={msg.id} className={`px-5 py-3 flex items-start gap-3 group ${isOwn ? 'bg-brand-dim/20' : ''}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap mb-0.5">
                    <span className="text-xs font-semibold text-copy">{msg.authorDisplayName}</span>
                    {isOwn && <span className="text-xs text-brand">you</span>}
                    <span className="text-xs text-copy-3">{timeAgo(msg.createdAt)}</span>
                  </div>
                  <div className="text-sm text-copy-2 break-words space-y-1">
                    {renderContent(msg.content).map((part, i) =>
                      part.type === 'image'
                        ? <img key={i} src={part.value} alt="" className="max-w-xs max-h-48 rounded-lg object-contain cursor-zoom-in" onClick={() => setLightboxUrl(part.value)} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        : part.value ? <span key={i} className="whitespace-pre-wrap">{part.value}</span> : null
                    )}
                  </div>
                </div>
                {(isOwn || isCommissioner) && (
                  <button
                    onClick={() => handleDeleteMessage(msg.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-copy-3 hover:text-danger flex-shrink-0 p-1 mt-0.5"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            );
          })}
          <div ref={msgEndRef} />
        </div>
        <div className="px-5 py-3 border-t border-line">
          <input ref={msgImageInputRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f, setMsgImageUrl, setMsgImageUploading, setMsgImageProgress); e.target.value = ''; }} />
          {showMsgImageInput && (
            <div className="mb-2">
              {msgImageUrl ? (
                <div className="flex items-center gap-2">
                  <img src={msgImageUrl} alt="" className="h-14 rounded-lg object-contain border border-line" />
                  <button type="button" onClick={() => setMsgImageUrl('')} className="text-xs text-danger hover:text-danger/80">Remove</button>
                </div>
              ) : (
                <div
                  onClick={() => !msgImageUploading && msgImageInputRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type.startsWith('image/')) uploadImage(f, setMsgImageUrl, setMsgImageUploading, setMsgImageProgress); }}
                  className="border border-dashed border-line-2 rounded-xl px-4 py-3 text-center cursor-pointer hover:border-brand/40 transition-colors"
                >
                  {msgImageUploading
                    ? <p className="text-xs text-copy-3">Uploading {msgImageProgress}%…</p>
                    : <p className="text-xs text-copy-3">Drop, paste or <span className="text-brand">browse</span> to attach an image</p>}
                  {msgImageUploading && <div className="mt-1.5 h-1 bg-line rounded-full overflow-hidden"><div className="h-full bg-brand transition-all duration-200" style={{ width: `${msgImageProgress}%` }} /></div>}
                </div>
              )}
            </div>
          )}
          <form onSubmit={handleSendMessage} className="flex gap-2">
            <input
              value={newMessage}
              onChange={e => setNewMessage(e.target.value)}
              onPaste={e => { const item = [...e.clipboardData.items].find(i => i.type.startsWith('image/')); if (!item) return; const f = item.getAsFile(); if (f) { e.preventDefault(); setShowMsgImageInput(true); uploadImage(f, setMsgImageUrl, setMsgImageUploading, setMsgImageProgress); } }}
              placeholder="Send a message..."
              maxLength={500}
              className="flex-1 bg-field border border-line-2 rounded-xl px-4 py-2 text-copy text-sm placeholder-copy-3 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors"
            />
            <button
              type="button"
              onClick={() => { setShowMsgImageInput(v => !v); if (showMsgImageInput) setMsgImageUrl(''); }}
              title="Attach image"
              className={`flex-shrink-0 border text-sm px-3 py-2 rounded-xl transition-colors ${showMsgImageInput ? 'bg-brand-dim border-brand text-brand' : 'bg-field border-line-2 text-copy-3 hover:text-copy hover:border-line'}`}
            >
              🖼
            </button>
            <button
              type="submit"
              disabled={(!newMessage.trim() && !msgImageUrl.trim()) || messageSending}
              className="bg-brand hover:bg-brand-2 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors whitespace-nowrap"
            >
              {messageSending ? '...' : 'Send'}
            </button>
          </form>
        </div>
      </div>

      {/* ── Commissioner Board ─────────────────────────────────────────────────── */}
      <div className="bg-card border border-line rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-line flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-copy">Commissioner Board</p>
            <p className="text-xs text-copy-3 mt-0.5">Custom rules and announcements from the commissioner.</p>
          </div>
          {isCommissioner && (
            <button
              onClick={() => setShowAnnounceForm(v => !v)}
              className="flex-shrink-0 bg-field hover:bg-field-2 border border-line text-copy-2 text-xs font-medium px-3 py-1.5 rounded-xl transition-colors"
            >
              {showAnnounceForm ? 'Cancel' : '+ Post'}
            </button>
          )}
        </div>
        {isCommissioner && showAnnounceForm && (
          <form onSubmit={handleAddAnnouncement} className="px-5 py-4 border-b border-line bg-field/30 space-y-2">
            <input ref={annImageInputRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f, setAnnImageUrl, setAnnImageUploading, setAnnImageProgress); e.target.value = ''; }} />
            <textarea
              value={newAnnouncement}
              onChange={e => setNewAnnouncement(e.target.value)}
              onPaste={e => { const item = [...e.clipboardData.items].find(i => i.type.startsWith('image/')); if (!item) return; const f = item.getAsFile(); if (f) { e.preventDefault(); setShowAnnImageInput(true); uploadImage(f, setAnnImageUrl, setAnnImageUploading, setAnnImageProgress); } }}
              placeholder="Write an announcement or custom rule..."
              rows={3}
              maxLength={1000}
              className="w-full bg-card border border-line-2 rounded-xl px-4 py-2.5 text-copy text-sm placeholder-copy-3 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors resize-none"
            />
            {showAnnImageInput && (
              annImageUrl ? (
                <div className="flex items-center gap-2">
                  <img src={annImageUrl} alt="" className="h-14 rounded-lg object-contain border border-line" />
                  <button type="button" onClick={() => setAnnImageUrl('')} className="text-xs text-danger hover:text-danger/80">Remove</button>
                </div>
              ) : (
                <div
                  onClick={() => !annImageUploading && annImageInputRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type.startsWith('image/')) uploadImage(f, setAnnImageUrl, setAnnImageUploading, setAnnImageProgress); }}
                  className="border border-dashed border-line-2 rounded-xl px-4 py-3 text-center cursor-pointer hover:border-brand/40 transition-colors"
                >
                  {annImageUploading
                    ? <p className="text-xs text-copy-3">Uploading {annImageProgress}%…</p>
                    : <p className="text-xs text-copy-3">Drop, paste or <span className="text-brand">browse</span> to attach an image</p>}
                  {annImageUploading && <div className="mt-1.5 h-1 bg-line rounded-full overflow-hidden"><div className="h-full bg-brand transition-all duration-200" style={{ width: `${annImageProgress}%` }} /></div>}
                </div>
              )
            )}
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => { setShowAnnImageInput(v => !v); if (showAnnImageInput) setAnnImageUrl(''); }}
                title="Attach image"
                className={`border text-xs px-3 py-1.5 rounded-xl transition-colors ${showAnnImageInput ? 'bg-brand-dim border-brand text-brand' : 'bg-field border-line text-copy-3 hover:text-copy hover:border-line-2'}`}
              >
                🖼 Image
              </button>
              <button
                type="submit"
                disabled={(!newAnnouncement.trim() && !annImageUrl.trim()) || announcementSaving}
                className="bg-brand hover:bg-brand-2 disabled:opacity-50 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors"
              >
                {announcementSaving ? 'Posting...' : 'Post Announcement'}
              </button>
            </div>
          </form>
        )}
        {announcements.length === 0 ? (
          <div className="text-center py-10 px-6">
            <div className="w-10 h-10 rounded-xl bg-field border border-line flex items-center justify-center mx-auto mb-3">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-copy-3">
                <path d="M22 8.5c0 2.5-4.5 8.5-10 8.5S2 11 2 8.5a10 10 0 0120 0z" /><path d="M12 17v4M8 21h8" />
              </svg>
            </div>
            <p className="text-copy-2 text-sm font-medium">No announcements yet</p>
            {isCommissioner
              ? <p className="text-copy-3 text-xs mt-1">Post rules, reminders, or notes for your league members.</p>
              : <p className="text-copy-3 text-xs mt-1">Your commissioner hasn&apos;t posted anything yet.</p>}
          </div>
        ) : (
          <div className="divide-y divide-line/30">
            {announcements.map(ann => (
              <div key={ann.id} className="px-5 py-4 flex items-start gap-3 group">
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap mb-1">
                    <span className="text-xs font-semibold text-copy-2">{ann.authorDisplayName}</span>
                    <span className="text-xs text-copy-3">{timeAgo(ann.createdAt)}</span>
                  </div>
                  <div className="text-sm text-copy leading-relaxed break-words space-y-1">
                    {renderContent(ann.content).map((part, i) =>
                      part.type === 'image'
                        ? <img key={i} src={part.value} alt="" className="max-w-xs max-h-48 rounded-lg object-contain cursor-zoom-in" onClick={() => setLightboxUrl(part.value)} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        : part.value ? <span key={i} className="whitespace-pre-wrap">{part.value}</span> : null
                    )}
                  </div>
                </div>
                {isCommissioner && (
                  <button
                    onClick={() => handleDeleteAnnouncement(ann.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-copy-3 hover:text-danger flex-shrink-0 p-1 mt-0.5"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── League Info ────────────────────────────────────────────────────────── */}
      <div className="bg-card border border-line rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-copy mb-4">League Info</h2>
        <div className="grid grid-cols-2 gap-3 text-sm mb-4">
          {[
            { label: 'League ID', value: <code className="text-xs font-mono text-copy-2">{league.id}</code> },
            { label: 'Visibility', value: <span className="text-copy">{league.isPublic ? 'Public' : 'Private'}</span> },
            { label: 'Start', value: <span className="text-copy">{league.startDate}</span> },
            { label: 'End', value: <span className="text-copy">{league.endDate}</span> },
            { label: 'Members', value: <span className="text-copy">{memberCount}{league.memberCap ? ` / ${league.memberCap}` : ''}</span> },
            { label: 'Roster Size', value: <span className="text-copy">{league.selectedSports.length + (league.maxWildcard ?? 0)}{(league.maxWildcard ?? 0) > 0 ? ` (${league.maxWildcard} wildcard${league.maxWildcard !== 1 ? 's' : ''})` : ''}</span> },
          ].map(row => (
            <div key={row.label}>
              <p className="text-xs text-copy-3 mb-0.5">{row.label}</p>
              {row.value}
            </div>
          ))}
        </div>
        <div>
          <p className="text-xs text-copy-3 mb-2">Sports</p>
          <div className="flex gap-1.5 flex-wrap">
            {league.selectedSports.map(s => (
              <span key={s} className="text-xs bg-field border border-line text-copy-2 px-2.5 py-1 rounded-lg">{formatLeagueName(s)}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Leave league — non-commissioners only */}
      {!isCommissioner && (
        <div className="bg-card border border-danger/20 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-copy mb-1">Leave League</h2>
          <p className="text-xs text-copy-3 mb-4">
            You will lose access to this league and your roster will be cleared. This cannot be undone.
          </p>
          <button
            onClick={() => setShowLeaveModal(true)}
            className="text-sm font-semibold text-danger border border-danger/30 hover:bg-danger-bg px-4 py-2 rounded-xl transition-colors"
          >
            Leave League
          </button>
        </div>
      )}

      {/* Leave confirmation modal */}
      {showLeaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowLeaveModal(false)} />
          <div className="relative bg-card border border-line rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-base font-semibold text-copy">Leave {league.name}?</h2>
            <p className="text-sm text-copy-3">Your roster will be cleared and you will lose access. You can only re-join if the commissioner invites you again.</p>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowLeaveModal(false)}
                className="flex-1 bg-field hover:bg-field-2 border border-line text-copy-2 font-medium py-2.5 rounded-xl transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleLeaveLeague}
                disabled={leaveLoading}
                className="flex-1 bg-danger hover:bg-danger/90 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm"
              >
                {leaveLoading ? 'Leaving…' : 'Yes, leave'}
              </button>
            </div>
          </div>
        </div>
      )}

      <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />

    </div>
  );
}

export { LeagueHomeTab };
