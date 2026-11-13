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
  /** Recordatorio de riesgo (entrada). */
  bankrollHint?: string;
  minute: number;
  score: string;
  drawOdds?: number;
  createdAt: string;
  /** Condiciones duras OK; presión ofensiva pendiente de confirmación manual. */
  requiresManualPressureConfirm?: boolean;
  /** Paper trading — no es dinero real. */
  paperTrade?: boolean;
}

export interface RuleEvaluation {
  matches: boolean;
  reasons: string[];
}

export type PaperExitReason =
  | 'first_goal_win'
  | 'hard_close_loss'
  | 'manual_close';

export type PaperTradeStatus = 'open' | 'closed';

/** Operación simulada (paper trading). No toca Odd Justa. */
export interface PaperTrade {
  id: string;
  eventId: string;
  matchLabel: string;
  side: 'lay';
  selection: 'draw';
  status: PaperTradeStatus;
  /** Responsabilidad/liability simulada en USD. */
  liabilityUsd: number;
  entryOdds: number;
  entryMinute: number;
  entryScore: string;
  entryAt: string;
  exitOdds?: number;
  exitMinute?: number;
  exitScore?: string;
  exitAt?: string;
  exitReason?: PaperExitReason;
  /** P&L simulado en USD (positivo = éxito). */
  pnlUsd?: number;
  /** true si pnlUsd > 0 */
  success?: boolean;
  notes: string;
}

export interface PaperTradeStats {
  closedCount: number;
  successCount: number;
  failCount: number;
  /** % éxito sobre cerradas (0–100). */
  successPct: number;
  /** % no éxito sobre cerradas (0–100). */
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
  /** Cap fijo de responsabilidad simulada por entrada (USD). */
  maxLiabilityUsd: number;
  matches: LiveMatch[];
  alerts: Alert[];
  paperTrades: PaperTrade[];
  paperStats: PaperTradeStats;
  excelPath: string;
  /** eventIds con alerta de entrada ya emitida (anti-spam). */
  entryAlertedEventIds: string[];
  /** eventIds con alerta de salida por tipo. */
  exitAlerted: Record<string, Partial<Record<AlertKind, boolean>>>;
}

/**
 * Convención de stake simulado:
 * - `MAX_LIABILITY_USD` = 5 → tope por entrada.
 * - `DEFAULT_BANKROLL_USD` = 500 → 1% = $5.
 * - liability efectiva = min(MAX_LIABILITY_USD, bankroll * 1%).
 * Por defecto (bankroll 500) la responsabilidad simulada es **$5**.
 */
export const PAPER_TRADING = {
  maxLiabilityUsd: 5,
  defaultBankrollUsd: 500,
  bankrollPercent: 1,
} as const;

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
