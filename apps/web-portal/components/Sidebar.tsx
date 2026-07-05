'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  History,
  BookOpen,
  Monitor,
  CreditCard,
  User,
  Search,
  LogOut,
} from 'lucide-react';
import { clearTokens } from '@/lib/api';

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/sessions', label: 'Sessions', icon: History },
  { href: '/cv-library', label: 'CV Library', icon: BookOpen },
  { href: '/devices', label: 'Devices', icon: Monitor },
  { href: '/subscription', label: 'Subscription', icon: CreditCard },
  { href: '/profile', label: 'Profile', icon: User },
  { href: '/search', label: 'Search', icon: Search },
];

export function Sidebar() {
  const pathname = usePathname();

  const handleLogout = () => {
    clearTokens();
    window.location.href = '/login';
  };

  return (
    <aside className="w-56 min-h-screen bg-zinc-900 border-r border-zinc-800 p-4 flex flex-col">
      <div className="text-lg font-bold mb-8 px-3">Echo GPT</div>
      <nav className="flex-1 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${pathname === href ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'}`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </Link>
        ))}
      </nav>
      <button
        onClick={handleLogout}
        className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-red-400 hover:bg-zinc-800/50 transition mt-4"
      >
        <LogOut className="w-4 h-4" />
        Logout
      </button>
    </aside>
  );
}
