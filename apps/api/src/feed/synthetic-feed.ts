import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LiveMatch } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface FixtureRow extends LiveMatch {
  _scenario?: string;
}

/** Carga fixtures JSON (sin campo _scenario en el runtime). */
export function loadFixtures(): LiveMatch[] {
  const path = join(__dirname, '../../data/fixtures.json');
  const raw = JSON.parse(readFileSync(path, 'utf8')) as FixtureRow[];
  return raw.map(({ _scenario: _s, ...match }) => ({
    ...match,
    ts: new Date().toISOString(),
  }));
}

/**
 * Feed sintético: avanza minutos y dispara escenarios
 * (candidato, primer gol, revisión 45, cierre 60).
 */
export class SyntheticFeed {
  private matches: LiveMatch[];
  private tickCount = 0;

  constructor(seed?: LiveMatch[]) {
    this.matches = (seed ?? loadFixtures()).map((m) => ({ ...m }));
  }

  getMatches(): LiveMatch[] {
    return this.matches.map((m) => ({ ...m }));
  }

  /** Un tick ≈ 1 minuto de juego simulado. */
  tick(): LiveMatch[] {
    this.tickCount += 1;
    this.matches = this.matches.map((m) => this.advance(m));
    return this.getMatches();
  }

  private advance(m: LiveMatch): LiveMatch {
    const next: LiveMatch = {
      ...m,
      minute: m.minute + 1,
      ts: new Date().toISOString(),
    };

    // syn-001: entra en ventana y permanece 0-0 con cuotas OK hasta ~28, luego gol
    if (m.eventId === 'syn-001') {
      if (next.minute >= 15 && next.minute <= 28) {
        next.drawOdds = clamp(3.1 + (next.minute - 15) * 0.05, 3.0, 4.4);
        next.scoreHome = 0;
        next.scoreAway = 0;
      }
      if (next.minute === 29) {
        next.scoreHome = 1;
        // Tras gol el empate se alarga → back a cuota alta = green al cerrar el lay
        next.drawOdds = 8.0;
      }
    }

    // syn-003: candidato válido; sin gol la cuota empate se acorta → back < lay = red
    if (m.eventId === 'syn-003') {
      next.scoreHome = 0;
      next.scoreAway = 0;
      if (next.minute <= 30) {
        next.drawOdds = 3.55;
      } else if (next.minute < 45) {
        next.drawOdds = clamp(3.55 - (next.minute - 30) * 0.04, 2.6, 3.55);
      } else {
        next.drawOdds = clamp(2.9 - (next.minute - 45) * 0.03, 2.2, 2.9);
      }
    }

    // syn-004: ya con gol — útil para salida; cuota empate alargada
    if (m.eventId === 'syn-004' && next.minute === 26 && next.scoreHome === 0) {
      next.scoreHome = 1;
      next.drawOdds = Math.max(next.drawOdds, 7.0);
    }

    return next;
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number(n.toFixed(2))));
}
