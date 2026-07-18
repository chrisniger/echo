
> **Do not mark a feature as complete unless it has been exercised end-to-end. A feature is only considered complete when the entire workflow—from Desktop UI through backend services, AI Gateway, and Companion (where applicable)—has been verified with real data instead of mocks or stubs. If any dependency is incomplete, report it as blocked rather than complete.**



# Echo Desktop / Companion Integration Review

Please review the following issues against the current implementation.

Before making changes:

* Verify whether the functionality actually exists.
* Do not assume it is implemented because it appears in a previous summary.
* Trace the complete execution flow from UI → Desktop → Cloud API → AI Gateway → Companion.
* If a component is stubbed or mocked, replace it with a production implementation.

---

# Issue 1 — Real-Time Audio Capture & AI Assistance

## Expected Behaviour

When a session starts:

Desktop should begin capturing:

* Microphone audio
* System audio (loopback)

If "Both" is selected, both streams should be captured simultaneously.

The transcription engine should continuously produce transcript segments.

Echo should intelligently distinguish:

* Questions coming from the system audio (interviewer/meeting)
* Speech coming from the user microphone

When a question is detected from the interviewer/system audio:

1. Send the transcript to the AI Gateway immediately.
2. Include:

   * Session Context
   * Uploaded CV
   * Additional Context
   * Uploaded Documents
   * Previous Transcript
3. Receive streaming AI response.
4. Display response in Assistant.
5. Save transcript locally.
6. Send the AI response to every connected Companion device.

## Current Behaviour

No transcription appears.

Neither microphone nor system audio produces transcript.

Assistant never receives AI suggestions.

## Investigate

Please verify:

* Audio device initialization
* WASAPI Loopback
* Microphone capture
* Audio mixer
* Whisper pipeline
* Transcript store updates
* WebSocket broadcasting
* AI request generation

Verify each stage independently.

---

# Issue 2 — Assistant Chat

## Expected Behaviour

Typing:

Hello

should produce:

Desktop

↓

Cloud API

↓

AI Gateway

↓

AI Provider

↓

Response

↓

Assistant

↓

Companion

## Current Behaviour

Assistant returns:

Failed to fetch

## Investigate

Trace:

Assistant Component

↓

HTTP Client

↓

Cloud API

↓

Gateway

↓

AI Provider

Determine exactly where the request stops.

Do not simply catch the exception.

Identify the root cause.

---

# Issue 3 — Session History

## Expected Behaviour

Clicking History should load:

* Previous sessions
* Transcript
* Recording
* Summary
* AI responses

## Current Behaviour

Failed to fetch

## Investigate

Verify:

Desktop API

↓

Cloud API

↓

Database

↓

Response

Ensure the API exists and matches the desktop request.

---

# Issue 4 — Companion AI Sync

## Expected Behaviour

Every AI response generated on Desktop should immediately appear on every connected Companion device.

The Companion should not generate AI.

It only mirrors Desktop.

## Current Behaviour

Desktop receives responses.

Companion receives nothing.

## Investigate

Check:

Desktop Event

↓

WebSocket

↓

Cloud

↓

Mobile

↓

Flutter State

Ensure streaming responses are forwarded.

---

# Issue 5 — Pairing Flow

The pairing process is almost correct.

Current behaviour:

Phone generates Pair Code.

Desktop receives Pair Code.

Desktop requests approval.

Approval works.

However:

Phone remains stuck on:

Generating Pair Code...

Even after approval.

## Expected Behaviour

Phone

↓

Waiting for approval

↓

Approved

↓

Automatically navigate

↓

Connected screen

No manual refresh.

---

# Issue 6 — Companion Login

Current behaviour

Closing the app requires logging in again.

Expected

Provide:

☑ Remember Me

Store:

* Access Token
* Refresh Token
* User Profile
* Device ID
* Pairing Status

Securely using:

* Flutter Secure Storage
* Keychain (iOS)
* Keystore (Android)

On startup:

If tokens remain valid:

Automatically login.

If expired:

Use Refresh Token.

Only show Login screen if refresh fails.

---

# Issue 7 — Connected Device State

Desktop should maintain:

Connected Devices

Example:

Desktop

✓ Chris Samsung S25 Ultra

Connected

Battery 72%

Last Sync 2 sec ago

Signal Excellent

Companion should display:

Connected to:

Echo Desktop

Listening

Receiving AI Responses

Latency:

18 ms

---

# Verification Required

After fixing the above:

Provide a verification report showing:

✅ Audio Capture

PASS / FAIL

Microphone

PASS / FAIL

Loopback

PASS / FAIL

Transcription

PASS / FAIL

AI Request

PASS / FAIL

Assistant

PASS / FAIL

History

PASS / FAIL

WebSocket

PASS / FAIL

Companion

PASS / FAIL

Pairing

PASS / FAIL

Remember Me

PASS / FAIL



Add this as **Issue 8** to the prompt.

---

# Issue 8 — Companion Connection Stability

## Expected Behaviour

Once the Companion successfully pairs with the Desktop, it should maintain a stable, persistent connection throughout the session.

The connection should **not repeatedly disconnect and reconnect** while both devices have a stable network connection.

If a temporary network interruption occurs, the Companion should:

* Automatically reconnect in the background.
* Restore the previous session automatically.
* Resume receiving live transcripts and AI responses.
* Avoid showing repeated "Disconnected" / "Connected" messages unless the connection is actually lost.

## Current Behaviour

The Companion frequently switches between:

Connected

↓

Disconnected

↓

Connected

↓

Disconnected

even when both the Desktop and phone remain on the same network and no manual action is taken.

This causes interruptions in receiving AI responses and transcript updates.

## Investigate

Please verify the entire connection lifecycle:

* WebSocket connection establishment
* Heartbeat (Ping/Pong) implementation
* Connection timeout settings
* Automatic reconnection logic
* Duplicate WebSocket connections
* Multiple reconnect timers
* Token expiration during active sessions
* Refresh Token handling
* Network state detection
* Background/Foreground app lifecycle handling (Flutter)
* Desktop WebSocket server stability
* Cloud relay stability (if enabled)

Ensure only **one active WebSocket connection** exists per Companion device.

## Acceptance Criteria

* Companion maintains a stable connection during long sessions (30–60+ minutes).
* No unnecessary disconnect/reconnect cycles.
* Automatic recovery after genuine network interruptions.
* AI responses continue streaming immediately after reconnection.
* Transcript synchronization resumes automatically.
* Pairing is preserved after reconnection.
* Connection status accurately reflects the real connection state.
* Connection latency and reconnect attempts are logged for diagnostics.

This will help ensure the Companion behaves like a reliable second-screen application rather than constantly renegotiating its connection.


---




