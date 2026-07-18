# Echo_GPT — Progress Log & Pending Issues

> **Status date:** 2026-07-06
> **Purpose:** pick up where we left off tomorrow without re-deriving context.
> **Current build state:** the audio pipeline (capture + Whisper transcription + question detection) is reportedly broken. We have a backup from a working state (the post-`Review3.md` point). The user wants to **restore `apps/desktop/` from the backup** while keeping the font-size feature in `apps/companion/` and the Groq transcription in `apps/ai-gateway/`.

---

## 0. RESUME PROMPT (paste this into a fresh chat to pick up)

> I'm continuing work on **Echo_GPT** at `C:\Users\Delluser\Documents\application_folder\Echo_GPT`. Read the file **`ECHO_GPT_PROGRESS.md`** in the repo root first — it has the full history of what was built, what was fixed, and the current state.
>
> **Where we stopped:** the audio pipeline (mic + system capture → Whisper transcription → question detection) is reportedly broken after my Issue 13–16 changes. Issue 15 (transcription interval presets) was already rolled back but the user says audio still doesn't work. The user has a **backup folder** from a known-working state (post-`Review3.md`, pre-Issue 13). Their decision: **restore `apps/desktop/` from the backup, keep `apps/companion/` (font size) and `apps/ai-gateway/` (Groq transcription) and `apps/cloud-api/` (CORS + pairing fixes) as-is.**
>
> **First thing to do tomorrow:** walk the user through the restore (`cp -r apps/desktop apps/desktop.broken` for safety, then copy backup's `apps/desktop` over the broken one, then `pnpm install && pnpm tauri dev`). Then start a session, open the Tauri dev console, and confirm the per-segment log lines from `useSessionBackground` show `Transcribed N segment(s) via groq` with sensible confidences. If audio works → done. If not → widen the restore to `apps/cloud-api/` next.
>
> After restore, the next planned work is **screenshots** (Review3.md "Next Planned Feature"). DeepSeek doesn't do vision, so the user plans to add OpenAI / Anthropic / Gemini; the `apps/ai-gateway/src/routes/image-analysis.ts` route already exists.
>
> Pending small decisions captured in section 7 of the progress doc:
> - Should the `looksLikeQuestion` heuristic be expanded beyond the 19 prefixes + `?`?
> - Should the 15-second question cooldown be shortened?
> - Should the NewSession form's audio-source default stay at `system`?
>
> The project layout, file inventory, and what each component does is in section 8 of the progress doc. Do not re-derive context — read the doc and ask only what's missing.

---



---

## 1. Project at a Glance

**Echo_GPT** is a multi-device AI assistant ecosystem with five components:

| Component | Stack | Path |
|---|---|---|
| **Echo Desktop** | Tauri 2 + React + Rust (Tauri 2 was added in Step 2) | `apps/desktop/` |
| **Echo Companion** | Flutter (Android/iOS) | `apps/companion/` |
| **Echo Cloud API** | Node.js/Express + SQLite (target: Laravel 12) | `apps/cloud-api/` |
| **Echo AI Gateway** | Node.js/Express | `apps/ai-gateway/` |
| **Echo Web Portal** | Next.js 15 | `apps/web-portal/` |

Shared packages: `packages/shared-config/`, `packages/shared-types/`.

**Architecture principle:** Desktop = processing hub (audio, transcription, AI). Cloud = identity/licensing/sync. Companion = read-only second-screen. AI Gateway = provider abstraction. Web Portal = history & admin.

---

## 2. Review Docs Timeline

The user has been validating the build against three review docs:

1. **`Review.md`** — first round, identified 8 issues (Failed to fetch, Companion not receiving AI, etc.)
2. **`Testing 2.md`** — second round (after my CORS + WebSocket fixes), audio still failing
3. **`Review3.md`** — third round, all four core flows verified ✅:
   - Audio transcription (Mic/System)
   - AI receives transcript
   - AI generates responses
   - Responses synchronized to Companion

Between Review3.md and now I implemented Issues 13–16 from the user's mental backlog. The audio pipeline reportedly started misbehaving **after** those changes. A backup was made at the Review3.md state and is what we'll restore `apps/desktop/` from.

---

## 3. Issues Fixed (all 12+)

### Round 1 — CORS + WebSocket
| Issue | Root cause | Fix |
|---|---|---|
| 2/3. "Failed to fetch" everywhere | Tauri 2 webview origin is `http://tauri.localhost`, not in cloud-api's `CORS_ORIGIN` list | Added Tauri origins to `apps/cloud-api/.env` + `ai-gateway/.env`; hardened `config.ts` to merge Tauri origins even if env is wrong |

### Round 2 — Companion communication
| Issue | Root cause | Fix |
|---|---|---|
| 4. AI response not reaching Companion | Desktop broadcasts to `sessionId` room, companion never subscribes to anything | Cloud API now auto-joins `user:${userId}` room on connect + dual-broadcasts to both session & user room. Companion subscribes to `user:${userId}` on `connected` event. |
| 1/9. Audio capture not working | (1) STT provider missing; (2) `cpal` device not in scope | Added Groq config; added `audio_preflight` Tauri command; added `use cpal::traits::DeviceTrait;` import |
| Audio struct field mismatch | Rust `whisper.rs` had `full_text/duration_secs/segments[].start_timestamp`, but AI Gateway sent `text/duration/segments[].start` — Rust always failed to parse | Renamed Rust struct fields to match |
| Groq base URL | Default was `https://api.groq.com/openai` — OpenAI SDK appended `/audio/transcriptions` so it became `/openai/audio/transcriptions` (404). Should be `/openai/v1/audio/transcriptions` | Default is now `https://api.groq.com/openai/v1` |

### Round 3 — Companion discovery + pairing
| Issue | Root cause | Fix |
|---|---|---|
| 11. Companion not finding desktop | Default `baseUrl = 'http://192.168.1.102:4000'` hardcoded | Added `DiscoveryService.scanLocalSubnet()` (probes /24 subnet in parallel). Login screen has "Scan local network" button. Settings screen for manual entry. |
| 5. Pairing stuck on "Generating Pair Code" | Polling checked `/devices` (any device returned true) | New `POST /api/pairing/status?token=...` endpoint. Companion polls it with the specific token. Auto-navigates on `status: 'approved'`. |
| 6. Companion login persistence | `isPaired` was inferred from devices list, false positives | Now persisted as `is_paired=true` only after explicit `setPaired(true, deviceId)`. |
| 8. Companion connection flapping | Single backend heartbeat timer | Server-side `HEARTBEAT_INTERVAL=30s` + `HEARTBEAT_TIMEOUT=120s` |

### Round 4 — Issues 13–16 (Review3.md batch)
| Issue | Fix |
|---|---|
| **13. Auto sign-out** | Background timer in `App.tsx` refreshes JWT 60s before expiry. `api.ts` proactively refreshes when `isTokenExpired()`. WebSocket reconnects on `onAuthRefresh()`. Removed the silent `window.location.href = '/login'` on 401. |
| **14. Companion font size** | New `lib/services/display_settings.dart` (SharedPreferences-backed). Settings screen has a Display section with: Response Font Size slider (12–28pt) + 4 quick presets (Small/Medium/Large/Extra Large), Transcript Font Size slider, "Show timestamps" toggle. Applied live to assistant + transcript screens. |
| **15. Transcription interval presets** | Added `TranscriptionInterval` type + 4 presets (Ultra Fast 1s, Fast 2s, Balanced 5s, Economy 10s) wired through NewSession form. **User reported this broke the audio pipeline, so I rolled it back** (see section 5). |
| **16. DeepSeek Coder/Reasoner not working** | `DeepSeekProvider.models` was `['deepseek-chat', 'deepseek-coder']` — missing `'deepseek-reasoner'`, so the router skipped it. Added it. AI Gateway `/api/chat` now returns 502 (instead of 500) for upstream errors and includes the model name in the envelope. |

### Smaller improvements that survived
- Audio source default = `system` (changed from `microphone`) on NewSession / SessionDetail fallback / AudioCaptureControls
- `start_mic_capture` and `start_system_capture` Rust commands are now **idempotent** (return Ok if already capturing instead of "Microphone capture already active")
- `AudioCaptureControls` syncs with Rust state on mount
- New "Listening (system)" / "Audio capture failed: …" status card at top of SessionDetail
- Tauri audio_preflight command + per-segment log lines for diagnostics (so user can see in dev console exactly which segments are detected as questions)

---

## 4. The Actual Question Detection Heuristic (unchanged)

Both `useSessionBackground.ts` and `useAudioCapture.ts` share the same `looksLikeQuestion()`:

```ts
const QUESTION_HINTS = [
  'what ', 'why ', 'how ', 'when ', 'where ', 'who ', 'which ',
  'can you', 'could you', 'would you', 'should we', 'will you',
  'is it', 'are you', 'do you', 'does it', 'did you', 'have you',
  'tell me', 'explain ', 'describe ',
];

function looksLikeQuestion(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.endsWith('?')) return true;
  const lower = trimmed.toLowerCase();
  return QUESTION_HINTS.some((hint) => lower.startsWith(hint));
}
```

And the **15-second question cooldown**:
```ts
if (now - lastQuestionAtRef.current < questionCooldownMs) {
  log(`Question detected but within cooldown, skipping: "${text}"`);
  return;
}
lastQuestionAtRef.current = now;
```

**Known limitation:** the heuristic is strict. A rephrased question like "I'm curious about X" or "Wondering if Y" will NOT be auto-answered. This was always the case; the user may just be noticing it now. Tomorrow, if the audio pipeline is fixed by the restore, we can revisit whether to make the heuristic more generous.

---

## 5. The Rollback (already in repo)

Issue 15 has been fully reverted. The current `apps/desktop/`, `apps/cloud-api/`, `packages/*` no longer have the transcription-interval code.

**What was reverted (in this exact order):**
- `packages/shared-types/src/session.ts` — removed `TranscriptionInterval` type, `TRANSCRIPTION_INTERVAL_MS` map, `Session.transcriptionInterval` field
- `apps/cloud-api/src/routes/sessions.ts` — removed `transcriptionInterval` from zod schema, INSERT, `mapSession`
- `apps/cloud-api/src/db/schema.ts` — removed `transcription_interval` column
- `apps/cloud-api/src/db/index.ts` — removed `ensureSessionsColumns` migration helper
- `apps/desktop/src/pages/NewSession.tsx` — removed 4-preset UI + state
- `apps/desktop/src/pages/SessionDetail.tsx` — `transcriptionIntervalMs: 5000` is hardcoded again; status card text reverted to "every 5 seconds"
- `apps/desktop/src/stores/session.ts` — removed `sessions: [session, ...get().sessions]` prepending

**What was NOT reverted (kept on purpose):**
- Audio source default = `system`
- The status card at top of SessionDetail (green "Listening (system)" / red error)
- Per-segment debug log lines (purely additive, no logic change)
- All of Issue 13, 14, 16

After the rollback the user reported audio still not working, so we decided to do a **folder-level restore from backup** instead of fighting it.

---

## 6. The Backup Restore Plan (TOMORROW'S FIRST TASK)

### What to RESTORE from backup
- **`apps/desktop/`** — entire folder. The user's last confirmed working audio pipeline lives here.

### What to KEEP (current code)
| Folder | Why |
|---|---|
| `apps/companion/` | Font size + auto-scan network discovery |
| `apps/ai-gateway/` | Groq transcription |
| `apps/cloud-api/` | CORS fix + `/pairing/status` endpoint (restoring this re-breaks pairing) |
| `apps/web-portal/` | No relevant changes from me |
| `packages/shared-config/`, `packages/shared-types/` | Issue 15 changes here were already reverted, current ≈ backup |

### Restore steps
1. `cp -r apps/desktop apps/desktop.broken` (keep the broken one for comparison)
2. Delete `apps/desktop/`
3. Copy `apps/desktop/` from the backup
4. Reinstall:
   ```powershell
   cd C:\Users\Delluser\Documents\application_folder\Echo_GPT\apps\desktop
   pnpm install
   pnpm tauri dev
   ```
5. Companion APK on the phone should keep working (it talks to cloud-api, not desktop)

### Optional: surgical restore
If folder-level is too coarse, the **most likely culprits** in `apps/desktop/` are the audio files:

```
src/hooks/useSessionBackground.ts          ← THE most likely culprit
src/hooks/useAudioCapture.ts
src/components/AudioCaptureControls.tsx
src/components/AIAssistance.tsx
src/services/audio.ts
src/services/chatService.ts
src/pages/SessionDetail.tsx
src/pages/NewSession.tsx
src/stores/session.ts
src-tauri/src/audio.rs
src-tauri/src/transcribe.rs
src-tauri/src/whisper.rs
src-tauri/src/lib.rs
src-tauri/src/main.rs
src-tauri/Cargo.toml
src-tauri/tauri.conf.json
src-tauri/capabilities/default.json
```

And keep the current:
```
src/lib/api.ts
src/lib/auth.ts
src/App.tsx
src/hooks/useWebSocket.ts
src/lib/ws-client.ts
```

So you keep Issue 13's background token refresh + WS auto-reconnect, but restore the audio files from backup.

### Trade-offs accepted
- ❌ No background token refresh (back to signing in every 15min of idle)
- ❌ No WS auto-reconnect after token refresh
- ✅ Audio capture, transcription, question detection → back to working
- ✅ Font size + network discovery → still in companion
- ✅ Groq transcription → still in ai-gateway
- ✅ CORS fix, pairing flow → still in cloud-api

---

## 7. Open Questions / Things to Investigate Tomorrow

1. **After restore, is the audio actually working?** If yes, we know my Issue 13–16 desktop changes were the cause. If no, the cause is in `apps/cloud-api/` or `apps/ai-gateway/` and we need to widen the restore.
2. **Was the source change to `system` correct?** User said keep it. After restore, if system-audio loopback doesn't work, try `mixed` (mic + system) for the next session.
3. **Should we make the question heuristic more generous?** Once the audio is back, ask the user what kind of questions they were missing — rephrased, follow-ups, etc. — and consider expanding `QUESTION_HINTS`.
4. **Should the 15s cooldown be shorter?** The user is noticing it as "skipped questions". Options: lower to 5s, or remove entirely (every detected question = every AI call). Risk: more API spend.
5. **Screenshots feature** is the next planned work (Review3.md "Next Planned Feature"). DeepSeek doesn't do vision — would need OpenAI / Anthropic / Gemini. The `ai-gateway/src/routes/image-analysis.ts` route already exists; just needs the right API key in `.env`.
6. **Move on to screenshots** after audio is confirmed working.

---

## 8. File Reference Cheat-Sheet

### Cloud API critical files
```
apps/cloud-api/.env                                       # CORS_ORIGIN, JWT_SECRET, DB_PATH
apps/cloud-api/src/index.ts                               # mounts all routers
apps/cloud-api/src/config.ts                              # CORS parser (merges Tauri origins)
apps/cloud-api/src/db/schema.ts                           # CREATE TABLE sessions, etc.
apps/cloud-api/src/db/index.ts                           # auto-migrations (cv_library)
apps/cloud-api/src/websocket/gateway.ts                   # auto-join user room, dual broadcast, ai.request routing
apps/cloud-api/src/websocket/events.ts                    # WsEventPayload + ClientMessage types
apps/cloud-api/src/websocket/rooms.ts                     # RoomManager
apps/cloud-api/src/routes/sessions.ts                     # /sessions CRUD
apps/cloud-api/src/routes/pairing.ts                     # /pairing/request, /verify, /status
apps/cloud-api/src/routes/auth.ts                        # /auth/login, /register, /refresh, /me
apps/cloud-api/src/routes/admin.ts                        # /admin/* (user mgmt)
apps/cloud-api/src/services/auth.ts                      # JWT signing, refresh tokens
```

### AI Gateway critical files
```
apps/ai-gateway/.env                                     # PROVIDER_KEYS, GROQ_API_KEY
apps/ai-gateway/src/index.ts                             # registers all providers
apps/ai-gateway/src/config.ts                            # provider config, corsOrigin
apps/ai-gateway/src/services/router.ts                   # AiRouter (failover, circuit breaker)
apps/ai-gateway/src/providers/deepseek.ts                # deepseek-chat, deepseek-coder, deepseek-reasoner
apps/ai-gateway/src/providers/openai.ts
apps/ai-gateway/src/providers/anthropic.ts
apps/ai-gateway/src/providers/gemini.ts
apps/ai-gateway/src/providers/openrouter.ts
apps/ai-gateway/src/providers/ollama.ts
apps/ai-gateway/src/routes/chat.ts                       # /chat, /chat/stream, /chat/context
apps/ai-gateway/src/routes/transcription.ts              # /transcribe (Groq → OpenAI fallback)
apps/ai-gateway/src/routes/image-analysis.ts             # /image-analysis (next: screenshots)
apps/ai-gateway/src/routes/embeddings.ts                 # /embeddings
apps/ai-gateway/src/routes/cv-parser.ts                  # /cv-parser
```

### Desktop critical files
```
apps/desktop/src/App.tsx                                 # bootstrap, background token refresh
apps/desktop/src/lib/api.ts                               # ApiClient with auto-refresh on 401
apps/desktop/src/lib/auth.ts                              # localStorage token helpers
apps/desktop/src/lib/ws-client.ts                        # WsClient
apps/desktop/src/hooks/useWebSocket.ts                    # ws lifecycle, ai.request handler
apps/desktop/src/hooks/useSessionBackground.ts            # auto-capture + transcribe + question detection ← the critical one
apps/desktop/src/hooks/useAudioCapture.ts                 # manual audio capture
apps/desktop/src/hooks/useAutoAudioCapture.ts             # helper hook
apps/desktop/src/components/AIAssistance.tsx             # AI chat tab
apps/desktop/src/components/AudioCaptureControls.tsx     # Capture tab UI
apps/desktop/src/components/Transcript.tsx
apps/desktop/src/components/DeviceManagement.tsx         # pairing UI
apps/desktop/src/components/ScreenshotCapture.tsx        # screenshot capture UI (for next phase)
apps/desktop/src/pages/NewSession.tsx                    # form to start a session
apps/desktop/src/pages/SessionDetail.tsx                 # the per-session page
apps/desktop/src/pages/History.tsx
apps/desktop/src/pages/Settings.tsx
apps/desktop/src/stores/session.ts                        # session store (currentSession, transcript, aiResponses)
apps/desktop/src/stores/auth.ts
apps/desktop/src/stores/settings.ts
apps/desktop/src/stores/pairing.ts
apps/desktop/src/stores/device.ts
apps/desktop/src/stores/cv.ts
apps/desktop/src/services/audio.ts                       # Tauri invoke wrappers
apps/desktop/src/services/chatService.ts                 # shared AI ask helper
apps/desktop/src/services/screenshot.ts
apps/desktop/src/services/offline.ts
apps/desktop/src/services/documentAnalysis.ts
apps/desktop/src/services/ollama.ts
apps/desktop/src-tauri/Cargo.toml
apps/desktop/src-tauri/tauri.conf.json
apps/desktop/src-tauri/capabilities/default.json
apps/desktop/src-tauri/src/lib.rs                        # Tauri commands
apps/desktop/src-tauri/src/main.rs
apps/desktop/src-tauri/src/audio.rs                      # cpal capture
apps/desktop/src-tauri/src/transcribe.rs                  # transcribe via gateway
apps/desktop/src-tauri/src/whisper.rs                    # structs (must match AI Gateway JSON)
apps/desktop/src-tauri/src/screenshot.rs
```

### Companion critical files
```
apps/companion/pubspec.yaml                              # deps (network_info_plus, shared_preferences, etc.)
apps/companion/lib/main.dart                             # MultiProvider
apps/companion/lib/services/api_service.dart             # JWT, WS, streams
apps/companion/lib/services/auth_service.dart            # login, pairing state
apps/companion/lib/services/pairing_service.dart          # polling via /pairing/status
apps/companion/lib/services/discovery_service.dart       # subnet scan
apps/companion/lib/services/display_settings.dart        # font size (KEEP)
apps/companion/lib/screens/login_screen.dart             # has "Scan local network" button
apps/companion/lib/screens/pairing_screen.dart
apps/companion/lib/screens/home_screen.dart              # 3 tabs + settings icon
apps/companion/lib/screens/assistant_screen.dart         # uses display_settings for font size
apps/companion/lib/screens/transcript_screen.dart        # uses display_settings for font size
apps/companion/lib/screens/controls_screen.dart
apps/companion/lib/screens/settings_screen.dart          # has Display section (KEEP)
apps/companion/lib/widgets/device_status.dart
```

---

## 9. Companion build instructions

```powershell
cd C:\Users\Delluser\Documents\application_folder\Echo_GPT\apps\companion
flutter pub get
flutter analyze   # optional, only info-level lints remain
flutter build apk --debug
flutter install -d <device-id>   # from `flutter devices`
```

If install fails with `INSTALL_FAILED_UPDATE_INCOMPATIBLE`:
```powershell
adb uninstall com.example.echo_companion
flutter install -d <device-id>
```

---

## 10. End-of-day current state

- **Backend services:** should still be running. To restart: `pnpm --parallel -r dev` from the repo root.
- **Desktop:** broken audio pipeline. User has backup ready.
- **Companion APK:** installed on phone, working (paired, receiving messages).
- **Cloud API:** has all fixes (CORS, pairing/status, transcription_interval migration).
- **AI Gateway:** has Groq Whisper transcription (user added GROQ_API_KEY).
- **Transcripts in DB:** are accumulating for past sessions (good — preserved).

The two big things the user is happy with and wants to keep:
1. Companion font size control
2. Local-network pair flow (phone ↔ desktop via scan, not over internet)

---

**Tomorrow's first action:** restore `apps/desktop/` from the backup, then re-test audio capture + question detection with the per-segment logs in the Tauri dev console to confirm everything is back to the Review3.md state.
