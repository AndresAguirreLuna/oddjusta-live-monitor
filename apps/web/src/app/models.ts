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
  | 'exit_first_goal'
  | 'exit_halftime_review'
  | 'exit_hard_close';

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
}

export interface MonitorState {
  openOperations: number;
  maxOperations: number;
  bankrollPercentReminder: number;
  matches: LiveMatch[];
  alerts: Alert[];
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
}
