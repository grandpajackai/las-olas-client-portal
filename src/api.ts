import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { DemoError, getBrowserDemo } from './demoApi';

export const DEMO_MODE = Platform.OS === 'web' && process.env.EXPO_PUBLIC_DEMO_MODE === 'true';

const configuredUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
const browserOrigin = typeof window !== 'undefined'
  ? `${window.location.protocol}//${window.location.hostname}:4000`
  : 'http://localhost:4000';

/** Set EXPO_PUBLIC_API_URL to the API's LAN/production address on a physical device. */
export const API_URL = DEMO_MODE ? 'browser-demo' : (configuredUrl || (Platform.OS === 'web' ? browserOrigin : 'http://localhost:4000')).replace(/\/$/, '');

export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly details?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

export class NetworkError extends Error {
  constructor(message = 'Cannot reach the portal server. Check your connection and try again.') {
    super(message);
    this.name = 'NetworkError';
  }
}

export interface RequestOptions {
  token?: string;
  method?: string;
  body?: unknown;
  idempotencyKey?: string;
  timeoutMs?: number;
}

export function apiPath(path: string): string {
  if (path === '/health' || path.startsWith('/api/')) return path;
  return `/api/${path.replace(/^\/+/, '')}`;
}

export function mutationId(): string {
  return globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function headers(options: RequestOptions): Record<string, string> {
  return {
    ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}),
  };
}

async function fetchResponse(path: string, options: RequestOptions): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 12000);
  let response: Response;
  try {
    response = await fetch(`${API_URL}${apiPath(path)}`, {
      method: options.method ?? 'GET',
      headers: headers(options),
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      signal: controller.signal,
    });
  } catch {
    throw new NetworkError();
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    let details: unknown;
    try { details = await response.json(); } catch { /* A proxy may return a non-JSON error page. */ }
    const error = details && typeof details === 'object' ? details as Record<string, unknown> : undefined;
    const message = typeof error?.error === 'string' ? error.error
      : typeof error?.message === 'string' ? error.message
        : `The server could not complete this action (${response.status}).`;
    throw new ApiError(message, response.status, details);
  }
  return response;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (DEMO_MODE) {
    try { return await getBrowserDemo().request<T>(apiPath(path), options); } catch (error) {
      if (error instanceof DemoError) throw new ApiError(error.message, error.status);
      throw error;
    }
  }
  const response = await fetchResponse(path, options);
  if (response.status === 204) return undefined as T;
  try {
    return await response.json() as T;
  } catch {
    throw new ApiError('The server returned an unreadable response. Please try again.', 502);
  }
}

function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 180) || 'las-olas-download';
}

/** Downloads use authenticated requests; bearer tokens never appear in a URL. */
export async function downloadFile(path: string, token: string, fallbackName: string): Promise<void> {
  // Only a relative API resource may receive the session's Authorization header.
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('://')) {
    throw new Error('This file link is not a portal resource.');
  }
  const name = safeFileName(fallbackName);
  if (Platform.OS === 'web') {
    let blob: Blob;
    let serverName: string | undefined;
    if (DEMO_MODE) {
      try {
        const file = getBrowserDemo().download(apiPath(path), token);
        blob = new Blob([file.base64 ? Uint8Array.from(atob(file.base64), char => char.charCodeAt(0)) : file.text || ''], { type: file.mimeType });
        serverName = file.name;
      } catch (error) {
        if (error instanceof DemoError) throw new ApiError(error.message, error.status);
        throw error;
      }
    } else {
      const response = await fetchResponse(path, { token, timeoutMs: 60000 });
      blob = await response.blob();
      serverName = response.headers.get('Content-Disposition')?.match(/filename="?([^";]+)"?/i)?.[1];
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = safeFileName(serverName || name);
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  if (!FileSystem.cacheDirectory) throw new Error('File storage is unavailable on this device.');
  if (!await Sharing.isAvailableAsync()) throw new Error('Saving or sharing files is unavailable on this device.');
  const localUri = `${FileSystem.cacheDirectory}${mutationId()}-${name}`;
  try {
    let result: FileSystem.FileSystemDownloadResult;
    try {
      result = await FileSystem.downloadAsync(`${API_URL}${apiPath(path)}`, localUri, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      throw new NetworkError('Could not download the file. Check your connection and try again.');
    }
    if (result.status < 200 || result.status >= 300) {
      throw new ApiError(`The file could not be downloaded (${result.status}).`, result.status);
    }
    await Sharing.shareAsync(result.uri, { dialogTitle: 'Save or share your Las Olas file' });
  } finally {
    await FileSystem.deleteAsync(localUri, { idempotent: true }).catch(() => undefined);
  }
}

export function resetBrowserDemo(): void {
  if (!DEMO_MODE) throw new Error('The browser demo is not enabled.');
  try { getBrowserDemo().reset(); } catch (error) {
    if (error instanceof DemoError) throw new ApiError(error.message, error.status);
    throw error;
  }
}
