'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import NavBar from '@/components/NavBar';

const BASE = 'https://fantasy-gauntlet-backend-production.up.railway.app/api/v1';

interface InvitePreview {
  leagueId: string;
  leagueName: string;
  toEmail: string;
  status: string;
}

function Spinner() {
  return <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />;
}

export default function InvitePage() {
  const { code } = useParams<{ code: string }>();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [action, setAction] = useState<{ status: 'idle' | 'loading' | 'success' | 'error'; message: string }>({ status: 'idle', message: '' });

  useEffect(() => {
    fetch(`${BASE}/leagues/invites/${code}/preview`)
      .then(r => r.json())
      .then(data => {
        if (data.statusCode) setPreviewError(data.message ?? 'Invite not found');
        else setPreview(data as InvitePreview);
      })
      .catch(() => setPreviewError('Could not load invite details'));
  }, [code]);

  async function accept() {
    setAction({ status: 'loading', message: 'Accepting...' });
    try {
      await api.post(`/leagues/invites/${code}/accept`);
      setAction({ status: 'success', message: 'You joined the league!' });
      setTimeout(() => router.push(`/leagues/${preview?.leagueId}`), 1500);
    } catch (err: unknown) {
      setAction({ status: 'error', message: err instanceof Error ? err.message : 'Failed to accept invite' });
    }
  }

  async function decline() {
    setAction({ status: 'loading', message: 'Declining...' });
    try {
      await api.post(`/leagues/invites/${code}/decline`);
      setAction({ status: 'success', message: 'Invite declined.' });
      setTimeout(() => router.push('/dashboard'), 1500);
    } catch (err: unknown) {
      setAction({ status: 'error', message: err instanceof Error ? err.message : 'Failed to decline invite' });
    }
  }

  return (
    <div className="min-h-screen bg-base">
      <NavBar />
      <main className="max-w-sm mx-auto px-4 py-16">
        <div className="bg-card border border-line rounded-2xl p-8 text-center">

          {!preview && !previewError ? (
            <div className="flex justify-center py-8"><Spinner /></div>

          ) : previewError ? (
            <>
              <div className="w-12 h-12 rounded-2xl bg-danger-bg border border-danger/20 flex items-center justify-center mx-auto mb-4">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-danger">
                  <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                </svg>
              </div>
              <h1 className="text-lg font-bold text-copy mb-2">Invite Not Found</h1>
              <p className="text-copy-3 text-sm mb-6">{previewError}</p>
              <Link href="/dashboard" className="text-brand hover:text-brand-2 text-sm font-medium transition-colors">
                Go to Dashboard
              </Link>
            </>

          ) : preview && preview.status !== 'pending' ? (
            <>
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4 ${
                preview.status === 'accepted' ? 'bg-positive-bg border border-positive/20' : 'bg-danger-bg border border-danger/20'
              }`}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  className={preview.status === 'accepted' ? 'text-positive' : 'text-danger'}>
                  {preview.status === 'accepted'
                    ? <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></>
                    : <><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></>}
                </svg>
              </div>
              <h1 className="text-lg font-bold text-copy mb-2">
                {preview.status === 'accepted' ? 'Already Accepted' :
                 preview.status === 'declined' ? 'Invite Declined' : 'Invite Expired'}
              </h1>
              <p className="text-copy-3 text-sm mb-6">
                This invite to <strong className="text-copy">{preview.leagueName}</strong> is no longer active.
              </p>
              <Link href="/dashboard" className="text-brand hover:text-brand-2 text-sm font-medium transition-colors">
                Go to Dashboard
              </Link>
            </>

          ) : preview ? (
            <>
              <div className="w-14 h-14 rounded-2xl bg-brand-dim border border-brand/20 flex items-center justify-center mx-auto mb-5">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-brand">
                  <path d="M6 9H4.5a2.5 2.5 0 010-5H6M18 9h1.5a2.5 2.5 0 000-5H18M3 4h18M6 9v10a1 1 0 001 1h10a1 1 0 001-1V9M9 12h6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h1 className="text-xl font-bold text-copy mb-1">You're Invited!</h1>
              <p className="text-copy-2 text-sm mb-1">Join <strong className="text-copy">{preview.leagueName}</strong></p>
              <p className="text-copy-3 text-xs mb-8">{preview.toEmail}</p>

              {authLoading ? (
                <div className="flex justify-center"><Spinner /></div>
              ) : !user ? (
                <div>
                  <p className="text-copy-3 text-sm mb-4">Sign in to accept this invite.</p>
                  <Link
                    href={`/login?redirect=/invite/${code}`}
                    className="inline-block bg-brand hover:bg-brand-2 text-white font-semibold px-6 py-2.5 rounded-xl transition-colors text-sm"
                  >
                    Sign In / Create Account
                  </Link>
                </div>
              ) : action.status === 'success' ? (
                <div>
                  <p className="text-positive font-semibold text-sm">{action.message}</p>
                  <p className="text-copy-3 text-xs mt-1">Redirecting...</p>
                </div>
              ) : (
                <div>
                  {action.status === 'error' && (
                    <p className="text-danger text-sm mb-4">{action.message}</p>
                  )}
                  <div className="flex gap-2 justify-center">
                    <button
                      onClick={accept}
                      disabled={action.status === 'loading'}
                      className="flex-1 bg-brand hover:bg-brand-2 disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm"
                    >
                      {action.status === 'loading' ? 'Processing...' : 'Accept'}
                    </button>
                    <button
                      onClick={decline}
                      disabled={action.status === 'loading'}
                      className="flex-1 bg-field hover:bg-field-2 border border-line disabled:opacity-50 text-copy-2 font-medium px-5 py-2.5 rounded-xl transition-colors text-sm"
                    >
                      Decline
                    </button>
                  </div>
                  <p className="text-copy-3 text-xs mt-4">Signed in as {user.email}</p>
                </div>
              )}
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}
