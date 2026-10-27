# Typing Panda 🐼

A playful typing practice app built with React, TypeScript, Vite, Firebase Authentication and Cloud Firestore.

## Current starter features

- Responsive premium playful UI with a CSS-built panda mascot
- Typing test with live WPM, accuracy, errors and timer
- 15 / 30 / 60 / 120 second test presets
- Local history and personal best saved in the current browser
- Optional Google sign-in integration (requires Firebase web app config)
- Firestore result save/load scaffolding
- Daily/all-time leaderboard UI scaffold
- GitHub-ready project structure and Firebase Hosting support

## 1. Install and run

```bash
npm install
npm run dev
```

## 2. Configure Firebase

1. Open [Firebase Console](https://console.firebase.google.com/project/typing-panda/overview).
2. In Project settings → General → Your apps, create a **Web app** if you have not already.
3. Copy its Firebase web configuration into a local `.env` file based on `.env.example`.
4. In Authentication → Settings → Authorized domains, ensure `localhost` and your eventual Firebase Hosting domain are allowed.
5. Configure Firestore security rules before enabling online score saving or a public leaderboard.

The Firebase browser configuration is not a service-account secret, but it must be paired with appropriate Authentication and Firestore security rules. Never commit service-account keys or private credentials.

## 3. Build

```bash
npm run build
```

Vite outputs the production site to `dist/`.

## 4. Firebase Hosting deployment

After reviewing the app and setting Firestore rules, run from this project folder:

```bash
firebase login
firebase use --add
firebase init hosting
```

Choose the existing `typing-panda` Firebase project, use `dist` as the public directory, configure it as a single-page app, and do not overwrite the existing source files. Then run:

```bash
npm run build
firebase deploy --only hosting
```

## Notes / next hardening steps

- Public leaderboard needs server-trusted score validation; client-submitted WPM should not be trusted as-is.
- Add Firestore rules that restrict a signed-in user to their own records and expose only safe leaderboard fields.
- Daily ranking currently has a UI and query scaffold, not a complete trusted daily-ranking backend.
- Guest results are stored locally in the browser; they are not automatically synced when a guest later signs in yet.
