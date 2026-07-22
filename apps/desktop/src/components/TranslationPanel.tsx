import { useState } from 'react';
import { Languages, ArrowRightLeft, Sparkles, RefreshCw } from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui/select';

const languages = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'zh', label: 'Chinese' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'ar', label: 'Arabic' },
  { value: 'ru', label: 'Russian' },
];

type TranslationMode = 'side-by-side' | 'overlay' | 'replace';

export default function TranslationPanel() {
  const [sourceLang, setSourceLang] = useState('en');
  const [targetLang, setTargetLang] = useState('es');
  const [isTranslating, setIsTranslating] = useState(false);
  const [mode, setMode] = useState<TranslationMode>('side-by-side');
  const [autoTranslate, setAutoTranslate] = useState(false);

  const handleSwap = () => {
    setSourceLang(targetLang);
    setTargetLang(sourceLang);
  };

  const handleTranslate = async () => {
    setIsTranslating(true);
    await new Promise((r) => setTimeout(r, 1500));
    setIsTranslating(false);
  };

  const modeOptions: { value: TranslationMode; label: string }[] = [
    { value: 'side-by-side', label: 'Side by Side' },
    { value: 'overlay', label: 'Overlay' },
    { value: 'replace', label: 'Replace' },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Languages className="h-5 w-5 text-indigo-500" />
          Translation
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Label className="mb-1 block">From</Label>
            <Select value={sourceLang} onValueChange={setSourceLang}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {languages.map((l) => (
                  <SelectItem key={l.value} value={l.value}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="ghost" size="icon" onClick={handleSwap} className="mb-0.5">
            <ArrowRightLeft className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
          </Button>
          <div className="flex-1">
            <Label className="mb-1 block">To</Label>
            <Select value={targetLang} onValueChange={setTargetLang}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {languages.map((l) => (
                  <SelectItem key={l.value} value={l.value}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button onClick={handleTranslate} disabled={isTranslating} className="w-full gap-2">
          {isTranslating ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {isTranslating ? 'Translating...' : 'Translate Transcript'}
        </Button>

        <div className="space-y-2">
          <Label>Display Mode</Label>
          <div className="flex gap-2">
            {modeOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setMode(opt.value)}
                className={cn(
                  'flex-1 rounded-md border px-3 py-2 text-sm transition-colors',
                  mode === opt.value
                    ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400'
                    : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-700',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg bg-zinc-50/50 dark:bg-zinc-800/50 px-4 py-3">
          <div>
            <Label>Auto-translate</Label>
            <p className="text-xs text-zinc-500">Real-time translation of incoming transcript</p>
          </div>
          <Switch checked={autoTranslate} onCheckedChange={setAutoTranslate} />
        </div>
      </CardContent>
    </Card>
  );
}
