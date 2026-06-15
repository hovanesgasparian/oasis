import { createApp, server, genie } from '@databricks/appkit';

createApp({
  plugins: [
    server(),
    genie({
      spaces: {
        default: '01f168ebcf2c14e892b5843e00a085d6',
      },
    }),
  ],
}).catch(console.error);
