import { createApp, server, genie } from '@databricks/appkit';
import { registerGeoapifyMcpRoutes } from './geoapify-mcp.js';

createApp({
  plugins: [
    server(),
    genie({
      spaces: {
        default: '01f168ebcf2c14e892b5843e00a085d6',
      },
    }),
  ],
  onPluginsReady(appkit) {
    appkit.server.extend((app) => {
      registerGeoapifyMcpRoutes(app);
    });
  },
}).catch(console.error);
