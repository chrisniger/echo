# al 1 - AI Gateway

cd D:\Chris\Echo_GPT\apps\ai-gateway
pnpm dev

# Terminal 2 - Cloud API

cd D:\Chris\Echo_GPT\apps\cloud-api
pnpm dev

# Terminal 3 - Tauri Desktop (this opens the window)

cd D:\Chris\Echo_GPT\apps\desktop
pnpm tauri:dev

Yes, the code changes are done. Here's the status:
✅ Done

- Desktop QR code now uses your PC's real LAN IP instead of localhost
- Companion app rejects localhost and falls back to network discovery
- flutter analyze passes
- pnpm typecheck for desktop passes
  ⏳ Not done yet (you need to do this)
  You still need to build and run the updated apps:

1. Rebuild the desktop app (so the new Tauri get_local_ip command is compiled):
   // powershell
   cd apps/desktop
   pnpm install
   pnpm tauri build
2. Make sure Cloud API is running:
   // powershell
   cd apps/cloud-api
   pnpm dev
3. Rebuild and install the companion APK:
   // powershell
   cd apps/companion
   flutter build apk --debug
   adb install build/app/outputs/flutter-apk/app-debug.apk
4. Test: Open desktop → Pair New Device → scan QR code from phone → approve on desktop.
