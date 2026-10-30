// Іске қосу:  npm init -y && npm i ws
//             GEMINI_API_KEY=ключ node server.js      (Node 18+)
// Қосымша ENV: GEMINI_MODEL, GEMINI_LIVE_MODEL, PORT, DAILY_CAP, CHAT_PER_MIN
const http = require('http'), fs = require('fs'), path = require('path');
const { WebSocketServer, WebSocket } = require('ws');
const KEY = process.env.GEMINI_API_KEY;
if (!KEY) { console.error('GEMINI_API_KEY орнатылмаған'); process.exit(1); }
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const LIVE = process.env.GEMINI_LIVE_MODEL || 'gemini-2.5-flash-native-audio-preview-09-2025';
const PORT = process.env.PORT || 3000, API = 'https://generativelanguage.googleapis.com/v1beta/models/';
const PID = process.env.FIREBASE_PROJECT_ID; let jose, JWKS;   // PID орнатылса, барлық /api Firebase токенін талап етеді
async function verify(t) {
  if (!PID) return { uid: 'anon' };
  jose = jose || await import('jose');
  JWKS = JWKS || jose.createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
  const { payload } = await jose.jwtVerify(t, JWKS, { issuer: 'https://securetoken.google.com/' + PID, audience: PID });
  return { uid: payload.sub };
}
const who = req => verify((req.headers.authorization || '').replace(/^Bearer /, ''));
const SYS = 'Сен Zere — Qazart платформасының қазақ тіліндегі AI көмекшісісің. Әрдайым таза, әдемі қазақ тілінде жауап бер (пайдаланушы басқа тілді сұраса ғана ауыстыр). Жауабың қысқа, нақты және достық болсын: 1–4 сөйлем. Дауыстық сөйлесуге арналған, сондықтан markdown, тізім, жұлдызша және эмодзи қолданба. Сандар мен қысқартуларды сөзбен жаз. Қазақ тілі, аударма, шежіре, бизнес және медиа тақырыбында көмектес.';

// Қорғаныс: IP бойынша минутына лимит + тәулік бойынша жалпы лимит
const hits = new Map(); let day = { d: '', n: 0 };
const ipOf = r => (r.headers['x-forwarded-for'] || r.socket.remoteAddress || '').split(',')[0].trim();
function limited(ip, max) { const n = Date.now(), a = (hits.get(ip) || []).filter(t => n - t < 6e4); a.push(n); hits.set(ip, a); return a.length > max; }
function capped() { const d = new Date().toISOString().slice(0, 10); if (day.d !== d) day = { d, n: 0 }; return ++day.n > (+process.env.DAILY_CAP || 2000); }

const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
const body = (req, max = 1e5) => new Promise((ok, no) => { let b = ''; req.on('data', c => { b += c; if (b.length > max) { no(new Error('big')); req.destroy(); } }); req.on('end', () => ok(b)); });
async function gen(payload) {
  const r = await fetch(API + MODEL + ':generateContent', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY }, body: JSON.stringify(payload) });
  return { code: r.status, data: await r.json() };
}

let news = { t: 0, data: null };
async function getNews() {
  if (news.data && Date.now() - news.t < 30 * 6e4) return news.data;       // 30 минут кэш: квота үнемделеді
  const q = 'Google іздеуін қолданып, Қазақстандағы ең соңғы 6 маңызды жаңалықты тап (бүгін: ' + new Date().toISOString().slice(0, 10) + '). Тек сенімді БАҚ (tengrinews.kz, kazinform.kz, zakon.kz, 24.kz, egemen.kz, forbes.kz т.б.). Жауапты ТЕК JSON массив түрінде қайтар, markdown жоқ: [{"title":"қазақша тақырып","easy":"қарапайым қазақ тілінде 1-2 сөйлем","original":"толығырақ 2-3 сөйлем","summary":"1 сөйлемдік қорытынды","category":"САЯСАТ|ЭКОНОМИКА|ТЕХНОЛОГИЯ|ҚОҒАМ|СПОРТ","source":"БАҚ атауы","url":"іздеуде табылған нақты сілтеме","date":"күні"}]. Ештеңені ойдан қоспа.';
  const { code, data } = await gen({ contents: [{ role: 'user', parts: [{ text: q }] }], tools: [{ google_search: {} }] });
  if (code !== 200) throw new Error((data.error && data.error.message) || code);
  const c = data.candidates[0];
  const items = JSON.parse(c.content.parts.map(p => p.text || '').join('').match(/\[[\s\S]*\]/)[0]);
  const sources = ((c.groundingMetadata || {}).groundingChunks || []).map(x => x.web).filter(Boolean);
  news = { t: Date.now(), data: { items, sources } }; return news.data;
}

const server = http.createServer(async (req, res) => {
  try {
    const ip = ipOf(req);
    if (req.url === '/api/health') return send(res, 200, { ok: true });
    if (req.url === '/api/news') { let u; try { u = await who(req); } catch (e) { return send(res, 401, { error: 'Кіру қажет' }); } if (limited(u.uid, 10)) return send(res, 429, { error: 'Тым жиі сұрау' }); return send(res, 200, await getNews()); }
    if (req.url === '/api/chat' && req.method === 'POST') {
      let u; try { u = await who(req); } catch (e) { return send(res, 401, { error: 'Кіру қажет' }); }
      if (limited(u.uid, +process.env.CHAT_PER_MIN || 20) || capped()) return send(res, 429, { error: 'Лимит таусылды, сәлден кейін қайталаңыз' });
      const j = JSON.parse(await body(req));
      const contents = (Array.isArray(j.contents) ? j.contents : []).slice(-16).map(m => ({ role: m.role === 'model' ? 'model' : 'user', parts: [{ text: String(m.parts && m.parts[0] && m.parts[0].text || '').slice(0, 2000) }] }));
      if (!contents.length) return send(res, 400, { error: 'Бос сұрау' });
      const { code, data } = await gen({ systemInstruction: { parts: [{ text: SYS }] }, contents, generationConfig: { temperature: 0.7 } });
      return send(res, code, data);
    }
    const LN = { kk: 'Kazakh', ru: 'Russian', en: 'English', tr: 'Turkish' };
    if (req.url === '/api/translate' && req.method === 'POST') {
      let u; try { u = await who(req); } catch (e) { return send(res, 401, { error: 'Кіру қажет' }); }
      if (limited(u.uid, 15) || capped()) return send(res, 429, { error: 'Лимит таусылды, сәлден кейін қайталаңыз' });
      const j = JSON.parse(await body(req, 4e6));
      const to = LN[j.to], from = LN[j.from] || null;
      if (!to) return send(res, 400, { error: 'Тіл қате' });
      const parts = []; let task;
      if (j.image) {
        if (typeof j.image !== 'string' || j.image.length > 3.5e6 || !/^[A-Za-z0-9+\/=]+$/.test(j.image)) return send(res, 400, { error: 'Сурет қате немесе тым үлкен' });
        parts.push({ inlineData: { mimeType: 'image/jpeg', data: j.image } });
        task = 'Extract all readable text from this image' + (from ? ' (probably ' + from + ')' : '') + ' and translate it into ' + to + '.';
      } else {
        const text = String(j.text || '').slice(0, 2000).trim();
        if (!text) return send(res, 400, { error: 'Мәтін бос' });
        task = 'Translate the following text' + (from ? ' from ' + from : '') + ' into ' + to + ':\n"""' + text + '"""';
      }
      parts.push({ text: task + ' Return ONLY JSON: {"original":"<source or extracted text>","translation":"<translation>"}. If the image has no text, return empty strings. No explanations.' });
      const { code, data } = await gen({ contents: [{ role: 'user', parts }], generationConfig: { temperature: 0.2, responseMimeType: 'application/json' } });
      if (code !== 200) return send(res, code, { error: (data.error && data.error.message) || code });
      const t = ((data.candidates && data.candidates[0].content.parts) || []).map(p => p.text || '').join('');
      let out; try { out = JSON.parse(t); } catch (e) { out = { original: '', translation: t }; }
      return send(res, 200, { original: String(out.original || ''), translation: String(out.translation || '') });
    }
    if (req.url === '/' || req.url === '/index.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(fs.readFileSync(path.join(__dirname, 'index.html'))); }
    send(res, 404, { error: 'Not found' });
  } catch (e) { send(res, 500, { error: e.message }); }
});

// Нақты уақыттағы дауыс: браузер ↔ біздің сервер ↔ Gemini Live (кілт серверде қалады)
const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, sock, head) => {
  if (req.url !== '/api/live') return sock.destroy();
  wss.handleUpgrade(req, sock, head, ws => wss.emit('connection', ws, req));
});
wss.on('connection', (ws, req) => {
  let up = null, started = false;
  const stop = setTimeout(() => ws.close(1000, 'Сессия уақыты бітті'), 10 * 6e4);
  const authT = setTimeout(() => { if (!started) ws.close(1008, 'Auth жоқ'); }, 8000);
  ws.on('message', async d => {
    let m; try { m = JSON.parse(d.toString()); } catch (e) { return; }
    if (!started) {
      if (m.auth === undefined) return;
      started = true; clearTimeout(authT);
      let u; try { u = await verify(String(m.auth)); } catch (e) { return ws.close(1008, 'Кіру қажет'); }
      if (limited('live' + u.uid, 4) || capped()) return ws.close(1013, 'Лимит таусылды');
      up = new WebSocket('wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=' + KEY);
      up.on('open', () => up.send(JSON.stringify({ setup: { model: 'models/' + LIVE, generationConfig: { responseModalities: ['AUDIO'] }, systemInstruction: { parts: [{ text: SYS + ' Қазақ тілінде сөйле.' }] }, inputAudioTranscription: {}, outputAudioTranscription: {} } })));
      up.on('message', x => { if (ws.readyState === 1) ws.send(x.toString()); });
      up.on('close', (c, r) => ws.close(1000, String(r || '').slice(0, 100)));
      up.on('error', () => ws.close(1011, 'Gemini қосылым қатесі'));
      return;
    }
    if (m.realtimeInput && up && up.readyState === 1) up.send(JSON.stringify({ realtimeInput: m.realtimeInput }));
  });
  ws.on('close', () => { clearTimeout(stop); clearTimeout(authT); if (up) up.close(); });
});
server.listen(PORT, () => console.log('Qazart: http://localhost:' + PORT));
