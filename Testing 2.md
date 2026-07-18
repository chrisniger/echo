
# Echo Testing Report (Round 2)


The previous implementation report states that all issues have been fixed. However, during end-to-end testing, the following problems still exist.

Before implementing any fix, verify whether the reported feature actually works in a real end-to-end scenario. Do not rely on previous implementation summaries. A feature should only be marked as complete after it has been tested from the Desktop UI through the Cloud API, AI Gateway, and Companion (where applicable), with real data and successful runtime verification

---

# Issue 9 — Audio Transcription Still Not Working

## Expected Behaviour

When a session starts and the audio source is set to **Both**, Echo should:

* Capture **Microphone audio**.
* Capture **System (PC) audio**.
* Continuously transcribe both audio streams.
* Display the transcript in the **Transcript** tab.
* Detect questions coming from the system audio (interviewer/meeting).
* Automatically send detected questions to the AI Gateway.
* Display AI responses in the **Assistant** tab.
* Forward AI responses to every connected Companion device.

## Current Behaviour

No transcription is generated.

* Microphone speech is not transcribed.
* System audio is not transcribed.
* Transcript window remains empty.
* Assistant never receives automatic questions.

## Please Verify

Trace the complete pipeline:

```
Microphone
        │
System Audio
        │
        ▼
Audio Capture
        ▼
Whisper / Speech-to-Text
        ▼
Transcript Store
        ▼
Question Detection
        ▼
AI Gateway
        ▼
Assistant UI
        ▼
Companion
```

Do not mark this feature as complete until the entire pipeline has been verified using real audio.

---

# Issue 10 — Assistant Chat Still Returns "Failed to Fetch"

## Expected Behaviour

Typing a message such as:

```
Hello
```

should return a real AI response.

## Current Behaviour

The Assistant displays:

```
Sorry, I encountered an error:

Failed to fetch

Please ensure:

1. The AI Gateway is running
2. The DeepSeek API key is configured
3. The Cloud API is running
```

## Notes

All backend services are already running.

I start them using:

```bash
pnpm --parallel -r dev
```

Then I start the Desktop application separately using:

```bash
cd apps/desktop
pnpm tauri dev
```

Therefore, the error should **not** assume the backend is offline.

Please trace exactly why the request is failing.

Investigate:

* Desktop API client
* Vite proxy
* Cloud API
* AI Gateway
* AI Provider
* CORS
* Network request
* Authentication
* API routing

Determine the real root cause instead of displaying a generic message.

---

# Issue 11 — Companion Cannot Be Verified

## Current Behaviour

No AI responses are reaching the Companion application.

Because Desktop AI is currently failing, I cannot verify whether:

* Audio transcription
* AI streaming
* Companion synchronization

are actually working.

Please fix the Desktop AI communication first before marking Companion synchronization as complete.

---

# Issue 12 — CV Library Does Not Display Uploaded CVs

## Expected Behaviour

After uploading a CV:

The CV Library should display:

* CV Name
* Upload Date
* File Type
* Tags (if available)
* Default CV indicator

When creating a **New Session**, there should be a dropdown or selector allowing the user to choose from previously uploaded CVs.

Example:

```
Select CV

▼ Senior Laravel CV

▼ Full Stack CV

▼ DevOps CV
```

## Current Behaviour

The upload appears to complete, but the CV Library remains empty.

The uploaded CV cannot be selected during New Session.

Please verify:

* Upload API
* Database storage
* Local cache
* CV retrieval endpoint
* Desktop state management
* CV selector in New Session

---

# Verification Required

Please do **not** simply state that these issues are fixed.

For each issue, provide evidence including:

* Console logs
* Backend logs
* Network/API requests
* WebSocket events
* Screenshots (where applicable)

Only mark an issue as **PASS** after it has been tested end-to-end with real data, not mocks or simulated responses.

