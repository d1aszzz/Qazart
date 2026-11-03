# Qazart ✻

Қазақ тілін бизнесте, медиада және технологияда көтеруге арналған AI платформасының прототипі.
Мобильді интерфейс, тақырыбы: қараңғы режим, **Zere AI** көмекшісі.

## Мүмкіндіктері
- 🏠 Басты бет: дауыстық және камерамен аударма
- 🎙️ Zere AI: мәтінмен, дауыспен және нақты уақыттағы (Gemini Live) сөйлесу
- ⚙️ Баптаулар: тіл (қазақша / русский / English), дауыс; қараңғы/ашық тақырып түймесі Qazart логотипінің жанында

## Іске қосу
```bash
npm install
GEMINI_API_KEY=your_key node server.js
# http://localhost:3000
```
Windows (PowerShell): `$env:GEMINI_API_KEY="your_key"; node server.js`

Кілтті [Google AI Studio](https://aistudio.google.com/) арқылы алыңыз. **Кілтті ешқашан репозиторийге салмаңыз.**

## Firebase (аккаунттар және деректер)
1. [Firebase Console](https://console.firebase.google.com/) → жоба жасаңыз → **Authentication** → Sign-in method → **Email/Password** қосыңыз.
2. **Firestore Database** жасаңыз, **Rules** бөліміне `firestore.rules` мазмұнын қойып, Publish басыңыз.
3. Project settings → Your apps → Web (`</>`) қосып, `firebaseConfig` мәндерін `firebase-config.js` файлына жазыңыз.
4. Authentication → Settings → **Authorized domains** тізіміне сайт доменін қосыңыз (мысалы `ваш-ник.github.io`, Render домені).
5. Серверде `FIREBASE_PROJECT_ID=жоба-id` орнатыңыз: сонда `/api/*` тек кірген пайдаланушыларға жұмыс істейді.

Логин `логин@users.qazart.app` түріндегі ішкі email-ге айналады, сондықтан құпиясөзді email арқылы қалпына келтіру жұмыс істемейді.

## Zere AI және API кілті
Gemini кілті **тек серверде** (`GEMINI_API_KEY`) сақталады, пайдаланушылар ештеңе енгізбейді. Сондықтан Zere AI, жаңалықтар мен дауыс тек `server.js` арқылы жұмыс істейді; GitHub Pages сияқты статикалық хостингте интерфейс ашылады, бірақ AI қосылмайды.

## Қауіпсіздік туралы
- Серверде IP бойынша минуттық лимит және тәуліктік лимит (`DAILY_CAP`) бар.
- `firebase-config.js` толтырылса, аккаунттар Firebase Auth-та, деректер Firestore-да сақталады, ал сервер әр сұраудағы ID токенді тексереді. Толтырылмаса, браузерлік (localStorage) режим қолданылады, ол тек прототипке жарайды.
- Шежіре деректері жалпы нұсқалар бойынша жасалған, тарихи дереккөзбен салыстырыңыз.

## Телефонда жылдам жұмыс істеу үшін (деплой схемасы)
Render-дің тегін тарифі 15 минут белсенділік болмаса «ұйықтайды», ал оянуы 30–60 секунд алады. Сондықтан:
1. **Интерфейсті** GitHub Pages-ке қойыңыз (Settings → Pages): ол ешқашан ұйықтамайды, бет пен логин лезде ашылады.
2. **API-ді** (`server.js`) Render-ге қойыңыз, **Frankfurt** аймағын таңдаңыз. Environment: `GEMINI_API_KEY`, `FIREBASE_PROJECT_ID`, `ALLOWED_ORIGIN=https://ваш-ник.github.io`.
3. `firebase-config.js` ішінде `window.QAZART_API = "https://ваш-сервис.onrender.com"` деп жазыңыз.
4. Қосымша: [UptimeRobot](https://uptimerobot.com) арқылы `https://ваш-сервис.onrender.com/api/health` адресін 5 минут сайын тексертіп қойсаңыз, сервер ұйықтамайды.

Gemini модельдері тез ескіреді: сервер іске қосылғанда қолжетімді модельдерді өзі таңдайды (журналда `Chat модельдері: …` жолы). Қолмен таңдау үшін `GEMINI_MODEL` және `GEMINI_LIVE_MODEL` орнатыңыз.
