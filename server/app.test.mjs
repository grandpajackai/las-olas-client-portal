import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPortalServer } from './app.mjs';
import { DEMO_PASSWORD } from './seed.mjs';

async function fixture(t, options = {}) {
  const errors = [];
  const app = createPortalServer({ databasePath: ':memory:', onError: error => errors.push(error), ...options });
  const address = await app.listen(0);
  const base = `http://127.0.0.1:${address.port}`;
  async function api(path, { method = 'GET', body, token, key, headers = {} } = {}) {
    const response = await fetch(`${base}${path}`, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(key ? { 'Idempotency-Key': key } : {}), ...headers }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const contentType = response.headers.get('content-type') ?? '';
    const data = contentType.includes('application/json') ? await response.json() : await response.text();
    return { status: response.status, data, headers: response.headers };
  }
  async function login(account = 'owner') {
    const response = await api('/api/auth/login', { method: 'POST', body: { email: `${account}@demo.lasolas.test`, password: DEMO_PASSWORD } });
    assert.equal(response.status, 200);
    assert.equal(response.data.user.email, `${account}@demo.lasolas.test`);
    return response.data.token;
  }
  t.after(async () => { await app.close(); assert.deepEqual(errors, [], 'No unexpected server exceptions'); });
  return { app, api, login, base };
}

const requestBody = { vesselId: 'vessel-serenity', title: 'Test request', description: 'Please inspect the aft deck fitting.', category: 'Maintenance & systems', priority: 'routine' };
const reportBody = { vesselId: 'vessel-serenity', title: 'A field check', category: 'Maintenance & systems', performedAt: '2026-10-10T12:30:00.000Z', summary: 'A recorded dockside observation.', checks: [{ label: 'Bilge', status: 'passed', value: 'Dry at time of visit', equipment: 'Aft bilge' }], workPerformed: ['Inspected aft bilge.'], internalNotes: 'INTERNAL SECRET: contractor pricing.' };
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlU8AAAAASUVORK5CYII=';

test('health and bearer sessions; logout revokes persisted session', async t => {
  const { api, login, app } = await fixture(t);
  assert.equal((await api('/health')).data.demo, true);
  assert.equal((await api('/api/bootstrap')).status, 401);
  assert.equal((await api('/api/auth/login', { method: 'POST', body: { email: 'owner@demo.lasolas.test', password: 'wrong' } })).status, 401);
  const token = await login();
  assert.equal((await api('/api/bootstrap', { token })).status, 200);
  const saved = app.db.prepare('SELECT token_hash FROM sessions').get();
  assert.notEqual(saved.token_hash, token, 'Raw bearer tokens are not stored');
  assert.equal((await api('/api/auth/logout', { method: 'POST', body: {}, token })).status, 200);
  assert.equal((await api('/api/bootstrap', { token })).status, 401);
});

test('independent owners cannot read or mutate another owner records or files', async t => {
  const { api, login } = await fixture(t);
  const owner = await login();
  const second = await login('second-owner');
  const bootstrap = (await api('/api/bootstrap', { token: owner })).data;
  assert.deepEqual(bootstrap.vessels.map(vessel => vessel.id).sort(), ['vessel-serenity', 'vessel-solstice']);
  assert.equal(bootstrap.reports.some(report => report.id === 'report-serenity-draft'), false);
  assert.equal(bootstrap.reports.some(report => Object.hasOwn(report, 'internalNotes')), false);
  for (const collection of ['reports', 'requests', 'estimates', 'visits', 'documents', 'notifications']) assert.equal(bootstrap[collection].some(record => record.vesselId === 'vessel-aurora'), false, collection);
  assert.equal((await api('/api/documents/doc-aurora-registration/download', { token: owner })).status, 404);
  assert.equal((await api('/api/export/vessel-aurora', { token: owner })).status, 404);
  assert.equal((await api('/api/requests/request-aurora-private/messages', { method: 'POST', token: owner, body: { text: 'Unauthorized' } })).status, 404);
  assert.equal((await api('/api/estimates/estimate-aurora-v1/decision', { method: 'POST', token: owner, body: { version: 1, decision: 'approved' } })).status, 404);
  assert.equal((await api('/api/requests', { method: 'POST', token: second, body: requestBody })).status, 404);
  const privateFile = await api('/api/documents/doc-aurora-registration/download', { token: second });
  assert.equal(privateFile.status, 200);
  assert.match(privateFile.data, /DEMONSTRATION DOCUMENT/);
  assert.match(privateFile.data, /Aurora/);
  const ownFile = await api('/api/documents/doc-serenity-inspection/download', { token: owner });
  assert.equal(ownFile.status, 200);
  assert.doesNotMatch(ownFile.data, /DEMO INTERNAL/);
  const history = await api('/api/export/vessel-serenity', { token: owner });
  assert.equal(history.status, 200);
  assert.match(history.data, /text|recorded observations/i);
  assert.doesNotMatch(history.data, /DEMO INTERNAL|Pre-arrival deck preparation/);
});

test('staff restricted to assigned vessel and cannot publish, approve, schedule or invite', async t => {
  const { api, login } = await fixture(t);
  const staff = await login('staff');
  const data = (await api('/api/bootstrap', { token: staff })).data;
  assert.deepEqual(data.vessels.map(vessel => vessel.id), ['vessel-serenity']);
  assert.equal(data.reports.some(report => report.status === 'draft'), true);
  assert.equal(data.reports.some(report => report.internalNotes?.includes('DEMO INTERNAL')), true);
  assert.equal((await api('/api/reports', { method: 'POST', token: staff, body: { ...reportBody, vesselId: 'vessel-solstice' } })).status, 404);
  assert.equal((await api('/api/reports/report-serenity-draft/publish', { method: 'POST', token: staff, body: {} })).status, 403);
  assert.equal((await api('/api/estimates/estimate-pump-v1/decision', { method: 'POST', token: staff, body: { version: 1, decision: 'approved' } })).status, 403);
  assert.equal((await api('/api/visits', { method: 'POST', token: staff, body: {} })).status, 403);
  assert.equal((await api('/api/admin/invitations', { method: 'POST', token: staff, body: {} })).status, 403);
});

test('estimate decisions require exact version, preserve identity, and reject reuse or superseded scope', async t => {
  const { api, login, app } = await fixture(t);
  const owner = await login();
  const admin = await login('admin');
  const path = '/api/estimates/estimate-pump-v1/decision';
  assert.equal((await api(path, { method: 'POST', token: owner, body: { version: 2, decision: 'approved' } })).status, 409);
  const result = await api(path, { method: 'POST', token: owner, key: 'decision-once', body: { version: 1, decision: 'approved' } });
  assert.equal(result.status, 200);
  assert.equal(result.data.decidedBy, 'Alex Morgan');
  assert.equal(result.data.decidedByUserId, 'owner-1');
  const retry = await api(path, { method: 'POST', token: owner, key: 'decision-once', body: { version: 1, decision: 'approved' } });
  assert.deepEqual(retry.data, result.data);
  assert.equal((await api(path, { method: 'POST', token: owner, body: { version: 1, decision: 'declined' } })).status, 409);
  const version2 = await api('/api/estimates', { method: 'POST', token: admin, body: { vesselId: 'vessel-serenity', title: 'Revised pump work', amount: 925, scope: ['Replacement seal and additional gasket.'], supersedesId: 'estimate-pump-v1' } });
  assert.equal(version2.status, 201);
  assert.equal(version2.data.version, 2);
  assert.equal(version2.data.status, 'pending');
  assert.equal(version2.data.decidedBy, undefined);
  assert.equal((await api(path, { method: 'POST', token: owner, body: { version: 1, decision: 'approved' } })).status, 409);
  const original = JSON.parse(app.db.prepare('SELECT data FROM records WHERE kind = ? AND id = ?').get('estimates', 'estimate-pump-v1').data);
  assert.equal(original.status, 'approved');
  assert.equal(original.amount, 845);
  assert.equal(original.decidedAt, result.data.decidedAt);
  const ownerEstimates = (await api('/api/bootstrap', { token: owner })).data.estimates;
  const preserved = ownerEstimates.find(estimate => estimate.id === original.id);
  assert.equal(preserved.status, 'approved');
  assert.equal(preserved.decidedAt, result.data.decidedAt);
  assert.equal(preserved.supersededBy, version2.data.id);
  assert.equal(ownerEstimates.find(estimate => estimate.id === version2.data.id).status, 'pending');
  const approvalAudit = app.db.prepare('SELECT details FROM audit WHERE action = ?').all('estimate.decided');
  assert.equal(approvalAudit.length, 1);
  assert.deepEqual(JSON.parse(approvalAudit[0].details).scope, original.scope);
});

test('idempotency prevents duplicate requests, messages, drafts, and attachments; conflicting key denied', async t => {
  const { api, login, app } = await fixture(t);
  const owner = await login();
  const staff = await login('staff');
  const first = await api('/api/requests', { method: 'POST', body: requestBody, token: owner, key: 'offline-request-1' });
  const retry = await api('/api/requests', { method: 'POST', body: requestBody, token: owner, key: 'offline-request-1' });
  assert.equal(first.status, 201);
  assert.equal(retry.data.id, first.data.id);
  assert.equal((await api('/api/requests', { method: 'POST', body: { ...requestBody, title: 'Different request' }, token: owner, key: 'offline-request-1' })).status, 409);
  const messagePath = `/api/requests/${first.data.id}/messages`;
  const message = await api(messagePath, { method: 'POST', token: owner, body: { text: 'Additional detail.' }, key: 'message-1' });
  assert.deepEqual((await api(messagePath, { method: 'POST', token: owner, body: { text: 'Additional detail.' }, key: 'message-1' })).data, message.data);
  const field = await api('/api/reports', { method: 'POST', token: staff, body: reportBody, key: 'field-entry-1' });
  assert.equal(field.status, 201);
  assert.deepEqual((await api('/api/reports', { method: 'POST', token: staff, body: reportBody, key: 'field-entry-1' })).data, field.data);
  const photo = { vesselId: 'vessel-serenity', name: 'inspection.png', mimeType: 'image/png', dataBase64: png };
  const upload = await api('/api/attachments', { method: 'POST', token: staff, body: photo, key: 'photo-1' });
  assert.equal(upload.status, 201);
  assert.deepEqual((await api('/api/attachments', { method: 'POST', token: staff, body: photo, key: 'photo-1' })).data, upload.data);
  assert.equal(app.db.prepare('SELECT count(*) AS count FROM attachments').get().count, 1);
  const request = JSON.parse(app.db.prepare('SELECT data FROM records WHERE kind = ? AND id = ?').get('requests', first.data.id).data);
  assert.equal(request.messages.length, 1);
  // Identical keys belong to each identity, not a shared fleet-wide cache.
  assert.equal((await api('/api/requests', { method: 'POST', body: requestBody, token: staff, key: 'offline-request-1' })).status, 201);
});

test('report draft, review and publication enforce owner visibility, safe changes and immutable corrections', async t => {
  const { api, login } = await fixture(t);
  const owner = await login();
  const staff = await login('staff');
  const admin = await login('admin');
  const created = await api('/api/reports', { method: 'POST', token: staff, body: reportBody });
  assert.equal(created.status, 201);
  const reportId = created.data.id;
  assert.equal((await api('/api/bootstrap', { token: owner })).data.reports.some(report => report.id === reportId), false);
  const editBody = { summary: 'Recorded entry ready for review.', expectedRecordedAt: created.data.recordedAt };
  const edited = await api(`/api/reports/${reportId}`, { method: 'PATCH', token: staff, body: editBody, key: 'draft-save-1' });
  assert.equal(edited.status, 200);
  assert.notEqual(edited.data.recordedAt, created.data.recordedAt);
  assert.deepEqual((await api(`/api/reports/${reportId}`, { method: 'PATCH', token: staff, body: editBody, key: 'draft-save-1' })).data, edited.data);
  assert.equal((await api(`/api/reports/${reportId}`, { method: 'PATCH', token: staff, body: { summary: 'Stale update', expectedRecordedAt: '2026-01-01T00:00:00.000Z' } })).status, 409);
  const submitted = await api(`/api/reports/${reportId}/submit`, { method: 'POST', token: staff, body: {} });
  assert.equal(submitted.data.status, 'review');
  assert.equal((await api('/api/bootstrap', { token: owner })).data.reports.some(report => report.id === reportId), false);
  assert.equal((await api(`/api/reports/${reportId}`, { method: 'PATCH', token: staff, body: { summary: 'Review overwrite' } })).status, 409);
  assert.equal((await api(`/api/reports/${reportId}/publish`, { method: 'POST', token: staff, body: {} })).status, 403);
  const published = await api(`/api/reports/${reportId}/publish`, { method: 'POST', token: admin, body: {} });
  assert.equal(published.data.status, 'published');
  const ownerView = (await api('/api/bootstrap', { token: owner })).data;
  const visible = ownerView.reports.find(report => report.id === reportId);
  assert.equal(visible.summary, 'Recorded entry ready for review.');
  assert.equal(visible.internalNotes, undefined);
  assert.equal((await api(`/api/reports/${reportId}`, { method: 'PATCH', token: admin, body: { summary: 'Overwrite' } })).status, 409);
  const publishedFile = await api(`/api/documents/doc-${reportId}/download`, { token: owner });
  assert.equal(publishedFile.status, 200);
  assert.doesNotMatch(publishedFile.data, /INTERNAL SECRET/);
  const correction = await api(`/api/reports/${reportId}/revisions`, { method: 'POST', token: staff, body: { summary: 'Correction: updated equipment reference.' } });
  assert.equal(correction.status, 201);
  assert.equal(correction.data.revision, 2);
  assert.equal(correction.data.status, 'draft');
  assert.equal(correction.data.correctsReportId, reportId);
  assert.equal((await api(`/api/reports/${reportId}/revisions`, { method: 'POST', token: staff, body: {} })).status, 409);
  assert.equal((await api('/api/bootstrap', { token: owner })).data.reports.find(report => report.id === reportId).summary, visible.summary);
});

test('management can return review reports privately without losing the staff author or permitting stale saves', async t => {
  const { api, login } = await fixture(t);
  const staff = await login('staff');
  const admin = await login('admin');
  const owner = await login();
  const ownerNotifications = (await api('/api/bootstrap', { token: owner })).data.notifications;
  const created = await api('/api/reports', { method: 'POST', token: staff, body: { ...reportBody, internalNotes: 'x'.repeat(4990) } });
  const path = `/api/reports/${created.data.id}`;
  await api(`${path}/submit`, { method: 'POST', token: staff, body: {} });
  assert.equal((await api(`${path}/return`, { method: 'POST', token: staff, body: { reason: 'Unauthorized review' } })).status, 403);
  assert.equal((await api(`${path}/return`, { method: 'POST', token: owner, body: { reason: 'Unauthorized review' } })).status, 403);
  assert.equal((await api(`${path}/return`, { method: 'POST', token: admin, body: { reason: ' ' } })).status, 400);
  const body = { reason: 'Please confirm the equipment serial reference before publication.' };
  const returned = await api(`${path}/return`, { method: 'POST', token: admin, body, key: 'return-report-1' });
  assert.equal(returned.status, 200);
  assert.equal(returned.data.status, 'draft');
  assert.equal(returned.data.author, created.data.author);
  assert.equal(returned.data.authorId, created.data.authorId);
  assert.notEqual(returned.data.recordedAt, created.data.recordedAt);
  assert.match(returned.data.internalNotes, /Olivia Bennett/);
  assert.match(returned.data.internalNotes, /confirm the equipment serial/);
  assert.equal(returned.data.internalNotes.startsWith('x'.repeat(4990)), true);
  assert.deepEqual((await api(`${path}/return`, { method: 'POST', token: admin, body, key: 'return-report-1' })).data, returned.data);
  assert.equal((await api(`${path}/return`, { method: 'POST', token: admin, body })).status, 409);
  assert.equal((await api(path, { method: 'PATCH', token: staff, body: { summary: 'Stale edit', expectedRecordedAt: created.data.recordedAt } })).status, 409);
  const corrected = await api(path, { method: 'PATCH', token: staff, body: { summary: 'Equipment reference confirmed.', internalNotes: returned.data.internalNotes, expectedRecordedAt: returned.data.recordedAt } });
  assert.equal(corrected.status, 200, 'Appended feedback remains editable even when original notes were near their length limit');
  assert.equal((await api('/api/bootstrap', { token: staff })).data.notifications.some(notification => notification.type === 'review' && notification.title.includes('returned')), true);
  const ownerView = (await api('/api/bootstrap', { token: owner })).data;
  assert.equal(ownerView.reports.some(report => report.id === created.data.id), false);
  assert.deepEqual(ownerView.notifications, ownerNotifications, 'Owners never receive internal review feedback');
  await api(`${path}/submit`, { method: 'POST', token: staff, body: {} });
  await api(`${path}/publish`, { method: 'POST', token: admin, body: {} });
  assert.equal((await api(`${path}/return`, { method: 'POST', token: admin, body })).status, 409);
  assert.equal((await api('/api/bootstrap', { token: owner })).data.reports.find(report => report.id === created.data.id).internalNotes, undefined);
});

test('published corrections must start from the latest revision, preserving newer findings', async t => {
  const { api, login } = await fixture(t);
  const staff = await login('staff');
  const admin = await login('admin');
  const path = '/api/reports/report-serenity-systems';
  const correction = await api(`${path}/revisions`, { method: 'POST', token: staff, body: { summary: 'Newest verified findings.' } });
  assert.equal(correction.status, 201);
  await api(`/api/reports/${correction.data.id}/submit`, { method: 'POST', token: staff, body: {} });
  await api(`/api/reports/${correction.data.id}/publish`, { method: 'POST', token: admin, body: {} });
  const stale = await api(`${path}/revisions`, { method: 'POST', token: staff, body: {} });
  assert.equal(stale.status, 409);
  assert.equal(stale.data.code, 'stale_report_revision');
  const latest = await api(`/api/reports/${correction.data.id}/revisions`, { method: 'POST', token: staff, body: {} });
  assert.equal(latest.status, 201);
  assert.equal(latest.data.revision, 3);
  assert.equal(latest.data.summary, 'Newest verified findings.');
});

test('management can reschedule, complete and cancel visits with conflict and retry protection', async t => {
  const { api, login } = await fixture(t);
  const owner = await login();
  const staff = await login('staff');
  const admin = await login('admin');
  const path = '/api/visits/visit-serenity-next';
  const reschedule = { date: '2026-10-22', time: '11:30', assignedTo: 'Mia Santos', notes: 'Revised owner arrival timing.', status: 'scheduled' };
  assert.equal((await api(path, { method: 'PATCH', token: owner, body: reschedule })).status, 403);
  assert.equal((await api(path, { method: 'PATCH', token: staff, body: reschedule })).status, 403);
  const updated = await api(path, { method: 'PATCH', token: admin, body: reschedule, key: 'visit-reschedule-1' });
  assert.equal(updated.status, 200);
  assert.equal(updated.data.date, reschedule.date);
  assert.equal(updated.data.time, reschedule.time);
  assert.equal(updated.data.assignedTo, reschedule.assignedTo);
  assert.deepEqual((await api(path, { method: 'PATCH', token: admin, body: reschedule, key: 'visit-reschedule-1' })).data, updated.data);
  assert.equal((await api(path, { method: 'PATCH', token: admin, body: { date: '2026-02-30' } })).status, 400);
  assert.equal((await api(path, { method: 'PATCH', token: admin, body: { time: '24:01' } })).status, 400);
  assert.equal((await api(path, { method: 'PATCH', token: admin, body: { status: 'lost' } })).status, 400);
  const completed = await api(path, { method: 'PATCH', token: admin, body: { status: 'completed', expectedUpdatedAt: updated.data.updatedAt }, key: 'visit-complete-1' });
  assert.equal(completed.status, 200);
  assert.equal(completed.data.status, 'completed');
  assert.notEqual(completed.data.updatedAt, updated.data.updatedAt);
  assert.deepEqual((await api(path, { method: 'PATCH', token: admin, body: { status: 'completed', expectedUpdatedAt: updated.data.updatedAt }, key: 'visit-complete-1' })).data, completed.data);
  const stale = await api(path, { method: 'PATCH', token: admin, body: { status: 'cancelled', expectedUpdatedAt: updated.data.updatedAt } });
  assert.equal(stale.status, 409);
  assert.equal(stale.data.code, 'visit_conflict');
  const cancelled = await api(path, { method: 'PATCH', token: admin, body: { status: 'cancelled', notes: '', expectedUpdatedAt: completed.data.updatedAt } });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.data.notes, '');
  assert.equal((await api('/api/bootstrap', { token: owner })).data.visits.find(visit => visit.id === 'visit-serenity-next').status, 'cancelled');
  assert.equal((await api('/api/bootstrap', { token: owner })).data.requests.find(request => request.id === 'request-pump').status, 'acknowledged', 'Visit changes never silently change the linked work request');
});

test('estimate revisions cannot move an approval chain to different work or round an amount to zero', async t => {
  const { api, login } = await fixture(t);
  const admin = await login('admin');
  const body = { vesselId: 'vessel-serenity', title: 'Revised pump estimate', amount: 925, currency: 'USD', scope: ['Updated pump work scope.'], supersedesId: 'estimate-pump-v1' };
  assert.equal((await api('/api/estimates', { method: 'POST', token: admin, body: { ...body, requestId: 'request-provisions' } })).status, 400);
  assert.equal((await api('/api/estimates', { method: 'POST', token: admin, body: { ...body, amount: 0.001 } })).status, 400);
  const version2 = await api('/api/estimates', { method: 'POST', token: admin, body });
  assert.equal(version2.status, 201);
  assert.equal(version2.data.requestId, 'request-pump');
  assert.equal(version2.data.version, 2);
});

test('attachment content is authenticated, scoped, bounded and referenced only by the correct vessel', async t => {
  const { api, login, base } = await fixture(t);
  const owner = await login();
  const second = await login('second-owner');
  const photo = { vesselId: 'vessel-serenity', name: 'inspection.png', mimeType: 'image/png', dataBase64: png };
  const uploaded = await api('/api/attachments', { method: 'POST', token: owner, body: photo });
  assert.equal(uploaded.status, 201);
  assert.equal((await api(uploaded.data.url)).status, 401);
  assert.equal((await api(uploaded.data.url, { token: second })).status, 404);
  const authorized = await fetch(`${base}${uploaded.data.url}`, { headers: { Authorization: `Bearer ${owner}` } });
  assert.equal(authorized.status, 200);
  assert.equal(authorized.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await authorized.arrayBuffer()), Buffer.from(png, 'base64'));
  const crossVessel = await api('/api/requests', { method: 'POST', token: second, body: { ...requestBody, vesselId: 'vessel-aurora', attachments: [uploaded.data] } });
  assert.equal(crossVessel.status, 400);
  assert.equal((await api('/api/attachments', { method: 'POST', token: owner, body: { ...photo, mimeType: 'image/svg+xml' } })).status, 400);
  assert.equal((await api('/api/attachments', { method: 'POST', token: owner, body: { ...photo, dataBase64: Buffer.from('This is not an image.').toString('base64') } })).status, 400);
  assert.equal((await api('/api/attachments', { method: 'POST', token: owner, body: { ...photo, dataBase64: Buffer.alloc(2 * 1024 * 1024 + 1).toString('base64') } })).status, 413);
});

test('notification read state is private and preferences persist per account', async t => {
  const { api, login } = await fixture(t);
  const owner = await login();
  const staff = await login('staff');
  const ownerData = (await api('/api/bootstrap', { token: owner })).data;
  const notification = ownerData.notifications.find(record => !record.read);
  assert.equal((await api(`/api/notifications/${notification.id}/read`, { method: 'POST', token: staff, body: {} })).status, 404);
  assert.equal((await api(`/api/notifications/${notification.id}/read`, { method: 'POST', token: owner, body: {} })).data.read, true);
  const preferences = await api('/api/preferences', { method: 'PATCH', token: owner, body: { messages: false } });
  assert.equal(preferences.data.preferences.messages, false);
  assert.equal((await api('/api/bootstrap', { token: owner })).data.user.preferences.messages, false);
  assert.equal((await api('/api/bootstrap', { token: staff })).data.user.preferences.messages, true);
  assert.equal((await api('/api/preferences', { method: 'PATCH', token: owner, body: { reports: 'false' } })).status, 400);
});

test('notification preferences suppress future matching updates while preserving history and other categories', async t => {
  const { api, login } = await fixture(t);
  const owner = await login();
  const staff = await login('staff');
  const admin = await login('admin');
  const original = (await api('/api/bootstrap', { token: owner })).data.notifications;
  const originalIds = new Set(original.map(notification => notification.id));
  await api('/api/preferences', { method: 'PATCH', token: owner, body: { messages: false } });
  assert.equal((await api('/api/requests/request-pump/messages', { method: 'POST', token: staff, body: { text: 'Messages preference suppression check.' } })).status, 201);
  assert.equal((await api('/api/requests', { method: 'POST', token: staff, body: requestBody })).status, 201);
  assert.equal((await api('/api/estimates', { method: 'POST', token: admin, body: { vesselId: 'vessel-serenity', title: 'Preference test estimate', amount: 100, scope: ['Demonstration scope.'] } })).status, 201);
  const visit = { vesselId: 'vessel-serenity', title: 'Preference test visit', date: '2026-10-20', time: '10:00', category: 'Maintenance & systems', assignedTo: 'Daniel Rivera' };
  assert.equal((await api('/api/visits', { method: 'POST', token: admin, body: visit })).status, 201);
  async function publishReport(title) {
    const report = await api('/api/reports', { method: 'POST', token: staff, body: { ...reportBody, title } });
    assert.equal(report.status, 201);
    assert.equal((await api(`/api/reports/${report.data.id}/submit`, { method: 'POST', token: staff, body: {} })).status, 200);
    assert.equal((await api(`/api/reports/${report.data.id}/publish`, { method: 'POST', token: admin, body: {} })).status, 200);
  }
  await publishReport('Allowed report notification');
  let notifications = (await api('/api/bootstrap', { token: owner })).data.notifications;
  assert.deepEqual(notifications.filter(notification => !originalIds.has(notification.id)).map(notification => notification.type).sort(), ['reminder', 'report']);
  await api('/api/preferences', { method: 'PATCH', token: owner, body: { reports: false, reminders: false, messages: true } });
  assert.equal((await api('/api/visits', { method: 'POST', token: admin, body: { ...visit, title: 'Suppressed reminder' } })).status, 201);
  await publishReport('Suppressed report notification');
  assert.equal((await api('/api/requests/request-pump/messages', { method: 'POST', token: staff, body: { text: 'This message is now enabled.' } })).status, 201);
  notifications = (await api('/api/bootstrap', { token: owner })).data.notifications;
  assert.deepEqual(notifications.filter(notification => !originalIds.has(notification.id)).map(notification => notification.type).sort(), ['message', 'reminder', 'report']);
  for (const existing of original) assert.deepEqual(notifications.find(notification => notification.id === existing.id), existing, 'Changing preferences preserves previously delivered notification history');
});

test('draft photos remain private until a report is published, including guessed file references', async t => {
  const { api, login } = await fixture(t);
  const owner = await login();
  const staff = await login('staff');
  const admin = await login('admin');
  const uploaded = await api('/api/attachments', { method: 'POST', token: staff, body: { vesselId: 'vessel-serenity', name: 'staff-field-photo.png', mimeType: 'image/png', dataBase64: png } });
  assert.equal(uploaded.status, 201);
  assert.equal((await api(uploaded.data.url, { token: owner })).status, 404);
  assert.equal((await api('/api/requests', { method: 'POST', token: owner, body: { ...requestBody, attachments: [uploaded.data] } })).status, 400);
  const draft = await api('/api/reports', { method: 'POST', token: staff, body: { ...reportBody, attachments: [uploaded.data] } });
  assert.equal(draft.status, 201);
  assert.equal((await api(uploaded.data.url, { token: owner })).status, 404);
  await api(`/api/reports/${draft.data.id}/submit`, { method: 'POST', token: staff, body: {} });
  assert.equal((await api(uploaded.data.url, { token: owner })).status, 404);
  await api(`/api/reports/${draft.data.id}/publish`, { method: 'POST', token: admin, body: {} });
  assert.equal((await api(uploaded.data.url, { token: owner })).status, 200);
});

test('cached idempotent results do not bypass revoked vessel assignments', async t => {
  const { api, login } = await fixture(t);
  const owner = await login();
  const admin = await login('admin');
  const created = await api('/api/requests', { method: 'POST', token: owner, body: requestBody, key: 'before-unassign' });
  assert.equal(created.status, 201);
  const path = `/api/requests/${created.data.id}/messages`;
  assert.equal((await api(path, { method: 'POST', token: owner, body: { text: 'Message before unassignment' }, key: 'message-before-unassign' })).status, 201);
  assert.equal((await api('/api/admin/users/owner-1', { method: 'PATCH', token: admin, body: { vesselIds: ['vessel-solstice'] } })).status, 200);
  assert.equal((await api('/api/requests', { method: 'POST', token: owner, body: requestBody, key: 'before-unassign' })).status, 404);
  assert.equal((await api(path, { method: 'POST', token: owner, body: { text: 'Message before unassignment' }, key: 'message-before-unassign' })).status, 404);
});

test('admin invitation activates once; assignment updates and revocation apply to existing sessions', async t => {
  const { api, login } = await fixture(t);
  const admin = await login('admin');
  const owner = await login();
  const invitation = await api('/api/admin/invitations', { method: 'POST', token: admin, body: { name: 'Taylor Demo', email: 'taylor@example.test', role: 'owner', vesselIds: ['vessel-solstice'] } });
  assert.equal(invitation.status, 201);
  assert.equal(invitation.data.delivery, 'manual_demo_only');
  const activated = await api('/api/auth/accept-invite', { method: 'POST', body: { inviteToken: invitation.data.inviteToken, password: 'SecureHarbor!2026' } });
  assert.equal(activated.status, 201);
  assert.deepEqual((await api('/api/bootstrap', { token: activated.data.token })).data.vessels.map(vessel => vessel.id), ['vessel-solstice']);
  assert.equal((await api('/api/auth/accept-invite', { method: 'POST', body: { inviteToken: invitation.data.inviteToken, password: 'SecureHarbor!2026' } })).status, 400);
  assert.equal((await api('/api/admin/users/owner-1', { method: 'PATCH', token: admin, body: { vesselIds: ['vessel-solstice'] } })).status, 200);
  assert.deepEqual((await api('/api/bootstrap', { token: owner })).data.vessels.map(vessel => vessel.id), ['vessel-solstice']);
  assert.equal((await api('/api/documents/doc-serenity-inspection/download', { token: owner })).status, 404);
  assert.equal((await api('/api/admin/users/owner-1', { method: 'PATCH', token: admin, body: { active: false } })).status, 200);
  assert.equal((await api('/api/bootstrap', { token: owner })).status, 401);
  assert.equal((await api('/api/auth/login', { method: 'POST', body: { email: 'owner@demo.lasolas.test', password: DEMO_PASSWORD } })).status, 401);
});

test('reports and scheduled visits retain a same-vessel request link through publication and corrections', async t => {
  const { api, login } = await fixture(t);
  const staff = await login('staff');
  const admin = await login('admin');
  const owner = await login();
  const seeded = (await api('/api/bootstrap', { token: owner })).data;
  assert.equal(seeded.visits.find(visit => visit.id === 'visit-serenity-arrival').requestId, 'request-provisions');
  assert.equal(seeded.reports.find(report => report.id === 'report-solstice-systems').requestId, 'request-solstice-wash');
  const created = await api('/api/reports', { method: 'POST', token: staff, body: { ...reportBody, requestId: 'request-pump' } });
  assert.equal(created.status, 201);
  assert.equal(created.data.requestId, 'request-pump');
  const path = `/api/reports/${created.data.id}`;
  const edited = await api(path, { method: 'PATCH', token: staff, body: { summary: 'Linked work completed.' } });
  assert.equal(edited.data.requestId, 'request-pump');
  await api(`${path}/submit`, { method: 'POST', token: staff, body: {} });
  await api(`${path}/publish`, { method: 'POST', token: admin, body: {} });
  const visible = (await api('/api/bootstrap', { token: owner })).data.reports.find(report => report.id === created.data.id);
  assert.equal(visible.requestId, 'request-pump');
  const correction = await api(`${path}/revisions`, { method: 'POST', token: staff, body: {} });
  assert.equal(correction.data.requestId, 'request-pump');
  const visitBody = { vesselId: 'vessel-serenity', requestId: 'request-pump', title: 'Pump specialist appointment', date: '2026-10-20', time: '09:30', category: 'Maintenance & systems', assignedTo: 'Daniel Rivera' };
  const scheduled = await api('/api/visits', { method: 'POST', token: admin, body: visitBody });
  assert.equal(scheduled.status, 201);
  assert.equal(scheduled.data.requestId, 'request-pump');
  assert.equal((await api('/api/bootstrap', { token: owner })).data.visits.find(visit => visit.id === scheduled.data.id).requestId, 'request-pump');
  assert.equal((await api('/api/reports', { method: 'POST', token: admin, body: { ...reportBody, requestId: 'request-solstice-wash' } })).status, 400);
  assert.equal((await api('/api/reports', { method: 'POST', token: staff, body: { ...reportBody, requestId: 'request-aurora-private' } })).status, 400);
  assert.equal((await api('/api/reports', { method: 'POST', token: staff, body: { ...reportBody, requestId: 'request-missing' } })).status, 400);
  assert.equal((await api('/api/visits', { method: 'POST', token: admin, body: { ...visitBody, requestId: 'request-solstice-wash' } })).status, 400);
  assert.equal((await api('/api/visits', { method: 'POST', token: admin, body: { ...visitBody, requestId: 'request-missing' } })).status, 400);
});

test('management can onboard a demonstration vessel and explicitly assign an existing client', async t => {
  const { api, login } = await fixture(t);
  const admin = await login('admin');
  const owner = await login();
  const staff = await login('staff');
  const body = { name: 'Windward', model: 'Princess F55', length: '55 ft', location: 'Fort Lauderdale · Demo berth', program: 'Coastal Care', image: 'detail' };
  assert.equal((await api('/api/admin/vessels', { method: 'POST', token: owner, body })).status, 403);
  assert.equal((await api('/api/admin/vessels', { method: 'POST', token: staff, body })).status, 403);
  const created = await api('/api/admin/vessels', { method: 'POST', token: admin, body, key: 'new-vessel-1' });
  assert.equal(created.status, 201);
  assert.equal(created.data.name, 'Windward');
  assert.deepEqual((await api('/api/admin/vessels', { method: 'POST', token: admin, body, key: 'new-vessel-1' })).data, created.data);
  assert.equal((await api('/api/bootstrap', { token: admin })).data.vessels.some(vessel => vessel.id === created.data.id), true);
  assert.equal((await api('/api/bootstrap', { token: owner })).data.vessels.some(vessel => vessel.id === created.data.id), false);
  assert.equal((await api('/api/bootstrap', { token: staff })).data.vessels.some(vessel => vessel.id === created.data.id), false);
  await api('/api/admin/users/owner-1', { method: 'PATCH', token: admin, body: { vesselIds: ['vessel-serenity', 'vessel-solstice', created.data.id] } });
  assert.equal((await api('/api/bootstrap', { token: owner })).data.vessels.some(vessel => vessel.id === created.data.id), true);
  assert.equal((await api('/api/admin/vessels', { method: 'POST', token: admin, body: { ...body, image: 'external-url' } })).status, 400);
});

test('SQLite records, sessions and idempotency survive process restart', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'las-olas-api-'));
  const databasePath = join(directory, 'portal.sqlite');
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  let app = createPortalServer({ databasePath });
  let address = await app.listen(0);
  let base = `http://127.0.0.1:${address.port}`;
  const loggedIn = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'owner@demo.lasolas.test', password: DEMO_PASSWORD }) }).then(response => response.json());
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${loggedIn.token}`, 'Idempotency-Key': 'survives-restart' };
  const first = await fetch(`${base}/api/requests`, { method: 'POST', headers, body: JSON.stringify(requestBody) }).then(response => response.json());
  await app.close();
  app = createPortalServer({ databasePath });
  address = await app.listen(0);
  base = `http://127.0.0.1:${address.port}`;
  t.after(() => app.close());
  const data = await fetch(`${base}/api/bootstrap`, { headers }).then(response => response.json());
  assert.equal(data.requests.some(record => record.id === first.id), true);
  const retry = await fetch(`${base}/api/requests`, { method: 'POST', headers, body: JSON.stringify(requestBody) }).then(response => response.json());
  assert.equal(retry.id, first.id);
  assert.equal(app.db.prepare('SELECT count(*) AS count FROM users').get().count, 4);
});

test('browser origin and input validation reject untrusted or invalid requests', async t => {
  const { api, login } = await fixture(t);
  const token = await login();
  assert.equal((await api('/api/bootstrap', { token, headers: { Origin: 'https://untrusted.example' } })).status, 403);
  assert.equal((await api('/api/bootstrap', { token, headers: { Origin: 'http://localhost:8081' } })).headers.get('access-control-allow-origin'), 'http://localhost:8081');
  assert.equal((await api('/api/requests', { method: 'POST', token, body: { ...requestBody, category: 'Unknown' } })).status, 400);
  assert.equal((await api('/api/requests', { method: 'POST', token, body: { ...requestBody, desiredDate: '2026-02-30' } })).status, 400);
  assert.equal((await api('/api/requests', { method: 'POST', token, body: {} })).status, 400);
  assert.equal((await api('/api/requests', { method: 'POST', token, body: { ...requestBody, attachments: [{}] } })).status, 400);
});
