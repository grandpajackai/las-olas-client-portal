import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the shipped browser adapter itself. Only browser storage is replaced.
const compiled = new Map();
function loadSource(name, extra = {}) {
  if (!compiled.has(name)) compiled.set(name, ts.transpileModule(readFileSync(new URL(`../src/${name}.ts`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText);
  const module = { exports: {} };
  vm.runInNewContext(compiled.get(name), {
    module, exports: module.exports, Error, Date, Intl, TextEncoder, Uint8Array, crypto: webcrypto, atob, Blob,
    require: path => loadSource(path.replace('./', '')), ...extra,
  }, { filename: `${name}.transpiled.cjs` });
  return module.exports;
}
const { createDemoApi, DEMO_STORAGE_KEY } = loadSource('demoApi');
const category = 'Maintenance & systems';
const serenity = 'vessel-serenity';
const password = 'DemoHarbor!26';
const isStatus = status => error => error.status === status;
function fixture() {
  const values = new Map();
  let timestamp = Date.parse('2026-10-13T16:00:00Z');
  let quota = false;
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { if (quota) throw new Error('Quota exceeded'); values.set(key, value); },
    removeItem: key => values.delete(key),
  };
  const api = createDemoApi(storage, () => timestamp);
  const login = async (role, secret = password) => api.request('/api/auth/login', { method: 'POST', body: { email: role.includes('@') ? role : `${role}@demo.lasolas.test`, password: secret } });
  const call = (token, path, body, method = body === undefined ? 'GET' : 'POST', idempotencyKey) => api.request(path, { token, method, body, idempotencyKey });
  return { api, storage, values, login, call, clock: () => timestamp, setQuota: value => { quota = value; }, tick: (ms = 1000) => { timestamp += ms; }, setTime: value => { timestamp = Date.parse(value); } };
}

test('browser demo isolates assigned vessels and hides drafts and internal notes from owners', async () => {
  const f = fixture();
  const owner = await f.login('owner'); const staff = await f.login('staff'); const admin = await f.login('admin'); const second = await f.login('second-owner');
  const ownerData = await f.call(owner.token, '/api/bootstrap');
  assert.equal(ownerData.vessels.length, 2);
  assert.equal(ownerData.reports.some(report => report.status !== 'published' || report.internalNotes !== undefined), false);
  assert.equal((await f.call(staff.token, '/api/bootstrap')).vessels.length, 1);
  assert.equal((await f.call(admin.token, '/api/bootstrap')).vessels.length, 3);
  assert.equal((await f.call(second.token, '/api/bootstrap')).vessels[0].id, 'vessel-aurora');
  await assert.rejects(f.call(owner.token, '/api/requests/request-aurora-private/messages', { text: 'Unassigned' }), isStatus(404));
  await assert.rejects(f.call(staff.token, '/api/estimates', { vesselId: serenity }), isStatus(403));
  await assert.rejects(f.call(owner.token, '/api/reports', { vesselId: serenity }), isStatus(403));
  await assert.rejects(f.call(owner.token, '/api/admin/access'), isStatus(403));
});

test('requests, conversations and notification preferences persist without contacting anyone', async () => {
  const f = fixture(); const owner = await f.login('owner'); const staff = await f.login('staff');
  const request = await f.call(owner.token, '/api/requests', { vesselId: serenity, title: 'Weekend care', description: 'Prepare the deck.', category, priority: 'routine', desiredDate: '2026-10-17' });
  await f.call(staff.token, `/api/requests/${request.id}`, { status: 'acknowledged', coordinator: staff.user.name }, 'PATCH');
  await f.call(staff.token, `/api/requests/${request.id}/messages`, { text: 'We have the details.' });
  let data = await f.call(owner.token, '/api/bootstrap');
  assert.equal(data.requests.find(value => value.id === request.id).messages[0].author, staff.user.name);
  const notifications = data.notifications.length;
  await f.call(owner.token, '/api/preferences', { messages: false }, 'PATCH');
  await f.call(staff.token, `/api/requests/${request.id}/messages`, { text: 'A further note.' });
  data = await f.call(owner.token, '/api/bootstrap');
  assert.equal(data.notifications.length, notifications);
  assert.equal(data.user.preferences.messages, false);
  await f.call(owner.token, `/api/notifications/${data.notifications[0].id}/read`, {});
  assert.equal((await f.call(owner.token, '/api/bootstrap')).notifications[0].read, true);
  assert.equal(JSON.parse(f.values.get(DEMO_STORAGE_KEY)).records.requests.find(value => value.id === request.id).messages.length, 2);
});

test('estimate revisions preserve previous decisions and reject stale approvals or changed request lineage', async () => {
  const f = fixture(); const owner = await f.login('owner'); const admin = await f.login('admin');
  const original = await f.call(owner.token, '/api/estimates/estimate-pump-v1/decision', { version: 1, decision: 'approved' });
  const revised = await f.call(admin.token, '/api/estimates', { vesselId: serenity, title: 'Revised pump scope', amount: 925, currency: 'USD', scope: ['Replacement seal and hose.'], supersedesId: original.id, requestId: 'request-pump' });
  assert.equal(revised.version, 2);
  const history = (await f.call(owner.token, '/api/bootstrap')).estimates;
  assert.equal(history.find(value => value.id === original.id).status, 'approved');
  assert.equal(history.find(value => value.id === original.id).supersededBy, revised.id);
  await assert.rejects(f.call(owner.token, `/api/estimates/${original.id}/decision`, { version: 1, decision: 'declined' }), isStatus(409));
  await assert.rejects(f.call(owner.token, `/api/estimates/${revised.id}/decision`, { version: 1, decision: 'approved' }), isStatus(409));
  await f.call(owner.token, `/api/estimates/${revised.id}/decision`, { version: 2, decision: 'approved' });
  await assert.rejects(f.call(admin.token, '/api/estimates', { vesselId: serenity, title: 'Wrong lineage', amount: 100, scope: ['Work'], supersedesId: revised.id, requestId: 'request-provisions' }), isStatus(400));
  await assert.rejects(f.call(admin.token, '/api/estimates', { vesselId: serenity, title: 'Tiny amount', amount: 0.001, scope: ['Work'] }), isStatus(400));
});

test('draft review, return, publication and corrections enforce workflow and controlled document visibility', async () => {
  const f = fixture(); const owner = await f.login('owner'); const staff = await f.login('staff'); const admin = await f.login('admin');
  const draft = await f.call(staff.token, '/api/reports', { vesselId: serenity, requestId: 'request-pump', title: '=1+1', category, performedAt: '2026-10-13', summary: 'Pump work complete.', checks: [{ label: 'Pump seal', status: 'passed', value: 'Dry after dockside check' }], workPerformed: ['Replaced seal.'], internalNotes: 'PRIVATE WORKING NOTE' });
  const update = await f.call(staff.token, `/api/reports/${draft.id}`, { summary: 'Inspection and replacement complete.', expectedRecordedAt: draft.recordedAt }, 'PATCH');
  await assert.rejects(f.call(staff.token, `/api/reports/${draft.id}`, { summary: 'Stale edit', expectedRecordedAt: draft.recordedAt }, 'PATCH'), isStatus(409));
  await f.call(staff.token, `/api/reports/${draft.id}/submit`, {});
  assert.equal((await f.call(owner.token, '/api/bootstrap')).reports.some(report => report.id === draft.id), false);
  await assert.rejects(f.call(staff.token, `/api/reports/${draft.id}/publish`, {}), isStatus(403));
  const returned = await f.call(admin.token, `/api/reports/${draft.id}/return`, { reason: 'Add the final reading.' });
  assert.equal(returned.author, staff.user.name);
  assert.match(returned.internalNotes, /Add the final reading/);
  assert.notEqual(returned.recordedAt, update.recordedAt);
  await f.call(staff.token, `/api/reports/${draft.id}`, { summary: 'Final reading verified.', expectedRecordedAt: returned.recordedAt }, 'PATCH');
  await f.call(staff.token, `/api/reports/${draft.id}/submit`, {});
  await f.call(admin.token, `/api/reports/${draft.id}/publish`, {});
  const visible = (await f.call(owner.token, '/api/bootstrap')).reports.find(report => report.id === draft.id);
  assert.equal(visible.internalNotes, undefined);
  assert.equal(visible.requestId, 'request-pump');
  const document = f.api.download(`/api/documents/doc-${draft.id}/download`, owner.token);
  assert.match(document.text, /SYNTHETIC DEMO/);
  assert.equal(document.text.includes('PRIVATE WORKING NOTE'), false);
  const csv = f.api.download(`/api/export/${serenity}`, owner.token);
  assert.ok(csv.text.includes('"\'=1+1"'));
  assert.equal(csv.text.includes('PRIVATE WORKING NOTE'), false);
  const correction = await f.call(staff.token, `/api/reports/${draft.id}/revisions`, { summary: 'Correction.' });
  assert.equal(correction.revision, 2);
  await assert.rejects(f.call(staff.token, `/api/reports/${draft.id}/revisions`, {}), isStatus(409));
  await f.call(staff.token, `/api/reports/${correction.id}/submit`, {});
  await f.call(admin.token, `/api/reports/${correction.id}/publish`, {});
  await assert.rejects(f.call(staff.token, `/api/reports/${draft.id}/revisions`, {}), isStatus(409));
});

test('linked visits support rescheduling, completion, cancellation and stale edit detection', async () => {
  const f = fixture(); const admin = await f.login('admin'); const owner = await f.login('owner');
  const visit = await f.call(admin.token, '/api/visits', { vesselId: serenity, requestId: 'request-pump', title: 'Specialist visit', date: '2026-10-16', time: '09:30', category, assignedTo: 'Demo specialist', notes: 'Dockside only.' });
  const updated = await f.call(admin.token, `/api/visits/${visit.id}`, { date: '2026-10-17', time: '11:00' }, 'PATCH');
  assert.ok(updated.updatedAt);
  const completed = await f.call(admin.token, `/api/visits/${visit.id}`, { status: 'completed', expectedUpdatedAt: updated.updatedAt }, 'PATCH');
  await assert.rejects(f.call(admin.token, `/api/visits/${visit.id}`, { status: 'cancelled', expectedUpdatedAt: updated.updatedAt }, 'PATCH'), isStatus(409));
  await assert.rejects(f.call(owner.token, `/api/visits/${visit.id}`, { status: 'cancelled' }, 'PATCH'), isStatus(403));
  await f.call(admin.token, `/api/visits/${visit.id}`, { status: 'cancelled', expectedUpdatedAt: completed.updatedAt }, 'PATCH');
  const data = await f.call(owner.token, '/api/bootstrap');
  assert.equal(data.visits.find(value => value.id === visit.id).status, 'cancelled');
  assert.equal(data.requests.find(value => value.id === 'request-pump').status, 'acknowledged');
});

test('manual demo invitations, hashed sample credentials, assignments and revocation persist', async () => {
  const f = fixture(); const admin = await f.login('admin');
  const invitation = await f.call(admin.token, '/api/admin/invitations', { name: 'Sample Owner', email: 'sample@example.test', role: 'owner', vesselIds: [serenity] });
  const accepted = await f.api.request('/api/auth/accept-invite', { method: 'POST', body: { inviteToken: invitation.inviteToken, password: 'PrivateSample!26' } });
  assert.equal((await f.call(accepted.token, '/api/bootstrap')).vessels.length, 1);
  assert.equal(f.values.get(DEMO_STORAGE_KEY).includes('PrivateSample!26'), false);
  await assert.rejects(f.api.request('/api/auth/accept-invite', { method: 'POST', body: { inviteToken: invitation.inviteToken, password: 'PrivateSample!26' } }), isStatus(400));
  const login = await f.login('sample@example.test', 'PrivateSample!26');
  await f.call(admin.token, `/api/admin/users/${login.user.id}`, { vesselIds: [] }, 'PATCH');
  assert.equal((await f.call(login.token, '/api/bootstrap')).vessels.length, 0);
  await f.call(admin.token, `/api/admin/users/${login.user.id}`, { active: false }, 'PATCH');
  await assert.rejects(f.call(login.token, '/api/bootstrap'), isStatus(401));
  const access = await f.call(admin.token, '/api/admin/access');
  assert.equal(access.users.find(user => user.id === login.user.id).active, false);
  assert.ok(access.invitations[0].acceptedAt);
  assert.equal(access.invitations[0].inviteToken, undefined);
  const boat = await f.call(admin.token, '/api/admin/vessels', { name: 'New Sample Yacht', model: 'Model', length: '50 ft', location: 'Sample dock', program: 'Care', image: 'detail' });
  assert.equal((await f.call(admin.token, '/api/bootstrap')).vessels.some(value => value.id === boat.id), true);
});

test('upload/download access follows draft publication and validates image content', async () => {
  const f = fixture(); const owner = await f.login('owner'); const staff = await f.login('staff'); const admin = await f.login('admin'); const second = await f.login('second-owner');
  const base64 = Buffer.from([255, 216, 255, ...Array(20).fill(0), 255, 217]).toString('base64');
  const file = await f.call(staff.token, '/api/attachments', { vesselId: serenity, name: 'sample.jpg', mimeType: 'image/jpeg', dataBase64: base64 });
  await assert.rejects(f.call(staff.token, '/api/attachments', { vesselId: serenity, name: 'bad.png', mimeType: 'image/png', dataBase64: base64 }), isStatus(400));
  assert.throws(() => f.api.download(file.url, owner.token), isStatus(404));
  assert.throws(() => f.api.download(file.url, second.token), isStatus(404));
  const draft = await f.call(staff.token, '/api/reports', { vesselId: serenity, title: 'Photo inspection', category, performedAt: '2026-10-13', summary: 'Sample inspection', workPerformed: ['Checked area.'], attachments: [file] });
  await f.call(staff.token, `/api/reports/${draft.id}/submit`, {});
  await f.call(admin.token, `/api/reports/${draft.id}/publish`, {});
  assert.equal(f.api.download(file.url, owner.token).base64, base64);
  assert.throws(() => f.api.download('/api/documents/doc-aurora-registration/download', owner.token), isStatus(404));
});

test('persisted retry receipts prevent duplicates and respect revoked vessel assignments', async () => {
  const f = fixture(); const owner = await f.login('owner'); const admin = await f.login('admin');
  const body = { vesselId: serenity, title: 'One request', description: 'Details', priority: 'routine', category };
  const first = await f.call(owner.token, '/api/requests', body, 'POST', 'retry-1');
  const reloaded = createDemoApi(f.storage, f.clock);
  const replay = await reloaded.request('/api/requests', { token: owner.token, method: 'POST', body, idempotencyKey: 'retry-1' });
  assert.equal(replay.id, first.id);
  assert.equal((await f.call(owner.token, '/api/bootstrap')).requests.filter(value => value.title === 'One request').length, 1);
  await assert.rejects(f.call(owner.token, '/api/requests', { ...body, title: 'Other' }, 'POST', 'retry-1'), isStatus(409));
  await f.call(admin.token, '/api/admin/users/owner-1', { vesselIds: ['vessel-solstice'] }, 'PATCH');
  await assert.rejects(f.call(owner.token, '/api/requests', body, 'POST', 'retry-1'), isStatus(404));
});

test('a successful message retry still rechecks the current vessel assignment', async () => {
  const f = fixture(); const owner = await f.login('owner'); const admin = await f.login('admin');
  const body = { text: 'Message before access changed' };
  await f.call(owner.token, '/api/requests/request-pump/messages', body, 'POST', 'message-retry');
  await f.call(admin.token, '/api/admin/users/owner-1', { vesselIds: ['vessel-solstice'] }, 'PATCH');
  await assert.rejects(f.call(owner.token, '/api/requests/request-pump/messages', body, 'POST', 'message-retry'), isStatus(404));
});

test('fresh seed dates shift once, isolated browsers do not share work, and reset restores samples', async () => {
  const f = fixture(); f.setTime('2027-03-20T16:00:00Z');
  const owner = await f.login('owner');
  let data = await f.call(owner.token, '/api/bootstrap');
  assert.equal(data.visits.find(visit => visit.id === 'visit-serenity-next').date, '2027-03-23');
  assert.match(data.requests.find(request => request.id === 'request-pump').description, /March 19/);
  f.tick(7 * 86400000 - 1000);
  data = await f.call(owner.token, '/api/bootstrap');
  assert.equal(data.visits.find(visit => visit.id === 'visit-serenity-next').date, '2027-03-23');
  await f.call(owner.token, '/api/requests', { vesselId: serenity, title: 'Browser A only', description: 'Private sample', priority: 'routine', category });
  const other = fixture(); const otherOwner = await other.login('owner');
  assert.equal((await other.call(otherOwner.token, '/api/bootstrap')).requests.some(request => request.title === 'Browser A only'), false);
  f.api.reset();
  await assert.rejects(f.call(owner.token, '/api/bootstrap'), isStatus(401));
  const resetOwner = await f.login('owner');
  assert.equal((await f.call(resetOwner.token, '/api/bootstrap')).requests.some(request => request.title === 'Browser A only'), false);
});

test('storage failures leave the previous saved workspace intact and corrupt data requires an explicit reset', async () => {
  const f = fixture(); const owner = await f.login('owner'); const before = f.values.get(DEMO_STORAGE_KEY);
  f.setQuota(true);
  await assert.rejects(f.call(owner.token, '/api/requests', { vesselId: serenity, title: 'Unsaved', description: 'Details', priority: 'routine', category }), isStatus(507));
  assert.equal(f.values.get(DEMO_STORAGE_KEY), before);
  f.setQuota(false);
  f.values.set(DEMO_STORAGE_KEY, '{broken');
  await assert.rejects(f.call(owner.token, '/api/bootstrap'), isStatus(409));
  assert.equal(f.values.get(DEMO_STORAGE_KEY), '{broken');
  f.api.reset();
  assert.equal((await f.login('owner')).user.id, 'owner-1');
});

test('the exported web API in demo mode performs login, records and downloads without network calls', async () => {
  const f = fixture(); let networkCalls = 0; const downloads = [];
  const window = { location: { protocol: 'https:', hostname: 'preview.example.test' }, localStorage: f.storage };
  const demo = loadSource('demoApi', { window });
  const api = loadSource('api', {
    window, process: { env: { EXPO_PUBLIC_DEMO_MODE: 'true' } },
    require: path => path === 'react-native' ? { Platform: { OS: 'web' } } : path === './demoApi' ? demo : {},
    fetch: async () => { networkCalls += 1; throw new Error('A static demo must not fetch the API'); },
    document: { createElement: () => { const link = { click() { downloads.push(this.download); }, remove() {} }; return link; }, body: { appendChild() {} } },
    URL: { createObjectURL: blob => { assert.ok(blob.size > 0); return 'blob:sample'; }, revokeObjectURL() {} },
    setTimeout: callback => { callback(); return 0; }, clearTimeout() {},
  });
  assert.equal(api.DEMO_MODE, true);
  assert.equal(api.API_URL, 'browser-demo');
  const session = await api.apiRequest('/api/auth/login', { method: 'POST', body: { email: 'owner@demo.lasolas.test', password } });
  const data = await api.apiRequest('/api/bootstrap', { token: session.token });
  assert.equal(data.user.id, 'owner-1');
  await api.downloadFile(`/api/export/${serenity}`, session.token, 'history.csv');
  assert.equal(downloads[0], 'Serenity-demo-service-history.csv');
  assert.equal(networkCalls, 0);
  api.resetBrowserDemo();
  await assert.rejects(api.apiRequest('/api/bootstrap', { token: session.token }), isStatus(401));
});

test('native API builds preserve their real transport even when the public demo flag is set', async () => {
  let requested;
  const api = loadSource('api', {
    process: { env: { EXPO_PUBLIC_DEMO_MODE: 'true', EXPO_PUBLIC_API_URL: 'https://api.example.test' } },
    require: path => path === 'react-native' ? { Platform: { OS: 'ios' } } : path === './demoApi' ? loadSource('demoApi') : {},
    fetch: async (url, options) => { requested = { url, options }; return { ok: true, status: 200, json: async () => ({ ok: true }) }; },
    AbortController, setTimeout, clearTimeout,
  });
  assert.equal(api.DEMO_MODE, false);
  await api.apiRequest('/api/bootstrap', { token: 'native-session' });
  assert.equal(requested.url, 'https://api.example.test/api/bootstrap');
  assert.equal(requested.options.headers.Authorization, 'Bearer native-session');
});
