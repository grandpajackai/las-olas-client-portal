import { DatabaseSync } from 'node:sqlite';
import { createServer } from 'node:http';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEMO_PASSWORD, DEMO_AS_OF, demoUsers, seedRecords, checklistTemplates, sampleDocument, demoNotifications } from './seed.mjs';

const SERVER_DIR = dirname(fileURLToPath(import.meta.url));
const SESSION_LIFETIME = 7 * 24 * 60 * 60 * 1000;
const MAX_BODY = 4 * 1024 * 1024;
const MAX_ATTACHMENT = 2 * 1024 * 1024;
const CHECK_STATUSES = new Set(['passed', 'monitor', 'action', 'not_checked', 'not_applicable']);
const REQUEST_STATUSES = new Set(['submitted', 'acknowledged', 'scheduled', 'in_progress', 'completed']);
const CATEGORIES = new Set(checklistTemplates.map(template => template.category));
const MUTATING = new Set(['POST', 'PATCH', 'DELETE', 'PUT']);

class HttpError extends Error {
  constructor(status, message, code = 'request_error') { super(message); this.status = status; this.code = code; }
}
const fail = (status, message, code) => { throw new HttpError(status, message, code); };
const now = () => new Date().toISOString();
const hash = value => createHash('sha256').update(value).digest('hex');
const id = prefix => `${prefix}-${randomUUID()}`;
const clone = value => JSON.parse(JSON.stringify(value));
const asJSON = value => JSON.stringify(value);
function text(value, label, max = 500, optional = false) {
  if (optional && (value === undefined || value === null || value === '')) return undefined;
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail(400, `${label} must be between 1 and ${max} characters.`);
  return value.trim();
}
function date(value, label, optional = false) {
  if (optional && !value) return undefined;
  const result = text(value, label, 40);
  if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/.test(result) || !Number.isFinite(Date.parse(result))) fail(400, `${label} must be a valid ISO date.`);
  const parsed = new Date(result);
  if (parsed.toISOString().slice(0, 10) !== result.slice(0, 10)) fail(400, `${label} must be a real calendar date.`);
  return result;
}
function list(value, label, max = 50) {
  if (!Array.isArray(value) || value.length > max) fail(400, `${label} must be a list of at most ${max} items.`);
  return value;
}
function category(value) {
  if (!CATEGORIES.has(value)) fail(400, 'Choose one of the seven service categories.');
  return value;
}
function passwordHash(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
function passwordMatches(password, encoded) {
  const [salt, expected] = encoded.split(':');
  const actual = scryptSync(password, salt, 64);
  return timingSafeEqual(actual, Buffer.from(expected, 'hex'));
}
function safeFilename(value) { return value.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 100) || 'download'; }
function csvCell(value) {
  let result = String(value ?? '');
  // Prevent spreadsheet formulas from running when an exported CSV is opened.
  if (/^[=+\-@\t\r]/.test(result)) result = `'${result}`;
  return `"${result.replaceAll('"', '""')}"`;
}

export function createPortalServer(options = {}) {
  const databasePath = options.databasePath ?? process.env.PORTAL_DB ?? resolve(SERVER_DIR, 'data/portal.sqlite');
  if (databasePath !== ':memory:') mkdirSync(dirname(resolve(databasePath)), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, profile TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
    CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL, id TEXT NOT NULL, vessel_id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(kind, id));
    CREATE INDEX IF NOT EXISTS records_vessel ON records(vessel_id, kind);
    CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, vessel_id TEXT NOT NULL, content TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS attachments (id TEXT PRIMARY KEY, vessel_id TEXT NOT NULL, creator_id TEXT, name TEXT NOT NULL, mime_type TEXT NOT NULL, content BLOB NOT NULL);
    CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), vessel_id TEXT NOT NULL, data TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS notifications_user ON notifications(user_id);
    CREATE TABLE IF NOT EXISTS idempotency (user_id TEXT NOT NULL, key TEXT NOT NULL, fingerprint TEXT NOT NULL, response TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(user_id, key));
    CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, actor_id TEXT NOT NULL, action TEXT NOT NULL, record_id TEXT NOT NULL, at TEXT NOT NULL, details TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS invitations (id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, profile TEXT NOT NULL, expires_at INTEGER NOT NULL, accepted_at TEXT);
  `);
  if (!db.prepare('PRAGMA table_info(attachments)').all().some(column => column.name === 'creator_id')) db.exec('ALTER TABLE attachments ADD COLUMN creator_id TEXT');

  const getRecord = (kind, recordId) => {
    if (typeof recordId !== 'string') return undefined;
    const row = db.prepare('SELECT data FROM records WHERE kind = ? AND id = ?').get(kind, recordId);
    return row ? JSON.parse(row.data) : undefined;
  };
  const allRecords = kind => db.prepare('SELECT data FROM records WHERE kind = ?').all(kind).map(row => JSON.parse(row.data));
  const putRecord = (kind, record) => {
    db.prepare('INSERT INTO records(kind, id, vessel_id, data) VALUES(?, ?, ?, ?) ON CONFLICT(kind, id) DO UPDATE SET vessel_id=excluded.vessel_id, data=excluded.data').run(kind, record.id, record.vesselId ?? record.id, asJSON(record));
    return record;
  };
  const audit = (user, action, record, details = {}) => db.prepare('INSERT INTO audit(actor_id, action, record_id, at, details) VALUES(?, ?, ?, ?, ?)').run(user.id, action, record.id, now(), asJSON(details));
  function transaction(callback) {
    db.exec('BEGIN IMMEDIATE');
    try { const result = callback(); db.exec('COMMIT'); return result; } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  if (!db.prepare('SELECT value FROM metadata WHERE key = ?').get('seed_version')) {
    transaction(() => {
      const credential = passwordHash(DEMO_PASSWORD);
      for (const user of demoUsers) db.prepare('INSERT INTO users(id, email, password_hash, profile) VALUES(?, ?, ?, ?)').run(user.id, user.email, credential, asJSON(user));
      for (const [kind, records] of Object.entries(seedRecords)) for (const record of records) putRecord(kind, record);
      for (const document of seedRecords.documents) db.prepare('INSERT INTO documents(id, vessel_id, content) VALUES(?, ?, ?)').run(document.id, document.vesselId, sampleDocument(document));
      for (const user of demoUsers) for (const notification of demoNotifications(user)) db.prepare('INSERT INTO notifications(id, user_id, vessel_id, data) VALUES(?, ?, ?, ?)').run(notification.id, user.id, notification.vesselId, asJSON(notification));
      db.prepare('INSERT INTO metadata(key, value) VALUES(?, ?)').run('seed_version', '1');
    });
  }

  function authenticate(request) {
    const match = /^Bearer ([a-zA-Z0-9_-]{43})$/.exec(request.headers.authorization ?? '');
    if (!match) fail(401, 'Sign in to continue.', 'unauthorized');
    const tokenHash = hash(match[1]);
    const row = db.prepare('SELECT u.profile, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND u.active = 1').get(tokenHash);
    if (!row || row.expires_at <= Date.now()) fail(401, 'Your session has ended. Please sign in again.', 'session_expired');
    return { user: JSON.parse(row.profile), tokenHash };
  }
  function session(user) {
    const token = randomBytes(32).toString('base64url');
    db.prepare('INSERT INTO sessions(token_hash, user_id, expires_at) VALUES(?, ?, ?)').run(hash(token), user.id, Date.now() + SESSION_LIFETIME);
    return { token, user };
  }
  const requireRole = (user, ...roles) => { if (!roles.includes(user.role)) fail(403, 'Your role does not have permission for this action.', 'forbidden'); };
  const canAccess = (user, vesselId) => user.role === 'admin' || user.vesselIds.includes(vesselId);
  function vessel(user, vesselId) {
    text(vesselId, 'Vessel ID', 120);
    const record = getRecord('vessels', vesselId);
    if (!record || !canAccess(user, vesselId)) fail(404, 'Vessel not found or not assigned to your account.', 'not_found');
    return record;
  }
  function scoped(user, kind, recordId) {
    const record = getRecord(kind, recordId);
    if (!record || !canAccess(user, record.vesselId)) fail(404, 'Record not found or not assigned to your account.', 'not_found');
    if (kind === 'reports' && user.role === 'owner' && record.status !== 'published') fail(404, 'Report not found.', 'not_found');
    return record;
  }
  function relatedRequest(user, vesselId, requestId) {
    const record = getRecord('requests', text(requestId, 'Related request ID', 120));
    if (!record || !canAccess(user, record.vesselId) || record.vesselId !== vesselId) fail(400, 'The related request must be an available request for the same vessel.');
    return record;
  }
  function visibleReport(user, report) {
    const result = clone(report);
    if (user.role === 'owner') delete result.internalNotes;
    return result;
  }
  function attachmentVisible(user, row) {
    if (!row || !canAccess(user, row.vessel_id)) return false;
    if (user.role !== 'owner' || row.creator_id === user.id) return true;
    return allRecords('requests').some(record => record.vesselId === row.vessel_id && record.attachments.some(item => item.id === row.id))
      || allRecords('reports').some(record => record.vesselId === row.vessel_id && record.status === 'published' && record.attachments.some(item => item.id === row.id));
  }
  function attachments(user, vesselId, values = []) {
    return list(values, 'Attachments', 8).map(value => {
      const attachmentId = typeof value === 'string' ? value : value?.id;
      if (typeof attachmentId !== 'string') fail(400, 'Every attachment needs a valid uploaded file ID.');
      const row = db.prepare('SELECT id, name, mime_type, vessel_id, creator_id FROM attachments WHERE id = ?').get(attachmentId);
      if (row && row.vessel_id === vesselId && attachmentVisible(user, row)) return { id: row.id, name: row.name, kind: row.mime_type, url: `/api/attachments/${row.id}/download` };
      const document = getRecord('documents', attachmentId);
      if (document?.vesselId === vesselId && canAccess(user, vesselId)) return { id: document.id, name: `${document.title}.txt`, kind: 'text/plain', url: `/api/documents/${document.id}/download` };
      fail(400, 'One or more attachments are unavailable for this vessel.');
    });
  }
  function notify(vesselId, title, body, type, exceptUserId) {
    const preference = type === 'report' ? 'reports' : type === 'reminder' ? 'reminders' : ['message', 'request', 'approval'].includes(type) ? 'messages' : undefined;
    for (const row of db.prepare('SELECT profile FROM users WHERE active = 1').all()) {
      const user = JSON.parse(row.profile);
      if (user.id === exceptUserId || !canAccess(user, vesselId)) continue;
      if (preference && user.preferences?.[preference] === false) continue;
      const notification = { id: id('notification'), vesselId, title, body, createdAt: now(), read: false, type };
      db.prepare('INSERT INTO notifications(id, user_id, vessel_id, data) VALUES(?, ?, ?, ?)').run(notification.id, user.id, vesselId, asJSON(notification));
    }
  }
  function touchVessel(vesselId) {
    const record = getRecord('vessels', vesselId);
    record.lastUpdated = now();
    putRecord('vessels', record);
  }
  function bootstrap(user) {
    const accessible = kind => allRecords(kind).filter(record => canAccess(user, record.vesselId));
    const notifications = db.prepare('SELECT data FROM notifications WHERE user_id = ? ORDER BY rowid DESC').all(user.id).map(row => JSON.parse(row.data)).filter(record => canAccess(user, record.vesselId));
    return {
      user, vessels: allRecords('vessels').filter(record => canAccess(user, record.id)),
      reports: accessible('reports').filter(report => user.role !== 'owner' || report.status === 'published').map(report => visibleReport(user, report)).sort((a, b) => b.performedAt.localeCompare(a.performedAt)),
      requests: accessible('requests').sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      estimates: accessible('estimates'),
      visits: accessible('visits').sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)),
      documents: accessible('documents'), notifications, checklistTemplates,
    };
  }
  function reportFields(user, vesselId, body, previous) {
    const next = { ...previous };
    if (body.requestId !== undefined) {
      next.requestId = relatedRequest(user, vesselId, body.requestId).id;
    }
    if (body.title !== undefined || !previous) next.title = text(body.title, 'Report title', 160);
    if (body.category !== undefined || !previous) next.category = category(body.category);
    if (body.performedAt !== undefined || !previous) next.performedAt = date(body.performedAt, 'Performed date');
    if (body.summary !== undefined || !previous) next.summary = text(body.summary ?? 'Work entry awaiting completion.', 'Summary', 5000);
    if (body.checks !== undefined || !previous) next.checks = list(body.checks ?? [], 'Checks', 80).map(check => {
      if (!check || !CHECK_STATUSES.has(check.status)) fail(400, 'Every check needs a valid recorded status.');
      return { label: text(check.label, 'Check label', 200), status: check.status, ...(check.value ? { value: text(check.value, 'Check reading', 600) } : {}), ...(check.equipment ? { equipment: text(check.equipment, 'Equipment reference', 200) } : {}) };
    });
    if (body.workPerformed !== undefined || !previous) next.workPerformed = list(body.workPerformed ?? [], 'Work performed', 80).map(item => text(item, 'Work performed', 1200));
    const notesLimit = previous ? Math.max(5000, (previous.internalNotes?.length ?? 0) + 1000) : 5000;
    if (body.internalNotes !== undefined || !previous) next.internalNotes = typeof body.internalNotes === 'string' && body.internalNotes.trim() ? text(body.internalNotes, 'Internal notes', notesLimit) : '';
    if (body.attachments !== undefined || !previous) next.attachments = attachments(user, vesselId, body.attachments ?? []);
    return next;
  }
  function download(content, filename, contentType = 'text/plain; charset=utf-8') {
    return { status: 200, raw: content, headers: { 'Content-Type': contentType, 'Content-Disposition': `attachment; filename="${safeFilename(filename)}"` } };
  }
  function match(path, pattern) { return pattern.exec(path); }

  function route(user, tokenHash, method, path, body) {
    let matched;
    if (method === 'GET' && path === '/api/bootstrap') return { status: 200, data: bootstrap(user) };
    if (method === 'POST' && path === '/api/auth/logout') {
      db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
      return { status: 200, data: { ok: true } };
    }
    if (method === 'GET' && (matched = match(path, /^\/api\/documents\/([^/]+)\/download$/))) {
      const document = scoped(user, 'documents', matched[1]);
      const row = db.prepare('SELECT content FROM documents WHERE id = ?').get(document.id);
      if (!row) fail(404, 'Document content is unavailable.');
      return download(row.content, `${document.title}.txt`);
    }
    if (method === 'GET' && (matched = match(path, /^\/api\/attachments\/([^/]+)\/download$/))) {
      const row = db.prepare('SELECT * FROM attachments WHERE id = ?').get(matched[1]);
      if (!attachmentVisible(user, row)) fail(404, 'Attachment not found.', 'not_found');
      return download(Buffer.from(row.content), row.name, row.mime_type);
    }
    if (method === 'GET' && (matched = match(path, /^\/api\/export\/([^/]+)$/))) {
      const record = vessel(user, matched[1]);
      const reports = allRecords('reports').filter(report => report.vesselId === record.id && report.status === 'published');
      const rows = [['Demo service history — recorded observations only', record.name], ['Report ID', 'Vessel', 'Title', 'Category', 'Performed at', 'Recorded at', 'Author', 'Revision', 'Summary', 'Checks', 'Work performed']];
      for (const report of reports) rows.push([report.id, record.name, report.title, report.category, report.performedAt, report.recordedAt, report.author, report.revision, report.summary, report.checks.map(check => `${check.label}: ${check.status}${check.value ? ` (${check.value})` : ''}`).join('; '), report.workPerformed.join('; ')]);
      return download(`\uFEFF${rows.map(row => row.map(csvCell).join(',')).join('\r\n')}\r\n`, `${record.name}-demo-service-history.csv`, 'text/csv; charset=utf-8');
    }
    if (method === 'POST' && path === '/api/attachments') {
      vessel(user, body.vesselId);
      const name = text(body.name, 'File name', 150);
      if (!['image/jpeg', 'image/png'].includes(body.mimeType)) fail(400, 'Upload a JPEG or PNG image.');
      if (typeof body.dataBase64 !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(body.dataBase64)) fail(400, 'Image must be valid base64 data.');
      const content = Buffer.from(body.dataBase64, 'base64');
      if (content.length < 12 || content.length > MAX_ATTACHMENT) fail(413, 'Images must be between 12 bytes and 2 MB.');
      if ((body.mimeType === 'image/png' && !content.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) || (body.mimeType === 'image/jpeg' && !(content[0] === 255 && content[1] === 216 && content[2] === 255))) fail(400, 'Image content does not match the declared image type.');
      const attachment = { id: id('attachment'), name, kind: body.mimeType };
      attachment.url = `/api/attachments/${attachment.id}/download`;
      db.prepare('INSERT INTO attachments(id, vessel_id, creator_id, name, mime_type, content) VALUES(?, ?, ?, ?, ?, ?)').run(attachment.id, body.vesselId, user.id, name, body.mimeType, content);
      audit(user, 'attachment.uploaded', attachment, { vesselId: body.vesselId, bytes: content.length });
      return { status: 201, data: attachment };
    }
    if (method === 'POST' && path === '/api/requests') {
      vessel(user, body.vesselId);
      if (!['routine', 'soon', 'urgent'].includes(body.priority)) fail(400, 'Choose a valid request priority.');
      const request = { id: id('request'), vesselId: body.vesselId, title: text(body.title, 'Request title', 160), description: text(body.description, 'Request description', 6000), category: category(body.category), priority: body.priority, status: 'submitted', coordinator: 'Unassigned', createdAt: now(), messages: [], attachments: attachments(user, body.vesselId, body.attachments ?? []) };
      const desiredDate = date(body.desiredDate, 'Desired date', true);
      if (desiredDate) request.desiredDate = desiredDate;
      putRecord('requests', request);
      audit(user, 'request.created', request);
      notify(request.vesselId, 'A service request was submitted', request.title, 'request', user.id);
      return { status: 201, data: request };
    }
    if (method === 'PATCH' && (matched = match(path, /^\/api\/requests\/([^/]+)$/))) {
      requireRole(user, 'staff', 'admin');
      const request = scoped(user, 'requests', matched[1]);
      if (!REQUEST_STATUSES.has(body.status)) fail(400, 'Choose a valid request status.');
      const previousStatus = request.status;
      request.status = body.status;
      if (body.coordinator !== undefined) request.coordinator = text(body.coordinator, 'Coordinator', 120);
      putRecord('requests', request);
      audit(user, 'request.status_changed', request, { previousStatus, status: request.status });
      notify(request.vesselId, 'Service request updated', `${request.title}: ${request.status.replaceAll('_', ' ')}`, 'request', user.id);
      return { status: 200, data: request };
    }
    if (method === 'POST' && (matched = match(path, /^\/api\/requests\/([^/]+)\/messages$/))) {
      const request = scoped(user, 'requests', matched[1]);
      const message = { id: id('message'), author: user.name, text: text(body.text, 'Message', 6000), createdAt: now() };
      request.messages.push(message);
      putRecord('requests', request);
      audit(user, 'request.message_added', request, { messageId: message.id });
      notify(request.vesselId, 'A new service message', `${user.name}: ${message.text.slice(0, 140)}`, 'message', user.id);
      return { status: 201, data: message };
    }
    if (method === 'POST' && (matched = match(path, /^\/api\/estimates\/([^/]+)\/decision$/))) {
      requireRole(user, 'owner');
      const estimate = scoped(user, 'estimates', matched[1]);
      if (!['approved', 'declined'].includes(body.decision)) fail(400, 'Choose approved or declined.');
      if (body.version !== estimate.version || estimate.supersededBy) fail(409, 'This estimate has changed. Refresh and review the current scope before deciding.', 'stale_estimate');
      if (estimate.status !== 'pending') fail(409, 'A decision is already recorded for this estimate version.', 'decision_recorded');
      estimate.status = body.decision;
      estimate.decidedBy = user.name;
      estimate.decidedByUserId = user.id;
      estimate.decidedAt = now();
      putRecord('estimates', estimate);
      audit(user, 'estimate.decided', estimate, { version: estimate.version, decision: body.decision, amount: estimate.amount, currency: estimate.currency, scope: estimate.scope });
      notify(estimate.vesselId, `Estimate ${body.decision}`, estimate.title, 'approval', user.id);
      return { status: 200, data: estimate };
    }
    if (method === 'POST' && path === '/api/estimates') {
      requireRole(user, 'admin');
      vessel(user, body.vesselId);
      if (typeof body.amount !== 'number' || !Number.isFinite(body.amount) || body.amount <= 0 || body.amount > 100000000) fail(400, 'Estimate amount must be a positive number.');
      const roundedAmount = Math.round(body.amount * 100) / 100;
      if (roundedAmount < 0.01) fail(400, 'Estimate amount must be at least 0.01.');
      const currency = body.currency ?? 'USD';
      if (!/^[A-Z]{3}$/.test(currency)) fail(400, 'Currency must be a three-letter uppercase currency code.');
      if (body.requestId) {
        relatedRequest(user, body.vesselId, body.requestId);
      }
      const previous = body.supersedesId ? scoped(user, 'estimates', body.supersedesId) : undefined;
      if (previous && (previous.vesselId !== body.vesselId || previous.supersededBy)) fail(409, 'Revise the current estimate for the same vessel.');
      if (previous?.requestId && body.requestId !== undefined && body.requestId !== previous.requestId) fail(400, 'A revised estimate must stay linked to the original request. Create a separate estimate for other work.');
      const scope = list(body.scope, 'Estimate scope', 40).map(item => text(item, 'Scope item', 1200));
      if (!scope.length) fail(400, 'Add at least one scope item.');
      const estimate = { id: id('estimate'), vesselId: body.vesselId, title: text(body.title, 'Estimate title', 180), amount: roundedAmount, currency, scope, version: previous ? previous.version + 1 : 1, status: 'pending', createdAt: now(), createdBy: user.id };
      if (body.requestId ?? previous?.requestId) estimate.requestId = body.requestId ?? previous.requestId;
      if (previous) {
        estimate.supersedesId = previous.id;
        previous.supersededBy = estimate.id;
        putRecord('estimates', previous);
      }
      putRecord('estimates', estimate);
      audit(user, 'estimate.created', estimate, { supersedesId: previous?.id });
      notify(estimate.vesselId, 'An estimate is ready for review', `${estimate.title} · Version ${estimate.version}`, 'approval', user.id);
      return { status: 201, data: estimate };
    }
    if (method === 'POST' && path === '/api/reports') {
      requireRole(user, 'staff', 'admin');
      vessel(user, body.vesselId);
      const report = { ...reportFields(user, body.vesselId, body), id: id('report'), vesselId: body.vesselId, status: 'draft', recordedAt: now(), author: user.name, authorId: user.id, revision: 1 };
      putRecord('reports', report);
      audit(user, 'report.created', report);
      return { status: 201, data: report };
    }
    if (method === 'PATCH' && (matched = match(path, /^\/api\/reports\/([^/]+)$/))) {
      requireRole(user, 'staff', 'admin');
      const report = scoped(user, 'reports', matched[1]);
      if (report.status !== 'draft') fail(409, 'Only draft reports can be edited. Create a correction revision for a published report.', 'report_immutable');
      if (body.expectedRecordedAt && body.expectedRecordedAt !== report.recordedAt) fail(409, 'This draft was updated elsewhere. Refresh before saving.', 'draft_conflict');
      const updatedAt = new Date(Math.max(Date.now(), Date.parse(report.recordedAt) + 1)).toISOString();
      const updated = { ...reportFields(user, report.vesselId, body, report), recordedAt: updatedAt, lastEditedBy: user.id };
      putRecord('reports', updated);
      audit(user, 'report.draft_updated', report, { before: report, after: updated });
      return { status: 200, data: updated };
    }
    if (method === 'POST' && (matched = match(path, /^\/api\/reports\/([^/]+)\/submit$/))) {
      requireRole(user, 'staff', 'admin');
      const report = scoped(user, 'reports', matched[1]);
      if (report.status !== 'draft') fail(409, 'Only drafts can be submitted for management review.');
      if (!report.checks.length && !report.workPerformed.length) fail(400, 'Record at least one check or completed work item before submitting.');
      report.status = 'review';
      report.submittedAt = now();
      report.submittedBy = user.id;
      putRecord('reports', report);
      audit(user, 'report.submitted', report);
      // Draft and review information is intentionally never sent to owner notifications.
      for (const row of db.prepare('SELECT profile FROM users WHERE active = 1').all()) {
        const manager = JSON.parse(row.profile);
        if (manager.role !== 'admin') continue;
        const notification = { id: id('notification'), vesselId: report.vesselId, title: 'A report needs review', body: report.title, createdAt: now(), read: false, type: 'review' };
        db.prepare('INSERT INTO notifications(id, user_id, vessel_id, data) VALUES(?, ?, ?, ?)').run(notification.id, manager.id, report.vesselId, asJSON(notification));
      }
      return { status: 200, data: report };
    }
    if (method === 'POST' && (matched = match(path, /^\/api\/reports\/([^/]+)\/return$/))) {
      requireRole(user, 'admin');
      const report = scoped(user, 'reports', matched[1]);
      if (report.status !== 'review') fail(409, 'Only reports awaiting management review can be returned for updates.');
      const reason = text(body.reason, 'Review feedback', 1000);
      const returnedAt = now();
      report.status = 'draft';
      report.recordedAt = new Date(Math.max(Date.now(), Date.parse(report.recordedAt) + 1)).toISOString();
      report.internalNotes = `${report.internalNotes ?? ''}${report.internalNotes ? '\n\n' : ''}Management review · ${returnedAt} · ${user.name}\n${reason}`;
      report.returnedAt = returnedAt;
      report.returnedBy = user.id;
      putRecord('reports', report);
      audit(user, 'report.returned_for_updates', report, { reason, from: 'review', to: 'draft' });
      for (const row of db.prepare('SELECT profile FROM users WHERE active = 1').all()) {
        const staff = JSON.parse(row.profile);
        if (staff.role !== 'staff' || !canAccess(staff, report.vesselId)) continue;
        const notification = { id: id('notification'), vesselId: report.vesselId, title: 'A report was returned for updates', body: report.title, createdAt: returnedAt, read: false, type: 'review' };
        db.prepare('INSERT INTO notifications(id, user_id, vessel_id, data) VALUES(?, ?, ?, ?)').run(notification.id, staff.id, report.vesselId, asJSON(notification));
      }
      return { status: 200, data: report };
    }
    if (method === 'POST' && (matched = match(path, /^\/api\/reports\/([^/]+)\/publish$/))) {
      requireRole(user, 'admin');
      const report = scoped(user, 'reports', matched[1]);
      if (report.status !== 'review') fail(409, 'Submit the report for review before publishing.');
      report.status = 'published';
      report.publishedAt = now();
      report.publishedBy = user.id;
      putRecord('reports', report);
      const document = { id: `doc-${report.id}`, vesselId: report.vesselId, title: `${report.title} · Revision ${report.revision}`, category: 'Inspection reports', date: report.performedAt.slice(0, 10), size: 'Text record' };
      const content = `LAS OLAS YACHT MANAGEMENT\nDEMONSTRATION SERVICE REPORT\n\n${report.title}\nRevision: ${report.revision}\nPerformed: ${report.performedAt}\nRecorded: ${report.recordedAt}\nAuthor: ${report.author}\n\n${report.summary}\n\nRecorded checks\n${report.checks.map(check => `- ${check.label}: ${check.status}${check.value ? ` — ${check.value}` : ''}${check.equipment ? ` [${check.equipment}]` : ''}`).join('\n')}\n\nWork performed\n${report.workPerformed.map(item => `- ${item}`).join('\n')}\n\nRecorded observations only, not live telemetry. Demonstration data.\n`;
      putRecord('documents', document);
      db.prepare('INSERT INTO documents(id, vessel_id, content) VALUES(?, ?, ?)').run(document.id, document.vesselId, content);
      touchVessel(report.vesselId);
      audit(user, 'report.published', report);
      notify(report.vesselId, 'A new service report is ready', report.title, 'report', user.id);
      return { status: 200, data: report };
    }
    if (method === 'POST' && (matched = match(path, /^\/api\/reports\/([^/]+)\/revisions$/))) {
      requireRole(user, 'staff', 'admin');
      const original = scoped(user, 'reports', matched[1]);
      if (original.status !== 'published') fail(409, 'Corrections must start from a published report.');
      if (allRecords('reports').some(report => report.rootReportId === (original.rootReportId ?? original.id) && report.status !== 'published')) fail(409, 'A correction draft is already in progress for this report.');
      const rootReportId = original.rootReportId ?? original.id;
      const revisions = allRecords('reports').filter(report => report.id === rootReportId || report.rootReportId === rootReportId);
      if (original.revision !== Math.max(...revisions.map(item => item.revision))) fail(409, 'A newer report revision is available. Open the latest revision before creating a correction.', 'stale_report_revision');
      const report = { ...reportFields(user, original.vesselId, body, original), id: id('report'), status: 'draft', recordedAt: now(), author: user.name, authorId: user.id, revision: Math.max(...revisions.map(item => item.revision)) + 1, rootReportId, correctsReportId: original.id };
      for (const key of ['submittedAt', 'submittedBy', 'publishedAt', 'publishedBy', 'lastEditedBy']) delete report[key];
      putRecord('reports', report);
      audit(user, 'report.correction_created', report, { correctsReportId: original.id });
      return { status: 201, data: report };
    }
    if (method === 'POST' && path === '/api/visits') {
      requireRole(user, 'admin');
      vessel(user, body.vesselId);
      const visitDate = date(body.date, 'Visit date');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(visitDate)) fail(400, 'Visit date must use YYYY-MM-DD.');
      const time = text(body.time, 'Visit time', 5);
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) fail(400, 'Visit time must use HH:MM.');
      const visit = { id: id('visit'), vesselId: body.vesselId, title: text(body.title, 'Visit title', 160), date: visitDate, time, category: category(body.category), assignedTo: text(body.assignedTo, 'Assigned staff', 120), status: 'scheduled' };
      if (body.requestId !== undefined) {
        visit.requestId = relatedRequest(user, visit.vesselId, body.requestId).id;
      }
      if (body.notes) visit.notes = text(body.notes, 'Visit notes', 3000);
      putRecord('visits', visit);
      audit(user, 'visit.created', visit);
      notify(visit.vesselId, 'A service visit is scheduled', `${visit.title} · ${visit.date} at ${visit.time}`, 'reminder', user.id);
      return { status: 201, data: visit };
    }
    if (method === 'PATCH' && (matched = match(path, /^\/api\/visits\/([^/]+)$/))) {
      requireRole(user, 'admin');
      const visit = scoped(user, 'visits', matched[1]);
      if (body.expectedUpdatedAt !== undefined && body.expectedUpdatedAt !== visit.updatedAt) fail(409, 'This visit was updated elsewhere. Refresh before saving.', 'visit_conflict');
      const previous = clone(visit);
      if (body.date !== undefined) {
        visit.date = date(body.date, 'Visit date');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(visit.date)) fail(400, 'Visit date must use YYYY-MM-DD.');
      }
      if (body.time !== undefined) {
        visit.time = text(body.time, 'Visit time', 5);
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(visit.time)) fail(400, 'Visit time must use HH:MM.');
      }
      if (body.assignedTo !== undefined) visit.assignedTo = text(body.assignedTo, 'Assigned staff', 120);
      if (body.notes !== undefined) visit.notes = text(body.notes, 'Visit notes', 3000, true) ?? '';
      if (body.status !== undefined) {
        if (!['scheduled', 'completed', 'cancelled'].includes(body.status)) fail(400, 'Choose scheduled, completed or cancelled for the visit.');
        visit.status = body.status;
      }
      visit.updatedAt = new Date(Math.max(Date.now(), (Date.parse(visit.updatedAt ?? '') || 0) + 1)).toISOString();
      putRecord('visits', visit);
      audit(user, 'visit.updated', visit, { before: previous, after: visit });
      const title = visit.status === 'cancelled' ? 'A service visit was cancelled' : visit.status === 'completed' ? 'A service visit was marked complete' : 'A service visit was updated';
      notify(visit.vesselId, title, `${visit.title} · ${visit.date} at ${visit.time}`, 'reminder', user.id);
      return { status: 200, data: visit };
    }
    if (method === 'PATCH' && path === '/api/preferences') {
      const preferences = { ...user.preferences };
      for (const key of ['reports', 'messages', 'reminders']) if (body[key] !== undefined) {
        if (typeof body[key] !== 'boolean') fail(400, 'Notification preferences must be true or false.');
        preferences[key] = body[key];
      }
      const updated = { ...user, preferences };
      db.prepare('UPDATE users SET profile = ? WHERE id = ?').run(asJSON(updated), user.id);
      audit(user, 'preferences.updated', user, { preferences });
      return { status: 200, data: updated };
    }
    if (method === 'POST' && (matched = match(path, /^\/api\/notifications\/([^/]+)\/read$/))) {
      const row = db.prepare('SELECT data FROM notifications WHERE id = ? AND user_id = ?').get(matched[1], user.id);
      if (!row) fail(404, 'Notification not found.');
      const notification = JSON.parse(row.data);
      if (!canAccess(user, notification.vesselId)) fail(404, 'Notification not found.');
      notification.read = true;
      db.prepare('UPDATE notifications SET data = ? WHERE id = ? AND user_id = ?').run(asJSON(notification), notification.id, user.id);
      return { status: 200, data: notification };
    }
    if (method === 'GET' && path === '/api/admin/access') {
      requireRole(user, 'admin');
      const users = db.prepare('SELECT profile, active FROM users').all().map(row => ({ ...JSON.parse(row.profile), active: Boolean(row.active) }));
      const invitations = db.prepare('SELECT id, profile, expires_at, accepted_at FROM invitations').all().map(row => ({ id: row.id, ...JSON.parse(row.profile), expiresAt: new Date(row.expires_at).toISOString(), acceptedAt: row.accepted_at }));
      return { status: 200, data: { users, invitations } };
    }
    if (method === 'POST' && path === '/api/admin/vessels') {
      requireRole(user, 'admin');
      if (!['ocean', 'detail'].includes(body.image)) fail(400, 'Choose ocean or detail for the demonstration vessel image.');
      const record = { id: id('vessel'), name: text(body.name, 'Vessel name', 120), model: text(body.model, 'Vessel model', 120), length: text(body.length, 'Vessel length', 40), location: text(body.location, 'Vessel location', 240), program: text(body.program, 'Care program', 120), image: body.image, lastUpdated: now() };
      putRecord('vessels', record);
      audit(user, 'vessel.created', record);
      return { status: 201, data: record };
    }
    if (method === 'POST' && path === '/api/admin/invitations') {
      requireRole(user, 'admin');
      const email = text(body.email, 'Email', 254).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Enter a valid email address.');
      if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) fail(409, 'An account already exists for that email.');
      if (!['owner', 'staff', 'admin'].includes(body.role)) fail(400, 'Choose owner, staff or admin.');
      const vesselIds = [...new Set(list(body.vesselIds, 'Assigned vessels', 100).map(value => vessel(user, value).id))];
      if (!vesselIds.length && body.role !== 'admin') fail(400, 'Assign at least one vessel.');
      const profile = { name: text(body.name, 'Name', 120), email, role: body.role, vesselIds };
      const invitationId = id('invitation');
      const inviteToken = randomBytes(32).toString('base64url');
      const expiresAt = Date.now() + 48 * 60 * 60 * 1000;
      db.prepare('INSERT INTO invitations(id, token_hash, profile, expires_at) VALUES(?, ?, ?, ?)').run(invitationId, hash(inviteToken), asJSON(profile), expiresAt);
      audit(user, 'invitation.created', { id: invitationId }, profile);
      return { status: 201, data: { id: invitationId, ...profile, inviteToken, expiresAt: new Date(expiresAt).toISOString(), delivery: 'manual_demo_only' } };
    }
    if (method === 'PATCH' && (matched = match(path, /^\/api\/admin\/users\/([^/]+)$/))) {
      requireRole(user, 'admin');
      const row = db.prepare('SELECT profile, active FROM users WHERE id = ?').get(matched[1]);
      if (!row) fail(404, 'User not found.');
      const target = JSON.parse(row.profile);
      if (body.vesselIds !== undefined) target.vesselIds = [...new Set(list(body.vesselIds, 'Assigned vessels', 100).map(value => vessel(user, value).id))];
      const active = body.active === undefined ? Boolean(row.active) : body.active;
      if (typeof active !== 'boolean') fail(400, 'Account active status must be true or false.');
      if (target.id === user.id && !active) fail(400, 'Use a different administrator to revoke this account.');
      db.prepare('UPDATE users SET profile = ?, active = ? WHERE id = ?').run(asJSON(target), Number(active), target.id);
      if (!active) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(target.id);
      audit(user, 'user.access_updated', target, { active, vesselIds: target.vesselIds });
      return { status: 200, data: { ...target, active } };
    }
    fail(404, 'API route not found.', 'not_found');
  }

  const loginAttempts = new Map();
  const allowedOrigins = options.allowedOrigins ?? (process.env.CORS_ORIGINS ?? '').split(',').map(value => value.trim()).filter(Boolean);
  function originAllowed(origin) { return !origin || allowedOrigins.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin); }
  function corsHeaders(origin) {
    return { ...(origin && originAllowed(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}), 'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS', 'Access-Control-Allow-Headers': 'Authorization,Content-Type,Idempotency-Key,X-Idempotency-Key', 'Access-Control-Expose-Headers': 'Content-Disposition' };
  }
  async function readBody(request) {
    let length = 0;
    const chunks = [];
    for await (const chunk of request) {
      length += chunk.length;
      if (length > MAX_BODY) fail(413, 'This upload is too large. Use an image under 2 MB.');
      chunks.push(chunk);
    }
    if (!length) return {};
    if (!(request.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) fail(415, 'Send JSON using Content-Type: application/json.');
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!body || Array.isArray(body) || typeof body !== 'object') fail(400, 'Send a JSON object.');
      return body;
    } catch (error) {
      if (error instanceof HttpError) throw error;
      fail(400, 'Request body contains invalid JSON.');
    }
  }
  function respond(response, result, origin) {
    response.writeHead(result.status ?? 200, { ...corsHeaders(origin), 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', ...result.headers });
    response.end(result.raw ?? asJSON(result.data));
  }
  const http = createServer(async (request, response) => {
    const origin = request.headers.origin;
    try {
      if (!originAllowed(origin)) fail(403, 'This browser origin is not allowed. Configure CORS_ORIGINS for this development client.');
      if (request.method === 'OPTIONS') return respond(response, { status: 204, raw: '' }, origin);
      const path = new URL(request.url, 'http://localhost').pathname;
      const method = request.method;
      if (method === 'GET' && path === '/health') return respond(response, { data: { ok: true, demo: true, service: 'Las Olas Client Portal', demoAsOf: DEMO_AS_OF, time: now() } }, origin);
      const body = MUTATING.has(method) ? await readBody(request) : {};
      if (method === 'POST' && path === '/api/auth/login') {
        const address = request.socket.remoteAddress ?? 'local';
        let attempts = loginAttempts.get(address);
        if (!attempts || attempts.until <= Date.now()) { attempts = { count: 0, until: Date.now() + 15 * 60 * 1000 }; loginAttempts.set(address, attempts); }
        if (attempts.count >= 15) fail(429, 'Too many sign-in attempts. Try again in 15 minutes.', 'rate_limited');
        const email = text(body.email, 'Email', 254).toLowerCase();
        const password = text(body.password, 'Password', 512);
        const row = db.prepare('SELECT id, password_hash, profile FROM users WHERE email = ? AND active = 1').get(email);
        // Always run the same expensive check, including unknown accounts.
        const credential = row?.password_hash ?? db.prepare('SELECT password_hash FROM users LIMIT 1').get().password_hash;
        const valid = passwordMatches(password, credential);
        if (!row || !valid) { attempts.count += 1; fail(401, 'Email or password is incorrect.', 'invalid_credentials'); }
        attempts.count = 0;
        return respond(response, { status: 200, data: transaction(() => session(JSON.parse(row.profile))) }, origin);
      }
      if (method === 'POST' && path === '/api/auth/accept-invite') {
        const inviteToken = text(body.inviteToken, 'Invitation token', 100);
        const password = text(body.password, 'Password', 512);
        if (password.length < 12) fail(400, 'Choose a password with at least 12 characters.');
        const result = transaction(() => {
          const invitation = db.prepare('SELECT * FROM invitations WHERE token_hash = ?').get(hash(inviteToken));
          if (!invitation || invitation.accepted_at || invitation.expires_at <= Date.now()) fail(400, 'This invitation is expired or has already been used.');
          const profile = JSON.parse(invitation.profile);
          if (db.prepare('SELECT id FROM users WHERE email = ?').get(profile.email)) fail(409, 'This account already exists. Sign in instead.');
          const user = { ...profile, id: id('user'), initials: profile.name.split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase(), preferences: { reports: true, messages: true, reminders: true } };
          db.prepare('INSERT INTO users(id, email, password_hash, profile) VALUES(?, ?, ?, ?)').run(user.id, user.email, passwordHash(password), asJSON(user));
          db.prepare('UPDATE invitations SET accepted_at = ? WHERE id = ?').run(now(), invitation.id);
          audit(user, 'invitation.accepted', { id: invitation.id });
          return session(user);
        });
        return respond(response, { status: 201, data: result }, origin);
      }
      const { user, tokenHash } = authenticate(request);
      const key = request.headers['idempotency-key'] ?? request.headers['x-idempotency-key'];
      const mutate = () => {
        if (!key) return route(user, tokenHash, method, path, body);
        if (typeof key !== 'string' || !/^[\x21-\x7E]{1,160}$/.test(key)) fail(400, 'Idempotency key must be 1–160 printable characters.');
        const fingerprint = hash(asJSON({ method, path, body }));
        const existing = db.prepare('SELECT fingerprint, response FROM idempotency WHERE user_id = ? AND key = ?').get(user.id, key);
        if (existing) {
          if (existing.fingerprint !== fingerprint) fail(409, 'This retry key belongs to a different action. Use a new key.', 'idempotency_conflict');
          const replay = JSON.parse(existing.response);
          // A retry must respect assignments now, even if access was allowed originally.
          if (body.vesselId) vessel(user, body.vesselId);
          if (replay.data?.vesselId) vessel(user, replay.data.vesselId);
          const resource = /^\/api\/(requests|reports|estimates)\/([^/]+)/.exec(path);
          if (resource) scoped(user, resource[1], resource[2]);
          return replay;
        }
        const result = route(user, tokenHash, method, path, body);
        db.prepare('INSERT INTO idempotency(user_id, key, fingerprint, response, created_at) VALUES(?, ?, ?, ?, ?)').run(user.id, key, fingerprint, asJSON(result), now());
        return result;
      };
      const result = MUTATING.has(method) ? transaction(mutate) : route(user, tokenHash, method, path, body);
      respond(response, result, origin);
    } catch (error) {
      if (response.headersSent || response.destroyed) return;
      if (!(error instanceof HttpError)) options.onError?.(error);
      respond(response, { status: error.status ?? 500, data: { error: error instanceof HttpError ? error.message : 'The server could not complete this action. Try again.', code: error instanceof HttpError ? error.code : 'server_error' } }, origin);
    }
  });
  http.requestTimeout = 30000;
  http.headersTimeout = 15000;
  return {
    http, db, databasePath,
    listen(port = 4000, host = '127.0.0.1') { return new Promise((resolveListen, reject) => { http.once('error', reject); http.listen(port, host, () => { http.off('error', reject); resolveListen(http.address()); }); }); },
    close() { return new Promise((resolveClose, reject) => { http.close(error => { if (error) reject(error); else { db.close(); resolveClose(); } }); http.closeIdleConnections(); }); },
  };
}
