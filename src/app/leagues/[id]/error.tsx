'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function LeagueError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);

  return (
    <div className="flex items-center justify-center py-24 px-6">
      <div className="bg-card border border-line rounded-2xl p-8 max-w-sm w-full text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-danger/10 flex items-center justify-center mx-auto">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-danger">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <div>
          <h2 className="text-base font-semibold text-copy">Something went wrong</h2>
          <p className="text-sm text-copy-3 mt-1">{error.message || 'Could not load this league.'}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={reset}
            className="flex-1 bg-brand hover:bg-brand-2 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm"
          >
            Try again
          </button>
          <Link
            href="/dashboard"
            className="flex-1 bg-field hover:bg-field-2 border border-line text-copy-2 font-medium py-2.5 rounded-xl transition-colors text-sm flex items-center justify-center"
          >
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
