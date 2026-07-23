import { useState, useEffect } from 'react';
import {
  Puzzle,
  Settings,
  Shield,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Power,
  PowerOff,
  Plus,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import { usePluginStore } from '../stores/plugin';

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

export default function PluginManager() {
  const { plugins, loadPlugins, enablePlugin, disablePlugin, grantPermission, revokePermission } =
    usePluginStore();
  const [expandedPlugin, setExpandedPlugin] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState<string | null>(null);

  useEffect(() => {
    loadPlugins();
  }, [loadPlugins]);

  const togglePlugin = (id: string) => {
    const plugin = plugins.find((p) => p.id === id);
    if (plugin) {
      if (plugin.enabled) {
        disablePlugin(id);
      } else {
        enablePlugin(id);
      }
    }
  };

  const currentPlugin = expandedPlugin ? plugins.find((p) => p.id === expandedPlugin) : null;

  const currentPluginPermissions = currentPlugin?.permissions ?? [];

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
              className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100/50 dark:bg-zinc-900/50 overflow-hidden"
            >
              <div className="flex items-center gap-3 p-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
                  <Puzzle className="h-5 w-5 text-indigo-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {plugin.name}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {plugin.version}
                    </Badge>
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
                <div className="border-t border-zinc-200 dark:border-zinc-800 p-3 space-y-3">
                  <div>
                    <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                      Author
                    </p>
                    <p className="text-sm text-zinc-700 dark:text-zinc-300">{plugin.author}</p>
                  </div>

                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Shield className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400" />
                      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        Permissions
                      </p>
                    </div>
                    <div className="space-y-1">
                      {currentPluginPermissions.map((perm) => (
                        <div
                          key={perm.name}
                          className="flex items-start gap-2 rounded-md bg-zinc-50/50 dark:bg-zinc-800/50 px-2 py-1.5"
                        >
                          <Switch
                            checked={perm.granted}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                grantPermission(currentPlugin!.id, perm.name);
                              } else {
                                revokePermission(currentPlugin!.id, perm.name);
                              }
                            }}
                            className="scale-75 mt-0.5"
                          />
                          <div>
                            <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                              {perm.name}
                            </p>
                            <p className="text-xs text-zinc-500">{perm.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-zinc-500 dark:text-zinc-400"
                    onClick={() => setShowSettings(showSettings === plugin.id ? null : plugin.id)}
                  >
                    <Settings className="h-3.5 w-3.5" />
                    Settings
                  </Button>

                  {showSettings === plugin.id && (
                    <div className="rounded-md bg-zinc-50/50 dark:bg-zinc-800/50 p-3 space-y-2">
                      {Object.keys(plugin.settings).length > 0 ? (
                        Object.entries(plugin.settings).map(([key, value]) => (
                          <div key={key}>
                            <label className="text-xs text-zinc-500 dark:text-zinc-400 capitalize">
                              {key.replace(/([A-Z])/g, ' $1').trim()}
                            </label>
                            <input
                              type={
                                key.toLowerCase().includes('key') ||
                                key.toLowerCase().includes('token')
                                  ? 'password'
                                  : 'text'
                              }
                              value={value as string}
                              onChange={(e) => {
                                // In a real app, this would update the plugin settings
                                console.log('Update setting:', key, e.target.value);
                              }}
                              className="w-full mt-1 px-2 py-1 text-sm bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded text-zinc-900 dark:text-zinc-100"
                              placeholder={`Enter ${key}`}
                            />
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-zinc-500">
                          No configurable settings for this plugin.
                        </p>
                      )}
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
