import dayjs, { ConfigType, Dayjs } from 'dayjs';
import { DaySummary, DiaperChange, EventType, ParsedEvent } from './types';

// Night hours: 21:00 to 08:00
const NIGHT_START_HOUR = process.env.NIGHT_START_HOUR ? parseInt(process.env.NIGHT_START_HOUR, 10) : 21;
const NIGHT_END_HOUR = process.env.NIGHT_END_HOUR ? parseInt(process.env.NIGHT_END_HOUR, 10) : 8;

interface SessionMatch {
  start: ParsedEvent;
  end: ParsedEvent | null;
}

interface CompletedSession {
  start: Date;
  end: Date;
  durationMinutes: number;
  rawMessages: string[];
}

interface CompletedSleepSession extends CompletedSession {
  isNightSleep: boolean;
}

function isNightTime(hour: number): boolean {
  return hour >= NIGHT_START_HOUR || hour < NIGHT_END_HOUR;
}

function parseTimestamp(timestamp: string): Date {
  return new Date(timestamp);
}

function formatLocalIso(date: Date): string {
  return dayjs(date).format('YYYY-MM-DDTHH:mm:ss');
}

function getDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getDurationMinutes(start: ConfigType, end: ConfigType): number {
  return dayjs(end).diff(dayjs(start), 'minute', false);
}

function maxDayjs(a: Dayjs, b: Dayjs): Dayjs {
  return a.isAfter(b) ? a : b;
}

function minDayjs(a: Dayjs, b: Dayjs): Dayjs {
  return a.isBefore(b) ? a : b;
}

function overlapsWindow(start: ConfigType, end: ConfigType, windowStart: Dayjs, windowEnd: Dayjs): boolean {
  return dayjs(start).isBefore(windowEnd) && dayjs(end).isAfter(windowStart);
}

function startsDuringWindow(timestamp: ConfigType, windowStart: Dayjs, windowEnd: Dayjs): boolean {
  return (
    dayjs(timestamp).isSame(windowStart) ||
    (dayjs(timestamp).isAfter(windowStart) && dayjs(timestamp).isBefore(windowEnd))
  );
}

function getOverlapMinutes(start: ConfigType, end: ConfigType, windowStart: Dayjs, windowEnd: Dayjs): number {
  const overlapStart = maxDayjs(dayjs(start), windowStart);
  const overlapEnd = minDayjs(dayjs(end), windowEnd);

  if (!overlapEnd.isAfter(overlapStart)) {
    return 0;
  }

  return Math.round(overlapEnd.diff(overlapStart, 'minute', true));
}

function matchSessions(events: ParsedEvent[], startType: EventType, endType: EventType): SessionMatch[] {
  const sessions: SessionMatch[] = [];
  let currentStart: ParsedEvent | null = null;

  for (const event of events) {
    if (event.type === startType) {
      if (currentStart) {
        sessions.push({ start: currentStart, end: null });
      }
      currentStart = event;
    } else if (event.type === endType && currentStart) {
      sessions.push({ start: currentStart, end: event });
      currentStart = null;
    }
  }

  if (currentStart) {
    sessions.push({ start: currentStart, end: null });
  }

  return sessions;
}

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

function buildFeedingSessions(matches: SessionMatch[]): CompletedSession[] {
  const sessions: CompletedSession[] = [];

  for (const match of matches) {
    if (!match.end) {
      continue;
    }

    const start = parseTimestamp(match.start.timestamp);
    const end = parseTimestamp(match.end.timestamp);
    const durationMinutes = getDurationMinutes(start, end);

    // Skip invalid durations (negative or very long)
    if (durationMinutes <= 0 || durationMinutes >= 180) {
      continue;
    }

    sessions.push({
      start,
      end,
      durationMinutes,
      rawMessages: [match.start.rawMessage, match.end.rawMessage],
    });
  }

  return sessions.sort((a, b) => a.start.getTime() - b.start.getTime());
}

function buildSleepSessions(matches: SessionMatch[]): CompletedSleepSession[] {
  const sessions: CompletedSleepSession[] = [];

  for (const match of matches) {
    if (!match.end) {
      continue;
    }

    const start = parseTimestamp(match.start.timestamp);
    const end = parseTimestamp(match.end.timestamp);
    const durationMinutes = getDurationMinutes(start, end);

    // Skip invalid durations
    if (durationMinutes <= 0 || durationMinutes >= 720) {
      continue;
    }

    sessions.push({
      start,
      end,
      durationMinutes,
      isNightSleep: isNightTime(start.getHours()),
      rawMessages: [match.start.rawMessage, match.end.rawMessage],
    });
  }

  return sessions.sort((a, b) => a.start.getTime() - b.start.getTime());
}

const areSleepSessionsCoupled = (a: CompletedSleepSession, b: CompletedSleepSession): boolean => {
  if (a.durationMinutes < 20) {
    return false;
  }

  const wakeDuration = getDurationMinutes(a.end, b.start);
  if (wakeDuration > Math.min(a.durationMinutes * 0.7, 30)) {
    return false;
  }
  return true;
};

const isLikelyNightBoundarySession = (
  session: CompletedSleepSession,
  dayStart: Dayjs,
  eveningBoundary: Dayjs,
  dayEnd: Dayjs,
): boolean => {
  if (session.durationMinutes < 20) {
    return false;
  }

  const sleepBeforeNightMinutes = getOverlapMinutes(session.start, session.end, dayStart, eveningBoundary);
  const sleepAfterNightMinutes = getOverlapMinutes(session.start, session.end, eveningBoundary, dayEnd);

  if (sleepAfterNightMinutes <= sleepBeforeNightMinutes) {
    return false;
  }

  return true;
};

/**
 * Aggregate parsed events into daily summaries
 */
export function aggregateByDay(events: ParsedEvent[]): DaySummary[] {
  const sortedEvents = [...events].sort(
    (a, b) => parseTimestamp(a.timestamp).getTime() - parseTimestamp(b.timestamp).getTime(),
  );

  const feedingMatches = matchSessions(sortedEvents, 'START_FEED', 'STOP_FEED');
  const sleepMatches = matchSessions(sortedEvents, 'START_SLEEP', 'STOP_SLEEP');

  const feedingSessions = buildFeedingSessions(feedingMatches);
  const sleepSessions = buildSleepSessions(sleepMatches);

  const eventsByDate = groupEventsByDate(sortedEvents);

  const allDates = new Set<string>();
  for (const event of sortedEvents) {
    allDates.add(getDateString(parseTimestamp(event.timestamp)));
  }

  for (const session of [...feedingSessions, ...sleepSessions]) {
    allDates.add(getDateString(session.start));
    allDates.add(getDateString(session.end));
  }

  const summaries: DaySummary[] = [];

  for (const dateStr of Array.from(allDates).sort()) {
    const dayEvents = eventsByDate.get(dateStr) || [];
    const dayStart = dayjs(`${dateStr}T00:00:00`);
    const dayEnd = dayStart.endOf('day');
    const morningBoundary = dayjs(dateStr).hour(NIGHT_END_HOUR).startOf('hour');
    const eveningBoundary = dayjs(dateStr).hour(NIGHT_START_HOUR).startOf('hour');

    const summary: DaySummary = {
      date: dateStr,
      totalSleepTime24h: 0,
      totalNightSleepTime24h: 0,
      totalDaySleepTime: 0,
      totalFeedingTime24h: 0,
      wetDiaperChanges: 0,
      dirtyDiaperChanges: 0,
      mixedDiaperChanges: 0,
      totalDiaperChanges: 0,
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

    const dayFeedingSessions = feedingSessions.filter((session) =>
      overlapsWindow(session.start, session.end, dayStart, dayEnd),
    );

    const isFirstFeedingSessionOverlapping =
      dayFeedingSessions.length > 0 && dayjs(dayFeedingSessions[0].start).isBefore(dayStart);
    const previousDayLastFeeding = summaries.length > 0 ? summaries.at(-1)!.feedings.at(-1) : null;

    const isFirstSleepSessionOverlapping = sleepSessions.length > 0 && dayjs(sleepSessions[0].start).isBefore(dayStart);
    const previousDayLastSleep = summaries.length > 0 ? summaries.at(-1)!.naps.at(-1) : null;

    for (const session of dayFeedingSessions) {
      summary.feedings.push({
        start: formatLocalIso(session.start),
        end: formatLocalIso(session.end),
        durationMinutes: session.durationMinutes,
        rawMessages: session.rawMessages,
      });

      summary.totalFeedingTime24h += getOverlapMinutes(session.start, session.end, dayStart, dayEnd);
    }

    summary.feedingSessions = dayFeedingSessions.filter((session) =>
      startsDuringWindow(session.start, dayStart, dayEnd),
    ).length;

    if (summary.feedingSessions > 0) {
      const feedingSessions = [
        ...(!isFirstFeedingSessionOverlapping && previousDayLastFeeding ? [previousDayLastFeeding] : []),
        ...summary.feedings,
      ];
      const totalTimeInBetweenFeeds = feedingSessions
        .slice(1)
        .reduce(
          (total, session, index) => total + getDurationMinutes(feedingSessions.at(index - 1)!.end, session.start),
          0,
        );
      // including the previous day last feeding in the average if it overlaps, to better reflect the actual rhythm and wake windows
      summary.averageInBetweenFeedsDuration = Math.round(totalTimeInBetweenFeeds / (feedingSessions.length - 1 || 1));
    }

    const currentDaySleepSessions = sleepSessions.filter((session) =>
      overlapsWindow(session.start, session.end, dayStart, dayEnd),
    );

    if (
      currentDaySleepSessions.length &&
      overlapsWindow(
        currentDaySleepSessions.at(0)!.start,
        currentDaySleepSessions.at(0)!.end,
        dayStart.subtract(1, 'day'),
        dayEnd.subtract(1, 'day'),
      )
    ) {
      currentDaySleepSessions.at(0)!.isNightSleep = true;
    }

    if (
      currentDaySleepSessions.length &&
      (overlapsWindow(
        currentDaySleepSessions.at(-1)!.start,
        currentDaySleepSessions.at(-1)!.end,
        dayStart.add(1, 'day'),
        dayEnd.add(1, 'day'),
      ) ||
        getOverlapMinutes(
          currentDaySleepSessions.at(-1)!.start,
          currentDaySleepSessions.at(-1)!.end,
          eveningBoundary,
          dayEnd,
        ) >=
          currentDaySleepSessions.at(-1)!.durationMinutes * 0.7)
    ) {
      currentDaySleepSessions.at(-1)!.isNightSleep = true;
    }

    const morningSleepSessions = currentDaySleepSessions.filter((session) =>
      overlapsWindow(session.start, session.end, dayStart, morningBoundary),
    );

    const daytimeSleepSessions = currentDaySleepSessions.filter((session) =>
      startsDuringWindow(session.start, morningBoundary, eveningBoundary),
    );
    const eveningSleepSessions = currentDaySleepSessions.filter((session) =>
      startsDuringWindow(session.start, eveningBoundary, dayEnd),
    );

    // check if last morning sleep session can actually be considered a night sleep session or day has already started
    if (morningSleepSessions.length > 1) {
      const lastMorningSession = morningSleepSessions.at(-1)!;
      const previousMorningSession = morningSleepSessions.at(-2)!;

      const sleepDuringNightMinutes = getOverlapMinutes(
        lastMorningSession.start,
        lastMorningSession.end,
        dayStart,
        morningBoundary,
      );
      const sleepDuringDayMinutes = getOverlapMinutes(
        lastMorningSession.start,
        lastMorningSession.end,
        morningBoundary,
        dayEnd,
      );

      if (
        lastMorningSession.durationMinutes >= 20 &&
        sleepDuringDayMinutes > sleepDuringNightMinutes &&
        getDurationMinutes(previousMorningSession.end, lastMorningSession.start) >=
          lastMorningSession.durationMinutes * 0.8
      ) {
        lastMorningSession.isNightSleep = false;
        // add at beginning of daytime sessions to preserve chronological order
        daytimeSleepSessions.unshift(lastMorningSession);
        morningSleepSessions.pop();
      }
    }

    // check if last day sleep can actually be considered a day sleep or the day has already ended
    while (
      daytimeSleepSessions.length > 1 &&
      eveningSleepSessions.length &&
      areSleepSessionsCoupled(daytimeSleepSessions.at(-1)!, eveningSleepSessions.at(0)!)
    ) {
      const lastDaySession = daytimeSleepSessions.at(-1)!;

      lastDaySession.isNightSleep = true;
      eveningSleepSessions.unshift(lastDaySession);
      daytimeSleepSessions.pop();
    }

    // check if first evening sleep session can actually be considered a night sleep session or day has not ended yet
    if (eveningSleepSessions.length > 1) {
      const firstEveningSession = eveningSleepSessions.at(0)!;
      const secondEveningSession = eveningSleepSessions.at(1)!;

      const sleepBeforeNightMinutes = getOverlapMinutes(
        firstEveningSession.start,
        firstEveningSession.end,
        dayStart,
        eveningBoundary,
      );
      const sleepAfterNightMinutes = getOverlapMinutes(
        firstEveningSession.start,
        firstEveningSession.end,
        eveningBoundary,
        dayEnd,
      );

      if (
        firstEveningSession.durationMinutes >= 20 &&
        sleepAfterNightMinutes <= sleepBeforeNightMinutes &&
        getDurationMinutes(firstEveningSession.end, secondEveningSession.start) >=
          firstEveningSession.durationMinutes * 0.8
      ) {
        firstEveningSession.isNightSleep = false;
        // add at beginning of daytime sessions to preserve chronological order
        daytimeSleepSessions.push(firstEveningSession);
        eveningSleepSessions.shift();
      }
    }

    if (!eveningSleepSessions.length && daytimeSleepSessions.length) {
      const lastDaySession = daytimeSleepSessions.at(-1)!;
      const previousSleepSession =
        daytimeSleepSessions.length > 1 ? daytimeSleepSessions.at(-2)! : (morningSleepSessions.at(-1) ?? null);

      if (isLikelyNightBoundarySession(lastDaySession, dayStart, eveningBoundary, dayEnd)) {
        lastDaySession.isNightSleep = true;
        eveningSleepSessions.unshift(lastDaySession);
        daytimeSleepSessions.pop();
      }
    }

    for (const session of [...morningSleepSessions, ...daytimeSleepSessions, ...eveningSleepSessions]) {
      summary.naps.push({
        start: formatLocalIso(session.start),
        end: formatLocalIso(session.end),
        durationMinutes: session.durationMinutes,
        isNightSleep: session.isNightSleep,
        rawMessages: session.rawMessages,
      });

      const overlapMinutes = getOverlapMinutes(session.start, session.end, dayStart, dayEnd);
      summary.totalSleepTime24h += overlapMinutes;
      if (session.isNightSleep) {
        summary.totalNightSleepTime24h += overlapMinutes;
      } else {
        summary.totalDaySleepTime += overlapMinutes;
      }
    }

    summary.napSessions = morningSleepSessions.length + eveningSleepSessions.length + daytimeSleepSessions.length;
    if (isFirstSleepSessionOverlapping) {
      summary.napSessions--;
    }

    const morningSessionsIncludingPreviousSleep = [
      ...(!isFirstSleepSessionOverlapping && previousDayLastSleep ? [previousDayLastSleep] : []),
      ...morningSleepSessions,
    ];
    const totalMorningWakeDuration =
      morningSessionsIncludingPreviousSleep.length > 1
        ? morningSessionsIncludingPreviousSleep.slice(1).reduce((totalWakeTime, session, index) => {
            const wakeTime = getDurationMinutes(morningSessionsIncludingPreviousSleep.at(index)!.end, session.start);
            return totalWakeTime + wakeTime;
          }, 0)
        : 0;
    const totalEveningWakeDuration =
      eveningSleepSessions.length > 1
        ? eveningSleepSessions.slice(1).reduce((totalWakeTime, session, index) => {
            const wakeTime = getDurationMinutes(eveningSleepSessions.at(index)!.end, session.start);
            return totalWakeTime + wakeTime;
          }, 0)
        : 0;
    summary.averageNightWakeDuration = Math.round(
      (totalMorningWakeDuration + totalEveningWakeDuration) /
        (morningSessionsIncludingPreviousSleep.length + (eveningSleepSessions.length || 1) - 1 || 1),
    );

    summary.totalNightWakeUps = (morningSleepSessions.length || 1) - 1 + (eveningSleepSessions.length || 1) - 1;

    const daytimeSleepSessionsIncludingNightBoundingSessions = [
      ...(morningSleepSessions.length ? [morningSleepSessions.at(-1)!] : []),
      ...daytimeSleepSessions,
      ...(eveningSleepSessions.length ? [eveningSleepSessions.at(0)!] : []),
    ];

    const totalDaytimeWakeDuration =
      daytimeSleepSessionsIncludingNightBoundingSessions.length > 1
        ? daytimeSleepSessionsIncludingNightBoundingSessions.slice(1).reduce((totalWakeTime, session, index) => {
            const wakeTime = getDurationMinutes(
              daytimeSleepSessionsIncludingNightBoundingSessions.at(index)!.end,
              session.start,
            );
            return totalWakeTime + wakeTime;
          }, 0)
        : 0;

    summary.averageDayWakeDuration = Math.round(
      totalDaytimeWakeDuration / (daytimeSleepSessionsIncludingNightBoundingSessions.length - 1 || 1),
    );

    summary.averageDaySleepDuration = Math.round(
      currentDaySleepSessions.reduce((total, session) => total + session.durationMinutes, 0) /
        (currentDaySleepSessions.length || 1),
    );

    summary.averageNightSleepDuration = Math.round(
      [...morningSleepSessions, ...eveningSleepSessions].reduce(
        (total, session) => total + session.durationMinutes,
        0,
      ) / (morningSleepSessions.length + eveningSleepSessions.length || 1),
    );

    for (const event of dayEvents) {
      if (event.type !== 'DIAPER_CHANGE') {
        continue;
      }

      const diaperChange: DiaperChange = {
        time: formatLocalIso(parseTimestamp(event.timestamp)),
        type: event.diaperChangeType || 'WET',
        rawMessage: event.rawMessage,
      };

      summary.diaperChanges.push(diaperChange);
      summary.totalDiaperChanges++;

      if (diaperChange.type === 'WET') {
        summary.wetDiaperChanges++;
      } else if (diaperChange.type === 'DIRTY') {
        summary.dirtyDiaperChanges++;
      } else {
        summary.mixedDiaperChanges++;
      }
    }

    for (const event of dayEvents) {
      if (event.type === 'WEIGHT' && event.weight) {
        summary.weight = event.weight;
      }
    }

    for (const event of dayEvents) {
      if (event.type === 'COMMENT') {
        summary.comments.push({
          time: formatLocalIso(parseTimestamp(event.timestamp)),
          message: event.rawMessage,
        });
      }
    }

    summaries.push(summary);
  }

  return summaries.sort((a, b) => a.date.localeCompare(b.date));
}
