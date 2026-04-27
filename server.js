const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, maxPayload: 10 * 1024 * 1024 }); // 10MB

const sessions = {};

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

app.get('/', (req, res) => {
  res.send('Remote Control Server работает! ✅');
});

wss.on('connection', (ws) => {
  console.log('Новое подключение');

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);

      if (msg.type === 'host') {
        let code = generateCode();
        while (sessions[code]) code = generateCode();
        sessions[code] = { host: ws, client: null };
        ws.sessionCode = code;
        ws.role = 'host';
        ws.send(JSON.stringify({ type: 'code', code }));
        console.log('Хост создал сессию:', code);
      }

      else if (msg.type === 'join') {
        const session = sessions[msg.code];
        if (!session) {
          ws.send(JSON.stringify({ type: 'error', message: 'Код не найден' }));
          return;
        }
        if (session.client) {
          ws.send(JSON.stringify({ type: 'error', message: 'Сессия занята' }));
          return;
        }
        session.client = ws;
        ws.sessionCode = msg.code;
        ws.role = 'client';
        session.host.send(JSON.stringify({ type: 'client_connected' }));
        ws.send(JSON.stringify({ type: 'joined' }));
        console.log('Клиент подключился:', msg.code);
      }

      // Пересылаем фреймы экрана и команды управления
      else if (['frame', 'touch', 'swipe', 'disconnected'].includes(msg.type)) {
        const session = sessions[ws.sessionCode];
        if (!session) return;
        const target = ws.role === 'host' ? session.client : session.host;
        if (target && target.readyState === 1) {
          target.send(JSON.stringify(msg));
        }
      }

    } catch (e) {
      console.error('Ошибка:', e.message);
    }
  });

  ws.on('close', () => {
    const code = ws.sessionCode;
    if (!code || !sessions[code]) return;
    const session = sessions[code];
    if (ws.role === 'host') {
      if (session.client) session.client.send(JSON.stringify({ type: 'disconnected' }));
      delete sessions[code];
    } else {
      session.client = null;
      if (session.host) session.host.send(JSON.stringify({ type: 'client_disconnected' }));
    }
    console.log('Отключение от сессии:', code);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));
