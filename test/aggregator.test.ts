import { frozenAggregatorFixtures, lateFinalNightFixture } from './fixtures/aggregator-fixtures';
import { aggregateByDay } from '../src/aggregator';
import { DaySummary, FeedingSession, NapSession, ParsedEvent } from '../src/types';

function sleep(start: string, end: string): ParsedEvent[] {
  return [
    {
      timestamp: start,
      type: 'START_SLEEP',
      rawMessage: `Start somnic ${start}`,
    },
    {
      timestamp: end,
      type: 'STOP_SLEEP',
      rawMessage: `Stop somnic ${end}`,
    },
  ];
}

function getSummary(events: ParsedEvent[], date: string): DaySummary {
  const summary = aggregateByDay(events).find((item) => item.date === date);
  expect(summary).toBeDefined();
  return summary!;
}

function expectNap(summary: DaySummary, expectedNap: Pick<NapSession, 'start' | 'end' | 'isNightSleep'>): void {
  expect(summary.naps).toContainEqual(expect.objectContaining(expectedNap));
}

function expectFeeding(summary: DaySummary, expectedFeeding: Pick<FeedingSession, 'start' | 'end'>): void {
  expect(summary.feedings).toContainEqual(expect.objectContaining(expectedFeeding));
}

describe('aggregateByDay boundary heuristics', () => {
  test('matches the corrected frozen fixture for the late final sleep regression', () => {
    const summary = getSummary(lateFinalNightFixture.events, lateFinalNightFixture.date);
    const lastNap = summary.naps.at(-1);

    expect(lastNap).toBeDefined();
    expect(lastNap?.start).toBe('2026-04-17T19:18:00');
    expect(lastNap?.isNightSleep).toBe(true);
    expect(summary.totalNightSleepTime24h).toBe(623);
    expect(summary.totalDaySleepTime).toBe(269);
    expect(summary.napSessions).toBe(6);
  });

  test('keeps the existing coupled evening sleep promotion behavior', () => {
    const events: ParsedEvent[] = [
      ...sleep('2026-04-16T23:00', '2026-04-17T02:00'),
      ...sleep('2026-04-17T15:00', '2026-04-17T16:00'),
      ...sleep('2026-04-17T19:30', '2026-04-17T20:30'),
      ...sleep('2026-04-17T21:00', '2026-04-17T23:00'),
    ];

    const summary = getSummary(events, '2026-04-17');
    const promotedNap = summary.naps.find((nap) => nap.start === '2026-04-17T19:30:00');

    expect(promotedNap).toBeDefined();
    expect(promotedNap?.isNightSleep).toBe(true);
    expect(summary.totalNightSleepTime24h).toBe(300);
    expect(summary.totalDaySleepTime).toBe(60);
  });

  test('preserves the morning-side demotion when the day has already started', () => {
    const events: ParsedEvent[] = [
      ...sleep('2026-04-16T23:00', '2026-04-17T02:00'),
      ...sleep('2026-04-17T03:00', '2026-04-17T05:00'),
      ...sleep('2026-04-17T07:20', '2026-04-17T09:00'),
      ...sleep('2026-04-17T13:00', '2026-04-17T14:00'),
    ];

    const summary = getSummary(events, '2026-04-17');
    const morningBoundaryNap = summary.naps.find((nap) => nap.start === '2026-04-17T07:20:00');

    expect(morningBoundaryNap).toBeDefined();
    expect(morningBoundaryNap?.isNightSleep).toBe(false);
    expect(summary.totalNightSleepTime24h).toBe(240);
    expect(summary.totalDaySleepTime).toBe(160);
  });
});

describe('aggregateByDay frozen mock fixtures', () => {
  test.each(frozenAggregatorFixtures)('$name preserves the expected day summary', (fixture) => {
    const summary = getSummary(fixture.events, fixture.date);

    expect(summary).toMatchObject(fixture.expectedSummary);
    expect(summary.comments).toEqual(fixture.expectedComments);
    fixture.expectedNapChecks.forEach((expectedNap) => expectNap(summary, expectedNap));
    fixture.expectedFeedingChecks?.forEach((expectedFeeding) => expectFeeding(summary, expectedFeeding));
  });
});
