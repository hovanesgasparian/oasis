import { randomUUID } from 'node:crypto';
import type { Application, Request, Response } from 'express';
import { WorkspaceClient } from '@databricks/sdk-experimental';

type JsonRecord = Record<string, unknown>;

type FacilityRow = JsonRecord & {
  name?: string;
  latitude?: number | string;
  longitude?: number | string;
  distance_km?: number;
  relevance_score?: number;
  matched_care_domains?: string;
  matched_care_terms?: string;
  address?: string;
  source_urls_display?: string;
  new_patient_status?: string;
  insurance_status?: string;
};

type CareFinderSettings = {
  fmCandidateCount: number;
  maxDistanceKm: number;
  topN: number;
  newPatientsFilter: string;
  insuranceFilter: string;
};

type AnalyzeRequest = {
  imageName: string;
  imageDataUrl: string;
  mimeType: string;
  userLat: number;
  userLon: number;
  userLocationText: string;
  userAddressOrNotes: string;
  userSymptoms: string;
  userName: string;
  appointmentPreference: string;
  settings: CareFinderSettings;
};

const DEFAULT_AI_GATEWAY_BASE_URL = 'https://dbc-ee0ead6d-c943.cloud.databricks.com/ai-gateway/mlflow/v1';
const DEFAULT_SQL_WAREHOUSE_ID = '1bd5a57a33ae6d7c';
const DEFAULT_RESULTS_TABLE = 'workspace.default.camera_vision_results';
const DEFAULT_FACILITY_TABLE = 'databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.facilities';
const DEFAULT_USER_LAT = 23.0225;
const DEFAULT_USER_LON = 72.5714;
const DEFAULT_USER_LOCATION_LABEL = 'Ahmedabad, Gujarat';

const TAXONOMY_FIELDS = [
  'specialties',
  'procedure',
  'equipment',
  'capability',
  'description',
  'facilityTypeId',
  'organization_type',
];

const CARE_TAXONOMY: Record<
  string,
  {
    label: string;
    keywords: string[];
    care_types: string[];
    equipment?: string[];
    boost_when_urgent?: boolean;
  }
> = {
  emergency_trauma: {
    label: 'Emergency and trauma care',
    keywords: [
      'emergency',
      'trauma',
      'casualty',
      'accident',
      'urgent',
      'critical care',
      'icu',
      'ventilator',
      'ambulance',
      'heavy bleeding',
      'loss of consciousness',
      'severe pain',
    ],
    care_types: ['emergency', 'urgent care', 'general hospital'],
    boost_when_urgent: true,
  },
  orthopedics_musculoskeletal: {
    label: 'Orthopedics, fracture, bone and joint care',
    keywords: [
      'orthopedic',
      'orthopaedic',
      'fracture',
      'broken bone',
      'bone',
      'joint',
      'sprain',
      'dislocation',
      'deformity',
      'swelling after fall',
      'x-ray',
      'cast',
      'spine',
      'physiotherapy',
    ],
    care_types: ['orthopedics', 'diagnostics', 'urgent care'],
    equipment: ['x-ray', 'ct scanner', 'mri', 'operation theater'],
  },
  wound_burn_care: {
    label: 'Wound, burn and plastic surgery care',
    keywords: [
      'wound',
      'cut',
      'laceration',
      'bleeding',
      'stitches',
      'suturing',
      'dressing',
      'burn',
      'infection',
      'abscess',
      'ulcer',
      'plastic surgery',
    ],
    care_types: ['urgent care', 'surgery', 'general hospital'],
    equipment: ['operation theater', 'wound care', 'sterile dressing'],
  },
  dermatology_skin: {
    label: 'Dermatology and skin care',
    keywords: [
      'dermatology',
      'skin',
      'rash',
      'redness',
      'eczema',
      'psoriasis',
      'allergy',
      'hives',
      'itching',
      'lesion',
      'acne',
      'fungal',
    ],
    care_types: ['dermatology', 'routine care'],
  },
  ophthalmology_eye: {
    label: 'Ophthalmology and eye care',
    keywords: [
      'ophthalmology',
      'eye',
      'vision',
      'red eye',
      'eye redness',
      'cornea',
      'retina',
      'cataract',
      'glaucoma',
      'foreign body in eye',
    ],
    care_types: ['ophthalmology', 'urgent care'],
  },
  pediatrics_neonatal: {
    label: 'Pediatrics and neonatal care',
    keywords: [
      'pediatric',
      'paediatric',
      'child',
      'children',
      'infant',
      'baby',
      'neonatal',
      'nicu',
      'picu',
      'pediatrics',
    ],
    care_types: ['pediatrics', 'general hospital'],
  },
  obstetrics_gynecology: {
    label: 'Obstetrics, gynecology and maternity care',
    keywords: [
      'gynecology',
      'gynaecology',
      'obstetrics',
      'pregnancy',
      'maternity',
      'labor room',
      'delivery',
      'maternal fetal',
      'neonatal',
    ],
    care_types: ['gynecology', 'general hospital'],
  },
  cardiac_stroke_critical: {
    label: 'Cardiac, stroke and critical care',
    keywords: [
      'cardiology',
      'cardiac',
      'chest pain',
      'heart',
      'cathlab',
      'angiography',
      'stroke',
      'thrombectomy',
      'neurology',
      'critical care',
      'icu',
    ],
    care_types: ['emergency', 'cardiology', 'neurology', 'critical care'],
    boost_when_urgent: true,
  },
  respiratory_pulmonology: {
    label: 'Respiratory and pulmonology care',
    keywords: [
      'pulmonology',
      'respiratory',
      'breathing',
      'shortness of breath',
      'oxygen',
      'ventilator',
      'bronchoscopy',
      'asthma',
      'pneumonia',
    ],
    care_types: ['pulmonology', 'emergency', 'general hospital'],
  },
  neurology_neurosurgery: {
    label: 'Neurology and neurosurgery',
    keywords: [
      'neurology',
      'neurosurgery',
      'brain',
      'spine',
      'seizure',
      'paralysis',
      'head injury',
      'stroke',
      'intracranial',
      'dsa',
    ],
    care_types: ['neurology', 'neurosurgery', 'general hospital'],
  },
  diagnostics_imaging_labs: {
    label: 'Diagnostics, imaging and laboratory services',
    keywords: [
      'diagnostics',
      'laboratory',
      'lab',
      'pathology',
      'blood test',
      'x-ray',
      'ct',
      'ct scanner',
      'mri',
      'ultrasound',
      'radiology',
      'imaging',
      'ecg',
    ],
    care_types: ['diagnostics', 'general hospital'],
  },
  surgery_operating_theater: {
    label: 'Surgery and operating-theater capability',
    keywords: [
      'surgery',
      'surgical',
      'general surgery',
      'operation theater',
      'operating theatre',
      'ot',
      'anesthesia',
      'anaesthesia',
    ],
    care_types: ['surgery', 'general hospital'],
  },
  primary_internal_medicine: {
    label: 'Primary care and internal medicine',
    keywords: [
      'internal medicine',
      'family medicine',
      'general physician',
      'clinic',
      'outpatient',
      'opd',
      'fever',
      'infection',
      'diabetes',
      'hypertension',
    ],
    care_types: ['internal medicine', 'primary care', 'routine care'],
  },
  dental_ent: {
    label: 'Dental and ENT care',
    keywords: ['dental', 'dentist', 'tooth', 'oral', 'maxillofacial', 'ent', 'otolaryngology', 'ear', 'nose', 'throat'],
    care_types: ['dental', 'otolaryngology'],
  },
};

let workspaceClient: WorkspaceClient | null = null;

export function registerCareFinderRoutes(app: Application): void {
  app.get('/api/care-finder/config', (_req: Request, res: Response) => {
    res.json({
      visionModelName: getVisionModelName(),
      matchModelName: getMatchModelName(),
      facilityTable: getFacilityTable(),
      resultsTable: getResultsTable(),
      defaultLocation: {
        lat: DEFAULT_USER_LAT,
        lon: DEFAULT_USER_LON,
        label: DEFAULT_USER_LOCATION_LABEL,
      },
    });
  });

  app.post('/api/care-finder/geocode', async (req: Request, res: Response) => {
    try {
      const placeText = getString(req.body, 'placeText');
      res.json(await geocodeCityTownState(placeText));
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post('/api/care-finder/reverse-geocode', async (req: Request, res: Response) => {
    try {
      const lat = getNumber(req.body, 'lat', DEFAULT_USER_LAT);
      const lon = getNumber(req.body, 'lon', DEFAULT_USER_LON);
      res.json(await reverseGeocodeLatLon(lat, lon));
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.get('/api/care-finder/recent', async (_req: Request, res: Response) => {
    try {
      res.json({ rows: await loadRecentAnalyses() });
    } catch (error) {
      sendRouteError(res, error);
    }
  });

  app.post('/api/care-finder/analyze', async (req: Request, res: Response) => {
    try {
      const request = parseAnalyzeRequest(req.body);
      const response = await analyzeAndRecommend(request);
      res.json(response);
    } catch (error) {
      sendRouteError(res, error);
    }
  });
}

async function analyzeAndRecommend(request: AnalyzeRequest): Promise<JsonRecord> {
  const imageId = randomUUID();
  const userContext = [
    `User latitude: ${request.userLat}`,
    `User longitude: ${request.userLon}`,
    `City/town/state: ${request.userLocationText}`,
    `User address or notes: ${request.userAddressOrNotes}`,
    `User symptoms or context: ${request.userSymptoms}`,
  ].join('\n');

  const visionResult = await runVisionModel(request.imageDataUrl, userContext);
  const parsed = isRecord(visionResult.parsed) ? visionResult.parsed : {};

  if (!Array.isArray(parsed.care_domains) || parsed.care_domains.length === 0) {
    parsed.care_domains = inferCareDomains(parsed);
  }

  const facilities = await loadFacilities(request.userLat, request.userLon, request.settings.maxDistanceKm);
  const taxonomyCandidates = recommendFacilities(
    facilities,
    request.userLat,
    request.userLon,
    parsed,
    request.settings,
    request.settings.fmCandidateCount
  );
  const recommended = await rerankWithFoundationModel(
    taxonomyCandidates,
    parsed,
    userContext,
    request.settings.topN,
    request.userAddressOrNotes,
    request.userSymptoms,
    request.userName,
    request.appointmentPreference
  );

  const verification = compareTaxonomyVsFm(taxonomyCandidates.slice(0, request.settings.topN), recommended);
  const primaryFacilityId =
    recommended.length > 0 ? stringFromUnknown(recommended[0].unique_id ?? recommended[0].name) : '';
  let writeWarning = '';

  try {
    await insertResult({
      imageId,
      imageName: request.imageName,
      facilityId: primaryFacilityId,
      modelName: `${getVisionModelName()} + ${getMatchModelName()}`,
      prompt: userContext,
      caption: visionResult.caption,
      rawResponse: visionResult.rawResponse,
    });
  } catch (error) {
    writeWarning = `Analysis completed, but writing the result to ${getResultsTable()} failed: ${errorMessage(error)}`;
    console.warn('[care-finder] Delta result write failed:', error);
  }

  return {
    imageId,
    parsed,
    caption: visionResult.caption,
    urgency: parsed.urgency_level ?? 'unclear',
    taxonomyCandidates: taxonomyCandidates.slice(0, request.settings.topN),
    recommended,
    verification,
    wroteResultTo: getResultsTable(),
    writeWarning,
  };
}

async function runVisionModel(
  imageDataUrl: string,
  userContext: string
): Promise<{ caption: string; parsed: JsonRecord; rawResponse: string }> {
  const prompt = `
You are helping route a user to appropriate care based on an uploaded image.

Important safety rules:
- Do not provide a definitive medical diagnosis.
- Do not claim certainty from an image.
- Provide non-diagnostic visual observations only.
- Mention that a licensed clinician should evaluate concerning symptoms.
- If red flags are visible or described, recommend urgent or emergency care.

User context:
${userContext}

Use these generalized care-domain taxonomy ids when relevant:
${JSON.stringify(Object.keys(CARE_TAXONOMY))}

Analyze the image and return JSON only with this schema:
{
  "brief_summary": "one short non-diagnostic summary",
  "possible_conditions_or_findings": ["possible visible issues, not diagnoses"],
  "observed_injury_or_ailment_features": ["visible cues such as swelling, cut, rash, bruising, burn, deformity, eye redness, etc."],
  "urgency_level": "emergency | urgent | routine | unclear",
  "red_flags": ["visible or user-described red flags"],
  "care_domains": ["taxonomy ids from the list above"],
  "taxonomy_terms": ["plain-language service, equipment, procedure, capability, and specialty search terms"],
  "recommended_care_types": ["emergency", "urgent care", "general hospital", "orthopedics", "dermatology", "pediatrics", "ophthalmology", "internal medicine", "surgery", "diagnostics", "pharmacy"],
  "specialties_to_consider": ["clinical specialties that may be relevant"],
  "equipment_or_services_needed": ["x-ray", "blood laboratory", "ICU", "operation theater", "wound care", "imaging", "pediatric care", etc."],
  "self_care_cautions": ["brief safety cautions only"],
  "confidence_notes": "limitations of image-only assessment"
}`;

  const response = await callAiGateway({
    model: getVisionModelName(),
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: imageDataUrl } },
        ],
      },
    ],
    max_tokens: 1200,
  });
  const caption = extractMessageContent(response);
  return {
    caption,
    parsed: safeJsonLoads(caption),
    rawResponse: JSON.stringify(response),
  };
}

async function runFacilityMatchModel(
  parsed: JsonRecord,
  userContext: string,
  candidates: FacilityRow[]
): Promise<JsonRecord> {
  if (candidates.length === 0) {
    return { matches: [], verification: { summary: 'No candidates to rerank.' } };
  }

  const candidatePayloads = candidates.map((row, index) => facilityCandidatePayload(row, `c${index + 1}`));
  const prompt = `
You are a healthcare facility routing assistant. You are not diagnosing.
Your job is to match the reported illness and non-diagnostic image findings to the most appropriate facility.

Use BOTH sources of evidence:
1. Generated recommender taxonomy context.
2. Relevant facility columns: specialties, procedure, equipment, capability, description, facility type, organization type, distance, and baseline taxonomy score.

Prefer facilities that explicitly have the specialty, procedure, equipment, or capability needed for the reported problem.
For emergencies or red flags, prioritize emergency/trauma/general-hospital capability and proximity.
Do not recommend a facility only because it is nearby if the capability match is poor.

Generated taxonomy context:
${taxonomyContextForPrompt()}

Reported illness and image-routing context:
${JSON.stringify(buildReportedIllnessContext(parsed, userContext))}

Candidate facilities:
${JSON.stringify(candidatePayloads)}

Return JSON only with this schema:
{
  "matches": [
    {
      "candidate_id": "c1",
      "match_score": 0,
      "match_confidence": "high | medium | low",
      "matched_illness_need": "short phrase",
      "why_better_than_taxonomy_only": "short explanation using facility columns and taxonomy context",
      "missing_or_uncertain_capabilities": ["items that are unclear or missing"]
    }
  ],
  "verification": {
    "does_fm_add_value_over_taxonomy_only": true,
    "summary": "brief model-as-judge comparison of semantic matching versus keyword taxonomy scoring",
    "caveat": "This is not ground truth validation; it is a runtime semantic consistency check."
  }
}

Score each candidate from 0 to 100. Include every candidate exactly once.`;

  const response = await callAiGateway({
    model: getMatchModelName(),
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 2500,
    temperature: 0,
  });

  const content = extractMessageContent(response);
  const parsedResponse = safeJsonLoads(content);
  if (!Array.isArray(parsedResponse.matches)) {
    parsedResponse.matches = [];
  }
  return parsedResponse;
}

async function callAiGateway(body: JsonRecord): Promise<JsonRecord> {
  const token = process.env.DATABRICKS_TOKEN;
  if (!token) {
    throw new Error('DATABRICKS_TOKEN is not set. Add it as a Databricks App environment variable or secret.');
  }

  const response = await fetch(`${getAiGatewayBaseUrl()}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  const payload = text ? safeJsonLoads(text) : {};
  if (!response.ok) {
    throw new Error(
      `AI Gateway request failed (${response.status}): ${getString(payload, 'message') || response.statusText}`
    );
  }
  return payload;
}

async function loadFacilities(userLat: number, userLon: number, maxDistanceKm: number): Promise<FacilityRow[]> {
  const latDelta = Math.max(maxDistanceKm / 111, 0.25);
  const lonDelta = Math.max(maxDistanceKm / (111 * Math.max(Math.cos((Math.PI * userLat) / 180), 0.2)), 0.25);
  const rowLimit = Number(process.env.FACILITY_QUERY_LIMIT ?? '1500');

  const query = `
    SELECT *
    FROM ${getFacilityTable()}
    WHERE latitude IS NOT NULL
      AND longitude IS NOT NULL
      AND CAST(latitude AS DOUBLE) BETWEEN :min_lat AND :max_lat
      AND CAST(longitude AS DOUBLE) BETWEEN :min_lon AND :max_lon
    LIMIT ${Number.isFinite(rowLimit) && rowLimit > 0 ? Math.floor(rowLimit) : 1500}
  `;

  return executeSql(query, [
    { name: 'min_lat', value: String(userLat - latDelta), type: 'DOUBLE' },
    { name: 'max_lat', value: String(userLat + latDelta), type: 'DOUBLE' },
    { name: 'min_lon', value: String(userLon - lonDelta), type: 'DOUBLE' },
    { name: 'max_lon', value: String(userLon + lonDelta), type: 'DOUBLE' },
  ]);
}

async function loadRecentAnalyses(): Promise<JsonRecord[]> {
  const query = `
    SELECT image_name, model_name, caption, inference_ts
    FROM ${getResultsTable()}
    ORDER BY inference_ts DESC
    LIMIT 20
  `;
  return executeSql(query, []);
}

async function insertResult(input: {
  imageId: string;
  imageName: string;
  facilityId: string;
  modelName: string;
  prompt: string;
  caption: string;
  rawResponse: string;
}): Promise<void> {
  const query = `
    INSERT INTO ${getResultsTable()}
    SELECT
      :image_id AS image_id,
      :image_name AS image_name,
      :facility_id AS facility_id,
      :model_name AS model_name,
      :prompt AS prompt,
      :caption AS caption,
      :raw_response AS raw_response,
      current_timestamp() AS inference_ts
  `;

  await executeSql(query, [
    { name: 'image_id', value: input.imageId },
    { name: 'image_name', value: input.imageName },
    { name: 'facility_id', value: input.facilityId },
    { name: 'model_name', value: input.modelName },
    { name: 'prompt', value: input.prompt },
    { name: 'caption', value: input.caption },
    { name: 'raw_response', value: input.rawResponse },
  ]);
}

async function executeSql(
  statement: string,
  parameters: Array<{ name: string; value: string; type?: string }>
): Promise<JsonRecord[]> {
  const client = getWorkspaceClient();
  let response = await client.statementExecution.executeStatement({
    warehouse_id: getSqlWarehouseId(),
    statement,
    parameters,
    disposition: 'INLINE',
    format: 'JSON_ARRAY',
    wait_timeout: '30s',
    on_wait_timeout: 'CONTINUE',
  });

  for (let attempt = 0; attempt < 10 && response.status?.state !== 'SUCCEEDED'; attempt += 1) {
    if (
      response.status?.state === 'FAILED' ||
      response.status?.state === 'CANCELED' ||
      response.status?.state === 'CLOSED'
    ) {
      throw new Error(response.status.error?.message ?? `SQL statement ended with state ${response.status.state}`);
    }
    if (!response.statement_id) {
      throw new Error('SQL statement did not return a statement_id for polling.');
    }
    await delay(1000);
    response = await client.statementExecution.getStatement({ statement_id: response.statement_id });
  }

  if (response.status?.state !== 'SUCCEEDED') {
    throw new Error(`SQL statement did not finish. Current state: ${response.status?.state ?? 'unknown'}`);
  }

  const columns = response.manifest?.schema?.columns?.map((column) => column.name ?? '') ?? [];
  const rows = response.result?.data_array ?? [];
  return rows.map((row) => Object.fromEntries(columns.map((column, index) => [column, parseSqlValue(row[index])])));
}

function getWorkspaceClient(): WorkspaceClient {
  workspaceClient ??= new WorkspaceClient({});
  return workspaceClient;
}

function recommendFacilities(
  facilities: FacilityRow[],
  userLat: number,
  userLon: number,
  parsed: JsonRecord,
  settings: CareFinderSettings,
  topN: number
): FacilityRow[] {
  const careTerms = buildCareTerms(parsed);
  const careDomains = getCareDomains(parsed);
  const rows: FacilityRow[] = [];

  for (const row of facilities) {
    const lat = toNumber(row.latitude);
    const lon = toNumber(row.longitude);
    if (lat === null || lon === null) {
      continue;
    }

    const distanceKm = haversineKm(userLat, userLon, lat, lon);
    if (distanceKm > settings.maxDistanceKm) {
      continue;
    }

    const scoreDetails = keywordScore(row, careTerms, careDomains);
    const newPatientStatus = inferNewPatientStatus(row);
    const insuranceStatus = inferInsuranceStatus(row);

    if (settings.newPatientsFilter === 'Only facilities taking new patients' && newPatientStatus !== 'accepting') {
      continue;
    }
    if (settings.newPatientsFilter === 'Only facilities with unknown status' && newPatientStatus !== 'unknown') {
      continue;
    }
    if (settings.insuranceFilter === 'Insurance accepted/mentioned' && insuranceStatus !== 'insurance_mentioned') {
      continue;
    }
    if (settings.insuranceFilter === 'Self-pay/cash accepted/mentioned' && insuranceStatus !== 'self_pay_mentioned') {
      continue;
    }
    if (settings.insuranceFilter === 'Unknown' && insuranceStatus !== 'unknown') {
      continue;
    }

    rows.push({
      ...row,
      distance_km: round(distanceKm, 2),
      relevance_score: scoreDetails.score,
      combined_score: scoreDetails.score * 1000 - distanceKm,
      new_patient_status: newPatientStatus,
      insurance_status: insuranceStatus,
      address: makeAddress(row),
      source_urls_display: parseSourceUrls(row.source_urls),
      matched_care_domains: scoreDetails.matchedDomains.join(', '),
      matched_care_terms: scoreDetails.matchedTerms.join(', '),
      match_explanation: `Matched domains: ${scoreDetails.matchedDomains.join(', ') || 'none'}; matched terms: ${scoreDetails.matchedTerms.join(', ') || 'none'}`,
    });
  }

  return rows
    .sort((a, b) => {
      const relevanceDiff = Number(b.relevance_score ?? 0) - Number(a.relevance_score ?? 0);
      if (relevanceDiff !== 0) {
        return relevanceDiff;
      }
      return Number(a.distance_km ?? 0) - Number(b.distance_km ?? 0);
    })
    .slice(0, topN);
}

async function rerankWithFoundationModel(
  baselineCandidates: FacilityRow[],
  parsed: JsonRecord,
  userContext: string,
  topN: number,
  userAddressOrNotes: string,
  userSymptoms: string,
  userName: string,
  appointmentPreference: string
): Promise<FacilityRow[]> {
  if (baselineCandidates.length === 0) {
    return [];
  }

  const fmResult = await runFacilityMatchModel(parsed, userContext, baselineCandidates);
  const matches = Array.isArray(fmResult.matches) ? fmResult.matches : [];
  const matchById = new Map<string, JsonRecord>();
  for (const match of matches) {
    if (isRecord(match)) {
      matchById.set(stringFromUnknown(match.candidate_id), match);
    }
  }

  return baselineCandidates
    .map((row, index) => {
      const candidateId = `c${index + 1}`;
      const match = matchById.get(candidateId) ?? {};
      const enriched: FacilityRow = {
        ...row,
        fm_candidate_id: candidateId,
        fm_match_score: Math.trunc(Number(match.match_score ?? 0) || 0),
        fm_match_confidence: stringFromUnknown(match.match_confidence),
        fm_matched_illness_need: stringFromUnknown(match.matched_illness_need),
        fm_match_reason: stringFromUnknown(match.why_better_than_taxonomy_only),
        fm_missing_or_uncertain: Array.isArray(match.missing_or_uncertain_capabilities)
          ? match.missing_or_uncertain_capabilities.map(String).filter(Boolean).join(', ')
          : stringFromUnknown(match.missing_or_uncertain_capabilities),
        fm_verification_summary: JSON.stringify(fmResult.verification ?? {}),
      };
      const phone = getFacilityWhatsappPhone(enriched);
      enriched.whatsapp_phone = phone;
      enriched.whatsapp_phone_display = phone ? `+${phone}` : '';
      enriched.whatsapp_chat_url = buildWhatsappUrl(
        phone,
        buildWhatsappMessage(
          enriched,
          parsed,
          userAddressOrNotes,
          userSymptoms,
          userName,
          appointmentPreference,
          'chat'
        )
      );
      enriched.whatsapp_appointment_url = buildWhatsappUrl(
        phone,
        buildWhatsappMessage(
          enriched,
          parsed,
          userAddressOrNotes,
          userSymptoms,
          userName,
          appointmentPreference,
          'appointment'
        )
      );
      return enriched;
    })
    .sort((a, b) => {
      const fmDiff = Number(b.fm_match_score ?? 0) - Number(a.fm_match_score ?? 0);
      if (fmDiff !== 0) {
        return fmDiff;
      }
      const relevanceDiff = Number(b.relevance_score ?? 0) - Number(a.relevance_score ?? 0);
      if (relevanceDiff !== 0) {
        return relevanceDiff;
      }
      return Number(a.distance_km ?? 0) - Number(b.distance_km ?? 0);
    })
    .slice(0, topN);
}

function compareTaxonomyVsFm(taxonomyRanked: FacilityRow[], fmRanked: FacilityRow[]): JsonRecord {
  if (taxonomyRanked.length === 0 || fmRanked.length === 0) {
    return { status: 'insufficient_candidates' };
  }

  const taxonomyTop = String(taxonomyRanked[0].name ?? '');
  const fmTop = String(fmRanked[0].name ?? '');
  return {
    taxonomy_only_top: taxonomyTop,
    fm_enhanced_top: fmTop,
    top_changed: taxonomyTop !== fmTop,
    fm_top_match_score: fmRanked[0].fm_match_score ?? '',
    fm_top_reason: fmRanked[0].fm_match_reason ?? '',
    verification_note:
      'FM reranking adds a semantic check over taxonomy keywords by reading illness context against specialties, procedures, equipment, capabilities, and descriptions. This is a model-as-judge runtime verification, not labeled clinical ground truth.',
  };
}

function buildCareTerms(parsed: JsonRecord): string[] {
  const terms: string[] = [];
  for (const key of [
    'taxonomy_terms',
    'recommended_care_types',
    'specialties_to_consider',
    'equipment_or_services_needed',
    'possible_conditions_or_findings',
    'observed_injury_or_ailment_features',
  ]) {
    terms.push(...stringsFromUnknown(parsed[key]));
  }

  const careDomains = getCareDomains(parsed);
  for (const domain of careDomains) {
    const config = CARE_TAXONOMY[domain];
    if (!config) {
      continue;
    }
    terms.push(...config.care_types);
    terms.push(...(config.equipment ?? []));
    terms.push(...config.keywords.slice(0, 12));
  }

  const urgency = stringFromUnknown(parsed.urgency_level).toLowerCase();
  if (urgency === 'emergency' || urgency === 'urgent') {
    terms.push('emergency', 'trauma', 'hospital', 'critical care', 'x-ray', 'laboratory', 'icu');
  }

  return [...new Set(terms.map((term) => term.trim()).filter(Boolean))];
}

function inferCareDomains(parsed: JsonRecord): string[] {
  const evidenceParts: string[] = [];
  for (const key of [
    'care_domains',
    'taxonomy_terms',
    'recommended_care_types',
    'specialties_to_consider',
    'equipment_or_services_needed',
    'possible_conditions_or_findings',
    'observed_injury_or_ailment_features',
    'red_flags',
    'brief_summary',
  ]) {
    evidenceParts.push(...stringsFromUnknown(parsed[key]));
  }

  const evidence = normalizeSearchText(evidenceParts.join(' '));
  const urgency = stringFromUnknown(parsed.urgency_level).toLowerCase();
  const scored: Array<[string, number]> = [];

  for (const [domain, config] of Object.entries(CARE_TAXONOMY)) {
    let score = 0;
    for (const keyword of config.keywords) {
      score += scoreTermAgainstBlob(evidence, keyword, 5, 1);
    }
    if ((urgency === 'emergency' || urgency === 'urgent') && config.boost_when_urgent) {
      score += 8;
    }
    if (score > 0) {
      scored.push([domain, score]);
    }
  }

  return scored
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([domain]) => domain);
}

function getCareDomains(parsed: JsonRecord): string[] {
  const fromParsed = Array.isArray(parsed.care_domains)
    ? parsed.care_domains.map(String).filter((domain) => CARE_TAXONOMY[domain])
    : [];
  return fromParsed.length > 0 ? fromParsed : inferCareDomains(parsed);
}

function keywordScore(
  row: FacilityRow,
  careTerms: string[],
  careDomains: string[]
): { score: number; matchedTerms: string[]; matchedDomains: string[] } {
  const fieldWeights: Record<string, number> = {
    specialties: 8,
    procedure: 7,
    equipment: 7,
    capability: 6,
    description: 4,
    facilityTypeId: 2,
    organization_type: 1,
  };

  let score = 0;
  const matchedTerms: string[] = [];
  const matchedDomains: string[] = [];

  for (const term of careTerms) {
    let termScore = 0;
    for (const [field, weight] of Object.entries(fieldWeights)) {
      const fieldValue = row[field];
      if (fieldValue === undefined || fieldValue === null) {
        continue;
      }
      termScore += scoreTermAgainstBlob(normalizeSearchText(fieldValue), term, weight, 1);
    }
    if (termScore > 0) {
      matchedTerms.push(term);
      score += termScore;
    }
  }

  for (const domain of careDomains) {
    const config = CARE_TAXONOMY[domain];
    if (!config) {
      continue;
    }
    let domainScore = 0;
    for (const keyword of config.keywords) {
      for (const [field, weight] of Object.entries(fieldWeights)) {
        const fieldValue = row[field];
        if (fieldValue === undefined || fieldValue === null) {
          continue;
        }
        domainScore += scoreTermAgainstBlob(normalizeSearchText(fieldValue), keyword, weight, 1);
      }
    }
    if (domainScore > 0) {
      matchedDomains.push(config.label);
      score += Math.min(domainScore, 80);
    }
  }

  const blob = textBlob(row);
  if (blob.includes('hospital')) {
    score += 1;
  }
  if (blob.includes('emergency') || blob.includes('24/7') || blob.includes('24x7') || blob.includes('trauma')) {
    score += 4;
  }
  if (blob.includes('multispecialty') || blob.includes('multi specialty') || blob.includes('super specialty')) {
    score += 3;
  }

  return {
    score: Math.trunc(score),
    matchedTerms: [...new Set(matchedTerms)].slice(0, 12),
    matchedDomains: [...new Set(matchedDomains)].slice(0, 6),
  };
}

function facilityBlob(row: FacilityRow): string {
  return [
    'name',
    'description',
    'specialties',
    'procedure',
    'equipment',
    'capability',
    'metadata',
    'insurance',
    'payment',
    'accepted_insurance',
    'new_patients',
    'accepting_new_patients',
    'appointment',
    'source_urls',
  ]
    .map((field) => row[field])
    .filter((value) => value !== undefined && value !== null)
    .map((value) => stringFromUnknown(value).toLowerCase())
    .join(' ');
}

function inferNewPatientStatus(row: FacilityRow): string {
  const blob = facilityBlob(row);
  if (
    ['not accepting new patients', 'not taking new patients', 'closed to new patients', 'no new patients'].some(
      (term) => blob.includes(term)
    )
  ) {
    return 'not_accepting';
  }
  if (
    [
      'accepting new patients',
      'taking new patients',
      'new patients accepted',
      'accepts new patients',
      'walk-in',
      'walk ins',
      'walkins',
      'open to new patients',
      'appointments available',
    ].some((term) => blob.includes(term))
  ) {
    return 'accepting';
  }
  return 'unknown';
}

function inferInsuranceStatus(row: FacilityRow): string {
  const blob = facilityBlob(row);
  const hasInsurance = [
    'insurance',
    'insured',
    'cashless',
    'tpa',
    'medicare',
    'medicaid',
    'private insurance',
    'accepted insurance',
    'health plan',
    'payer',
    'network',
    'in-network',
  ].some((term) => blob.includes(term));
  const hasSelfPay = [
    'self pay',
    'self-pay',
    'cash',
    'out of pocket',
    'out-of-pocket',
    'private pay',
    'payment accepted',
  ].some((term) => blob.includes(term));
  if (hasInsurance) {
    return 'insurance_mentioned';
  }
  if (hasSelfPay) {
    return 'self_pay_mentioned';
  }
  return 'unknown';
}

function textBlob(row: FacilityRow): string {
  return ['name', 'address_city', 'address_stateOrRegion', ...TAXONOMY_FIELDS]
    .map((field) => row[field])
    .filter((value) => value !== undefined && value !== null)
    .map(normalizeSearchText)
    .join(' ');
}

function scoreTermAgainstBlob(blob: string, term: string, exactWeight: number, tokenWeight: number): number {
  const termClean = normalizeSearchText(term).trim();
  if (!termClean) {
    return 0;
  }

  let score = blob.includes(termClean) ? exactWeight : 0;
  for (const token of termClean.split(/\s+/)) {
    if (token.length >= 4 && blob.includes(token)) {
      score += tokenWeight;
    }
  }
  return score;
}

function buildWhatsappMessage(
  row: FacilityRow,
  parsed: JsonRecord,
  userAddressOrNotes: string,
  userSymptoms: string,
  userName: string,
  appointmentPreference: string,
  messageKind: 'chat' | 'appointment'
): string {
  const lines = [
    messageKind === 'appointment'
      ? 'Hello, I would like to request an appointment.'
      : 'Hello, I found your facility through a care finder app and would like to ask about availability.',
    userName.trim() ? `Patient/name: ${userName.trim()}` : '',
    appointmentPreference.trim() ? `Preferred appointment time: ${appointmentPreference.trim()}` : '',
    `Facility: ${stringFromUnknown(row.name, 'this facility')}`,
    row.distance_km !== undefined ? `Approximate distance from user: ${row.distance_km} km` : '',
    userAddressOrNotes ? `User location/context: ${userAddressOrNotes}` : '',
    userSymptoms ? `Symptoms/context provided by user: ${userSymptoms}` : '',
    parsed.brief_summary ? `Non-diagnostic image summary: ${stringFromUnknown(parsed.brief_summary)}` : '',
    `Urgency flagged by app: ${stringFromUnknown(parsed.urgency_level, 'unclear')}`,
    row.matched_care_domains ? `Relevant care domains: ${row.matched_care_domains}` : '',
    row.matched_care_terms ? `Relevant care needs: ${row.matched_care_terms}` : '',
    'Please confirm whether the appropriate doctor/service is available and what next steps I should follow.',
    'Note: this app is not a medical diagnosis.',
  ];
  return lines.filter(Boolean).join('\n');
}

function buildWhatsappUrl(phoneDigits: string, message: string): string {
  const encodedMessage = encodeURIComponent(message);
  return phoneDigits ? `https://wa.me/${phoneDigits}?text=${encodedMessage}` : `https://wa.me/?text=${encodedMessage}`;
}

function getFacilityWhatsappPhone(row: FacilityRow): string {
  for (const field of ['officialPhone', 'phone_numbers', 'phone', 'mobile', 'contact_phone']) {
    const phone = extractFirstPhoneNumber(row[field]);
    if (phone) {
      return phone;
    }
  }
  return '';
}

function extractFirstPhoneNumber(value: unknown): string {
  const candidates = parseListLike(value).flatMap((entry) => entry.split(/[,;/|]/));
  for (const candidate of candidates) {
    let digits = candidate.replace(/\D/g, '');
    if (digits.length >= 10) {
      if (digits.length === 10) {
        digits = `91${digits}`;
      }
      return digits;
    }
  }
  return '';
}

function makeAddress(row: FacilityRow): string {
  return [
    'address_line1',
    'address_line2',
    'address_line3',
    'address_city',
    'address_stateOrRegion',
    'address_zipOrPostcode',
    'address_country',
  ]
    .map((field) => row[field])
    .filter((value) => value !== undefined && value !== null && stringFromUnknown(value).trim())
    .map((value) => stringFromUnknown(value).trim())
    .join(', ');
}

function parseSourceUrls(value: unknown): string {
  const values = parseListLike(value).filter(Boolean);
  return values.slice(0, 3).join(', ');
}

async function reverseGeocodeLatLon(lat: number, lon: number): Promise<JsonRecord> {
  const response = await fetchUrlJson('https://nominatim.openstreetmap.org/reverse', {
    format: 'jsonv2',
    lat: String(lat),
    lon: String(lon),
    addressdetails: '1',
  });
  const responseRecord = isRecord(response) ? response : {};
  const address = isRecord(responseRecord.address) ? responseRecord.address : {};
  const label = compactLocationLabel(address) || stringFromUnknown(responseRecord.display_name);
  return {
    label,
    display_name: stringFromUnknown(responseRecord.display_name),
    city_or_town: getCityOrTown(address),
    state: address.state ?? address.state_district ?? '',
    country: address.country ?? '',
  };
}

async function geocodeCityTownState(placeText: string): Promise<JsonRecord> {
  const query = placeText.trim();
  if (!query) {
    return { error: 'Enter a city, town, or state.' };
  }

  const response = await fetchUrlJson('https://nominatim.openstreetmap.org/search', {
    format: 'jsonv2',
    q: query,
    countrycodes: 'in',
    addressdetails: '1',
    limit: '1',
  });
  const results = Array.isArray(response) ? response : [];
  const first = results.find(isRecord);
  if (!first) {
    return { error: `Could not find coordinates for '${query}'.` };
  }
  const address = isRecord(first.address) ? first.address : {};
  return {
    latitude: Number(first.lat),
    longitude: Number(first.lon),
    label: compactLocationLabel(address) || stringFromUnknown(first.display_name, query),
    display_name: stringFromUnknown(first.display_name),
    city_or_town: getCityOrTown(address),
    state: address.state ?? address.state_district ?? '',
    country: address.country ?? '',
  };
}

async function fetchUrlJson(url: string, params: Record<string, string>): Promise<unknown> {
  const requestUrl = new URL(url);
  for (const [key, value] of Object.entries(params)) {
    requestUrl.searchParams.set(key, value);
  }
  const response = await fetch(requestUrl, {
    headers: {
      'User-Agent': 'care-finder-vision-app/1.0',
    },
  });
  if (!response.ok) {
    throw new Error(`Geocoding request failed (${response.status}): ${response.statusText}`);
  }
  return response.json();
}

function compactLocationLabel(address: JsonRecord): string {
  return [getCityOrTown(address), address.state ?? address.state_district ?? '', address.country ?? '']
    .map((value) => stringFromUnknown(value))
    .filter(Boolean)
    .join(', ');
}

function getCityOrTown(address: JsonRecord): string {
  return stringFromUnknown(
    address.city ?? address.town ?? address.village ?? address.municipality ?? address.suburb ?? address.county ?? ''
  );
}

function taxonomyContextForPrompt(): string {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(CARE_TAXONOMY).map(([domain, config]) => [
        domain,
        {
          label: config.label,
          keywords: config.keywords.slice(0, 18),
          care_types: config.care_types,
          equipment: config.equipment ?? [],
        },
      ])
    )
  );
}

function buildReportedIllnessContext(parsed: JsonRecord, userContext: string): JsonRecord {
  const keys = [
    'brief_summary',
    'possible_conditions_or_findings',
    'observed_injury_or_ailment_features',
    'urgency_level',
    'red_flags',
    'care_domains',
    'taxonomy_terms',
    'recommended_care_types',
    'specialties_to_consider',
    'equipment_or_services_needed',
  ];
  return {
    user_context: userContext,
    image_and_symptom_routing_output: Object.fromEntries(
      keys.filter((key) => key in parsed).map((key) => [key, parsed[key]])
    ),
  };
}

function facilityCandidatePayload(row: FacilityRow, candidateId: string): JsonRecord {
  return {
    candidate_id: candidateId,
    name: String(row.name ?? ''),
    distance_km: row.distance_km ?? '',
    taxonomy_relevance_score: row.relevance_score ?? 0,
    facilityTypeId: truncateText(row.facilityTypeId, 250),
    organization_type: truncateText(row.organization_type, 250),
    description: truncateText(row.description, 900),
    specialties: truncateText(row.specialties, 700),
    procedure: truncateText(row.procedure, 700),
    equipment: truncateText(row.equipment, 700),
    capability: truncateText(row.capability, 700),
    matched_care_domains: String(row.matched_care_domains ?? ''),
    matched_care_terms: String(row.matched_care_terms ?? ''),
  };
}

function truncateText(value: unknown, maxChars: number): string {
  const text = normalizeSearchText(value);
  if (text.length <= maxChars) {
    return text;
  }
  const trimmed = text.slice(0, maxChars);
  const lastSpace = trimmed.lastIndexOf(' ');
  return `${trimmed.slice(0, lastSpace > 0 ? lastSpace : maxChars)}...`;
}

function normalizeSearchText(value: unknown): string {
  const text = parseListLike(value).join(' ');
  return splitCamelCase(text).replace(/[_-]/g, ' ').toLowerCase();
}

function parseListLike(value: unknown): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map(String).filter(Boolean);
  }
  const text = stringFromUnknown(value).trim();
  if (!text) {
    return [];
  }
  if (text.startsWith('[') && text.endsWith(']')) {
    try {
      const parsed: unknown = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed.map(String).filter(Boolean);
      }
    } catch {
      return [text];
    }
  }
  return [text];
}

function splitCamelCase(text: string): string {
  return text.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
}

function safeJsonLoads(text: string): JsonRecord {
  if (!text) {
    return {};
  }
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned
      .replace(/^```(?:json|JSON)?\s*/, '')
      .replace(/```$/, '')
      .trim();
  }
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first >= 0 && last > first) {
    cleaned = cleaned.slice(first, last + 1);
  }
  try {
    const parsed: unknown = JSON.parse(cleaned);
    return isRecord(parsed) ? parsed : { raw_text: text };
  } catch {
    return {
      raw_text: text,
      possible_conditions_or_findings: [],
      observed_injury_or_ailment_features: [],
      urgency_level: 'unknown',
      recommended_care_types: [],
      specialties_to_consider: [],
      red_flags: [],
      confidence_notes: 'Could not parse model output as JSON.',
    };
  }
}

function extractMessageContent(response: JsonRecord): string {
  const choices = Array.isArray(response.choices) ? response.choices : [];
  const firstChoice = choices.find(isRecord);
  const message = isRecord(firstChoice?.message) ? firstChoice.message : {};
  const content = message.content;
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (isRecord(item)) {
          return typeof item.text === 'string' ? item.text : '';
        }
        return stringFromUnknown(item);
      })
      .filter(Boolean)
      .join('\n');
  }
  return stringFromUnknown(content);
}

function parseAnalyzeRequest(input: unknown): AnalyzeRequest {
  if (!isRecord(input)) {
    throw new Error('Invalid analyze request.');
  }
  const settings = isRecord(input.settings) ? input.settings : {};
  return {
    imageName: getString(input, 'imageName') || 'uploaded image',
    imageDataUrl: getString(input, 'imageDataUrl'),
    mimeType: getString(input, 'mimeType') || 'image/jpeg',
    userLat: getNumber(input, 'userLat', DEFAULT_USER_LAT),
    userLon: getNumber(input, 'userLon', DEFAULT_USER_LON),
    userLocationText: getString(input, 'userLocationText') || DEFAULT_USER_LOCATION_LABEL,
    userAddressOrNotes: getString(input, 'userAddressOrNotes'),
    userSymptoms: getString(input, 'userSymptoms'),
    userName: getString(input, 'userName'),
    appointmentPreference: getString(input, 'appointmentPreference'),
    settings: {
      fmCandidateCount: clamp(Math.trunc(getNumber(settings, 'fmCandidateCount', 15)), 5, 40),
      maxDistanceKm: clamp(Math.trunc(getNumber(settings, 'maxDistanceKm', 50)), 1, 500),
      topN: clamp(Math.trunc(getNumber(settings, 'topN', 5)), 1, 20),
      newPatientsFilter: getString(settings, 'newPatientsFilter') || 'Any',
      insuranceFilter: getString(settings, 'insuranceFilter') || 'Any',
    },
  };
}

function getAiGatewayBaseUrl(): string {
  if (process.env.AI_GATEWAY_BASE_URL) {
    return process.env.AI_GATEWAY_BASE_URL;
  }
  if (process.env.DATABRICKS_HOST) {
    return `${process.env.DATABRICKS_HOST.replace(/\/$/, '')}/ai-gateway/mlflow/v1`;
  }
  return DEFAULT_AI_GATEWAY_BASE_URL;
}

function getVisionModelName(): string {
  return process.env.VISION_MODEL_NAME ?? 'databricks-gemma-3-12b';
}

function getMatchModelName(): string {
  return process.env.MATCH_MODEL_NAME ?? 'databricks-gemma-3-12b';
}

function getSqlWarehouseId(): string {
  return process.env.DATABRICKS_WAREHOUSE_ID ?? process.env.SQL_WAREHOUSE_ID ?? DEFAULT_SQL_WAREHOUSE_ID;
}

function getResultsTable(): string {
  return process.env.RESULTS_TABLE ?? DEFAULT_RESULTS_TABLE;
}

function getFacilityTable(): string {
  return process.env.FACILITY_TABLE ?? DEFAULT_FACILITY_TABLE;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const radiusKm = 6371.0088;
  const phi1 = (Math.PI * lat1) / 180;
  const phi2 = (Math.PI * lat2) / 180;
  const dPhi = (Math.PI * (lat2 - lat1)) / 180;
  const dLambda = (Math.PI * (lon2 - lon1)) / 180;
  const a = Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return 2 * radiusKm * Math.asin(Math.sqrt(a));
}

function parseSqlValue(value: string | null | undefined): unknown {
  if (value === null || value === undefined) {
    return null;
  }
  const numeric = Number(value);
  if (value.trim() !== '' && Number.isFinite(numeric) && String(numeric) === value) {
    return numeric;
  }
  return value;
}

function stringFromUnknown(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) {
    return fallback;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return value.toString();
  }
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

function getString(record: unknown, key: string): string {
  return isRecord(record) && typeof record[key] === 'string' ? record[key] : '';
}

function getNumber(record: unknown, key: string, fallback: number): number {
  if (!isRecord(record)) {
    return fallback;
  }
  const value = record[key];
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toNumber(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(numeric) ? numeric : null;
}

function stringsFromUnknown(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String).filter(Boolean);
  }
  if (typeof value === 'string' && value) {
    return [value];
  }
  return [];
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRecord(input: unknown): input is JsonRecord {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

function sendRouteError(res: Response, error: unknown): void {
  console.error('[care-finder] Request failed:', error);
  res.status(500).json({
    error: errorMessage(error),
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : stringFromUnknown(error);
}
