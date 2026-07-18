import { useState, useEffect } from 'react';
import { FileText, Search, Sparkles, ChevronDown, ChevronRight, Loader2, FileUp } from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { useCvStore } from '../stores/cv';
import { analyzeDocument, type DocumentAnalysis } from '../services/documentAnalysis';

interface DocumentItem {
  id: string;
  name: string;
  status: 'pending' | 'analyzing' | 'analyzed';
  keyPoints?: string[];
  summary?: string;
  parsedText?: string | null;
}

export default function DocumentAnalysis() {
  const { cvList, fetchCvs } = useCvStore();
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set());
  const [extractingId, setExtractingId] = useState<string | null>(null);
  const [summarizingId, setSummarizingId] = useState<string | null>(null);

  useEffect(() => {
    fetchCvs();
  }, [fetchCvs]);

  useEffect(() => {
    // Convert CV list to document items
    setDocuments(cvList.map(cv => ({
      id: cv.id,
      name: cv.name,
      status: cv.parsedText ? 'analyzed' : 'pending',
      parsedText: cv.parsedText,
    })));
  }, [cvList]);

  const toggleExpand = (id: string) => {
    setExpandedDocs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExtractKeyPoints = async (id: string) => {
    const doc = documents.find(d => d.id === id);
    if (!doc?.parsedText) return;

    setExtractingId(id);
    try {
      const analysis = await analyzeDocument(doc.parsedText, {
        extractKeyPoints: true,
        summarize: false,
      });
      
      setDocuments((prev) =>
        prev.map((d) =>
          d.id === id
            ? { ...d, status: 'analyzed', keyPoints: analysis.keyPoints }
            : d,
        ),
      );
    } catch (error) {
      console.error('Failed to extract key points:', error);
    } finally {
      setExtractingId(null);
    }
  };

  const handleSummarize = async (id: string) => {
    const doc = documents.find(d => d.id === id);
    if (!doc?.parsedText) return;

    setSummarizingId(id);
    try {
      const analysis = await analyzeDocument(doc.parsedText, {
        extractKeyPoints: false,
        summarize: true,
      });
      
      setDocuments((prev) =>
        prev.map((d) =>
          d.id === id
            ? { ...d, status: 'analyzed', summary: analysis.summary }
            : d,
        ),
      );
    } catch (error) {
      console.error('Failed to summarize:', error);
    } finally {
      setSummarizingId(null);
    }
  };

  const filteredDocs = documents.filter((doc) =>
    doc.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-indigo-500" />
          Document Analysis
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search across documents..."
            className="flex h-10 w-full rounded-md border border-zinc-700 bg-zinc-900 pl-10 pr-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {filteredDocs.length === 0 ? (
          <div className="flex flex-col items-center py-8">
            <FileUp className="mb-2 h-8 w-8 text-zinc-600" />
            <p className="text-sm text-zinc-500">No documents found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredDocs.map((doc) => (
              <div key={doc.id} className="rounded-lg border border-zinc-800 bg-zinc-900/50">
                <button
                  onClick={() => toggleExpand(doc.id)}
                  className="flex w-full items-center gap-3 p-3 text-left"
                >
                  {expandedDocs.has(doc.id) ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-zinc-500" />
                  )}
                  <FileText className="h-4 w-4 shrink-0 text-indigo-500" />
                  <span className="flex-1 text-sm font-medium text-zinc-100 truncate">
                    {doc.name}
                  </span>
                  <Badge
                    variant={
                      doc.status === 'analyzed'
                        ? 'success'
                        : doc.status === 'analyzing'
                        ? 'warning'
                        : 'secondary'
                    }
                    className="text-xs"
                  >
                    {doc.status}
                  </Badge>
                </button>

                {expandedDocs.has(doc.id) && (
                  <div className="border-t border-zinc-800 p-3 space-y-3">
                    {doc.status === 'pending' && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleExtractKeyPoints(doc.id)}
                          disabled={extractingId === doc.id}
                          className="gap-1.5"
                        >
                          {extractingId === doc.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Sparkles className="h-3.5 w-3.5" />
                          )}
                          Extract Key Points
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleSummarize(doc.id)}
                          disabled={summarizingId === doc.id}
                          className="gap-1.5"
                        >
                          {summarizingId === doc.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <FileText className="h-3.5 w-3.5" />
                          )}
                          Summarize
                        </Button>
                      </div>
                    )}

                    {doc.keyPoints && doc.keyPoints.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-zinc-400 mb-1">Key Points</p>
                        <ul className="space-y-1">
                          {doc.keyPoints.map((point, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />
                              {point}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {doc.summary && (
                      <div>
                        <p className="text-xs font-medium text-zinc-400 mb-1">Summary</p>
                        <p className="text-sm text-zinc-300">{doc.summary}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
