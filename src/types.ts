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

export interface FeedingSession {
  start: string; // ISO local datetime: YYYY-MM-DDTHH:mm:ss
  end: string; // ISO local datetime: YYYY-MM-DDTHH:mm:ss
  durationMinutes: number;
  rawMessages: string[]; // Original messages for start and stop events
}

export interface NapSession {
  start: string; // ISO local datetime: YYYY-MM-DDTHH:mm:ss
  end: string; // ISO local datetime: YYYY-MM-DDTHH:mm:ss
  durationMinutes: number;
  isNightSleep: boolean; // true if during night hours (19:00-07:00)
  rawMessages: string[]; // Original messages for start and stop events
}

export interface DiaperChange {
  time: string; // ISO local datetime: YYYY-MM-DDTHH:mm:ss
  type: DiaperChangeType;
  rawMessage: string; // Original message for the diaper change event
}

export interface Comment {
  time: string; // ISO local datetime: YYYY-MM-DDTHH:mm:ss
  message: string;
}

export interface DaySummary {
  date: string; // YYYY-MM-DD format
  totalSleepTime24h: number; // minutes
  totalNightSleepTime24h: number; // minutes
  totalFeedingTime24h: number; // minutes
  totalDaySleepTime: number; // minutes
  wetDiaperChanges: number;
  dirtyDiaperChanges: number;
  mixedDiaperChanges: number; // WET_AND_DIRTY
  totalDiaperChanges: number; // Total number ofdiaper changes in a day
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
  diaperChanges: DiaperChange[]; // List of diaper changes with time and type
  weight?: number; // grams (if mentioned during the day)
}
