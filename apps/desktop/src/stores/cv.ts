import { create } from 'zustand';
import type { CvDocument } from '@echo-gpt/shared-types';
import { api } from '../lib/api';

const STORAGE_KEY = 'echo_cv_list';

interface CvState {
  cvList: CvDocument[];
  currentCv: CvDocument | null;
  isLoading: boolean;
  fetchCvs: () => Promise<void>;
  uploadCv: (file: File, tags?: string[]) => Promise<void>;
  deleteCv: (id: string) => Promise<void>;
  setDefaultCv: (id: string) => Promise<void>;
  updateCv: (id: string, data: Partial<CvDocument>) => Promise<void>;
}

function loadLocalCvs(): CvDocument[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function persistLocalCvs(cvs: CvDocument[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cvs));
}

export const useCvStore = create<CvState>((set, get) => ({
  cvList: loadLocalCvs(),
  currentCv: null,
  isLoading: false,

  fetchCvs: async () => {
    set({ isLoading: true });
    try {
      const res = await api.get<{ cvs: CvDocument[] }>('/cvs');
      set({ cvList: res.cvs, isLoading: false });
      persistLocalCvs(res.cvs);
    } catch {
      const local = loadLocalCvs();
      set({ cvList: local, isLoading: false });
    }
  },

  uploadCv: async (file: File, tags?: string[]) => {
    set({ isLoading: true });
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (tags) {
        formData.append('tags', JSON.stringify(tags));
      }
      const cv = await api.post<CvDocument>('/cvs/upload', formData);
      set((state) => ({ cvList: [cv, ...state.cvList], currentCv: cv, isLoading: false }));
      persistLocalCvs([cv, ...get().cvList]);
    } catch {
      set({ isLoading: false });
    }
  },

  deleteCv: async (id: string) => {
    set({ isLoading: true });
    try {
      await api.delete(`/cvs/${id}`);
      set((state) => ({
        cvList: state.cvList.filter((cv) => cv.id !== id),
        currentCv: state.currentCv?.id === id ? null : state.currentCv,
        isLoading: false,
      }));
      persistLocalCvs(get().cvList.filter((cv) => cv.id !== id));
    } catch {
      set({ isLoading: false });
    }
  },

  setDefaultCv: async (id: string) => {
    try {
      const updated = await api.post<CvDocument>(`/cvs/${id}/default`);
      set((state) => ({
        cvList: state.cvList.map((cv) => ({
          ...cv,
          isDefault: cv.id === id,
        })),
        currentCv: state.currentCv?.id === id ? updated : state.currentCv,
      }));
    } catch {
      // ignore
    }
  },

  updateCv: async (id: string, data: Partial<CvDocument>) => {
    try {
      const updated = await api.put<CvDocument>(`/cvs/${id}`, data);
      set((state) => ({
        cvList: state.cvList.map((cv) => (cv.id === id ? updated : cv)),
        currentCv: state.currentCv?.id === id ? updated : state.currentCv,
      }));
      persistLocalCvs(get().cvList.map((cv) => (cv.id === id ? updated : cv)));
    } catch {
      // ignore
    }
  },
}));
