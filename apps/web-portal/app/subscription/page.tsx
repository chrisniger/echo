'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getToken } from '@/lib/api';
import { Sidebar } from '@/components/Sidebar';
import { CreditCard, CheckCircle, XCircle } from 'lucide-react';

interface Subscription {
  planName: string;
  status: string;
  currentPeriodEnd?: string;
  features?: string[];
  usageQuota?: { sessions?: number; tokens?: number; storage?: number };
  usageCurrent?: { sessions?: number; tokens?: number; storage?: number };
}

export default function SubscriptionPage() {
  const router = useRouter();
  const [sub, setSub] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      router.push('/login');
      return;
    }
    fetchSubscription();
  }, []);

  const fetchSubscription = async () => {
    try {
      setSub(await api.get<Subscription>('/api/subscriptions').catch(() => null));
    } catch {}
    setLoading(false);
  };

  if (loading)
    return (
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-8">Loading...</main>
      </div>
    );

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-8">
        <h1 className="text-3xl font-bold mb-6">Subscription</h1>
        {!sub ? (
          <div className="text-center py-16 text-zinc-500">
            <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No active subscription</p>
            <button className="mt-4 px-4 py-2 bg-echo-600 rounded-lg hover:bg-echo-700 text-sm">
              View Plans
            </button>
          </div>
        ) : (
          <div className="space-y-6 max-w-2xl">
            <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-lg">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold">{sub.planName}</h2>
                  <p className="text-sm text-zinc-400 capitalize">{sub.status}</p>
                </div>
                {sub.status === 'active' ? (
                  <CheckCircle className="w-6 h-6 text-green-400" />
                ) : (
                  <XCircle className="w-6 h-6 text-red-400" />
                )}
              </div>
              {sub.currentPeriodEnd && (
                <p className="text-sm text-zinc-500">
                  Renewal: {new Date(sub.currentPeriodEnd).toLocaleDateString()}
                </p>
              )}
            </div>
            {sub.features && sub.features.length > 0 && (
              <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
                <h3 className="font-semibold mb-3">Features</h3>
                <ul className="space-y-2">
                  {sub.features.map((f, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <CheckCircle className="w-4 h-4 text-green-400" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {sub.usageQuota && (
              <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
                <h3 className="font-semibold mb-3">Usage</h3>
                <div className="space-y-3">
                  {sub.usageQuota.sessions && (
                    <UsageBar
                      label="Sessions"
                      current={sub.usageCurrent?.sessions ?? 0}
                      max={sub.usageQuota.sessions}
                    />
                  )}
                  {sub.usageQuota.tokens && (
                    <UsageBar
                      label="Tokens"
                      current={sub.usageCurrent?.tokens ?? 0}
                      max={sub.usageQuota.tokens}
                    />
                  )}
                  {sub.usageQuota.storage && (
                    <UsageBar
                      label="Storage (MB)"
                      current={sub.usageCurrent?.storage ?? 0}
                      max={sub.usageQuota.storage}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function UsageBar({ label, current, max }: { label: string; current: number; max: number }) {
  const pct = Math.min((current / max) * 100, 100);
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span>{label}</span>
        <span>
          {current.toLocaleString()} / {max.toLocaleString()}
        </span>
      </div>
      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-echo-600 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
