export interface LiveMatch {
  eventId: string;
  sport: 'football';
  league: string;
  home: string;
  away: string;
  minute: number;
  scoreHome: number;
  scoreAway: number;
  drawOdds: number;
  prematchFavoriteOdds: number;
  over25Odds: number;
  ts: string;
}

export type AlertKind =
  | 'entry_candidate'
  | 'paper_entry'
  | 'exit_first_goal'
  | 'exit_halftime_review'
  | 'exit_hard_close'
  | 'paper_exit';

export interface Alert {
  id: string;
  kind: AlertKind;
  eventId: string;
  matchLabel: string;
  message: string;
  bankrollHint?: string;
  minute: number;
  score: string;
  drawOdds?: number;
  createdAt: string;
  requiresManualPressureConfirm?: boolean;
  paperTrade?: boolean;
}

export interface PaperTrade {
  id: string;
  eventId: string;
  matchLabel: string;
  side: 'lay';
  selection: 'draw';
  status: 'open' | 'closed';
  liabilityUsd: number;
  entryOdds: number;
  entryMinute: number;
  entryScore: string;
  entryAt: string;
  exitSide?: 'back';
  exitOdds?: number;
  exitMinute?: number;
  exitScore?: string;
  exitAt?: string;
  exitReason?: string;
  pnlUsd?: number;
  success?: boolean;
  notes: string;
}

export interface PaperTradeStats {
  closedCount: number;
  successCount: number;
  failCount: number;
  successPct: number;
  failPct: number;
  totalPnlUsd: number;
  openCount: number;
}

export interface MonitorState {
  mode: 'paper_trading_simulated';
  openOperations: number;
  maxOperations: number;
  bankrollUsd: number;
  bankrollPercentReminder: number;
  maxLiabilityUsd: number;
  matches: LiveMatch[];
  alerts: Alert[];
  paperTrades: PaperTrade[];
  paperStats: PaperTradeStats;
  excelPath: string;
  entryAlertedEventIds: string[];
  exitAlerted: Record<string, Partial<Record<AlertKind, boolean>>>;
}

export interface PilotRule {
  side: string;
  selection: string;
  minuteMin: number;
  minuteMax: number;
  scoreHome: number;
  scoreAway: number;
  drawOddsMin: number;
  drawOddsMax: number;
  prematchFavoriteMin: number;
  prematchFavoriteMax: number;
  over25MaxExclusive: number;
  maxOperations: number;
  bankrollPercentReminder: number;
  halftimeReviewMinute: number;
  hardCloseMinute: number;
  paperTrading?: {
    maxLiabilityUsd: number;
    defaultBankrollUsd: number;
    bankrollPercent: number;
    bankrollUsd: number;
    convention: string;
  };
}
