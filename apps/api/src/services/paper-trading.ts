import {
  LiveMatch,
  PAPER_TRADING,
  PaperExitReason,
  PaperTrade,
  PaperTradeStats,
} from '../types.js';

let tradeSeq = 0;

export function resolveSimulatedLiability(
  bankrollUsd: number = PAPER_TRADING.defaultBankrollUsd,
  maxLiabilityUsd: number = PAPER_TRADING.maxLiabilityUsd,
  bankrollPercent: number = PAPER_TRADING.bankrollPercent,
): number {
  const onePercent = (bankrollUsd * bankrollPercent) / 100;
  return Number(Math.min(maxLiabilityUsd, onePercent).toFixed(2));
}

/**
 * P&L exchange al cerrar un Lay con Back (hedge equalizado).
 *
 * Notación:
 * - Q  = responsabilidad (liability) del lay
 * - L  = cuota lay de entrada
 * - B  = cuota back de salida
 * - Stake lay matched S = Q / (L - 1)
 * - Back stake de cierre Sb = Q / (B - 1)  (neutraliza la liability)
 *
 * P&L bloqueado (mismo en ambos outcomes):
 *   P&L = S * (B - L) / (B - 1)
 *       = Q * (B - L) / ((L - 1) * (B - 1))
 *
 * - Si B > L (empate se alarga, p. ej. tras gol) → green (éxito)
 * - Si B < L (empate se acorta, p. ej. sigue 0-0) → red (no éxito), **no** -Q
 * - Si B = L → P&L ≈ 0
 */
export function computeLayClosedByBackPnl(
  liabilityUsd: number,
  entryLayOdds: number,
  exitBackOdds: number,
): number {
  if (entryLayOdds <= 1 || exitBackOdds <= 1) {
    throw new Error('cuotas lay/back deben ser > 1');
  }
  const pnl =
    (liabilityUsd * (exitBackOdds - entryLayOdds)) /
    ((entryLayOdds - 1) * (exitBackOdds - 1));
  return Number(pnl.toFixed(2));
}

/** @deprecated alias — prefer computeLayClosedByBackPnl */
export function computeLayDrawPnl(
  liabilityUsd: number,
  entryOdds: number,
  exitBackOdds: number,
): number {
  return computeLayClosedByBackPnl(liabilityUsd, entryOdds, exitBackOdds);
}

export function emptyPaperStats(): PaperTradeStats {
  return {
    closedCount: 0,
    successCount: 0,
    failCount: 0,
    successPct: 0,
    failPct: 0,
    totalPnlUsd: 0,
    openCount: 0,
  };
}

export function summarizePaperTrades(trades: PaperTrade[]): PaperTradeStats {
  const open = trades.filter((t) => t.status === 'open');
  const closed = trades.filter((t) => t.status === 'closed');
  const successCount = closed.filter((t) => t.success === true).length;
  const failCount = closed.length - successCount;
  const totalPnlUsd = Number(
    closed.reduce((sum, t) => sum + (t.pnlUsd ?? 0), 0).toFixed(2),
  );
  const closedCount = closed.length;
  return {
    closedCount,
    successCount,
    failCount,
    successPct: closedCount === 0 ? 0 : Number(((successCount / closedCount) * 100).toFixed(2)),
    failPct: closedCount === 0 ? 0 : Number(((failCount / closedCount) * 100).toFixed(2)),
    totalPnlUsd,
    openCount: open.length,
  };
}

function matchLabel(match: LiveMatch): string {
  return `${match.home} vs ${match.away}`;
}

function scoreLabel(match: LiveMatch): string {
  return `${match.scoreHome}-${match.scoreAway}`;
}

function exitNotes(reason: PaperExitReason, pnlUsd: number): string {
  const base =
    'Cierre paper: Back Draw para cerrar el Lay Draw (hedge). No es orden Odd Justa.';
  if (reason === 'first_goal_close') {
    return `${base} Motivo: primer gol. P&L $${pnlUsd.toFixed(2)}.`;
  }
  if (reason === 'hard_close') {
    return `${base} Motivo: cierre ≤60′. P&L $${pnlUsd.toFixed(2)} (no es -100% liability).`;
  }
  return `${base} Motivo: cierre manual. P&L $${pnlUsd.toFixed(2)}.`;
}

export function openPaperTrade(
  match: LiveMatch,
  bankrollUsd: number = PAPER_TRADING.defaultBankrollUsd,
): PaperTrade {
  tradeSeq += 1;
  const liabilityUsd = resolveSimulatedLiability(bankrollUsd);
  return {
    id: `paper-${Date.now()}-${tradeSeq}`,
    eventId: match.eventId,
    matchLabel: matchLabel(match),
    side: 'lay',
    selection: 'draw',
    status: 'open',
    liabilityUsd,
    entryOdds: match.drawOdds,
    entryMinute: match.minute,
    entryScore: scoreLabel(match),
    entryAt: new Date().toISOString(),
    notes:
      'Paper: Lay Draw abierto. Salida siempre será Back Draw. No es orden real en Odd Justa.',
  };
}

export function closePaperTrade(
  trade: PaperTrade,
  match: LiveMatch,
  exitReason: PaperExitReason,
): PaperTrade {
  if (trade.status === 'closed') return trade;
  const exitBackOdds = match.drawOdds;
  const pnlUsd = computeLayClosedByBackPnl(
    trade.liabilityUsd,
    trade.entryOdds,
    exitBackOdds,
  );
  return {
    ...trade,
    status: 'closed',
    exitSide: 'back',
    exitOdds: exitBackOdds,
    exitMinute: match.minute,
    exitScore: scoreLabel(match),
    exitAt: new Date().toISOString(),
    exitReason,
    pnlUsd,
    success: pnlUsd > 0,
    notes: exitNotes(exitReason, pnlUsd),
  };
}
