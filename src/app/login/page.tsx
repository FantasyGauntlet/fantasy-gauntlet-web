'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { api } from '@/lib/api';

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-base flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') ?? '/dashboard';
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === 'signup' && !name.trim()) { setError('Please enter your full name.'); return; }
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(result.user, { displayName: name.trim() });
        await api.patch('/users/me', { displayName: name.trim() });
      }
      router.replace(redirect);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError('');
    setLoading(true);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      router.replace(redirect);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed');
    } finally {
      setLoading(false);
    }
  }

  const inputCls = 'w-full bg-field border border-line-2 rounded-xl px-4 py-3 text-copy text-sm placeholder-copy-3 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors';

  return (
    <div className="min-h-screen bg-base flex">
      {/* Left panel — hero */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 bg-card border-r border-line p-12">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Fantasy Gauntlet" className="w-10 h-10 rounded-xl object-contain" />
          <span className="text-xl font-extrabold text-copy tracking-tight">Fantasy Gauntlet</span>
        </div>

        <div>
          <div className="inline-flex items-center gap-2 bg-brand-dim border border-brand/20 rounded-full px-3 py-1 text-brand text-xs font-medium mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-brand" />
            Multi-sport fantasy platform
          </div>
          <h1 className="text-4xl font-bold text-copy leading-tight mb-4">
            Build your<br />
            ultimate<br />
            <span className="text-brand">roster.</span>
          </h1>
          <p className="text-copy-2 text-lg leading-relaxed">
            Draft teams from the NFL, NBA, NHL, MLB, Premier League and more — all in one league.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Professional leagues', value: '8' },
            { label: 'Scoring modes', value: 'Live' },
            { label: 'Auction draft', value: 'Built-in' },
          ].map(stat => (
            <div key={stat.label} className="bg-field rounded-xl p-4 border border-line">
              <p className="text-brand font-bold text-lg">{stat.value}</p>
              <p className="text-copy-3 text-xs mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          {/* Mobile brand */}
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <img src="/logo.png" alt="Fantasy Gauntlet" className="w-9 h-9 rounded-xl object-contain" />
            <span className="text-lg font-extrabold text-copy tracking-tight">Fantasy Gauntlet</span>
          </div>

          <h2 className="text-2xl font-bold text-copy mb-1">
            {mode === 'login' ? 'Welcome back' : 'Create account'}
          </h2>
          <p className="text-copy-3 text-sm mb-8">
            {mode === 'login' ? "Sign in to your account." : 'Start your fantasy journey today.'}
          </p>

          {/* Google */}
          <button
            onClick={handleGoogle}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-card border border-line-2 hover:border-copy-3 hover:bg-field text-copy text-sm font-medium py-3 rounded-xl transition-colors disabled:opacity-50 mb-6"
          >
            <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Continue with Google
          </button>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-line" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-base px-3 text-xs text-copy-3">or</span>
            </div>
          </div>

          {/* Toggle */}
          <div className="flex bg-field border border-line rounded-xl p-1 mb-5">
            {(['login', 'signup'] as const).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  mode === m
                    ? 'bg-card text-copy shadow-sm border border-line'
                    : 'text-copy-3 hover:text-copy-2'
                }`}
              >
                {m === 'login' ? 'Sign in' : 'Sign up'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="block text-xs font-medium text-copy-2 mb-1.5">Full name</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  className={inputCls}
                  placeholder="Indie Zimmermann"
                  autoComplete="name"
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-copy-2 mb-1.5">Email address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className={inputCls}
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-copy-2 mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className={inputCls}
                placeholder="••••••••"
                minLength={6}
              />
            </div>

            {error && (
              <div className="bg-danger-bg border border-danger/30 rounded-xl px-4 py-3">
                <p className="text-danger text-sm">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand hover:bg-brand-2 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors text-sm"
            >
              {loading ? 'Loading...' : mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
