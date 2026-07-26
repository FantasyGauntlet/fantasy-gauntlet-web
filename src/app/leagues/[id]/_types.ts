export interface League {
  id: string;
  name: string;
  commissionerId: string;
  state: 'draft' | 'auction' | 'active' | 'completed' | 'cancelled';
  isPublic: boolean;
  memberCap: number | null;
  startDate: string;
  endDate: string;
  selectedSports: string[];
  seasonRefs: { sportLeagueId: string; winValue: number; drawValue: number | null; scalingValue: number; }[];
  rosterRules: { maxPerSport: Record<string, number | null> };
  auctionConfig: {
    startingBudget: number;
    minOpeningBid: number;
    minBidIncrement: number;
    nominationMode: string;
    countdownSeconds: number;
    maxWildcard?: number;
    scheduledStartAt?: string | null;
    noBidPenaltyPct?: number;
    nominationTimerSeconds?: number;
  } | null;
  previousLeagueId?: string;
  topZone?: number | null;
  bottomZone?: number | null;
  maxWildcard?: number;
  waiverSettings?: { processingDay: string; processingHour: number } | null;
  waiverType?: 'reserve-standings' | 'faab';
  faabStartingBudget?: number;
  leagueGroupId?: string;
  createdAt?: string;
}

export interface Member { id: string; userId: string; role: 'commissioner' | 'member'; joinedAt: string; displayName?: string; }

export interface LeagueInvite {
  id: string; leagueId: string; toEmail: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled';
  createdAt: string; expiresAt: string;
}

export interface FantasyTeam {
  id: string; userId: string; displayName: string;
  logoUrl?: string | null;
  isPlaceholder: boolean; ownedTeamIds: string[];
  remainingBudget: number; totalPoints: number;
  faabRemaining?: number;
  coOwnerIds?: string[];
  coOwnerDisplayNames?: string[];
}

export interface SportTeam { id: string; name: string; shortName: string; sportLeagueId: string; logoUrl: string | null; }
export interface SportGroup { sport: string; teams: SportTeam[]; }

export interface TeamBreakdown { teamId: string; teamName: string; sportLeagueId: string; sport: string; logoUrl: string | null; wins: number; draws: number; losses: number; points: number; eliminated?: boolean; seasonActive?: boolean; }
export interface BonusBreakdownItem { teamId: string; teamName: string; label: string; points: number; }
export interface Standing {
  userId: string; displayName: string; rank: number;
  totalPoints: number; teamBreakdown: TeamBreakdown[]; bonusPoints: number;
  bonusBreakdown: BonusBreakdownItem[];
}

export interface TeamWithRecord {
  id: string;
  name: string;
  shortName: string;
  sportLeagueId: string;
  sport: string;
  logoUrl: string | null;
  wins: number;
  draws: number;
  losses: number;
  points: number;
}

export interface WaiverClaim {
  id: string;
  leagueId: string;
  claimantUserId: string;
  claimantDisplayName: string;
  dropTeamId: string | null;
  addTeamId: string;
  status: 'pending' | 'approved' | 'denied';
  claimantRank: number;
  faabBid?: number;
  requestedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  denialReason: string | null;
}

export interface Trade {
  id: string;
  leagueId: string;
  proposerFantasyTeamId: string;
  proposerUserId: string;
  receiverFantasyTeamId: string;
  receiverUserId: string;
  offeredSportTeamIds: string[];
  requestedSportTeamIds: string[];
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
  createdAt: string;
  updatedAt: string;
}

export interface Announcement {
  id: string; leagueId: string; authorUserId: string;
  authorDisplayName: string; content: string; createdAt: string;
}

export interface LeagueMessage {
  id: string; leagueId: string; authorUserId: string;
  authorDisplayName: string; content: string; createdAt: string;
}

export type TxEvent =
  | { type: 'trade'; id: string; date: string; proposerFantasyTeamId: string; receiverFantasyTeamId: string; offeredSportTeamIds: string[]; requestedSportTeamIds: string[]; }
  | { type: 'waiver'; id: string; date: string; claimantUserId: string; claimantDisplayName: string; addTeamId: string; dropTeamId: string | null; };

export type Tab = 'standings' | 'roster' | 'waivers' | 'transaction-counter' | 'auction-summary' | 'home' | 'history' | 'rules' | 'activity' | 'commissioner' | 'user-management';
export const VALID_TABS: Tab[] = ['standings', 'roster', 'waivers', 'transaction-counter', 'auction-summary', 'home', 'history', 'rules', 'activity', 'commissioner', 'user-management'];
