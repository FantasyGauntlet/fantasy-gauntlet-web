'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export default function NavBar() {
  const { user, signOut } = useAuth();
  const pathname = usePathname();

  const links = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/leagues', label: 'Leagues' },
  ];

  return (
    <nav className="bg-gray-900 border-b border-gray-800 px-4 py-3">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="text-lg font-bold text-indigo-400">
            Fantasy Gauntlet
          </Link>
          <div className="flex gap-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  pathname.startsWith(l.href)
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400 hidden sm:block">{user?.email}</span>
          <button
            onClick={signOut}
            className="text-sm text-gray-400 hover:text-white px-3 py-1.5 rounded-md hover:bg-gray-800 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    </nav>
  );
}
