export type EventType =
  | 'START_FEED'
  | 'END_FEED'
  | 'START_SLEEP'
  | 'STOP_SLEEP'
  | 'WET_DIAPER_CHANGE'
  | 'DIRTY_DIAPER_CHANGE'
  | 'DIAPER_CHANGE'
  | 'WEIGHT';

export interface ParsedEvent {
  timestamp: Date;
  type: EventType;
  rawMessage: string;
  details?: string;
  weight?: number; // in grams, for WEIGHT events
}

export interface RawLogEntry {
  date: Date;
  author: string;
  message: string;
}

export interface ParserState {
  lastFeedWasStop: boolean;
  lastSleepWasStop: boolean;
}

// Aggregated daily statistics types

export interface FeedingSession {
  startTime: string; // HH:MM format
  endTime: string;   // HH:MM format
  durationMinutes: number;
}

export interface NapSession {
  startTime: string; // HH:MM format
  endTime: string;   // HH:MM format
  durationMinutes: number;
  isNightSleep: boolean; // true if during night hours (19:00-07:00)
}

export interface DaySummary {
  date: string; // YYYY-MM-DD format
  totalSleepTime: number; // minutes
  totalFeedingTime: number; // minutes
  wetDiaperChanges: number;
  dirtyDiaperChanges: number;
  totalNightSleepTime: number; // minutes (19:00-07:00)
  totalDaySleepTime: number; // minutes (07:00-19:00)
  napSessions: number;
  averageDaySleepDuration: number; // minutes per nap during day
  averageNightSleepDuration: number; // minutes per sleep segment during night
  feedingSessions: number;
  totalNightWakeUps: number; // wake-ups between 19:00-07:00
  feedings: FeedingSession[];
  naps: NapSession[];
  weight?: number; // grams (if mentioned during the day)
}

export interface ParsedEventJSON {
  timestamp: string;
  type: EventType;
  rawMessage: string;
  details?: string;
  weight?: number;
}
