import { randomUUID } from 'node:crypto';
import type { Application, Request, Response } from 'express';

type JsonRpcId = string | number | null;

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: Record<string, unknown>;
};

type JsonRpcSuccess = {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result: unknown;
};

type JsonRpcError = {
  jsonrpc: '2.0';
  id: JsonRpcId;
  error: {
    code: number;
    message: string;
  };
};

type JsonRpcResponse = JsonRpcSuccess | JsonRpcError;

type Coordinate = {
  lat: number;
  lon: number;
};

type GeocodedWaypoint = Coordinate & {
  input: unknown;
  formatted?: string;
  placeId?: string;
};

type RouteArguments = {
  origin: unknown;
  destination: unknown;
  waypoints?: unknown[];
  mode?: string;
  routeType?: string;
  intermediateWaypointMode?: string;
  units?: string;
  lang?: string;
  avoid?: string[];
  details?: string[];
  traffic?: string;
  maxSpeed?: number;
  geocodeFilter?: string;
  geocodeBias?: string;
  includeRaw?: boolean;
};

const SERVER_NAME = 'geoapify-routing-mcp';
const SERVER_VERSION = '1.0.0';
const GEOAPIFY_BASE_URL = 'https://api.geoapify.com/v1';
const DEFAULT_PROTOCOL_VERSION = '2024-11-05';

const travelModes = [
  'drive',
  'light_truck',
  'medium_truck',
  'truck',
  'heavy_truck',
  'truck_dangerous_goods',
  'long_truck',
  'bus',
  'scooter',
  'motorcycle',
  'bicycle',
  'mountain_bike',
  'road_bike',
  'walk',
  'hike',
  'transit',
  'approximated_transit',
] as const;

const routeTool = {
  name: 'route_between_destinations',
  description:
    'Calculate a Geoapify route between an origin and destination. Inputs can be address strings, "lat,lon" strings, "lonlat:lon,lat" strings, or { lat, lon } objects.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['origin', 'destination'],
    properties: {
      origin: {
        description: 'Starting point as an address string, coordinate string, or coordinate object.',
        oneOf: [
          { type: 'string' },
          {
            type: 'object',
            required: ['lat', 'lon'],
            additionalProperties: false,
            properties: {
              lat: { type: 'number', minimum: -90, maximum: 90 },
              lon: { type: 'number', minimum: -180, maximum: 180 },
            },
          },
        ],
      },
      destination: {
        description: 'Ending point as an address string, coordinate string, or coordinate object.',
        oneOf: [
          { type: 'string' },
          {
            type: 'object',
            required: ['lat', 'lon'],
            additionalProperties: false,
            properties: {
              lat: { type: 'number', minimum: -90, maximum: 90 },
              lon: { type: 'number', minimum: -180, maximum: 180 },
            },
          },
        ],
      },
      waypoints: {
        type: 'array',
        description: 'Optional intermediate waypoints in the same formats as origin and destination.',
        items: {
          oneOf: [
            { type: 'string' },
            {
              type: 'object',
              required: ['lat', 'lon'],
              additionalProperties: false,
              properties: {
                lat: { type: 'number', minimum: -90, maximum: 90 },
                lon: { type: 'number', minimum: -180, maximum: 180 },
              },
            },
          ],
        },
      },
      mode: {
        type: 'string',
        description: 'Geoapify travel mode.',
        enum: travelModes,
        default: 'drive',
      },
      routeType: {
        type: 'string',
        description: 'Geoapify route optimization type.',
        enum: ['balanced', 'short', 'less_maneuvers'],
        default: 'balanced',
      },
      intermediateWaypointMode: {
        type: 'string',
        enum: ['stopover', 'through_stop', 'pass_through'],
      },
      units: {
        type: 'string',
        enum: ['metric', 'imperial'],
        default: 'metric',
      },
      lang: {
        type: 'string',
        description: 'Instruction language, for example "en", "es", or "fr".',
      },
      avoid: {
        type: 'array',
        description: 'Geoapify avoid rules such as "tolls", "ferries", "highways", or "location:lat,lon".',
        items: { type: 'string' },
      },
      details: {
        type: 'array',
        description: 'Additional route details. Some values can increase Geoapify API credit usage.',
        items: {
          type: 'string',
          enum: ['instruction_details', 'route_details', 'elevation'],
        },
      },
      traffic: {
        type: 'string',
        enum: ['free_flow', 'approximated'],
      },
      maxSpeed: {
        type: 'number',
        minimum: 10,
        maximum: 252,
        description: 'Maximum vehicle speed in kilometers per hour for motorized modes.',
      },
      geocodeFilter: {
        type: 'string',
        description: 'Optional Geoapify geocoding filter, for example "countrycode:us".',
      },
      geocodeBias: {
        type: 'string',
        description: 'Optional Geoapify geocoding bias, for example "countrycode:us" or "proximity:lon,lat".',
      },
      includeRaw: {
        type: 'boolean',
        description: 'Include the raw Geoapify routing response in the tool result.',
        default: false,
      },
    },
  },
};

export function registerGeoapifyMcpRoutes(app: Application): void {
  app.post('/mcp', async (req: Request, res: Response) => {
    const requestBody = req.body as unknown;
    const sessionId = getSessionId(req) ?? randomUUID();

    try {
      const response = await handleMcpPayload(requestBody);
      if (response === null) {
        res.status(202).end();
        return;
      }

      res.setHeader('mcp-session-id', sessionId);
      res.status(200).json(response);
    } catch (error) {
      res.status(400).json(jsonRpcError(null, -32700, error instanceof Error ? error.message : String(error)));
    }
  });

  app.get('/mcp', (req: Request, res: Response) => {
    if (!req.accepts('text/event-stream')) {
      res.status(405).json({
        error: 'The Geoapify MCP endpoint accepts JSON-RPC requests with POST /mcp.',
      });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('mcp-session-id', getSessionId(req) ?? randomUUID());
    res.write(': connected\n\n');
  });

  app.delete('/mcp', (_req: Request, res: Response) => {
    res.status(204).end();
  });
}

async function handleMcpPayload(payload: unknown): Promise<JsonRpcResponse | JsonRpcResponse[] | null> {
  if (Array.isArray(payload)) {
    if (payload.length === 0) {
      return jsonRpcError(null, -32600, 'Invalid Request');
    }

    const responses = await Promise.all(payload.map((request) => handleMcpRequest(request)));
    const filteredResponses = responses.filter((response): response is JsonRpcResponse => response !== null);
    return filteredResponses.length > 0 ? filteredResponses : null;
  }

  return handleMcpRequest(payload);
}

async function handleMcpRequest(input: unknown): Promise<JsonRpcResponse | null> {
  if (!isRecord(input)) {
    return jsonRpcError(null, -32600, 'Invalid Request');
  }

  const request = input as JsonRpcRequest;
  if (request.jsonrpc !== '2.0' || typeof request.method !== 'string') {
    return jsonRpcError(getRequestId(request), -32600, 'Invalid Request');
  }

  const id = getRequestId(request);

  try {
    switch (request.method) {
      case 'initialize':
        return jsonRpcSuccess(id, {
          protocolVersion: getRequestedProtocolVersion(request),
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: SERVER_NAME,
            version: SERVER_VERSION,
          },
        });

      case 'notifications/initialized':
        return null;

      case 'ping':
        return jsonRpcSuccess(id, {});

      case 'tools/list':
        return jsonRpcSuccess(id, {
          tools: [routeTool],
        });

      case 'tools/call':
        return jsonRpcSuccess(id, await callTool(request));

      default:
        return jsonRpcError(id, -32601, `Method not found: ${request.method}`);
    }
  } catch (error) {
    return jsonRpcError(id, -32000, error instanceof Error ? error.message : String(error));
  }
}

function getRequestId(request: JsonRpcRequest): JsonRpcId {
  return typeof request.id === 'string' || typeof request.id === 'number' || request.id === null ? request.id : null;
}

function getRequestedProtocolVersion(request: JsonRpcRequest): string {
  const protocolVersion = request.params?.protocolVersion;
  return typeof protocolVersion === 'string' ? protocolVersion : DEFAULT_PROTOCOL_VERSION;
}

async function callTool(request: JsonRpcRequest): Promise<Record<string, unknown>> {
  const name = request.params?.name;
  if (name !== routeTool.name) {
    throw new Error(`Unknown tool: ${String(name)}`);
  }

  const args = normalizeArguments(request.params?.arguments);
  try {
    const result = await routeBetweenDestinations(args);
    return toolTextResult(JSON.stringify(result, null, 2));
  } catch (error) {
    return toolTextResult(error instanceof Error ? error.message : String(error), true);
  }
}

function normalizeArguments(input: unknown): RouteArguments {
  if (!isRecord(input)) {
    throw new Error('Tool arguments must be an object');
  }

  return input as RouteArguments;
}

async function routeBetweenDestinations(args: RouteArguments): Promise<Record<string, unknown>> {
  const apiKey = process.env.GEOAPIFY_API_KEY;
  if (!apiKey) {
    throw new Error('Missing GEOAPIFY_API_KEY environment variable');
  }

  if (!args.origin) {
    throw new Error('origin is required');
  }

  if (!args.destination) {
    throw new Error('destination is required');
  }

  const origin = await resolveWaypoint(args.origin, apiKey, args);
  const destination = await resolveWaypoint(args.destination, apiKey, args);
  const intermediateWaypoints = await Promise.all(
    (Array.isArray(args.waypoints) ? args.waypoints : []).map((waypoint) =>
      resolveWaypoint(waypoint, apiKey, args),
    ),
  );

  const resolvedWaypoints = [origin, ...intermediateWaypoints, destination];
  const data = await fetchRoute(resolvedWaypoints, apiKey, args);
  const route = extractPrimaryRoute(data);
  const instructions = extractInstructions(route);

  return removeUndefined({
    origin,
    destination,
    waypoints: resolvedWaypoints,
    mode: args.mode ?? 'drive',
    routeType: args.routeType ?? 'balanced',
    distance: route?.distance,
    distanceUnits: route?.distance_units,
    timeSeconds: route?.time,
    toll: route?.toll,
    ferry: route?.ferry,
    instructions,
    raw: args.includeRaw ? data : undefined,
  });
}

async function resolveWaypoint(
  input: unknown,
  apiKey: string,
  args: RouteArguments,
): Promise<GeocodedWaypoint> {
  const coordinate = parseCoordinate(input);
  if (coordinate) {
    return {
      ...coordinate,
      input,
    };
  }

  if (typeof input !== 'string' || !input.trim()) {
    throw new Error(`Invalid waypoint: ${JSON.stringify(input)}`);
  }

  const url = new URL(`${GEOAPIFY_BASE_URL}/geocode/search`);
  url.searchParams.set('text', input);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');
  url.searchParams.set('apiKey', apiKey);

  if (args.geocodeFilter) {
    url.searchParams.set('filter', args.geocodeFilter);
  }

  if (args.geocodeBias) {
    url.searchParams.set('bias', args.geocodeBias);
  }

  const data = await fetchJson(url);
  const results: unknown = data.results;
  const firstResult: unknown = Array.isArray(results) ? results[0] : undefined;
  if (!isRecord(firstResult) || typeof firstResult.lat !== 'number' || typeof firstResult.lon !== 'number') {
    throw new Error(`Geoapify could not geocode waypoint: ${input}`);
  }

  return removeUndefined({
    input,
    lat: firstResult.lat,
    lon: firstResult.lon,
    formatted: typeof firstResult.formatted === 'string' ? firstResult.formatted : undefined,
    placeId: typeof firstResult.place_id === 'string' ? firstResult.place_id : undefined,
  }) as GeocodedWaypoint;
}

function parseCoordinate(input: unknown): Coordinate | null {
  if (isRecord(input)) {
    const lat = Number(input.lat);
    const lon = Number(input.lon);
    return isValidCoordinate(lat, lon) ? { lat, lon } : null;
  }

  if (typeof input !== 'string') {
    return null;
  }

  const trimmed = input.trim();
  const lonLatMatch = /^lonlat:\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/i.exec(trimmed);
  if (lonLatMatch) {
    const lon = Number(lonLatMatch[1]);
    const lat = Number(lonLatMatch[2]);
    return isValidCoordinate(lat, lon) ? { lat, lon } : null;
  }

  const latLonMatch = /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/.exec(trimmed);
  if (latLonMatch) {
    const lat = Number(latLonMatch[1]);
    const lon = Number(latLonMatch[2]);
    return isValidCoordinate(lat, lon) ? { lat, lon } : null;
  }

  return null;
}

function isValidCoordinate(lat: number, lon: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

async function fetchRoute(
  waypoints: GeocodedWaypoint[],
  apiKey: string,
  args: RouteArguments,
): Promise<Record<string, unknown>> {
  const url = new URL(`${GEOAPIFY_BASE_URL}/routing`);
  url.searchParams.set('waypoints', waypoints.map((waypoint) => `${waypoint.lat},${waypoint.lon}`).join('|'));
  url.searchParams.set('mode', validateEnum(args.mode, travelModes, 'mode') ?? 'drive');
  url.searchParams.set('format', 'json');
  url.searchParams.set('apiKey', apiKey);

  addOptionalParam(url, 'type', validateEnum(args.routeType, ['balanced', 'short', 'less_maneuvers'], 'routeType'));
  addOptionalParam(
    url,
    'intermediate_waypoint_mode',
    validateEnum(args.intermediateWaypointMode, ['stopover', 'through_stop', 'pass_through'], 'intermediateWaypointMode'),
  );
  addOptionalParam(url, 'units', validateEnum(args.units, ['metric', 'imperial'], 'units'));
  addOptionalParam(url, 'lang', args.lang);
  addOptionalParam(url, 'traffic', validateEnum(args.traffic, ['free_flow', 'approximated'], 'traffic'));

  if (Array.isArray(args.avoid) && args.avoid.length > 0) {
    url.searchParams.set('avoid', args.avoid.join('|'));
  }

  if (Array.isArray(args.details) && args.details.length > 0) {
    for (const detail of args.details) {
      validateEnum(detail, ['instruction_details', 'route_details', 'elevation'], 'details');
    }
    url.searchParams.set('details', args.details.join(','));
  }

  if (args.maxSpeed !== undefined) {
    if (typeof args.maxSpeed !== 'number' || args.maxSpeed < 10 || args.maxSpeed > 252) {
      throw new Error('maxSpeed must be a number from 10 to 252');
    }
    url.searchParams.set('max_speed', String(args.maxSpeed));
  }

  return fetchJson(url);
}

async function fetchJson(url: URL): Promise<Record<string, unknown>> {
  const response = await fetch(url);
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  if (!response.ok) {
    const message = typeof body.message === 'string' ? body.message : response.statusText;
    throw new Error(`Geoapify request failed (${response.status}): ${message}`);
  }

  return body;
}

function extractPrimaryRoute(data: Record<string, unknown>): Record<string, unknown> | undefined {
  if (Array.isArray(data.results) && isRecord(data.results[0])) {
    return data.results[0];
  }

  if (Array.isArray(data.features) && isRecord(data.features[0])) {
    const feature = data.features[0];
    return isRecord(feature.properties) ? feature.properties : feature;
  }

  return undefined;
}

function extractInstructions(route: Record<string, unknown> | undefined): string[] {
  if (!route || !Array.isArray(route.legs)) {
    return [];
  }

  const instructions: string[] = [];
  for (const leg of route.legs) {
    if (!isRecord(leg) || !Array.isArray(leg.steps)) {
      continue;
    }

    for (const step of leg.steps) {
      if (!isRecord(step) || !isRecord(step.instruction)) {
        continue;
      }

      const text = step.instruction.text;
      if (typeof text === 'string' && text) {
        instructions.push(text);
      }
    }
  }

  return instructions;
}

function validateEnum<T extends string>(value: unknown, allowedValues: readonly T[], fieldName: string): T | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string' || !allowedValues.includes(value as T)) {
    throw new Error(`${fieldName} must be one of: ${allowedValues.join(', ')}`);
  }

  return value as T;
}

function addOptionalParam(url: URL, name: string, value: string | undefined): void {
  if (value) {
    url.searchParams.set(name, value);
  }
}

function toolTextResult(text: string, isError = false): Record<string, unknown> {
  return {
    content: [
      {
        type: 'text',
        text,
      },
    ],
    isError,
  };
}

function jsonRpcSuccess(id: JsonRpcId, result: unknown): JsonRpcSuccess {
  return {
    jsonrpc: '2.0',
    id,
    result,
  };
}

function jsonRpcError(id: JsonRpcId, code: number, message: string): JsonRpcError {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
    },
  };
}

function getSessionId(req: Request): string | undefined {
  const header = req.header('mcp-session-id');
  return header && header.trim() ? header : undefined;
}

function removeUndefined<T extends Record<string, unknown>>(input: T): T {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as T;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}
