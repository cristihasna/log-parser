#!/usr/bin/env tsx
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import dayjs from 'dayjs';
import { aggregateByDay } from './aggregator';
import { DaySummary, DiaperChangeType, ParsedEvent } from './types';

const DEFAULT_INTERVAL_MS = 1000;
const DEFAULT_AGGREGATED_DIR = './aggregated';
const API_URL = process.env.AGGREGATED_LOGS_API_URL || 'http://localhost:8080/logs';

type LegacyTimeSession = {
  start?: string;
  end?: string;
  startTime?: string;
  endTime?: string;
  durationMinutes?: number;
  rawMessages?: string[];
  isNightSleep?: boolean;
};

type LegacyDiaperChange = {
  time: string;
  type?: DiaperChangeType;
  rawMessage?: string;
};

type LegacyComment = {
  time: string;
  message: string;
};

type LegacyDaySummary = {
  date: string;
  feedings?: LegacyTimeSession[];
  naps?: LegacyTimeSession[];
  diaperChanges?: LegacyDiaperChange[];
  comments?: LegacyComment[];
  weight?: number;
};

type InputShape = LegacyDaySummary[] | { items: LegacyDaySummary[] };

function printUsage(): void {
  console.log(`
Usage: npx tsx src/migrate-aggregated.ts [options]

Options:
  --input, -i        Input aggregated JSON path (required)
  --output, -o       Output path (default: <input>.migrated.json)
  --post             Post each migrated day to API
  --interval-ms      Delay between POSTs in milliseconds (default: 1000)
  --help, -h         Show this help message

Examples:
  npx tsx src/migrate-aggregated.ts -i aggregated/aggregated_all_2026-02-22.json
  npx tsx src/migrate-aggregated.ts -i aggregated/aggregated_all_2026-02-22.json --post
`);
}

function parseArgs(args: string[]): {
  inputFile: string;
  outputFile: string;
  shouldPost: boolean;
  intervalMs: number;
} {
  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  let inputFile = '';
  let outputFile = '';
  let shouldPost = false;
  let intervalMs = DEFAULT_INTERVAL_MS;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--input' || arg === '-i') {
      inputFile = args[++i];
      continue;
    }

    if (arg === '--output' || arg === '-o') {
      outputFile = args[++i];
      continue;
    }

    if (arg === '--post') {
      shouldPost = true;
      continue;
    }

    if (arg === '--interval-ms') {
      const value = Number(args[++i]);
      if (!Number.isFinite(value) || value < 0) {
        console.error(`Error: Invalid --interval-ms value: ${args[i]}`);
        process.exit(1);
      }
      intervalMs = Math.floor(value);
      continue;
    }

    if (!arg.startsWith('-') && !inputFile) {
      inputFile = arg;
      continue;
    }

    if (arg.startsWith('-')) {
      console.error(`Error: Unknown option: ${arg}`);
      printUsage();
      process.exit(1);
    }
  }

  if (!inputFile) {
    console.error('Error: Missing --input path');
    printUsage();
    process.exit(1);
  }

  if (!outputFile) {
    const resolvedInput = path.resolve(inputFile);
    const parsed = path.parse(resolvedInput);
    outputFile = path.join(parsed.dir || DEFAULT_AGGREGATED_DIR, `${parsed.name}.migrated${parsed.ext || '.json'}`);
  }

  return { inputFile, outputFile, shouldPost, intervalMs };
}

function normalizeTimestamp(value: string): string | null {
  const parsed = dayjs(value);
  if (!parsed.isValid()) {
    return null;
  }

  return parsed.format('YYYY-MM-DDTHH:mm:ss');
}

function parseTimeOnDate(date: string, value: string): dayjs.Dayjs | null {
  const fullValue = `${date}T${value}`;
  const parsed = dayjs(fullValue);
  if (!parsed.isValid()) {
    return null;
  }

  return parsed;
}

function resolveSessionTimestamps(date: string, session: LegacyTimeSession): { start: string; end: string } | null {
  if (session.start && session.end) {
    const normalizedStart = normalizeTimestamp(session.start);
    const normalizedEnd = normalizeTimestamp(session.end);
    if (normalizedStart && normalizedEnd) {
      return { start: normalizedStart, end: normalizedEnd };
    }
  }

  if (!session.startTime || !session.endTime) {
    return null;
  }

  const parsedStart = parseTimeOnDate(date, session.startTime);
  const parsedEnd = parseTimeOnDate(date, session.endTime);

  if (!parsedStart || !parsedEnd) {
    return null;
  }

  const fixedEnd = parsedEnd.isBefore(parsedStart) ? parsedEnd.add(1, 'day') : parsedEnd;

  return {
    start: parsedStart.format('YYYY-MM-DDTHH:mm:ss'),
    end: fixedEnd.format('YYYY-MM-DDTHH:mm:ss'),
  };
}

function resolvePointTimestamp(date: string, value: string): string | null {
  if (value.includes('T')) {
    return normalizeTimestamp(value);
  }

  const parsed = parseTimeOnDate(date, value);
  if (!parsed) {
    return null;
  }

  return parsed.format('YYYY-MM-DDTHH:mm:ss');
}

function toArray(input: InputShape): LegacyDaySummary[] {
  return Array.isArray(input) ? input : input.items;
}

function buildEventKey(event: ParsedEvent): string {
  const weightSuffix = event.weight ? `|${event.weight}` : '';
  const diaperSuffix = event.diaperChangeType ? `|${event.diaperChangeType}` : '';
  return `${event.type}|${event.timestamp}|${event.rawMessage}${weightSuffix}${diaperSuffix}`;
}

function buildParsedEvents(days: LegacyDaySummary[]): ParsedEvent[] {
  const dedupe = new Set<string>();
  const parsedEvents: ParsedEvent[] = [];

  const pushEvent = (event: ParsedEvent): void => {
    const key = buildEventKey(event);
    if (dedupe.has(key)) {
      return;
    }

    dedupe.add(key);
    parsedEvents.push(event);
  };

  for (const day of days) {
    const feedings = day.feedings || [];
    const naps = day.naps || [];
    const diaperChanges = day.diaperChanges || [];
    const comments = day.comments || [];

    for (const feeding of feedings) {
      const timestamps = resolveSessionTimestamps(day.date, feeding);
      if (!timestamps) {
        continue;
      }

      const startRaw = feeding.rawMessages?.[0] || 'Migrated START_FEED event';
      const stopRaw = feeding.rawMessages?.[1] || feeding.rawMessages?.[0] || 'Migrated STOP_FEED event';

      pushEvent({
        timestamp: timestamps.start,
        type: 'START_FEED',
        rawMessage: startRaw,
      });

      pushEvent({
        timestamp: timestamps.end,
        type: 'STOP_FEED',
        rawMessage: stopRaw,
      });
    }

    for (const nap of naps) {
      const timestamps = resolveSessionTimestamps(day.date, nap);
      if (!timestamps) {
        continue;
      }

      const startRaw = nap.rawMessages?.[0] || 'Migrated START_SLEEP event';
      const stopRaw = nap.rawMessages?.[1] || nap.rawMessages?.[0] || 'Migrated STOP_SLEEP event';

      pushEvent({
        timestamp: timestamps.start,
        type: 'START_SLEEP',
        rawMessage: startRaw,
      });

      pushEvent({
        timestamp: timestamps.end,
        type: 'STOP_SLEEP',
        rawMessage: stopRaw,
      });
    }

    for (const change of diaperChanges) {
      const timestamp = resolvePointTimestamp(day.date, change.time);
      if (!timestamp) {
        continue;
      }

      pushEvent({
        timestamp,
        type: 'DIAPER_CHANGE',
        rawMessage: change.rawMessage || 'Migrated diaper change',
        diaperChangeType: change.type || 'WET',
      });
    }

    for (const comment of comments) {
      const timestamp = resolvePointTimestamp(day.date, comment.time);
      if (!timestamp) {
        continue;
      }

      pushEvent({
        timestamp,
        type: 'COMMENT',
        rawMessage: comment.message,
      });
    }

    if (typeof day.weight === 'number') {
      pushEvent({
        timestamp: `${day.date}T12:00:00`,
        type: 'WEIGHT',
        rawMessage: `Migrated weight ${day.weight}g`,
        weight: day.weight,
      });
    }
  }

  return parsedEvents.sort((a, b) => dayjs(a.timestamp).valueOf() - dayjs(b.timestamp).valueOf());
}

function getExpectedDates(days: LegacyDaySummary[]): string[] {
  return [...new Set(days.map((day) => day.date))].sort((a, b) => a.localeCompare(b));
}

function buildEmptySummary(date: string): DaySummary {
  return {
    date,
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
    averageNightWakeDuration: 0,
    averageNightSleepDuration: 0,
    averageInBetweenFeedsDuration: 0,
    feedingSessions: 0,
    totalNightWakeUps: 0,
    feedings: [],
    naps: [],
    comments: [],
    diaperChanges: [],
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postSummaries(summaries: DaySummary[], intervalMs: number): Promise<string[]> {
  const apiKey = process.env.AGGREGATED_LOGS_API_KEY;
  if (!apiKey) {
    console.error('Error: Missing AGGREGATED_LOGS_API_KEY in environment variables.');
    process.exit(1);
  }

  const failedDates: string[] = [];

  for (let i = 0; i < summaries.length; i++) {
    const summary = summaries[i];
    console.log(`[${i + 1}/${summaries.length}] POST ${summary.date} -> ${API_URL}`);

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify(summary),
      });

      if (!response.ok) {
        const body = await response.text();
        console.error(`  Failed ${summary.date}: ${response.status} ${response.statusText}`);
        if (body) {
          console.error(`  Response: ${body}`);
        }
        failedDates.push(summary.date);
      } else {
        console.log(`  Success ${summary.date}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`  Failed ${summary.date}: ${message}`);
      failedDates.push(summary.date);
    }

    if (i < summaries.length - 1) {
      await delay(intervalMs);
    }
  }

  return failedDates;
}

async function main(): Promise<void> {
  const { inputFile, outputFile, shouldPost, intervalMs } = parseArgs(process.argv.slice(2));
  const resolvedInputPath = path.resolve(inputFile);

  if (!fs.existsSync(resolvedInputPath)) {
    console.error(`Error: Input file not found: ${resolvedInputPath}`);
    process.exit(1);
  }

  let input: InputShape;
  try {
    const content = fs.readFileSync(resolvedInputPath, 'utf-8');
    input = JSON.parse(content) as InputShape;
  } catch (error) {
    console.error(`Error: Failed to parse JSON from ${resolvedInputPath}`);
    throw error;
  }

  const legacyDays = toArray(input);
  const expectedDates = getExpectedDates(legacyDays);

  console.log(`Loaded ${legacyDays.length} legacy day summaries`);

  const parsedEvents = buildParsedEvents(legacyDays);
  console.log(`Rebuilt ${parsedEvents.length} events from legacy aggregates`);

  const reaggregated = aggregateByDay(parsedEvents);
  const byDate = new Map(reaggregated.map((summary) => [summary.date, summary]));
  const migratedSummaries = expectedDates.map((date) => byDate.get(date) || buildEmptySummary(date));

  const outputPayload = Array.isArray(input) ? migratedSummaries : { items: migratedSummaries };

  const resolvedOutputPath = path.resolve(outputFile);
  fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
  fs.writeFileSync(resolvedOutputPath, JSON.stringify(outputPayload, null, 2), 'utf-8');

  console.log(`Migrated ${migratedSummaries.length} days to ${resolvedOutputPath}`);

  if (!shouldPost) {
    return;
  }

  console.log(`Posting ${migratedSummaries.length} days with ${intervalMs}ms intervals...`);
  const failedDates = await postSummaries(migratedSummaries, intervalMs);

  if (failedDates.length > 0) {
    console.error(`Posting finished with ${failedDates.length} failures:`);
    failedDates.forEach((date) => console.error(`  - ${date}`));
    process.exit(1);
  }

  console.log('Posting completed successfully for all days.');
}

main();
// .catch((error) => {
//   const message = error instanceof Error ? error.message : String(error);
//   console.error('Migration failed:', message);
//   process.exit(1);
// });
