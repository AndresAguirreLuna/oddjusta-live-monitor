# Odd Justa — Monitor de alertas + paper trading (MVP)

Herramienta **personal** de alertas y **paper trading simulado** para la regla piloto *lay empate*.
**No es consejo financiero ni legal.** **No coloca apuestas reales** en Odd Justa.

## Qué hace este MVP

1. Evalúa un **feed sintético** de partidos (JSON mock) contra la regla piloto.
2. Si hay match duro → **alerta desktop + UI** (`candidato — confirmar presión ofensiva (manual)`) y **abre una entrada paper simulada**.
3. Simula la **salida** según el feed: ganadora tras **primer gol**; revisión **~45′** (alerta); cierre forzado **≤60′** si no hay condiciones favorables.
4. Guarda el **registro** de cada op (entrada/salida, P&L simulado, motivo) y actualiza un **Excel** con historial + **% éxito** / **% no éxito**.
5. Tope de **2 operaciones** simultáneas.

## Paper trading — convención de stake

| Parámetro | Valor |
|-----------|--------|
| Responsabilidad máxima por entrada | **$5 USD** |
| Bankroll simulado por defecto | **$500** (1% = $5) |
| Fórmula | `liability = min(5, bankroll × 1%)` |

Por defecto la responsabilidad simulada es **$5**. Si configuras un bankroll cuyo 1% sea menor (p. ej. $300 → $3), se usa ese valor.

### P&L simulado (Lay Draw → Back Draw)

En exchange, **abrir Lay Draw** y **cerrar siempre con Back Draw** (también tras gol o al salir por reglas ~45/≤60). El “no éxito” **no** es −100% de la responsabilidad/$5: es el red del spread de cuotas.

Notación:

| Símbolo | Significado |
|---------|-------------|
| `Q` | Responsabilidad (liability) del lay (`min($5, 1% bankroll)`) |
| `L` | Cuota **lay** de entrada |
| `B` | Cuota **back** de salida |
| `S = Q / (L − 1)` | Stake matched del lay |
| `Sb = Q / (B − 1)` | Stake del back que neutraliza la liability |

**Fórmula (P&L bloqueado al hedgear):**

```text
P&L = S × (B − L) / (B − 1)
    = Q × (B − L) / ((L − 1) × (B − 1))
```

| Caso | Lectura |
|------|---------|
| `B > L` | Empate se alarga (p. ej. tras gol) → **green / éxito** |
| `B < L` | Empate se acorta (sigue 0-0) → **red / no éxito** (parcial, no −Q) |
| `B = L` | P&L ≈ 0 |

Ejemplo: `Q=5`, `L=3.50`, `B=8.00` → `P&L = 1.29`. Con `B=2.50` → `P&L = −1.33` (no −5).

Modelo paper simplificado — **sin** comisión, liquidez ni fill real de Odd Justa.

## Excel de historial

| | |
|--|--|
| Ruta en disco | `apps/api/data/exports/historial-paper-trading.xlsx` |
| Descarga HTTP | `GET http://127.0.0.1:3001/api/paper-trades/excel` |
| Reset | `POST http://127.0.0.1:3001/api/paper-trades/reset` |
| Hojas | `Historial` (ops), `Resumen` (% éxito / % no éxito / P&L), `Leyenda` |

**Importante:** el historial paper vive en **memoria de proceso**. El API **no lee** el `.xlsx` al arrancar (así no reaparecen filas con P&L del modelo viejo). Al boot se **reescribe el Excel vacío** y luego solo se añaden trades de la sesión actual (fórmula Lay→Back). El archivo no se versiona en git (solo `data/exports/.gitkeep`).

Interpretación rápida:

- **exito = si** → `pnl_usd > 0` (back salida a cuota mayor que lay entrada)
- **exito = no** → `pnl_usd ≤ 0` (spread en contra); **no** implica −100% de $5
- **pct_exito / pct_no_exito** → sobre operaciones **cerradas**
- Cierre siempre registrado como **Back Draw** (`lado_salida = back`)

## Regla piloto (entrada)

| Condición | Valor |
|-----------|--------|
| Lado | Lay al empate |
| Minuto | 15–30 |
| Marcador | 0-0 |
| Cuota empate | 3.00–4.50 |
| Favorito prepartido | 1.50–2.10 |
| Over 2.5 | &lt; 1.90 |
| Confirmación (real) | presión ofensiva **manual** |
| Paper | entrada simulada automática al cumplir reglas duras |

## Mocked vs fuera de alcance

| Incluido | Fuera de alcance |
|----------|------------------|
| Feed JSON / simulación de minutos | Scraping o sesión Odd Justa |
| Paper trading + Excel + P&L mock | Órdenes reales / auto-apuesta en Odd Justa |
| Notificaciones desktop | Telegram u otros canales |
| UI Angular (alertas + registro) | Métricas automáticas de presión |

## Stack

- `apps/api` — Node.js + Express + TypeScript + WebSocket + ExcelJS
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
El banner naranja recuerda que es **paper trading simulado**.

Opcional: tick manual del feed sintético:

```bash
curl -X POST http://127.0.0.1:3001/api/tick
```

## Tests

```bash
npm test
```

Cubre el motor de la regla piloto y el motor de simulación / P&L paper.

## Scripts útiles

| Script | Descripción |
|--------|-------------|
| `npm run dev:api` | API en modo watch |
| `npm run dev:web` | Angular serve + proxy |
| `npm run build` | Build API + web |
| `npm test` | Unit tests |

## Endpoints principales

- `GET /api/health` — estado (`paper_trading_simulated`)
- `GET /api/rule` — regla + convención paper
- `GET /api/state` — partidos, alertas, paper trades, stats
- `GET /api/paper-trades` — registro + % éxito
- `GET /api/paper-trades/excel` — descarga `.xlsx`
- `POST /api/tick` — avanza 1 minuto simulado
- `WS /ws` — push de estado y alertas

## Aviso

Uso personal. Cualquier trade real es **solo a mano** en Odd Justa.
Este repo **no** envía órdenes ni lee datos reales del exchange.
