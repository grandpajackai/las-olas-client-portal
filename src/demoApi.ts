import type { Attachment, Check, DocumentRecord, Estimate, Notification, PortalData, Report, Role, ServiceRequest, User, Vessel, Visit } from './types';
import { checklistTemplates, DEMO_PASSWORD, demoNotifications, demoUsers, sampleDocument, seedRecords } from './demoSeed';

export const DEMO_STORAGE_KEY = 'las-olas.browser-demo.v1';
export class DemoError extends Error {
  constructor(public readonly status: number, message: string) { super(message); this.name = 'DemoError'; }
}
export interface DemoStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void; }
export interface DemoRequest { token?: string; method?: string; body?: unknown; idempotencyKey?: string; }
export interface DemoDownload { name: string; mimeType: string; text?: string; base64?: string; }
interface Account { profile: User; active: boolean; passwordHash?: string; }
interface Invitation { id: string; name: string; email: string; role: Role; vesselIds: string[]; inviteToken: string; expiresAt: string; acceptedAt?: string; }
interface StoredAttachment extends Attachment { vesselId: string; creatorId: string; base64: string; }
interface DemoReport extends Report { rootReportId?: string; correctsReportId?: string; returnedAt?: string; returnedBy?: string; }
type Records = Omit<PortalData, 'user' | 'notifications' | 'checklistTemplates' | 'reports'> & { reports: DemoReport[] };
type ScopedKind = 'reports' | 'requests' | 'estimates' | 'visits' | 'documents';
interface DemoState {
  version: 1;
  accounts: Account[];
  records: Records;
  notifications: Record<string, Notification[]>;
  invitations: Invitation[];
  sessions: Record<string, { userId: string; expiresAt: number }>;
  attachments: StoredAttachment[];
  documents: Record<string, string>;
  receipts: Record<string, { fingerprint: string; result: unknown; vesselId?: string }>;
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const fail = (status: number, message: string): never => { throw new DemoError(status, message); };
function text(value: unknown, label: string, max = 500): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) return fail(400, `${label} must be between 1 and ${max} characters.`);
  return value.trim();
}
function list(value: unknown, label: string, max = 80): unknown[] {
  if (!Array.isArray(value) || value.length > max) return fail(400, `${label} must be a list of at most ${max} items.`);
  return value;
}
function validDate(value: unknown, label: string, dayOnly = false): string {
  const result = text(value, label, 40);
  const pattern = dayOnly ? /^\d{4}-\d{2}-\d{2}$/ : /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/;
  if (!pattern.test(result) || !Number.isFinite(Date.parse(result)) || new Date(result).toISOString().slice(0, 10) !== result.slice(0, 10)) return fail(400, `${label} must be a real calendar date${dayOnly ? ' (YYYY-MM-DD)' : ''}.`);
  return result;
}
function validTime(value: unknown): string {
  const result = text(value, 'Visit time', 5);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(result)) return fail(400, 'Visit time must use HH:MM.');
  return result;
}
function category(value: unknown): string {
  if (!checklistTemplates.some(template => template.category === value)) return fail(400, 'Choose one of the seven service categories.');
  return value as string;
}
const canAccess = (user: User, vesselId: string) => user.role === 'admin' || user.vesselIds.includes(vesselId);
const requireRole = (user: User, ...roles: Role[]) => { if (!roles.includes(user.role)) fail(403, 'Your role does not have permission for this action.'); };
const uuid = (prefix: string) => `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;
async function secretHash(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) return fail(503, 'This demo requires HTTPS or localhost to create sample accounts.');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(`las-olas-synthetic-demo:${value}`));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
function initialState(timestamp: number): DemoState {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(timestamp)).map(part => [part.type, part.value]));
  const today = Date.parse(`${parts.year}-${parts.month}-${parts.day}T00:00:00Z`);
  const offset = today - Date.parse('2026-10-10T00:00:00Z');
  const shiftText = (value: string): string => value
    .replace(/\b\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}\.\d{3}Z)?\b/g, date => {
      if (!Number.isFinite(Date.parse(date))) return date;
      const shifted = new Date(Date.parse(date) + offset).toISOString();
      return date.length === 10 ? shifted.slice(0, 10) : shifted;
    })
    .replace(/October (\d{1,2})\b/g, (_, day: string) => new Date(Date.parse(`2026-10-${day.padStart(2, '0')}T12:00:00Z`) + offset).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' }))
    .replace(/October (?=care summary|weekend)/g, `${new Date(today).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' })} `);
  const state: DemoState = {
    version: 1, accounts: clone(demoUsers).map(profile => ({ profile, active: true })), records: clone(seedRecords),
    notifications: Object.fromEntries(demoUsers.map(user => [user.id, demoNotifications(user)])), invitations: [], sessions: {}, attachments: [],
    documents: Object.fromEntries(seedRecords.documents.map(document => [document.id, sampleDocument(document)])), receipts: {},
  };
  for (const visit of state.records.visits) visit.updatedAt = '2026-10-10T12:00:00.000Z';
  // Seed dates move once, when this browser's workspace is created. Saved work
  // and its chronology then remain fixed across reloads and role changes.
  return JSON.parse(JSON.stringify(state), (_, value: unknown) => typeof value === 'string' ? shiftText(value) : value) as DemoState;
}
function csvCell(value: unknown): string {
  let result = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(result)) result = `'${result}`;
  return `"${result.replaceAll('"', '""')}"`;
}

/** A synthetic, local browser workspace. It never sends requests to a server. */
export function createDemoApi(storage: DemoStorage, clock = () => Date.now()) {
  const now = () => new Date(clock()).toISOString();
  function load(): DemoState {
    let serialized: string | null;
    try { serialized = storage.getItem(DEMO_STORAGE_KEY); } catch { return fail(507, 'Browser storage is unavailable. Allow site storage to use this interactive demo.'); }
    if (!serialized) return initialState(clock());
    try {
      const state = JSON.parse(serialized) as DemoState;
      if (state.version === 1 && Array.isArray(state.accounts) && state.records
        && ['vessels', 'reports', 'requests', 'estimates', 'visits', 'documents'].every(key => Array.isArray((state.records as unknown as Record<string, unknown>)[key]))
        && state.sessions && state.receipts && state.notifications
        && Array.isArray(state.attachments) && Array.isArray(state.invitations) && state.documents) return state;
    } catch { /* Preserve broken state until the visitor explicitly resets it. */ }
    return fail(409, 'This browser’s demo data could not be read. Reset the demo to start again.');
  }
  function save(state: DemoState) {
    try { storage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state)); } catch {
      fail(507, 'This browser’s demo storage is full. Use a smaller photo or reset the demo; your last saved changes are preserved.');
    }
  }
  function authenticate(state: DemoState, token?: string): User {
    const session = token ? state.sessions[token] : undefined;
    const account = state.accounts.find(value => value.profile.id === session?.userId && value.active);
    if (!session || !account || session.expiresAt <= clock()) return fail(401, 'Your demo session has ended. Choose an account to continue.');
    return account.profile;
  }
  function vessel(state: DemoState, user: User, value: unknown): Vessel {
    const id = text(value, 'Vessel ID', 120);
    const result = state.records.vessels.find(record => record.id === id && canAccess(user, id));
    return result || fail(404, 'Vessel not found or not assigned to your account.');
  }
  function scoped<K extends ScopedKind>(state: DemoState, user: User, kind: K, value: unknown): Records[K][number] {
    const result = state.records[kind].find(record => record.id === value && canAccess(user, record.vesselId));
    if (!result || (kind === 'reports' && user.role === 'owner' && (result as Report).status !== 'published')) return fail(404, 'Record not found or not assigned to your account.');
    return result as Records[K][number];
  }
  function relatedRequest(state: DemoState, user: User, vesselId: string, requestId: unknown): string {
    const request = scoped(state, user, 'requests', requestId);
    if (request.vesselId !== vesselId) return fail(400, 'The related request must belong to the same vessel.');
    return request.id;
  }
  function attachmentVisible(state: DemoState, user: User, attachment: StoredAttachment): boolean {
    return canAccess(user, attachment.vesselId) && (user.role !== 'owner' || attachment.creatorId === user.id
      || state.records.requests.some(record => record.vesselId === attachment.vesselId && record.attachments.some(item => item.id === attachment.id))
      || state.records.reports.some(record => record.vesselId === attachment.vesselId && record.status === 'published' && record.attachments.some(item => item.id === attachment.id)));
  }
  function attachments(state: DemoState, user: User, vesselId: string, values: unknown = []): Attachment[] {
    return list(values, 'Attachments', 8).map(value => {
      const id = typeof value === 'string' ? value : value && typeof value === 'object' ? (value as Attachment).id : undefined;
      const file = state.attachments.find(item => item.id === id && item.vesselId === vesselId && attachmentVisible(state, user, item));
      if (file) return { id: file.id, name: file.name, kind: file.kind, url: file.url };
      const document = state.records.documents.find(item => item.id === id && item.vesselId === vesselId && canAccess(user, vesselId));
      if (document) return { id: document.id, name: `${document.title}.txt`, kind: 'text/plain', url: `/api/documents/${document.id}/download` };
      return fail(400, 'One or more attachments are unavailable for this vessel.');
    });
  }
  function notify(state: DemoState, actor: User, vesselId: string, title: string, body: string, type: string, adminOnly = false) {
    const preference = type === 'report' ? 'reports' : type === 'reminder' ? 'reminders' : ['message', 'request', 'approval'].includes(type) ? 'messages' : undefined;
    for (const account of state.accounts) {
      const user = account.profile;
      if (!account.active || user.id === actor.id || !canAccess(user, vesselId) || (adminOnly && user.role !== 'admin') || (preference && user.preferences?.[preference] === false)) continue;
      (state.notifications[user.id] ||= []).unshift({ id: uuid('notification'), vesselId, title, body: `Demo only · ${body}`, type, read: false, createdAt: now() });
    }
  }
  function reportFields(state: DemoState, user: User, vesselId: string, body: Record<string, unknown>, previous?: DemoReport): DemoReport {
    const fields = { ...previous } as DemoReport;
    if (!previous || body.title !== undefined) fields.title = text(body.title, 'Report title', 160);
    if (!previous || body.category !== undefined) fields.category = category(body.category);
    if (!previous || body.performedAt !== undefined) fields.performedAt = validDate(body.performedAt, 'Performed date');
    if (!previous || body.summary !== undefined) fields.summary = text(body.summary ?? 'Work entry awaiting completion.', 'Summary', 5000);
    if (!previous || body.checks !== undefined) fields.checks = list(body.checks ?? [], 'Checks').map(value => {
      const check = value as Partial<Check>;
      if (!check || !['passed', 'monitor', 'action', 'not_checked', 'not_applicable'].includes(check.status || '')) return fail(400, 'Every check needs a valid recorded status.');
      return { label: text(check.label, 'Check label', 200), status: check.status!, ...(check.value ? { value: text(check.value, 'Check reading', 600) } : {}), ...(check.equipment ? { equipment: text(check.equipment, 'Equipment reference', 200) } : {}) };
    });
    if (!previous || body.workPerformed !== undefined) fields.workPerformed = list(body.workPerformed ?? [], 'Work performed').map(value => text(value, 'Work performed', 1200));
    if (!previous || body.internalNotes !== undefined) fields.internalNotes = body.internalNotes ? text(body.internalNotes, 'Internal notes', 5000) : '';
    if (!previous || body.attachments !== undefined) fields.attachments = attachments(state, user, vesselId, body.attachments ?? []);
    if (body.requestId !== undefined) fields.requestId = relatedRequest(state, user, vesselId, body.requestId);
    return fields;
  }
  function visibleReport(user: User, report: DemoReport): DemoReport {
    const result = clone(report);
    if (user.role === 'owner') delete result.internalNotes;
    return result;
  }
  function bootstrap(state: DemoState, user: User): PortalData {
    const visible = <K extends ScopedKind,>(kind: K): Records[K] => state.records[kind].filter(record => canAccess(user, record.vesselId)) as Records[K];
    return {
      user: clone(user), vessels: state.records.vessels.filter(record => canAccess(user, record.id)),
      reports: visible('reports').filter(report => user.role !== 'owner' || report.status === 'published').map(report => visibleReport(user, report)).sort((a, b) => b.performedAt.localeCompare(a.performedAt)),
      requests: visible('requests').sort((a, b) => b.createdAt.localeCompare(a.createdAt)), estimates: visible('estimates'),
      visits: visible('visits').sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)), documents: visible('documents'),
      notifications: (state.notifications[user.id] || []).filter(record => canAccess(user, record.vesselId)), checklistTemplates: clone(checklistTemplates),
    };
  }
  function session(state: DemoState, user: User) {
    const token = uuid('demo-session');
    state.sessions[token] = { userId: user.id, expiresAt: clock() + 7 * 86400000 };
    return { token, user: clone(user) };
  }
  function route(state: DemoState, user: User, token: string | undefined, method: string, path: string, body: Record<string, unknown>): unknown {
    let match: RegExpExecArray | null;
    if (path === '/api/bootstrap' && method === 'GET') return bootstrap(state, user);
    if (path === '/api/auth/logout' && method === 'POST') { if (token) delete state.sessions[token]; return { ok: true }; }
    if (path === '/api/requests' && method === 'POST') {
      const boat = vessel(state, user, body.vesselId);
      if (!['routine', 'soon', 'urgent'].includes(String(body.priority))) return fail(400, 'Choose a valid request priority.');
      const record: ServiceRequest = { id: uuid('request'), vesselId: boat.id, title: text(body.title, 'Request title', 160), description: text(body.description, 'Request description', 6000), category: category(body.category), priority: body.priority as ServiceRequest['priority'], status: 'submitted', coordinator: 'Unassigned', createdAt: now(), messages: [], attachments: attachments(state, user, boat.id, body.attachments) };
      if (body.desiredDate) record.desiredDate = validDate(body.desiredDate, 'Desired date');
      state.records.requests.unshift(record);
      notify(state, user, boat.id, 'A demo service request was submitted', record.title, 'request');
      return record;
    }
    if ((match = /^\/api\/requests\/([^/]+)$/.exec(path)) && method === 'PATCH') {
      requireRole(user, 'staff', 'admin');
      const record = scoped(state, user, 'requests', match[1]);
      if (!['submitted', 'acknowledged', 'scheduled', 'in_progress', 'completed'].includes(String(body.status))) return fail(400, 'Choose a valid request status.');
      record.status = body.status as ServiceRequest['status'];
      if (body.coordinator !== undefined) record.coordinator = text(body.coordinator, 'Coordinator', 120);
      notify(state, user, record.vesselId, 'Demo service request updated', `${record.title}: ${record.status.replaceAll('_', ' ')}`, 'request');
      return record;
    }
    if ((match = /^\/api\/requests\/([^/]+)\/messages$/.exec(path)) && method === 'POST') {
      const record = scoped(state, user, 'requests', match[1]);
      const message = { id: uuid('message'), author: user.name, text: text(body.text, 'Message', 6000), createdAt: now() };
      record.messages.push(message);
      notify(state, user, record.vesselId, 'A new demo message', `${user.name}: ${message.text.slice(0, 140)}`, 'message');
      return message;
    }
    if (path === '/api/estimates' && method === 'POST') {
      requireRole(user, 'admin');
      const boat = vessel(state, user, body.vesselId);
      if (typeof body.amount !== 'number' || !Number.isFinite(body.amount) || body.amount <= 0 || body.amount > 100000000) return fail(400, 'Estimate amount must be a positive number.');
      const currency = body.currency ?? 'USD';
      if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) return fail(400, 'Currency must be a three-letter uppercase currency code.');
      const previous = body.supersedesId ? scoped(state, user, 'estimates', body.supersedesId) : undefined;
      if (previous && (previous.vesselId !== boat.id || previous.supersededBy)) return fail(409, 'Revise the current estimate for the same vessel.');
      const scope = list(body.scope, 'Estimate scope', 40).map(value => text(value, 'Scope item', 1200));
      if (!scope.length) return fail(400, 'Add at least one scope item.');
      const record: Estimate = { id: uuid('estimate'), vesselId: boat.id, title: text(body.title, 'Estimate title', 180), amount: Math.round(body.amount * 100) / 100, currency, scope, status: 'pending', version: previous ? previous.version + 1 : 1 };
      if (record.amount < 0.01) return fail(400, 'Estimate amount must be at least one cent.');
      if (previous && body.requestId !== undefined && body.requestId !== previous.requestId) return fail(400, 'A revised estimate must keep its original related request.');
      if (body.requestId ?? previous?.requestId) record.requestId = relatedRequest(state, user, boat.id, body.requestId ?? previous?.requestId);
      if (previous) { record.supersedesId = previous.id; previous.supersededBy = record.id; }
      state.records.estimates.push(record);
      notify(state, user, boat.id, 'A demo estimate is ready', `${record.title} · Version ${record.version}`, 'approval');
      return record;
    }
    if ((match = /^\/api\/estimates\/([^/]+)\/decision$/.exec(path)) && method === 'POST') {
      requireRole(user, 'owner');
      const record = scoped(state, user, 'estimates', match[1]);
      if (!['approved', 'declined'].includes(String(body.decision))) return fail(400, 'Choose approved or declined.');
      if (record.version !== body.version || record.supersededBy) return fail(409, 'This estimate has changed. Review the latest scope before deciding.');
      if (record.status !== 'pending') return fail(409, 'A decision is already recorded for this estimate version.');
      record.status = body.decision as Estimate['status']; record.decidedBy = user.name; record.decidedAt = now();
      notify(state, user, record.vesselId, `Demo estimate ${record.status}`, record.title, 'approval');
      return record;
    }
    if (path === '/api/reports' && method === 'POST') {
      requireRole(user, 'staff', 'admin');
      const boat = vessel(state, user, body.vesselId);
      const record = { ...reportFields(state, user, boat.id, body), id: uuid('report'), vesselId: boat.id, status: 'draft' as const, author: user.name, recordedAt: now(), revision: 1 };
      state.records.reports.unshift(record);
      return record;
    }
    if ((match = /^\/api\/reports\/([^/]+)$/.exec(path)) && method === 'PATCH') {
      requireRole(user, 'staff', 'admin');
      const record = scoped(state, user, 'reports', match[1]);
      if (record.status !== 'draft') return fail(409, 'Only draft reports can be edited. Create a correction revision for a published report.');
      if (body.expectedRecordedAt && body.expectedRecordedAt !== record.recordedAt) return fail(409, 'This draft was updated elsewhere. Refresh before saving.');
      const updated = { ...reportFields(state, user, record.vesselId, body, record), recordedAt: new Date(Math.max(clock(), Date.parse(record.recordedAt) + 1)).toISOString() };
      Object.assign(record, updated);
      return record;
    }
    if ((match = /^\/api\/reports\/([^/]+)\/(submit|publish|return|revisions)$/.exec(path)) && method === 'POST') {
      const action = match[2];
      requireRole(user, ...(action === 'publish' || action === 'return' ? ['admin'] as Role[] : ['staff', 'admin'] as Role[]));
      const record = scoped(state, user, 'reports', match[1]);
      if (action === 'submit') {
        if (record.status !== 'draft') return fail(409, 'Only drafts can be submitted for management review.');
        if (!record.checks.length && !record.workPerformed.length) return fail(400, 'Record at least one check or completed work item before submitting.');
        record.status = 'review';
        notify(state, user, record.vesselId, 'A demo report needs review', record.title, 'review', true);
      } else if (action === 'return') {
        if (record.status !== 'review') return fail(409, 'Only a report awaiting review can be returned.');
        const reason = text(body.reason, 'Review reason', 1000);
        record.status = 'draft'; record.recordedAt = new Date(Math.max(clock(), Date.parse(record.recordedAt) + 1)).toISOString();
        record.internalNotes = `${record.internalNotes || ''}\n\nManagement review · ${now()} · ${user.name}\n${reason}`.trim();
        record.returnedAt = now(); record.returnedBy = user.id;
      } else if (action === 'publish') {
        if (record.status !== 'review') return fail(409, 'Submit the report for review before publishing.');
        record.status = 'published';
        const document: DocumentRecord = { id: `doc-${record.id}`, vesselId: record.vesselId, title: `${record.title} · Revision ${record.revision}`, category: 'Inspection reports', date: record.performedAt.slice(0, 10), size: 'Text record' };
        state.records.documents.push(document);
        state.documents[document.id] = `LAS OLAS · SYNTHETIC DEMO SERVICE REPORT\n\n${record.title}\nRevision ${record.revision}\nPerformed ${record.performedAt}\nRecorded ${record.recordedAt}\nBy ${record.author}\n\n${record.summary}\n\n${record.checks.map(check => `${check.label}: ${check.status}${check.value ? ` · ${check.value}` : ''}`).join('\n')}\n\n${record.workPerformed.join('\n')}\n\nSample observations only. No real service was performed or booked.\n`;
        vessel(state, user, record.vesselId).lastUpdated = now();
        notify(state, user, record.vesselId, 'A demo service report is ready', record.title, 'report');
      } else {
        if (record.status !== 'published') return fail(409, 'Corrections must start from a published report.');
        const root = record.rootReportId || record.id;
        const revisions = state.records.reports.filter(value => value.id === root || value.rootReportId === root);
        if (revisions.some(value => value.status !== 'published')) return fail(409, 'A correction draft is already in progress for this report.');
        if (record.revision !== Math.max(...revisions.map(value => value.revision))) return fail(409, 'Start a correction from the latest published revision.');
        const corrected = { ...reportFields(state, user, record.vesselId, body, record), id: uuid('report'), status: 'draft' as const, author: user.name, recordedAt: now(), rootReportId: root, correctsReportId: record.id, revision: record.revision + 1 };
        state.records.reports.unshift(corrected);
        return corrected;
      }
      return record;
    }
    if (path === '/api/visits' && method === 'POST') {
      requireRole(user, 'admin');
      const boat = vessel(state, user, body.vesselId);
      const record: Visit = { id: uuid('visit'), vesselId: boat.id, title: text(body.title, 'Visit title', 160), date: validDate(body.date, 'Visit date', true), time: validTime(body.time), category: category(body.category), assignedTo: text(body.assignedTo, 'Assigned staff', 120), status: 'scheduled' };
      if (body.requestId !== undefined) record.requestId = relatedRequest(state, user, boat.id, body.requestId);
      if (body.notes) record.notes = text(body.notes, 'Visit notes', 3000);
      state.records.visits.push(record);
      notify(state, user, boat.id, 'A demo visit is scheduled', `${record.title} · ${record.date}`, 'reminder');
      return record;
    }
    if ((match = /^\/api\/visits\/([^/]+)$/.exec(path)) && method === 'PATCH') {
      requireRole(user, 'admin');
      const record = scoped(state, user, 'visits', match[1]);
      if (body.expectedUpdatedAt !== undefined && body.expectedUpdatedAt !== record.updatedAt) return fail(409, 'This visit was updated elsewhere. Refresh before saving.');
      if (body.date !== undefined) record.date = validDate(body.date, 'Visit date', true);
      if (body.time !== undefined) record.time = validTime(body.time);
      if (body.assignedTo !== undefined) record.assignedTo = text(body.assignedTo, 'Assigned staff', 120);
      if (body.notes !== undefined) record.notes = body.notes ? text(body.notes, 'Visit notes', 3000) : '';
      if (body.status !== undefined) {
        if (!['scheduled', 'completed', 'cancelled'].includes(String(body.status))) return fail(400, 'Choose scheduled, completed or cancelled.');
        record.status = body.status as string;
      }
      record.updatedAt = new Date(Math.max(clock(), Date.parse(record.updatedAt || '') + 1 || 0)).toISOString();
      notify(state, user, record.vesselId, 'A demo visit was updated', `${record.title} · ${record.status}`, 'reminder');
      return record;
    }
    if (path === '/api/preferences' && method === 'PATCH') {
      const preferences = { reports: true, messages: true, reminders: true, ...user.preferences };
      for (const key of ['reports', 'messages', 'reminders'] as const) if (body[key] !== undefined) {
        if (typeof body[key] !== 'boolean') return fail(400, 'Notification preferences must be true or false.');
        preferences[key] = body[key];
      }
      user.preferences = preferences;
      return user;
    }
    if ((match = /^\/api\/notifications\/([^/]+)\/read$/.exec(path)) && method === 'POST') {
      const record = state.notifications[user.id]?.find(value => value.id === match![1] && canAccess(user, value.vesselId));
      if (!record) return fail(404, 'Notification not found.');
      record.read = true;
      return record;
    }
    if (path === '/api/admin/access' && method === 'GET') {
      requireRole(user, 'admin');
      return { users: state.accounts.map(account => ({ ...account.profile, active: account.active })), invitations: state.invitations.map(({ inviteToken, ...invitation }) => invitation) };
    }
    if (path === '/api/admin/vessels' && method === 'POST') {
      requireRole(user, 'admin');
      if (body.image !== 'ocean' && body.image !== 'detail') return fail(400, 'Choose a demonstration vessel image.');
      const record: Vessel = { id: uuid('vessel'), name: text(body.name, 'Vessel name', 120), model: text(body.model, 'Vessel model', 120), length: text(body.length, 'Vessel length', 40), location: text(body.location, 'Vessel location', 240), program: text(body.program, 'Care program', 120), image: body.image, lastUpdated: now() };
      state.records.vessels.push(record);
      return record;
    }
    if (path === '/api/admin/invitations' && method === 'POST') {
      requireRole(user, 'admin');
      const email = text(body.email, 'Email', 254).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(400, 'Enter a valid sample email address.');
      if (!/(?:\.test|\.invalid|\.example|@example\.(?:com|net|org))$/i.test(email)) return fail(400, 'Use a fictional address such as taylor@example.test in this public preview.');
      if (state.accounts.some(account => account.profile.email === email)) return fail(409, 'An account already exists for that email.');
      if (!['owner', 'staff', 'admin'].includes(String(body.role))) return fail(400, 'Choose owner, staff or admin.');
      const vesselIds = [...new Set(list(body.vesselIds, 'Assigned vessels', 100).map(value => vessel(state, user, value).id))];
      if (!vesselIds.length && body.role !== 'admin') return fail(400, 'Assign at least one vessel.');
      const invitation: Invitation = { id: uuid('invitation'), name: text(body.name, 'Name', 120), email, role: body.role as Role, vesselIds, inviteToken: uuid('demo-invite'), expiresAt: new Date(clock() + 48 * 3600000).toISOString() };
      state.invitations.push(invitation);
      return { ...invitation, delivery: 'manual_demo_only' };
    }
    if ((match = /^\/api\/admin\/users\/([^/]+)$/.exec(path)) && method === 'PATCH') {
      requireRole(user, 'admin');
      const account = state.accounts.find(value => value.profile.id === match![1]);
      if (!account) return fail(404, 'User not found.');
      if (body.active !== undefined && typeof body.active !== 'boolean') return fail(400, 'Account active status must be true or false.');
      if (account.profile.id === user.id && body.active === false) return fail(400, 'Use a different administrator to revoke this account.');
      if (body.vesselIds !== undefined) account.profile.vesselIds = [...new Set(list(body.vesselIds, 'Assigned vessels', 100).map(value => vessel(state, user, value).id))];
      if (typeof body.active === 'boolean') account.active = body.active;
      if (!account.active) for (const [key, session] of Object.entries(state.sessions)) if (session.userId === account.profile.id) delete state.sessions[key];
      return { ...account.profile, active: account.active };
    }
    if (path === '/api/attachments' && method === 'POST') {
      const boat = vessel(state, user, body.vesselId);
      const name = text(body.name, 'File name', 150);
      if (body.mimeType !== 'image/jpeg' && body.mimeType !== 'image/png') return fail(400, 'Upload a JPEG or PNG image.');
      if (typeof body.dataBase64 !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.dataBase64) || body.dataBase64.length % 4 !== 0) return fail(400, 'Image must contain valid base64 data.');
      let binary: string;
      try { binary = atob(body.dataBase64); } catch { return fail(400, 'Image must contain valid base64 data.'); }
      if (binary.length < 12 || binary.length > 2 * 1024 * 1024) return fail(413, 'Images must be between 12 bytes and 2 MB.');
      if (body.mimeType === 'image/png' ? binary.slice(0, 8) !== '\x89PNG\r\n\x1a\n' : binary.charCodeAt(0) !== 255 || binary.charCodeAt(1) !== 216 || binary.charCodeAt(2) !== 255) return fail(400, 'Image content does not match its declared type.');
      const id = uuid('attachment');
      const record: StoredAttachment = { id, name, kind: body.mimeType, url: `/api/attachments/${id}/download`, vesselId: boat.id, creatorId: user.id, base64: body.dataBase64 };
      state.attachments.push(record);
      return { id, name, kind: record.kind, url: record.url };
    }
    return fail(404, 'This demo action is unavailable.');
  }
  return {
    async request<T>(path: string, options: DemoRequest = {}): Promise<T> {
      const method = options.method?.toUpperCase() || 'GET';
      if (path === '/health' && method === 'GET') return { ok: true, demo: true, browserDemo: true, time: now() } as T;
      const body = options.body === undefined ? {} : options.body;
      if (!body || Array.isArray(body) || typeof body !== 'object') return fail(400, 'Send a JSON object.');
      const values = body as Record<string, unknown>;
      // Hash outside the synchronous read/validate/write transaction.
      const passwordDigest = path === '/api/auth/login' || path === '/api/auth/accept-invite'
        ? await secretHash(text(values.password, 'Sample password', 512)) : undefined;
      const fingerprint = options.idempotencyKey ? await secretHash(JSON.stringify([method, path, values])) : '';
      const state = load();
      if (path === '/api/auth/login' && method === 'POST') {
        const email = text(values.email, 'Email', 254).toLowerCase();
        const account = state.accounts.find(value => value.profile.email === email && value.active);
        if (!account || (account.passwordHash ? passwordDigest !== account.passwordHash : values.password !== DEMO_PASSWORD)) return fail(401, 'Email or sample password is incorrect. Reset the demo to restore its original accounts.');
        const result = session(state, account.profile); save(state); return result as T;
      }
      if (path === '/api/auth/accept-invite' && method === 'POST') {
        const inviteToken = text(values.inviteToken, 'Invitation token', 120);
        if (String(values.password).length < 12) return fail(400, 'Choose a sample password with at least 12 characters.');
        const invitation = state.invitations.find(value => value.inviteToken === inviteToken && !value.acceptedAt && Date.parse(value.expiresAt) > clock());
        if (!invitation) return fail(400, 'This demo invitation expired or has already been used.');
        if (state.accounts.some(value => value.profile.email === invitation.email)) return fail(409, 'This account already exists. Sign in instead.');
        const user: User = { id: uuid('user'), name: invitation.name, email: invitation.email, role: invitation.role, vesselIds: invitation.vesselIds, initials: invitation.name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase(), preferences: { reports: true, messages: true, reminders: true } };
        state.accounts.push({ profile: user, active: true, passwordHash: passwordDigest }); invitation.acceptedAt = now(); state.notifications[user.id] = [];
        const result = session(state, user); save(state); return result as T;
      }
      const user = authenticate(state, options.token);
      const writes = method !== 'GET' && method !== 'HEAD';
      const key = options.idempotencyKey ? `${user.id}:${options.idempotencyKey}` : undefined;
      if (writes && key && state.receipts[key]) {
        const receipt = state.receipts[key];
        if (receipt.fingerprint !== fingerprint) return fail(409, 'This retry identifier belongs to another action.');
        if (receipt.vesselId) vessel(state, user, receipt.vesselId);
        const resource = /^\/api\/(requests|reports|estimates|visits)\/([^/]+)/.exec(path);
        if (resource) scoped(state, user, resource[1] as ScopedKind, resource[2]);
        return clone(receipt.result) as T;
      }
      const result = route(state, user, options.token, method, path, values);
      if (writes) {
        if (key) state.receipts[key] = { fingerprint, result: clone(result), vesselId: typeof (result as { vesselId?: unknown })?.vesselId === 'string' ? (result as { vesselId: string }).vesselId : typeof values.vesselId === 'string' ? values.vesselId : undefined };
        save(state);
      }
      return clone(result) as T;
    },
    download(path: string, token: string): DemoDownload {
      const state = load(); const user = authenticate(state, token); let match: RegExpExecArray | null;
      if ((match = /^\/api\/documents\/([^/]+)\/download$/.exec(path))) {
        const record = scoped(state, user, 'documents', match[1]);
        return { name: `${record.title}.txt`, mimeType: 'text/plain;charset=utf-8', text: state.documents[record.id] || fail(404, 'Sample document content is unavailable.') };
      }
      if ((match = /^\/api\/attachments\/([^/]+)\/download$/.exec(path))) {
        const record = state.attachments.find(value => value.id === match![1]);
        if (!record || !attachmentVisible(state, user, record)) return fail(404, 'Attachment not found.');
        return { name: record.name, mimeType: record.kind, base64: record.base64 };
      }
      if ((match = /^\/api\/export\/([^/]+)$/.exec(path))) {
        const boat = vessel(state, user, decodeURIComponent(match[1]));
        const rows: unknown[][] = [['SYNTHETIC DEMO SERVICE HISTORY · No real service performed', boat.name], ['Report ID', 'Title', 'Performed', 'Recorded', 'Author', 'Revision', 'Summary', 'Checks', 'Work performed']];
        for (const report of state.records.reports.filter(value => value.vesselId === boat.id && value.status === 'published')) rows.push([report.id, report.title, report.performedAt, report.recordedAt, report.author, report.revision, report.summary, report.checks.map(check => `${check.label}: ${check.status}${check.value ? ` (${check.value})` : ''}`).join('; '), report.workPerformed.join('; ')]);
        return { name: `${boat.name}-demo-service-history.csv`, mimeType: 'text/csv;charset=utf-8', text: `\uFEFF${rows.map(row => row.map(csvCell).join(',')).join('\r\n')}\r\n` };
      }
      return fail(404, 'Sample download not found.');
    },
    reset() { try { storage.removeItem(DEMO_STORAGE_KEY); } catch { fail(507, 'This browser could not clear its demo data. Clear this site’s storage in your browser settings.'); } },
  };
}

let browserDemo: ReturnType<typeof createDemoApi> | undefined;
export function getBrowserDemo() {
  if (typeof window === 'undefined') return fail(503, 'The self-contained demo is available in a browser.');
  if (!browserDemo) {
    // Accessing localStorage itself can throw when a browser blocks site storage.
    let storage: Storage;
    try { storage = window.localStorage; } catch { return fail(507, 'Allow site storage to use this interactive demo.'); }
    browserDemo = createDemoApi(storage);
  }
  return browserDemo;
}
