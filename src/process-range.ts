#!/usr/bin/env tsx
import 'dotenv/config';
import { execSync } from 'child_process';
import dayjs from 'dayjs';

function printUsage(): void {
  console.log(`
Usage: npx tsx src/process-range.ts <start-date> <end-date> [options]

Arguments:
  <start-date>    Start date in YYYY-MM-DD format
  <end-date>      End date in YYYY-MM-DD format

Options:
  --fetch-only    Only fetch logs
  --skip-fetch    Skip fetching logs (assume logs are already fetched)
  --skip-parse    Skip parsing logs (assume logs are already fetched and parsed)
  --skip-post     Skip posting aggregated logs to the API
  --skip-insights Skip generating/sending daily insights
  --help, -h      Show this help message

Examples:
  # Process a week of dates
  npx tsx src/process-range.ts 2026-02-01 2026-02-07

  # Just fetch logs for a range
  npx tsx src/process-range.ts 2026-02-01 2026-02-07 --fetch-only

  # Aggregate from parsed logs for a range, skipping insights
  npx tsx src/process-range.ts 2026-02-01 2026-02-07 --skip-parse --skip-insights
`);
}

function parseArgs(args: string[]): {
  startDate: dayjs.Dayjs;
  endDate: dayjs.Dayjs;
  fetchOnly: boolean;
  skipFetch: boolean;
  skipParse: boolean;
  skipPost: boolean;
  skipInsights: boolean;
} {
  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  const flags = args.filter((arg) => arg.startsWith('--'));
  const positionalArgs = args.filter((arg) => !arg.startsWith('--'));
  const allowedFlags = new Set([
    '--fetch-only',
    '--skip-fetch',
    '--skip-parse',
    '--skip-post',
    '--skip-insights',
  ]);

  const unknownFlags = flags.filter((flag) => !allowedFlags.has(flag));
  if (unknownFlags.length > 0) {
    console.error(`Error: Unknown option(s): ${unknownFlags.join(', ')}`);
    printUsage();
    process.exit(1);
  }

  if (positionalArgs.length < 2) {
    console.error('Error: Both start-date and end-date are required');
    printUsage();
    process.exit(1);
  }

  const startDateStr = positionalArgs[0];
  const endDateStr = positionalArgs[1];

  const startDate = dayjs(startDateStr, 'YYYY-MM-DD', true);
  if (!startDate.isValid()) {
    console.error(`Error: Invalid start date: ${startDateStr}`);
    process.exit(1);
  }

  const endDate = dayjs(endDateStr, 'YYYY-MM-DD', true);
  if (!endDate.isValid()) {
    console.error(`Error: Invalid end date: ${endDateStr}`);
    process.exit(1);
  }

  if (endDate.isBefore(startDate)) {
    console.error('Error: End date must be on or after start date');
    process.exit(1);
  }

  const fetchOnly = flags.includes('--fetch-only');
  const skipFetch = flags.includes('--skip-fetch');
  const skipParse = flags.includes('--skip-parse');
  const skipPost = flags.includes('--skip-post');
  const skipInsights = flags.includes('--skip-insights');

  return { startDate, endDate, fetchOnly, skipFetch, skipParse, skipPost, skipInsights };
}

async function main(): Promise<void> {
  const { startDate, endDate, fetchOnly, skipFetch, skipParse, skipPost, skipInsights } = parseArgs(process.argv.slice(2));

  // Generate list of dates in range
  const dates: dayjs.Dayjs[] = [];
  let currentDate = startDate;
  while (currentDate.isBefore(endDate) || currentDate.isSame(endDate, 'day')) {
    dates.push(currentDate);
    currentDate = currentDate.add(1, 'day');
  }

  console.log(
    `\n=== Processing ${dates.length} dates from ${startDate.format('YYYY-MM-DD')} to ${endDate.format('YYYY-MM-DD')} ===\n`,
  );

  const results: { date: string; success: boolean; error?: string }[] = [];

  // Process each date
  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    const dateStr = date.format('YYYY-MM-DD');

    console.log(`\n[${i + 1}/${dates.length}] Processing ${dateStr}...\n`);

    try {
      // Build command with flags
      let command = `npx tsx src/process-date.ts ${dateStr}`;
      if (fetchOnly) {
        command += ' --fetch-only';
      }
      if (skipFetch) {
        command += ' --skip-fetch';
      }
      if (skipParse) {
        command += ' --skip-parse';
      }
      if (skipPost) {
        command += ' --skip-post';
      }
      if (skipInsights) {
        command += ' --skip-insights';
      }

      execSync(command, { stdio: 'inherit' });
      results.push({ date: dateStr, success: true });
      console.log(`\n✅ Successfully processed ${dateStr}\n`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      results.push({ date: dateStr, success: false, error: errorMessage });
      console.error(`\n❌ Failed to process ${dateStr}: ${errorMessage}\n`);

      // Continue with next date instead of stopping
      console.log('Continuing with next date...\n');
    }
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('PROCESSING SUMMARY');
  console.log('='.repeat(60) + '\n');

  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  console.log(`Total dates processed: ${results.length}`);
  console.log(`✅ Successful: ${successful.length}`);
  console.log(`❌ Failed: ${failed.length}\n`);

  if (failed.length > 0) {
    console.log('Failed dates:');
    failed.forEach((r) => {
      console.log(`  - ${r.date}: ${r.error}`);
    });
    console.log();
    process.exit(1);
  }

  console.log('🎉 All dates processed successfully!\n');
}

main().catch((error) => {
  console.error('\n❌ Process failed:', error.message);
  process.exit(1);
});
