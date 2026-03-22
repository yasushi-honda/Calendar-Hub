// Calendar Hub - Shared types and utilities

export { encrypt, decrypt, type EncryptedData } from './crypto.js';
export { calculateFreeSlots, type FreeSlot, type FreeTimeOptions } from './free-time.js';
export {
  DURATION_OPTIONS,
  type BookingLinkStatus,
  type BookingStatus,
  type DurationOption,
  type BookingLinkFreeTimeOptions,
  type BookingLink,
  type PublicBookingLinkInfo,
  type Booking,
  type PublicBookingConfirmation,
  type BookingSlot,
  type CreateBookingLinkInput,
  type CreateBookingInput,
} from './booking-types.js';

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
  userId: string;
  provider: CalendarProvider;
  email: string;
  encryptedRefreshToken: string;
  iv: string;
  authTag: string;
  encryptionKeyVersion: string;
  scopes: string[];
  calendarIds: string[];
  isActive: boolean;
  lastTokenRefreshAt: Date;
  connectedAt: Date;
}

export interface ConnectedAccountPublic {
  id: string;
  provider: CalendarProvider;
  email: string;
  calendarIds: string[];
  isActive: boolean;
  connectedAt: Date;
}

export interface UserDocument {
  email: string;
  displayName: string;
  primaryGoogleAccountId: string | null;
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
