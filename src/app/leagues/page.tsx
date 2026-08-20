'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

const SPORT_LABELS: Record<string, string> = {
  nfl: 'NFL', nba: 'NBA', nhl: 'NHL', mlb: 'MLB',
  'premier-league': 'PL', ucl: 'UCL', mls: 'MLS', ncaa: 'NCAA',
  'ncaa-football': 'NCAA Football', 'ncaa-basketball': 'NCAA Basketball',
};

const STATE_STYLES: Record<string, string> = {
  draft:     'bg-warn-bg text-warn border-warn/30',
  auction:   'bg-info-bg text-info border-info/20',
  active:    'bg-positive-bg text-positive border-positive/20',
  completed: 'bg-field text-copy-3 border-line',
  cancelled: 'bg-danger-bg text-danger border-danger/20',
};

interface PublicLeague {
  id: string;
  name: string;
  state: string;
  selectedSports: string[];
  memberCap: number | null;
  startDate: string;
  endDate: string;
}

interface AvgPriceEntry {
  teamId: string;
  teamName: string;
  sport: string;
  logoUrl: string | null;
  avgPrice: number;
  timesAuctioned: number;
}

interface AvgPricesResponse {
  years: string[];
  prices: AvgPriceEntry[];
}

export default function BrowsePage() {
  const [leagues, setLeagues] = useState<PublicLeague[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sportFilter, setSportFilter] = useState('');

  const [avgPrices, setAvgPrices] = useState<AvgPriceEntry[]>([]);
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [selectedYear, setSelectedYear] = useState('');
  const [pricesLoading, setPricesLoading] = useState(true);
  const [priceSearch, setPriceSearch] = useState('');
  const [priceSportFilter, setPriceSportFilter] = useState('');

  useEffect(() => {
    api.get<PublicLeague[]>('/leagues/public')
      .then(setLeagues)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setPricesLoading(true);
    const params = selectedYear ? `?year=${selectedYear}` : '';
    api.get<AvgPricesResponse>(`/sports/average-prices${params}`)
      .then(res => {
        setAvgPrices(res.prices);
        setAvailableYears(res.years);
        if (!selectedYear && res.years.length > 0) setSelectedYear(res.years[0]);
      })
      .catch(() => {})
      .finally(() => setPricesLoading(false));
  }, [selectedYear]);

  const allSports = [...new Set(leagues.flatMap(l => l.selectedSports))].sort();

  const filtered = leagues.filter(l => {
    if (l.state !== 'active') return false;
    if (search && !l.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (sportFilter && !l.selectedSports.includes(sportFilter)) return false;
    return true;
  });

  const priceSports = [...new Set(avgPrices.map(p => p.sport).filter(Boolean))].sort();

  const filteredPrices = avgPrices.filter(p => {
    if (priceSearch && !p.teamName.toLowerCase().includes(priceSearch.toLowerCase())) return false;
    if (priceSportFilter && p.sport !== priceSportFilter) return false;
    return true;
  });

  return (
    <div className="space-y-10">
      {/* ── Browse leagues ─────────────────────────────────────────────── */}
      <section className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-copy">Browse Leagues</h1>
          <p className="text-copy-3 text-sm mt-1">Public leagues open for viewing. Contact the commissioner if you want to join.</p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search leagues..."
            className="bg-card border border-line-2 rounded-xl px-4 py-2.5 text-copy text-sm placeholder-copy-3 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors w-64"
          />
          <select
            value={sportFilter}
            onChange={e => setSportFilter(e.target.value)}
            className="bg-card border border-line-2 rounded-xl px-4 py-2.5 text-copy text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors"
          >
            <option value="">All sports</option>
            {allSports.map(s => (
              <option key={s} value={s}>{SPORT_LABELS[s] ?? s}</option>
            ))}
          </select>
        </div>

        {loading && (
          <div className="flex justify-center py-16">
            <div className="w-7 h-7 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="text-center py-16 border border-dashed border-line rounded-2xl">
            <p className="text-copy-2 font-medium text-sm">No leagues found</p>
            <p className="text-copy-3 text-xs mt-1">
              {search || sportFilter ? 'Try clearing your filters.' : 'No public leagues are listed right now.'}
            </p>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(league => (
            <div key={league.id} className="bg-card border border-line rounded-2xl p-5 flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-copy text-sm leading-tight truncate">{league.name}</p>
                  <p className="text-xs text-copy-3 mt-0.5">
                    {new Date(league.startDate).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                    {' – '}
                    {new Date(league.endDate).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <span className={`flex-shrink-0 text-xs font-medium px-2 py-0.5 rounded-full border ${STATE_STYLES[league.state] ?? STATE_STYLES.completed}`}>
                  {league.state}
                </span>
              </div>

              {/* Sports chips */}
              <div className="flex flex-wrap gap-1.5">
                {league.selectedSports.map(s => (
                  <span key={s} className="text-xs font-medium px-2 py-0.5 bg-field border border-line rounded-full text-copy-2">
                    {SPORT_LABELS[s] ?? s}
                  </span>
                ))}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between gap-2 mt-auto pt-2 border-t border-line/50">
                <span className="text-xs text-copy-3">
                  {league.memberCap ? `${league.memberCap} members max` : ''}
                </span>
                <Link
                  href={`/leagues/${league.id}`}
                  className="text-xs font-semibold text-brand hover:text-brand-2 px-3 py-1.5 rounded-lg hover:bg-brand/5 transition-colors"
                >
                  View league →
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Auction price reference ────────────────────────────────────── */}
      <section className="space-y-5">
        <div>
          <h2 className="text-xl font-bold text-copy">
            Average Auction Prices{selectedYear ? ` — ${selectedYear}` : ''}
          </h2>
          <p className="text-copy-3 text-sm mt-1">
            Historical average prices teams have sold for across all Fantasy Gauntlet auctions. Use this as a reference when setting your budget.
          </p>
        </div>

        {/* Price filters */}
        <div className="flex flex-wrap gap-3">
          <input
            value={priceSearch}
            onChange={e => setPriceSearch(e.target.value)}
            placeholder="Search teams..."
            className="bg-card border border-line-2 rounded-xl px-4 py-2.5 text-copy text-sm placeholder-copy-3 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors w-56"
          />
          <select
            value={priceSportFilter}
            onChange={e => setPriceSportFilter(e.target.value)}
            className="bg-card border border-line-2 rounded-xl px-4 py-2.5 text-copy text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors"
          >
            <option value="">All sports</option>
            {priceSports.map(s => (
              <option key={s} value={s}>{SPORT_LABELS[s] ?? s}</option>
            ))}
          </select>
          {availableYears.length > 0 && (
            <select
              value={selectedYear}
              onChange={e => { setSelectedYear(e.target.value); setPriceSearch(''); setPriceSportFilter(''); }}
              className="bg-card border border-line-2 rounded-xl px-4 py-2.5 text-copy text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors"
            >
              {availableYears.map(y => (
                <option key={y} value={y}>{y} Season</option>
              ))}
            </select>
          )}
        </div>

        {pricesLoading && (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!pricesLoading && filteredPrices.length === 0 && (
          <div className="text-center py-12 border border-dashed border-line rounded-2xl">
            <p className="text-copy-2 font-medium text-sm">No pricing data yet</p>
            <p className="text-copy-3 text-xs mt-1">
              {priceSearch || priceSportFilter ? 'Try clearing your filters.' : 'Prices will appear once leagues complete their auctions.'}
            </p>
          </div>
        )}

        {!pricesLoading && filteredPrices.length > 0 && (
          <div className="bg-card border border-line rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-field">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-copy-3 uppercase tracking-wide">Team</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-copy-3 uppercase tracking-wide">Sport</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-copy-3 uppercase tracking-wide">Avg Price</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-copy-3 uppercase tracking-wide hidden sm:table-cell">Auctions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPrices.map((entry, i) => (
                    <tr key={entry.teamId} className={`border-b border-line/50 last:border-b-0 ${i % 2 === 0 ? '' : 'bg-field/40'}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          {entry.logoUrl ? (
                            <img src={entry.logoUrl} alt="" className="w-7 h-7 rounded-full object-contain flex-shrink-0" />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-line flex-shrink-0" />
                          )}
                          <span className="font-medium text-copy truncate">{entry.teamName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-medium px-2 py-0.5 bg-field border border-line rounded-full text-copy-2">
                          {SPORT_LABELS[entry.sport] ?? entry.sport}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-copy tabular-nums">
                        ${entry.avgPrice.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right text-copy-3 tabular-nums hidden sm:table-cell">
                        {entry.timesAuctioned}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
