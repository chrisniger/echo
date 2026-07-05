import { useState } from 'react';
import { Puzzle, Settings, Shield, ChevronDown, ChevronRight, ExternalLink, Power, PowerOff } from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';

interface PluginPermission {
  name: string;
  description: string;
}

interface PluginEntry {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  enabled: boolean;
  permissions: PluginPermission[];
  settings?: Record<string, string>;
}

const mockPlugins: PluginEntry[] = [
  {
    id: 'jira',
    name: 'Jira',
    description: 'Create and update Jira tickets directly from Echo sessions',
    version: '1.2.0',
    author: 'Echo Team',
    enabled: true,
    permissions: [
      { name: 'Read projects', description: 'View Jira projects and issues' },
      { name: 'Create issues', description: 'Create new Jira tickets' },
      { name: 'Update issues', description: 'Update existing ticket status' },
    ],
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Send session summaries and action items to Slack channels',
    version: '1.0.1',
    author: 'Echo Team',
    enabled: false,
    permissions: [
      { name: 'Send messages', description: 'Post messages to channels' },
      { name: 'Read channels', description: 'Read channel history' },
    ],
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'Link sessions to GitHub issues, PRs, and code reviews',
    version: '0.9.0',
    author: 'Echo Team',
    enabled: true,
    permissions: [
      { name: 'Read repos', description: 'View repository data' },
      { name: 'Create issues', description: 'Create GitHub issues' },
      { name: 'Read PRs', description: 'View pull request status' },
    ],
  },
];

export default function PluginManager() {
  const [plugins, setPlugins] = useState<PluginEntry[]>(mockPlugins);
  const [expandedPlugin, setExpandedPlugin] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState<string | null>(null);

  const togglePlugin = (id: string) => {
    setPlugins((prev) =>
      prev.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p)),
    );
  };

  const currentPlugin = expandedPlugin
    ? plugins.find((p) => p.id === expandedPlugin)
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Puzzle className="h-5 w-5 text-indigo-500" />
          Plugin Manager
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {plugins.length === 0 ? (
          <div className="flex flex-col items-center py-8">
            <Puzzle className="mb-2 h-8 w-8 text-zinc-600" />
            <p className="text-sm text-zinc-500">No plugins installed</p>
          </div>
        ) : (
          plugins.map((plugin) => (
            <div
              key={plugin.id}
              className="rounded-lg border border-zinc-800 bg-zinc-900/50 overflow-hidden"
            >
              <div className="flex items-center gap-3 p-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-800">
                  <Puzzle className="h-5 w-5 text-indigo-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-100">{plugin.name}</span>
                    <Badge variant="outline" className="text-xs">{plugin.version}</Badge>
                  </div>
                  <p className="text-xs text-zinc-500 truncate">{plugin.description}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Switch
                    checked={plugin.enabled}
                    onCheckedChange={() => togglePlugin(plugin.id)}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setExpandedPlugin(expandedPlugin === plugin.id ? null : plugin.id)
                    }
                  >
                    {expandedPlugin === plugin.id ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              {expandedPlugin === plugin.id && (
                <div className="border-t border-zinc-800 p-3 space-y-3">
                  <div>
                    <p className="text-xs font-medium text-zinc-400 mb-1">Author</p>
                    <p className="text-sm text-zinc-300">{plugin.author}</p>
                  </div>

                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Shield className="h-3.5 w-3.5 text-zinc-400" />
                      <p className="text-xs font-medium text-zinc-400">Permissions</p>
                    </div>
                    <div className="space-y-1">
                      {plugin.permissions.map((perm) => (
                        <div key={perm.name} className="flex items-start gap-2 rounded-md bg-zinc-800/50 px-2 py-1.5">
                          <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-600" />
                          <div>
                            <p className="text-xs font-medium text-zinc-300">{perm.name}</p>
                            <p className="text-xs text-zinc-500">{perm.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-zinc-400"
                    onClick={() => setShowSettings(showSettings === plugin.id ? null : plugin.id)}
                  >
                    <Settings className="h-3.5 w-3.5" />
                    Settings
                  </Button>

                  {showSettings === plugin.id && (
                    <div className="rounded-md bg-zinc-800/50 p-3">
                      <p className="text-xs text-zinc-500">No configurable settings for this plugin.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
