import type { ReactNode } from 'react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button } from '@databricks/appkit-ui/react';
import {
  AlertTriangle,
  CalendarCheck,
  Camera,
  ChevronDown,
  ChevronRight,
  FileText,
  Loader2,
  LocateFixed,
  MapPin,
  MessageCircle,
  Mic,
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

type CapturedImage = {
  name: string;
  mimeType: string;
  dataUrl: string;
};

type SearchMode = 'case' | 'image' | 'voice';

type TranslationResponse = {
  sourceLanguage: string;
  englishTranslation: string;
};

type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  abort: () => void;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

type SpeechRecognitionAlternativeLike = {
  transcript: string;
};

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike | undefined;
};

type SpeechRecognitionResultListLike = {
  length: number;
  [index: number]: SpeechRecognitionResultLike | undefined;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
};

type SpeechRecognitionErrorEventLike = {
  error?: string;
  message?: string;
};

const newPatientsOptions = ['Any', 'Only facilities taking new patients', 'Only facilities with unknown status'];

const insuranceOptions = ['Any', 'Insurance accepted/mentioned', 'Self-pay/cash accepted/mentioned', 'Unknown'];

const voiceLanguageOptions = [
  { value: 'en-IN', label: 'English (India)' },
  { value: 'gu-IN', label: 'Gujarati' },
  { value: 'hi-IN', label: 'Hindi' },
  { value: 'ta-IN', label: 'Tamil' },
  { value: 'te-IN', label: 'Telugu' },
  { value: 'mr-IN', label: 'Marathi' },
  { value: 'bn-IN', label: 'Bengali' },
  { value: 'kn-IN', label: 'Kannada' },
  { value: 'ml-IN', label: 'Malayalam' },
  { value: 'pa-IN', label: 'Punjabi' },
  { value: 'ur-IN', label: 'Urdu' },
  { value: 'es-ES', label: 'Spanish' },
  { value: 'fr-FR', label: 'French' },
  { value: 'ar-SA', label: 'Arabic' },
];

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
  const voiceLanguageListId = useId();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const speechRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
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
  const [searchMode, setSearchMode] = useState<SearchMode>('case');
  const [imageName, setImageName] = useState('');
  const [mimeType, setMimeType] = useState('');
  const [imageDataUrl, setImageDataUrl] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceEnglishTranscript, setVoiceEnglishTranscript] = useState('');
  const [voiceInterimTranscript, setVoiceInterimTranscript] = useState('');
  const [voiceLanguage, setVoiceLanguage] = useState('');
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceTranslationLoading, setVoiceTranslationLoading] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState('');
  const [voiceError, setVoiceError] = useState('');
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [error, setError] = useState('');
  const [analysisError, setAnalysisError] = useState('');
  const [analysisStatus, setAnalysisStatus] = useState('');

  useEffect(() => {
    void loadConfig();
  }, []);

  useEffect(() => {
    return () => {
      stopMediaStream(cameraStreamRef.current);
      cameraStreamRef.current = null;
      abortSpeechRecognition(speechRecognitionRef.current);
      speechRecognitionRef.current = null;
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    const stream = cameraStreamRef.current;
    if (!cameraActive || !video || !stream) {
      return;
    }
    video.srcObject = stream;
    void video.play().catch((requestError: unknown) => {
      setAnalysisError(errorMessage(requestError));
    });
  }, [cameraActive]);

  const urgency = stringFromUnknown(analysis?.parsed?.urgency_level, 'unclear').toLowerCase();
  const redFlags = useMemo(() => stringsFromUnknown(analysis?.parsed?.red_flags), [analysis]);
  const hasImageInput = imageDataUrl.length > 0;
  const supportsVoiceInput = getSpeechRecognitionConstructor() !== null;
  const searchSymptoms = buildSearchSymptoms(userSymptoms, voiceTranscript, voiceEnglishTranscript);
  const hasOriginalVoiceTranscript = voiceTranscript.trim().length > 0;
  const hasVoiceTranscript = hasOriginalVoiceTranscript || voiceEnglishTranscript.trim().length > 0;
  const hasTypedCaseContext = userSymptoms.trim().length > 0 || userAddressOrNotes.trim().length > 0;
  const hasImageSearchInput = hasImageInput || cameraActive;
  const hasCaseContextInput = searchSymptoms.trim().length > 0 || userAddressOrNotes.trim().length > 0;
  const canAnalyze =
    searchMode === 'case' ? hasTypedCaseContext : searchMode === 'image' ? hasImageSearchInput : hasVoiceTranscript;
  const selectedSearchTitle =
    searchMode === 'case' ? 'Case search' : searchMode === 'image' ? 'Image search' : 'Voice search';
  const selectedSearchHelp =
    searchMode === 'case'
      ? 'Enter symptoms or case context in text.'
      : searchMode === 'image'
        ? 'Upload an image or use the live camera.'
        : 'Record or paste speech, then translate if needed.';
  const missingSearchInputMessage =
    searchMode === 'case'
      ? 'Enter symptoms/case context or location notes before finding care.'
      : searchMode === 'image'
        ? 'Upload an image or start the camera before finding care.'
        : 'Record, paste, or enter a voice transcript before finding care.';
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
    setSearchMode('image');
    if (!file) {
      setImageName('');
      setMimeType('');
      setImageDataUrl('');
      return;
    }
    stopCamera();
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

  async function startCamera() {
    setError('');
    setAnalysisError('');
    setAnalysisStatus('');
    setSearchMode('image');
    setCameraLoading(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera capture is not available in this browser.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      stopMediaStream(cameraStreamRef.current);
      cameraStreamRef.current = stream;
      setCameraActive(true);
      setAnalysisStatus('Camera is live. Position the subject, then scan the current frame.');
    } catch (requestError) {
      cameraStreamRef.current = null;
      setCameraActive(false);
      setAnalysisError(errorMessage(requestError));
    } finally {
      setCameraLoading(false);
    }
  }

  function stopCamera() {
    stopMediaStream(cameraStreamRef.current);
    cameraStreamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setCameraLoading(false);
  }

  function captureCameraFrame(): CapturedImage {
    const video = videoRef.current;
    if (!cameraActive || !video || !cameraStreamRef.current) {
      throw new Error('Start the camera before scanning a frame.');
    }
    const sourceWidth = video.videoWidth;
    const sourceHeight = video.videoHeight;
    if (!sourceWidth || !sourceHeight) {
      throw new Error('Camera is still warming up. Try again in a moment.');
    }
    const maxDimension = 1280;
    const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not prepare the camera frame for scanning.');
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    if (dataUrlByteLength(dataUrl) > 8 * 1024 * 1024) {
      throw new Error('Camera frame is too large. Move closer or try again.');
    }
    return {
      name: `camera frame ${new Date().toLocaleTimeString()}`,
      mimeType: 'image/jpeg',
      dataUrl,
    };
  }

  function applyCapturedImage(capture: CapturedImage) {
    setImageName(capture.name);
    setMimeType(capture.mimeType);
    setImageDataUrl(capture.dataUrl);
  }

  function captureCameraImage() {
    setError('');
    setAnalysisError('');
    setAnalysisStatus('');
    setAnalysis(null);
    try {
      applyCapturedImage(captureCameraFrame());
    } catch (requestError) {
      setAnalysisError(errorMessage(requestError));
    }
  }

  function startVoiceTranscription() {
    setVoiceError('');
    setVoiceStatus('');
    setVoiceInterimTranscript('');
    setSearchMode('voice');
    const SpeechRecognition = getSpeechRecognitionConstructor();
    if (!SpeechRecognition) {
      setVoiceError('Voice transcription is not available in this browser. Try Chrome or Safari.');
      return;
    }
    stopVoiceTranscription();
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    const language = voiceLanguage.trim();
    if (language) {
      recognition.lang = language;
    }
    recognition.onresult = (event) => {
      const finalSegments: string[] = [];
      const interimSegments: string[] = [];
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result?.[0]?.transcript.trim();
        if (!result || !transcript) {
          continue;
        }
        if (result.isFinal) {
          finalSegments.push(transcript);
        } else {
          interimSegments.push(transcript);
        }
      }
      if (finalSegments.length > 0) {
        setVoiceTranscript((current) => appendTranscript(current, finalSegments.join(' ')));
        setVoiceEnglishTranscript('');
      }
      setVoiceInterimTranscript(interimSegments.join(' '));
    };
    recognition.onerror = (event) => {
      setVoiceError(speechRecognitionErrorMessage(event));
      setVoiceStatus('');
    };
    recognition.onend = () => {
      setVoiceListening(false);
      setVoiceInterimTranscript('');
      speechRecognitionRef.current = null;
      setVoiceStatus((current) => (current === 'Listening. Speak naturally in any browser-supported language.' ? '' : current));
    };
    speechRecognitionRef.current = recognition;
    try {
      recognition.start();
      setVoiceListening(true);
      setVoiceStatus('Listening. Speak naturally in any browser-supported language.');
    } catch (requestError) {
      speechRecognitionRef.current = null;
      setVoiceListening(false);
      setVoiceError(errorMessage(requestError));
    }
  }

  function stopVoiceTranscription() {
    const recognition = speechRecognitionRef.current;
    if (!recognition) {
      setVoiceListening(false);
      return;
    }
    recognition.stop();
  }

  function clearVoiceTranscript() {
    setVoiceTranscript('');
    setVoiceEnglishTranscript('');
    setVoiceInterimTranscript('');
    setVoiceError('');
    setVoiceStatus('');
  }

  function selectSearchMode(mode: SearchMode) {
    setSearchMode(mode);
    setAnalysisError('');
    setAnalysisStatus('');
    if (mode !== 'image') {
      stopCamera();
    }
    if (mode !== 'voice') {
      stopVoiceTranscription();
    }
  }

  async function translateVoiceToEnglish() {
    const transcript = voiceTranscript.trim();
    if (!transcript) {
      setVoiceError('Record or enter the original-language transcript before translating.');
      return;
    }
    setVoiceError('');
    setVoiceStatus('');
    setVoiceTranslationLoading(true);
    try {
      const result = await postJson<TranslationResponse>('/api/care-finder/translate', {
        text: transcript,
        sourceLanguage: voiceLanguage,
      });
      setVoiceEnglishTranscript(result.englishTranslation);
      setVoiceStatus(`English translation ready${result.sourceLanguage ? ` from ${result.sourceLanguage}` : ''}.`);
    } catch (requestError) {
      setVoiceError(errorMessage(requestError));
    } finally {
      setVoiceTranslationLoading(false);
    }
  }

  async function findCareFromSelectedMode() {
    setError('');
    setAnalysisError('');
    if (searchMode === 'image' && cameraActive) {
      try {
        const capture = captureCameraFrame();
        applyCapturedImage(capture);
        await analyzeCareNeed({ imageOverride: capture, modeOverride: 'image' });
      } catch (requestError) {
        setAnalysisError(errorMessage(requestError));
      }
      return;
    }
    await analyzeCareNeed({ modeOverride: searchMode });
  }

  async function analyzeCareNeed(options?: { imageOverride?: CapturedImage; modeOverride?: SearchMode }) {
    const activeMode = options?.modeOverride ?? searchMode;
    const activeImageDataUrl = activeMode === 'image' ? (options?.imageOverride?.dataUrl ?? imageDataUrl) : '';
    const activeImageName = options?.imageOverride?.name ?? imageName;
    const activeMimeType = options?.imageOverride?.mimeType ?? mimeType;
    const hasActiveImageInput = activeImageDataUrl.length > 0;
    const activeAddressOrNotes = activeMode === 'image' ? '' : userAddressOrNotes;
    const activeSearchSymptoms = buildSearchSymptoms(
      activeMode === 'case' ? userSymptoms : '',
      activeMode === 'voice' ? voiceTranscript : '',
      activeMode === 'voice' ? voiceEnglishTranscript : ''
    );
    const hasActiveModeInput =
      activeMode === 'image'
        ? hasActiveImageInput
        : activeMode === 'voice'
          ? activeSearchSymptoms.trim().length > 0
          : activeSearchSymptoms.trim().length > 0 || activeAddressOrNotes.trim().length > 0;
    if (!hasActiveModeInput) {
      setAnalysisError(missingSearchInputMessage);
      return;
    }
    let slowRequestTimer: number | undefined;
    setLoading(true);
    setError('');
    setAnalysisError('');
    setAnalysisStatus(activeMode === 'image' ? 'Starting image analysis...' : 'Starting case-context analysis...');
    setAnalysis(null);
    try {
      slowRequestTimer = window.setTimeout(() => {
        setAnalysisStatus(
          'Still working. AI Gateway analysis, facility lookup, and reranking can take up to a minute.'
        );
      }, 2500);
      const result = await postJson<AnalysisResult>('/api/care-finder/analyze', {
        imageName: activeImageName || (hasActiveImageInput ? 'uploaded image' : 'case context'),
        imageDataUrl: hasActiveImageInput ? activeImageDataUrl : '',
        mimeType: hasActiveImageInput ? activeMimeType : '',
        userLat,
        userLon,
        userLocationText: locationText,
        userAddressOrNotes: activeAddressOrNotes,
        userSymptoms: activeSearchSymptoms,
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
              Upload an image, scan a camera frame, or describe the case context with text or voice to collect
              non-diagnostic care-routing observations and rank nearby facilities.
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

        <aside className="space-y-5 xl:sticky xl:top-4 xl:self-start">
          <section className="rounded-md border border-border bg-card p-4">
            <div className="mb-4">
              <h3 className="font-semibold">Find care</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Choose one search type, fill in the panel below, then use the shared Find care button.
              </p>
            </div>

            <div className="grid gap-2" role="radiogroup" aria-label="Care search type">
              <SearchModeOption
                active={searchMode === 'case'}
                icon={<FileText className="h-4 w-4" />}
                title="Case search"
                description="Type symptoms or case notes."
                onClick={() => selectSearchMode('case')}
              />
              <SearchModeOption
                active={searchMode === 'image'}
                icon={<Upload className="h-4 w-4" />}
                title="Image search"
                description="Upload an image or use live camera."
                onClick={() => selectSearchMode('image')}
              />
              <SearchModeOption
                active={searchMode === 'voice'}
                icon={<Mic className="h-4 w-4" />}
                title="Voice search"
                description="Speak in any supported language."
                onClick={() => selectSearchMode('voice')}
              />
            </div>

            <div className="mt-4 rounded-md border border-border bg-muted/30 p-3">
              <div className="mb-3">
                <h4 className="font-medium">{selectedSearchTitle}</h4>
                <p className="text-xs text-muted-foreground">{selectedSearchHelp}</p>
              </div>

              {searchMode === 'case' ? (
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
                      className="min-h-28 rounded-md border border-input bg-background px-3 py-2"
                      value={userSymptoms}
                      onChange={(event) => setUserSymptoms(event.target.value)}
                      placeholder="child has swelling after fall; rash on arm; eye redness; wound on leg"
                    />
                  </label>
                </div>
              ) : null}

              {searchMode === 'image' ? (
                <div className="grid gap-3">
                  <input
                    className="block w-full rounded-md border border-input bg-background p-2 text-sm"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => void handleImageFile(event.target.files?.[0] ?? null)}
                  />
                  <Button
                    type="button"
                    variant={cameraActive ? 'secondary' : 'outline'}
                    onClick={() => {
                      if (cameraActive) {
                        stopCamera();
                        return;
                      }
                      void startCamera();
                    }}
                    disabled={cameraLoading}
                  >
                    {cameraLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                    {cameraActive ? 'Stop camera' : 'Start camera'}
                  </Button>
                  {cameraActive ? (
                    <div className="space-y-3">
                      <video
                        ref={videoRef}
                        className="aspect-video w-full rounded-md border bg-background object-cover"
                        muted
                        playsInline
                        autoPlay
                        aria-label="Live camera preview for care finder image search"
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => captureCameraImage()}
                          disabled={loading || cameraLoading}
                        >
                          Capture frame
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Find care will scan the live camera frame if the camera is running.
                      </p>
                    </div>
                  ) : null}
                  {imageDataUrl ? (
                    <div className="grid gap-3">
                      <img
                        src={imageDataUrl}
                        alt={imageName}
                        className="aspect-square w-full rounded-md border object-cover"
                      />
                      <div className="text-sm">
                        <div className="font-medium">{imageName}</div>
                        <div className="text-muted-foreground">{mimeType}</div>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {searchMode === 'voice' ? (
                <div className="grid gap-3">
                  <label className="grid gap-1 text-sm">
                    Voice language
                    <input
                      className="h-10 rounded-md border border-input bg-background px-3"
                      list={voiceLanguageListId}
                      value={voiceLanguage}
                      onChange={(event) => setVoiceLanguage(event.target.value)}
                      placeholder="Browser default / auto; e.g. gu-IN, hi-IN, es-ES"
                    />
                    <datalist id={voiceLanguageListId}>
                      {voiceLanguageOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </datalist>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant={voiceListening ? 'secondary' : 'outline'}
                      onClick={() => {
                        if (voiceListening) {
                          stopVoiceTranscription();
                          return;
                        }
                        startVoiceTranscription();
                      }}
                      disabled={!supportsVoiceInput}
                    >
                      <Mic className="h-4 w-4" />
                      {voiceListening ? 'Stop voice' : 'Start voice'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => clearVoiceTranscript()}
                      disabled={!hasVoiceTranscript && !voiceInterimTranscript}
                    >
                      Clear
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void translateVoiceToEnglish()}
                      disabled={voiceTranslationLoading || !hasOriginalVoiceTranscript}
                    >
                      {voiceTranslationLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {voiceTranslationLoading ? 'Translating...' : 'Translate'}
                    </Button>
                  </div>
                  <label className="grid gap-1 text-sm">
                    Voice transcript (original language)
                    <textarea
                      className="min-h-28 rounded-md border border-input bg-background px-3 py-2"
                      value={voiceTranscript}
                      onChange={(event) => setVoiceTranscript(event.target.value)}
                      placeholder="Start voice input, then edit the original-language transcript here."
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    English translation
                    <textarea
                      className="min-h-28 rounded-md border border-input bg-background px-3 py-2"
                      value={voiceEnglishTranscript}
                      onChange={(event) => setVoiceEnglishTranscript(event.target.value)}
                      placeholder="Translate to English, or type/edit the English version here."
                    />
                  </label>
                  {voiceInterimTranscript ? (
                    <div className="rounded-md border border-border bg-background p-3 text-sm">
                      <div className="text-xs font-medium uppercase text-muted-foreground">Listening preview</div>
                      <div>{voiceInterimTranscript}</div>
                    </div>
                  ) : null}
                  {!supportsVoiceInput ? (
                    <p className="text-xs text-muted-foreground">
                      Voice transcription requires browser speech recognition support. You can still type or paste a
                      transcript above.
                    </p>
                  ) : null}
                  {voiceStatus ? <StatusMessage tone="info" message={voiceStatus} /> : null}
                  {voiceError ? <StatusMessage tone="error" message={voiceError} /> : null}
                </div>
              ) : null}
            </div>

            <div className="mt-4 grid gap-3 border-t border-border pt-4">
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
              <Button type="button" onClick={() => void findCareFromSelectedMode()} disabled={loading || !canAnalyze}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {loading ? 'Finding care...' : 'Find care'}
              </Button>
              {!canAnalyze ? <p className="text-xs text-muted-foreground">{missingSearchInputMessage}</p> : null}
              {analysisStatus ? <StatusMessage tone="info" message={analysisStatus} /> : null}
              {analysisError ? <StatusMessage tone="error" message={analysisError} /> : null}
            </div>
          </section>

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

function SearchModeOption({
  active,
  icon,
  title,
  description,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      className={`rounded-md border p-3 text-left transition-colors ${
        active ? 'border-primary bg-primary/10' : 'border-border bg-background hover:bg-muted'
      }`}
      onClick={onClick}
    >
      <span className="flex items-start gap-3">
        <span className="mt-0.5">{icon}</span>
        <span>
          <span className="block text-sm font-medium">{title}</span>
          <span className="block text-xs text-muted-foreground">{description}</span>
        </span>
      </span>
    </button>
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

function stopMediaStream(stream: MediaStream | null) {
  if (!stream) {
    return;
  }
  stream.getTracks().forEach((track) => track.stop());
}

function dataUrlByteLength(dataUrl: string): number {
  const commaIndex = dataUrl.indexOf(',');
  const base64 = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const speechWindow = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

function abortSpeechRecognition(recognition: BrowserSpeechRecognition | null) {
  if (!recognition) {
    return;
  }
  recognition.abort();
}

function appendTranscript(current: string, next: string): string {
  const normalizedNext = next.trim();
  if (!normalizedNext) {
    return current;
  }
  const normalizedCurrent = current.trim();
  return normalizedCurrent ? `${normalizedCurrent} ${normalizedNext}` : normalizedNext;
}

function buildSearchSymptoms(typedContext: string, originalVoiceContext: string, englishVoiceContext: string): string {
  const parts = [
    typedContext.trim(),
    originalVoiceContext.trim() ? `Voice transcript (original language): ${originalVoiceContext.trim()}` : '',
    englishVoiceContext.trim() ? `Voice transcript (English translation): ${englishVoiceContext.trim()}` : '',
  ].filter(Boolean);
  return parts.join('\n\n');
}

function speechRecognitionErrorMessage(event: SpeechRecognitionErrorEventLike): string {
  if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
    return 'Microphone permission was denied. Allow microphone access and try again.';
  }
  if (event.error === 'no-speech') {
    return 'No speech was detected. Try again and speak clearly into the microphone.';
  }
  if (event.message) {
    return event.message;
  }
  return event.error ? `Voice transcription failed: ${event.error}` : 'Voice transcription failed.';
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
