# Judge Demo Flow

## Goal

Show one coherent story from the tablet teacher/admin experience to the student mobile experience:

1. The teacher creates a class from the tablet.
2. A YouTube lecture link seeds a believable 10-minute replay.
3. Students join normally from the Android app using the class code or QR.
4. Begin Class opens the live radar with confusion, clustering, bilingual support, poll data, and engagement.
5. End Session lands on a saved summary with voice reflection actions.

## Tablet Flow

1. Open the tablet app home screen and tap `Judge Demo`.
2. Fill in:
   - Subject
   - Topic
   - Grade / class
   - Language
   - Optional teacher brief in `Lesson Plan Seed`
   - The YouTube lecture link in `YouTube Lecture Link`
3. Tap `Seed Demo Session`.
4. In the lobby, point out:
   - QR/join code
   - The live joined-student count
   - The `YouTube Demo Replay` card
5. Join once from the Android student app with the same code.
6. Tap `Begin Class`.
7. In the live dashboard, walk the judges through:
   - Confusion trend and live pulse
   - Question cluster radar
   - Bilingual support moment
   - Quick poll panel
   - Announcement and engagement panels
   - Intervention history
8. Tap `End Session`.
9. On the summary screen, show:
   - Recovery score
   - Top misconception clusters
   - Intervention effectiveness
   - Voice reflection transcript and follow-up actions

## Student Mobile Flow

The Android app in `/Users/samueldsouza/Desktop/android_app` already supports the student-side story:

1. `app/join.tsx`
   - Student enters the 4-digit code or scans the QR flow
   - Language can be selected before joining
2. `app/classroom.tsx`
   - Big pulse buttons for `Got it`, `Sort of`, `Lost`
   - Anonymous text doubt submission
   - Voice doubt capture
   - Private recovery panel
   - Teacher note / prompt
   - Quick poll answer flow
   - Announcement list
   - Emoji reactions
   - Read-aloud support
3. `app/recap.tsx`
   - Personal recap with participation stats and points

## Best Demo Sequence

1. Start on tablet home.
2. Create the demo from the YouTube link.
3. Pause in the lobby and show the QR or join code.
4. Open the mobile app and join with the same code.
5. Return to tablet, confirm the student count updated, then tap `Begin Class`.
6. Let the live dashboard tell the story while you also show the student-side experience.
7. On mobile, show:
   - A bilingual learner joining
   - A pulse signal
   - A voice doubt
   - A poll answer
   - A read-aloud/private support moment
8. Return to tablet and show the updated live intelligence panels.
9. End the session and land on the summary.

## Environment Notes

- Full end-to-end live demo works best in `online` mode with Supabase configured.
- If the mobile app is missing backend configuration, it falls back to its built-in mock backend. The tablet-side demo flow still works locally, but the cross-device story is strongest when both apps use the shared Supabase flow.
