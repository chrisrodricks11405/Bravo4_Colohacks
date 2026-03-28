# ClassPulse AI - UI/UX Design Instructions for Google Stitch

## Application Overview

**App Name:** ClassPulse AI
**Platform:** Android Tablet (Landscape Orientation ONLY - 10-11" tablets)
**User:** Teachers in Indian classrooms (ages 25-55)
**Purpose:** Real-time classroom comprehension radar + AI teaching copilot
**Design System:** Modern glassmorphism + clean data visualization, dark header panels with light content areas

---

## Global Design Language

### Design Philosophy
- **Data-Dense but Calm:** Teachers glance at this mid-lecture. Information hierarchy must let them absorb key metrics in under 2 seconds.
- **Glanceable Signals:** Use color semantics consistently. Green = good/got it. Amber = caution/sort of. Red = alert/lost. Indigo = primary actions.
- **Touch-First for Large Screens:** Minimum touch target 48dp. Generous spacing. No hover states. All interactions are tap, swipe, or long-press.
- **Landscape Always:** Every layout is designed for wide, short viewports. Use horizontal split panels, side-by-side columns, and wide cards.

### Color Palette

| Token | Hex | Usage |
|-------|-----|-------|
| Primary 500 | `#6366F1` | Buttons, active tabs, links |
| Primary 600 | `#4F46E5` | Pressed states |
| Primary 50 | `#EEF2FF` | Light primary backgrounds |
| Primary 100 | `#E0E7FF` | Hover/selected backgrounds |
| Got It (Green) | `#10B981` | Positive metrics, "got it" pulse |
| Sort Of (Amber) | `#F59E0B` | Caution metrics, "sort of" pulse |
| Lost (Red) | `#EF4444` | Alert metrics, "lost" pulse, errors |
| Surface | `#F8FAFC` | Page background |
| Card | `#FFFFFF` | Card backgrounds |
| Card Outlined | `#F1F5F9` | Secondary card fill |
| Border | `#E2E8F0` | Dividers, card borders |
| Text Primary | `#1E293B` | Headings, body text |
| Text Secondary | `#64748B` | Subtitles, meta info |
| Text Tertiary | `#94A3B8` | Placeholders, captions |
| Dark Panel BG | `#1A1B2E` | Hero/header panels |
| Dark Panel Text | `#E2E8F0` | Text on dark panels |
| Success BG | `#D1FAE5` | Success banners |
| Warning BG | `#FEF3C7` | Warning banners |
| Error BG | `#FEE2E2` | Error banners |
| Info BG | `#DBEAFE` | Info banners |

### Typography Scale (System Font - Inter or Device Default)

| Style | Size | Weight | Line Height | Usage |
|-------|------|--------|-------------|-------|
| Display Large | 32px | 700 | 40px | Page titles on hero panels |
| Display Medium | 28px | 700 | 36px | Section hero numbers |
| Heading Large | 24px | 600 | 32px | Main section headings |
| Heading Medium | 20px | 600 | 28px | Card titles |
| Heading Small | 18px | 600 | 24px | Sub-section headings |
| Body Large | 16px | 400 | 24px | Primary body text |
| Body Medium | 14px | 400 | 20px | Secondary body, descriptions |
| Body Small | 13px | 400 | 18px | Compact text |
| Label | 12px | 500 | 16px | Labels, tags, chips |
| Caption | 11px | 400 | 14px | Timestamps, fine print |

### Spacing Scale

| Token | Value |
|-------|-------|
| xs | 4px |
| sm | 8px |
| base | 12px |
| md | 16px |
| lg | 20px |
| xl | 24px |
| 2xl | 32px |
| 3xl | 40px |

### Component Tokens

**Cards:**
- Default: `background: white`, `border: 1px solid #E2E8F0`, `border-radius: 16px`, `padding: 20px`
- Elevated: Same + `box-shadow: 0 4px 24px rgba(0,0,0,0.06)`
- Dark: `background: #1A1B2E`, `border-radius: 16px`, `padding: 24px`, text is light

**Buttons:**
- Primary: `background: #6366F1`, `color: white`, `border-radius: 12px`, `padding: 14px 28px`, `font-weight: 600`, `font-size: 15px`
- Outline: `border: 1.5px solid #6366F1`, `color: #6366F1`, same radius/padding
- Ghost: `background: transparent`, `color: #6366F1`
- Danger: `background: #EF4444`, `color: white`
- Disabled: `opacity: 0.5`
- Min height: 48px

**Badges/Chips:**
- Rounded pill shape: `border-radius: 999px`, `padding: 4px 12px`
- Variants use semantic colors with light background + darker text
- Example: Success badge = `background: #D1FAE5`, `color: #065F46`

**Input Fields:**
- `border: 1.5px solid #CBD5E1`, `border-radius: 12px`, `padding: 14px 16px`
- Focus: `border-color: #6366F1`, subtle `box-shadow: 0 0 0 3px rgba(99,102,241,0.1)`
- Error: `border-color: #EF4444`
- Label above input, `font-size: 13px`, `font-weight: 500`, `color: #64748B`

**Tab Bar (Bottom):**
- `background: white`, `border-top: 1px solid #E2E8F0`
- Height: 64px
- Active icon: `color: #6366F1`, label bold
- Inactive icon: `color: #94A3B8`
- 5 tabs evenly distributed

---

## Screen-by-Screen Design Specifications

---

### SCREEN 1: Login

**Route:** `/(auth)/login`
**Layout:** Horizontal 50/50 split panel filling the entire landscape viewport.

**Left Panel (Branding - 50%):**
- Background: Gradient from `#1A1B2E` to `#2D2B55` (dark indigo)
- Top-left: App icon (small, 32px) + "ClassPulse AI" wordmark in white, `font-size: 14px`, `font-weight: 600`
- Center content (vertically & horizontally centered):
  - Headline: "Your classroom radar, always on." in Display Large (32px), white, max-width 400px
  - Spacer: 24px
  - Two feature pills stacked vertically, each a rounded translucent card (`background: rgba(255,255,255,0.08)`, `border: 1px solid rgba(255,255,255,0.12)`, `border-radius: 12px`, `padding: 16px 20px`):
    - Icon (lightning bolt) + "Launch a session in one tap"
    - Icon (cloud) + "Your settings travel with you"
  - Pill text: Body Medium (14px), `color: rgba(255,255,255,0.8)`

**Right Panel (Form - 50%):**
- Background: `#F8FAFC`
- Content centered both axes, max-width 420px
- Card (elevated, white):
  - Heading: "Sign In" - Heading Large (24px)
  - Subtitle: "Welcome back, teacher." - Body Medium, secondary color
  - Spacer: 24px
  - Email input field with label "Email address"
  - Password input field with label "Password", show/hide toggle icon
  - Spacer: 16px
  - Primary button full width: "Sign In"
  - Divider line with centered text "or"
  - Outline button full width: "Send Magic Link"
  - Spacer: 16px
  - Bottom text: "Don't have an account?" + text link "Sign up" in primary color

**Error/Success states:**
- Error: Red banner below form title with error icon + message
- Magic link sent: Green banner "Check your email for the magic link"

**Interaction Notes:**
- Keyboard should not obscure fields (scroll into view)
- Subtle fade-in animation on mount (300ms ease-out)

---

### SCREEN 2: Sign Up

**Route:** `/(auth)/signup`
**Layout:** Identical 50/50 split to Login.

**Left Panel (Branding - 50%):**
- Same dark gradient background
- Headline: "See every student, not just the loud ones."
- Feature pills:
  - Icon (chart) + "Real-time engagement heatmaps"
  - Icon (sparkle) + "AI-powered teaching insights"

**Right Panel (Form - 50%):**
- Card (elevated, white):
  - Heading: "Create Account"
  - Subtitle: "Get started in 30 seconds."
  - Fields:
    - Email input
    - Password input (with strength indicator bar below - 4 segments, color-coded)
    - Confirm Password input
  - Primary button: "Create Account"
  - Bottom text: "Already have an account?" + "Sign in" link

**Password Strength Indicator:**
- 4 thin horizontal bar segments below password field
- All gray when empty
- 1 red segment: Very weak
- 2 amber segments: Weak
- 3 amber segments: Fair
- 4 green segments: Strong
- Helper text below: "At least 6 characters" in caption size

---

### SCREEN 3: Home Dashboard

**Route:** `/(tabs)/index`
**Layout:** Full landscape with bottom tab bar. Content area uses a 60/40 horizontal split.

**Top Header Bar (full width, 64px height):**
- Left: "ClassPulse AI" wordmark, Heading Medium (20px), primary color
- Right: Row of status badges (small pills, 8px gap):
  - Network: Green "Online" or Red "Offline" or Amber "Hotspot"
  - Sync: Green "Synced" or Amber "Pending (3)"
  - AI: Green dot + "AI Ready" or Gray "AI Off"
  - Voice: Green dot + "Voice On" or Gray "Voice Off"
- Far right: Teacher email in Body Small, secondary color
- Bottom border: 1px `#E2E8F0`

**Left Column (60%):**

**Session Launcher Card (Dark Elevated):**
- Background: `#1A1B2E`, border-radius 16px
- Top section:
  - Row: Heading "Ready to teach?" in white (Heading Large) | Right side: small settings summary row
  - Settings summary: 4 mini chips in a horizontal row showing current defaults:
    - "Science" (subject) | "Grade 8 A" (class) | "English" (language) | "40% threshold"
    - Chip style: `background: rgba(255,255,255,0.1)`, `color: rgba(255,255,255,0.7)`, `border-radius: 8px`, `padding: 4px 10px`, `font-size: 12px`
- Spacer: 20px
- Button row:
  - Primary button (large): "Start Session" with play icon
  - Outline button (light border on dark): "Offline Mode" with wifi-off icon
- Both buttons side by side, equal width, 48px height

**Recent Sessions Section:**
- Section heading: "Recent Sessions" (Heading Small) + badge count "8"
- Scrollable vertical list of session cards (max 8 visible, scroll for more)
- Each session card (outlined card variant):
  - Top row: Subject + Topic in bold (Body Large) | Status badge right-aligned
    - Status badges: "Ended" (neutral gray), "Active" (green pulse), "Paused" (amber)
  - Middle row: Grade chip | Student count chip | Date in secondary text
  - Bottom row:
    - Left: Confusion index mini-bar (thin horizontal bar, color-coded)
    - Right: Sync badge - "Synced" (green) or "Local only" (amber)
  - Card padding: 16px, gap between cards: 12px
- Empty state: Illustration placeholder + "No sessions yet. Start your first class!" in secondary text

**Right Column (40%):**

**Quick Access Grid:**
- 2x2 grid of tappable cards
- Each card: Outlined variant, 80px height, icon top-center + label below
- Cards:
  1. Chart icon + "Past Summaries"
  2. Calendar icon + "Weekly Patterns"
  3. Cloud-sync icon + "Offline & Sync"
  4. Gear icon + "Settings"
- Active/hover: border becomes primary color, light primary background fill

**Sync Status Card:**
- Outlined card
- Heading: "Sync Status" (Heading Small)
- Status rows (each row: label left, value right):
  - "Network Mode" → "Online" (green badge)
  - "Supabase" → "Reachable" (green) or "Unreachable" (red)
  - "Pending Jobs" → number
  - "Failed Jobs" → number (red if > 0)
  - "Last Sync" → relative timestamp ("2 min ago")
- If issues: amber warning banner at bottom of card

---

### SCREEN 4: Create Session

**Route:** `/session/create`
**Layout:** Centered form card on subtle background, no tab bar (stack screen).

**Top Navigation Bar:**
- Left: Back arrow button + "New Session" heading
- Right: (empty)

**Form Container:**
- Centered card, max-width 640px, elevated variant
- Vertical form layout with generous spacing (24px between field groups)

**Mode Selector (top of form):**
- Segmented control with 2 options, full width
- "Online" segment: Cloud icon + "Live classroom with cloud sync"
- "Offline" segment: Wifi-off icon + "Local hotspot, sync later"
- Active segment: Primary background, white text
- Inactive segment: White background, secondary text, subtle border
- Height: 52px, border-radius: 12px

**Form Fields (vertical stack):**

1. **Subject** - Text input, pre-filled from preferences
2. **Topic** - Text input, placeholder "e.g., Photosynthesis"
3. **Grade / Class** - Text input, pre-filled from preferences
4. **Language** - Text input with quick-select chip row above:
   - Chips: "English", "Hindi", "Marathi", "Kannada" - tapping fills the input
   - Active chip: Primary background, white text
   - Inactive chip: Light gray background, secondary text
5. **Lost Threshold** - Slider (10-90) with current value displayed in a bubble above thumb
   - Track: Gray background, primary fill for active portion
   - Thumb: White circle with primary border, 24px diameter
   - Value label: `font-size: 14px`, bold, centered above thumb
   - Helper text below: "Alert when this % of students are confused" in caption
6. **Lesson Plan Seed** (optional) - Multi-line text area, 3 rows
   - Placeholder: "Paste lesson outline to help AI generate better suggestions..."
   - Character counter bottom-right: "0/500"

**Validation:**
- Inline error text below fields in red, `font-size: 12px`
- Fields with errors get red border

**Submit Area:**
- Primary button full width: "Launch Session" with rocket icon
- Disabled state until form validates (opacity 0.5)
- Loading state: Spinner replaces text

---

### SCREEN 5: Session Lobby

**Route:** `/session/lobby`
**Layout:** Full landscape, no tab bar. Centered content with large QR prominence.

**Background:** Subtle gradient from `#F8FAFC` to `#EEF2FF`

**Top Bar:**
- Left: Session status badge ("Lobby" in amber)
- Center: Subject + Topic in Heading Medium
- Right: Network quality indicator (4-bar signal icon, color-coded)

**Main Content (horizontally centered, max-width 800px):**

**QR Code Section (center-dominant):**
- Large QR code: 280x280px, centered
- Below QR: Join code in large monospace font
  - Format: "A B C D E F" with letter-spacing
  - Font: Display Large (32px), `font-weight: 700`, `letter-spacing: 8px`
  - Background: White card with dashed border, padding 16px 32px
- Below code: "Share this code with students" in secondary text

**Metrics Row (below QR, horizontal):**
- Two metric cards side by side:
  - "Students Joined" with large count number (Display Medium)
  - "Network Quality" with signal indicator + text label (Good/Fair/Weak)

**Action Buttons (bottom of content area):**
- Three buttons in a row:
  - Primary (large): "Begin Class" with play icon
  - Outline: "Lock Lobby" with lock icon
  - Ghost: "Regenerate Code" with refresh icon
- Equal spacing, centered

**Real-time Animation:**
- When a student joins, the participant count should animate up (number ticker)
- Subtle pulse ring animation around QR code to indicate "waiting for connections"

---

### SCREEN 6: Live Session Dashboard

**Route:** `/session/live`
**Layout:** Full landscape, NO tab bar. Dense data dashboard. This is the most complex screen.

**Overall Structure:**
- Fixed top header bar (56px)
- Below header: Two-column layout (65% left / 35% right)
- Left column scrolls vertically
- Right column is a fixed sidebar with tabs

**Top Header Bar (dark: `#1A1B2E`, 56px):**
- Left cluster:
  - Subject badge (pill, translucent white)
  - Topic in white (Heading Small)
  - Timer: "12:34" elapsed time, monospace, amber color
- Center: Mode indicator pill ("Online" green or "Offline" amber)
- Right cluster:
  - Pause/Resume toggle button (outline, light)
  - "End Session" button (danger variant, red)

---

**LEFT COLUMN (65%) - Scrollable:**

**A) Pulse Bar (Hero Section - Sticky top when scrolling):**
- Full width card, elevated, white background
- Section label: "Live Comprehension" (Label size, secondary)
- **The Pulse Bar itself:**
  - Horizontal stacked bar, full width, height 48px, border-radius 12px
  - Three segments proportionally sized:
    - Green (#10B981): "Got It" segment
    - Amber (#F59E0B): "Sort Of" segment
    - Red (#EF4444): "Lost" segment
  - Each segment shows: Percentage + count overlaid in white bold text (e.g., "62% (18)")
  - Smooth width transition animation (500ms ease) when values change
- Below the bar:
  - Left: Three legend items with colored dots + labels + percentages
  - Right: Large confusion index number
    - Format: "38" in Display Medium, color-coded (green <30, amber 30-59, red 60+)
    - Label below: "Confusion Index" in caption

**B) Confusion Sparkline:**
- Thin line chart (height 60px) showing last 20 data points of confusion index
- X-axis: time (no labels, just the line)
- Y-axis: 0-100 (no labels)
- Line color: changes based on current value (green/amber/red)
- Fill below line: 10% opacity of line color
- Dotted horizontal threshold line at the teacher's set threshold

**C) Misconception Clusters Panel:**
- Section heading: "Active Misconceptions" + count badge
- Vertical stack of cluster cards (outlined variant)
- Each cluster card:
  - Left color bar (4px wide, full height): Red intensity based on severity
  - Content:
    - Title: Cluster name in bold (Body Large)
    - Summary: 2-line description (Body Small, secondary)
    - Row of metadata:
      - Student count badge: person icon + "12 students"
      - Reason chip: Mapped label in a pill (e.g., "Steps unclear", "Too fast", "Language friction")
        - Chip colors per reason type:
          - Steps unclear: Blue
          - Language friction: Purple
          - Missing prerequisite: Red
          - Too fast: Amber
          - Notation confusion: Teal
          - Example needed: Orange
      - If bilingual: Translation snippet in italic, secondary
    - Bottom row: Suggested intervention button (small, outline, primary)
  - Tapping card expands to show full details in a bottom sheet / drawer

**D) Intervention History Timeline:**
- Section heading: "Interventions Applied" + count
- Vertical timeline (thin vertical line on left, dots at each event)
- Each event node:
  - Timestamp (caption, secondary)
  - Intervention type badge (e.g., "Language Switch", "Board Script")
  - Brief description
  - Effectiveness indicator: Checkmark (green) if recovery detected, X (red) if not

---

**RIGHT COLUMN (35%) - Fixed Sidebar with Tabs:**

Sidebar has its own tab row at the top with 3 tabs:
- "Polls" | "AI Insights" | "Markers"
- Active tab: Primary underline + bold text
- Inactive: Secondary text

**Tab 1: Quick Polls**
- If no active poll:
  - "Create Poll" button (primary, centered)
  - AI suggestion card: "Suggested poll based on confusion patterns" with auto-generated question
- If active poll:
  - Question text (Heading Small)
  - Vertical list of options (A, B, C, D):
    - Each option: Horizontal bar showing response count
    - Bar fill: Primary color, proportional to votes
    - Right: Count number + percentage
  - Status badge: "Active" (green) or "Closed" (gray)
  - "Close Poll" button

**Tab 2: AI Insights (AI Reteach)**
- If AI is enabled:
  - Card per active cluster:
    - Heading: "Reteach suggestion for: [Cluster Name]"
    - AI-generated explanation text in the session language
    - "Copy to clipboard" ghost button
    - Source label: "Edge AI" or "Cloud AI" in caption
- If AI is disabled:
  - Empty state: "Enable AI in Settings to get reteach suggestions"

**Tab 3: Lesson Markers**
- Vertical list of marker buttons (tappable to place a marker):
  - "New Concept" (blue)
  - "Example" (green)
  - "Practice" (amber)
  - "Review" (purple)
  - "Q&A" (teal)
- Below buttons: Timeline of placed markers with timestamps
- Each placed marker: Colored dot + label + time

---

### SCREEN 7: Session Summary

**Route:** `/session/summary`
**Layout:** Full landscape, no tab bar. Scrollable single-column centered content (max-width 900px).

**Top Bar:**
- Left: Back arrow + "Session Summary"
- Right: Share/export icon button

**Hero Section (Dark card, full width):**
- Background: `#1A1B2E`
- Left side:
  - Subject + Topic (Display Large, white)
  - Meta row: Grade badge | Student count badge | Date + Duration | all in light translucent pills
- Right side (prominent):
  - Recovery Score: Large circular progress ring (120px diameter)
    - Ring color: Green (75+), Amber (45-74), Red (<45)
    - Center: Score number in Display Large, white
    - Below ring: Label "Recovery Score" + status text ("Strong" / "Partial" / "Needs Follow-up")

**Key Metrics Grid (4 cards in a row):**
- Outlined cards, equal width
- Each: Large number (Heading Large) + label below (Caption)
  1. "Pulse Events" - total count
  2. "Peak Confusion" - highest index value + time
  3. "Clusters Found" - count
  4. "Interventions" - count applied

**AI Narrative Section:**
- White elevated card
- Heading: "Session Narrative" with sparkle icon
- Body text: 3-5 sentence AI-generated summary (Body Large, primary text)
- Source badge: "Generated by Edge AI" or "Cloud AI" in caption
- Subtle left border: 3px primary color

**Session Timeline (Interactive):**
- Full width, horizontal scrollable
- Time axis along bottom (0:00 to session end)
- Stacked layers:
  - Top: Lesson markers as colored dots/flags
  - Middle: Confusion index line chart (same styling as live sparkline but larger, height 120px)
  - Bottom: Cluster emergence points as triangular markers
  - Intervention points: Vertical dashed lines with labels
- Tapping any marker/point shows a tooltip with details

**Peak Confusion Moments:**
- Section heading: "Confusion Peaks"
- Horizontal scrollable cards (3-5 cards)
- Each card:
  - Timestamp prominently displayed
  - Confusion score (large, color-coded)
  - Associated topic/cluster name
  - Student count affected

**Top Misconception Clusters:**
- Same card design as live view clusters, but with added:
  - Recovery rate per cluster (percentage + mini progress bar)
  - "Resolved" or "Unresolved" status badge

**Intervention Effectiveness Report:**
- Table-style layout:
  - Column headers: Type | Count | Success Rate | Impact
  - Each row: Intervention type name | times used | percentage bar | "High"/"Medium"/"Low" badge
  - Color code success rate: Green >70%, Amber 40-70%, Red <40%

**Suggested Opener Card:**
- Highlighted card with primary left border (3px)
- Heading: "Suggested Opener for Next Session"
- AI-generated activity text (Body Large)
- "Based on unresolved clusters from this session" in caption

---

### SCREEN 8: Past Summaries (Browse)

**Route:** `/(tabs)/summaries`
**Layout:** Full landscape with bottom tab bar. Single column, scrollable.

**Header Section:**
- Title: "Past Summaries" (Heading Large) + count badge
- Subtitle: "Search and revisit session insights" (Body Medium, secondary)

**Search Bar:**
- Full width outlined card containing:
  - Search icon + text input: "Search by topic, subject, or date..."
  - Clear button (X) when text present
- Results filter in real-time as user types

**Summary Cards List (vertical scroll):**
- Each card (elevated variant, full width):
  - **Header Row:**
    - Left: Subject (bold) + " - " + Topic
    - Right: Recovery score badge (pill, color-coded)
      - Green (75+): "85% Recovery"
      - Amber (45-74): "52% Recovery"
      - Red (<45): "23% Recovery"
    - Far right: Sync badge ("Synced" or "Local")

  - **Meta Row:** Grade chip | Student count | Formatted date - all in Body Small, secondary

  - **Narrative Preview:** 3-line truncated AI summary text (Body Medium)

  - **Detail Pills Row:**
    - "3 Peaks" pill (info style)
    - "5 Clusters" pill (warning style)
    - "Edge AI" or "Fallback" source pill

  - **Reason Chips:** Horizontal row of top 3 misconception reason chips (same color scheme as live view)

  - **Footer Row:**
    - Left: "Next time: [suggested activity]" in italic, secondary
    - Right: "Open Summary" text button in primary color with arrow icon

- Gap between cards: 16px
- Empty state: "No summaries found" illustration + text

---

### SCREEN 9: Weekly Patterns

**Route:** `/(tabs)/weekly`
**Layout:** Full landscape with bottom tab bar. Scrollable dashboard.

**Header:**
- Title: "Weekly Patterns" (Heading Large)
- Subtitle: "Teaching trends and insights across your sessions"

**Date Range Selector:**
- Horizontal row of pill buttons:
  - "This Week" | "Last Week" | "Last 2 Weeks" | "This Month" | "Last Month"
  - Active: Primary filled
  - Inactive: Outlined, secondary text

**Metrics Row (4 stat cards in horizontal row):**
- Each card (outlined, equal width):
  - Large number (Display Medium, primary color)
  - Label (Caption, secondary)
  - Cards: "Sessions" | "Total Students" | "Avg Recovery" | "Avg Comprehension"

**Topic Difficulty Heatmap:**
- Section heading: "Topic Difficulty Heatmap"
- Grid layout: Subjects as columns, topics as rows (or vice versa based on data density)
- Each cell:
  - Background color intensity based on difficulty score:
    - Green (<30): `#D1FAE5` → Good
    - Blue (30-49): `#DBEAFE` → Moderate
    - Amber (50-69): `#FEF3C7` → Concerning
    - Red (70+): `#FEE2E2` → High Risk
  - Cell content: Topic name (bold, small), difficulty score, session count
  - Cell size: ~120px x 80px, border-radius 8px, 4px gap
- Scrollable horizontally if many subjects

**Comprehension by Subject:**
- Section heading: "Comprehension by Subject"
- Horizontal bar chart visualization:
  - Each bar: Subject name on left, horizontal bar extending right
  - Bar fill color: Green (80+), Blue (60-79), Amber (40-59), Red (<40)
  - Score number at end of bar
  - Bar height: 36px, gap: 8px, border-radius: 8px

**Recurring Misconceptions:**
- Section heading: "Recurring Misconceptions"
- Card list:
  - Each card:
    - Cluster title (Heading Small)
    - Summary text (Body Small)
    - Reason chip (color-coded)
    - Frequency badge: "Appeared in 5 sessions"
    - Suggested intervention text (italic, secondary)
    - Divider between cards

**Intervention Trends:**
- Section heading: "Intervention Effectiveness Trends"
- Horizontal grouped cards:
  - Each card represents an intervention type:
    - Type name + icon
    - Usage count
    - Success rate as circular progress (mini, 48px)
    - Trend arrow: Up (green) or Down (red) vs previous period

---

### SCREEN 10: Sync Dashboard

**Route:** `/(tabs)/sync`
**Layout:** Full landscape with bottom tab bar. Single column centered (max-width 800px).

**Header:**
- Title: "Offline & Sync" (Heading Large)
- Subtitle: "All data is queued locally and synced when online"
- Right side: Status badges row (Network mode + Sync health)

**Stat Grid (2x2):**
- 4 equal cards:
  1. "Local Queue" - number (large) + label
  2. "Pending Jobs" - number + label
  3. "Failed Jobs" - number (red if >0) + label
  4. "Last Sync" - relative time + label

**Sync Engine Card (elevated):**
- Heading: "Sync Engine"
- Progress bar: Full width, 8px height, rounded
  - Background: `#E2E8F0`
  - Fill: Primary gradient with subtle animation (shimmer when active)
  - Below bar: "12/15 jobs processed" in Body Small
- Action button row:
  - "Force Sync" (primary)
  - "Retry Failed" (outline, disabled/gray when no failures)
  - "Export Diagnostics" (ghost)
- Buttons in a horizontal row with 12px gap

**Queued Jobs List:**
- Section heading: "Job Queue" + count
- Table-style list:
  - Each row:
    - Job type label (e.g., "Upload Session")
    - Created timestamp
    - Status badge:
      - Completed: Green checkmark
      - Failed: Red X + retry count
      - In Progress: Spinning indicator
      - Pending: Gray clock
    - Error message (if failed, in red caption text, expandable)
- Alternating row backgrounds for readability (white / very light gray)

---

### SCREEN 11: Settings

**Route:** `/(tabs)/settings`
**Layout:** Full landscape with bottom tab bar. Scrollable centered content (max-width 700px).

**Top Action Bar:**
- Left: Save status indicator:
  - "Up to date" (green dot + text)
  - "Unsaved changes" (amber dot + text)
  - "Saving..." (spinner + text)
  - "Saved" (green checkmark, fades after 2s)
- Right: "Reset" outline button + "Save Settings" primary button

**Feedback Banner (conditional):**
- Success: Green banner with checkmark: "Settings saved successfully"
- Error: Red banner with X icon: error message

**Session Defaults Card:**
- Heading: "Session Defaults" (Heading Medium)
- Subtitle: "Pre-fill these values when creating new sessions"
- Fields (vertical stack, 20px gap):
  - Default Subject (text input)
  - Grade / Class (text input)
  - Language:
    - Quick-select chip row: "English" | "Hindi" | "Marathi" | "Kannada"
    - Text input below for custom value
    - Active chip: Primary filled
  - Lost Threshold: Number input (0-100) with stepper buttons (+/-)
    - Helper text: "Students above this % confusion trigger an alert"

**AI & Voice Card:**
- Heading: "AI & Voice Features" (Heading Medium)
- Two toggle rows:
  - "AI Provider" toggle
    - Description: "Enable AI coaching, reteach suggestions, and narrative generation"
    - Toggle switch: Primary color when on, gray when off
  - "Voice Features" toggle
    - Description: "Enable voice commands and audio reflections"
    - Same toggle styling
- Toggle rows: Label + description on left, toggle switch on right, full width, 16px vertical padding, divider between

**Account Card:**
- Heading: "Account" (Heading Medium)
- Info rows:
  - "Signed in as" → email displayed (Body Medium)
  - "App Version" → "ClassPulse AI Teacher 1.0.0"
- Spacer: 24px
- "Sign Out" danger button (red, full width)
  - Confirmation dialog on tap: "Are you sure you want to sign out?"

---

## Animation & Motion Guidelines

### Transitions
- **Page transitions:** Horizontal slide (300ms ease-out) for stack navigation. Crossfade (200ms) for tab switches.
- **Cards on mount:** Staggered fade-up (each card delayed 50ms after previous, 300ms duration, ease-out)
- **Number changes:** Animated counter (ticker effect, 400ms)
- **Progress bars:** Smooth width transition (500ms ease)
- **Pulse bar segments:** Smooth proportional width changes (500ms ease-in-out)

### Micro-interactions
- **Button press:** Scale down to 0.97 (100ms), scale back (100ms)
- **Toggle switch:** Spring animation (tension 300, friction 20)
- **Badge appear:** Scale from 0 to 1 with bounce (300ms)
- **Sparkline updates:** New point slides in from right, line morphs smoothly (300ms)

### Loading States
- **Skeleton screens:** Use for initial page loads. Pulsing gray rectangles matching content layout.
- **Spinner:** Primary color circular spinner (24px) for button loading states
- **Shimmer effect:** On sync progress bar when actively syncing

---

## Responsive Considerations

**Target:** 10-11" Android tablets in landscape (1280x800 to 2560x1600)

- All layouts assume landscape. No portrait variants needed.
- Minimum touch target: 48x48dp
- Maximum content width: 1200px (centered with auto margins on larger screens)
- Side panels: Min 320px, max 480px
- Cards never go full-bleed to screen edge - always 20px+ margin from screen edges
- Bottom tab bar: Fixed 64px height, always visible on tab screens
- Keyboard avoidance: Forms scroll up when keyboard appears

---

## Accessibility

- All interactive elements have minimum 4.5:1 contrast ratio against their backgrounds
- Color is never the SOLE indicator - always paired with text labels, icons, or patterns
- All images/icons have content descriptions
- Touch targets: 48dp minimum
- Focus indicators: 2px primary color outline on focused elements
- Text scales: Support system font scaling up to 1.3x without layout breaking

---

## Empty States & Error States

**Empty States (per screen):**
- Centered illustration area (placeholder, 120x120px)
- Heading in secondary text (Heading Small)
- Subtitle explaining what will appear here (Body Medium, tertiary)
- Optional CTA button

**Error States:**
- Red banner at top of affected section (not full-page takeover)
- Error icon + message text + optional retry button
- Never block the entire UI for non-critical errors

**Offline Indicators:**
- Amber banner at very top of screen: "You're offline. Data will sync when connected."
- Persistent but dismissible
- All features remain functional (offline-first)

---

## Icon System

Use a consistent outlined icon set (Lucide Icons or similar):
- 24px default size for in-content icons
- 20px for icons inside buttons and chips
- 28px for tab bar icons
- Stroke width: 1.5px
- Color inherits from parent text color

**Key Icons by Context:**
- Home: House | Summaries: BarChart3 | Weekly: Calendar | Sync: CloudSync | Settings: Gear
- Play: Session start | Pause: Session pause | Stop: End session
- Lightning: Quick action | Sparkle: AI feature | Wifi/WifiOff: Network status
- Users: Student count | Clock: Timer | Lock: Lobby lock
- ChevronRight: Navigation | X: Close/Dismiss | Check: Success
- AlertTriangle: Warning | AlertCircle: Error | Info: Information

---

## Design Token Summary for Implementation

```
Primary: #6366F1
Primary Dark: #4F46E5
Primary Light: #EEF2FF
Got It: #10B981
Sort Of: #F59E0B
Lost: #EF4444
Background: #F8FAFC
Card: #FFFFFF
Border: #E2E8F0
Text Primary: #1E293B
Text Secondary: #64748B
Text Tertiary: #94A3B8
Dark Surface: #1A1B2E
Card Radius: 16px
Button Radius: 12px
Chip Radius: 999px
Input Radius: 12px
Spacing Unit: 4px (multiply for scale)
Shadow Small: 0 2px 8px rgba(0,0,0,0.04)
Shadow Medium: 0 4px 24px rgba(0,0,0,0.06)
Shadow Large: 0 8px 32px rgba(0,0,0,0.08)
```
