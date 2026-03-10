# MLS Queen

Electron desktop app for **Canadian MLS Feeds Compliance** (2026). Answers questions from your compliance documents and links to official resources. Optional Google sign-in restricts access to a specific email domain.

## Data sources

The chatbot and DOCS panel use **only**:

- **canadian_mls.txt** — Full compliance guide (plain text)
- **CANADIAN_MLS.pdf** — Same content (PDF)

Place one or both in the project root (same folder as `main.js`). The app parses them into sections and matches your questions by keywords.

## Run

```bash
npm install
npm start
```

## Optional: Google Auth (domain restriction)

To require sign-in and allow only users from a specific domain (e.g. `@yourcompany.com`):

1. Create OAuth 2.0 credentials (Desktop app) in [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. Add redirect URI: `http://127.0.0.1:3099/oauth2/callback`
3. Copy `.env.example` to `.env` and set:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `ALLOWED_DOMAIN` (e.g. `yourcompany.com`)

If these are not set, the app runs without sign-in (useful for local use).

## Features

- **Chat** — Ask about provinces, boards, DDF, VOW, RECO, PIPEDA, etc. Answers and links come from the parsed TXT/PDF.
- **DOCS** — Browse the same content by section (DOCS button in the toolbar).
- **Dark / light theme** — Toggle in the bottom toolbar.

## Tech

- **Electron** — Desktop app
- **Data** — `canadian_mls.txt` and `CANADIAN_MLS.pdf` (parsed into sections; keyword matching for chat)
- **Auth** — Google OAuth 2.0 with PKCE; domain check; session stored in app userData

## Disclaimer

This app is a reference tool only. It does not constitute legal or compliance advice. Confirm current requirements with your boards and regulators.
