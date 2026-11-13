import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  closePaperTrade,
  computeLayDrawPnl,
  openPaperTrade,
  resolveSimulatedLiability,
  summarizePaperTrades,
} from './paper-trading.js';
import { LiveMatch, PAPER_TRADING } from '../types.js';
import { MonitorService } from './monitor.js';
import { SyntheticFeed } from '../feed/synthetic-feed.js';

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
    drawOdds: 3.5,
    prematchFavoriteOdds: 1.75,
    over25Odds: 1.8,
    ts: new Date().toISOString(),
    ...overrides,
  };
}

describe('resolveSimulatedLiability', () => {
  it('usa $5 por defecto (bankroll 500 → 1% = 5)', () => {
    assert.equal(resolveSimulatedLiability(), 5);
    assert.equal(resolveSimulatedLiability(PAPER_TRADING.defaultBankrollUsd), 5);
  });

  it('capéa en $5 aunque el 1% sea mayor', () => {
    assert.equal(resolveSimulatedLiability(2000), 5);
  });

  it('usa 1% si es menor que $5', () => {
    assert.equal(resolveSimulatedLiability(300), 3);
  });
});

describe('computeLayDrawPnl', () => {
  it('calcula ganancia lay tras primer gol: liability/(odds-1)', () => {
    assert.equal(computeLayDrawPnl(5, 3.5, 'first_goal_win'), 2);
  });

  it('calcula pérdida en cierre duro: -liability', () => {
    assert.equal(computeLayDrawPnl(5, 3.5, 'hard_close_loss'), -5);
  });
});

describe('open/close paper trade', () => {
  it('abre con liability 5 y cierra ganadora', () => {
    const open = openPaperTrade(baseMatch());
    assert.equal(open.status, 'open');
    assert.equal(open.liabilityUsd, 5);
    const closed = closePaperTrade(
      open,
      baseMatch({ minute: 29, scoreHome: 1, drawOdds: 6 }),
      'first_goal_win',
    );
    assert.equal(closed.status, 'closed');
    assert.equal(closed.success, true);
    assert.equal(closed.pnlUsd, 2);
    assert.equal(closed.exitReason, 'first_goal_win');
  });

  it('cierra perdedora en hard close', () => {
    const open = openPaperTrade(baseMatch());
    const closed = closePaperTrade(
      open,
      baseMatch({ minute: 60 }),
      'hard_close_loss',
    );
    assert.equal(closed.success, false);
    assert.equal(closed.pnlUsd, -5);
  });
});

describe('summarizePaperTrades', () => {
  it('calcula % éxito y % no éxito', () => {
    const win = closePaperTrade(
      openPaperTrade(baseMatch()),
      baseMatch({ scoreHome: 1 }),
      'first_goal_win',
    );
    const loss = closePaperTrade(
      openPaperTrade(baseMatch({ eventId: 'm2' })),
      baseMatch({ eventId: 'm2', minute: 60 }),
      'hard_close_loss',
    );
    const stats = summarizePaperTrades([win, loss]);
    assert.equal(stats.closedCount, 2);
    assert.equal(stats.successCount, 1);
    assert.equal(stats.failCount, 1);
    assert.equal(stats.successPct, 50);
    assert.equal(stats.failPct, 50);
  });
});

describe('MonitorService paper simulation', () => {
  it('abre paper al cumplir reglas, cierra en primer gol y escribe Excel', async () => {
    const excelPath = join(tmpdir(), `oddjusta-paper-${Date.now()}.xlsx`);
    const monitor = new MonitorService(new SyntheticFeed(), {
      excelPath,
      bankrollUsd: 500,
    });

    // bootstrap evalúa sin timer → syn-003 (min 18) abre
    let state = monitor.bootstrap();
    assert.ok(
      state.paperTrades.some((t) => t.eventId === 'syn-003' && t.status === 'open'),
      'syn-003 debe abrir paper al arrancar',
    );
    assert.equal(state.mode, 'paper_trading_simulated');

    // syn-001 entra ~min 15 y marca gol en 29
    for (let i = 0; i < 25; i++) {
      monitor.tickOnce();
    }
    state = monitor.getState();
    const syn001 = state.paperTrades.find((t) => t.eventId === 'syn-001');
    assert.ok(syn001, 'syn-001 debió abrir');
    assert.equal(syn001.status, 'closed');
    assert.equal(syn001.exitReason, 'first_goal_win');
    assert.equal(syn001.success, true);
    assert.ok((syn001.pnlUsd ?? 0) > 0);

    await monitor.flushExcel();
    assert.equal(existsSync(excelPath), true);
  });

  it('cierra forzado ≤60 como no éxito si no hay gol', async () => {
    const excelPath = join(tmpdir(), `oddjusta-paper-loss-${Date.now()}.xlsx`);
    const feed = new SyntheticFeed([
      baseMatch({
        eventId: 'no-goal',
        minute: 20,
        drawOdds: 3.4,
        prematchFavoriteOdds: 1.8,
        over25Odds: 1.7,
      }),
    ]);
    const monitor = new MonitorService(feed, { excelPath, bankrollUsd: 500 });
    monitor.bootstrap();
    assert.equal(monitor.getState().paperTrades[0]?.status, 'open');

    // Avanzar hasta minuto 60 sin gol (20 → 60 = 40 ticks)
    for (let i = 0; i < 40; i++) {
      monitor.tickOnce();
    }
    const trade = monitor.getState().paperTrades.find((t) => t.eventId === 'no-goal');
    assert.ok(trade);
    assert.equal(trade.status, 'closed');
    assert.equal(trade.exitReason, 'hard_close_loss');
    assert.equal(trade.success, false);
    assert.equal(trade.pnlUsd, -5);

    await monitor.flushExcel();
  });
});
