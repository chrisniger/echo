export interface TranscriptionIntervalOption {
  value: number;
  label: string;
  description: string;
}

export const TRANSCRIPTION_INTERVAL_OPTIONS: TranscriptionIntervalOption[] = [
  { value: 2000, label: '2 seconds', description: 'Faster capture, more API activity' },
  { value: 5000, label: '5 seconds', description: 'Balanced default' },
  { value: 10000, label: '10 seconds', description: 'Lower overhead' },
  { value: 15000, label: '15 seconds', description: 'Slower polling' },
  { value: 30000, label: '30 seconds', description: 'Longest interval' },
];

export function formatTranscriptionInterval(ms: number): string {
  if (ms % 1000 !== 0) return `${ms} ms`;
  const seconds = ms / 1000;
  return seconds === 1 ? '1 second' : `${seconds} seconds`;
}
