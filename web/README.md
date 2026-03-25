# Compliance Bot — Web App

Compliance docs for **Canada**, **USA**, **Puerto Rico**, and **Mexico**. The bot answers from the loaded documentation for each jurisdiction.

## Run locally

```bash
cd web
npm install
cp .env.example .env
# Edit .env and add GEMINI_API_KEY or OPENAI_API_KEY for AI answers
npm start
```

Open http://localhost:3000

## Features

- **Upload**: Choose region (any of the four jurisdictions), select one or more files (TXT, PDF, MD). Uploaded docs replace existing docs for that region.
- **Chat**: Ask a question; answers use the compliance documentation. Requires `OPENAI_API_KEY` (or configured provider) in `.env`.
- **DOCS**: Browse sections by region. Same content as used for Chat.

## Deploy as a website

- Run the server on your host (Node.js) and expose the port (e.g. reverse proxy to `http://localhost:3000`).
- For production, use HTTPS, set `PORT`, and keep API keys in environment variables (never in the repo).
