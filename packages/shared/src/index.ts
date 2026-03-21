// Calendar Hub - Shared types and utilities

export type CalendarProvider = 'google' | 'timetree';

export type EventStatus = 'confirmed' | 'tentative' | 'cancelled';

export type AiSuggestionStatus = 'pending' | 'accepted' | 'rejected';

export type AiSuggestionType = 'schedule' | 'break' | 'task';

export type NotificationChannel = 'google_chat' | 'email';

export interface CalendarEvent {
  id: string;
  source: CalendarProvider;
  originalId: string;
  calendarId: string;
  title: string;
  description?: string;
  start: Date;
  end: Date;
  isAllDay: boolean;
  status: EventStatus;
  location?: string;
}

export interface ConnectedAccount {
  id: string;
  provider: CalendarProvider;
  email: string;
  calendarIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface AiSuggestion {
  id: string;
  type: AiSuggestionType;
  proposedEvent: Omit<CalendarEvent, 'id' | 'source' | 'originalId'>;
  status: AiSuggestionStatus;
  reasoning: string;
  createdAt: Date;
}

export interface UserProfile {
  workSchedule: {
    workDays: number[];
    workStartHour: number;
    workEndHour: number;
    focusTimePreference?: { startHour: number; endHour: number };
  };
  lifestyle: {
    sleepStartHour: number;
    sleepEndHour: number;
    mealTimes?: { breakfast?: number; lunch?: number; dinner?: number };
  };
  preferences: {
    minBreakMinutes: number;
    maxConsecutiveMeetingMinutes: number;
    bufferBetweenEventsMinutes: number;
  };
}

export interface NotificationSettings {
  enabled: boolean;
  channels: NotificationChannel[];
  dailySummary: boolean;
  dailySummaryTime?: number;
  beforeEventMinutes?: number;
  aiSuggestionNotify: boolean;
}
