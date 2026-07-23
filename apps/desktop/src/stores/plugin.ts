import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface PluginPermission {
  name: string;
  description: string;
  granted: boolean;
}

export interface Plugin {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  enabled: boolean;
  permissions: PluginPermission[];
  /**
   * Phase 5: free-form key/value map (jira.apiKey, slack.webhookUrl, etc.).
   * Consumers only spread (`...p.settings, ...settings`) so the loose
   * `Record<string, unknown>` shape is fine — no consumer reads individual
   * fields, and the value is JSON-serialised through zustand persist unchanged.
   */
  settings: Record<string, unknown>;
  category: 'integration' | 'productivity' | 'ai' | 'utility';
  icon?: string;
  installedAt: string;
  updatedAt: string;
}

interface PluginState {
  plugins: Plugin[];
  isLoading: boolean;
  error: string | null;

  // Actions
  loadPlugins: () => void;
  installPlugin: (plugin: Omit<Plugin, 'installedAt' | 'updatedAt'>) => void;
  uninstallPlugin: (id: string) => void;
  enablePlugin: (id: string) => void;
  disablePlugin: (id: string) => void;
  updatePluginSettings: (id: string, settings: Record<string, unknown>) => void;
  grantPermission: (pluginId: string, permissionName: string) => void;
  revokePermission: (pluginId: string, permissionName: string) => void;
  getPlugin: (id: string) => Plugin | undefined;
  getEnabledPlugins: () => Plugin[];
  getPluginsByCategory: (category: Plugin['category']) => Plugin[];
}

// Available plugins that can be installed
const AVAILABLE_PLUGINS: Omit<Plugin, 'installedAt' | 'updatedAt'>[] = [
  {
    id: 'jira',
    name: 'Jira Integration',
    description: 'Create and update Jira tickets directly from Echo sessions',
    version: '1.2.0',
    author: 'Echo Team',
    enabled: false,
    category: 'integration',
    permissions: [
      { name: 'Read projects', description: 'View Jira projects and issues', granted: false },
      { name: 'Create issues', description: 'Create new Jira tickets', granted: false },
      { name: 'Update issues', description: 'Update existing ticket status', granted: false },
    ],
    settings: {
      baseUrl: '',
      apiKey: '',
      defaultProject: '',
    },
  },
  {
    id: 'slack',
    name: 'Slack Integration',
    description: 'Send session summaries and action items to Slack channels',
    version: '1.0.1',
    author: 'Echo Team',
    enabled: false,
    category: 'integration',
    permissions: [
      { name: 'Send messages', description: 'Post messages to channels', granted: false },
      { name: 'Read channels', description: 'Read channel history', granted: false },
    ],
    settings: {
      webhookUrl: '',
      defaultChannel: '',
    },
  },
  {
    id: 'github',
    name: 'GitHub Integration',
    description: 'Link sessions to GitHub issues, PRs, and code reviews',
    version: '0.9.0',
    author: 'Echo Team',
    enabled: false,
    category: 'integration',
    permissions: [
      { name: 'Read repos', description: 'View repository data', granted: false },
      { name: 'Create issues', description: 'Create GitHub issues', granted: false },
      { name: 'Read PRs', description: 'View pull request status', granted: false },
    ],
    settings: {
      token: '',
      defaultRepo: '',
    },
  },
  {
    id: 'notion',
    name: 'Notion Integration',
    description: 'Sync session notes and summaries to Notion pages',
    version: '1.1.0',
    author: 'Echo Team',
    enabled: false,
    category: 'integration',
    permissions: [
      { name: 'Read pages', description: 'View Notion pages', granted: false },
      { name: 'Create pages', description: 'Create new Notion pages', granted: false },
      { name: 'Update pages', description: 'Update existing pages', granted: false },
    ],
    settings: {
      apiKey: '',
      databaseId: '',
    },
  },
  {
    id: 'calendar',
    name: 'Calendar Integration',
    description: 'Schedule follow-ups and create calendar events from sessions',
    version: '1.0.0',
    author: 'Echo Team',
    enabled: false,
    category: 'productivity',
    permissions: [
      { name: 'Read calendar', description: 'View calendar events', granted: false },
      { name: 'Create events', description: 'Create new calendar events', granted: false },
    ],
    settings: {
      calendarId: '',
    },
  },
  {
    id: 'todoist',
    name: 'Todoist Integration',
    description: 'Create tasks and manage todos from session action items',
    version: '1.0.0',
    author: 'Echo Team',
    enabled: false,
    category: 'productivity',
    permissions: [
      { name: 'Read tasks', description: 'View Todoist tasks', granted: false },
      { name: 'Create tasks', description: 'Create new tasks', granted: false },
      { name: 'Update tasks', description: 'Update task status', granted: false },
    ],
    settings: {
      apiKey: '',
      defaultProject: '',
    },
  },
];

export const usePluginStore = create<PluginState>()(
  persist(
    (set, get) => ({
      plugins: [],
      isLoading: false,
      error: null,

      loadPlugins: () => {
        set({ isLoading: true, error: null });
        try {
          // In a real app, this would load from a backend or config file
          // For now, we'll use the available plugins
          const plugins: Plugin[] = AVAILABLE_PLUGINS.map((p) => ({
            ...p,
            installedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }));
          set({ plugins, isLoading: false });
        } catch {
          // The plugin list is a static const; error here would mean a
          // misconfigured bundler. Keep the explicit fallback message.
          set({ error: 'Failed to load plugins', isLoading: false });
        }
      },

      installPlugin: (pluginData) => {
        const now = new Date().toISOString();
        const plugin: Plugin = {
          ...pluginData,
          installedAt: now,
          updatedAt: now,
        };
        set((state) => ({
          plugins: [...state.plugins, plugin],
        }));
      },

      uninstallPlugin: (id) => {
        set((state) => ({
          plugins: state.plugins.filter((p) => p.id !== id),
        }));
      },

      enablePlugin: (id) => {
        set((state) => ({
          plugins: state.plugins.map((p) =>
            p.id === id ? { ...p, enabled: true, updatedAt: new Date().toISOString() } : p,
          ),
        }));
      },

      disablePlugin: (id) => {
        set((state) => ({
          plugins: state.plugins.map((p) =>
            p.id === id ? { ...p, enabled: false, updatedAt: new Date().toISOString() } : p,
          ),
        }));
      },

      updatePluginSettings: (id, settings) => {
        set((state) => ({
          plugins: state.plugins.map((p) =>
            p.id === id
              ? {
                  ...p,
                  settings: { ...p.settings, ...settings },
                  updatedAt: new Date().toISOString(),
                }
              : p,
          ),
        }));
      },

      grantPermission: (pluginId, permissionName) => {
        set((state) => ({
          plugins: state.plugins.map((p) =>
            p.id === pluginId
              ? {
                  ...p,
                  permissions: p.permissions.map((perm) =>
                    perm.name === permissionName ? { ...perm, granted: true } : perm,
                  ),
                  updatedAt: new Date().toISOString(),
                }
              : p,
          ),
        }));
      },

      revokePermission: (pluginId, permissionName) => {
        set((state) => ({
          plugins: state.plugins.map((p) =>
            p.id === pluginId
              ? {
                  ...p,
                  permissions: p.permissions.map((perm) =>
                    perm.name === permissionName ? { ...perm, granted: false } : perm,
                  ),
                  updatedAt: new Date().toISOString(),
                }
              : p,
          ),
        }));
      },

      getPlugin: (id) => {
        return get().plugins.find((p) => p.id === id);
      },

      getEnabledPlugins: () => {
        return get().plugins.filter((p) => p.enabled);
      },

      getPluginsByCategory: (category) => {
        return get().plugins.filter((p) => p.category === category);
      },
    }),
    {
      name: 'echo-plugin-storage',
    },
  ),
);
