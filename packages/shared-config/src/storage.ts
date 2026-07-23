export const STORAGE = {
  DEFAULT_DB_PATH: './data/echo.db',
  MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024,
  MAX_CV_SIZE_BYTES: 5 * 1024 * 1024,
  /**
   * Cap for a screenshot going from desktop to cloud storage (multipart
   * upload). Pairs with the stricter `@echo-gpt/shared-types` constant
   * `MAX_IMAGE_BYTES` which is the per-image limit on the AI gateway
   * `/chat` route.
   *
   * Byte units: BOTH limits are measured on the RAW image bytes (PNG file
   * size), NOT on the base64-encoded data-URL length that the chat
   * payload actually contains. Base64 expands by ~4/3, so a 4 MB raw PNG
   * encodes to roughly 4 * 4/3 ≈ 5.3 MB of base64 text. With the desktop
   * downscaler (Phase 4) keeping raw screenshots under
   *   MAX_SCREENSHOT_SIZE_BYTES (5 MB pre-encode)
   * the post-encode chat payload is at most
   *   MAX_IMAGE_BYTES * 4/3 ≈ 5.3 MB encoded
   * which clears the Express `json({ limit: '10mb' })` body ceiling on
   * the AI gateway once the surrounding context messages are subtracted.
   */
  MAX_SCREENSHOT_SIZE_BYTES: 5 * 1024 * 1024,
  MAX_BULK_FILES: 10,
  CHUNK_SIZE_BYTES: 5 * 1024 * 1024,
  THUMBNAIL_WIDTH: 320,
  THUMBNAIL_HEIGHT: 240,
} as const;

export const AUTO_DELETE = {
  DEFAULT_DAYS: 90,
  OPTIONS_DAYS: [30, 60, 90, 180, 365],
} as const;

export const SESSION = {
  MAX_RECORDING_DURATION_MINUTES: 480,
  AUTO_SAVE_INTERVAL_SECONDS: 30,
  MAX_TRANSCRIPT_LENGTH: 100_000,
} as const;
