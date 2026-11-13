import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateEntryCandidate,
  shouldRemindFirstGoalClose,
  shouldRemindHalftimeReview,
  shouldRemindHardClose,
  buildEntryAlert,
} from './lay-draw-pilot.js';
import { LiveMatch, PILOT_RULE } from '../types.js';

function baseMatch(overrides: Partial<LiveMatch> = {}): LiveMatch {
  return {
    eventId: 'm1',
    sport: 'football',
    league: 'Liga Test',
    home: 'Alpha',
    away: 'Beta',
    minute: 20,
    scoreHome: 0,
    scoreAway: 0,
    drawOdds: 3.4,
    prematchFavoriteOdds: 1.75,
    over25Odds: 1.8,
    ts: new Date().toISOString(),
    ...overrides,
  };
}

describe('evaluateEntryCandidate', () => {
  it('acepta partido que cumple todas las condiciones duras', () => {
    const result = evaluateEntryCandidate(baseMatch(), 0);
    assert.equal(result.matches, true);
    assert.deepEqual(result.reasons, []);
  });

  it('rechaza minuto fuera de ventana', () => {
    const result = evaluateEntryCandidate(baseMatch({ minute: 14 }), 0);
    assert.equal(result.matches, false);
    assert.ok(result.reasons.some((r) => r.includes('minuto')));
  });

  it('rechaza marcador distinto de 0-0', () => {
    const result = evaluateEntryCandidate(baseMatch({ scoreHome: 1 }), 0);
    assert.equal(result.matches, false);
    assert.ok(result.reasons.some((r) => r.includes('marcador')));
  });

  it('rechaza cuota empate fuera de rango', () => {
    const low = evaluateEntryCandidate(baseMatch({ drawOdds: 2.9 }), 0);
    const high = evaluateEntryCandidate(baseMatch({ drawOdds: 4.6 }), 0);
    assert.equal(low.matches, false);
    assert.equal(high.matches, false);
  });

  it('rechaza favorito prepartido fuera de rango', () => {
    const result = evaluateEntryCandidate(baseMatch({ prematchFavoriteOdds: 2.2 }), 0);
    assert.equal(result.matches, false);
    assert.ok(result.reasons.some((r) => r.includes('favorito pre')));
  });

  it('rechaza O2.5 >= 1.90', () => {
    const result = evaluateEntryCandidate(baseMatch({ over25Odds: 1.9 }), 0);
    assert.equal(result.matches, false);
    assert.ok(result.reasons.some((r) => r.includes('O2.5')));
  });

  it('acepta O2.5 justo por debajo de 1.90', () => {
    const result = evaluateEntryCandidate(baseMatch({ over25Odds: 1.89 }), 0);
    assert.equal(result.matches, true);
  });

  it('rechaza cuando ya hay 2 operaciones abiertas', () => {
    const result = evaluateEntryCandidate(baseMatch(), PILOT_RULE.maxOperations);
    assert.equal(result.matches, false);
    assert.ok(result.reasons.some((r) => r.includes('operaciones')));
  });

  it('acepta con 1 operación abierta', () => {
    const result = evaluateEntryCandidate(baseMatch(), 1);
    assert.equal(result.matches, true);
  });
});

describe('recordatorios de salida', () => {
  it('detecta primer gol', () => {
    assert.equal(shouldRemindFirstGoalClose(baseMatch({ scoreHome: 1 })), true);
    assert.equal(shouldRemindFirstGoalClose(baseMatch()), false);
  });

  it('detecta revisión ~45', () => {
    assert.equal(shouldRemindHalftimeReview(baseMatch({ minute: 45 })), true);
    assert.equal(shouldRemindHalftimeReview(baseMatch({ minute: 44 })), false);
  });

  it('detecta cierre duro ≥60', () => {
    assert.equal(shouldRemindHardClose(baseMatch({ minute: 60 })), true);
    assert.equal(shouldRemindHardClose(baseMatch({ minute: 59 })), false);
  });
});

describe('buildEntryAlert', () => {
  it('marca confirmación manual de presión ofensiva y paper trading', () => {
    const alert = buildEntryAlert(baseMatch());
    assert.equal(alert.kind, 'entry_candidate');
    assert.equal(alert.requiresManualPressureConfirm, true);
    assert.equal(alert.paperTrade, true);
    assert.match(alert.message, /candidato — confirmar presión ofensiva \(manual\)/);
    assert.match(alert.bankrollHint ?? '', /\$5/);
  });
});
