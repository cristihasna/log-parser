import { ParsedEvent, RawLogEntry, EventType, ParserState } from './types';

/**
 * Parse the timestamp from a log line
 * Format: DD/MM/YYYY, HH:MM - Author: message
 */
export function parseLogLine(line: string): RawLogEntry | null {
  const match = line.match(/^(\d{2})\/(\d{2})\/(\d{4}),\s+(\d{1,2}):(\d{2})\s+-\s+([^:]+):\s*(.*)$/);
  if (!match) return null;

  const [, day, month, year, hour, minute, author, message] = match;
  const date = new Date(
    parseInt(year),
    parseInt(month) - 1,
    parseInt(day),
    parseInt(hour),
    parseInt(minute)
  );

  return { date, author: author.trim(), message: message.trim() };
}

/**
 * Extract time from message text
 * Handles formats like: 21:12, 2:35, 22: 15 (with space)
 */
export function extractTimeFromMessage(message: string): { hour: number; minute: number } | null {
  // Match time patterns like "21:12", "2:35", "22: 15"
  const timeMatch = message.match(/(\d{1,2}):\s*(\d{2})(?!\d)/);
  if (timeMatch) {
    return {
      hour: parseInt(timeMatch[1]),
      minute: parseInt(timeMatch[2])
    };
  }
  return null;
}

/**
 * Extract time range from message (e.g., "10:20 - 10:30" or "10:20-10:30")
 */
export function extractTimeRange(message: string): { start: { hour: number; minute: number }; end: { hour: number; minute: number } } | null {
  const rangeMatch = message.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
  if (rangeMatch) {
    return {
      start: { hour: parseInt(rangeMatch[1]), minute: parseInt(rangeMatch[2]) },
      end: { hour: parseInt(rangeMatch[3]), minute: parseInt(rangeMatch[4]) }
    };
  }
  return null;
}

/**
 * Combine the date from log timestamp with time from message text
 */
export function combineDateTime(logDate: Date, time: { hour: number; minute: number }): Date {
  const result = new Date(logDate);
  result.setHours(time.hour, time.minute, 0, 0);
  return result;
}

/**
 * Check if message indicates a feed-related action
 */
function isFeedMessage(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  return /\b(papa|papica|papics|papatil|mâncat|biberon)\b/.test(lowerMessage);
}

/**
 * Check if message indicates a sleep-related action
 */
function isSleepMessage(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  return /\b(somn|somnic|dormit|trezit|adormit)\b/.test(lowerMessage);
}

/**
 * Check if message indicates start of an action
 */
function isStartIndicator(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  return /\b(start|stat|incercam|inceput|tentativa|continuam|continuat)\b/.test(lowerMessage);
}

/**
 * Check if message indicates end/stop of an action
 */
function isStopIndicator(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  return /\b(stop|gata|terminat|pauza|trezit)\b/.test(lowerMessage);
}

/**
 * Check if message indicates a diaper change
 */
function isDiaperChange(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  return /\bschimb(at|uri|)?\b/.test(lowerMessage);
}

/**
 * Determine diaper type from message
 */
function getDiaperType(message: string): 'WET_DIAPER_CHANGE' | 'DIRTY_DIAPER_CHANGE' | 'DIAPER_CHANGE' {
  const lowerMessage = message.toLowerCase();
  const hasWet = /\b(pipi|pisu|pipu)\b/.test(lowerMessage);
  const hasDirty = /\b(caca|pârț|partz)\b/.test(lowerMessage);

  if (hasWet && hasDirty) {
    // Both wet and dirty - we could return both events, but for simplicity return DIAPER_CHANGE
    // Actually, let's prioritize dirty as it includes both types of waste
    return 'DIAPER_CHANGE';
  } else if (hasDirty) {
    return 'DIRTY_DIAPER_CHANGE';
  } else if (hasWet) {
    return 'WET_DIAPER_CHANGE';
  }
  return 'DIAPER_CHANGE';
}

/**
 * Check if message contains weight information
 */
function extractWeight(message: string): number | null {
  const lowerMessage = message.toLowerCase();
  if (/\b(cantarit|greutate)\b/.test(lowerMessage)) {
    const weightMatch = message.match(/(\d{3,4})\s*g\b/);
    if (weightMatch) {
      return parseInt(weightMatch[1]);
    }
  }
  return null;
}

/**
 * Parse a single log entry and return parsed events
 */
export function parseEntry(entry: RawLogEntry, state: ParserState): ParsedEvent[] {
  const events: ParsedEvent[] = [];
  const message = entry.message;
  const lowerMessage = message.toLowerCase();

  // Skip deleted messages
  if (lowerMessage.includes('this message was deleted') || lowerMessage.includes('you deleted this message')) {
    return events;
  }

  // Extract time from message, or use log timestamp
  const extractedTime = extractTimeFromMessage(message);
  const timeRange = extractTimeRange(message);

  // Helper to create timestamp
  const createTimestamp = (time: { hour: number; minute: number } | null): Date => {
    if (time) {
      return combineDateTime(entry.date, time);
    }
    return entry.date;
  };

  // Check for weight
  const weight = extractWeight(message);
  if (weight !== null) {
    events.push({
      timestamp: createTimestamp(extractedTime),
      type: 'WEIGHT',
      rawMessage: message,
      weight
    });
  }

  // Check for diaper change
  if (isDiaperChange(message)) {
    const diaperType = getDiaperType(message);
    
    // Check if this is both wet and dirty - create two events
    const hasWet = /\b(pipi|pisu|pipu)\b/.test(lowerMessage);
    const hasDirty = /\b(caca|pârț|partz)\b/.test(lowerMessage);
    
    if (hasWet && hasDirty) {
      events.push({
        timestamp: createTimestamp(extractedTime),
        type: 'WET_DIAPER_CHANGE',
        rawMessage: message
      });
      events.push({
        timestamp: createTimestamp(extractedTime),
        type: 'DIRTY_DIAPER_CHANGE',
        rawMessage: message
      });
    } else {
      events.push({
        timestamp: createTimestamp(extractedTime),
        type: diaperType,
        rawMessage: message
      });
    }
  }

  // Handle time ranges (e.g., "papa 10:20-10:30")
  if (timeRange) {
    if (isFeedMessage(message)) {
      events.push({
        timestamp: combineDateTime(entry.date, timeRange.start),
        type: 'START_FEED',
        rawMessage: message
      });
      events.push({
        timestamp: combineDateTime(entry.date, timeRange.end),
        type: 'END_FEED',
        rawMessage: message
      });
      state.lastFeedWasStop = true;
      return events;
    }
    if (isSleepMessage(message)) {
      events.push({
        timestamp: combineDateTime(entry.date, timeRange.start),
        type: 'START_SLEEP',
        rawMessage: message
      });
      events.push({
        timestamp: combineDateTime(entry.date, timeRange.end),
        type: 'STOP_SLEEP',
        rawMessage: message
      });
      state.lastSleepWasStop = true;
      return events;
    }
  }

  // Handle feed events
  if (isFeedMessage(message) && !isDiaperChange(message)) {
    const isStart = isStartIndicator(message);
    const isStop = isStopIndicator(message);

    if (isStart && isStop) {
      // Message contains both (e.g., "stop papa si start somn")
      // Need to parse more carefully
      const stopFirst = lowerMessage.indexOf('stop') < lowerMessage.indexOf('start') ||
                       lowerMessage.indexOf('gata') < lowerMessage.indexOf('start') ||
                       lowerMessage.indexOf('terminat') < lowerMessage.indexOf('start');
      
      if (stopFirst || (!isStart && isStop)) {
        events.push({
          timestamp: createTimestamp(extractedTime),
          type: 'END_FEED',
          rawMessage: message
        });
        state.lastFeedWasStop = true;
      }
      if (isStart) {
        events.push({
          timestamp: createTimestamp(extractedTime),
          type: 'START_FEED',
          rawMessage: message
        });
        state.lastFeedWasStop = false;
      }
    } else if (isStop) {
      events.push({
        timestamp: createTimestamp(extractedTime),
        type: 'END_FEED',
        rawMessage: message
      });
      state.lastFeedWasStop = true;
    } else if (isStart) {
      events.push({
        timestamp: createTimestamp(extractedTime),
        type: 'START_FEED',
        rawMessage: message
      });
      state.lastFeedWasStop = false;
    } else {
      // No explicit start/stop - infer from state
      // If last feed was stop, this is a start
      if (state.lastFeedWasStop) {
        events.push({
          timestamp: createTimestamp(extractedTime),
          type: 'START_FEED',
          rawMessage: message
        });
        state.lastFeedWasStop = false;
      } else {
        events.push({
          timestamp: createTimestamp(extractedTime),
          type: 'END_FEED',
          rawMessage: message
        });
        state.lastFeedWasStop = true;
      }
    }
  }

  // Handle sleep events
  if (isSleepMessage(message) && !isFeedMessage(message)) {
    const isStart = isStartIndicator(message);
    const isStop = isStopIndicator(message);

    // "trezit" is specifically a stop indicator for sleep
    const isTrezit = lowerMessage.includes('trezit');

    if (isStart && isStop && !isTrezit) {
      // Message contains both
      const stopFirst = lowerMessage.indexOf('stop') < (lowerMessage.indexOf('start') === -1 ? Infinity : lowerMessage.indexOf('start'));
      
      if (stopFirst) {
        events.push({
          timestamp: createTimestamp(extractedTime),
          type: 'STOP_SLEEP',
          rawMessage: message
        });
        state.lastSleepWasStop = true;
      }
      if (isStart && !isTrezit) {
        events.push({
          timestamp: createTimestamp(extractedTime),
          type: 'START_SLEEP',
          rawMessage: message
        });
        state.lastSleepWasStop = false;
      }
    } else if (isStop || isTrezit) {
      events.push({
        timestamp: createTimestamp(extractedTime),
        type: 'STOP_SLEEP',
        rawMessage: message
      });
      state.lastSleepWasStop = true;
    } else if (isStart) {
      events.push({
        timestamp: createTimestamp(extractedTime),
        type: 'START_SLEEP',
        rawMessage: message
      });
      state.lastSleepWasStop = false;
    } else if (/\bdormit\b/.test(lowerMessage)) {
      // "dormit pana la X" indicates sleep that ended
      events.push({
        timestamp: createTimestamp(extractedTime),
        type: 'STOP_SLEEP',
        rawMessage: message
      });
      state.lastSleepWasStop = true;
    } else {
      // Standalone "Somn HH:MM" is a start
      if (/\b(somn|somnic)\s+\d/.test(lowerMessage)) {
        events.push({
          timestamp: createTimestamp(extractedTime),
          type: 'START_SLEEP',
          rawMessage: message
        });
        state.lastSleepWasStop = false;
      }
    }
  }

  // Handle combined messages like "stop papa si start somn"
  if (isFeedMessage(message) && isSleepMessage(message)) {
    const feedStop = /\b(stop|gata|terminat)\s+(papa|papica)\b/.test(lowerMessage);
    const feedStart = /\bstart\s+(papa|papica)\b/.test(lowerMessage);
    const sleepStop = /\b(stop|trezit)\s*(somn|somnic)?\b/.test(lowerMessage);
    const sleepStart = /\b(start|incercam)\s+(somn|somnic)\b/.test(lowerMessage) || 
                      /\b(somn|somnic)\s+\d/.test(lowerMessage);

    // Only add events that weren't already added
    const hasEvent = (type: EventType) => events.some(e => e.type === type);

    if (feedStop && !hasEvent('END_FEED')) {
      events.push({
        timestamp: createTimestamp(extractedTime),
        type: 'END_FEED',
        rawMessage: message
      });
      state.lastFeedWasStop = true;
    }
    if (feedStart && !hasEvent('START_FEED')) {
      events.push({
        timestamp: createTimestamp(extractedTime),
        type: 'START_FEED',
        rawMessage: message
      });
      state.lastFeedWasStop = false;
    }
    if (sleepStop && !hasEvent('STOP_SLEEP')) {
      events.push({
        timestamp: createTimestamp(extractedTime),
        type: 'STOP_SLEEP',
        rawMessage: message
      });
      state.lastSleepWasStop = true;
    }
    if (sleepStart && !hasEvent('START_SLEEP')) {
      events.push({
        timestamp: createTimestamp(extractedTime),
        type: 'START_SLEEP',
        rawMessage: message
      });
      state.lastSleepWasStop = false;
    }
  }

  return events;
}

/**
 * Parse all log lines
 */
export function parseLogFile(content: string): ParsedEvent[] {
  const lines = content.split('\n');
  const events: ParsedEvent[] = [];
  const state: ParserState = {
    lastFeedWasStop: true, // Assume we start fresh
    lastSleepWasStop: true
  };

  let currentEntry: RawLogEntry | null = null;

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    const parsed = parseLogLine(trimmedLine);
    
    if (parsed) {
      // Process previous entry if exists
      if (currentEntry) {
        const entryEvents = parseEntry(currentEntry, state);
        events.push(...entryEvents);
      }
      currentEntry = parsed;
    } else if (currentEntry) {
      // This is a continuation of the previous message
      currentEntry.message += ' ' + trimmedLine;
    }
  }

  // Process the last entry
  if (currentEntry) {
    const entryEvents = parseEntry(currentEntry, state);
    events.push(...entryEvents);
  }

  // Sort events by timestamp
  events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  return events;
}
