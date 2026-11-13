import {
  LiveMatch,
  PILOT_RULE,
  RuleEvaluation,
  Alert,
  AlertKind,
  PaperTrade,
} from '../types.js';

/** Evalúa condiciones duras de entrada (lay empate piloto). */
export function evaluateEntryCandidate(
  match: LiveMatch,
  openOperations: number,
): RuleEvaluation {
  const reasons: string[] = [];
  const r = PILOT_RULE;

  if (match.sport !== 'football') {
    reasons.push('solo fútbol');
  }
  if (match.minute < r.minuteMin || match.minute > r.minuteMax) {
    reasons.push(`minuto fuera de ${r.minuteMin}–${r.minuteMax} (actual ${match.minute})`);
  }
  if (match.scoreHome !== r.scoreHome || match.scoreAway !== r.scoreAway) {
    reasons.push(`marcador no es 0-0 (actual ${match.scoreHome}-${match.scoreAway})`);
  }
  if (match.drawOdds < r.drawOddsMin || match.drawOdds > r.drawOddsMax) {
    reasons.push(
      `cuota empate fuera de ${r.drawOddsMin.toFixed(2)}–${r.drawOddsMax.toFixed(2)} (actual ${match.drawOdds})`,
    );
  }
  if (
    match.prematchFavoriteOdds < r.prematchFavoriteMin ||
    match.prematchFavoriteOdds > r.prematchFavoriteMax
  ) {
    reasons.push(
      `favorito pre fuera de ${r.prematchFavoriteMin.toFixed(2)}–${r.prematchFavoriteMax.toFixed(2)} (actual ${match.prematchFavoriteOdds})`,
    );
  }
  if (!(match.over25Odds < r.over25MaxExclusive)) {
    reasons.push(
      `O2.5 no es < ${r.over25MaxExclusive.toFixed(2)} (actual ${match.over25Odds})`,
    );
  }
  if (openOperations >= r.maxOperations) {
    reasons.push(`máximo ${r.maxOperations} operaciones simultáneas alcanzado`);
  }

  return { matches: reasons.length === 0, reasons };
}

export function shouldRemindFirstGoalClose(match: LiveMatch): boolean {
  return match.scoreHome + match.scoreAway >= 1;
}

export function shouldRemindHalftimeReview(match: LiveMatch): boolean {
  return match.minute >= PILOT_RULE.halftimeReviewMinute && match.minute < PILOT_RULE.hardCloseMinute;
}

export function shouldRemindHardClose(match: LiveMatch): boolean {
  return match.minute >= PILOT_RULE.hardCloseMinute;
}

function matchLabel(match: LiveMatch): string {
  return `${match.home} vs ${match.away}`;
}

function scoreLabel(match: LiveMatch): string {
  return `${match.scoreHome}-${match.scoreAway}`;
}

let alertSeq = 0;

export function nextAlertId(prefix: string): string {
  alertSeq += 1;
  return `${prefix}-${Date.now()}-${alertSeq}`;
}

/** Crea alerta de candidato a entrada (presión ofensiva = confirmación manual). */
export function buildEntryAlert(match: LiveMatch): Alert {
  return {
    id: nextAlertId('entry'),
    kind: 'entry_candidate',
    eventId: match.eventId,
    matchLabel: matchLabel(match),
    message:
      'candidato — confirmar presión ofensiva (manual). Lay empate: condiciones numéricas OK. Paper trading: se simula la entrada (no Odd Justa).',
    bankrollHint:
      `Paper: responsabilidad simulada ≤ $5 (o 1% bankroll si es menor). Recordatorio regla: ${PILOT_RULE.bankrollPercentReminder}% bankroll.`,
    minute: match.minute,
    score: scoreLabel(match),
    drawOdds: match.drawOdds,
    createdAt: new Date().toISOString(),
    requiresManualPressureConfirm: true,
    paperTrade: true,
  };
}

export function buildPaperEntryAlert(match: LiveMatch, trade: PaperTrade): Alert {
  return {
    id: nextAlertId('paper-entry'),
    kind: 'paper_entry',
    eventId: match.eventId,
    matchLabel: matchLabel(match),
    message: `Paper trading: entrada simulada lay empate · responsabilidad $${trade.liabilityUsd.toFixed(2)} @ ${trade.entryOdds.toFixed(2)} (NO es orden real).`,
    bankrollHint: trade.notes,
    minute: match.minute,
    score: scoreLabel(match),
    drawOdds: match.drawOdds,
    createdAt: new Date().toISOString(),
    requiresManualPressureConfirm: true,
    paperTrade: true,
  };
}

export function buildExitAlert(match: LiveMatch, kind: Exclude<AlertKind, 'entry_candidate' | 'paper_entry' | 'paper_exit'>): Alert {
  const messages: Record<Exclude<AlertKind, 'entry_candidate' | 'paper_entry' | 'paper_exit'>, string> = {
    exit_first_goal: 'Salida: primer gol — cierre simulado del lay empate (paper).',
    exit_halftime_review: 'Revisión ~45′: evaluar condiciones favorables o plan de cierre (paper sigue abierta).',
    exit_hard_close: 'Cierre duro ≤60′: cierre forzado simulado si no hay condiciones favorables.',
  };

  return {
    id: nextAlertId(kind),
    kind,
    eventId: match.eventId,
    matchLabel: matchLabel(match),
    message: messages[kind],
    minute: match.minute,
    score: scoreLabel(match),
    drawOdds: match.drawOdds,
    createdAt: new Date().toISOString(),
    paperTrade: true,
  };
}

export function buildPaperExitAlert(match: LiveMatch, trade: PaperTrade): Alert {
  const pnl = trade.pnlUsd ?? 0;
  return {
    id: nextAlertId('paper-exit'),
    kind: 'paper_exit',
    eventId: match.eventId,
    matchLabel: matchLabel(match),
    message: `Paper trading: salida simulada (${trade.exitReason}) · P&L $${pnl.toFixed(2)} · ${trade.success ? 'éxito' : 'no éxito'} (NO es dinero real).`,
    minute: match.minute,
    score: scoreLabel(match),
    drawOdds: match.drawOdds,
    createdAt: new Date().toISOString(),
    paperTrade: true,
  };
}
