import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Alert,
  LiveMatch,
  MonitorState,
  PAPER_TRADING,
  PILOT_RULE,
  PaperTrade,
} from '../types.js';
import {
  buildEntryAlert,
  buildExitAlert,
  buildPaperEntryAlert,
  buildPaperExitAlert,
  evaluateEntryCandidate,
  shouldRemindFirstGoalClose,
  shouldRemindHalftimeReview,
  shouldRemindHardClose,
} from '../rules/lay-draw-pilot.js';
import { SyntheticFeed } from '../feed/synthetic-feed.js';
import {
  closePaperTrade,
  emptyPaperStats,
  openPaperTrade,
  summarizePaperTrades,
} from './paper-trading.js';
import { writePaperTradesExcel } from './excel-export.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const DEFAULT_EXCEL_PATH = join(
  __dirname,
  '../../data/exports/historial-paper-trading.xlsx',
);

export type AlertListener = (alert: Alert, state: MonitorState) => void;

export class MonitorService {
  private feed: SyntheticFeed;
  private state: MonitorState;
  private listeners = new Set<AlertListener>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private excelPath: string;
  private bankrollUsd: number;
  private excelWriteChain: Promise<void> = Promise.resolve();

  constructor(
    feed?: SyntheticFeed,
    options?: { excelPath?: string; bankrollUsd?: number },
  ) {
    this.feed = feed ?? new SyntheticFeed();
    this.excelPath = options?.excelPath ?? DEFAULT_EXCEL_PATH;
    this.bankrollUsd = options?.bankrollUsd ?? PAPER_TRADING.defaultBankrollUsd;
    this.state = {
      mode: 'paper_trading_simulated',
      openOperations: 0,
      maxOperations: PILOT_RULE.maxOperations,
      bankrollUsd: this.bankrollUsd,
      bankrollPercentReminder: PILOT_RULE.bankrollPercentReminder,
      maxLiabilityUsd: PAPER_TRADING.maxLiabilityUsd,
      matches: this.feed.getMatches(),
      alerts: [],
      paperTrades: [],
      paperStats: emptyPaperStats(),
      excelPath: this.excelPath,
      entryAlertedEventIds: [],
      exitAlerted: {},
    };
  }

  onAlert(listener: AlertListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState(): MonitorState {
    return {
      ...this.state,
      matches: this.state.matches.map((m) => ({ ...m })),
      alerts: [...this.state.alerts],
      paperTrades: this.state.paperTrades.map((t) => ({ ...t })),
      paperStats: { ...this.state.paperStats },
      entryAlertedEventIds: [...this.state.entryAlertedEventIds],
      exitAlerted: structuredClone(this.state.exitAlerted),
    };
  }

  getRule() {
    return {
      ...PILOT_RULE,
      paperTrading: {
        ...PAPER_TRADING,
        bankrollUsd: this.bankrollUsd,
        convention:
          'liability = min($5, 1% bankroll). Default bankroll $500 → stake/responsabilidad simulada $5. No es dinero real ni órdenes Odd Justa.',
      },
    };
  }

  getExcelPath(): string {
    return this.excelPath;
  }

  /** Compat: marcar op manual ya no abre paper (paper se abre solo). */
  openOperation(eventId: string): MonitorState {
    const match = this.state.matches.find((m) => m.eventId === eventId);
    if (match && !this.findOpenTrade(eventId)) {
      this.simulateEntry(match, []);
      this.refreshTradeStats();
      void this.queueExcelWrite();
    }
    return this.getState();
  }

  closeOperation(eventId: string): MonitorState {
    const match = this.state.matches.find((m) => m.eventId === eventId);
    const open = this.findOpenTrade(eventId);
    if (match && open) {
      const alerts: Alert[] = [];
      // Cierre manual también es Back Draw
      this.simulateExit(open, match, 'manual_close', alerts);
      this.emitAlerts(alerts);
      this.refreshTradeStats();
      void this.queueExcelWrite();
    }
    return this.getState();
  }

  /** Evalúa el feed actual sin arrancar el timer (útil en tests). */
  bootstrap(): MonitorState {
    this.evaluate(this.feed.getMatches());
    return this.getState();
  }

  start(intervalMs = 2000): void {
    if (this.timer) return;
    this.bootstrap();
    this.timer = setInterval(() => {
      const matches = this.feed.tick();
      this.evaluate(matches);
    }, intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  tickOnce(): MonitorState {
    const matches = this.feed.tick();
    this.evaluate(matches);
    return this.getState();
  }

  /** Espera a que el Excel pendiente se escriba (tests / scripts). */
  async flushExcel(): Promise<string> {
    await this.excelWriteChain;
    return this.excelPath;
  }

  private findOpenTrade(eventId: string): PaperTrade | undefined {
    return this.state.paperTrades.find(
      (t) => t.eventId === eventId && t.status === 'open',
    );
  }

  private refreshTradeStats(): void {
    this.state.paperStats = summarizePaperTrades(this.state.paperTrades);
    this.state.openOperations = this.state.paperStats.openCount;
  }

  private queueExcelWrite(): void {
    this.excelWriteChain = this.excelWriteChain
      .then(() =>
        writePaperTradesExcel(
          this.excelPath,
          this.state.paperTrades,
          this.state.paperStats,
        ),
      )
      .then(() => undefined)
      .catch((err: unknown) => {
        console.error('[excel] error escribiendo historial:', err);
      });
  }

  private simulateEntry(match: LiveMatch, newAlerts: Alert[]): PaperTrade {
    const trade = openPaperTrade(match, this.bankrollUsd);
    this.state.paperTrades = [trade, ...this.state.paperTrades];
    newAlerts.push(buildPaperEntryAlert(match, trade));
    return trade;
  }

  private simulateExit(
    trade: PaperTrade,
    match: LiveMatch,
    reason: 'first_goal_close' | 'hard_close' | 'manual_close',
    newAlerts: Alert[],
  ): void {
    const closed = closePaperTrade(trade, match, reason);
    this.state.paperTrades = this.state.paperTrades.map((t) =>
      t.id === trade.id ? closed : t,
    );
    newAlerts.push(buildPaperExitAlert(match, closed));
  }

  private emitAlerts(newAlerts: Alert[]): void {
    for (const alert of newAlerts) {
      this.state.alerts = [alert, ...this.state.alerts].slice(0, 100);
      for (const listener of this.listeners) {
        listener(alert, this.getState());
      }
    }
  }

  private evaluate(matches: LiveMatch[]): void {
    this.state.matches = matches;
    const newAlerts: Alert[] = [];
    let tradesChanged = false;

    for (const match of matches) {
      const entry = evaluateEntryCandidate(match, this.state.openOperations);
      if (
        entry.matches &&
        !this.state.entryAlertedEventIds.includes(match.eventId)
      ) {
        const alert = buildEntryAlert(match);
        newAlerts.push(alert);
        this.state.entryAlertedEventIds.push(match.eventId);

        // Paper trading: simula entrada automáticamente (no Odd Justa)
        this.simulateEntry(match, newAlerts);
        tradesChanged = true;
        this.refreshTradeStats();
      }

      const openTrade = this.findOpenTrade(match.eventId);
      const watched =
        this.state.entryAlertedEventIds.includes(match.eventId) || Boolean(openTrade);

      if (!watched) continue;

      const exitFlags = this.state.exitAlerted[match.eventId] ?? {};

      if (shouldRemindFirstGoalClose(match) && !exitFlags.exit_first_goal) {
        newAlerts.push(buildExitAlert(match, 'exit_first_goal'));
        exitFlags.exit_first_goal = true;
        if (openTrade) {
          // Cierre = Back Draw (cuota actual del feed)
          this.simulateExit(openTrade, match, 'first_goal_close', newAlerts);
          tradesChanged = true;
          this.refreshTradeStats();
        }
      }

      if (shouldRemindHalftimeReview(match) && !exitFlags.exit_halftime_review) {
        newAlerts.push(buildExitAlert(match, 'exit_halftime_review'));
        exitFlags.exit_halftime_review = true;
        // Revisión ~45: no cierra sola; espera gol o cierre duro ≤60
      }

      if (shouldRemindHardClose(match) && !exitFlags.exit_hard_close) {
        newAlerts.push(buildExitAlert(match, 'exit_hard_close'));
        exitFlags.exit_hard_close = true;
        const stillOpen = this.findOpenTrade(match.eventId);
        if (stillOpen) {
          // Cierre = Back Draw (no -100% liability; P&L por movimiento de cuota)
          this.simulateExit(stillOpen, match, 'hard_close', newAlerts);
          tradesChanged = true;
          this.refreshTradeStats();
        }
      }

      this.state.exitAlerted[match.eventId] = exitFlags;
    }

    this.emitAlerts(newAlerts);
    if (tradesChanged) {
      void this.queueExcelWrite();
    }
  }
}
