# FocusTube

> A study player that notices when you zone out, then quizzes you on what you missed.

FocusTube strips away YouTube's algorithmic rabbit holes, infinite recommended videos, and comments, turning lectures into a deep focus sanctuary with synchronized Pomodoro timers, on-device attention tracking, and AI-powered active recall quizzes.

---

## ✨ Features

- **Clean Stream Player**: Embeds educational YouTube videos and playlists without recommended feeds, sidebar rabbit holes, or comment sections.
- **Pomodoro Timer Synchronization**: Pomodoro timer automatically pauses and resumes in sync with lecture playback.
- **On-Device Attention & Gaze Tracking**: Uses lightweight MediaPipe face detection running locally in the browser to detect when your gaze wanders away from the screen.
- **AI-Powered Active Recall Quizzes**: Leverages Google Gemini (`gemini-2.5-flash`) to generate 8 conceptual multiple-choice recall questions chronologically matched to lecture timestamps.
- **Distraction-Targeted Testing**: If you get distracted during a lecture, FocusTube targets quiz questions specifically to the timestamps you missed.
- **Departure & Focus Guards**: Non-blocking exit-intent warning banner, tab title notifications ("⚠️ Come back to your session!"), and optional browser departure alerts.
- **Study Queue & Curriculums**: Support for multi-lecture playlists and custom study queues with seamless transitions.

---

## 🔒 Privacy First

- **Camera frames never leave your browser and are never saved**: All facial feature and attention telemetry is computed 100% on-device using WebAssembly/WebGL.
- **Zero recording or image transmission**: The application contains no `MediaRecorder`, `toDataURL`, `toBlob`, or stream capture mechanisms.
- **Zero Client-Side Secrets**: All third-party API credentials (`YOUTUBE_API_KEY`, `GEMINI_API_KEY`) run strictly inside serverless backend functions in `/api` and are never exposed to the client.

---

## 🚀 Quickstart & Setup

### 1. Clone the repository
```bash
git clone https://github.com/Krishna911-cyber/focustube.git
cd focustube
```

### 2. Install dependencies
```bash
npm install
```

### 3. Configure environment variables
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```

Edit `.env.local` to provide your API keys (optional; demo lectures run with offline fallbacks):
```env
YOUTUBE_API_KEY=your_key_here
GEMINI_API_KEY=your_key_here
SUPABASE_URL=your_url_here
SUPABASE_ANON_KEY=your_anon_key_here
```

### 4. Run locally
Run with the included zero-dependency local development server:
```bash
npm run dev
```
Or run using the Vercel CLI:
```bash
vercel dev
```

Open [http://localhost:8000](http://localhost:8000) (or `http://localhost:3000` with Vercel CLI) in your browser.

---

## 🌐 Deploy on Vercel

FocusTube is architected for zero-configuration deployment on [Vercel](https://vercel.com).
The root directory serves static HTML/CSS/JS assets, while `/api/*.js` functions deploy automatically as Node.js serverless functions. **No build command or framework compilation is required.**

### 1. Import repository into Vercel
Connect your GitHub repository to Vercel via the Vercel Dashboard or CLI:
```bash
vercel
```

### 2. Set Environment Variables
In the Vercel project settings (**Settings → Environment Variables**), add the following:
- `YOUTUBE_API_KEY`: Google Cloud YouTube Data API v3 key
- `GEMINI_API_KEY`: Google AI Studio Gemini API key
- `SUPABASE_URL` *(optional)*: Supabase database URL
- `SUPABASE_ANON_KEY` *(optional)*: Supabase anonymous client key

### 3. Deploy
```bash
vercel --prod
```

---

## 🧪 Testing

Run automated tests covering API endpoints, rate limiting, playlist handling, distraction matching, and pre-departure alerts:
```bash
npm test
```
