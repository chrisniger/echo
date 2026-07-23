import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Calendar, Filter, X, MessageSquare, FileText as FileTextIcon } from 'lucide-react';
import { useSearchStore } from '../stores/search';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Input } from './ui/input';

const typeIcons = {
  transcript: MessageSquare,
  response: MessageSquare,
  document: FileTextIcon,
};

const typeColors: Record<string, string> = {
  transcript: 'text-blue-500',
  response: 'text-emerald-500',
  document: 'text-amber-500',
};

export default function SemanticSearch() {
  const { query, results, isSearching, filters, search, clearSearch, setFilters } =
    useSearchStore();
  const navigate = useNavigate();
  const [localQuery, setLocalQuery] = useState(query);
  const [showFilters, setShowFilters] = useState(false);
  const [dateFrom, setDateFrom] = useState(filters.dateFrom || '');
  const [dateTo, setDateTo] = useState(filters.dateTo || '');

  const handleSearch = useCallback(() => {
    if (!localQuery.trim()) return;
    search(localQuery.trim(), {
      ...filters,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    });
  }, [localQuery, filters, dateFrom, dateTo, search]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const applyFilters = () => {
    setFilters({ dateFrom: dateFrom || undefined, dateTo: dateTo || undefined });
    if (localQuery.trim()) {
      search(localQuery.trim(), { dateFrom: dateFrom || undefined, dateTo: dateTo || undefined });
    }
  };

  const groupedResults = results.reduce<Record<string, typeof results>>((acc, r) => {
    if (!acc[r.sessionId]) acc[r.sessionId] = [];
    acc[r.sessionId].push(r);
    return acc;
  }, {});

  function highlightSnippet(snippet: string, query: string): string {
    if (!query) return snippet;
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return snippet.replace(
      new RegExp(`(${escaped})`, 'gi'),
      '<mark class="bg-indigo-600/30 text-indigo-200 rounded px-0.5">$1</mark>',
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="h-5 w-5 text-indigo-500" />
          Semantic Search
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={localQuery}
              onChange={(e) => setLocalQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search across all sessions..."
              className="flex h-10 w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 pl-10 pr-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <Button onClick={handleSearch} disabled={isSearching || !localQuery.trim()}>
            Search
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setShowFilters(!showFilters)}
            className={cn(showFilters && 'border-indigo-500 text-indigo-500')}
          >
            <Filter className="h-4 w-4" />
          </Button>
        </div>

        {showFilters && (
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100/50 dark:bg-zinc-900/50 p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 block">
                  From
                </label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 block">
                  To
                </label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
            </div>
            <Button size="sm" variant="secondary" onClick={applyFilters} className="w-full">
              Apply Filters
            </Button>
          </div>
        )}

        {isSearching && (
          <div className="flex items-center justify-center py-8">
            <div className="flex gap-1">
              <div className="h-2 w-2 animate-bounce rounded-full bg-indigo-500" />
              <div
                className="h-2 w-2 animate-bounce rounded-full bg-indigo-500"
                style={{ animationDelay: '0.1s' }}
              />
              <div
                className="h-2 w-2 animate-bounce rounded-full bg-indigo-500"
                style={{ animationDelay: '0.2s' }}
              />
            </div>
          </div>
        )}

        {!isSearching && Object.keys(groupedResults).length > 0 && (
          <div className="space-y-4">
            {Object.entries(groupedResults).map(([sessionId, sessionResults]) => (
              <div key={sessionId}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    {sessionResults[0].sessionName}
                  </span>
                  <span className="text-xs text-zinc-500 flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {new Date(sessionResults[0].date).toLocaleDateString()}
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {sessionResults.length} result{sessionResults.length > 1 ? 's' : ''}
                  </Badge>
                </div>
                <div className="space-y-1">
                  {sessionResults.map((result) => (
                    <button
                      key={result.id}
                      onClick={() => navigate(`/sessions/${result.sessionId}`)}
                      className="flex w-full items-start gap-3 rounded-md p-3 text-left hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                    >
                      <div className={cn('mt-0.5', typeColors[result.type])}>
                        {(() => {
                          const Icon = typeIcons[result.type];
                          return <Icon className="h-4 w-4" />;
                        })()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p
                          className="text-sm text-zinc-700 dark:text-zinc-300 line-clamp-2"
                          dangerouslySetInnerHTML={{
                            __html: highlightSnippet(result.snippet, query),
                          }}
                        />
                        <div className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
                          <span className="capitalize">{result.type}</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {!isSearching && query && !results.length && (
          <div className="flex flex-col items-center py-8">
            <Search className="mb-2 h-8 w-8 text-zinc-600" />
            <p className="text-sm text-zinc-500">No results found for "{query}"</p>
            <Button variant="ghost" size="sm" className="mt-2" onClick={clearSearch}>
              <X className="mr-1 h-3 w-3" />
              Clear search
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
