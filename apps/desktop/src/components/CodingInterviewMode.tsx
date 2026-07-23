import { useState } from 'react';
import { Code2, Sparkles, BarChart3, Beaker, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui/select';

const languages = [
  'JavaScript',
  'Python',
  'TypeScript',
  'Java',
  'Go',
  'Rust',
  'C++',
  'Ruby',
  'PHP',
  'Swift',
  'Kotlin',
  'C#',
];

const sampleCode = `function twoSum(nums: number[], target: number): number[] {
  const map = new Map<number, number>();

  for (let i = 0; i < nums.length; i++) {
    const complement = target - nums[i];
    if (map.has(complement)) {
      return [map.get(complement)!, i];
    }
    map.set(nums[i], i);
  }

  return [];
}`;

export default function CodingInterviewMode() {
  const [language, setLanguage] = useState('TypeScript');
  const [code] = useState(sampleCode);
  const [complexity, setComplexity] = useState<{ time: string; space: string } | null>(null);
  const [testCases, setTestCases] = useState<string[]>([]);
  const [showExplanation, setShowExplanation] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);

  const handleAskAI = () => {
    setAnalysisOpen(true);
    setComplexity({ time: 'O(n)', space: 'O(n)' });
    setTestCases([
      'Input: nums = [2,7,11,15], target = 9 → Expected: [0,1]',
      'Input: nums = [3,2,4], target = 6 → Expected: [1,2]',
      'Input: nums = [3,3], target = 6 → Expected: [0,1]',
    ]);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Code2 className="h-5 w-5 text-indigo-500" />
          Coding Interview
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {languages.map((lang) => (
                <SelectItem key={lang} value={lang}>
                  {lang}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex-1" />
          <Button size="sm" onClick={handleAskAI} className="gap-2">
            <Sparkles className="h-4 w-4" />
            Ask AI about this code
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowExplanation(!showExplanation)}>
            {showExplanation ? 'Hide' : 'Show'} Explanation
          </Button>
        </div>

        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-950 p-4">
          <pre className="overflow-x-auto text-sm text-zinc-700 dark:text-zinc-300">
            <code>{code}</code>
          </pre>
        </div>

        {showExplanation && (
          <div className="rounded-lg bg-zinc-100 dark:bg-zinc-800 p-4 text-sm text-zinc-700 dark:text-zinc-300">
            <p className="font-medium text-zinc-900 dark:text-zinc-100 mb-1">Explanation</p>
            <p>
              This function uses a hash map to store previously seen numbers and their indices. For
              each element, it checks if the complement (target - current) already exists in the
              map. If found, it returns the indices of the two numbers. This achieves O(n) time
              complexity compared to the brute force O(n²) approach.
            </p>
          </div>
        )}

        {analysisOpen && (
          <div className="space-y-3">
            <button
              onClick={() => setAnalysisOpen(!analysisOpen)}
              className="flex w-full items-center gap-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 p-3 text-sm font-medium text-zinc-900 dark:text-zinc-100"
            >
              {analysisOpen ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              Analysis Results
            </button>

            {complexity && (
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <BarChart3 className="h-4 w-4 text-emerald-500" />
                    <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      Time Complexity
                    </span>
                  </div>
                  <span className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                    {complexity.time}
                  </span>
                </div>
                <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <BarChart3 className="h-4 w-4 text-emerald-500" />
                    <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      Space Complexity
                    </span>
                  </div>
                  <span className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                    {complexity.space}
                  </span>
                </div>
              </div>
            )}

            {testCases.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  <Beaker className="h-4 w-4 text-indigo-500" />
                  Test Case Suggestions
                </div>
                {testCases.map((tc, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100/50 dark:bg-zinc-900/50 p-3 text-sm text-zinc-700 dark:text-zinc-300"
                  >
                    {tc}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
