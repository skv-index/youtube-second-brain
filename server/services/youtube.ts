import { getTokens, saveTokens, setNeedsReauth, needsReauth, hasTokens } from "../auth/tokens.js";
import { addQuotaUnits, getQuotaUsedToday, resetQuotaIfNewDay } from "../db/quota.js";
import { TokenError, ConfigError } from "../errors.js";

const OAUTH_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const YOUTUBE_API = "https://www.googleapis.com/youtube/v3";

export const REQUIRED_SCOPE = "https://www.googleapis.com/auth/youtube.readonly";

const DAILY_QUOTA_LIMIT = 10_000;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new ConfigError(`Missing environment variable ${name}`);
  return value;
}

export function redirectUri(): string {
  const port = process.env.PORT ?? "3000";
  return `http://localhost:${port}/api/auth/google/callback`;
}

export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: requireEnv("GOOGLE_CLIENT_ID"),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: REQUIRED_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${OAUTH_AUTH_URL}?${params.toString()}`;
}

export interface TokenExchangeResult {
  accessToken: string | null;
  refreshToken: string | null;
  expiresIn: number | null;
  scope: string | null;
}

export async function exchangeCodeForTokens(code: string): Promise<TokenExchangeResult> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: requireEnv("GOOGLE_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new TokenError(`Google token exchange failed: ${res.status} ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
  return {
    accessToken: json.access_token ?? null,
    refreshToken: json.refresh_token ?? null,
    expiresIn: json.expires_in ?? null,
    scope: json.scope ?? null,
  };
}

async function refreshAccessToken(refreshToken: string): Promise<void> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: requireEnv("GOOGLE_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    if (res.status === 400 || res.status === 401) {
      // Refresh token revoked or invalid — the user must reconnect manually.
      setNeedsReauth(true);
      throw new TokenError("Refresh token rejected. Reconnect your Google account.");
    }
    throw new TokenError(`Google token refresh failed: ${res.status}`);
  }
  const json = (await res.json()) as { access_token?: string; expires_in?: number; scope?: string };
  saveTokens({
    accessToken: json.access_token ?? null,
    refreshToken: null,
    expiresIn: json.expires_in ?? null,
    scope: json.scope ?? null,
  });
}

export async function getFreshAccessToken(): Promise<string> {
  const tokens = getTokens();
  if (!tokens || tokens.needsReauth) throw new TokenError("No valid Google account connected.");
  if (tokens.expiryAt - Date.now() > 60_000) return tokens.accessToken;
  if (tokens.refreshToken) {
    await refreshAccessToken(tokens.refreshToken);
    const updated = getTokens();
    if (!updated) throw new TokenError("Token refresh failed.");
    return updated.accessToken;
  }
  setNeedsReauth(true);
  throw new TokenError("Access token expired and no refresh token stored. Reconnect your Google account.");
}

export function quotaStatus(): { used: number; limit: number } {
  resetQuotaIfNewDay();
  return { used: getQuotaUsedToday(), limit: DAILY_QUOTA_LIMIT };
}

export function isOAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function isConnected(): boolean {
  return isOAuthConfigured() && hasTokens() && !needsReauth();
}

export interface YouTubeThumbnailSet {
  [key: string]: { url: string } | undefined;
}

export interface YouTubeChannel {
  id: string;
  snippet: { title: string; description: string; thumbnails: YouTubeThumbnailSet };
  statistics?: { subscriberCount?: string };
}

export interface YouTubeVideo {
  id: string;
  snippet: {
    title: string;
    description: string;
    channelTitle: string;
    channelId: string;
    publishedAt: string;
    thumbnails: YouTubeThumbnailSet;
  };
  contentDetails: { duration?: string };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
}

export interface YouTubePlaylist {
  id: string;
  snippet: {
    title: string;
    description: string;
    channelId: string;
    publishedAt: string;
    thumbnails: YouTubeThumbnailSet;
  };
  contentDetails: { itemCount: number };
  status: { privacyStatus: string };
}

export interface YouTubePlaylistItem {
  id: string;
  snippet: {
    title: string;
    description: string;
    channelId: string;
    channelTitle: string;
    publishedAt: string;
    resourceId?: { videoId?: string };
    thumbnails: YouTubeThumbnailSet;
  };
  contentDetails: { videoId: string; videoPublishedAt?: string };
}

export interface YouTubeSubscription {
  id: string;
  snippet: {
    title: string;
    description: string;
    resourceId: { channelId: string };
    publishedAt: string;
    thumbnails: YouTubeThumbnailSet;
  };
}

export function thumbnailUrl(set: YouTubeThumbnailSet | undefined): string | null {
  return (
    set?.medium?.url ??
    set?.high?.url ??
    set?.default?.url ??
    set?.maxres?.url ??
    set?.standard?.url ??
    null
  );
}

export function parseIsoDuration(iso: string | undefined): number {
  if (!iso) return 0;
  const match = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!match) return 0;
  const [, d, h, m, s] = match;
  return Number(d ?? 0) * 86_400 + Number(h ?? 0) * 3_600 + Number(m ?? 0) * 60 + Number(s ?? 0);
}

type ApiErrorKind = "TOKEN" | "QUOTA" | "CONFIG" | "YOUTUBE";

export class YouTubeApiError extends Error {
  constructor(
    message: string,
    public readonly kind: ApiErrorKind,
    /** Google `error.errors[0].reason`, when the response body provided one. */
    public readonly reason?: string
  ) {
    super(message);
    this.name = "YouTubeApiError";
  }
}

export interface YouTubeErrorBody {
  reason?: string;
  message?: string;
}

/** Pull Google's structured error reason/message out of a failed API response. */
export function parseYouTubeErrorBody(body: string): YouTubeErrorBody {
  try {
    const json = JSON.parse(body) as {
      error?: { message?: string; errors?: { reason?: string; message?: string }[] };
    };
    const first = json.error?.errors?.[0];
    return { reason: first?.reason, message: first?.message ?? json.error?.message };
  } catch {
    return {};
  }
}

/**
 * GET against the YouTube Data API v3 with an OAuth bearer token,
 * daily quota accounting, and error classification.
 */
export async function youtubeGet<T>(
  resource: string,
  params: Record<string, string | number | undefined>,
  quotaUnitCost = 1
): Promise<T> {
  if (!isOAuthConfigured()) {
    throw new YouTubeApiError("Google OAuth client is not configured in .env.", "CONFIG");
  }
  const { used } = quotaStatus();
  if (used + quotaUnitCost > DAILY_QUOTA_LIMIT) {
    throw new YouTubeApiError(
      `YouTube API daily quota nearly exhausted (${used}/${DAILY_QUOTA_LIMIT}). Sync resumes automatically tomorrow.`,
      "QUOTA"
    );
  }

  const accessToken = await getFreshAccessToken();

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }

  let res: Response;
  try {
    res = await fetch(`${YOUTUBE_API}/${resource}?${search.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch (err) {
    throw new YouTubeApiError(
      `Network error talking to YouTube (${err instanceof Error ? err.message : String(err)}).`,
      "YOUTUBE"
    );
  }

  addQuotaUnits(quotaUnitCost);

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 401) {
      setNeedsReauth(true);
      throw new YouTubeApiError("YouTube rejected the access token. Reconnect your Google account.", "TOKEN");
    }
    if (res.status === 403 && body.includes("quotaExceeded")) {
      throw new YouTubeApiError("YouTube API daily quota exceeded. It resets at midnight Pacific Time.", "QUOTA");
    }
    if (res.status === 403 && body.includes("has not been used in project") === false && body.includes("Forbidden")) {
      throw new YouTubeApiError(
        "YouTube API access denied. Make sure the YouTube Data API v3 is enabled for your Google Cloud project.",
        "CONFIG"
      );
    }
    if (res.status === 403) {
      throw new YouTubeApiError(
        "YouTube Data API v3 is not enabled for your Google Cloud project — enable it in the API Library first.",
        "CONFIG"
      );
    }
    if (res.status === 404) {
      const details = parseYouTubeErrorBody(body);
      throw new YouTubeApiError(
        `YouTube resource not found: ${resource}${details.message ? ` (${details.message})` : ""}.`,
        "YOUTUBE",
        details.reason
      );
    }
    throw new YouTubeApiError(`YouTube API error ${res.status}: ${body.slice(0, 240)}`, "YOUTUBE");
  }

  return (await res.json()) as T;
}

export function getRefreshToken(): string | null {
  return getTokens()?.refreshToken ?? null;
}
