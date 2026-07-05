# System Architecture

Echo is a distributed platform composed of:
- Echo Desktop (Windows/macOS/Linux)
- Echo Companion (Android/iOS)
- Echo Cloud API (Laravel 12)
- Echo AI Gateway
- Echo Web Portal

Principles:
- Desktop is the processing hub.
- Cloud manages identity, licensing, sync and configuration.
- Companion is a secure second-screen.
- AI Gateway abstracts AI providers.
- Web Portal manages historical data and administration.

Core communication:
- HTTPS REST
- WebSockets
- Local LAN pairing
- Optional cloud relay
