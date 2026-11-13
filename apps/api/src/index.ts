import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
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
  // Notificación "desktop" vía WebSocket → el cliente Angular usa Notification API
  broadcast({ type: 'alert', alert, state });
  console.log(`[alerta] ${alert.kind} | ${alert.matchLabel} | ${alert.message}`);
});

wss.on('connection', (socket) => {
  socket.send(JSON.stringify({ type: 'state', state: monitor.getState() }));
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'oddjusta-live-monitor-api', mode: 'synthetic' });
});

app.get('/api/rule', (_req, res) => {
  res.json({
    name: 'lay-empate-piloto',
    description: 'Lay empate live — condiciones duras; presión ofensiva manual',
    rule: monitor.getRule(),
    outOfScope: [
      'Auto-apuesta / colocación de órdenes',
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
  console.log('Fuera de alcance: auto-apuesta y scrape Odd Justa.');
});
