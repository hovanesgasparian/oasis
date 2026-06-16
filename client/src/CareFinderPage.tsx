import type { ReactNode } from 'react';
import { useEffect, useId, useMemo, useState } from 'react';
import { Button } from '@databricks/appkit-ui/react';
import {
  AlertTriangle,
  CalendarCheck,
  ChevronDown,
  ChevronRight,
  Loader2,
  LocateFixed,
  MapPin,
  MessageCircle,
  Upload,
} from 'lucide-react';

type JsonRecord = Record<string, unknown>;

type CareFinderConfig = {
  visionModelName: string;
  matchModelName: string;
  facilityTable: string;
  resultsTable: string;
  defaultLocation: {
    lat: number;
    lon: number;
    label: string;
  };
};

type FacilityResult = JsonRecord & {
  name?: string;
  distance_km?: number;
  relevance_score?: number;
  fm_match_score?: number;
  fm_match_confidence?: string;
  fm_matched_illness_need?: string;
  fm_match_reason?: string;
  new_patient_status?: string;
  insurance_status?: string;
  facilityTypeId?: string;
  address?: string;
  matched_care_domains?: string;
  matched_care_terms?: string;
  specialties?: string;
  procedure?: string;
  equipment?: string;
  capability?: string;
  description?: string;
  source_urls_display?: string;
  whatsapp_phone_display?: string;
  whatsapp_chat_url?: string;
  whatsapp_appointment_url?: string;
};

type AnalysisResult = {
  imageId: string;
  inputMode?: 'image' | 'case-context' | 'image-and-context';
  parsed: JsonRecord;
  caption: string;
  urgency: unknown;
  taxonomyCandidates: FacilityResult[];
  recommended: FacilityResult[];
  verification: JsonRecord;
  wroteResultTo: string;
  writeWarning?: string;
};

const newPatientsOptions = ['Any', 'Only facilities taking new patients', 'Only facilities with unknown status'];

const insuranceOptions = ['Any', 'Insurance accepted/mentioned', 'Self-pay/cash accepted/mentioned', 'Unknown'];

const recommendationColumns = [
  'name',
  'distance_km',
  'relevance_score',
  'fm_match_score',
  'fm_match_confidence',
  'fm_matched_illness_need',
  'new_patient_status',
  'insurance_status',
  'facilityTypeId',
  'address',
  'matched_care_domains',
  'matched_care_terms',
];

export function CareFinderPage() {
  const [config, setConfig] = useState<CareFinderConfig | null>(null);
  const [locationText, setLocationText] = useState('Ahmedabad, Gujarat');
  const [userLat, setUserLat] = useState(23.0225);
  const [userLon, setUserLon] = useState(72.5714);
  const [detectedLocationLabel, setDetectedLocationLabel] = useState('');
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  const [userAddressOrNotes, setUserAddressOrNotes] = useState('');
  const [userSymptoms, setUserSymptoms] = useState('');
  const [userName, setUserName] = useState('');
  const [appointmentPreference, setAppointmentPreference] = useState('');
  const [fmCandidateCount, setFmCandidateCount] = useState(15);
  const [maxDistanceKm, setMaxDistanceKm] = useState(50);
  const [topN, setTopN] = useState(5);
  const [newPatientsFilter, setNewPatientsFilter] = useState('Any');
  const [insuranceFilter, setInsuranceFilter] = useState('Any');
  const [imageName, setImageName] = useState('');
  const [mimeType, setMimeType] = useState('');
  const [imageDataUrl, setImageDataUrl] = useState('');
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [error, setError] = useState('');
  const [analysisError, setAnalysisError] = useState('');
  const [analysisStatus, setAnalysisStatus] = useState('');

  useEffect(() => {
    void loadConfig();
  }, []);

  const urgency = stringFromUnknown(analysis?.parsed?.urgency_level, 'unclear').toLowerCase();
  const redFlags = useMemo(() => stringsFromUnknown(analysis?.parsed?.red_flags), [analysis]);
  const hasImageInput = imageDataUrl.length > 0;
  const hasCaseContextInput = userSymptoms.trim().length > 0 || userAddressOrNotes.trim().length > 0;
  const canAnalyze = hasImageInput || hasCaseContextInput;
  const analyzeButtonLabel = hasImageInput
    ? hasCaseContextInput
      ? 'Analyze image and case context to find nearby care'
      : 'Analyze image and find nearby care'
    : 'Find nearby care from case context';
  const analysisTitle =
    analysis?.inputMode === 'case-context'
      ? 'Case context analysis'
      : analysis?.inputMode === 'image-and-context'
        ? 'Image and case context analysis'
        : 'Image analysis';

  async function loadConfig() {
    try {
      const data = await getJson<CareFinderConfig>('/api/care-finder/config');
      setConfig(data);
      setLocationText(data.defaultLocation.label);
      setUserLat(data.defaultLocation.lat);
      setUserLon(data.defaultLocation.lon);
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  }

  async function detectBrowserLocation() {
    setError('');
    setLocationLoading(true);
    try {
      if (!navigator.geolocation) {
        throw new Error('Browser geolocation is not available.');
      }
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
        });
      });
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;
      setUserLat(round(lat, 6));
      setUserLon(round(lon, 6));
      setLocationAccuracy(position.coords.accuracy);

      const meta = await postJson<JsonRecord>('/api/care-finder/reverse-geocode', { lat, lon });
      const label = typeof meta.label === 'string' && meta.label ? meta.label : 'Detected browser location';
      setLocationText(label);
      setDetectedLocationLabel(label);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLocationLoading(false);
    }
  }

  async function geocodeEnteredLocation() {
    setError('');
    setLocationLoading(true);
    try {
      const geocoded = await postJson<JsonRecord>('/api/care-finder/geocode', { placeText: locationText });
      if (typeof geocoded.error === 'string' && geocoded.error) {
        throw new Error(geocoded.error);
      }
      const lat = numberFromUnknown(geocoded.latitude, userLat);
      const lon = numberFromUnknown(geocoded.longitude, userLon);
      setUserLat(round(lat, 6));
      setUserLon(round(lon, 6));
      const label = typeof geocoded.label === 'string' ? geocoded.label : locationText;
      setLocationText(label);
      setDetectedLocationLabel(label);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLocationLoading(false);
    }
  }

  async function handleImageFile(file: File | null) {
    setError('');
    setAnalysisError('');
    setAnalysisStatus('');
    setAnalysis(null);
    if (!file) {
      setImageName('');
      setMimeType('');
      setImageDataUrl('');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setAnalysisError('Choose an image under 8 MB.');
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setImageName(file.name);
      setMimeType(file.type || 'image/jpeg');
      setImageDataUrl(dataUrl);
    } catch (requestError) {
      setAnalysisError(errorMessage(requestError));
    }
  }

  async function analyzeCareNeed() {
    if (!canAnalyze) {
      setAnalysisError('Upload an image or enter symptoms/case context before searching.');
      return;
    }
    let slowRequestTimer: number | undefined;
    setLoading(true);
    setError('');
    setAnalysisError('');
    setAnalysisStatus(hasImageInput ? 'Starting image and case analysis...' : 'Starting case-context analysis...');
    setAnalysis(null);
    try {
      slowRequestTimer = window.setTimeout(() => {
        setAnalysisStatus(
          'Still working. AI Gateway analysis, facility lookup, and reranking can take up to a minute.'
        );
      }, 2500);
      const result = await postJson<AnalysisResult>('/api/care-finder/analyze', {
        imageName: imageName || (hasImageInput ? 'uploaded image' : 'case context'),
        imageDataUrl: hasImageInput ? imageDataUrl : '',
        mimeType: hasImageInput ? mimeType : '',
        userLat,
        userLon,
        userLocationText: locationText,
        userAddressOrNotes,
        userSymptoms,
        userName,
        appointmentPreference,
        settings: {
          fmCandidateCount,
          maxDistanceKm,
          topN,
          newPatientsFilter,
          insuranceFilter,
        },
      });
      setAnalysis(result);
      setAnalysisStatus('Analysis complete.');
    } catch (requestError) {
      setAnalysisStatus('');
      setAnalysisError(errorMessage(requestError));
    } finally {
      if (slowRequestTimer) {
        window.clearTimeout(slowRequestTimer);
      }
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <section className="rounded-md border border-border bg-card p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-xl font-semibold">Care Finder Vision</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Upload an image or describe the case context to collect non-diagnostic care-routing observations and rank
              nearby facilities.
            </p>
          </div>
          <div className="grid gap-1 text-xs text-muted-foreground md:text-right">
            <span>Vision: {config?.visionModelName ?? 'loading'}</span>
            <span>Matcher: {config?.matchModelName ?? 'loading'}</span>
          </div>
        </div>
        <div className="mt-4 flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <p>
            This tool does not diagnose medical conditions. For severe pain, breathing trouble, heavy bleeding, loss of
            consciousness, stroke symptoms, major trauma, severe allergic reaction, or other emergencies, seek emergency
            medical care immediately.
          </p>
        </div>
      </section>

      {error ? <StatusMessage tone="error" message={error} /> : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <section className="rounded-md border border-border bg-card p-4">
            <div className="mb-3 flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              <h3 className="font-semibold">User location</h3>
            </div>
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
              <label className="grid gap-1 text-sm">
                City / town / state
                <input
                  className="h-10 rounded-md border border-input bg-background px-3"
                  value={locationText}
                  onChange={(event) => setLocationText(event.target.value)}
                  placeholder="Paldi, Ahmedabad, Gujarat"
                />
              </label>
              <div className="flex items-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void geocodeEnteredLocation()}
                  disabled={locationLoading}
                >
                  Use place
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void detectBrowserLocation()}
                  disabled={locationLoading}
                >
                  {locationLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
                  Detect
                </Button>
              </div>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <NumberField label="User latitude" value={userLat} onChange={setUserLat} step="0.000001" />
              <NumberField label="User longitude" value={userLon} onChange={setUserLon} step="0.000001" />
            </div>
            {detectedLocationLabel ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Current resolved location: {detectedLocationLabel}
                {locationAccuracy ? `; accuracy about ${Math.round(locationAccuracy)} m` : ''}
              </p>
            ) : null}
          </section>

          <section className="rounded-md border border-border bg-card p-4">
            <h3 className="mb-3 font-semibold">Case context</h3>
            <div className="grid gap-3">
              <label className="grid gap-1 text-sm">
                Address / landmark / location notes
                <input
                  className="h-10 rounded-md border border-input bg-background px-3"
                  value={userAddressOrNotes}
                  onChange={(event) => setUserAddressOrNotes(event.target.value)}
                  placeholder="near VS Hospital, Paldi"
                />
              </label>
              <label className="grid gap-1 text-sm">
                Symptoms or case context
                <textarea
                  className="min-h-24 rounded-md border border-input bg-background px-3 py-2"
                  value={userSymptoms}
                  onChange={(event) => setUserSymptoms(event.target.value)}
                  placeholder="child has swelling after fall; rash on arm; eye redness; wound on leg"
                />
                <span className="text-xs text-muted-foreground">Required when no image is uploaded.</span>
              </label>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-1 text-sm">
                  Optional patient/name for WhatsApp
                  <input
                    className="h-10 rounded-md border border-input bg-background px-3"
                    value={userName}
                    onChange={(event) => setUserName(event.target.value)}
                    placeholder="Rahul Shah"
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  Optional preferred appointment time
                  <input
                    className="h-10 rounded-md border border-input bg-background px-3"
                    value={appointmentPreference}
                    onChange={(event) => setAppointmentPreference(event.target.value)}
                    placeholder="today after 5 PM"
                  />
                </label>
              </div>
            </div>
          </section>

          <section className="rounded-md border border-border bg-card p-4">
            <div className="mb-3 flex items-center gap-2">
              <Upload className="h-4 w-4" />
              <h3 className="font-semibold">Image or case-context search</h3>
            </div>
            <p className="mb-3 text-sm text-muted-foreground">
              Upload an image, or leave it blank and use the case context above.
            </p>
            <input
              className="block w-full rounded-md border border-input bg-background p-2 text-sm"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => void handleImageFile(event.target.files?.[0] ?? null)}
            />
            {imageDataUrl ? (
              <div className="mt-4 grid gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
                <img
                  src={imageDataUrl}
                  alt={imageName}
                  className="aspect-square w-full rounded-md border object-cover"
                />
                <div className="space-y-3">
                  <div className="text-sm">
                    <div className="font-medium">{imageName}</div>
                    <div className="text-muted-foreground">{mimeType}</div>
                  </div>
                </div>
              </div>
            ) : null}
            <div className="mt-4 space-y-3">
              <Button type="button" onClick={() => void analyzeCareNeed()} disabled={loading || !canAnalyze}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {loading ? 'Finding care...' : analyzeButtonLabel}
              </Button>
              {!canAnalyze ? (
                <p className="text-xs text-muted-foreground">Upload an image or enter symptoms/case context above.</p>
              ) : null}
              {analysisStatus ? <StatusMessage tone="info" message={analysisStatus} /> : null}
              {analysisError ? <StatusMessage tone="error" message={analysisError} /> : null}
            </div>
          </section>

          {analysis ? (
            <section className="space-y-5">
              <StatusMessage
                tone={
                  urgency === 'emergency' || redFlags.length > 0 ? 'error' : urgency === 'urgent' ? 'warning' : 'info'
                }
                message={
                  urgency === 'emergency' || redFlags.length > 0
                    ? 'The model identified possible red flags or emergency-level concern. Use emergency services or the nearest emergency-capable hospital if the user may be in immediate danger.'
                    : urgency === 'urgent'
                      ? 'The model suggests urgent evaluation may be appropriate.'
                      : 'The model did not identify an obvious emergency from the provided information.'
                }
              />

              <ResultSection title={analysisTitle} collapsible>
                {analysis.writeWarning ? <StatusMessage tone="warning" message={analysis.writeWarning} /> : null}
                <JsonBlock value={analysis.parsed} />
              </ResultSection>

              <ResultSection title="Verification: foundation-model rerank vs taxonomy-only baseline" collapsible>
                <JsonBlock value={analysis.verification} />
                <DataTable
                  rows={analysis.taxonomyCandidates}
                  columns={['name', 'distance_km', 'relevance_score', 'matched_care_domains', 'matched_care_terms']}
                />
              </ResultSection>

              <ResultSection title="Recommended nearby facilities" collapsible>
                {analysis.recommended.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No facilities found within the selected radius.</p>
                ) : (
                  <>
                    <DataTable rows={analysis.recommended} columns={recommendationColumns} />
                    <div className="space-y-3">
                      {analysis.recommended.map((facility) => (
                        <FacilityCard
                          key={`${facility.name ?? 'facility'}-${facility.distance_km ?? ''}`}
                          facility={facility}
                        />
                      ))}
                    </div>
                  </>
                )}
              </ResultSection>
            </section>
          ) : null}
        </div>

        <aside className="space-y-5">
          <section className="rounded-md border border-border bg-card p-4">
            <h3 className="mb-3 font-semibold">Recommendation settings</h3>
            <div className="grid gap-3">
              <NumberField
                label="Foundation-model rerank candidate pool"
                value={fmCandidateCount}
                onChange={setFmCandidateCount}
                min={5}
                max={40}
                step="5"
              />
              <NumberField
                label="Max search radius, km"
                value={maxDistanceKm}
                onChange={setMaxDistanceKm}
                min={1}
                max={500}
                step="5"
              />
              <NumberField
                label="Number of facilities to show"
                value={topN}
                onChange={setTopN}
                min={1}
                max={20}
                step="1"
              />
              <SelectField
                label="New patients"
                value={newPatientsFilter}
                options={newPatientsOptions}
                onChange={setNewPatientsFilter}
              />
              <SelectField
                label="Insurance"
                value={insuranceFilter}
                options={insuranceOptions}
                onChange={setInsuranceFilter}
              />
            </div>
          </section>

        </aside>
      </div>
    </div>
  );
}

function FacilityCard({ facility }: { facility: FacilityResult }) {
  return (
    <article className="rounded-md border border-border bg-card p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h4 className="font-semibold">{facility.name ?? 'Facility'}</h4>
          <p className="mt-1 text-sm text-muted-foreground">{facility.address ?? ''}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <Badge>{facility.distance_km ?? '?'} km</Badge>
            <Badge>FM {facility.fm_match_score ?? 0}</Badge>
            <Badge>{facility.fm_match_confidence ?? 'confidence unknown'}</Badge>
            <Badge>{facility.new_patient_status ?? 'new patient unknown'}</Badge>
            <Badge>{facility.insurance_status ?? 'insurance unknown'}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
            href={facility.whatsapp_chat_url ?? '#'}
            target="_blank"
            rel="noreferrer"
          >
            <MessageCircle className="h-4 w-4" />
            Chat
          </a>
          <a
            className="inline-flex h-9 items-center gap-2 rounded-md border border-input px-3 text-sm font-medium"
            href={facility.whatsapp_appointment_url ?? '#'}
            target="_blank"
            rel="noreferrer"
          >
            <CalendarCheck className="h-4 w-4" />
            Appointment
          </a>
        </div>
      </div>
      <div className="mt-4 grid gap-2 text-sm md:grid-cols-2">
        <InfoRow label="Phone used for WhatsApp" value={facility.whatsapp_phone_display} />
        <InfoRow label="Facility type" value={facility.facilityTypeId} />
        <InfoRow label="Matched illness need" value={facility.fm_matched_illness_need} />
        <InfoRow label="Matched care domains" value={facility.matched_care_domains} />
        <InfoRow label="Matched care terms" value={facility.matched_care_terms} />
        <InfoRow label="Sources" value={facility.source_urls_display} />
      </div>
      <p className="mt-3 text-sm">{facility.fm_match_reason ?? ''}</p>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-medium">Facility details</summary>
        <div className="mt-2 grid gap-2">
          <InfoRow label="Description" value={facility.description} />
          <InfoRow label="Specialties" value={facility.specialties} />
          <InfoRow label="Procedures" value={facility.procedure} />
          <InfoRow label="Equipment" value={facility.equipment} />
          <InfoRow label="Capabilities" value={facility.capability} />
        </div>
      </details>
    </article>
  );
}

function DataTable({ rows, columns }: { rows: FacilityResult[]; columns: string[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No rows.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="min-w-full border-collapse text-left text-xs">
        <thead className="bg-muted">
          <tr>
            {columns.map((column) => (
              <th key={column} className="whitespace-nowrap px-3 py-2 font-medium">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.name ?? 'row'}-${row.distance_km ?? ''}-${row.fm_match_score ?? ''}`} className="border-t">
              {columns.map((column) => (
                <td key={column} className="max-w-[360px] px-3 py-2 align-top">
                  {formatCell(row[column])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: string;
}) {
  return (
    <label className="grid gap-1 text-sm">
      {label}
      <input
        className="h-10 rounded-md border border-input bg-background px-3"
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1 text-sm">
      {label}
      <select
        className="h-10 rounded-md border border-input bg-background px-3"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function StatusMessage({ tone, message }: { tone: 'error' | 'warning' | 'info'; message: string }) {
  const className =
    tone === 'error'
      ? 'border-destructive/30 bg-destructive/10 text-foreground'
      : tone === 'warning'
        ? 'border-warning/40 bg-warning/10 text-foreground'
        : 'border-border bg-muted text-foreground';
  return <div className={`rounded-md border p-3 text-sm ${className}`}>{message}</div>;
}

function ResultSection({
  title,
  children,
  collapsible = false,
}: {
  title: string;
  children: ReactNode;
  collapsible?: boolean;
}) {
  const contentId = useId();
  const [isExpanded, setIsExpanded] = useState(true);
  const Icon = isExpanded ? ChevronDown : ChevronRight;

  return (
    <section className="rounded-md border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="font-semibold">{title}</h3>
        {collapsible ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={isExpanded}
            aria-controls={contentId}
            onClick={() => setIsExpanded((current) => !current)}
          >
            <Icon className="h-4 w-4" />
            {isExpanded ? 'Collapse' : 'Expand'}
          </Button>
        ) : null}
      </div>
      <div id={contentId} hidden={collapsible && !isExpanded}>
        {children}
      </div>
    </section>
  );
}

function JsonBlock({ value }: { value: unknown }) {
  return <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(value, null, 2)}</pre>;
}

function InfoRow({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase text-muted-foreground">{label}</div>
      <div className="break-words">{formatCell(value)}</div>
    </div>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return <span className="rounded-md border border-border bg-muted px-2 py-1">{children}</span>;
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  return parseJsonResponse<T>(response);
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parseJsonResponse<T>(response);
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  const payload: unknown = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const message = isRecord(payload) && typeof payload.error === 'string' ? payload.error : response.statusText;
    throw new Error(message);
  }
  return payload as T;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Could not read image file as a data URL.'));
    };
    reader.onerror = () => reject(new Error('Could not read image file.'));
    reader.readAsDataURL(file);
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

function numberFromUnknown(value: unknown, fallback: number): number {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(numeric) ? numeric : fallback;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function formatCell(value: unknown): string {
  return stringFromUnknown(value);
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

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
