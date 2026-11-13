import { Injectable, NgZone, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Alert, MonitorState, PilotRule } from './models';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class MonitorService {
  readonly state = signal<MonitorState | null>(null);
  readonly rule = signal<PilotRule | null>(null);
  readonly connected = signal(false);
  readonly lastAlert = signal<Alert | null>(null);

  private socket: WebSocket | null = null;
  private notificationsEnabled = false;

  constructor(
    private readonly http: HttpClient,
    private readonly zone: NgZone,
  ) {}

  async init(): Promise<void> {
    await this.requestNotificationPermission();
    const [state, rulePayload] = await Promise.all([
      firstValueFrom(this.http.get<MonitorState>('/api/state')),
      firstValueFrom(this.http.get<{ rule: PilotRule }>('/api/rule')),
    ]);
    this.state.set(state);
    this.rule.set(rulePayload.rule);
    this.connectWs();
  }

  async closeOperation(eventId: string): Promise<void> {
    const next = await firstValueFrom(
      this.http.post<MonitorState>(`/api/operations/${eventId}/close`, {}),
    );
    this.state.set(next);
  }

  excelDownloadUrl(): string {
    return '/api/paper-trades/excel';
  }

  private async requestNotificationPermission(): Promise<void> {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      this.notificationsEnabled = true;
      return;
    }
    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      this.notificationsEnabled = permission === 'granted';
    }
  }

  private connectWs(): void {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${window.location.host}/ws`;
    this.socket = new WebSocket(url);

    this.socket.onopen = () => {
      this.zone.run(() => this.connected.set(true));
    };
    this.socket.onclose = () => {
      this.zone.run(() => this.connected.set(false));
      setTimeout(() => this.connectWs(), 2000);
    };
    this.socket.onmessage = (event) => {
      const payload = JSON.parse(event.data as string) as
        | { type: 'state'; state: MonitorState }
        | { type: 'alert'; alert: Alert; state: MonitorState };

      this.zone.run(() => {
        if (payload.type === 'state') {
          this.state.set(payload.state);
        }
        if (payload.type === 'alert') {
          this.state.set(payload.state);
          this.lastAlert.set(payload.alert);
          this.showDesktopNotification(payload.alert);
        }
      });
    };
  }

  private showDesktopNotification(alert: Alert): void {
    if (!this.notificationsEnabled || !('Notification' in window)) return;
    const title =
      alert.kind === 'entry_candidate' || alert.kind === 'paper_entry'
        ? 'Paper trading — candidato / entrada simulada'
        : `Paper trading — ${alert.kind}`;
    new Notification(title, {
      body: `${alert.matchLabel} (${alert.minute}') — ${alert.message}`,
      tag: alert.id,
    });
  }
}
