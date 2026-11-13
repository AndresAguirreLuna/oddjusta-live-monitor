import {
  Alert,
  LiveMatch,
  MonitorState,
  PILOT_RULE,
} from '../types.js';
import {
  buildEntryAlert,
  buildExitAlert,
  evaluateEntryCandidate,
  shouldRemindFirstGoalClose,
  shouldRemindHalftimeReview,
  shouldRemindHardClose,
} from '../rules/lay-draw-pilot.js';
import { SyntheticFeed } from '../feed/synthetic-feed.js';

export type AlertListener = (alert: Alert, state: MonitorState) => void;

export class MonitorService {
  private feed: SyntheticFeed;
  private state: MonitorState;
  private listeners = new Set<AlertListener>();
  private timer: ReturnType<typeof setInterval> | null = null;
  /** eventIds que el usuario marcó como operación abierta (simulado). */
  private trackedOps = new Set<string>();

  constructor(feed?: SyntheticFeed) {
    this.feed = feed ?? new SyntheticFeed();
    this.state = {
      openOperations: 0,
      maxOperations: PILOT_RULE.maxOperations,
      bankrollPercentReminder: PILOT_RULE.bankrollPercentReminder,
      matches: this.feed.getMatches(),
      alerts: [],
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
      entryAlertedEventIds: [...this.state.entryAlertedEventIds],
      exitAlerted: structuredClone(this.state.exitAlerted),
    };
  }

  getRule() {
    return { ...PILOT_RULE };
  }

  /** Marca una operación abierta (cuenta contra el tope de 2). */
  openOperation(eventId: string): MonitorState {
    this.trackedOps.add(eventId);
    this.state.openOperations = this.trackedOps.size;
    return this.getState();
  }

  closeOperation(eventId: string): MonitorState {
    this.trackedOps.delete(eventId);
    this.state.openOperations = this.trackedOps.size;
    return this.getState();
  }

  start(intervalMs = 2000): void {
    if (this.timer) return;
    this.evaluate(this.feed.getMatches());
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

  /** Un tick manual (útil en tests). */
  tickOnce(): MonitorState {
    const matches = this.feed.tick();
    this.evaluate(matches);
    return this.getState();
  }

  private evaluate(matches: LiveMatch[]): void {
    this.state.matches = matches;
    const newAlerts: Alert[] = [];

    for (const match of matches) {
      const entry = evaluateEntryCandidate(match, this.state.openOperations);
      if (
        entry.matches &&
        !this.state.entryAlertedEventIds.includes(match.eventId)
      ) {
        const alert = buildEntryAlert(match);
        newAlerts.push(alert);
        this.state.entryAlertedEventIds.push(match.eventId);
      }

      // Salidas solo si hubo candidato o hay op trackeada
      const watched =
        this.state.entryAlertedEventIds.includes(match.eventId) ||
        this.trackedOps.has(match.eventId);

      if (!watched) continue;

      const exitFlags = this.state.exitAlerted[match.eventId] ?? {};

      if (shouldRemindFirstGoalClose(match) && !exitFlags.exit_first_goal) {
        const alert = buildExitAlert(match, 'exit_first_goal');
        newAlerts.push(alert);
        exitFlags.exit_first_goal = true;
      }
      if (shouldRemindHalftimeReview(match) && !exitFlags.exit_halftime_review) {
        const alert = buildExitAlert(match, 'exit_halftime_review');
        newAlerts.push(alert);
        exitFlags.exit_halftime_review = true;
      }
      if (shouldRemindHardClose(match) && !exitFlags.exit_hard_close) {
        const alert = buildExitAlert(match, 'exit_hard_close');
        newAlerts.push(alert);
        exitFlags.exit_hard_close = true;
      }

      this.state.exitAlerted[match.eventId] = exitFlags;
    }

    for (const alert of newAlerts) {
      this.state.alerts = [alert, ...this.state.alerts].slice(0, 100);
      for (const listener of this.listeners) {
        listener(alert, this.getState());
      }
    }
  }
}
