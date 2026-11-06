// Іске қосу:  npm init -y && npm i ws
//             GEMINI_API_KEY=ключ node server.js      (Node 18+)
// Қосымша ENV: GEMINI_MODEL, GEMINI_LIVE_MODEL, PORT, DAILY_CAP, CHAT_PER_MIN
const http = require('http'), fs = require('fs'), path = require('path');
const { WebSocketServer, WebSocket } = require('ws');
const KEY = process.env.GEMINI_API_KEY;
if (!KEY) { console.error('GEMINI_API_KEY орнатылмаған'); process.exit(1); }
if (!/^AIza/.test(KEY)) console.warn('ЕСКЕРТУ: кілт AIza… түрінде емес. Gemini Developer API үшін Google AI Studio-дан алынған кілт қажет, әйтпесе 401 қатесі шығады.');
let MODELS = process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL] : ['gemini-3.8-flash'], LIVE = process.env.GEMINI_LIVE_MODEL || '';
// Модель атаулары тез ескіреді: іске қосылғанда қолжетімді модельдерді өзі таңдайды (ListModels)
let picks = 0;
async function pickModels() {
  let ok = false;
  try {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': KEY } });
    const jj = await r.json(); ok = r.ok; if (!r.ok) console.error('Gemini кілті / ListModels қатесі:', r.status, (jj.error && jj.error.message) || ''); const list = jj.models || [], nm = m => m.name.replace('models/', ''), can = (m, k) => (m.supportedGenerationMethods || []).includes(k);
    const num = (a, b) => b.localeCompare(a, 'en', { numeric: true });
    const flash = list.filter(m => can(m, 'generateContent') && /^gemini-[\d.]+-flash/.test(nm(m)) && !/image|tts|audio|live|robotics|computer|exp/.test(nm(m))).map(nm)
      .sort((a, b) => (/lite/.test(b) - /lite/.test(a)) || num(a, b));      // lite алдымен: жылдамырақ, тегін квотасы үлкенірек
    if (flash.length) MODELS = process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL, ...flash.slice(0, 2)] : flash.slice(0, 3);
    if (!LIVE) { const l = list.filter(m => can(m, 'bidiGenerateContent')).map(nm).sort(num); LIVE = l.find(x => /native-audio/.test(x)) || l[0] || ''; }
  } catch (e) { console.error('ListModels қатесі:', e.message); }
  if (!ok && ++picks < 8) setTimeout(pickModels, 15000);   // суық старт кезінде желі әлі дайын болмауы мүмкін: қайталап көреді
  console.log('Chat модельдері:', MODELS.join(', '), '| Live:', LIVE || '(табылмады)');
}
const PORT = process.env.PORT || 3000, API = 'https://generativelanguage.googleapis.com/v1beta/models/';
const PID = process.env.FIREBASE_PROJECT_ID; let jose, JWKS;   // PID орнатылса, барлық /api Firebase токенін талап етеді
async function verify(t, ip) {
  if (!PID) return { uid: 'ip:' + (ip || 'anon') };
  jose = jose || await import('jose');
  JWKS = JWKS || jose.createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
  const { payload } = await jose.jwtVerify(t, JWKS, { issuer: 'https://securetoken.google.com/' + PID, audience: PID });
  return { uid: payload.sub };
}
const who = async req => { try { return await verify((req.headers.authorization || '').replace(/^Bearer /, ''), ipOf(req)); } catch (e) { console.error('Auth қатесі:', e.code || e.message, '(FIREBASE_PROJECT_ID=' + PID + ')'); throw e; } };
const SYS = 'Сен Zere — Qazart платформасының қазақ тіліндегі AI көмекшісісің. Әрдайым таза, әдемі қазақ тілінде жауап бер (пайдаланушы басқа тілді сұраса ғана ауыстыр). Жауабың қысқа, нақты және достық болсын: 1–4 сөйлем. Дауыстық сөйлесуге арналған, сондықтан markdown, тізім, жұлдызша және эмодзи қолданба. Сандар мен қысқартуларды сөзбен жаз. Қазақ тілі, аударма, шежіре, бизнес және медиа тақырыбында көмектес.';
const SYS_RU = 'Ты — Zere, ИИ-помощник платформы Qazart. Всегда отвечай на русском языке (если пользователь не просит другой). Отвечай кратко и дружелюбно: 1–4 предложения. Без markdown, списков, звёздочек и эмодзи, потому что ответы озвучиваются. Числа и сокращения пиши словами. Помогай с казахским языком, переводом, бизнесом и медиа.';
const SYS_EN = 'You are Zere, the AI assistant of the Qazart platform. Always reply in English unless asked otherwise. Keep answers short and friendly: 1-4 sentences. No markdown, lists, asterisks or emoji because replies are read aloud. Write numbers and abbreviations as words. Help with the Kazakh language, translation, business and media.';
const sysFor = l => l === 'ru' ? SYS_RU : l === 'en' ? SYS_EN : SYS;

// Қорғаныс: IP бойынша минутына лимит + тәулік бойынша жалпы лимит
const hits = new Map(); let day = { d: '', n: 0 };
const ipOf = r => (r.headers['x-forwarded-for'] || r.socket.remoteAddress || '').split(',')[0].trim();
function limited(ip, max) { const n = Date.now(), a = (hits.get(ip) || []).filter(t => n - t < 6e4); a.push(n); hits.set(ip, a); return a.length > max; }
function capped() { const d = new Date().toISOString().slice(0, 10); if (day.d !== d) day = { d, n: 0 }; return ++day.n > (+process.env.DAILY_CAP || 2000); }

const CORS = { 'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json', ...CORS }); res.end(JSON.stringify(obj)); };
const body = (req, max = 1e5) => new Promise((ok, no) => { let b = ''; req.on('data', c => { b += c; if (b.length > max) { no(new Error('big')); req.destroy(); } }); req.on('end', () => ok(b)); });
const RETRY = [404, 429, 500, 503];
async function gen(payload) {
  let last;
  for (const m of MODELS.slice()) {                     // бір модельдің квотасы бітсе, келесісіне көшеді
    const r = await fetch(API + m + ':generateContent', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY }, body: JSON.stringify(payload) });
    last = { code: r.status, data: await r.json() };
    if (!RETRY.includes(r.status)) { if (r.status === 200) MODELS = [m, ...MODELS.filter(x => x !== m)]; return last; }
  }
  return last;
}


const server = http.createServer(async (req, res) => {
  try {
    const ip = ipOf(req), U = req.url.split('?')[0];
    if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
    if (U === '/api/health') return send(res, 200, { ok: true, version: '1.4', models: MODELS, live: LIVE, auth: !!PID, keyType: /^AIza/.test(KEY) ? 'aistudio' : 'other' });
    if (U === '/api/chat' && req.method === 'POST') {
      let u; try { u = await who(req); } catch (e) { return send(res, 401, { error: 'Кіру қажет' }); }
      if (limited(u.uid, +process.env.CHAT_PER_MIN || 20) || capped()) return send(res, 429, { error: 'Лимит таусылды, сәлден кейін қайталаңыз' });
      const j = JSON.parse(await body(req));
      const contents = (Array.isArray(j.contents) ? j.contents : []).slice(-16).map(m => ({ role: m.role === 'model' ? 'model' : 'user', parts: [{ text: String(m.parts && m.parts[0] && m.parts[0].text || '').slice(0, 2000) }] }));
      if (!contents.length) return send(res, 400, { error: 'Бос сұрау' });
      if (req.url.includes('stream=1')) {                 // ағынмен жауап: мәтін бірден көрінеді, кідіріс азаяды
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', ...CORS });
        const payload = JSON.stringify({ systemInstruction: { parts: [{ text: sysFor(j.lang) }] }, contents, generationConfig: { temperature: 0.7 } });
        for (const m of MODELS.slice()) {
          const r = await fetch(API + m + ':streamGenerateContent?alt=sse', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY }, body: payload });
          if (!r.ok) {
            if (RETRY.includes(r.status) && m !== MODELS[MODELS.length - 1]) continue;
            const e = await r.json().catch(() => ({})); res.write('data: ' + JSON.stringify({ error: ((e.error && e.error.message) || 'Gemini') + ' (' + r.status + ')' }) + '\n\n'); break;
          }
          MODELS = [m, ...MODELS.filter(x => x !== m)];
          const dec = new TextDecoder(); let buf = '';
          for await (const ch of r.body) {
            buf += dec.decode(ch, { stream: true }); let i;
            while ((i = buf.indexOf('\n')) >= 0) {
              const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
              if (!line.startsWith('data:')) continue;
              try { const j = JSON.parse(line.slice(5)); const t = ((j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || []).map(p => p.text || '').join(''); if (t) res.write('data: ' + JSON.stringify({ t }) + '\n\n'); } catch (e) {}
            }
          }
          break;
        }
        return res.end();
      }
      const { code, data } = await gen({ systemInstruction: { parts: [{ text: sysFor(j.lang) }] }, contents, generationConfig: { temperature: 0.7 } });
      return send(res, code, data);
    }
    const LN = { kk: 'Kazakh', ru: 'Russian', en: 'English', tr: 'Turkish' };
    if (U === '/api/translate' && req.method === 'POST') {
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
      } else if (j.audio) {
        const mime = String(j.mime || 'audio/webm').split(';')[0];
        if (!/^audio\/(webm|mp4|ogg|wav|mpeg|aac|x-m4a)$/.test(mime) || typeof j.audio !== 'string' || j.audio.length > 3.5e6 || !/^[A-Za-z0-9+\/=]+$/.test(j.audio)) return send(res, 400, { error: 'Аудио қате немесе тым үлкен' });
        parts.push({ inlineData: { mimeType: mime, data: j.audio } });
        task = 'Transcribe the speech in this audio' + (from ? ' (language: ' + from + ')' : '') + ' and translate it into ' + to + '.';
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
    if (U === '/firebase-config.js') {   // Render-де бұл файл ұсынылмаса, Firebase қосылмай, токен жоқ болып 401 шығады
      let f = 'window.FIREBASE_CONFIG = null;'; try { f = fs.readFileSync(path.join(__dirname, 'firebase-config.js'), 'utf8'); } catch (e) {}
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-cache' }); return res.end(f);
    }
    if (U === '/' || U === '/index.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(fs.readFileSync(path.join(__dirname, 'index.html'))); }
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
      let u; try { u = await verify(String(m.auth), ipOf(req)); } catch (e) { return ws.close(1008, 'Кіру қажет'); }
      if (limited('live' + u.uid, 4) || capped()) return ws.close(1013, 'Лимит таусылды');
      if (!LIVE) await pickModels();
      if (!LIVE) return ws.close(1011, 'Live модель табылмады');
      up = new WebSocket('wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=' + KEY);
      up.on('open', () => up.send(JSON.stringify({ setup: { model: 'models/' + LIVE, generationConfig: { responseModalities: ['AUDIO'] }, systemInstruction: { parts: [{ text: sysFor(m.lang) + ({ ru: ' Говори по-русски.', en: ' Speak English.' }[m.lang] || ' Қазақ тілінде сөйле.') }] }, inputAudioTranscription: {}, outputAudioTranscription: {} } })));
      up.on('message', x => { if (ws.readyState === 1) ws.send(x.toString()); });
      up.on('close', (c, r) => ws.close(1000, String(r || '').slice(0, 100)));
      up.on('error', () => ws.close(1011, 'Gemini қосылым қатесі'));
      return;
    }
    if (m.realtimeInput && up && up.readyState === 1) up.send(JSON.stringify({ realtimeInput: m.realtimeInput }));
  });
  ws.on('close', () => { clearTimeout(stop); clearTimeout(authT); if (up) up.close(); });
});
server.listen(PORT, () => console.log('Qazart v1.4: http://localhost:' + PORT));
pickModels();
