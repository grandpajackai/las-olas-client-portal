export type Role = 'owner' | 'staff' | 'admin';
export type CheckStatus = 'passed' | 'monitor' | 'action' | 'not_checked' | 'not_applicable';
export interface User { id: string; name: string; email: string; role: Role; initials: string; vesselIds: string[]; preferences?: { reports: boolean; messages: boolean; reminders: boolean }; }
export interface Vessel { id: string; name: string; model: string; length: string; location: string; image: 'ocean' | 'detail'; lastUpdated: string; program: string; }
export interface Attachment { id: string; name: string; kind: string; url?: string; }
export interface Check { label: string; status: CheckStatus; value?: string; equipment?: string; }
export interface Report { requestId?: string; id: string; vesselId: string; title: string; category: string; status: 'draft' | 'review' | 'published'; performedAt: string; recordedAt: string; author: string; summary: string; checks: Check[]; workPerformed: string[]; internalNotes?: string; revision: number; attachments: Attachment[]; }
export interface Message { id: string; author: string; text: string; createdAt: string; }
export interface ServiceRequest { id: string; vesselId: string; title: string; description: string; category: string; priority: 'routine' | 'soon' | 'urgent'; status: 'submitted' | 'acknowledged' | 'scheduled' | 'in_progress' | 'completed'; coordinator: string; createdAt: string; desiredDate?: string; messages: Message[]; attachments: Attachment[]; }
export interface Estimate { supersededBy?: string; supersedesId?: string; id: string; vesselId: string; requestId?: string; title: string; version: number; currency: string; amount: number; scope: string[]; status: 'pending' | 'approved' | 'declined'; decidedBy?: string; decidedAt?: string; }
export interface Visit { updatedAt?: string; requestId?: string; id: string; vesselId: string; title: string; date: string; time: string; category: string; assignedTo: string; status: string; notes?: string; }
export interface DocumentRecord { id: string; vesselId: string; title: string; category: string; date: string; expiresAt?: string; size: string; }
export interface Notification { id: string; vesselId: string; title: string; body: string; createdAt: string; read: boolean; type: string; }
export interface ChecklistTemplate { id: string; category: string; checks: string[]; }
export interface PortalData { user: User; vessels: Vessel[]; reports: Report[]; requests: ServiceRequest[]; estimates: Estimate[]; visits: Visit[]; documents: DocumentRecord[]; notifications: Notification[]; checklistTemplates: ChecklistTemplate[]; }
export interface Mutation { id: string; path: string; method?: string; body: Record<string, unknown>; createdAt: string; }
