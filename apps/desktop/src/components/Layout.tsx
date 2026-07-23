import { useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  PlusCircle,
  History,
  Settings,
  LogOut,
  Menu,
  Bot,
  User,
  FileText,
  Minimize2,
  Mic,
} from 'lucide-react';
import { useAuthStore } from '../stores/auth';
import { useSessionStore } from '../stores/session';
import { useDeviceStore } from '../stores/device';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import FloatingAssistant from './FloatingAssistant';
import ConnectedDevices from './ConnectedDevices';
import Toasts from './Toasts';
import { invoke } from '@tauri-apps/api/core';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/new-session', label: 'New Session', icon: PlusCircle },
  { to: '/history', label: 'History', icon: History },
  { to: '/cv-library', label: 'CV Library', icon: FileText },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const { user, logout } = useAuthStore();
  const { currentSession } = useSessionStore();
  const { connectedDevices } = useDeviceStore();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleHideToTray = async () => {
    try {
      await invoke('hide_to_tray');
    } catch (e) {
      console.error('Failed to hide to tray:', e);
    }
  };

  const isActiveSession = currentSession?.status === 'active';
  const isOnSessionPage = location.pathname.startsWith('/sessions/');

  return (
    <div className="flex h-screen overflow-hidden bg-white dark:bg-zinc-950">
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-zinc-200 bg-zinc-50 transition-transform duration-200 dark:border-zinc-800 dark:bg-zinc-900 lg:static lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center gap-2 border-b border-zinc-200 px-6 dark:border-zinc-800">
          <Bot className="h-8 w-8 text-indigo-500" />
          <span className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Echo GPT</span>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-indigo-100 text-indigo-900 dark:bg-zinc-800 dark:text-zinc-100'
                    : 'text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/50 dark:hover:text-zinc-100',
                )
              }
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {isActiveSession && !isOnSessionPage && (
          <div className="mx-3 mb-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/20">
                <Mic className="h-4 w-4 text-emerald-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-emerald-400">Active Session</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                  {currentSession.name}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="w-full text-xs"
              onClick={() => navigate(`/sessions/${currentSession.id}`)}
            >
              View Session
            </Button>
          </div>
        )}

        {connectedDevices.length > 0 && (
          <div className="mx-3 mb-4">
            <ConnectedDevices />
          </div>
        )}

        <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-200 dark:bg-zinc-800">
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
              ) : (
                <User className="h-5 w-5 text-zinc-500 dark:text-zinc-400" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-zinc-900 truncate dark:text-zinc-100">
                {user?.name || 'User'}
              </p>
              <p className="text-xs text-zinc-500 truncate dark:text-zinc-400">
                {user?.email || ''}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-zinc-500 dark:text-zinc-400"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </aside>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className="flex flex-1 flex-col min-w-0">
        <header className="flex h-16 items-center gap-4 border-b border-zinc-200 px-4 dark:border-zinc-800 lg:px-6">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 lg:hidden"
          >
            <Menu className="h-6 w-6" />
          </button>

          <div className="flex-1" />

          {isActiveSession && (
            <div className="flex items-center gap-2 rounded-full bg-emerald-500/20 px-3 py-1">
              <div className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
              <span className="text-xs font-medium text-emerald-400">Listening</span>
            </div>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={handleHideToTray}
            className="gap-2 text-zinc-500 dark:text-zinc-400"
            title="Hide to system tray"
          >
            <Minimize2 className="h-4 w-4" />
            <span className="hidden sm:inline">Hide</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setAssistantOpen(!assistantOpen)}
            className="gap-2"
          >
            <Bot className="h-4 w-4" />
            {assistantOpen ? 'Hide Assistant' : 'Assistant'}
          </Button>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>

      {assistantOpen && <FloatingAssistant onClose={() => setAssistantOpen(false)} />}

      <Toasts />
    </div>
  );
}
