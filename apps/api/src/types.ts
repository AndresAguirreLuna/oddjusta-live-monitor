/** Evento normalizado de partido en vivo (fútbol). */
export interface LiveMatch {
  eventId: string;
  sport: 'football';
  league: string;
  home: string;
  away: string;
  /** Minuto de juego (puede superar 45/90 en añadido). */
  minute: number;
  scoreHome: number;
  scoreAway: number;
  /** Cuota lay/back del empate en Match Odds (live). */
  drawOdds: number;
  /** Cuota del favorito prepartido (el más corto a 1X2). */
  prematchFavoriteOdds: number;
  /** Cuota Over 2.5 de referencia. */
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
  /** Recordatorio de riesgo (entrada). */
  bankrollHint?: string;
  minute: number;
  score: string;
  drawOdds?: number;
  createdAt: string;
  /** Condiciones duras OK; presión ofensiva pendiente de confirmación manual. */
  requiresManualPressureConfirm?: boolean;
}

export interface RuleEvaluation {
  matches: boolean;
  reasons: string[];
}

export interface MonitorState {
  openOperations: number;
  maxOperations: number;
  bankrollPercentReminder: number;
  matches: LiveMatch[];
  alerts: Alert[];
  /** eventIds con alerta de entrada ya emitida (anti-spam). */
  entryAlertedEventIds: string[];
  /** eventIds con alerta de salida por tipo. */
  exitAlerted: Record<string, Partial<Record<AlertKind, boolean>>>;
}

export const PILOT_RULE = {
  side: 'lay' as const,
  selection: 'draw' as const,
  minuteMin: 15,
  minuteMax: 30,
  scoreHome: 0,
  scoreAway: 0,
  drawOddsMin: 3.0,
  drawOddsMax: 4.5,
  prematchFavoriteMin: 1.5,
  prematchFavoriteMax: 2.1,
  over25MaxExclusive: 1.9,
  maxOperations: 2,
  bankrollPercentReminder: 1,
  halftimeReviewMinute: 45,
  hardCloseMinute: 60,
} as const;
