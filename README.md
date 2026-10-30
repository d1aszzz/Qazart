# Qazart ✻

Қазақ тілін бизнесте, медиада және технологияда көтеруге арналған AI платформасының прототипі.
Мобильді интерфейс, тақырыбы: қараңғы режим, **Zere AI** көмекшісі.

## Мүмкіндіктері
- 🏠 Басты бет: «Күн сөзі» және мини-квиз
- 📰 Жаңалықтар: Қазақстанның соңғы жаңалықтары (Gemini + Google Search), дереккөздері көрсетіледі
- 🎙️ Zere AI: мәтінмен, дауыспен және нақты уақыттағы (Gemini Live) сөйлесу
- 🧬 Шежіре: үш жүздің интерактивті ағашы
- ⚙️ Баптаулар: логин/құпиясөз, қараңғы/ашық тақырып

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

## Статикалық демо (GitHub Pages)
`index.html` серверсіз де жұмыс істейді: «Баптаулар» бөлімінде өз Gemini кілтіңізді енгізесіз (ол тек браузерде сақталады).
Бұл режим тек көрсету үшін. Ортақ кілт жариялау үшін `server.js` қолданыңыз (Render, Railway, VPS).

## Қауіпсіздік туралы
- Серверде IP бойынша минуттық лимит және тәуліктік лимит (`DAILY_CAP`) бар.
- `firebase-config.js` толтырылса, аккаунттар Firebase Auth-та, деректер Firestore-да сақталады, ал сервер әр сұраудағы ID токенді тексереді. Толтырылмаса, браузерлік (localStorage) режим қолданылады, ол тек прототипке жарайды.
- Шежіре деректері жалпы нұсқалар бойынша жасалған, тарихи дереккөзбен салыстырыңыз.
