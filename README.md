# oasis

A Databricks App powered by [AppKit](https://www.databricks.com/devhub/docs/appkit/v0/), featuring React, TypeScript, Tailwind CSS, a Genie Space tab, a Care Finder Vision tab, and an HTTP MCP endpoint.

**Enabled plugins:**

- **Server** -- Express HTTP server with static file serving and Vite dev mode

## Prerequisites

- Node.js v22+ and npm
- Databricks CLI (for deployment)
- Access to a Databricks workspace

## Databricks Authentication

### Local Development

For local development, configure your environment variables by creating a `.env` file:

```bash
cp .env.example .env
```

Edit `.env` and set the environment variables you need:

```env
DATABRICKS_HOST=https://your-workspace.cloud.databricks.com
DATABRICKS_APP_PORT=8000
# ... other environment variables, depending on the plugins you use
```

### CLI Authentication

The Databricks CLI requires authentication to deploy and manage apps. Configure authentication using one of these methods:

#### OAuth U2M

Interactive browser-based authentication with short-lived tokens:

```bash
databricks auth login --host https://your-workspace.cloud.databricks.com
```

This will open your browser to complete authentication. The CLI saves credentials to `~/.databrickscfg`.

#### Configuration Profiles

Use multiple profiles for different workspaces:

```ini
[DEFAULT]
host = https://dev-workspace.cloud.databricks.com

[production]
host = https://prod-workspace.cloud.databricks.com
client_id = prod-client-id
client_secret = prod-client-secret
```

Deploy using a specific profile:

```bash
databricks bundle deploy --profile production
```

**Note:** Personal Access Tokens (PATs) are legacy authentication. OAuth is strongly recommended for better security.

## Getting Started

### Install Dependencies

```bash
npm install
```

### Development

Run the app in development mode with hot reload:

```bash
npm run dev
```

The app will be available at the URL shown in the console output.

### Geoapify Routing MCP Server

This repo exposes an HTTP MCP endpoint at `/mcp` with a `route_between_destinations` tool backed by the Geoapify Geocoding and Routing APIs.

Set your API key in `.env`:

```env
GEOAPIFY_API_KEY=your_geoapify_api_key
```

Run the app locally:

```bash
npm run dev
```

The MCP endpoint is available at:

```text
http://localhost:8000/mcp
```

After deployment as a Databricks App, use the app URL:

```text
https://<app-url>/mcp
```

For Databricks AI Gateway MCP discovery, deploy this route from an app whose name starts with `mcp-`, for example `mcp-geoapify-routing`. Keep `GEOAPIFY_API_KEY` in the app environment or a Databricks secret, not in tracked source files.

### Care Finder Vision

The Care Finder Vision tab is a Node/React port of the previous Streamlit workflow. The browser collects location, image, symptom, and WhatsApp appointment inputs; the Express server handles AI Gateway calls, Databricks SQL facility lookups, reranking, WhatsApp link generation, and Delta result writes.

Set these values in `.env` for local development or in the Databricks App environment for deployment:

```env
DATABRICKS_TOKEN=your_databricks_token_for_ai_gateway
DATABRICKS_HOST=https://dbc-ee0ead6d-c943.cloud.databricks.com
DATABRICKS_WAREHOUSE_ID=1bd5a57a33ae6d7c
VISION_MODEL_NAME=databricks-gemma-3-12b
MATCH_MODEL_NAME=databricks-gemini-3-5-flash
FACILITY_TABLE=databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.facilities
RESULTS_TABLE=workspace.default.camera_vision_results
```

The app uses the existing Databricks SDK authentication context for SQL statement execution and `DATABRICKS_TOKEN` for the AI Gateway-compatible chat completions calls. `DATABRICKS_HOST` should be the full workspace URL including `https://`. Keep the token in `.env` or Databricks secrets, never in tracked source.

### Build

Build both client and server for production:

```bash
npm run build
```

This creates:

- `dist/server.js` - Compiled server bundle
- `client/dist/` - Bundled client assets

### Production

Run the production build:

```bash
npm start
```

## Code Quality

There are a few commands to help you with code quality:

```bash
# Type checking
npm run typecheck

# Linting
npm run lint
npm run lint:fix

# Formatting
npm run format
npm run format:fix
```

## Deployment with Databricks Asset Bundles

### 1. Configure Bundle

Update `databricks.yml` with your workspace settings:

```yaml
targets:
  default:
    workspace:
      host: https://your-workspace.cloud.databricks.com
```

Make sure to replace all placeholder values in `databricks.yml` with your actual resource IDs.

### 2. Validate Bundle

```bash
databricks bundle validate
```

### 3. Deploy

Deploy to the default target:

```bash
databricks bundle deploy
```

### 4. Run

Start the deployed app:

```bash
databricks bundle run <APP_NAME> -t dev
```

### Deploy to Production

1. Configure the production target in `databricks.yml`
2. Deploy to production:

```bash
databricks bundle deploy -t prod
```

## Project Structure

```
* client/          # React frontend
  * src/           # Source code
  * public/        # Static assets
* server/          # Express backend
  * server.ts      # Server entry point
  * routes/        # Routes
* shared/          # Shared types
* databricks.yml   # Bundle configuration
* app.yaml         # App configuration
* .env.example     # Environment variables example
```

## Tech Stack

- **Backend**: Node.js, Express
- **Frontend**: React.js, TypeScript, Vite, Tailwind CSS
- **UI Components**: Radix UI, shadcn/ui
- **Databricks**: AppKit SDK
