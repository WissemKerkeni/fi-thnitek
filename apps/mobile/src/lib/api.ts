import {
  type DeviceInfo,
  type DocumentType,
  DocumentView,
  type DriverProfileInput,
  HealthResponse,
  type MapDriversRequest,
  MapDriversResponse,
  Me,
  MyVerification,
  type NearestPlaceRequest,
  NearestPlaceResponse,
  type PlaceSearchRequest,
  PlaceSearchResponse,
  type PingsRequest,
  PingsResponse,
  type ResumeSharingRequest,
  SharingStatus,
  type StartSharingRequest,
  type UpdateSharingRequest,
  PROBLEM_JSON,
  ProblemDetails,
  type RegisterDeviceRequest,
  SignInResponse,
  TokenPair,
  type UpdateMeRequest,
  type VehicleInput,
} from '@fi-thnitek/contracts';
import type { ZodType } from 'zod';

/** A non-2xx response. `problem` is set when the server sent RFC 9457 problem details. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem?: ProblemDetails,
  ) {
    super(problem ? `${problem.code} (${status})` : `HTTP ${status}`);
    this.name = 'ApiError';
  }
}

type Fetch = typeof fetch;

/** Where tokens live. The mobile implementation keeps the refresh token in secure storage. */
export interface TokenStore {
  getAccessToken(): string | null;
  getRefreshToken(): Promise<string | null>;
  save(pair: TokenPair): Promise<void>;
  clear(): Promise<void>;
}

export interface ApiClientOptions {
  fetchImpl?: Fetch;
  tokens?: TokenStore;
  /** Called when the session can no longer be refreshed (expired, revoked, reused, account blocked). */
  onSessionEnded?: (reason: ApiError) => void;
  /**
   * Turns a local file URI into an uploadable Blob. Expo's fetch only accepts real Blob/File parts in
   * FormData (not React Native's `{ uri, name, type }`), so the app passes expo-file-system's `File`.
   */
  fileFromUri?: (uri: string) => Blob;
}

export interface ApiClient {
  getHealth(): Promise<HealthResponse>;
  signInWithGoogle(idToken: string, device: DeviceInfo): Promise<SignInResponse>;
  getMe(): Promise<Me>;
  updateMe(patch: UpdateMeRequest): Promise<Me>;
  registerDevice(device: RegisterDeviceRequest): Promise<void>;
  logout(): Promise<void>;
  deleteMe(): Promise<void>;
  // Driver verification (D1/D2)
  getMyVerification(): Promise<MyVerification>;
  saveDriverProfile(input: DriverProfileInput): Promise<MyVerification>;
  saveVehicle(input: VehicleInput): Promise<MyVerification>;
  uploadDocument(upload: DocumentUpload): Promise<DocumentView>;
  deleteDocument(id: string): Promise<void>;
  submitVerification(): Promise<MyVerification>;
  // Places (R-011): coordinates go in the body, never in the URL
  searchPlaces(req: PlaceSearchRequest): Promise<PlaceSearchResponse>;
  nearestPlace(req: NearestPlaceRequest): Promise<NearestPlaceResponse>;
  // Driver sharing (D3/D4, R-050…R-058): every action answers with the whole status
  getSharing(): Promise<SharingStatus>;
  startSharing(req: StartSharingRequest): Promise<SharingStatus>;
  updateSharing(req: UpdateSharingRequest): Promise<SharingStatus>;
  setFull(isFull: boolean): Promise<SharingStatus>;
  startBreak(minutes: number): Promise<SharingStatus>;
  resumeSharing(req: ResumeSharingRequest): Promise<SharingStatus>;
  confirmStillWorking(): Promise<SharingStatus>;
  stopSharing(): Promise<SharingStatus>;
  sendPings(req: PingsRequest): Promise<PingsResponse>;
  // Live map (R-020…R-022): the visible area goes in the body
  mapDrivers(req: MapDriversRequest): Promise<MapDriversResponse>;
}

/** A photo already resized/re-encoded on the device (local file URI). */
export interface DocumentUpload {
  type: DocumentType;
  uri: string;
  expiresOn?: string;
}

const NO_BODY = { parse: () => undefined } as unknown as ZodType<void>;

export function createApiClient(baseUrl: string, options: ApiClientOptions = {}): ApiClient {
  const root = baseUrl.replace(/\/+$/, '');
  const fetchImpl = options.fetchImpl ?? fetch;
  const tokens = options.tokens;
  let refreshing: Promise<boolean> | null = null;

  async function send(method: string, path: string, body: unknown, accessToken: string | null) {
    const headers: Record<string, string> = { Accept: 'application/json' };
    const multipart = typeof FormData !== 'undefined' && body instanceof FormData;
    // Multipart bodies set their own Content-Type (with the boundary).
    if (body !== undefined && !multipart) headers['Content-Type'] = 'application/json';
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    return fetchImpl(`${root}/v1${path}`, {
      method,
      headers,
      ...(body !== undefined && { body: multipart ? body : JSON.stringify(body) }),
    });
  }

  async function toError(res: Response): Promise<ApiError> {
    const body: unknown = await res.json().catch(() => undefined);
    const isProblem = res.headers.get('content-type')?.includes(PROBLEM_JSON);
    const problem = isProblem ? ProblemDetails.safeParse(body) : undefined;
    return new ApiError(res.status, problem?.success ? problem.data : undefined);
  }

  async function parse<T>(res: Response, schema: ZodType<T>): Promise<T> {
    if (res.status === 204) return schema.parse(undefined);
    return schema.parse(await res.json());
  }

  /** Single-flight: concurrent 401s share one refresh, since replaying a refresh token revokes the session. */
  function refreshOnce(): Promise<boolean> {
    refreshing ??= (async () => {
      const refreshToken = await tokens?.getRefreshToken();
      if (!tokens || !refreshToken) return false;
      const res = await send('POST', '/auth/refresh', { refreshToken }, null);
      if (!res.ok) {
        const error = await toError(res);
        await tokens.clear();
        options.onSessionEnded?.(error);
        return false;
      }
      await tokens.save(TokenPair.parse(await res.json()));
      return true;
    })().finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  async function authed<T>(method: string, path: string, schema: ZodType<T>, body?: unknown): Promise<T> {
    if (!tokens?.getAccessToken()) await refreshOnce();
    const used = tokens?.getAccessToken() ?? null;
    let res = await send(method, path, body, used);
    if (res.status === 401) {
      const error = await toError(res);
      if (error.problem?.code !== 'TOKEN_EXPIRED') {
        // Logged out elsewhere, revoked, or a deleted account: the session is over.
        await tokens?.clear();
        options.onSessionEnded?.(error);
        throw error;
      }
      // Another request may already have refreshed while this one was in flight.
      const renewed = tokens?.getAccessToken() !== used || (await refreshOnce());
      if (!renewed) throw error;
      res = await send(method, path, body, tokens?.getAccessToken() ?? null);
    }
    if (res.status === 403) {
      const error = await toError(res);
      const code = error.problem?.code;
      if (code === 'ACCOUNT_SUSPENDED' || code === 'ACCOUNT_BANNED') {
        await tokens?.clear();
        options.onSessionEnded?.(error);
      }
      throw error;
    }
    if (!res.ok) throw await toError(res);
    return parse(res, schema);
  }

  return {
    async getHealth() {
      const res = await send('GET', '/health', undefined, null);
      // 503 still carries a HealthResponse saying which check is down.
      if (res.ok || res.status === 503) return HealthResponse.parse(await res.json());
      throw await toError(res);
    },

    async signInWithGoogle(idToken, device) {
      const res = await send('POST', '/auth/google', { idToken, device }, null);
      if (!res.ok) throw await toError(res);
      const signedIn = SignInResponse.parse(await res.json());
      await tokens?.save(signedIn);
      return signedIn;
    },

    getMe: () => authed('GET', '/me', Me),
    updateMe: (patch) => authed('PATCH', '/me', Me, patch),
    registerDevice: (device) => authed('PUT', '/me/device', NO_BODY, device),

    async logout() {
      try {
        await authed('POST', '/auth/logout', NO_BODY);
      } finally {
        await tokens?.clear();
      }
    },

    async deleteMe() {
      await authed('DELETE', '/me', NO_BODY);
      await tokens?.clear();
    },

    getMyVerification: () => authed('GET', '/driver/verification', MyVerification),
    saveDriverProfile: (input) => authed('PUT', '/driver/profile', MyVerification, input),
    saveVehicle: (input) => authed('PUT', '/driver/vehicle', MyVerification, input),
    deleteDocument: (id) => authed('DELETE', `/driver/documents/${id}`, NO_BODY),
    submitVerification: () => authed('POST', '/driver/verification/submit', MyVerification),
    searchPlaces: (req) => authed('POST', '/places/search', PlaceSearchResponse, req),
    nearestPlace: (req) => authed('POST', '/places/nearest', NearestPlaceResponse, req),
    getSharing: () => authed('GET', '/driver/sharing', SharingStatus),
    startSharing: (req) => authed('POST', '/driver/sharing/start', SharingStatus, req),
    updateSharing: (req) => authed('PATCH', '/driver/sharing', SharingStatus, req),
    setFull: (isFull) => authed('POST', '/driver/sharing/full', SharingStatus, { isFull }),
    startBreak: (minutes) => authed('POST', '/driver/sharing/break', SharingStatus, { minutes }),
    resumeSharing: (req) => authed('POST', '/driver/sharing/resume', SharingStatus, req),
    confirmStillWorking: () => authed('POST', '/driver/sharing/still-working', SharingStatus),
    stopSharing: () => authed('POST', '/driver/sharing/stop', SharingStatus),
    sendPings: (req) => authed('POST', '/location/pings', PingsResponse, req),
    mapDrivers: (req) => authed('POST', '/map/drivers', MapDriversResponse, req),

    uploadDocument(upload) {
      const form = new FormData();
      form.append('type', upload.type);
      if (upload.expiresOn) form.append('expiresOn', upload.expiresOn);
      if (!options.fileFromUri) throw new Error('fileFromUri is required to upload files');
      form.append('file', options.fileFromUri(upload.uri), 'photo.jpg');
      return authed('POST', '/driver/documents', DocumentView, form);
    },
  };
}
