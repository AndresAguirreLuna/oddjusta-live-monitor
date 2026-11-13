import { Component, OnInit, computed } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { MonitorService } from './monitor.service';
import { AlertKind } from './models';

@Component({
  selector: 'app-root',
  imports: [DatePipe, DecimalPipe],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent implements OnInit {
  readonly state;
  readonly rule;
  readonly connected;
  readonly lastAlert;

  readonly candidateIds = computed(() => {
    const s = this.state();
    return new Set(s?.entryAlertedEventIds ?? []);
  });

  constructor(private readonly monitor: MonitorService) {
    this.state = monitor.state;
    this.rule = monitor.rule;
    this.connected = monitor.connected;
    this.lastAlert = monitor.lastAlert;
  }

  ngOnInit(): void {
    void this.monitor.init();
  }

  kindLabel(kind: AlertKind): string {
    switch (kind) {
      case 'entry_candidate':
        return 'Candidato';
      case 'exit_first_goal':
        return 'Salida · gol';
      case 'exit_halftime_review':
        return 'Revisión · 45′';
      case 'exit_hard_close':
        return 'Cierre · 60′';
    }
  }

  openOp(eventId: string): void {
    void this.monitor.openOperation(eventId);
  }

  closeOp(eventId: string): void {
    void this.monitor.closeOperation(eventId);
  }
}
