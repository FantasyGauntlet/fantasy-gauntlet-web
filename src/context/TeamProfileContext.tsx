'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

export interface TeamProfileArgs {
  teamId: string;
  leagueId?: string;
  // Pre-filled to avoid redundant fetches when caller already has the data
  name?: string;
  logoUrl?: string | null;
  sportLeagueId?: string;
  wins?: number;
  draws?: number;
  losses?: number;
  points?: number;
  bonusPoints?: number;
  draftPrice?: number | null;
  ownerDisplayName?: string;
}

interface TeamProfileContextValue {
  profile: TeamProfileArgs | null;
  openProfile: (args: TeamProfileArgs) => void;
  closeProfile: () => void;
}

const TeamProfileCtx = createContext<TeamProfileContextValue>({
  profile: null,
  openProfile: () => {},
  closeProfile: () => {},
});

export function TeamProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<TeamProfileArgs | null>(null);
  return (
    <TeamProfileCtx.Provider value={{ profile, openProfile: setProfile, closeProfile: () => setProfile(null) }}>
      {children}
    </TeamProfileCtx.Provider>
  );
}

export const useTeamProfile = () => useContext(TeamProfileCtx);
