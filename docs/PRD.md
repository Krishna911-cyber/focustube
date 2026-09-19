FocusTube: Product Requirements Document
Version: 1.0 (Hackathon MVP) Status: Draft One-line pitch: A study player that knows when you zoned out and helps you recover what you missed.

1. Overview
FocusTube is a web app for studying from YouTube videos without the usual distractions. It wraps an embedded YouTube player in a controlled study interface with a Pomodoro timer, detects when the learner loses focus (tab switch, window blur, looking away), and records where in the video it happened. After the session, it shows a summary with click-to-replay links to the missed moments and, optionally, a recall quiz targeted at those moments.

2. Problem Statement
Students who learn from YouTube face two problems:

The platform is built to distract. Recommendations, autoplay, and the homepage feed pull people away from the lesson.
Nobody knows when they zoned out. Existing focus tools (Forest, Pomodoro timers, tab blockers) measure whether you were focused, not what content you missed. The learner finishes a video and has silent gaps in understanding.
3. Goals and Non-Goals
Goals
Provide a distraction-free YouTube study environment with no recommendations.
Detect loss of focus and auto-pause the video and timer.
Link every distraction to a video timestamp so the learner can replay what they missed.
Deliver a reliable, polished 2-minute live demo.
Non-Goals (for the hackathon)
Chrome extension and website blocking
User accounts, login, or cloud sync
Dashboards, weekly graphs, streaks
True gaze tracking or emotion detection
Support for arbitrary YouTube videos with automatic transcripts
Mobile-optimized experience
4. Target Users
Persona	Description	Need
Student (primary)	High school or college student watching lecture or tutorial videos	Stay on task and not lose track of what was covered
Self-learner	Person learning coding, languages, or skills from online courses	Retain more from each video
5. User Stories
As a learner, I want to paste or pick a video so I can start a study session quickly.
As a learner, I want a Pomodoro timer next to the video so I study in structured blocks.
As a learner, I want the video to pause automatically when I leave the tab so I don't miss content.
As a learner, I want to know exactly which moments I missed so I can rewatch only those.
As a learner, I want a quiz on the parts I missed so I can check I actually understood them.
As a learner, I want no video recommendations so I'm not tempted to wander.
6. Core User Flow
Landing page → Pick/paste video → Start session (camera permission optional)
      ↓
Study room: video + Pomodoro timer + focus status
      ↓
Focus lost? → auto-pause, log timestamp, show warning → user returns → resume
      ↓
Session ends (timer done or user stops)
      ↓
Summary: focus score, distraction list with replay buttons, (optional) quiz
7. Functional Requirements
Priority: P0 = must ship, P1 = wow factor (pick one or two), P2 = only if time remains.

7.1 Landing and Video Selection
ID	Requirement	Priority
F-1	Landing page with product pitch and "Start studying" button	P0
F-2	Video picker with 1-2 curated demo videos (embed-verified)	P0
F-3	Paste-a-URL input that extracts the video ID, validates it via oEmbed, and handles non-embeddable videos	P1
F-3b	Recent custom videos stored in localStorage	P2
F-4	No search, no homepage feed, no "next video" queue	P0

7.2 Study Room
ID	Requirement	Priority
F-5	Embed video with the YouTube IFrame Player API (youtube-nocookie.com)	P0
F-6	Player configured with rel=0, modestbranding=1, iv_load_policy=3, fs=0	P0
F-7	Custom overlay shown immediately on pause and on video end to hide YouTube's suggestions	P0
F-8	Pomodoro timer beside the video: 25 min study / 5 min break, hardcoded	P0
F-9	Start, pause, and end-session controls	P0
F-10	Custom fullscreen mode that keeps the timer visible	P2
7.3 Focus Detection
ID	Requirement	Priority
F-11	Detect tab switch or minimize via visibilitychange	P0
F-12	Detect window focus loss via blur / focus	P0
F-13	On focus loss: pause video and timer, show "You left the session" warning	P0
F-14	Log each distraction with: type, video timestamp, wall-clock time, duration away	P0
F-15	Face-present / head-turned detection using MediaPipe (runs locally in browser)	P1
F-16	Manual "camera off" toggle and fallback if camera or model fails	P1 (required if F-15 ships)
F-17	Debounce: ignore focus events shorter than ~1 second to avoid false positives	P0
7.4 Session Summary
ID	Requirement	Priority
F-18	Show total study time, focused time, time away, distraction count	P0
F-19	Show focus score (%)	P0
F-20	List each distraction as a video timestamp (e.g. "4:12")	P0
F-21	Click-to-replay: each timestamp seeks the player to ~5 seconds before the moment	P0
F-22	Save the last session summary in localStorage	P2
7.5 AI Recall Quiz
ID	Requirement	Priority
F-23	Load a pre-bundled transcript for each demo video	P1
F-24	For each distraction timestamp, take the transcript segment (about ±60 seconds) and generate 1-2 multiple-choice questions via an LLM API	P1
F-25	Quiz UI with immediate right/wrong feedback and a link back to the replay moment	P1
F-26	Pre-generate and cache quiz output for demo videos so the demo never depends on live API latency	P1
8. Focus Score Definition
Focus Score = Focused Time / Total Session Time × 100
Focused Time = Total Session Time − Time Away (tab hidden + window blurred + face away)
Example for a 25-minute session:

Study time:      25:00
Focused:         21:42
Looking away:     2:31
Away from tab:    0:47
Focus Score:      87%
9. Data Model (client-side only)
{
  "session": {
    "videoId": "string",
    "startedAt": "ISO timestamp",
    "endedAt": "ISO timestamp",
    "pomodoro": { "studyMin": 25, "breakMin": 5 },
    "distractions": [
      {
        "type": "tab_hidden | window_blur | face_away",
        "videoTime": 252,
        "wallTime": "ISO timestamp",
        "durationSec": 14
      }
    ]
  }
}
10. Technical Approach
Area	Choice	Notes
Frontend	Plain HTML, CSS, JavaScript	React/TypeScript/Tailwind only if the team is already fast with them
Video	YouTube IFrame Player API	Use getCurrentTime(), seekTo(), and onStateChange
Timer	JS setInterval with timestamp math	Avoid drift by comparing against Date.now()
Focus detection	Page Visibility API, window.blur / focus	
Camera	MediaPipe Face Landmarker / Face Detection (in browser)	No video leaves the device
Quiz	LLM API called once per demo video, output cached	Small serverless function or pre-generated JSON
Storage	localStorage	No backend required
Hosting	Static hosting (Vercel, Netlify, GitHub Pages)	
Architecture
            ┌────────────────────────────┐
            │       FocusTube (web)       │
            ├─────────────┬──────────────┤
            │ YouTube     │  Pomodoro    │
            │ IFrame API  │  Timer       │
            └──────┬──────┴──────┬───────┘
                   │             │
                   ▼             ▼
              ┌───────────────────────┐
              │     Focus Tracker     │◄── visibilitychange / blur
              │  (events + timestamps)│◄── MediaPipe (optional)
              └───────────┬───────────┘
                          ▼
              ┌───────────────────────┐
              │   Session Summary     │──► Replay links
              │                       │──► Recall quiz (optional)
              └───────────────────────┘
11. Non-Functional Requirements
Privacy: Camera processing is fully local. Ask for permission clearly, explain why, and make it optional. No video or images are stored or transmitted.
Reliability: The demo must work without the camera. Every P1 feature needs a fallback or off switch.
Performance: Face detection should run at a modest frame rate (about 5-10 FPS) to keep the page responsive.
Compatibility: Latest desktop Chrome is the target. Test in Edge and Firefox if time allows.
Accessibility: Keyboard-operable controls, sufficient color contrast, and a text label for every icon.
12. Success Metrics
Hackathon success

Live demo completes in under 2 minutes with no failures
Judges understand the pitch in one sentence
The replay-the-missed-moment feature is visibly memorable
Product metrics (post-hackathon)

Session completion rate
Average focus score per session
Percentage of users who use replay after a session
Quiz completion rate
13. Risks and Mitigations
Risk	Likelihood	Mitigation
Some videos block embedding	Medium	Test and pre-select demo videos
No official transcript API	High	Bundle transcripts for the demo videos
Camera detection is flaky in live lighting	High	Rehearse in the same setup, keep the manual toggle, lead with the tab-detection demo
Scope creep	High	Hold the Non-Goals list firmly, and move extras to "Future Work"
YouTube policy on altering the player	Low (demo) / Medium (public launch)	Use overlays around the player only, and review the API terms before a public release
Ads or brief suggestion flashes in the embed	Medium	Show the overlay immediately on pause and on end, and acknowledge the limitation
Browser autoplay rules block video start	Low	Always start playback from a user click
14. Milestones (24-hour plan)
Hours	Deliverable
0-4	Layout, YouTube player, Pomodoro timer
4-8	Tab and window detection, auto-pause, timestamp logging
8-14	Session summary with focus score and replay links
14-22	Pick one: MediaPipe attention detection, or the AI recall quiz
22-24	Polish, bug fixes, demo rehearsal, pitch slides
15. Demo Script (about 2 minutes)
Hook (10s): "We've all watched a 20-minute lecture and realized we absorbed none of it."
Start a session (15s): Pick a video, start the timer.
Trigger distraction (20s): Switch tabs. The video pauses, a warning appears.
Look away (15s, if camera shipped): The video pauses again.
End session (10s): Show the summary with focus score.
Payoff (30s): Click a timestamp to replay the missed moment. Show the quiz on those moments if built.
Close (10s): "A study player that knows when you zoned out and helps you recover what you missed."
16. Future Work
Chrome extension for real tab restrictions and strict mode
Website blocking during sessions
Support for any YouTube video with automatic transcript retrieval
Configurable Pomodoro cycles and long breaks
Accounts, dashboard, weekly graphs, study streaks
Spaced-repetition review of missed moments
Notes and highlights synced to video timestamps
17. Open Questions
What is the hackathon's theme and time limit? (This may change which P1 feature to pick.)
What is the team size and skill mix? (This decides the task split and whether to use React.)
Which demo videos are best, in terms of embeddability, length, and topic clarity?
Camera or quiz: which one is the wow feature for this specific audience?
Which LLM provider and API key is available for the quiz?