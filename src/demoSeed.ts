import type { Attachment, ChecklistTemplate, DocumentRecord, Notification, PortalData, User } from './types';

// Demonstration data only. Checklist wording is a starting point for business review.
export const DEMO_PASSWORD = 'DemoHarbor!26';
export const DEMO_AS_OF = '2026-10-10T12:00:00.000Z';
const baseDemoUsers: User[] = [
  { id: 'owner-1', name: 'Alex Morgan', email: 'owner@demo.lasolas.test', role: 'owner', initials: 'AM', vesselIds: ['vessel-serenity', 'vessel-solstice'] },
  { id: 'owner-2', name: 'Jordan Blake', email: 'second-owner@demo.lasolas.test', role: 'owner', initials: 'JB', vesselIds: ['vessel-aurora'] },
  { id: 'staff-1', name: 'Daniel Rivera', email: 'staff@demo.lasolas.test', role: 'staff', initials: 'DR', vesselIds: ['vessel-serenity'] },
  { id: 'admin-1', name: 'Olivia Bennett', email: 'admin@demo.lasolas.test', role: 'admin', initials: 'OB', vesselIds: ['vessel-serenity', 'vessel-solstice', 'vessel-aurora'] },
];
export const demoUsers: User[] = baseDemoUsers.map(user => ({ ...user, preferences: { reports: true, messages: true, reminders: true } }));

export const checklistTemplates: ChecklistTemplate[] = [
  { id: 'interior-care', category: 'Interior care', checks: ['Cabins, salon and heads', 'Floors and upholstery', 'Linens and guest arrival staging', 'Refrigeration and ice makers', 'Portholes and stainless finishes'] },
  { id: 'exterior-detailing', category: 'Exterior detailing', checks: ['Hull and topsides washdown', 'Glass and windshield', 'Stainless and metal finishes', 'Cushions, hatches and drainage', 'Finish condition and corrosion'] },
  { id: 'maintenance', category: 'Maintenance & systems', checks: ['Engine fluids and recorded hours', 'Generator fluids and recorded hours', 'Sea strainers and seacocks', 'Electrical and onboard systems', 'Tank levels and bilges', 'A/C and service requirements'] },
  { id: 'project-management', category: 'Project management', checks: ['Agreed work scope', 'Estimate and owner decisions', 'Contractor coordination', 'Project milestones and photos', 'Completion and service records'] },
  { id: 'captain-and-crew', category: 'Captain & crew', checks: ['Itinerary and captain arrangement', 'Crew roles and qualifications review', 'Lines, fenders and deck readiness', 'Guest preparation', 'Delivery and repositioning plan'] },
  { id: 'concierge', category: 'Yacht concierge', checks: ['Guest arrival and provisioning list', 'Marina and dockage reservations', 'Ground transfers and travel', 'Dining and activity arrangements', 'Owner preferences confirmed'] },
  { id: 'hurricane-planning', category: 'Hurricane planning', checks: ['Vessel storm plan reviewed', 'Documents and renewals', 'Readiness responsibilities', 'Relocation provider arrangement', 'Return and post-event checks'] },
];

const attachment = (id: string, name: string): Attachment => ({ id, name, kind: 'text/plain', url: `/api/documents/${id}/download` });
export const seedRecords: Omit<PortalData, 'user' | 'notifications' | 'checklistTemplates'> = {
  vessels: [
    { id: 'vessel-serenity', name: 'Serenity', model: 'Princess Y72', length: '72 ft', location: 'Las Olas Marina · Slip C-14', image: 'ocean', lastUpdated: '2026-10-09T18:35:00.000Z', program: 'Complete Management' },
    { id: 'vessel-solstice', name: 'Solstice', model: 'Pardo 43', length: '43 ft', location: 'Fort Lauderdale · Private dock', image: 'detail', lastUpdated: '2026-10-08T15:10:00.000Z', program: 'Coastal Care' },
    { id: 'vessel-aurora', name: 'Aurora', model: 'Viking 64 Convertible', length: '64 ft', location: 'Bahia Mar · Slip A-08', image: 'ocean', lastUpdated: '2026-10-07T17:00:00.000Z', program: 'Sportfish Care' },
  ],
  reports: [
    { id: 'report-serenity-systems', vesselId: 'vessel-serenity', title: 'Weekly systems & readiness check', category: 'Maintenance & systems', status: 'published', performedAt: '2026-10-09T13:00:00.000Z', recordedAt: '2026-10-09T18:35:00.000Z', author: 'Daniel Rivera', summary: 'Routine checks complete. A light drip was observed at the port raw-water pump; an estimate is ready for your review. These are recorded observations from this visit.', checks: [
      { label: 'Engine fluids and recorded hours', status: 'passed', value: 'Port 482.6 h · Starboard 483.1 h', equipment: 'Twin MAN V12 engines' },
      { label: 'Generator fluids and recorded hours', status: 'passed', value: '1,248.3 h', equipment: 'Onan generator' },
      { label: 'Port raw-water pump', status: 'action', value: 'Light drip observed at seal', equipment: 'Port engine cooling circuit' },
      { label: 'Sea strainers and seacocks', status: 'passed', value: 'Strainers cleaned; seacocks exercised' },
      { label: 'House battery voltage', status: 'passed', value: '26.4 V on shore power', equipment: '24 V house bank' },
      { label: 'Aft bilge', status: 'monitor', value: 'Trace residual water; recheck next visit' },
      { label: 'Navigation electronics sea trial', status: 'not_checked', value: 'Dockside visit; underway test not performed' },
      { label: 'Watermaker', status: 'not_applicable', value: 'Not fitted' },
    ], workPerformed: ['Cleaned main-engine sea strainers.', 'Checked and recorded engine and generator hours.', 'Exercised accessible seacocks and inspected bilges.', 'Photographed pump area for estimate preparation.'], internalNotes: 'DEMO INTERNAL: confirm seal availability with specialist before scheduling.', revision: 1, attachments: [attachment('doc-serenity-inspection', 'Weekly inspection — sample record.txt')] },
    { id: 'report-serenity-exterior', vesselId: 'vessel-serenity', title: 'Exterior wash & finish care', category: 'Exterior detailing', status: 'published', performedAt: '2026-10-07T14:00:00.000Z', recordedAt: '2026-10-07T18:15:00.000Z', author: 'Daniel Rivera', summary: 'Freshwater washdown and glass care completed. Light oxidation at the flybridge rail is being monitored.', checks: [
      { label: 'Hull and topsides washdown', status: 'passed' }, { label: 'Glass and windshield', status: 'passed' }, { label: 'Stainless and metal finishes', status: 'monitor', value: 'Light oxidation at flybridge rail' }, { label: 'Cushions, hatches and drainage', status: 'passed' },
    ], workPerformed: ['Freshwater wash and dry.', 'Cleaned glass and polished accessible stainless.', 'Cleared hatch drainage channels.'], internalNotes: 'DEMO INTERNAL: include rail polish in next detailed care proposal.', revision: 1, attachments: [] },
    { id: 'report-serenity-interior', vesselId: 'vessel-serenity', title: 'Interior refresh & guest preparation', category: 'Interior care', status: 'published', performedAt: '2026-10-05T15:00:00.000Z', recordedAt: '2026-10-05T18:00:00.000Z', author: 'Mia Santos', summary: 'Cabins, salon and heads refreshed. Guest linens staged and refrigeration checked.', checks: [{ label: 'Cabins, salon and heads', status: 'passed' }, { label: 'Linens and guest arrival staging', status: 'passed' }, { label: 'Refrigeration and ice makers', status: 'passed', value: 'Refrigerator 38°F · Ice maker cleaned' }], workPerformed: ['Refreshed cabins and guest heads.', 'Staged fresh linens and towels.', 'Cleaned galley refrigeration and surfaces.'], revision: 1, attachments: [] },
    { id: 'report-serenity-draft', vesselId: 'vessel-serenity', title: 'Pre-arrival deck preparation', category: 'Captain & crew', status: 'draft', performedAt: '2026-10-10T11:30:00.000Z', recordedAt: '2026-10-10T11:50:00.000Z', author: 'Daniel Rivera', summary: 'Draft entry: deck preparation under way for management review.', checks: [{ label: 'Lines, fenders and deck readiness', status: 'passed' }, { label: 'Guest preparation', status: 'not_checked' }], workPerformed: ['Set fenders for anticipated guest boarding.'], internalNotes: 'DEMO INTERNAL: waiting for confirmed guest count.', revision: 1, attachments: [] },
    { id: 'report-solstice-systems', vesselId: 'vessel-solstice', requestId: 'request-solstice-wash', title: 'Fortnightly care visit', category: 'Maintenance & systems', status: 'published', performedAt: '2026-10-08T13:00:00.000Z', recordedAt: '2026-10-08T15:10:00.000Z', author: 'Mia Santos', summary: 'Scheduled dockside care complete. All inspected systems passed at the time of the visit; navigation sea trial remains unchecked.', checks: [{ label: 'Engine fluids and recorded hours', status: 'passed', value: 'Port 226.1 h · Starboard 227.0 h', equipment: 'Volvo Penta IPS' }, { label: 'Sea strainers and seacocks', status: 'passed' }, { label: 'Navigation electronics sea trial', status: 'not_checked', value: 'Not performed during dockside visit' }], workPerformed: ['Checked fluids and sea strainers.', 'Recorded hours and refreshed the cockpit.'], revision: 1, attachments: [] },
    { id: 'report-aurora-private', vesselId: 'vessel-aurora', title: 'Sportfish preparation visit', category: 'Exterior detailing', status: 'published', performedAt: '2026-10-07T13:00:00.000Z', recordedAt: '2026-10-07T17:00:00.000Z', author: 'Olivia Bennett', summary: 'Demonstration private owner record for Aurora. Cockpit and fishing equipment cleaned and checked.', checks: [{ label: 'Cockpit and fishing equipment', status: 'passed' }], workPerformed: ['Completed freshwater washdown and tackle storage care.'], revision: 1, attachments: [attachment('doc-aurora-registration', 'Aurora — sample registration.txt')] },
  ],
  requests: [
    { id: 'request-pump', vesselId: 'vessel-serenity', title: 'Port raw-water pump seal', description: 'Light drip observed during the October 9 systems check. Please review the proposed seal replacement.', category: 'Maintenance & systems', priority: 'soon', status: 'acknowledged', coordinator: 'Olivia Bennett', createdAt: '2026-10-09T18:40:00.000Z', messages: [
      { id: 'message-pump-1', author: 'Daniel Rivera', text: 'The drip was observed dockside and documented in your inspection. A specialist has provided a proposed scope.', createdAt: '2026-10-09T18:42:00.000Z' },
      { id: 'message-pump-2', author: 'Olivia Bennett', text: 'Estimate version 1 is ready for your review. We will confirm the appointment after your decision.', createdAt: '2026-10-10T09:00:00.000Z' },
    ], attachments: [] },
    { id: 'request-provisions', vesselId: 'vessel-serenity', title: 'Prepare for our October weekend', description: 'Please prepare Serenity for four guests arriving October 17. Fresh fruit, sparkling water and light lunch provisions requested.', category: 'Yacht concierge', priority: 'routine', status: 'scheduled', coordinator: 'Olivia Bennett', createdAt: '2026-10-06T16:20:00.000Z', desiredDate: '2026-10-17', messages: [{ id: 'message-provisions-1', author: 'Olivia Bennett', text: 'Your arrival preparation is scheduled for October 16. Provisioning preferences are on file.', createdAt: '2026-10-07T13:00:00.000Z' }], attachments: [] },
    { id: 'request-solstice-wash', vesselId: 'vessel-solstice', title: 'Post-cruise exterior wash', description: 'Please arrange an exterior wash after the afternoon cruise.', category: 'Exterior detailing', priority: 'routine', status: 'completed', coordinator: 'Mia Santos', createdAt: '2026-10-04T20:00:00.000Z', messages: [{ id: 'message-solstice-1', author: 'Mia Santos', text: 'Washdown and cockpit refresh completed October 8. The service record is published.', createdAt: '2026-10-08T15:15:00.000Z' }], attachments: [] },
    { id: 'request-aurora-private', vesselId: 'vessel-aurora', title: 'Aurora private provisioning', description: 'Demonstration record visible only to the assigned owner and management.', category: 'Yacht concierge', priority: 'routine', status: 'submitted', coordinator: 'Unassigned', createdAt: '2026-10-09T10:00:00.000Z', messages: [], attachments: [] },
  ],
  estimates: [
    { id: 'estimate-pump-v1', vesselId: 'vessel-serenity', requestId: 'request-pump', title: 'Port raw-water pump seal replacement', version: 1, currency: 'USD', amount: 845, scope: ['Supply one replacement seal kit for the port raw-water pump.', 'Specialist labor to remove, reseal and reinstall the pump.', 'Dockside run and leak check; record work in service history.', 'Includes estimated parts and labor. Additional work requires a new estimate.'], status: 'pending' },
    { id: 'estimate-solstice-v1', vesselId: 'vessel-solstice', requestId: 'request-solstice-wash', title: 'Post-cruise exterior care', version: 1, currency: 'USD', amount: 285, scope: ['Exterior washdown, glass care and cockpit refresh.'], status: 'approved', decidedBy: 'Alex Morgan', decidedAt: '2026-10-05T12:00:00.000Z' },
    { id: 'estimate-aurora-v1', vesselId: 'vessel-aurora', requestId: 'request-aurora-private', title: 'Private owner provisioning', version: 1, currency: 'USD', amount: 325, scope: ['Demonstration private provisioning scope.'], status: 'pending' },
  ],
  visits: [
    { id: 'visit-serenity-next', vesselId: 'vessel-serenity', title: 'Weekly care & systems check', date: '2026-10-13', time: '09:00', category: 'Maintenance & systems', assignedTo: 'Daniel Rivera', status: 'scheduled', notes: 'Dockside service. Recheck aft bilge and port pump area.' },
    { id: 'visit-serenity-arrival', vesselId: 'vessel-serenity', requestId: 'request-provisions', title: 'Your arrival, considered', date: '2026-10-16', time: '13:00', category: 'Yacht concierge', assignedTo: 'Mia Santos', status: 'scheduled', notes: 'Interior refresh and provisioning for four guests.' },
    { id: 'visit-solstice-next', vesselId: 'vessel-solstice', title: 'Exterior wash & deck care', date: '2026-10-15', time: '10:00', category: 'Exterior detailing', assignedTo: 'Mia Santos', status: 'scheduled' },
    { id: 'visit-aurora-private', vesselId: 'vessel-aurora', title: 'Sportfish weekly care', date: '2026-10-14', time: '08:30', category: 'Exterior detailing', assignedTo: 'Olivia Bennett', status: 'scheduled' },
  ],
  documents: [
    { id: 'doc-serenity-inspection', vesselId: 'vessel-serenity', title: 'October 9 · Systems inspection', category: 'Inspection reports', date: '2026-10-09', size: '2 KB' },
    { id: 'doc-serenity-insurance', vesselId: 'vessel-serenity', title: 'Vessel insurance · Sample', category: 'Insurance', date: '2026-01-01', expiresAt: '2026-11-01', size: '1 KB' },
    { id: 'doc-serenity-storm', vesselId: 'vessel-serenity', title: 'Hurricane plan · Sample', category: 'Vessel documents', date: '2026-06-01', expiresAt: '2027-06-01', size: '1 KB' },
    { id: 'doc-serenity-manual', vesselId: 'vessel-serenity', title: 'Equipment reference · Sample', category: 'Manuals', date: '2026-02-14', size: '1 KB' },
    { id: 'doc-solstice-service', vesselId: 'vessel-solstice', title: 'October care summary · Sample', category: 'Service summaries', date: '2026-10-08', size: '1 KB' },
    { id: 'doc-aurora-registration', vesselId: 'vessel-aurora', title: 'Aurora registration · Sample', category: 'Registration', date: '2026-03-01', expiresAt: '2027-03-01', size: '1 KB' },
  ],
};

export function sampleDocument(document: DocumentRecord): string {
  const report = seedRecords.reports.find(record => record.attachments.some(item => item.id === document.id));
  return `LAS OLAS YACHT MANAGEMENT\nDEMONSTRATION DOCUMENT — NOT A REAL POLICY, REGISTRATION OR SERVICE CERTIFICATE\n\n${document.title}\nVessel: ${seedRecords.vessels.find(vessel => vessel.id === document.vesselId)?.name}\nRecord date: ${document.date}\n${document.expiresAt ? `Sample expiry date: ${document.expiresAt}\n` : ''}\n${report ? `${report.summary}\n\nRecorded checks\n${report.checks.map(check => `- ${check.label}: ${check.status}${check.value ? ` — ${check.value}` : ''}`).join('\n')}\n\nWork performed\n${report.workPerformed.map(item => `- ${item}`).join('\n')}` : 'This is a clearly labeled sample file for testing controlled downloads. Replace it with a business-approved document before use with real clients.'}\n\nNo insurer, registration authority or equipment manufacturer is connected. All records are demonstration data.\n`;
}

export function demoNotifications(user: User): Notification[] {
  return [
    { id: `notification-${user.id}-report`, vesselId: user.vesselIds[0], title: 'Your service record is ready', body: 'The latest demonstration service report has been published.', createdAt: '2026-10-09T18:35:00.000Z', read: false, type: 'report' },
    { id: `notification-${user.id}-estimate`, vesselId: user.vesselIds[0], title: 'A decision for your attention', body: 'An estimate is ready to review. Approvals record a decision and do not collect payment.', createdAt: '2026-10-10T09:00:00.000Z', read: false, type: 'approval' },
    { id: `notification-${user.id}-visit`, vesselId: user.vesselIds[0], title: 'The next visit is on your calendar', body: 'View upcoming scheduled care for your vessel.', createdAt: '2026-10-08T15:00:00.000Z', read: true, type: 'reminder' },
  ];
}
