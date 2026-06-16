# Oasis

## Inspiration

Oasis was inspired by the gap between needing care and knowing where to go for the right care. In stressful moments, people often have only partial information: a symptom, an image of an injury or condition, a rough location, and a need to act quickly. At the same time, care access data can be scattered across facility records, specialties, capabilities, maps, and local knowledge.

The goal of Oasis is to turn that scattered context into a guided, non-diagnostic routing experience. It helps users understand what type of care may be relevant, find nearby facilities with matching capabilities, and get directions or contact options without leaving the app.

## What it does

Oasis is a Databricks App with two user-facing tabs and an MCP endpoint.

The Genie Space tab embeds a Databricks Genie room so users can ask natural-language questions about the underlying healthcare access data.

The Care Finder Vision tab lets a user upload an image, provide symptoms or context, share or enter a location, and search for nearby facilities. The app sends the image and user context through a Databricks AI Gateway-compatible vision model, extracts non-diagnostic care-routing observations, maps those observations to a care taxonomy, queries facility data from Databricks SQL, and reranks candidate facilities with a second foundation model. It then shows relevant nearby options, why they matched, distance, care capabilities, and WhatsApp links for chat or appointment requests.

The `/mcp` endpoint exposes a Geoapify-backed MCP tool named `route_between_destinations`. Agents can call it to geocode origins and destinations and calculate routes using the app's configured Geoapify API key.

## How we built it

We built Oasis as a Node, React, and TypeScript Databricks App using AppKit. The frontend uses React, Vite, Tailwind CSS, AppKit UI components, and lucide icons. The backend uses the AppKit Express server extension to register custom API routes for Care Finder Vision and the Geoapify MCP server.

The Care Finder workflow was converted from a Streamlit prototype into a Node/React implementation. The browser handles image upload, location input, browser geolocation, filters, and result display. The server owns the privileged work: calling Databricks AI Gateway, querying Databricks SQL, applying the care taxonomy, reranking results, generating WhatsApp links, and writing recent analysis records to Delta.

For routing, we implemented an HTTP MCP JSON-RPC endpoint at `/mcp`. It advertises the `route_between_destinations` tool, accepts addresses or coordinates, calls Geoapify geocoding and routing APIs, and returns structured route summaries plus optional raw route data.

## Challenges we ran into

One challenge was moving from Streamlit's single-process Python model to a cleaner split between React client state and Node server routes. Image upload, long-running analysis status, browser location permissions, and table-heavy results all needed explicit frontend state handling.

Databricks authentication also required care. Local development may use CLI auth, while deployed apps should rely on environment variables or Databricks secrets. We added host normalization and kept real tokens out of tracked files.

Another challenge was making the care routing useful without pretending to diagnose. The model output has to stay non-diagnostic, identify urgency and red flags carefully, and translate visual observations into facility capabilities such as specialties, procedures, equipment, and emergency services.

We also had to avoid checking in generated or dependency-heavy files. The app uses `node_modules`, build output, and local environment files during development, but those should stay out of git so the repository remains small and reviewable.

## Accomplishments that we're proud of

We are proud that Oasis combines conversational analytics, image-assisted care routing, facility matching, WhatsApp contact flows, and route calculation in one cohesive app.

We are also proud of the two-stage recommendation approach. The app first retrieves candidates with deterministic taxonomy scoring, then uses a Databricks foundation model to semantically compare the user's reported need against facility specialties, procedures, equipment, capabilities, and descriptions.

The MCP integration is another strong piece. By moving Geoapify routing behind `/mcp`, Oasis can serve both human users through the app UI and agentic workflows through a standard tool endpoint.

## What we learned

We learned how to structure a Databricks App so the frontend stays responsive while the backend handles AI Gateway calls, Databricks SQL access, Delta writes, and external API calls.

We learned that agent-ready tools need clear schemas, predictable errors, and secure secret handling. The Geoapify MCP server is more useful because it accepts multiple location formats and returns structured routing data rather than a raw API response only.

We also learned that healthcare-adjacent user experiences need careful wording. The product should guide users toward appropriate care, but it must clearly avoid diagnosis and point users to emergency services when serious symptoms or red flags are possible.

## What's next for Oasis

Next, Oasis should be deployed as a production Databricks App with secrets managed through the workspace instead of local environment files.

We want to add richer route visualization, map-based facility comparison, clearer emergency-care flows, multilingual support, and more robust appointment integrations beyond prefilled WhatsApp messages.

We also want to validate the ranking pipeline with domain feedback, add observability for model and routing failures, and expose the MCP tool to Genie or other agents so they can reason over care access data and calculate routes in the same workflow.
