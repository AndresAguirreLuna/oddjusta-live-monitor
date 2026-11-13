import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { readFile } from 'node:fs/promises';
import { MonitorService } from './services/monitor.js';
import { Alert } from './types.js';

const PORT = Number(process.env.PORT ?? 3001);
const TICK_MS = Number(process.env.TICK_MS ?? 2000);

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

const monitor = new MonitorService();
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

function broadcast(payload: unknown): void {
  const data = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

monitor.onAlert((alert: Alert, state) => {
  broadcast({ type: 'alert', alert, state });
  console.log(`[alerta] ${alert.kind} | ${alert.matchLabel} | ${alert.message}`);
});

wss.on('connection', (socket) => {
  socket.send(JSON.stringify({ type: 'state', state: monitor.getState() }));
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'oddjusta-live-monitor-api',
    mode: 'paper_trading_simulated',
    disclaimer: 'Paper trading simulado — no dinero real ni órdenes Odd Justa',
  });
});

app.get('/api/rule', (_req, res) => {
  res.json({
    name: 'lay-empate-piloto',
    description:
      'Lay empate live — condiciones duras; paper trading simulado; presión ofensiva manual en real',
    rule: monitor.getRule(),
    outOfScope: [
      'Órdenes reales / auto-apuesta en Odd Justa',
      'Scraping o sesión Odd Justa',
      'Telegram u otros canales',
      'Métricas automáticas de presión ofensiva',
    ],
  });
});

app.get('/api/state', (_req, res) => {
  res.json(monitor.getState());
});

app.get('/api/alerts', (_req, res) => {
  res.json(monitor.getState().alerts);
});

app.get('/api/matches', (_req, res) => {
  res.json(monitor.getState().matches);
});

app.get('/api/paper-trades', (_req, res) => {
  const state = monitor.getState();
  res.json({
    trades: state.paperTrades,
    stats: state.paperStats,
    excelPath: state.excelPath,
    disclaimer: 'Paper trading simulado — no es dinero real',
  });
});

app.get('/api/paper-trades/excel', async (_req, res) => {
  try {
    await monitor.flushExcel();
    const path = monitor.getExcelPath();
    const buf = await readFile(path);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="historial-paper-trading.xlsx"',
    );
    res.send(buf);
  } catch {
    res.status(404).json({
      error: 'Excel aún no generado — espera a la primera operación paper',
      path: monitor.getExcelPath(),
    });
  }
});

app.post('/api/operations/:eventId/open', (req, res) => {
  res.json(monitor.openOperation(req.params.eventId));
});

app.post('/api/operations/:eventId/close', (req, res) => {
  res.json(monitor.closeOperation(req.params.eventId));
});

app.post('/api/tick', (_req, res) => {
  res.json(monitor.tickOnce());
});

httpServer.listen(PORT, '127.0.0.1', () => {
  monitor.start(TICK_MS);
  console.log(`API Odd Justa monitor en http://127.0.0.1:${PORT}`);
  console.log(`WebSocket ws://127.0.0.1:${PORT}/ws (feed sintético cada ${TICK_MS}ms)`);
  console.log(`Paper trading Excel → ${monitor.getExcelPath()}`);
  console.log('MODO: paper trading SIMULADO — no Odd Justa real.');
});
