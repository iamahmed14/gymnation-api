import { Agreement, Member, Plan, ReconciliationRun } from './types';

// In-memory state. Every run of the app starts empty.
// All reads and writes are synchronous, so a check followed by a write can never
// interleave with another request — that is what keeps the "may not" rules safe under races.
export const store = {
  members: new Map<string, Member>(),
  memberIdByPhone: new Map<string, string>(), // E.164 phone -> member id
  plans: new Map<string, Plan>(),
  agreements: new Map<string, Agreement>(),
  runs: new Map<string, ReconciliationRun>(),
};

export function resetStore() {
  Object.values(store).forEach((map) => map.clear());
}
