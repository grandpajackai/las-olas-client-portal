import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Run the actual hook source with deterministic storage and transport boundaries.
// The small hook runner supplies React's state/ref/effect lifecycle without a DOM
// or an extra test-renderer dependency. UI rendering is verified separately.
const source = readFileSync(new URL('../src/usePortal.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;

const clone = value => JSON.parse(JSON.stringify(value));
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
async function settle() { for (let i = 0; i < 80; i += 1) await Promise.resolve(); }

class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}
class NetworkError extends Error {}

function records(id) {
  return {
    user: { id, name: id, email: `${id}@test.invalid`, role: id === 'admin' ? 'admin' : id === 'staff' ? 'staff' : 'owner', initials: 'LO', vesselIds: [`v-${id}`] },
    vessels: [{ id: `v-${id}`, name: `${id}'s vessel`, model: 'Yacht', length: '54 ft', location: 'Marina', image: 'ocean', lastUpdated: '2026-10-10', program: 'Care' }],
    reports: [{ id: `d-${id}`, vesselId: `v-${id}`, title: 'Draft', category: 'Inspection', status: 'draft', performedAt: '2026-10-10', recordedAt: '2026-10-10T12:00:00.000Z', author: id, summary: `${id} private draft`, checks: [], workPerformed: [], attachments: [], revision: 1 }],
    requests: [{ id: `q-${id}`, vesselId: `v-${id}`, title: 'Service', description: 'Details', category: 'Care', priority: 'routine', status: 'submitted', coordinator: '', createdAt: '2026-10-10', messages: [], attachments: [] }],
    estimates: [{ id: `e-${id}`, vesselId: `v-${id}`, title: 'Service scope', version: 1, currency: 'USD', amount: 100, scope: ['Work'], status: 'pending' }],
    visits: [], documents: [], notifications: [], checklistTemplates: [],
  };
}

function serverFixture() {
  const server = {
    online: true,
    data: new Map(['staff', 'admin', 'owner', 'invited'].map(id => [id, records(id)])),
    tokens: new Map(), revoked: new Set(), calls: [], committed: new Map(),
    loseResponse: new Set(), rejects: new Map(), invitations: [],
    bootstrapGate: null, authGate: null, sequence: 0,
  };
  server.request = async (path, options = {}) => {
    const method = options.method || 'GET';
    server.calls.push({ path, ...clone(options) });
    if (!server.online) throw new NetworkError('Network unavailable');
    if (path === '/health') return { ok: true };
    if (path === '/api/auth/login' || path === '/api/auth/accept-invite') {
      if (server.authGate) { const gate = server.authGate; server.authGate = null; await gate.promise; }
      const id = path.endsWith('accept-invite') ? 'invited' : options.body.email.split('@')[0];
      const user = server.data.get(id)?.user;
      if (!user) throw new ApiError('Invalid credentials', 401);
      const token = `token-${id}-${++server.sequence}`;
      server.tokens.set(token, id);
      return { token, user: clone(user) };
    }
    const id = server.tokens.get(options.token);
    if (!id || server.revoked.has(options.token)) throw new ApiError('Session expired', 401);
    const data = server.data.get(id);
    if (path === '/api/auth/logout') { server.revoked.add(options.token); return { ok: true }; }
    if (path === '/api/bootstrap') {
      const snapshot = clone(data);
      if (server.bootstrapGate) { const gate = server.bootstrapGate; server.bootstrapGate = null; await gate.promise; }
      return snapshot;
    }
    if (path === '/api/admin/access' && method === 'GET') return { users: [...server.data.values()].map(value => clone(value.user)), invitations: clone(server.invitations) };
    const key = `${id}:${options.idempotencyKey}`;
    if (options.idempotencyKey && server.committed.has(key)) return clone(server.committed.get(key));
    if (server.rejects.has(path)) { const reject = server.rejects.get(path); throw new ApiError(reject.message, reject.status); }
    let result;
    if (path === '/api/requests' && method === 'POST') {
      result = { ...clone(options.body), id: `request-${++server.sequence}`, createdAt: '2026-10-10', messages: [], attachments: [] };
      data.requests.push(result);
    } else if (path === `/api/reports/d-${id}` && method === 'PATCH') {
      const report = data.reports[0];
      if (options.body.expectedRecordedAt && options.body.expectedRecordedAt !== report.recordedAt) throw new ApiError('This draft was updated on another device.', 409);
      if (report.status !== 'draft') throw new ApiError('This report is no longer a draft.', 409);
      const { expectedRecordedAt, ...fields } = options.body;
      Object.assign(report, fields, { recordedAt: `2026-10-10T13:00:${String(++server.sequence).padStart(2, '0')}.000Z` });
      result = report;
    } else if (path === '/api/reports' && method === 'POST') {
      result = { ...clone(data.reports[0]), ...clone(options.body), id: `report-${++server.sequence}`, status: 'draft' };
      data.reports.push(result);
    } else if (path === `/api/estimates/e-${id}/decision`) {
      const estimate = data.estimates[0];
      if (estimate.status !== 'pending' || estimate.version !== options.body.version) throw new ApiError('Estimate changed', 409);
      estimate.status = options.body.decision;
      result = estimate;
    } else if (path === '/api/admin/invitations' && method === 'POST') {
      result = { id: `invite-${++server.sequence}`, ...clone(options.body), inviteToken: 'manual-invitation-token' };
      server.invitations.push(result);
    } else result = { ok: true };
    if (options.idempotencyKey) server.committed.set(key, clone(result));
    if (server.loseResponse.delete(path)) throw new NetworkError('Response lost after commit');
    return clone(result);
  };
  return server;
}

function harness({ server = serverFixture(), storage = new Map(), sessions = new Map(), demoMode = false, resetBrowserDemo = () => undefined } = {}) {
  const slots = [];
  let cursor = 0, effects = [], scheduled = false, disposed = false, portal, sequence = 0;
  const sameDependencies = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const schedule = () => {
    if (scheduled || disposed) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; if (!disposed) render(); });
  };
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: initial };
      return [slots[index].value, value => { slots[index].value = typeof value === 'function' ? value(slots[index].value) : value; schedule(); }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { current: initial };
      return slots[index];
    },
    useCallback(fn, dependencies) {
      const index = cursor++;
      if (!slots[index] || !sameDependencies(slots[index].dependencies, dependencies)) slots[index] = { fn, dependencies };
      return slots[index].fn;
    },
    useEffect(fn, dependencies) {
      const index = cursor++;
      if (!slots[index] || !sameDependencies(slots[index].dependencies, dependencies)) {
        const previous = slots[index];
        slots[index] = { dependencies };
        effects.push(() => { previous?.cleanup?.(); slots[index].cleanup = fn(); });
      }
    },
  };
  const modules = {
    react,
    'react-native': { Platform: { OS: 'web' }, AppState: { addEventListener: () => ({ remove() {} }) } },
    '@react-native-async-storage/async-storage': {
      getItem: async key => storage.get(key) ?? null,
      getAllKeys: async () => [...storage.keys()],
      setItem: async (key, value) => { storage.set(key, value); },
      multiRemove: async keys => { keys.forEach(key => storage.delete(key)); },
    },
    'expo-secure-store': {},
    './api': {
      ApiError, NetworkError, apiRequest: server.request, DEMO_MODE: demoMode, resetBrowserDemo,
      apiPath: path => path.startsWith('/api/') ? path : `/api/${path.replace(/^\//, '')}`,
      mutationId: () => `client-${++sequence}`, downloadFile: async () => undefined,
    },
  };
  const sandbox = {
    module: { exports: {} }, exports: {}, Error, Promise,
    require: name => { assert.ok(modules[name], `Unexpected dependency: ${name}`); return modules[name]; },
    window: {
      sessionStorage: { getItem: key => sessions.get(key) ?? null, setItem: (key, value) => sessions.set(key, value), removeItem: key => sessions.delete(key) },
      addEventListener() {}, removeEventListener() {},
    },
    setInterval: () => 0, clearInterval() {},
  };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(compiled, sandbox, { filename: 'usePortal.transpiled.cjs' });
  function render() {
    cursor = 0;
    effects = [];
    portal = sandbox.module.exports.usePortal();
    const pendingEffects = effects;
    effects = [];
    pendingEffects.forEach(effect => effect());
  }
  render();
  return {
    get portal() { return portal; }, server, storage, sessions,
    dispose() { if (!disposed) { disposed = true; slots.forEach(slot => slot?.cleanup?.()); } },
  };
}

async function signedIn(t, id = 'staff', options) {
  const instance = harness(options);
  t.after(() => instance.dispose());
  await settle();
  await instance.portal.login(`${id}@test.invalid`, 'password');
  await settle();
  assert.equal(instance.portal.data.user.id, id);
  return instance;
}

test('a lost draft response retains its idempotency key and replay does not duplicate the write', async t => {
  const h = await signedIn(t);
  const originalTimestamp = h.portal.data.reports[0].recordedAt;
  h.server.loseResponse.add('/api/reports/d-staff');
  const result = await h.portal.mutate('/reports/d-staff', { summary: 'Field note', expectedRecordedAt: originalTimestamp }, 'PATCH');
  await settle();
  assert.equal(result.queued, true);
  assert.equal(h.portal.pending.length, 1);
  const id = h.portal.pending[0].id;
  assert.equal(JSON.parse(h.storage.get('las-olas.queue.v1.staff'))[0].id, id);
  await h.portal.refresh();
  await settle();
  const attempts = h.server.calls.filter(call => call.idempotencyKey === id);
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].body.expectedRecordedAt, attempts[1].body.expectedRecordedAt);
  assert.equal(h.portal.pending.length, 0);
  assert.equal(h.portal.data.reports[0].summary, 'Field note');
  assert.equal(h.server.committed.size, 1);
});

test('offline work survives a restart and safely links a draft report to its vessel request', async t => {
  const h = await signedIn(t);
  h.portal.setOfflineMode(true);
  await settle();
  await h.portal.mutate('/reports', { vesselId: 'v-staff', requestId: 'q-staff', title: 'Linked field draft' });
  await settle();
  const queuedId = h.portal.pending[0].id;
  h.dispose();
  h.server.online = false;
  const restored = harness({ server: h.server, storage: h.storage, sessions: h.sessions });
  t.after(() => restored.dispose());
  await settle();
  assert.equal(restored.portal.data.user.id, 'staff');
  assert.equal(restored.portal.pending[0].id, queuedId);
  assert.equal(restored.portal.online, false);
  h.server.online = true;
  await restored.portal.refresh();
  await settle();
  assert.equal(restored.portal.pending.length, 0);
  assert.equal(restored.portal.data.reports.find(report => report.title === 'Linked field draft').requestId, 'q-staff');
});

test('a concurrent draft edit produces a visible conflict and preserves the queued change', async t => {
  const h = await signedIn(t);
  h.portal.setOfflineMode(true);
  await settle();
  await h.portal.mutate('/reports/d-staff', { summary: 'Unsynced note', expectedRecordedAt: h.portal.data.reports[0].recordedAt }, 'PATCH');
  await settle();
  const id = h.portal.pending[0].id;
  h.server.data.get('staff').reports[0].recordedAt = '2026-10-10T14:00:00.000Z';
  h.server.data.get('staff').reports[0].summary = 'Another device';
  h.portal.setOfflineMode(false);
  await settle();
  assert.equal(h.portal.pending[0].id, id);
  assert.equal(JSON.parse(h.storage.get('las-olas.queue.v1.staff'))[0].body.summary, 'Unsynced note');
  assert.match(h.portal.error, /kept for review.*another device/);
  assert.equal(h.portal.data.reports[0].summary, 'Another device');
});

test('HTTP validation failures are not treated as offline changes', async t => {
  const h = await signedIn(t);
  h.server.rejects.set('/api/requests', { status: 422, message: 'Title is required' });
  await assert.rejects(h.portal.mutate('/requests', { vesselId: 'v-staff', title: '' }), /Title is required/);
  await settle();
  assert.equal(h.portal.pending.length, 0);
  assert.equal(h.portal.online, true);
});

test('sign-out clears cached records and a different account never receives the old cache', async t => {
  const h = await signedIn(t);
  h.portal.setOfflineMode(true);
  await settle();
  await h.portal.mutate('/requests', { vesselId: 'v-staff', title: 'Staff only' });
  await h.portal.logout();
  await settle();
  assert.equal(h.portal.data, null);
  assert.equal(h.portal.pending.length, 0);
  assert.equal(h.storage.has('las-olas.cache.v1.staff'), false);
  assert.equal(h.storage.has('las-olas.queue.v1.staff'), false);
  await h.portal.login('owner@test.invalid', 'password');
  await settle();
  assert.equal(h.portal.data.user.id, 'owner');
  assert.equal(h.portal.data.reports[0].summary, 'owner private draft');
  assert.equal(h.portal.data.vessels.some(vessel => vessel.id === 'v-staff'), false);
});

test('revoked sessions clear cached records and queued work before another account signs in', async t => {
  const h = await signedIn(t);
  h.portal.setOfflineMode(true);
  await settle();
  await h.portal.mutate('/requests', { vesselId: 'v-staff', title: 'Unsent' });
  const session = JSON.parse(h.sessions.get('las-olas.session.v1'));
  h.server.revoked.add(session.token);
  h.portal.setOfflineMode(false);
  await settle();
  assert.equal(h.portal.data, null);
  assert.equal(h.portal.pending.length, 0);
  assert.equal(h.sessions.has('las-olas.session.v1'), false);
  assert.equal(h.storage.has('las-olas.cache.v1.staff'), false);
  assert.match(h.portal.error, /session expired/i);
  await h.portal.login('owner@test.invalid', 'password');
  await settle();
  assert.equal(h.portal.data.user.id, 'owner');
  assert.equal(h.portal.data.vessels[0].id, 'v-owner');
});

test('a late response from a prior account cannot overwrite the current account', async t => {
  const h = await signedIn(t);
  const gate = deferred();
  h.server.bootstrapGate = gate;
  const priorRefresh = h.portal.refresh();
  await settle();
  await h.portal.login('owner@test.invalid', 'password');
  gate.resolve();
  await priorRefresh;
  await settle();
  assert.equal(h.portal.data.user.id, 'owner');
  assert.equal(h.portal.data.vessels[0].id, 'v-owner');
});

test('login keeps the login form mounted and invitation acceptance establishes a fresh session', async t => {
  const h = harness();
  t.after(() => h.dispose());
  await settle();
  const gate = deferred();
  h.server.authGate = gate;
  const login = h.portal.login('staff@test.invalid', 'password');
  await settle();
  assert.equal(h.portal.sessionLoading, false);
  assert.equal(h.portal.loading, true);
  gate.resolve();
  await login;
  await h.portal.logout();
  await h.portal.acceptInvitation('manual-invitation-token', 'NewPassword!2026');
  await settle();
  assert.equal(h.portal.data.user.id, 'invited');
  const acceptance = h.server.calls.find(call => call.path === '/api/auth/accept-invite');
  assert.equal(acceptance.body.inviteToken, 'manual-invitation-token');
  assert.equal(acceptance.token, undefined);
});

test('owner report edits and estimate decisions never enter the offline queue', async t => {
  const h = await signedIn(t, 'owner');
  h.portal.setOfflineMode(true);
  await settle();
  await assert.rejects(h.portal.mutate('/reports/d-owner', { summary: 'Forbidden' }, 'PATCH'), /live connection/);
  await assert.rejects(h.portal.mutate('/estimates/e-owner/decision', { version: 1, decision: 'approved' }), /live connection/);
  assert.equal(h.portal.pending.length, 0);
  assert.equal(h.server.calls.some(call => call.path.endsWith('/decision')), false);
});

test('estimate decisions check the current server version before sending an approval', async t => {
  const h = await signedIn(t, 'owner');
  h.server.data.get('owner').estimates[0].version = 2;
  await assert.rejects(h.portal.mutate('/estimates/e-owner/decision', { version: 1, decision: 'approved' }), /estimate has changed/i);
  await settle();
  assert.equal(h.portal.data.estimates[0].version, 2);
  assert.equal(h.server.calls.some(call => call.path.endsWith('/decision')), false);
});

test('report submission and publication are never queued while offline', async t => {
  const h = await signedIn(t, 'admin');
  h.portal.setOfflineMode(true);
  await settle();
  await assert.rejects(h.portal.mutate('/reports/d-admin/submit', {}), /live connection/);
  await assert.rejects(h.portal.mutate('/reports/d-admin/publish', {}), /live connection/);
  assert.equal(h.portal.pending.length, 0);
  assert.equal(h.server.calls.some(call => call.path.endsWith('/submit') || call.path.endsWith('/publish')), false);
});

test('online-only admin requests retain an uncertain write key for a safe manual retry', async t => {
  const h = await signedIn(t, 'admin');
  const body = { name: 'Invitee', email: 'new@test.invalid', role: 'owner', vesselIds: ['v-admin'] };
  h.server.loseResponse.add('/api/admin/invitations');
  await assert.rejects(h.portal.request('/admin/invitations', body, 'POST'), /Response lost/);
  await settle();
  assert.equal(h.portal.pending.length, 0);
  await h.portal.refresh();
  const invitation = await h.portal.request('/admin/invitations', body, 'POST');
  await settle();
  assert.equal(invitation.inviteToken, 'manual-invitation-token');
  const attempts = h.server.calls.filter(call => call.path === '/api/admin/invitations');
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].idempotencyKey, attempts[1].idempotencyKey);
  assert.equal(h.server.invitations.length, 1);
  const access = await h.portal.request('/admin/access');
  assert.equal(access.invitations.length, 1);
});

test('demo reset clears its sessions and queues without touching real API caches', async t => {
  let resets = 0;
  const storage = new Map([['las-olas.cache.v1.real-user', 'real cache'], ['las-olas.demo.cache.v1.other-demo-user', 'demo cache']]);
  const h = await signedIn(t, 'staff', { storage, demoMode: true, resetBrowserDemo: () => { resets += 1; } });
  assert.equal(h.portal.demoMode, true);
  h.portal.setOfflineMode(true);
  await settle();
  await h.portal.mutate('/reports/d-staff', { summary: 'Pending demo work' }, 'PATCH');
  await h.portal.resetDemo();
  await settle();
  assert.equal(resets, 1);
  assert.equal(h.portal.data, null);
  assert.equal(h.portal.pending.length, 0);
  assert.equal(h.portal.offlineMode, false);
  assert.equal([...storage.keys()].some(key => key.startsWith('las-olas.demo.')), false);
  assert.equal(storage.get('las-olas.cache.v1.real-user'), 'real cache');
  assert.equal(h.sessions.has('las-olas.demo.session.v1'), false);
});
