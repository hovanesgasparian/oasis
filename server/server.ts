import { createApp, server, genie } from '@databricks/appkit';
import { registerCareFinderRoutes } from './care-finder.js';
import { registerGeoapifyMcpRoutes } from './geoapify-mcp.js';

function normalizeDatabricksAuthEnv(): void {
  const host = process.env.DATABRICKS_HOST?.trim();
  if (host && !/^https?:\/\//i.test(host)) {
    process.env.DATABRICKS_HOST = `https://${host}`;
  }

  if (process.env.DATABRICKS_HOST && process.env.DATABRICKS_TOKEN) {
    delete process.env.DATABRICKS_CONFIG_PROFILE;
  }
}

normalizeDatabricksAuthEnv();

createApp({
  plugins: [
    server({ bodyLimit: '12mb' }),
    genie({
      spaces: {
        default: '01f168ebcf2c14e892b5843e00a085d6',
      },
    }),
  ],
  onPluginsReady(appkit) {
    appkit.server.extend((app) => {
      registerCareFinderRoutes(app);
      registerGeoapifyMcpRoutes(app);
    });
  },
}).catch(console.error);
