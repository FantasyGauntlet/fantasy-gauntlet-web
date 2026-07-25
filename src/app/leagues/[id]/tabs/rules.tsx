'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { formatLeagueName } from '../_components';
import type { League } from '../_types';

function RulesTab({ league }: { league: League }) {
  const [deadlines, setDeadlines] = useState<Record<string, string>>({});

  useEffect(() => {
    api.get<Record<string, string>>('/sports/deadlines')
      .then(setDeadlines)
      .catch(() => {});
  }, []);

  const today = new Date().toISOString().slice(0, 10);

  // Only show deadlines for sports this league actually uses
  const leagueDeadlines = league.selectedSports
    .filter(s => deadlines[s])
    .map(s => {
      const date = deadlines[s];
      const msUntil = new Date(date + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime();
      const daysUntil = Math.ceil(msUntil / 86_400_000);
      return { sport: s, date, daysUntil, locked: daysUntil <= 0 };
    });

  return (
    <div className="space-y-6">
      <section className="space-y-5">
        <h3 className="text-xs font-semibold text-copy-3 uppercase tracking-widest">General Rules</h3>

        <div>
          <p className="text-xs font-semibold text-copy-2 uppercase tracking-wide mb-2">Roster</p>
          <ul className="space-y-1.5 list-disc list-inside">
            {[
              'Minimum 1 team owned per sport',
              '2 Wildcard Teams — additional team in any sport but Premier League',
              'Limits: 1 EPL team per player, max 2 teams in any given sport',
            ].map((r, i) => <li key={i} className="text-sm text-copy-2 leading-relaxed pl-1">{r}</li>)}
          </ul>
        </div>

        <div>
          <p className="text-xs font-semibold text-copy-2 uppercase tracking-wide mb-2">Points</p>
          <ul className="space-y-1.5 list-disc list-inside">
            <li className="text-sm text-copy-2 leading-relaxed pl-1">Points are based on Wins, Draws and Playoffs. The Table is based on the total accumulation throughout the season.</li>
            <li className="text-sm text-copy-2 leading-relaxed pl-1">A bonus is given for Conference and Division Champions. (See &ldquo;Points&rdquo; tab for criteria)</li>
            <li className="text-sm text-copy-2 leading-relaxed pl-1">NCAAF bonus points will only be given out for Power 4 teams; NCAAB bonus will only be given out for Power 5 teams</li>
            <li className="text-sm text-copy-2 leading-relaxed pl-1">Power 4 = SEC, Big Ten, ACC, Big 12</li>
            <li className="text-sm text-copy-2 leading-relaxed pl-1">Power 5 = Power 4 + Big East</li>
          </ul>
        </div>

        <div>
          <p className="text-xs font-semibold text-copy-2 uppercase tracking-wide mb-2">Transactions</p>
          <ul className="space-y-1.5 list-disc list-inside">
            {(() => {
              const ws = league.waiverSettings;
              const wDay = ws?.processingDay ?? 'tuesday';
              const wHour = ws?.processingHour ?? 11;
              const wDayLabel = wDay.charAt(0).toUpperCase() + wDay.slice(1);
              const wTimeLabel = wHour === 0 ? '12:00 AM' : wHour < 12 ? `${wHour}:00 AM` : wHour === 12 ? '12:00 PM' : `${wHour - 12}:00 PM`;
              return [
                'Teams are added and removed by submitting a waiver request on the "Waivers" tab.',
                `Waivers are processed every ${wDayLabel} morning at ${wTimeLabel} EST by standard rule sets.`,
                'Tiebreaker order is reverse current standings (Lowest in the standings is #1 priority.)',
                'Trades are allowed to be made as long as both teams are upholding roster limits.',
              ];
            })().map((r, i) => <li key={i} className="text-sm text-copy-2 leading-relaxed pl-1">{r}</li>)}
          </ul>
        </div>

        {/* Waiver Deadlines */}
        <div>
          <p className="text-xs font-semibold text-copy-2 uppercase tracking-wide mb-2">Waiver Deadlines</p>
          {leagueDeadlines.length === 0 ? (
            <p className="text-sm text-copy-3">No deadlines currently set.</p>
          ) : (
            <div className="space-y-2">
              {leagueDeadlines.map(({ sport, date, daysUntil, locked }) => {
                const formatted = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
                  month: 'long', day: 'numeric', year: 'numeric',
                });
                const urgentSoon = !locked && daysUntil <= 7;
                return (
                  <div key={sport} className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border ${
                    locked ? 'bg-danger-bg border-danger/20' : urgentSoon ? 'bg-warn/5 border-warn/20' : 'bg-field border-line'
                  }`}>
                    <div>
                      <p className={`text-sm font-medium ${locked ? 'text-danger' : 'text-copy'}`}>
                        {formatLeagueName(sport)}
                      </p>
                      <p className="text-xs text-copy-3 mt-0.5">{formatted}</p>
                    </div>
                    {locked ? (
                      <span className="text-[10px] font-bold bg-danger text-white px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0">LOCKED</span>
                    ) : daysUntil === 1 ? (
                      <span className="text-[10px] font-bold bg-danger text-white px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0">1 DAY LEFT</span>
                    ) : urgentSoon ? (
                      <span className="text-[10px] font-bold bg-warn text-white px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0">{daysUntil} DAYS LEFT</span>
                    ) : (
                      <span className="text-xs text-copy-3 whitespace-nowrap flex-shrink-0">{daysUntil}d left</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <div className="border-t border-line" />

      <section className="space-y-3">
        <h3 className="text-xs font-semibold text-copy-3 uppercase tracking-widest">Draft Rules</h3>
        <ul className="space-y-1.5 list-disc list-inside">
          {[
            '3 options for Drafts: Randomized order Auction, Nomination Auction, Snake draft',
            'For Auction: Players will have $1,000 to bid on all their teams — this is a hard cap.',
            'Players will have 15 seconds to bid on a team; once a bid is placed the 15-second timer restarts until it expires.',
            'Teams not drafted during the auction will become free agent teams available on waivers.',
          ].map((r, i) => <li key={i} className="text-sm text-copy-2 leading-relaxed pl-1">{r}</li>)}
        </ul>
      </section>

      {league.seasonRefs.length > 0 && (
        <>
          <div className="border-t border-line" />
          <section>
            <h3 className="text-xs font-semibold text-copy-3 uppercase tracking-widest mb-3">Scoring Breakdown</h3>
            <div className="overflow-x-auto rounded-xl border border-line">
              <table
                className="w-full table-fixed text-sm"
                style={{ minWidth: `${180 + league.seasonRefs.length * 88}px` }}
              >
                <thead>
                  <tr className="bg-field/60 border-b border-line">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-copy-3 w-[180px]"></th>
                    {league.seasonRefs.map(ref => (
                      <th key={ref.sportLeagueId} className="text-center px-3 py-2.5 text-xs font-semibold text-copy-3 leading-snug">
                        {formatLeagueName(ref.sportLeagueId)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-line/50 bg-field/30">
                    <td colSpan={league.seasonRefs.length + 1} className="px-4 py-1.5 text-xs font-semibold text-copy-3">
                      Points per:
                    </td>
                  </tr>
                  <tr className="border-t border-line/50">
                    <td className="px-4 py-2.5 font-medium text-copy">Win</td>
                    {league.seasonRefs.map(ref => (
                      <td key={ref.sportLeagueId} className="px-3 py-2.5 text-center tabular-nums text-copy-2">
                        {ref.winValue.toFixed(1)}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-t border-line/50">
                    <td className="px-4 py-2.5 font-medium text-copy">Draw / OT Loss</td>
                    {league.seasonRefs.map(ref => (
                      <td key={ref.sportLeagueId} className="px-3 py-2.5 text-center tabular-nums text-copy-2">
                        {(ref.drawValue ?? 0).toFixed(1)}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-t-2 border-line bg-field/30">
                    <td colSpan={league.seasonRefs.length + 1} className="px-4 py-1.5 text-xs font-semibold text-copy-3">
                      Playoff structure:
                    </td>
                  </tr>
                  {[
                    { label: '1st round winner', pts: 10 },
                    { label: '2nd round winner', pts: 15 },
                    { label: '3rd round winner', pts: 25 },
                    { label: 'Champion',          pts: 50 },
                    { label: 'Max playoff points', pts: 100 },
                  ].map(({ label, pts }, i) => (
                    <tr key={label} className={`border-t border-line/50${i === 3 ? ' font-semibold' : ''}`}>
                      <td className={`px-4 py-2.5 text-copy ${i === 3 ? 'font-semibold' : 'font-medium'}`}>{label}</td>
                      {league.seasonRefs.map(ref => (
                        <td key={ref.sportLeagueId} className={`px-3 py-2.5 text-center tabular-nums ${i === 3 ? 'text-copy font-semibold' : 'text-copy-2'}`}>
                          {pts}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <div className="border-t border-line" />

      <section className="space-y-4">
        <h3 className="text-xs font-semibold text-copy-3 uppercase tracking-widest">Playoff Points — Special Cases</h3>
        <p className="text-xs text-copy-3">Playoff points stack as your team advances. Some leagues map rounds differently:</p>
        <div className="space-y-3">
          {[
            {
              sport: 'UCL',
              rules: ['1st Round Win = Round of 16 Win'],
            },
            {
              sport: 'Premier League',
              rules: [
                '1st Round Win = Top 8 League position',
                '2nd Round Win = Top 4 League position',
                '3rd Round Win = Top 2 League position',
              ],
            },
            {
              sport: 'NCAA Basketball',
              rules: ['1st Round Win = Sweet 16 Win'],
            },
          ].map(({ sport, rules }) => (
            <div key={sport} className="bg-field border border-line rounded-xl px-4 py-3">
              <p className="text-xs font-semibold text-copy mb-1.5">{sport}</p>
              <ul className="space-y-1 list-disc list-inside">
                {rules.map((r, i) => <li key={i} className="text-xs text-copy-2 pl-1">{r}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <div className="border-t border-line" />

      <section className="space-y-4">
        <h3 className="text-xs font-semibold text-copy-3 uppercase tracking-widest">Bonus Points</h3>
        <p className="text-xs text-copy-3">Awarded in addition to regular win/draw points for finishing in qualifying positions:</p>
        <div className="space-y-2">
          {[
            { sport: 'NHL',            rules: ['10 pts — Top 2 in each division'] },
            { sport: 'NBA',            rules: ['10 pts — Top 3 in each conference', '20 pts — NBA Cup'] },
            { sport: 'NFL',            rules: ['10 pts — Each Division Winner'] },
            { sport: 'MLB',            rules: ['10 pts — Each Division Winner + 4 seed (Top Wildcard team)'] },
            { sport: 'UCL',            rules: ['10 pts — Top 8 in the Final Table'] },
            { sport: 'EPL',            rules: ['5 pts — Top 6 in the League', '15 pts — FA and EFL Cup Winners'] },
            { sport: 'NCAA Football',  rules: ['20 pts — Power 4 Champions (B1G, SEC, B12, ACC)'] },
            { sport: 'NCAA Basketball',rules: ['8 pts — (Power 4 + Big East) conference winner', '8 pts — (Power 4 + Big East) conference tournament winner'] },
          ].map(({ sport, rules }) => (
            <div key={sport} className="flex gap-3 bg-field border border-line rounded-xl px-4 py-3">
              <span className="text-xs font-semibold text-brand whitespace-nowrap w-28 flex-shrink-0 mt-0.5">{sport}</span>
              <ul className="space-y-1 list-disc list-inside flex-1">
                {rules.map((r, i) => <li key={i} className="text-xs text-copy-2">{r}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export { RulesTab };
