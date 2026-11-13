import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  closePaperTrade,
  computeLayClosedByBackPnl,
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

describe('computeLayClosedByBackPnl', () => {
  it('green cuando back salida > lay entrada (empate se alarga)', () => {
    // Q=5, L=3.5, B=8 → 5*(8-3.5)/((3.5-1)*(8-1)) = 1.29
    assert.equal(computeLayClosedByBackPnl(5, 3.5, 8), 1.29);
  });

  it('red parcial cuando back salida < lay entrada — NO -100% liability', () => {
    // Q=5, L=3.5, B=2.5 → -1.33
    const pnl = computeLayClosedByBackPnl(5, 3.5, 2.5);
    assert.equal(pnl, -1.33);
    assert.ok(pnl > -5, 'no éxito no debe ser -liability completa');
  });

  it('P&L ~0 si back = lay', () => {
    assert.equal(computeLayClosedByBackPnl(5, 3.5, 3.5), 0);
  });
});

describe('open/close paper trade (lay → back)', () => {
  it('cierra siempre con exitSide back y P&L por spread', () => {
    const open = openPaperTrade(baseMatch({ drawOdds: 3.5 }));
    assert.equal(open.liabilityUsd, 5);
    const closed = closePaperTrade(
      open,
      baseMatch({ minute: 29, scoreHome: 1, drawOdds: 8 }),
      'first_goal_close',
    );
    assert.equal(closed.exitSide, 'back');
    assert.equal(closed.exitOdds, 8);
    assert.equal(closed.success, true);
    assert.equal(closed.pnlUsd, 1.29);
    assert.equal(closed.exitReason, 'first_goal_close');
  });

  it('hard close con cuota acortada es no éxito pero no -5', () => {
    const open = openPaperTrade(baseMatch({ drawOdds: 3.5 }));
    const closed = closePaperTrade(
      open,
      baseMatch({ minute: 60, drawOdds: 2.5 }),
      'hard_close',
    );
    assert.equal(closed.exitSide, 'back');
    assert.equal(closed.success, false);
    assert.equal(closed.pnlUsd, -1.33);
    assert.notEqual(closed.pnlUsd, -5);
  });
});

describe('summarizePaperTrades', () => {
  it('calcula % éxito y % no éxito', () => {
    const win = closePaperTrade(
      openPaperTrade(baseMatch({ drawOdds: 3.5 })),
      baseMatch({ scoreHome: 1, drawOdds: 8 }),
      'first_goal_close',
    );
    const loss = closePaperTrade(
      openPaperTrade(baseMatch({ eventId: 'm2', drawOdds: 3.5 })),
      baseMatch({ eventId: 'm2', minute: 60, drawOdds: 2.5 }),
      'hard_close',
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
  it('al bootstrap deja Excel sin filas de trades (wipe historial viejo)', async () => {
    const excelPath = join(tmpdir(), `oddjusta-paper-wipe-${Date.now()}.xlsx`);
    // Simula Excel previo con basura en disco: se sobrescribe al bootstrap
    const { writeFileSync } = await import('node:fs');
    writeFileSync(excelPath, 'OLD_CORRUPT_OR_LEGACY_PNL');
    const monitor = new MonitorService(
      new SyntheticFeed([]), // sin partidos → no abre trades nuevos
      { excelPath, bankrollUsd: 500 },
    );
    monitor.bootstrap();
    await monitor.flushExcel();
    assert.equal(monitor.getState().paperTrades.length, 0);
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(excelPath);
    const sheet = wb.getWorksheet('Historial');
    assert.ok(sheet);
    // Solo cabecera (fila 1); sin filas de datos
    assert.equal(sheet.rowCount, 1);
  });

  it('abre paper, cierra primer gol con Back Draw (green) y escribe Excel', async () => {
    const excelPath = join(tmpdir(), `oddjusta-paper-${Date.now()}.xlsx`);
    const monitor = new MonitorService(new SyntheticFeed(), {
      excelPath,
      bankrollUsd: 500,
    });

    let state = monitor.bootstrap();
    assert.ok(
      state.paperTrades.some((t) => t.eventId === 'syn-003' && t.status === 'open'),
    );

    for (let i = 0; i < 25; i++) {
      monitor.tickOnce();
    }
    state = monitor.getState();
    const syn001 = state.paperTrades.find((t) => t.eventId === 'syn-001');
    assert.ok(syn001);
    assert.equal(syn001.status, 'closed');
    assert.equal(syn001.exitReason, 'first_goal_close');
    assert.equal(syn001.exitSide, 'back');
    assert.equal(syn001.success, true);
    assert.ok((syn001.pnlUsd ?? 0) > 0);
    assert.ok((syn001.exitOdds ?? 0) > syn001.entryOdds);

    await monitor.flushExcel();
    assert.equal(existsSync(excelPath), true);
  });

  it('syn-003 cierra ≤60 con Back Draw a cuota acortada: red ≠ -liability', async () => {
    const excelPath = join(tmpdir(), `oddjusta-paper-loss-${Date.now()}.xlsx`);
    // Solo syn-003 para no saturar el tope de 2 ops
    const seed = new SyntheticFeed().getMatches().filter((m) => m.eventId === 'syn-003');
    const monitor = new MonitorService(new SyntheticFeed(seed), {
      excelPath,
      bankrollUsd: 500,
    });
    monitor.bootstrap();
    const opened = monitor.getState().paperTrades[0];
    assert.equal(opened?.status, 'open');
    assert.ok((opened?.entryOdds ?? 0) >= 3 && (opened?.entryOdds ?? 0) <= 4.5);

    // 18 → 60 = 42 ticks
    for (let i = 0; i < 42; i++) {
      monitor.tickOnce();
    }
    const closed = monitor.getState().paperTrades.find((t) => t.eventId === 'syn-003');
    assert.ok(closed);
    assert.equal(closed.status, 'closed');
    assert.equal(closed.exitReason, 'hard_close');
    assert.equal(closed.exitSide, 'back');
    assert.ok((closed.exitOdds ?? 99) < closed.entryOdds, 'cuota empate acortada');
    assert.equal(closed.success, false);
    assert.ok((closed.pnlUsd ?? 0) < 0);
    assert.ok((closed.pnlUsd ?? 0) > -closed.liabilityUsd);

    await monitor.flushExcel();
  });
});
