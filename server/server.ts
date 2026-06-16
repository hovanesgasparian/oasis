import { createApp, server, genie } from '@databricks/appkit';
import { registerCareFinderRoutes } from './care-finder.js';
import { registerGeoapifyMcpRoutes } from './geoapify-mcp.js';

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
