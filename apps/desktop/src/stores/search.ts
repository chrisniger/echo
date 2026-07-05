import { create } from 'zustand';
import { api } from '../lib/api';

export interface SearchResult {
  id: string;
  sessionId: string;
  sessionName: string;
  snippet: string;
  matchStart: number;
  matchEnd: number;
  date: string;
  type: 'transcript' | 'response' | 'document';
}

export interface SearchFilters {
  dateFrom?: string;
  dateTo?: string;
  tags?: string[];
  sessionIds?: string[];
}

interface SearchState {
  query: string;
  results: SearchResult[];
  isSearching: boolean;
  filters: SearchFilters;
  search: (query: string, filters?: SearchFilters) => Promise<void>;
  clearSearch: () => void;
  setFilters: (filters: SearchFilters) => void;
}

export const useSearchStore = create<SearchState>((set) => ({
  query: '',
  results: [],
  isSearching: false,
  filters: {},

  search: async (query: string, filters?: SearchFilters) => {
    set({ query, isSearching: true, filters: filters || {} });
    try {
      const params: Record<string, string> = { q: query };
      const f = filters || {};
      if (f.dateFrom) params.dateFrom = f.dateFrom;
      if (f.dateTo) params.dateTo = f.dateTo;
      if (f.tags?.length) params.tags = f.tags.join(',');
      if (f.sessionIds?.length) params.sessionIds = f.sessionIds.join(',');

      const res = await api.get<{ results: SearchResult[] }>('/search', { params });
      set({ results: res.results, isSearching: false });
    } catch {
      set({ results: [], isSearching: false });
    }
  },

  clearSearch: () => {
    set({ query: '', results: [], filters: {} });
  },

  setFilters: (filters: SearchFilters) => {
    set({ filters });
  },
}));
