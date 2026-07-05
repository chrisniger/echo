import { create } from 'zustand';
import type { AuthResponse, UserProfile, LoginRequest, RegisterRequest } from '@echo-gpt/shared-types';
import { api } from '../lib/api';
import { storeTokens, clearTokens } from '../lib/auth';

interface AuthState {
  user: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  fetchMe: () => Promise<void>;
  updateProfile: (data: Partial<UserProfile>) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: false,
  isAuthenticated: false,

  login: async (email: string, password: string) => {
    set({ isLoading: true });
    try {
      const payload: LoginRequest = { email, password };
      const res = await api.post<AuthResponse>('/auth/login', payload);
      storeTokens(res.tokens);
      set({ user: res.user, isAuthenticated: true, isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  register: async (name: string, email: string, password: string) => {
    set({ isLoading: true });
    try {
      const payload: RegisterRequest = { name, email, password, passwordConfirmation: password };
      const res = await api.post<AuthResponse>('/auth/register', payload);
      storeTokens(res.tokens);
      set({ user: res.user, isAuthenticated: true, isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  logout: () => {
    clearTokens();
    set({ user: null, isAuthenticated: false });
  },

  fetchMe: async () => {
    set({ isLoading: true });
    try {
      const res = await api.get<{ user: UserProfile }>('/auth/me');
      set({ user: res.user, isAuthenticated: true, isLoading: false });
    } catch {
      clearTokens();
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  updateProfile: async (data: Partial<UserProfile>) => {
    const res = await api.put<{ user: UserProfile }>('/auth/me', data);
    set({ user: res.user });
  },
}));
