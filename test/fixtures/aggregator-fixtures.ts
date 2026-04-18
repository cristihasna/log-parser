import { ParsedEvent } from '../../src/types';

export interface AggregatorMockFixture {
  name: string;
  date: string;
  events: ParsedEvent[];
  expectedSummary: {
    totalSleepTime24h: number;
    totalNightSleepTime24h: number;
    totalDaySleepTime: number;
    totalFeedingTime24h: number;
    wetDiaperChanges: number;
    dirtyDiaperChanges: number;
    mixedDiaperChanges: number;
    totalDiaperChanges: number;
    napSessions: number;
    feedingSessions: number;
    totalNightWakeUps: number;
    weight?: number;
  };
  expectedComments: Array<{ time: string; message: string }>;
  expectedNapChecks: Array<{ start: string; end: string; isNightSleep: boolean }>;
  expectedFeedingChecks?: Array<{ start: string; end: string }>;
}

export const lateFinalNightFixture: AggregatorMockFixture = {
  name: 'late final night reclassification',
  date: '2026-04-17',
  events: [
    { timestamp: '2026-04-16T23:16', type: 'START_SLEEP', rawMessage: 'Start somnic 23:16' },
    { timestamp: '2026-04-17T02:27', type: 'STOP_SLEEP', rawMessage: 'Stop somnic 2:27' },
    { timestamp: '2026-04-17T02:28', type: 'START_FEED', rawMessage: 'Start papica 2:28' },
    { timestamp: '2026-04-17T02:46', type: 'STOP_FEED', rawMessage: 'Stop papica 2:46' },
    { timestamp: '2026-04-17T02:47', type: 'START_SLEEP', rawMessage: 'Start somnic 2:47' },
    { timestamp: '2026-04-17T06:27', type: 'STOP_SLEEP', rawMessage: 'Stop somnic 6:27' },
    { timestamp: '2026-04-17T06:29', type: 'DIAPER_CHANGE', diaperChangeType: 'WET', rawMessage: 'Schimbat pipi 6:29' },
    { timestamp: '2026-04-17T06:36', type: 'START_FEED', rawMessage: 'Start papica 6:36' },
    { timestamp: '2026-04-17T06:49', type: 'STOP_FEED', rawMessage: 'Stop papica 6:49' },
    { timestamp: '2026-04-17T07:52', type: 'START_SLEEP', rawMessage: 'start somnic  7:52 pe burtica' },
    { timestamp: '2026-04-17T09:27', type: 'STOP_SLEEP', rawMessage: 'stop somnic 9:27' },
    {
      timestamp: '2026-04-17T09:37',
      type: 'DIAPER_CHANGE',
      diaperChangeType: 'WET_AND_DIRTY',
      rawMessage: 'Schimbat pipi + caca 9:37',
    },
    { timestamp: '2026-04-17T10:29', type: 'START_FEED', rawMessage: 'Start papica 10:29' },
    { timestamp: '2026-04-17T10:40', type: 'STOP_FEED', rawMessage: 'Stop papica 10:40' },
    { timestamp: '2026-04-17T11:11', type: 'START_SLEEP', rawMessage: 'Start somnic 11:11' },
    { timestamp: '2026-04-17T11:38', type: 'STOP_SLEEP', rawMessage: 'Stop somnic 11:38' },
    { timestamp: '2026-04-17T12:03', type: 'DIAPER_CHANGE', diaperChangeType: 'WET', rawMessage: 'Schimbat pipi 12:03' },
    { timestamp: '2026-04-17T12:38', type: 'START_FEED', rawMessage: 'Start papica 12:38' },
    { timestamp: '2026-04-17T12:51', type: 'STOP_FEED', rawMessage: 'Stop papica 12:51 cu reprize de supt deget' },
    { timestamp: '2026-04-17T13:47', type: 'START_SLEEP', rawMessage: 'Start somnic 13:47' },
    { timestamp: '2026-04-17T14:23', type: 'STOP_SLEEP', rawMessage: 'Stop somnic 14:23' },
    { timestamp: '2026-04-17T14:25', type: 'START_FEED', rawMessage: 'Start papica 14:25' },
    { timestamp: '2026-04-17T14:38', type: 'STOP_FEED', rawMessage: 'Stop papica 14:38' },
    { timestamp: '2026-04-17T14:42', type: 'START_SLEEP', rawMessage: 'Start somnic 14:42' },
    { timestamp: '2026-04-17T16:33', type: 'STOP_SLEEP', rawMessage: 'Stop somnic 16:33' },
    { timestamp: '2026-04-17T16:38', type: 'DIAPER_CHANGE', diaperChangeType: 'WET', rawMessage: 'Schimbat pipi 16:38' },
    { timestamp: '2026-04-17T17:38', type: 'START_FEED', rawMessage: 'Start papica 17:38' },
    { timestamp: '2026-04-17T17:52', type: 'STOP_FEED', rawMessage: 'Stop papica 17:52' },
    { timestamp: '2026-04-17T18:55', type: 'DIAPER_CHANGE', diaperChangeType: 'WET', rawMessage: 'Schimbat pipi 18:55' },
    { timestamp: '2026-04-17T19:08', type: 'START_FEED', rawMessage: 'Start papica 19:08' },
    { timestamp: '2026-04-17T19:17', type: 'STOP_FEED', rawMessage: 'Stop papica 19:17' },
    { timestamp: '2026-04-17T19:18', type: 'START_SLEEP', rawMessage: 'Start somnic 19:18' },
    {
      timestamp: '2026-04-17T20:01',
      type: 'COMMENT',
      rawMessage: 'S-a trezit dupa un ciclu de somn, s-a mișcat putin, dar a adormit pasnic înapoi',
    },
    { timestamp: '2026-04-17T23:34', type: 'STOP_SLEEP', rawMessage: 'Stop somnic 23:34' },
    { timestamp: '2026-04-17T23:35', type: 'START_FEED', rawMessage: 'Start papica 23:35' },
    { timestamp: '2026-04-18T00:03', type: 'STOP_FEED', rawMessage: 'Stop papica 00:03' },
  ],
  expectedSummary: {
    totalSleepTime24h: 892,
    totalNightSleepTime24h: 623,
    totalDaySleepTime: 269,
    totalFeedingTime24h: 116,
    wetDiaperChanges: 4,
    dirtyDiaperChanges: 0,
    mixedDiaperChanges: 1,
    totalDiaperChanges: 5,
    napSessions: 6,
    feedingSessions: 8,
    totalNightWakeUps: 1,
  },
  expectedComments: [
    {
      time: '2026-04-17T20:01:00',
      message: 'S-a trezit dupa un ciclu de somn, s-a mișcat putin, dar a adormit pasnic înapoi',
    },
  ],
  expectedNapChecks: [
    { start: '2026-04-16T23:16:00', end: '2026-04-17T02:27:00', isNightSleep: true },
    { start: '2026-04-17T07:52:00', end: '2026-04-17T09:27:00', isNightSleep: false },
    { start: '2026-04-17T19:18:00', end: '2026-04-17T23:34:00', isNightSleep: true },
  ],
  expectedFeedingChecks: [{ start: '2026-04-17T23:35:00', end: '2026-04-18T00:03:00' }],
};

export const weightedBusyDayFixture: AggregatorMockFixture = {
  name: 'weight comments and multiple night wakeups',
  date: '2026-04-07',
  events: [
    { timestamp: '2026-04-06T19:59', type: 'START_SLEEP', rawMessage: 'Start somnic 19:59' },
    { timestamp: '2026-04-07T00:19', type: 'STOP_SLEEP', rawMessage: 'Stop somnic 00:19' },
    { timestamp: '2026-04-07T00:20', type: 'START_FEED', rawMessage: 'Start papica 00:20' },
    { timestamp: '2026-04-07T00:30', type: 'STOP_FEED', rawMessage: 'Stop papica 00:30' },
    { timestamp: '2026-04-07T00:39', type: 'START_SLEEP', rawMessage: 'Start somnic 00:39' },
    { timestamp: '2026-04-07T03:40', type: 'STOP_SLEEP', rawMessage: 'stop somnic 3:40' },
    { timestamp: '2026-04-07T03:44', type: 'DIAPER_CHANGE', diaperChangeType: 'WET', rawMessage: 'schimbat pipi 3:44' },
    { timestamp: '2026-04-07T03:45', type: 'START_FEED', rawMessage: 'start papica 3:45' },
    { timestamp: '2026-04-07T03:59', type: 'STOP_FEED', rawMessage: 'Stop papica 3:59' },
    { timestamp: '2026-04-07T04:00', type: 'START_SLEEP', rawMessage: 'Start somnic 4:00' },
    { timestamp: '2026-04-07T06:40', type: 'STOP_SLEEP', rawMessage: 'Stop somnic 6:40' },
    { timestamp: '2026-04-07T06:46', type: 'DIAPER_CHANGE', diaperChangeType: 'WET', rawMessage: 'Schimbat pipi 6:46' },
    { timestamp: '2026-04-07T06:54', type: 'START_FEED', rawMessage: 'Start papica 6:54' },
    { timestamp: '2026-04-07T07:01', type: 'STOP_FEED', rawMessage: 'Stop papica 7:01' },
    { timestamp: '2026-04-07T08:42', type: 'START_SLEEP', rawMessage: 'Start somnic 8:42' },
    {
      timestamp: '2026-04-07T08:44',
      type: 'COMMENT',
      rawMessage: 'Am trecut la pampers huggies nr 4. Exista șanse sa ude mai putini fiind mai mari. El are 7kg acum',
    },
    {
      timestamp: '2026-04-07T08:44',
      type: 'WEIGHT',
      weight: 7000,
      rawMessage: 'Am trecut la pampers huggies nr 4. Exista șanse sa ude mai putini fiind mai mari. El are 7kg acum',
    },
    { timestamp: '2026-04-07T09:16', type: 'STOP_SLEEP', rawMessage: 'stop somnic 9:16' },
    { timestamp: '2026-04-07T09:36', type: 'START_FEED', rawMessage: 'Start papica 9:36' },
    { timestamp: '2026-04-07T09:42', type: 'STOP_FEED', rawMessage: 'Stop papica 9:42' },
    {
      timestamp: '2026-04-07T10:10',
      type: 'DIAPER_CHANGE',
      diaperChangeType: 'WET_AND_DIRTY',
      rawMessage: 'schimbat pipi caca 10:10',
    },
    { timestamp: '2026-04-07T10:52', type: 'START_SLEEP', rawMessage: 'start somnic 10:52' },
    { timestamp: '2026-04-07T11:25', type: 'STOP_SLEEP', rawMessage: 'stop somn 11:25' },
    { timestamp: '2026-04-07T12:17', type: 'START_FEED', rawMessage: 'start papica 12:17' },
    { timestamp: '2026-04-07T12:29', type: 'STOP_FEED', rawMessage: 'stop pqpica 12:29' },
    { timestamp: '2026-04-07T13:07', type: 'START_FEED', rawMessage: 'Start papica 13:07' },
    { timestamp: '2026-04-07T13:14', type: 'STOP_FEED', rawMessage: 'Stop papica 13:14' },
    { timestamp: '2026-04-07T13:34', type: 'DIAPER_CHANGE', diaperChangeType: 'WET', rawMessage: 'Schimbat pipi 13:34' },
    { timestamp: '2026-04-07T13:57', type: 'START_SLEEP', rawMessage: 'start somnic foarte agitat 13:57' },
    { timestamp: '2026-04-07T14:35', type: 'STOP_SLEEP', rawMessage: 'stop somnic 14:35' },
    { timestamp: '2026-04-07T15:05', type: 'START_SLEEP', rawMessage: 'continuat somnic pe burtica 15:05' },
    {
      timestamp: '2026-04-07T17:23',
      type: 'COMMENT',
      rawMessage:
        'a oftat de cateva ori adanc in timpul somnului, a vrut sa mai intoarca si pe cealalta parte capul, dar a adormit imediat la loc, adanc.',
    },
    { timestamp: '2026-04-07T17:31', type: 'STOP_SLEEP', rawMessage: 'stop somnic 17:31 cu foamea in gât' },
    { timestamp: '2026-04-07T17:34', type: 'START_FEED', rawMessage: 'Start papica 17:34' },
    { timestamp: '2026-04-07T17:41', type: 'STOP_FEED', rawMessage: 'stop papica 17:41' },
    { timestamp: '2026-04-07T18:40', type: 'DIAPER_CHANGE', diaperChangeType: 'WET', rawMessage: 'schimbat pipi 18:40' },
    { timestamp: '2026-04-07T19:54', type: 'START_FEED', rawMessage: 'Start papica 19:54' },
    { timestamp: '2026-04-07T20:05', type: 'STOP_FEED', rawMessage: 'Stop papica 20:05' },
    { timestamp: '2026-04-07T20:07', type: 'START_SLEEP', rawMessage: 'Start somnic 20:07' },
    { timestamp: '2026-04-07T22:12', type: 'STOP_SLEEP', rawMessage: 'Stop somnic 22:12' },
    { timestamp: '2026-04-07T22:14', type: 'START_FEED', rawMessage: 'Start papica 22:14' },
    { timestamp: '2026-04-07T22:24', type: 'STOP_FEED', rawMessage: 'Stop papica 22:24' },
    { timestamp: '2026-04-07T22:25', type: 'START_SLEEP', rawMessage: 'Start somnic 22:25' },
    { timestamp: '2026-04-07T22:35', type: 'STOP_SLEEP', rawMessage: 'Stop somnic 22:35' },
    { timestamp: '2026-04-07T22:36', type: 'START_FEED', rawMessage: 'Start papica 22:36' },
    { timestamp: '2026-04-07T22:44', type: 'STOP_FEED', rawMessage: 'Stop papica 22:44' },
    { timestamp: '2026-04-07T22:45', type: 'START_SLEEP', rawMessage: 'Start somnic 22:45' },
    { timestamp: '2026-04-08T02:54', type: 'STOP_SLEEP', rawMessage: 'Stop somnic 2:54' },
  ],
  expectedSummary: {
    totalSleepTime24h: 821,
    totalNightSleepTime24h: 570,
    totalDaySleepTime: 251,
    totalFeedingTime24h: 92,
    wetDiaperChanges: 4,
    dirtyDiaperChanges: 0,
    mixedDiaperChanges: 1,
    totalDiaperChanges: 5,
    napSessions: 9,
    feedingSessions: 10,
    totalNightWakeUps: 4,
    weight: 7000,
  },
  expectedComments: [
    {
      time: '2026-04-07T08:44:00',
      message: 'Am trecut la pampers huggies nr 4. Exista șanse sa ude mai putini fiind mai mari. El are 7kg acum',
    },
    {
      time: '2026-04-07T17:23:00',
      message:
        'a oftat de cateva ori adanc in timpul somnului, a vrut sa mai intoarca si pe cealalta parte capul, dar a adormit imediat la loc, adanc.',
    },
  ],
  expectedNapChecks: [
    { start: '2026-04-06T19:59:00', end: '2026-04-07T00:19:00', isNightSleep: true },
    { start: '2026-04-07T08:42:00', end: '2026-04-07T09:16:00', isNightSleep: false },
    { start: '2026-04-07T22:45:00', end: '2026-04-08T02:54:00', isNightSleep: true },
  ],
};

export const overnightBoundariesFixture: AggregatorMockFixture = {
  name: 'overnight naps on both sides of the day',
  date: '2026-02-23',
  events: [
    { timestamp: '2026-02-22T21:47', type: 'START_SLEEP', rawMessage: 'start somnic foarte agitat 21:47' },
    { timestamp: '2026-02-23T03:37', type: 'COMMENT', rawMessage: 'Pompat 105 ml la 3:37' },
    { timestamp: '2026-02-23T03:56', type: 'STOP_SLEEP', rawMessage: 'Stop somnic 3:56' },
    { timestamp: '2026-02-23T03:57', type: 'START_FEED', rawMessage: 'Start papica 3:57' },
    { timestamp: '2026-02-23T04:13', type: 'STOP_FEED', rawMessage: 'Stop papica 4:13' },
    { timestamp: '2026-02-23T04:14', type: 'START_SLEEP', rawMessage: 'Start somnic 4:14' },
    { timestamp: '2026-02-23T07:39', type: 'STOP_SLEEP', rawMessage: 'stop somnic 7:39' },
    { timestamp: '2026-02-23T07:41', type: 'START_FEED', rawMessage: 'start papica 7:41' },
    { timestamp: '2026-02-23T07:49', type: 'STOP_FEED', rawMessage: 'Stop papica 7:49' },
    { timestamp: '2026-02-23T07:50', type: 'START_SLEEP', rawMessage: 'Start somnic 7:50' },
    { timestamp: '2026-02-23T08:20', type: 'STOP_SLEEP', rawMessage: 'Stop somnic 8:20' },
    { timestamp: '2026-02-23T08:25', type: 'DIAPER_CHANGE', diaperChangeType: 'WET', rawMessage: 'Schimbat pipi 8:25' },
    { timestamp: '2026-02-23T09:40', type: 'DIAPER_CHANGE', diaperChangeType: 'WET', rawMessage: 'schimbat pipi 9:40' },
    { timestamp: '2026-02-23T09:50', type: 'START_SLEEP', rawMessage: 'Start somnic 9:50 singur' },
    { timestamp: '2026-02-23T10:23', type: 'STOP_SLEEP', rawMessage: 'Stop somnic 10:23' },
    { timestamp: '2026-02-23T10:35', type: 'START_FEED', rawMessage: 'Start papica 10:35' },
    { timestamp: '2026-02-23T10:44', type: 'STOP_FEED', rawMessage: 'Stop papica 10:44' },
    { timestamp: '2026-02-23T11:52', type: 'START_FEED', rawMessage: 'Start papica 11:52' },
    { timestamp: '2026-02-23T12:02', type: 'STOP_FEED', rawMessage: 'Stop papica 12:02' },
    { timestamp: '2026-02-23T12:03', type: 'START_SLEEP', rawMessage: 'Start somnic 12:03' },
    { timestamp: '2026-02-23T12:33', type: 'STOP_SLEEP', rawMessage: 'Stop somnic 12:33' },
    { timestamp: '2026-02-23T12:41', type: 'DIAPER_CHANGE', diaperChangeType: 'WET', rawMessage: 'Schimbat pipi 12:41' },
    { timestamp: '2026-02-23T13:44', type: 'START_SLEEP', rawMessage: 'Start somnic 13:44 singur' },
    { timestamp: '2026-02-23T15:54', type: 'STOP_SLEEP', rawMessage: 'Stop somnic 15:54' },
    { timestamp: '2026-02-23T15:55', type: 'START_FEED', rawMessage: 'Start papica 15:55' },
    { timestamp: '2026-02-23T16:15', type: 'STOP_FEED', rawMessage: 'Stop papica 16:15' },
    { timestamp: '2026-02-23T16:16', type: 'START_SLEEP', rawMessage: 'Start somnic 16:16' },
    { timestamp: '2026-02-23T16:35', type: 'STOP_SLEEP', rawMessage: 'Stop somnic 16:35' },
    { timestamp: '2026-02-23T17:00', type: 'DIAPER_CHANGE', diaperChangeType: 'WET', rawMessage: 'Schimbat pipi 17:00' },
    { timestamp: '2026-02-23T17:50', type: 'START_SLEEP', rawMessage: 'Start somnic 17:50 singur' },
    { timestamp: '2026-02-23T18:30', type: 'STOP_SLEEP', rawMessage: 'Stop somnic 18:30' },
    { timestamp: '2026-02-23T18:52', type: 'START_FEED', rawMessage: 'start papica 18:52' },
    { timestamp: '2026-02-23T19:02', type: 'STOP_FEED', rawMessage: 'Stop papica 19:02' },
    { timestamp: '2026-02-23T19:10', type: 'DIAPER_CHANGE', diaperChangeType: 'WET', rawMessage: 'Schimbat pipi 19:10' },
    { timestamp: '2026-02-23T20:31', type: 'DIAPER_CHANGE', diaperChangeType: 'WET', rawMessage: 'Schimbat pipi 20:31' },
    { timestamp: '2026-02-23T20:35', type: 'START_FEED', rawMessage: 'Start papica 20:35' },
    { timestamp: '2026-02-23T20:46', type: 'STOP_FEED', rawMessage: 'Stop papica 20:46' },
    { timestamp: '2026-02-23T20:47', type: 'START_SLEEP', rawMessage: 'Start somnic 20:47' },
    { timestamp: '2026-02-24T02:55', type: 'STOP_SLEEP', rawMessage: 'Stop somnic 2:55' },
  ],
  expectedSummary: {
    totalSleepTime24h: 916,
    totalNightSleepTime24h: 664,
    totalDaySleepTime: 252,
    totalFeedingTime24h: 84,
    wetDiaperChanges: 6,
    dirtyDiaperChanges: 0,
    mixedDiaperChanges: 0,
    totalDiaperChanges: 6,
    napSessions: 8,
    feedingSessions: 7,
    totalNightWakeUps: 2,
  },
  expectedComments: [{ time: '2026-02-23T03:37:00', message: 'Pompat 105 ml la 3:37' }],
  expectedNapChecks: [
    { start: '2026-02-22T21:47:00', end: '2026-02-23T03:56:00', isNightSleep: true },
    { start: '2026-02-23T07:50:00', end: '2026-02-23T08:20:00', isNightSleep: true },
    { start: '2026-02-23T20:47:00', end: '2026-02-24T02:55:00', isNightSleep: true },
  ],
};

export const frozenAggregatorFixtures = [
  lateFinalNightFixture,
  weightedBusyDayFixture,
  overnightBoundariesFixture,
];
