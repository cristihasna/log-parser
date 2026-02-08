export type EventType =
  | 'START_FEED'
  | 'STOP_FEED'
  | 'START_SLEEP'
  | 'STOP_SLEEP'
  | 'DIAPER_CHANGE'
  | 'COMMENT'
  | 'WEIGHT';

export type DiaperChangeType = 'WET' | 'DIRTY' | 'WET_AND_DIRTY';

export interface ParsedEvent {
  timestamp: string; // ISO format: YYYY-MM-DDTHH:MM
  type: EventType;
  rawMessage: string;
  weight?: number; // in grams, for WEIGHT events
  diaperChangeType?: DiaperChangeType; // for DIAPER_CHANGE events
}

export interface RawLogEntry {
  date: Date;
  author: string;
  message: string;
}

// Legacy - kept for backward compatibility during migration
export interface LegacyParsedEvent {
  timestamp: Date;
  type: string;
  rawMessage: string;
  details?: string;
  weight?: number;
}

export interface ParserState {
  lastFeedWasStop: boolean;
  lastSleepWasStop: boolean;
}

// Aggregated daily statistics types

export interface FeedingSession {
  startTime: string; // HH:MM format
  endTime: string; // HH:MM format
  durationMinutes: number;
  rawMessages: string[]; // Original messages for start and stop events
}

export interface NapSession {
  startTime: string; // HH:MM format
  endTime: string; // HH:MM format
  durationMinutes: number;
  isNightSleep: boolean; // true if during night hours (19:00-07:00)
  rawMessages: string[]; // Original messages for start and stop events
}

export interface Comment {
  time: string; // HH:MM format
  message: string;
}

export interface DaySummary {
  date: string; // YYYY-MM-DD format
  totalSleepTime: number; // minutes
  totalFeedingTime: number; // minutes
  wetDiaperChanges: number;
  dirtyDiaperChanges: number;
  mixedDiaperChanges: number; // WET_AND_DIRTY
  totalDiaperChanges: number; // Total number ofdiaper changes in a day
  totalNightSleepTime: number; // minutes (19:00-07:00)
  totalDaySleepTime: number; // minutes (07:00-19:00)
  napSessions: number;
  averageDaySleepDuration: number; // minutes per nap during day
  averageDayWakeDuration: number; // minutes awake between naps during day
  averageNightWakeDuration: number; // minutes awake between naps during night
  averageNightSleepDuration: number; // minutes per sleep segment during night
  averageInBetweenFeedsDuration: number; // minutes between feeding sessions
  feedingSessions: number;
  totalNightWakeUps: number; // wake-ups between 19:00-07:00
  feedings: FeedingSession[];
  naps: NapSession[];
  comments: Comment[]; // General comments/observations for the day
  weight?: number; // grams (if mentioned during the day)
}

// Remove legacy ParsedEventJSON - use ParsedEvent instead
