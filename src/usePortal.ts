import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { ApiError, DEMO_MODE, NetworkError, apiPath, apiRequest, downloadFile, mutationId, resetBrowserDemo } from './api';
import type { Attachment, Mutation, PortalData, User } from './types';

interface Session { token: string; userId: string; }
interface CachedState { data: PortalData; lastSynced: string; }
const STORAGE_PREFIX = DEMO_MODE ? 'las-olas.demo.' : 'las-olas.';
const SESSION_KEY = `${STORAGE_PREFIX}session.v1`;
const cacheKey = (userId: string) => `${STORAGE_PREFIX}cache.v1.${encodeURIComponent(userId)}`;
const queueKey = (userId: string) => `${STORAGE_PREFIX}queue.v1.${encodeURIComponent(userId)}`;

async function storedSession(): Promise<Session | null> {
  const value = Platform.OS === 'web'
    ? window.sessionStorage.getItem(SESSION_KEY)
    : await SecureStore.getItemAsync(SESSION_KEY);
  if (!value) return null;
  try {
    const session = JSON.parse(value) as Partial<Session>;
    return typeof session.token === 'string' && typeof session.userId === 'string'
      ? session as Session : null;
  } catch { return null; }
}

async function saveSession(session: Session | null): Promise<void> {
  if (Platform.OS === 'web') {
    if (session) window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else window.sessionStorage.removeItem(SESSION_KEY);
  } else if (session) {
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
  } else {
    await SecureStore.deleteItemAsync(SESSION_KEY);
  }
}

const messageFor = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.';

function isMutation(value: unknown): value is Mutation {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<Mutation>;
  return typeof item.id === 'string' && typeof item.path === 'string'
    && typeof item.createdAt === 'string' && !!item.body && typeof item.body === 'object'
    && !Array.isArray(item.body) && (item.method === undefined || ['POST', 'PATCH'].includes(item.method));
}

/** Deliberately limited to operations that may safely wait for a connection. */
function canQueue(path: string, method: string, body: Record<string, unknown>, data: PortalData | null): boolean {
  if (!data) return false;
  if (path === '/api/requests' && method === 'POST') {
    return typeof body.vesselId === 'string' && data.vessels.some(vessel => vessel.id === body.vesselId);
  }
  const message = path.match(/^\/api\/requests\/([^/]+)\/messages$/);
  if (message && method === 'POST') return data.requests.some(request => request.id === message[1]);
  if (data.user.role === 'owner') return false;
  if (body.status !== undefined && body.status !== 'draft') return false;
  const allowed = new Set(['vesselId', 'requestId', 'title', 'category', 'performedAt', 'summary', 'checks', 'workPerformed', 'internalNotes', 'attachments', 'status', 'expectedRecordedAt']);
  if (!Object.keys(body).every(key => allowed.has(key))) return false;
  if (path === '/api/reports' && method === 'POST') {
    return typeof body.vesselId === 'string' && data.vessels.some(vessel => vessel.id === body.vesselId)
      && (body.requestId === undefined || data.requests.some(request => request.id === body.requestId && request.vesselId === body.vesselId));
  }
  const draft = path.match(/^\/api\/reports\/([^/]+)$/);
  if (draft && method === 'PATCH') return data.reports.some(report => report.id === draft[1] && report.status === 'draft');
  return false;
}

export function usePortal() {
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Mutation[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [offlineMode, setOfflineModeState] = useState(false);
  const sessionRef = useRef<Session | null>(null);
  const dataRef = useRef<PortalData | null>(null);
  const queueRef = useRef<Mutation[]>([]);
  const queueProblem = useRef<string | null>(null);
  const uncertainIds = useRef(new Map<string, string>());
  const generation = useRef(0);
  const offlineRef = useRef(false);
  const onlineRef = useRef(true);
  const mounted = useRef(true);
  const queueWrites = useRef<Promise<unknown>>(Promise.resolve());
  const cacheWrites = useRef<Promise<unknown>>(Promise.resolve());
  const sessionWrites = useRef<Promise<unknown>>(Promise.resolve());
  const refreshTask = useRef<{ generation: number; promise: Promise<void> } | null>(null);

  const current = useCallback((owner: number) => mounted.current && generation.current === owner, []);
  const setConnection = useCallback((value: boolean) => {
    onlineRef.current = value;
    if (mounted.current) setOnline(value);
  }, []);

  const persistSession = useCallback((value: Session | null) => {
    const operation = sessionWrites.current.catch(() => undefined).then(() => saveSession(value));
    sessionWrites.current = operation;
    return operation;
  }, []);

  const cacheData = useCallback(async (value: PortalData, owner: number, timestamp = new Date().toISOString()) => {
    const session = sessionRef.current;
    if (!current(owner) || !session || value.user.id !== session.userId) return;
    dataRef.current = value;
    setData(value);
    setLastSynced(timestamp);
    const operation = cacheWrites.current.catch(() => undefined).then(async () => {
      if (current(owner)) await AsyncStorage.setItem(cacheKey(session.userId), JSON.stringify({ data: value, lastSynced: timestamp }));
    });
    cacheWrites.current = operation;
    try { await operation; } catch {
      if (current(owner)) setError('Records are up to date, but this device could not save an offline copy.');
    }
  }, [current]);

  const changeQueue = useCallback(async (owner: number, update: (items: Mutation[]) => Mutation[]) => {
    const session = sessionRef.current;
    if (!session || !current(owner)) return;
    const operation = queueWrites.current.catch(() => undefined).then(async () => {
      if (!current(owner)) return;
      const next = update(queueRef.current);
      await AsyncStorage.setItem(queueKey(session.userId), JSON.stringify(next));
      if (current(owner)) {
        queueRef.current = next;
        setPending(next);
      }
    });
    queueWrites.current = operation;
    await operation;
  }, [current]);

  const endSession = useCallback(async (notice: string | null = null, revoke = false) => {
    const previous = sessionRef.current;
    const owner = ++generation.current;
    sessionRef.current = null;
    dataRef.current = null;
    queueRef.current = [];
    queueProblem.current = null;
    uncertainIds.current.clear();
    refreshTask.current = null;
    if (mounted.current) {
      setData(null);
      setPending([]);
      setLastSynced(null);
      setLoading(false);
      setSessionLoading(false);
      setSyncing(false);
      setError(notice);
    }
    await persistSession(null).catch(() => {
      if (current(owner)) setError('Signed out here. The device could not remove its saved session; close this browser tab or clear the app storage.');
    });
    await Promise.allSettled([queueWrites.current, cacheWrites.current]);
    if (previous) {
      // A subsequent login may already be writing a new cache for this account.
      if (current(owner)) await AsyncStorage.multiRemove([cacheKey(previous.userId), queueKey(previous.userId)]).catch(() => undefined);
      if (revoke) await apiRequest('/api/auth/logout', { token: previous.token, method: 'POST', body: {}, timeoutMs: 3000 }).catch(() => undefined);
    }
  }, [current, persistSession]);

  const loadCachedState = useCallback(async (session: Session, owner: number) => {
    const [cached, queued] = await Promise.all([
      AsyncStorage.getItem(cacheKey(session.userId)),
      AsyncStorage.getItem(queueKey(session.userId)),
    ]);
    if (!current(owner)) return;
    if (cached) {
      try {
        const value = JSON.parse(cached) as CachedState;
        if (value.data?.user?.id === session.userId
          && ['vessels', 'reports', 'requests', 'estimates', 'visits', 'documents', 'notifications', 'checklistTemplates']
            .every(key => Array.isArray((value.data as unknown as Record<string, unknown>)[key]))) {
          dataRef.current = value.data;
          setData(value.data);
          setLastSynced(typeof value.lastSynced === 'string' ? value.lastSynced : null);
        }
      } catch { /* Corrupt cached records are never shown. The server will replace them. */ }
    }
    if (queued) {
      try {
        const value: unknown = JSON.parse(queued);
        if (Array.isArray(value) && value.every(isMutation)) {
          queueRef.current = value;
          setPending(value);
        } else queueProblem.current = 'Saved pending changes could not be read. Sign out to clear them before saving new changes.';
      } catch { queueProblem.current = 'Saved pending changes could not be read. Sign out to clear them before saving new changes.'; }
      if (queueProblem.current) setError(queueProblem.current);
    }
  }, [current]);

  const refresh = useCallback(async (): Promise<void> => {
    const session = sessionRef.current;
    const owner = generation.current;
    if (!session || !current(owner)) return;
    if (offlineRef.current) {
      setConnection(false);
      setLoading(false);
      return;
    }
    if (refreshTask.current?.generation === owner) return refreshTask.current.promise;
    const operation = (async () => {
      setLoading(true);
      setError(null);
      let queueFailure: string | null = null;
      let replayed = false;
      try {
        // Fetch first: an expired session must not replay locally saved work.
        const fresh = await apiRequest<PortalData>('/api/bootstrap', { token: session.token });
        if (!current(owner)) return;
        if (fresh.user.id !== session.userId) throw new Error('The server returned records for a different account. Please sign in again.');
        setConnection(!offlineRef.current);
        await cacheData(fresh, owner);
        if (queueRef.current.length) setSyncing(true);
        while (current(owner) && !offlineRef.current && queueRef.current.length) {
          const item = queueRef.current[0];
          const method = item.method || 'POST';
          // A draft may have been submitted by another device since it was saved.
          if (!canQueue(item.path, method, item.body, dataRef.current)) {
            queueFailure = 'A pending change needs review and was kept on this device. Its record is no longer editable offline.';
            break;
          }
          try {
            await apiRequest(item.path, { token: session.token, method, body: item.body, idempotencyKey: item.id });
            if (!current(owner)) return;
            await changeQueue(owner, items => items.filter(queued => queued.id !== item.id));
            replayed = true;
          } catch (failure) {
            if (failure instanceof ApiError && failure.status === 401) throw failure;
            if (failure instanceof NetworkError) {
              setConnection(false);
              queueFailure = 'Connection interrupted. Pending changes are saved and will retry with the same identifiers.';
            } else queueFailure = `A pending change could not sync and was kept for review: ${messageFor(failure)}`;
            break;
          }
        }
        if (!current(owner)) return;
        if (replayed && onlineRef.current && !offlineRef.current) {
          const updated = await apiRequest<PortalData>('/api/bootstrap', { token: session.token });
          if (current(owner)) await cacheData(updated, owner);
        }
        if (current(owner) && (queueFailure || queueProblem.current)) setError(queueFailure || queueProblem.current);
      } catch (failure) {
        if (!current(owner)) return;
        if (failure instanceof ApiError && failure.status === 401) {
          await endSession('Your session expired. Please sign in again.');
          return;
        }
        if (failure instanceof NetworkError) {
          setConnection(false);
          setError(dataRef.current ? 'You are offline. Showing the last synced records; saved changes will retry when you reconnect.' : messageFor(failure));
        } else setError(messageFor(failure));
      } finally {
        if (current(owner)) {
          setLoading(false);
          setSyncing(false);
          if (refreshTask.current?.generation === owner) refreshTask.current = null;
        }
      }
    })();
    refreshTask.current = { generation: owner, promise: operation };
    return operation;
  }, [cacheData, changeQueue, current, endSession, setConnection]);

  useEffect(() => {
    mounted.current = true;
    const owner = ++generation.current;
    void (async () => {
      try {
        const saved = await storedSession();
        if (!current(owner)) return;
        if (saved) {
          sessionRef.current = saved;
          await loadCachedState(saved, owner);
          if (!current(owner)) return;
          setSessionLoading(false);
          await refresh();
        }
      } catch (failure) {
        if (current(owner)) setError(`Could not restore your session: ${messageFor(failure)}`);
      } finally {
        if (current(owner)) setSessionLoading(false);
      }
    })();
    return () => { mounted.current = false; generation.current += 1; };
  }, [current, loadCachedState, refresh]);

  useEffect(() => {
    let checking = false;
    const checkConnection = async () => {
      if (checking || offlineRef.current || !sessionRef.current) return;
      checking = true;
      const owner = generation.current;
      try {
        await apiRequest('/health', { timeoutMs: 3000 });
        if (current(owner)) {
          const wasOffline = !onlineRef.current;
          setConnection(!offlineRef.current);
          if (wasOffline || queueRef.current.length) await refresh();
        }
      } catch (failure) {
        if (current(owner) && failure instanceof NetworkError) setConnection(false);
      } finally { checking = false; }
    };
    const interval = setInterval(() => void checkConnection(), 30000);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void checkConnection();
    });
    const browserOnline = () => void checkConnection();
    const browserOffline = () => setConnection(false);
    if (Platform.OS === 'web') {
      window.addEventListener('online', browserOnline);
      window.addEventListener('offline', browserOffline);
    }
    return () => {
      clearInterval(interval);
      subscription.remove();
      if (Platform.OS === 'web') {
        window.removeEventListener('online', browserOnline);
        window.removeEventListener('offline', browserOffline);
      }
    };
  }, [current, refresh, setConnection]);

  const authenticate = useCallback(async (path: string, body: Record<string, unknown>): Promise<void> => {
    const owner = ++generation.current;
    sessionRef.current = null;
    dataRef.current = null;
    queueRef.current = [];
    queueProblem.current = null;
    uncertainIds.current.clear();
    refreshTask.current = null;
    setData(null);
    setPending([]);
    setLastSynced(null);
    setLoading(true);
    setError(null);
    try {
      await persistSession(null);
      const result = await apiRequest<{ token: string; user: User }>(path, { method: 'POST', body });
      if (!current(owner)) return;
      if (typeof result.token !== 'string' || !result.user?.id) throw new Error('The server did not return a valid session. Please try again.');
      const session = { token: result.token, userId: result.user.id };
      await persistSession(session);
      if (!current(owner)) return;
      sessionRef.current = session;
      offlineRef.current = false;
      setOfflineModeState(false);
      setConnection(true);
      await loadCachedState(session, owner);
      if (!current(owner)) return;
      setSessionLoading(false);
      await refresh();
    } catch (failure) {
      if (current(owner)) {
        if (failure instanceof NetworkError) setConnection(false);
        setError(messageFor(failure));
        throw failure;
      }
    } finally {
      if (current(owner)) { setLoading(false); setSessionLoading(false); }
    }
  }, [current, loadCachedState, persistSession, refresh, setConnection]);

  const login = useCallback((email: string, password: string) => authenticate('/api/auth/login', {
    email: email.trim(), password,
  }), [authenticate]);

  const acceptInvitation = useCallback((inviteToken: string, password: string) => authenticate('/api/auth/accept-invite', {
    inviteToken: inviteToken.trim(), password,
  }), [authenticate]);

  const request = useCallback(async <T,>(path: string, body?: Record<string, unknown>, method = 'GET'): Promise<T> => {
    const session = sessionRef.current;
    const owner = generation.current;
    if (!session) throw new Error('Please sign in to continue.');
    if (offlineRef.current || !onlineRef.current) throw new Error('This action requires a live connection. Reconnect and try again.');
    setError(null);
    const normalizedPath = apiPath(path);
    const normalizedMethod = method.toUpperCase();
    const writes = normalizedMethod !== 'GET' && normalizedMethod !== 'HEAD';
    const fingerprint = JSON.stringify([normalizedPath, normalizedMethod, body]);
    const id = writes ? uncertainIds.current.get(fingerprint) || mutationId() : undefined;
    try {
      const result = await apiRequest<T>(normalizedPath, { token: session.token, method: normalizedMethod, body, idempotencyKey: id });
      if (!current(owner)) throw new Error('Your session changed. Please try again.');
      uncertainIds.current.delete(fingerprint);
      setConnection(!offlineRef.current);
      return result;
    } catch (failure) {
      if (current(owner)) {
        if (failure instanceof NetworkError) {
          setConnection(false);
          if (id) uncertainIds.current.set(fingerprint, id);
        }
        setError(messageFor(failure));
        if (failure instanceof ApiError && failure.status === 401) await endSession('Your session expired. Please sign in again.');
      }
      throw failure;
    }
  }, [current, endSession, setConnection]);

  const mutate = useCallback(async (path: string, body: Record<string, unknown>, method = 'POST'): Promise<{ queued: boolean }> => {
    const session = sessionRef.current;
    const owner = generation.current;
    if (!session) throw new Error('Please sign in to continue.');
    const normalizedPath = apiPath(path);
    const normalizedMethod = method.toUpperCase();
    const fingerprint = JSON.stringify([normalizedPath, normalizedMethod, body]);
    const item: Mutation = { id: uncertainIds.current.get(fingerprint) || mutationId(), path: normalizedPath, method: normalizedMethod, body, createdAt: new Date().toISOString() };
    const queue = async () => {
      if (!current(owner)) throw new Error('Your session changed. Please try again.');
      if (queueProblem.current) throw new Error(queueProblem.current);
      if (!canQueue(normalizedPath, normalizedMethod, body, dataRef.current)) {
        throw new Error('This action requires a live connection. Reconnect and try again.');
      }
      await changeQueue(owner, items => [...items, item]);
      if (!current(owner)) throw new Error('Your session changed. Please try again.');
      uncertainIds.current.delete(fingerprint);
      setError(null);
      return { queued: true };
    };
    try {
      if (offlineRef.current || !onlineRef.current) return await queue();
      // Complete an in-flight replay before applying a later edit to the same record.
      if (refreshTask.current?.generation === owner) await refreshTask.current.promise;
      if (!current(owner)) throw new Error('Your session changed. Please try again.');
      if (queueRef.current.length) {
        await refresh();
        if (queueRef.current.length && canQueue(normalizedPath, normalizedMethod, body, dataRef.current)) return await queue();
      }
      if (!current(owner)) throw new Error('Your session changed. Please try again.');
      if (offlineRef.current || !onlineRef.current) return await queue();
      // An approval always checks the latest version before sending a decision.
      const decision = normalizedPath.match(/^\/api\/estimates\/([^/]+)\/decision$/);
      if (decision) {
        const fresh = await apiRequest<PortalData>('/api/bootstrap', { token: session.token });
        if (!current(owner)) throw new Error('Your session changed. Please try again.');
        if (fresh.user.id !== session.userId) throw new Error('The server returned records for a different account. Please sign in again.');
        await cacheData(fresh, owner);
        const estimate = fresh.estimates.find(value => value.id === decision[1]);
        if (!estimate || estimate.status !== 'pending' || estimate.supersededBy || estimate.version !== body.version) {
          throw new Error('This estimate has changed. Review the latest version before making a decision.');
        }
      }
      if (!current(owner)) throw new Error('Your session changed. Please try again.');
      if (offlineRef.current || !onlineRef.current) return await queue();
      try {
        await apiRequest(normalizedPath, { token: session.token, method: normalizedMethod, body, idempotencyKey: item.id });
      } catch (failure) {
        if (failure instanceof NetworkError) {
          if (current(owner)) {
            setConnection(false);
            // Online-only actions keep an uncertain attempt's key for a manual retry.
            uncertainIds.current.set(fingerprint, item.id);
          }
          return await queue();
        }
        throw failure;
      }
      if (!current(owner)) throw new Error('Your session changed. Please sign in again.');
      uncertainIds.current.delete(fingerprint);
      setConnection(!offlineRef.current);
      // A background refresh could have begun before this write committed.
      if (refreshTask.current?.generation === owner) await refreshTask.current.promise;
      await refresh();
      return { queued: false };
    } catch (failure) {
      if (current(owner)) {
        if (failure instanceof NetworkError) setConnection(false);
        setError(messageFor(failure));
        if (failure instanceof ApiError && failure.status === 401) await endSession('Your session expired. Please sign in again.');
      }
      throw failure;
    }
  }, [cacheData, changeQueue, current, endSession, refresh, setConnection]);

  const setOfflineMode = useCallback((value: boolean) => {
    offlineRef.current = value;
    setOfflineModeState(value);
    if (value) setConnection(false);
    else void refresh();
  }, [refresh, setConnection]);

  const download = useCallback(async (path: string, name: string) => {
    const session = sessionRef.current;
    const owner = generation.current;
    if (!session) throw new Error('Please sign in to download files.');
    if (offlineRef.current || !onlineRef.current) throw new Error('Connect to the server to download this file.');
    try { await downloadFile(path, session.token, name); } catch (failure) {
      if (current(owner)) {
        if (failure instanceof NetworkError) setConnection(false);
        setError(messageFor(failure));
        if (failure instanceof ApiError && failure.status === 401) await endSession('Your session expired. Please sign in again.');
      }
      throw failure;
    }
  }, [current, endSession, setConnection]);

  const downloadDocument = useCallback(async (id: string) => {
    await download(`/api/documents/${encodeURIComponent(id)}/download`, `las-olas-document-${id}.txt`);
  }, [download]);

  const exportHistory = useCallback(async (vesselId: string) => {
    await download(`/api/export/${encodeURIComponent(vesselId)}`, `las-olas-history-${vesselId}.csv`);
  }, [download]);

  const downloadAttachment = useCallback(async (attachment: Attachment) => {
    await download(attachment.url || `/api/attachments/${encodeURIComponent(attachment.id)}/download`, attachment.name);
  }, [download]);

  const uploadAttachment = useCallback(async (vesselId: string, name: string, mimeType: string, dataBase64: string): Promise<Attachment> => {
    const session = sessionRef.current;
    const owner = generation.current;
    if (!session) throw new Error('Please sign in to attach files.');
    if (offlineRef.current || !onlineRef.current) throw new Error('Connect to the server before adding a photo or file.');
    try {
      const result = await apiRequest<Attachment>('/api/attachments', {
        token: session.token, method: 'POST', body: { vesselId, name, mimeType, dataBase64 }, idempotencyKey: mutationId(), timeoutMs: 60000,
      });
      if (!current(owner)) throw new Error('Your session changed. Please try again.');
      return result;
    } catch (failure) {
      if (current(owner)) {
        if (failure instanceof NetworkError) setConnection(false);
        setError(messageFor(failure));
        if (failure instanceof ApiError && failure.status === 401) await endSession('Your session expired. Please sign in again.');
      }
      throw failure;
    }
  }, [current, endSession, setConnection]);

  const logout = useCallback(() => endSession(null, true), [endSession]);
  const clearError = useCallback(() => setError(null), []);
  const resetDemo = useCallback(async () => {
    if (!DEMO_MODE) throw new Error('Reset is available in the self-contained browser demo.');
    await endSession(null, true);
    const owner = generation.current;
    try {
      const keys = await AsyncStorage.getAllKeys();
      if (!current(owner)) return;
      await AsyncStorage.multiRemove(keys.filter(key => key.startsWith('las-olas.demo.')));
      if (!current(owner)) return;
      resetBrowserDemo();
      offlineRef.current = false;
      setOfflineModeState(false);
      setConnection(true);
    } catch (failure) {
      if (current(owner)) setError(messageFor(failure));
      throw failure;
    }
  }, [current, endSession, setConnection]);

  return {
    data, loading, error, sessionLoading, login, acceptInvitation, logout, refresh, mutate, request, pending, syncing, demoMode: DEMO_MODE, resetDemo,
    lastSynced, clearError, online, offlineMode, setOfflineMode,
    downloadDocument, exportHistory, uploadAttachment, downloadAttachment,
  };
}
