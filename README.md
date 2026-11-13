# Odd Justa — Monitor de alertas en vivo (MVP)

Herramienta **personal** de alertas para la regla piloto *lay empate* en fútbol en vivo.
**No es consejo financiero ni legal.** No coloca apuestas automáticamente.

## Qué hace este MVP

1. Evalúa un **feed sintético** de partidos (JSON mock) contra la regla piloto.
2. Si hay match duro → alerta en la **UI** y **notificación de escritorio**:
   `candidato — confirmar presión ofensiva (manual)`.
3. Recordatorios de salida: **primer gol**, revisión **~45′**, cierre duro **≤60′**.
4. Tope de **2 operaciones** simultáneas y recordatorio de **1%** del bankroll.

## Regla piloto (entrada)

| Condición | Valor |
|-----------|--------|
| Lado | Lay al empate |
| Minuto | 15–30 |
| Marcador | 0-0 |
| Cuota empate | 3.00–4.50 |
| Favorito prepartido | 1.50–2.10 |
| Over 2.5 | &lt; 1.90 |
| Confirmación | presión ofensiva **manual** |

## Mocked vs fuera de alcance

| Incluido (mock) | Fuera de alcance |
|-----------------|------------------|
| Feed JSON / simulación de minutos | Scraping o sesión Odd Justa |
| Motor de reglas + tests | Auto-apuesta / auto-stake |
| Notificaciones desktop (Notification API) | Telegram u otros canales |
| UI Angular de partidos y alertas | Métricas automáticas de presión |

## Stack

- `apps/api` — Node.js + Express + TypeScript + WebSocket
- `apps/web` — Angular 19
- Monorepo npm workspaces

## Requisitos

- Node.js ≥ 20
- npm ≥ 10

## Cómo correr en local

```bash
# Desde la raíz del repo
npm install

# Terminal 1 — API (http://127.0.0.1:3001)
npm run dev:api

# Terminal 2 — UI (http://127.0.0.1:4200, proxy a la API)
npm run dev:web
```

Abre `http://127.0.0.1:4200`, acepta notificaciones del navegador si quieres alertas desktop.

Opcional: un tick manual del feed sintético:

```bash
curl -X POST http://127.0.0.1:3001/api/tick
```

## Tests

```bash
npm test
```

Cubre el motor de la regla piloto (entrada + salidas + mensaje de candidato).

## Scripts útiles

| Script | Descripción |
|--------|-------------|
| `npm run dev:api` | API en modo watch |
| `npm run dev:web` | Angular serve + proxy |
| `npm run build` | Build API + web |
| `npm test` | Unit tests del motor |

## Endpoints principales

- `GET /api/health` — estado del servicio
- `GET /api/rule` — regla piloto + out-of-scope
- `GET /api/state` — partidos, alertas, ops
- `GET /api/matches` — feed actual
- `GET /api/alerts` — historial reciente
- `POST /api/operations/:eventId/open|close` — simular ops abiertas
- `WS /ws` — push de estado y alertas

## Aviso

Uso personal. Ejecución de trades solo a mano en Odd Justa (u otro cliente autorizado).
Este repo **no** automatiza órdenes ni lee datos reales del exchange.
