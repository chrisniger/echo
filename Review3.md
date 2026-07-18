Runtime Validation - Round 3

The core pipeline is now working successfully.

Verified:

✅ Audio transcription (Microphone/System Audio)
✅ AI receives transcript
✅ AI generates responses
✅ Responses are synchronized to the Companion

Great work.

The following usability and stability issues remain.

Issue 13 — Desktop Session Expires Unexpectedly
Expected Behaviour

Once a user signs in, the Desktop application should remain authenticated until:

The user explicitly logs out.
The refresh token expires.
The account is revoked.
The user changes password.

The user should not be signed out while actively using the application.

Current Behaviour

After some time, the Desktop automatically signs out and returns to the Login screen.

This interrupts active sessions.

Please Investigate

Verify:

JWT expiration
Refresh Token flow
Token renewal
Background refresh timer
401 handling
Token persistence
WebSocket authentication after refresh

The Desktop should automatically refresh expired access tokens without interrupting the user.

Issue 14 — Companion Font Size
Expected Behaviour

The Companion should allow the user to customize the AI response text size.

Add a new section:

Settings

↓

Display

↓

Response Font Size

Example:

Small

Medium (Default)

Large

Extra Large

or

Font Size

A-

━━━━●━━━━

A+

The selected size should immediately update the response display and persist between app launches.

This setting should affect:

AI Responses
Transcript (optional)
Session summaries (optional)
Issue 15 — Configurable Transcription Interval

Current message:

Audio is being captured and transcribed every 5 seconds.

I would like this to become configurable.

New Session

Assistant Settings

↓

Transcription Interval

Options:

Realtime (Recommended)

1 second

2 seconds

3 seconds

5 seconds

10 seconds

or allow a custom value.

Notes

Shorter intervals:

Faster responses
Higher CPU usage
More AI requests

Longer intervals:

Lower CPU usage
Fewer AI requests
Slightly slower responses

Default:

Realtime

(or 2 seconds)

The selected interval should be passed into the transcription service when the session starts.

Issue 16 — DeepSeek Model Selection

Current Behaviour

DeepSeek Chat works correctly.

However:

DeepSeek Coder
DeepSeek Reasoner

do not return responses.

This is not a blocking issue because I plan to integrate additional AI providers, including:

OpenAI
OpenAI Codex / Codex models (where applicable)
Anthropic Claude
Gemini
OpenRouter

For now:

Please verify that the model routing logic is correct.

If a selected model is unavailable or unsupported, the application should:

Display a clear error.
Explain why the model failed.
Allow automatic fallback to another configured model (optional).

Do not allow silent failures.

Next Planned Feature

Once the above items are complete, I would like to begin implementing:

Screenshot capture
Region selection
OCR
Vision analysis
AI image understanding

This will become the next development phase.

One Recommendation About the Transcription Interval

I actually wouldn't expose it simply as "every X seconds."

A better UX would be:

Assistant Responsiveness

⚡ Ultra Fast
- ~1 second
- Highest CPU
- Highest API usage

🚀 Fast (Recommended)
- ~2 seconds

⚖ Balanced
- ~5 seconds

💰 Economy
- ~10 seconds
- Lowest API cost

The average user doesn't think in terms of polling intervals—they think in terms of responsiveness versus resource usage. Internally, Echo can still map those options to specific transcription intervals. This approach is more intuitive and leaves you free to adjust the underlying timing later without changing the user-facing interface.

Overall, you're now transitioning from solving core engineering problems to refining the user experience, which is a very good sign for the maturity of the project.