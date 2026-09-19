# FocusTube Design System & Visual Specification

> Extracted directly from the official Stitch project: **focustube1** (`projects/598841545969436388`).  
> Theme: **Cognitive Focus System**  
> Visual Style: **Modern Minimal Dark & High-Precision Studio Equipment**  
> Target Persona: Self-directed learners, researchers, and engineers seeking deep cognitive flow devoid of algorithmic distractions.

---

## 1. Design Philosophy & Aesthetic Core

The FocusTube interface treats educational video not as entertainment, but as high-precision scientific apparatus or a dynamic reference manual. The aesthetic is **Modern Minimal Dark**:
- **Zero Algorithmic Noise**: Algorithmic recommendations, social vanity metrics, feeds, and comments are structurally excluded.
- **Tonal Layering over Drop Shadows**: Surfaces step up in luminance to indicate elevation rather than using harsh, muddy shadows.
- **Micro-Luminance & Chromatic Accents**: Expansive dark navy fields paired with targeted, purposeful glows (Electric Indigo for active focus, Emerald Green for validated flow, Amber for attention alerts).
- **Clinical Calm**: Fluid transitions, monospace telemetry, and restrained typography engineered to eliminate eye fatigue and sustain cognitive endurance during multi-hour deep study blocks.

---

## 2. Color Palette & Token System

### Core Palette

| Role | Token / Name | Hex Code | Purpose / Usage |
| :--- | :--- | :--- | :--- |
| **Canvas Base** | `background` / `surface` | `#101321` | Base viewport canvas, deep near-black navy to reduce retinal fatigue |
| **Canvas Low** | `surface-container-lowest` | `#0A0D1B` | Deepest recessed containers, video frame backing, code blocks |
| **Surface Tier 1** | `surface-container-low` | `#181B29` | Major content cards, hero cards, review rows, modal backdrops |
| **Surface Tier 2** | `surface-container` | `#1C1F2D` | Secondary cards, telemetry panels, transport control docks |
| **Surface Tier 3** | `surface-container-high` | `#262938` | Interactive cards, active navigation pills, button default backgrounds |
| **Surface Tier 4** | `surface-container-highest` | `#313443` | Inactive progress tracks, borders, hovered card states, chip backings |
| **Surface Bright** | `surface-bright` | `#363848` | Chapter bookmark dots, elevated highlights |
| **Primary Accent** | `primary` | `#C0C1FF` / `#6366F1` | Electric Indigo / Lavender. Active timeline playhead, focus indicators, focus glow |
| **Primary Container** | `primary-container` | `#8083FF` | High-emphasis CTA buttons, primary highlights |
| **On-Primary** | `on-primary` | `#1000A9` / `#FFFFFF` | Text on primary buttons (deep contrast or crisp white) |
| **Secondary (Focus)** | `secondary` | `#4AE176` / `#22C55E` | Emerald Green. Gaze locked indicator, active focus streaks, optimal score |
| **Secondary Container** | `secondary-container` | `#00B954` | Correct quiz answers, positive feedback badges |
| **Tertiary (Alert)** | `tertiary` | `#FFB95F` / `#F59E0B` | Amber. Attention lapses, "Looked away" tags, distraction alerts, streak icons |
| **Tertiary Container** | `tertiary-container` | `#CA8100` | Alert badge fills, lapse duration chips |
| **Error / Destructive** | `error` | `#FFB4AB` | Stop / End session hover, critical errors |
| **Text Primary** | `on-surface` | `#E0E1F6` / `#F8FAFC` | High-contrast readable body and display headings |
| **Text Secondary** | `on-surface-variant` | `#C7C4D7` / `#94A3B8` | Subtitles, supporting copy, descriptions |
| **Muted / Outline** | `outline` | `#908FA0` / `#475569` | Timestamps, chapter times, inactive transport buttons |
| **Outline Variant** | `outline-variant` | `#464554` | Subtle borders, timeline buffer tracks, dividers |

### Accent Halos & Ambient Glow Tokens
- **Indigo Focus Glow**: `0 0 24px rgba(99, 102, 241, 0.15)` or `shadow-[0_0_20px_rgba(128,131,255,0.45)]`
- **Emerald Flow Glow**: `0 0 24px rgba(74, 225, 118, 0.12)`
- **Amber Warning Glow**: `0 0 24px rgba(245, 158, 11, 0.15)` / `bg-tertiary/10 blur-2xl`
- **Ambient Canvas Orbs**: Large radial blurred gradient backdrops (`blur-[120px]` to `blur-[140px]`)

---

## 3. Typography Scale & Fonts

### Font Families
- **Primary Interface & Headings**: `'Inter', -apple-system, BlinkMacSystemFont, sans-serif`
- **Telemetry & Monospace**: `'JetBrains Mono', 'SF Mono', Consolas, monospace` (Must use tabular numbers `font-feature-settings: "tnum" 1, "zero" 1`)
- **Iconography**: `'Material Symbols Outlined'` (`opsz: 24`, `wght: 400`, `FILL: 0..1`, `GRAD: 0`) and selected Unicode emojis (`🎯`, `🔥`, `📚`, `🎉`)

### Type Scale

| Token | Font Family | Size | Line Height | Weight | Tracking | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `display-lg` | Inter | 48px | 56px | 600 (SemiBold) | `-0.02em` | Hero landing headlines, session complete headers |
| `display-lg-mobile` | Inter | 32px | 40px | 600 (SemiBold) | `-0.015em` | Mobile hero headers |
| `timer-display` | Inter / Mono | 64px | 68px | 500 (Medium) | `-0.03em` | Primary Pomodoro timer digits, hero focus score % |
| `timer-display-mobile` | Inter / Mono | 40px | 48px | 500 (Medium) | `-0.02em` | Mobile timer readouts, key stat callouts (2.4x) |
| `headline-lg` | Inter | 28px | 36px | 600 (SemiBold) | `-0.01em` | Section titles ("Moments you zoned out", "Quiz") |
| `headline-md` | Inter | 20px | 28px | 600 (SemiBold) | `-0.005em` | Feature card titles, question stem headlines |
| `headline-sm` | Inter | 16px | 24px | 600 (SemiBold) | `0em` | Sub-section titles, video title in player HUD |
| `body-lg` | Inter | 16px | 26px | 400 (Regular) | `0em` | Hero lead paragraphs, primary narrative copy |
| `body-md` | Inter | 14px | 22px | 400 (Regular) | `0em` | Standard body text, feature descriptions |
| `body-sm` | Inter | 12px | 18px | 400 (Regular) | `0em` | Metadata, timestamps, chapter notes, footnotes |
| `label-lg` | Inter | 14px | 20px | 500 (Medium) | `+0.01em` | Primary button labels, high-level navigation tabs |
| `label-md` | Inter | 12px | 16px | 500 (Medium) | `+0.02em` | Secondary buttons, telemetry badges, tag pills |
| `label-sm` | Inter | 11px | 14px | 600 (SemiBold) | `+0.04em` | Micro-badges, uppercase status indicators, HUD pills |

---

## 4. Spacing & Spatial Rhythm

All spatial increments adhere strictly to a **4px modular grid**:

| Token | Rem Value | Pixel Value | Typical Application |
| :--- | :--- | :--- | :--- |
| `space-xs` | `0.25rem` | 4px | Micro-gaps, status dot margins, tag internal padding |
| `space-sm` | `0.5rem` | 8px | Button inline gaps, icon-to-label spacing, compact list item padding |
| `space-md` | `1rem` | 16px | Standard component padding, control tray gaps, card inner padding (compact) |
| `space-lg` | `1.5rem` | 24px | Grid gutters, major panel padding, between-section spacing |
| `space-xl` | `2.5rem` | 40px | Section vertical padding, hero container margins |
| `gutter` | `1.5rem` | 24px | 12-column fluid grid gutter |
| `margin` | `2rem` | 32px | Outer canvas edge padding on desktop |

---

## 5. Border Radius & Structural Shapes

- `sm` (`0.25rem` / 4px): Micro-chips, inline code tags, scrub chapter markers.
- `DEFAULT` / `md` (`0.5rem` / 8px): Buttons, form inputs, URL launcher fields, status tags.
- `xl` (`0.75rem` / 12px): Sub-panels, chapter cards, telemetry sub-cards, review row cards.
- `2xl` (`1rem` / 16px): Main cards, video player viewport frame, Pomodoro circular gauge card, quiz container.
- `full` (`9999px`): Fully pill-shaped badges (e.g. `Focus Mode Active`, `4 days streak`), circular buttons, timers, avatars.

---

## 6. Depth, Elevation & Shadows

1. **Level 0 (Base Canvas)**:
   - Background `#101321`, flat, zero shadow.
2. **Level 1 (Panels & Anchored Cards)**:
   - Background `#181B29` or `#1C1F2D`.
   - 1px subtle boundary (`#232942` or `outline-variant/30`).
   - Shadow: `shadow-sm` to `shadow-md` (`0 4px 6px -1px rgba(0, 0, 0, 0.3)`).
3. **Level 2 (Active Focus / Floating Controls / Scrims)**:
   - Floating transport tray: `bg-surface-container-lowest/85 backdrop-blur-md shadow-lg`.
   - Modals & veils: `bg-surface-container-lowest/85 backdrop-blur-md shadow-[0_20px_50px_rgba(0,0,0,0.7)]`.
   - Sticky bottom action bars: `bg-surface-container-low/95 backdrop-blur-xl shadow-2xl`.

---

## 7. Component Patterns & UI Elements

### 7.1 Buttons
- **Primary Action (High Emphasis)**:
  - Classes: `bg-primary-container text-on-primary font-label-lg font-semibold px-7 py-3 rounded-lg shadow-[0_0_20px_rgba(128,131,255,0.45)] hover:bg-primary transition-all active:scale-[0.98]`
- **Secondary Action (Neutral / Surface)**:
  - Classes: `bg-surface-container-high text-on-surface font-label-md px-6 py-2.5 rounded-lg hover:bg-surface-container-highest transition-all`
- **Ghost / Utility Icon Button**:
  - Classes: `w-8 h-8 rounded-lg text-outline hover:text-on-surface hover:bg-surface-container flex items-center justify-center transition-colors`
- **Destructive / Exit Session**:
  - Classes: `bg-surface-container text-outline hover:text-error hover:bg-error-container/20 px-space-md py-1.5 rounded-lg font-label-md transition-all flex items-center gap-1.5 group`

### 7.2 Badges & Indicator Pills
- **Active Focus Indicator**:
  - Pill with green pulsating dot (`w-2 h-2 rounded-full bg-secondary animate-ping`), `bg-secondary-container/20 text-secondary font-label-sm uppercase tracking-wider`.
- **Warning / Distraction Pill**:
  - Pill with amber dot, `bg-tertiary-container/20 text-tertiary font-label-sm`.
- **Streak Counter**:
  - `bg-surface-container-high px-space-sm py-1 rounded-full flex items-center gap-1 text-tertiary font-label-md font-semibold`.

### 7.3 Custom Video Scrubber & Playback Controls
- **Track**: 6px height, rounded full, background `surface-container-highest/80`.
- **Buffer Track**: `outline-variant/40`.
- **Active Playhead**: Gradient `from-primary to-primary-container`.
- **Knob**: 14px circular knob `bg-primary shadow-[0_0_8px_rgba(192,193,255,0.8)]`, scales on hover.
- **Chapter Bookmark Pins**: 6px circles positioned along scrub bar with tooltips.

### 7.4 Circular SVG Gauges
- **Pomodoro Ring**: 160x160 or 120x120 SVG, rotated -90deg. Background circle in `surface-container-highest`, active stroke in `primary` with `filter: drop-shadow(0px 0px 8px rgba(192, 193, 255, 0.4))`, `stroke-linecap="round"`.
- **Focus Score Ring**: Active stroke in `secondary` (`#4AE176` / `#22C55E`).

### 7.5 Interactive Toggle Switches
- Track: `w-11 h-6 bg-surface-container-highest rounded-full peer-checked:bg-secondary transition-all`.
- Thumb: 20px white disc with smooth translation.

---

## 8. Screen-Specific Layouts & Visual Truth

### Screen 1: Landing / Home (`projects/598841545969436388/screens/11b2f5843e9a48b3b34ced696c0440b0`)
- **Global Header (64px)**: Fixed top bar with 90% opacity & `backdrop-blur-xl`. FocusTube brand mark (`🎯 FocusTube`), status chip (`Focus & Study Engine`), navigation links (`How it works`, `Study Room`, `Analytics`, `Recall`), study streak counter (`🔥 4 days`), primary button (`Start Studying`), user avatar.
- **Hero Grid (12 Columns)**:
  - **Col 1–7 (Left)**: Status badge (`Local Neural Engine v2.4 Active`), `display-lg` headline with gradient drop-shadow accent, lead paragraph, CTA action group (`Start a session` with indigo shadow + `Watch demo (1m 40s)`), trust telemetry badges (`100% Client-Side Vision`, `Zero-Cloud Processing`).
  - **Col 8–12 (Right)**: Spatial Bio-Telemetry card containing the **Interactive 3D Focus Orb (Three.js)** rendered inside a container with real-time telemetry pills (`GAZE LOCK: 98.4%`, `LATENCY: 11ms`, `STABILITY: ALPHA`).
- **Section Divider**: `01 // CORE ARCHITECTURE` label with 1px horizontal rule.
- **Tri-Feature Matrix**:
  1. *No recommendations* (Dopamine Stripped) with distraction vector sparkline.
  2. *Focus tracking* (Visual Telemetry) with circular 94% posture stability gauge.
  3. *Replay missed moments* (Automated Recovery) with segmented auto-bookmark timeline.
- **Clinical Protocol Section**: Technical workstation demonstration graphic + retention coefficient stat (`2.4x`) and cloud transmission stat (`0 ms`).
- **Demo Modal**: Clean drawer overlay for interactive session simulation.

### Screen 2: Study Room (`projects/598841545969436388/screens/e5b05c3a08ca46c4800759640793e9ad`)
- **Session Sub-Header**: Lecture title breadcrumb (`MIT 18.06 Linear Algebra - Lecture 1`), Focus status indicator (`🔒 Focus Mode Active • Recommendations Silenced`), and "End Session" button.
- **12-Column Asymmetric Workspace**:
  - **Primary Workspace (8 Columns / ~67% Width)**:
    - 16:9 Video Viewport with ambient radial glow, top HUD overlay (provider tag, stream fidelity, clean stream shield badge), center hover play/pause button, and bottom floating transport control tray (playback controls, monospace time readout `08:42 / 48:15`, volume slider, `1.25x` speed pill, voice isolation filter, theater toggle).
    - Integrated Timeline Scrubber with timestamp chapter bookmarks.
    - Curriculum Guide & Chapters: 3-column chapter cards with active chapter accent border (`Column Picture Geometry`), and algorithmic firewall notice banner.
  - **Contextual Telemetry & Tools Rail (4 Columns / ~33% Width)**:
    - **Card 1: Pomodoro Study Cycle**: Active block indicator (`Focus block 1 of 4`), large circular SVG countdown gauge (`24:37 Remaining`), Pause/Resume and Reset control buttons, target interval settings (`25m / 5m`).
    - **Card 2: Session Telemetry & Diagnostics**: Live gaze status (`Focused - Gaze locked to viewport`), 2-column metrics (Focus Score `94%` +3%, Distractions `0`), Attention continuity progress bar (`42m sustained`).
    - **Card 3: Vision Guard / Private Local Camera**: Stylized privacy face mesh & gaze vector SVG visualization, live FPS and gaze state HUD, hardware attention tracking toggle, and on-device WebAssembly privacy guarantee.

### Screen 2 Alternate State: Focus Lost Paused State (`projects/598841545969436388/screens/4ea653db7e9b4125a0df13aeea370ecc`)
- When user gaze diverts or window blurs:
  - Video feed brightness drops to 35% with 2px gaussian blur.
  - Translucent Veil overlays the video (`bg-surface-container-lowest/85 backdrop-blur-md`).
  - Centered Alert Modal: Ambient amber glow, amber eye-off icon with pulsating halo, `Gaze Anomaly Logged` headline, narrative explanation (`Distraction #3 registered at 04:12`), and full-width `Return to continue [Space]` CTA button.
  - Note-taking scratchpad automatically dims and inputs disable until gaze is re-established.

### Screen 3: Session Summary (`projects/598841545969436388/screens/0b8bef5a508c492aaefee3072135708b`)
- **Top Meta Strip**: `Block Verified` badge, Session ID, headline `Session complete 🎉`, lecture details.
- **Hero Focus Score Card**:
  - Left: 120px circular SVG gauge displaying overall focus score (e.g. `87%`) in `timer-display` font with `Optimal Retention Zone` badge.
  - Right: Assessment narrative detailing attentiveness tier, lapse count, and Cognitive Load Index sparkline (`0.14 σ/min`).
- **4-Stat Metric Ribbon**:
  - `Study time`: `25:00` (target 25m).
  - `Focused`: `21:42` (86.8% locked gaze, green accent).
  - `Looking away`: `2:31` (2 occurrences, amber accent).
  - `Away from tab`: `0:47` (browser blur event).
- **Review Feed ("Moments you zoned out")**:
  - Interactive rows with visual video thumbnail frames, exact timestamp chips (`04:12`, `09:40`, `15:03`), lapse cause badges (`Left tab`, `Looked away`), concept titles, pedagogical explanations, and individual `Replay` buttons.
- **Active Recall Prompt Callout**: Psychology brain icon, retention durability statistic (`+64% durability`), `3 QUESTIONS READY` indicator.
- **Sticky Bottom Action Bar**:
  - Secondary: `Export session notes` (downloads Markdown).
  - Secondary: `Start new session`.
  - Primary CTA: `Take recall quiz` (indigo button with sparkle icon).

### Associated Screen: Recall Quiz (`projects/598841545969436388/screens/46b856a41b5841f9b1b322ac6afca369`)
- Calm mode retrieval practice interface.
- 3-segment clean progress indicator bar.
- Question card with context origin pill (`From 4:12`) and concept topic tag (`Linear Independence`).
- Question stem with multiple choice cards (A, B, C, D).
- Correct answer active state: `bg-secondary-container/20`, emerald check icon, encouraging feedback box, and `Rewatch (4:12 - 4:59)` video context button.

---

## 9. Responsive Behavior & Breakpoints

| Breakpoint | Width | Layout Structure | Behavior |
| :--- | :--- | :--- | :--- |
| **Desktop** | `≥ 1024px` (`lg` / `xl`) | 12-column asymmetric grid (8 cols player / 4 cols telemetry) | Fixed side-by-side study workstation; full interactive controls and persistent metrics |
| **Tablet** | `768px – 1023px` (`md`) | 8-column split layout or stacked 12-column with collapsible rail | Player spans full width; telemetry, notes, and Pomodoro stack into tabbed panels beneath |
| **Mobile** | `< 768px` (`sm`) | 4-column single fluid column (`px-4`, `gutter: 1rem`) | Sticky top 16:9 video viewport; scrollable bottom stack for controls, timer, and chapter guide |

---

## 10. Implementation Guidance & Non-Negotiables

1. **Dark Theme Enforcement**: Always apply `class="dark"` to root `<html>` or `<body>`. There is no light mode; FocusTube is purpose-built for clinical dark adaptation.
2. **Tabular Numerals**: Apply `font-mono` / `tnum` to all timer displays, playback times, timestamps, and metric percentages to eliminate character jitter during real-time updates.
3. **No Decorative Distractions**: Do not introduce autoplaying animations, intrusive banners, or extraneous colors outside the Indigo/Emerald/Amber tri-color telemetry system.
4. **Client-Side Privacy Guarantee**: All camera and face-mesh processing must be clearly signaled as client-only (WebAssembly / WebGL / local media streams).
