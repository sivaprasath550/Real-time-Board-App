# Board — Collaborative Whiteboard & Presentation Suite

A real-time, AI-powered collaborative whiteboard with live cursors, slide decks, PDF export, and email invitations.

## Tech Stack
- **Frontend**: Next.js 16, React 19, TailwindCSS 4
- **Database**: Prisma + SQLite (dev) / PostgreSQL (prod)
- **AI**: Google Gemini API
- **Email**: Nodemailer (Ethereal sandbox / SMTP)
- **Realtime**: BroadcastChannel + Server-Sent polling

## Features
- Multi-page slide decks with per-slide background colors
- Real-time multiplayer cursors (cross-network via polling)
- AI Mindmap Explosion, Semantic Grouping, Ghost Collaborators
- Sketch-to-UI (Gemini Vision)
- Voice-to-Canvas (SpeechRecognition)
- Image upload onto canvas
- PDF export of all slides
- Email invitations with Accept/Decline buttons

## Quick Start (Development)

```bash
# 1. Clone & install
git clone https://github.com/sivaprasath550/Real-time-Board-App
cd Real-time-Board-App
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env — add your GEMINI_API_KEY at minimum

# 3. Set up database
npx prisma generate
npx prisma migrate deploy

# 4. Start dev server
npm run dev
```

## Environment Variables

See `.env.example` for full reference.

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` |  | SQLite path or PostgreSQL URL |
| `GEMINI_API_KEY` |  | Google AI Studio key |
| `NEXTAUTH_URL` |  | Public URL of the app |
| `AUTH_COOKIE_NAME` |  | Cookie name for sessions |
| `SMTP_HOST` |  | SMTP server (leave empty for Ethereal sandbox) |

## Deployment (Railway — Recommended)

Railway supports long-lived Node.js servers with persistent filesystems — ideal for SQLite.

1. Push this repo to GitHub
2. Go to [railway.app](https://railway.app)  New Project  Deploy from GitHub
3. Add environment variables (copy from `.env.example`)
4. Railway auto-detects Next.js and runs `npm run build && npm start`
5. Add a **Volume** mount at `/app/prisma` for the SQLite database file

## Deployment (Vercel — Requires PostgreSQL)

Vercel is serverless, so you must switch to PostgreSQL:

1. Create a free database at [neon.tech](https://neon.tech)
2. Copy the connection string to `DATABASE_URL` in Vercel env vars
3. Change `provider = "sqlite"` to `provider = "postgresql"` in `prisma/schema.prisma`
4. Push to GitHub and import the repo on [vercel.com](https://vercel.com)
5. Set all env vars in Vercel dashboard  Settings  Environment Variables
