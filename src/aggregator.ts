import dayjs from 'dayjs';
import { DaySummary, DiaperChange, EventType, NapSession, ParsedEvent } from './types';

// Night hours: 21:00 to 08:00
const NIGHT_START_HOUR = process.env.NIGHT_START_HOUR ? parseInt(process.env.NIGHT_START_HOUR, 10) : 21;
const NIGHT_END_HOUR = process.env.NIGHT_END_HOUR ? parseInt(process.env.NIGHT_END_HOUR, 10) : 8;

/**
 * Check if a given hour is during night time
 */
function isNightTime(hour: number): boolean {
  return hour >= NIGHT_START_HOUR || hour < NIGHT_END_HOUR;
}

/**
 * Parse timestamp string to Date object
 */
function parseTimestamp(timestamp: string): Date {
  return new Date(timestamp);
}

/**
 * Format time as HH:MM
 */
function formatTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/**
 * Get date string in YYYY-MM-DD format
 */
function getDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Calculate duration in minutes between two dates
 */
function getDurationMinutes(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60));
}

/**
 * Build a dayjs datetime for a session time stored as HH:MM.
 * If endTime is earlier than startTime, it means the session crossed midnight.
 */
function getSessionDateTime(
  dateStr: string,
  time: string,
  startTime?: string,
  mode: 'start' | 'end' = 'start',
): dayjs.Dayjs {
  let dateTime = dayjs(`${dateStr}T${time}`);

  if (mode === 'end' && startTime && time < startTime) {
    dateTime = dateTime.add(1, 'day');
  }

  return dateTime;
}

/**
 * Split a session that spans midnight or crosses night/day boundaries
 * Returns the minutes that fall within night time and day time
 */
function splitSessionByNightDay(start: Date, end: Date): { nightMinutes: number; dayMinutes: number } {
  let nightMinutes = 0;
  let dayMinutes = 0;

  // Iterate minute by minute (simplified approach)
  const current = new Date(start);
  while (current < end) {
    if (isNightTime(current.getHours())) {
      nightMinutes++;
    } else {
      dayMinutes++;
    }
    current.setMinutes(current.getMinutes() + 1);
  }

  return { nightMinutes, dayMinutes };
}

/**
 * Assign a session to a specific date (based on start time)
 * For sessions spanning midnight, we'll assign to the date where they started
 */
function getSessionDate(startTime: Date): string {
  return getDateString(startTime);
}

interface SessionMatch {
  start: ParsedEvent;
  end: ParsedEvent | null;
}

/**
 * Match START and STOP events to create complete sessions
 */
function matchSessions(events: ParsedEvent[], startType: EventType, endType: EventType): SessionMatch[] {
  const sessions: SessionMatch[] = [];
  let currentStart: ParsedEvent | null = null;

  for (const event of events) {
    if (event.type === startType) {
      // If we have an unclosed session, close it with this new start
      if (currentStart) {
        sessions.push({ start: currentStart, end: null });
      }
      currentStart = event;
    } else if (event.type === endType && currentStart) {
      sessions.push({ start: currentStart, end: event });
      currentStart = null;
    }
  }

  // Handle unclosed session at the end
  if (currentStart) {
    sessions.push({ start: currentStart, end: null });
  }

  return sessions;
}

/**
 * Group events by date
 */
function groupEventsByDate(events: ParsedEvent[]): Map<string, ParsedEvent[]> {
  const grouped = new Map<string, ParsedEvent[]>();

  for (const event of events) {
    const date = getDateString(parseTimestamp(event.timestamp));
    if (!grouped.has(date)) {
      grouped.set(date, []);
    }
    grouped.get(date)!.push(event);
  }

  return grouped;
}

/**
 * Count wake-ups during night time
 * A wake-up is when STOP_SLEEP occurs during night hours
 */
function countNightWakeUps(events: ParsedEvent[], dateStr: string): number {
  let count = 0;

  for (const event of events) {
    if (event.type === 'STOP_SLEEP') {
      const eventDate = parseTimestamp(event.timestamp);
      const eventDateStr = getDateString(eventDate);

      // Check if this wake-up is during night hours
      // Night of this date: 19:00 of this date to 07:00 of next date
      // Or night from previous date: 19:00 of prev date to 07:00 of this date
      if (eventDateStr === dateStr && isNightTime(eventDate.getHours())) {
        count++;
      }
    }
  }

  return count;
}

/**
 * Aggregate parsed events into daily summaries
 */
export function aggregateByDay(events: ParsedEvent[]): DaySummary[] {
  // Sort events by timestamp
  const sortedEvents = [...events].sort(
    (a, b) => parseTimestamp(a.timestamp).getTime() - parseTimestamp(b.timestamp).getTime(),
  );

  // Match feeding sessions
  const feedingSessions = matchSessions(sortedEvents, 'START_FEED', 'STOP_FEED');

  // Match sleep sessions
  const sleepSessions = matchSessions(sortedEvents, 'START_SLEEP', 'STOP_SLEEP');

  // Group events by date
  const eventsByDate = groupEventsByDate(sortedEvents);

  // Get all unique dates
  const allDates = new Set<string>();
  for (const event of sortedEvents) {
    allDates.add(getDateString(parseTimestamp(event.timestamp)));
  }

  // Also add dates from sessions (they might span multiple dates)
  for (const session of [...feedingSessions, ...sleepSessions]) {
    if (session.start) {
      allDates.add(getDateString(parseTimestamp(session.start.timestamp)));
    }
    if (session.end) {
      allDates.add(getDateString(parseTimestamp(session.end.timestamp)));
    }
  }

  const summaries: DaySummary[] = [];

  for (const dateStr of Array.from(allDates).sort()) {
    const dayEvents = eventsByDate.get(dateStr) || [];

    // Initialize summary
    const summary: DaySummary = {
      date: dateStr,
      totalSleepTime: 0,
      totalFeedingTime: 0,
      wetDiaperChanges: 0,
      dirtyDiaperChanges: 0,
      mixedDiaperChanges: 0,
      totalDiaperChanges: 0,
      totalNightSleepTime: 0,
      totalDaySleepTime: 0,
      napSessions: 0,
      averageDaySleepDuration: 0,
      averageDayWakeDuration: 0,
      averageInBetweenFeedsDuration: 0,
      averageNightSleepDuration: 0,
      averageNightWakeDuration: 0,
      feedingSessions: 0,
      totalNightWakeUps: 0,
      feedings: [],
      naps: [],
      comments: [],
      diaperChanges: [],
    };

    // Process feeding sessions for this date

    feedingSessions.forEach((session, index) => {
      const startDate = parseTimestamp(session.start.timestamp);
      const sessionDateStr = getSessionDate(startDate);

      if (sessionDateStr === dateStr && session.end) {
        const endDate = parseTimestamp(session.end.timestamp);
        const duration = getDurationMinutes(startDate, endDate);

        // Skip invalid durations (negative or very long)
        if (duration > 0 && duration < 180) {
          // Max 3 hours for a feeding
          const rawMessages = [session.start.rawMessage];
          if (session.end) {
            rawMessages.push(session.end.rawMessage);
          }
          summary.feedings.push({
            startTime: formatTime(startDate),
            endTime: formatTime(endDate),
            durationMinutes: duration,
            rawMessages,
          });
          summary.totalFeedingTime += duration;
          summary.feedingSessions++;
        }
      }
    });

    if (summary.feedingSessions > 0) {
      const totalTImeInBetweenFeeds = 24 * 60 - summary.totalFeedingTime; // Total minutes in a day minus feeding time
      summary.averageInBetweenFeedsDuration = Math.round(
        totalTImeInBetweenFeeds / (summary.feedingSessions + 1), // +1 to account for time before first feed and after last feed
      );
    }

    // Process sleep sessions for this date
    let daySleepSessions: NapSession[] = [];
    let nightSleepSessions: NapSession[] = [];
    let morningSleepSessions: NapSession[] = [];
    let eveningSleepSessions: NapSession[] = [];

    const endOfPreviousNight = dayjs(dateStr).hour(NIGHT_END_HOUR).startOf('hour');
    const startOfNextNight = dayjs(dateStr).hour(NIGHT_START_HOUR).startOf('hour');

    for (const session of sleepSessions) {
      const startDate = parseTimestamp(session.start.timestamp);
      const sessionDateStr = getSessionDate(startDate);

      if (sessionDateStr !== dateStr || !session.end) {
        continue;
      }

      const endDate = parseTimestamp(session.end.timestamp);
      const duration = getDurationMinutes(startDate, endDate);

      // Skip invalid durations
      if (duration <= 0 || duration >= 720) {
        continue;
      }

      // Max 12 hours for a sleep
      // const { nightMinutes, dayMinutes } = splitSessionByNightDay(startDate, endDate);
      // is night sleep if it starts in the night interval, and awake time since previous sleep is less than half of the sleep duration
      // (to avoid classifying long naps that start in the morning as night sleep)
      const isNightSleep = isNightTime(startDate.getHours());

      const rawMessages = [session.start.rawMessage];
      if (session.end) {
        rawMessages.push(session.end.rawMessage);
      }
      const napSession: NapSession = {
        startTime: formatTime(startDate),
        endTime: formatTime(endDate),
        durationMinutes: duration,
        isNightSleep,
        rawMessages,
      };

      summary.naps.push(napSession);
      summary.totalSleepTime += duration;
      summary.napSessions++;

      if (isNightSleep && dayjs(startDate).isBefore(endOfPreviousNight)) {
        morningSleepSessions.push(napSession);
      } else if (isNightSleep && dayjs(startDate).isAfter(startOfNextNight)) {
        eveningSleepSessions.push(napSession);
      } else {
        daySleepSessions.push(napSession);
      }
    }

    // check if last mornign sleep can actually be considered night sleep based on the time since previous night's last nap
    if (morningSleepSessions.length >= 2) {
      const lastMorningNap = morningSleepSessions.at(-1)!;
      const previousMorningSleepEnd = morningSleepSessions.at(-2)!;
      const timeSincePreviousNap = dayjs(`${dateStr}T${lastMorningNap.startTime}`).diff(
        dayjs(`${dateStr}T${previousMorningSleepEnd.endTime}`),
        'minute',
      );

      if (timeSincePreviousNap > lastMorningNap.durationMinutes / 2 && lastMorningNap.durationMinutes >= 30) {
        // reclassify as day sleep
        lastMorningNap.isNightSleep = false;
        daySleepSessions.push(lastMorningNap);
        morningSleepSessions.pop();
      }
    }

    // check if first evening sleep can actually be considered night sleep based on the time untill the next evening nap
    if (eveningSleepSessions.length >= 2) {
      const firstEveningNap = eveningSleepSessions[0];
      const nextEveningNap = eveningSleepSessions[1];
      const timeUntilNextNap = dayjs(`${dateStr}T${nextEveningNap.startTime}`).diff(
        dayjs(`${dateStr}T${firstEveningNap.endTime}`),
        'minute',
      );

      if (timeUntilNextNap > firstEveningNap.durationMinutes / 2) {
        // reclassify as day sleep
        firstEveningNap.isNightSleep = false;
        daySleepSessions.push(firstEveningNap);
        eveningSleepSessions.shift();
      }
    }

    nightSleepSessions = [...morningSleepSessions, ...eveningSleepSessions];
    summary.totalDaySleepTime = daySleepSessions.reduce((sum, s) => sum + s.durationMinutes, 0);
    summary.totalNightSleepTime = nightSleepSessions.reduce((sum, s) => sum + s.durationMinutes, 0);

    // Store the night wake-up count in the summary
    summary.totalNightWakeUps = countNightWakeUps(sortedEvents, dateStr);

    // Calculate averages
    if (daySleepSessions.length > 0) {
      summary.averageDaySleepDuration = Math.round(
        daySleepSessions.reduce((sum, s) => sum + s.durationMinutes, 0) / daySleepSessions.length,
      );
    }
    if (nightSleepSessions.length > 0) {
      summary.averageNightSleepDuration = Math.round(
        nightSleepSessions.reduce((sum, s) => sum + s.durationMinutes, 0) / nightSleepSessions.length,
      );
    }

    if (daySleepSessions.length > 0) {
      // day time starts at the end of the last morning nap if it exists, otherwise at the night end hour
      const dayTimeStart =
        morningSleepSessions.length > 0
          ? getSessionDateTime(dateStr, morningSleepSessions.at(-1)!.endTime)
          : dayjs(dateStr).hour(NIGHT_END_HOUR).startOf('hour');
      const dayEndTime =
        eveningSleepSessions.length > 0
          ? getSessionDateTime(dateStr, eveningSleepSessions[0].startTime)
          : dayjs(dateStr).hour(NIGHT_START_HOUR).startOf('hour');

      const totalDayTime = dayEndTime.diff(dayTimeStart, 'minute');
      const totalTimeInBetweenDayNaps = totalDayTime - summary.totalDaySleepTime;
      summary.averageDayWakeDuration = Math.round(
        totalTimeInBetweenDayNaps / (daySleepSessions.length + 1), // +1 to account for time before first nap and after last nap
      );
    }

    if (nightSleepSessions.length > 0) {
      let totalNightWakeTime = 0;

      if (morningSleepSessions.length > 0) {
        const totalMorningSleepTime = morningSleepSessions.reduce((sum, s) => sum + s.durationMinutes, 0);
        // compute previous day's last night nap end time if it exists and fallback to first morning nap start time if not
        const previousDateStr = dayjs(dateStr).subtract(1, 'day').format('YYYY-MM-DD');
        const previousDaySummary = summaries.find((s) => s.date === previousDateStr);
        const previousDayLastNightNap = previousDaySummary?.naps.filter((n) => n.isNightSleep).slice(-1)[0];

        const previousDayLastNightNapEnd = previousDayLastNightNap
          ? getSessionDateTime(
              previousDateStr,
              previousDayLastNightNap.endTime,
              previousDayLastNightNap.startTime,
              'end',
            )
          : dayjs(`${dateStr}T${morningSleepSessions[0].startTime}`);

        const lastMorningNapEnd = dayjs(`${dateStr}T${morningSleepSessions[morningSleepSessions.length - 1].endTime}`);
        const totalMorningTime = lastMorningNapEnd.diff(previousDayLastNightNapEnd, 'minute');
        const morningWakeTime = totalMorningTime - totalMorningSleepTime;

        if (morningWakeTime > 0) {
          totalNightWakeTime += morningWakeTime;
        }
      }

      if (eveningSleepSessions.length > 0) {
        const endOfDay = dayjs(dateStr).endOf('day');
        const totalEveningSleepTime = eveningSleepSessions.reduce((sum, s) => {
          const start = dayjs(`${dateStr}T${s.startTime}`);
          const end = dayjs(`${dateStr}T${s.endTime}`);
          if (end.isBefore(start)) {
            // handle sessions that end after midnight by capping to end of day
            return sum + endOfDay.diff(start, 'minute');
          }

          return sum + s.durationMinutes;
        }, 0);

        const firstEveningNapStart = dayjs(`${dateStr}T${eveningSleepSessions[0].startTime}`);
        const totalEveningTime = endOfDay.diff(firstEveningNapStart, 'minute');
        const eveningWakeTime = totalEveningTime - totalEveningSleepTime;
        if (eveningWakeTime > 0) {
          totalNightWakeTime += eveningWakeTime;
        }
      }

      if (summary.totalNightWakeUps > 0 && totalNightWakeTime > 0) {
        summary.averageNightWakeDuration = Math.round(totalNightWakeTime / summary.totalNightWakeUps);
      }
    }

    // Count diaper changes
    for (const event of dayEvents) {
      if (event.type === 'DIAPER_CHANGE') {
        const diaperChange: DiaperChange = {
          time: formatTime(parseTimestamp(event.timestamp)),
          type: event.diaperChangeType!,
          rawMessage: event.rawMessage,
        };

        summary.diaperChanges.push(diaperChange);
        summary.totalDiaperChanges++;

        if (diaperChange.type === 'WET') {
          summary.wetDiaperChanges++;
        } else if (diaperChange.type === 'DIRTY') {
          summary.dirtyDiaperChanges++;
        } else if (diaperChange.type === 'WET_AND_DIRTY') {
          summary.mixedDiaperChanges++;
        } else {
          // Unknown type - count as wet by default
          summary.wetDiaperChanges++;
        }
      }
    }

    // Get weight if recorded
    for (const event of dayEvents) {
      if (event.type === 'WEIGHT' && event.weight) {
        summary.weight = event.weight;
      }
    }

    // Collect comments
    for (const event of dayEvents) {
      if (event.type === 'COMMENT') {
        const eventDate = parseTimestamp(event.timestamp);
        summary.comments.push({
          time: formatTime(eventDate),
          message: event.rawMessage,
        });
      }
    }

    summaries.push(summary);
  }

  return summaries.sort((a, b) => a.date.localeCompare(b.date));
}
