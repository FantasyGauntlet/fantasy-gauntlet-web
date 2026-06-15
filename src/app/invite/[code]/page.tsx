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
        if (data.statusCode) {
          setPreviewError(data.message ?? 'Invite not found');
        } else {
          setPreview(data as InvitePreview);
        }
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
    <div className="min-h-screen bg-gray-950">
      <NavBar />
      <main className="max-w-md mx-auto px-4 py-16">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
          {previewError ? (
            <>
              <div className="text-4xl mb-4">❌</div>
              <h1 className="text-xl font-bold text-white mb-2">Invite Not Found</h1>
              <p className="text-gray-400 text-sm mb-6">{previewError}</p>
              <Link href="/dashboard" className="text-indigo-400 hover:text-indigo-300 text-sm">
                Go to Dashboard
              </Link>
            </>
          ) : !preview ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
            </div>
          ) : preview.status !== 'pending' ? (
            <>
              <div className="text-4xl mb-4">
                {preview.status === 'accepted' ? '✓' : preview.status === 'declined' ? '✗' : '⏱'}
              </div>
              <h1 className="text-xl font-bold text-white mb-2">
                {preview.status === 'accepted' ? 'Already Accepted' :
                 preview.status === 'declined' ? 'Invite Declined' : 'Invite Expired'}
              </h1>
              <p className="text-gray-400 text-sm mb-6">
                This invite to <strong className="text-white">{preview.leagueName}</strong> is no longer active.
              </p>
              <Link href="/dashboard" className="text-indigo-400 hover:text-indigo-300 text-sm">
                Go to Dashboard
              </Link>
            </>
          ) : (
            <>
              <div className="text-5xl mb-5">🏆</div>
              <h1 className="text-2xl font-bold text-white mb-2">You're Invited!</h1>
              <p className="text-gray-300 mb-1">
                Join <strong className="text-white">{preview.leagueName}</strong> on Fantasy Gauntlet.
              </p>
              <p className="text-gray-500 text-xs mb-8">Sent to {preview.toEmail}</p>

              {authLoading ? (
                <div className="flex justify-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500" />
                </div>
              ) : !user ? (
                <div>
                  <p className="text-gray-400 text-sm mb-4">Sign in to accept this invite.</p>
                  <Link
                    href={`/login?redirect=/invite/${code}`}
                    className="inline-block bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-6 py-2.5 rounded-lg transition-colors"
                  >
                    Sign In / Create Account
                  </Link>
                </div>
              ) : action.status === 'success' ? (
                <div>
                  <p className="text-green-400 font-medium">{action.message}</p>
                  <p className="text-gray-500 text-xs mt-1">Redirecting...</p>
                </div>
              ) : (
                <div>
                  {action.status === 'error' && (
                    <p className="text-red-400 text-sm mb-4">{action.message}</p>
                  )}
                  <div className="flex gap-3 justify-center">
                    <button
                      onClick={accept}
                      disabled={action.status === 'loading'}
                      className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium px-6 py-2.5 rounded-lg transition-colors"
                    >
                      {action.status === 'loading' ? 'Processing...' : 'Accept Invite'}
                    </button>
                    <button
                      onClick={decline}
                      disabled={action.status === 'loading'}
                      className="bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 font-medium px-6 py-2.5 rounded-lg transition-colors"
                    >
                      Decline
                    </button>
                  </div>
                  <p className="text-gray-600 text-xs mt-4">
                    Signed in as {user.email}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
