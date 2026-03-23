export type SyncStatus = 'success' | 'partial' | 'failed';

export interface SyncConfig {
  id: string;
  ownerUid: string;
  timetreeAccountId: string;
  googleAccountId: string;
  timetreeCalendarId: string;
  googleCalendarId: string;
  isEnabled: boolean;
  syncIntervalMinutes: number; // 1, 3, 5, 10, 15
  createdAt: Date;
  updatedAt: Date;
}

export interface SyncLog {
  id: string;
  syncConfigId: string;
  ownerUid: string;
  status: SyncStatus;
  eventsCreated: number;
  eventsUpdated: number;
  eventsDeleted: number;
  eventsSkipped: number;
  errorMessage?: string;
  executedAt: Date;
  durationMs: number;
}

export interface SyncAction {
  type: 'create' | 'update' | 'delete';
  eventId?: string;
  title: string;
  timetreeId: string;
  startTime: Date;
  endTime: Date;
  description?: string;
}
