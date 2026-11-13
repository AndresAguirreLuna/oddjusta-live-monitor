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
 * P&L de un lay al empate (modelo simplificado paper):
 * - Ganadora (cierre tras primer gol): profit = liability / (odds - 1)
 *   (ganas el stake del backer; responsabilidad = lo que arriesgas si empata).
 * - Perdedora / cierre forzado ≤60 aún en juego sin gol: -liability.
 */
export function computeLayDrawPnl(
  liabilityUsd: number,
  entryOdds: number,
  exitReason: PaperExitReason,
): number {
  if (entryOdds <= 1) {
    throw new Error('entryOdds debe ser > 1');
  }
  if (exitReason === 'first_goal_win') {
    return Number((liabilityUsd / (entryOdds - 1)).toFixed(2));
  }
  // hard_close_loss | manual_close sin gol → pérdida de responsabilidad
  return Number((-liabilityUsd).toFixed(2));
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
      'Paper trading simulado — no es orden real en Odd Justa. Confirmar presión ofensiva es manual en vivo real.',
  };
}

export function closePaperTrade(
  trade: PaperTrade,
  match: LiveMatch,
  exitReason: PaperExitReason,
): PaperTrade {
  if (trade.status === 'closed') return trade;
  const pnlUsd = computeLayDrawPnl(trade.liabilityUsd, trade.entryOdds, exitReason);
  return {
    ...trade,
    status: 'closed',
    exitOdds: match.drawOdds,
    exitMinute: match.minute,
    exitScore: scoreLabel(match),
    exitAt: new Date().toISOString(),
    exitReason,
    pnlUsd,
    success: pnlUsd > 0,
    notes:
      exitReason === 'first_goal_win'
        ? 'Salida simulada ganadora tras primer gol (lay empate).'
        : exitReason === 'hard_close_loss'
          ? 'Cierre forzado ≤60′ sin condiciones favorables (pérdida simulada de responsabilidad).'
          : 'Cierre manual simulado.',
  };
}
