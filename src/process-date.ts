#!/usr/bin/env tsx
import 'dotenv/config';
import { execSync } from 'child_process';
import dayjs from 'dayjs';

function printUsage(): void {
  console.log(`
Usage: npx tsx src/process-date.ts <date> [options]

Arguments:
  <date>          Date in YYYY-MM-DD format (defaults to yesterday)

Options:
  --fetch-only    Only fetch logs, don't parse, aggregate, or post
  --parse-only    Only parse logs (assumes logs already fetched)
  --help, -h      Show this help message

Examples:
  # Process yesterday (default)
  npx tsx src/process-date.ts

  # Process specific date
  npx tsx src/process-date.ts 2026-01-20
  # Just fetch logs for a date
  npx tsx src/process-date.ts 2026-01-20 --fetch-only

  # Upload already aggregated logs for a date
  npx tsx src/post-aggregated.ts 2026-01-20
`);
}

function parseArgs(args: string[]): {
  date: dayjs.Dayjs;
  fetchOnly: boolean;
  parseOnly: boolean;
} {
  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  const flags = args.filter(arg => arg.startsWith('--'));
  const positionalArgs = args.filter(arg => !arg.startsWith('--'));

  // Default to yesterday if no date provided
  let date: dayjs.Dayjs;
  if (positionalArgs.length === 0) {
    date = dayjs().subtract(1, 'day');
    console.log(`No date provided, defaulting to yesterday: ${date.format('YYYY-MM-DD')}`);
  } else {
    const dateStr = positionalArgs[0];
    date = dayjs(dateStr, 'YYYY-MM-DD', true);
    if (!date.isValid()) {
      console.error(`Error: Invalid date: ${dateStr}`);
      process.exit(1);
    }
  }

  const fetchOnly = flags.includes('--fetch-only');
  const parseOnly = flags.includes('--parse-only');

  return { date, fetchOnly, parseOnly };
}

async function main(): Promise<void> {
  const { date, fetchOnly, parseOnly } = parseArgs(process.argv.slice(2));

  const dateStr = date.format('YYYY-MM-DD');
  const inputFile = `logs/logs_${dateStr}.txt`;
  const parsedFile = `parsed/parsed_${dateStr}.json`;
  const aggregatedFile = `aggregated/aggregated_${dateStr}.json`;

  console.log(`\n=== Processing ${dateStr} ===\n`);

  // Step 1: Fetch logs
  if (!parseOnly) {
    console.log('📥 Fetching logs...\n');
    try {
      execSync(`npm run fetch:daily -- ${dateStr}`, { stdio: 'inherit' });
      console.log('\n✅ Logs fetched\n');
    } catch (error) {
      console.error(`❌ Failed to fetch logs for ${dateStr}`);
      throw error;
    }
  }

  if (fetchOnly) {
    console.log(`Done! (fetch-only mode)\nOutput: ${inputFile}`);
    return;
  }

  // Step 2: Parse logs
  console.log('🧠 Parsing logs...\n');
  try {
    execSync(`npm run parse -- ${inputFile} -o ${parsedFile}`, { stdio: 'inherit' });
    console.log('\n✅ Logs parsed\n');
  } catch (error) {
    console.error(`❌ Failed to parse logs for ${dateStr}`);
    throw error;
  }

  // Step 3: Aggregate
  console.log('📊 Aggregating daily summary...\n');
  try {
    execSync(`npm run aggregate -- ${parsedFile} -o ${aggregatedFile} --date ${dateStr}`, { stdio: 'inherit' });
    console.log('\n✅ Summary aggregated\n');
  } catch (error) {
    console.error(`❌ Failed to aggregate for ${dateStr}`);
    throw error;
  }

  // Step 4: Post aggregated logs
  console.log('📤 Posting aggregated logs...\n');
  try {
    execSync(`npm run post:daily -- ${dateStr}`, { stdio: 'inherit' });
    console.log('\n✅ Aggregated logs posted\n');
  } catch (error) {
    console.error(`❌ Failed to post aggregated logs for ${dateStr}`);
    throw error;
  }

  // Step 5: Generate and send daily insights (non-blocking)
  console.log('💡 Generating daily insights...\n');
  try {
    execSync(`npm run insights:daily -- ${dateStr}`, { stdio: 'inherit' });
    console.log('\n✅ Daily insights generated and sent\n');
  } catch (error) {
    console.warn(`⚠️ Insights pipeline failed for ${dateStr}, continuing without blocking daily process.`);
    if (error instanceof Error && error.message) {
      console.warn(error.message);
    }
  }

  console.log(`\n🎉 Complete! Processed ${dateStr} successfully.\n`);
  console.log('Output files:');
  console.log(`  - Logs: ${inputFile}`);
  console.log(`  - Parsed: ${parsedFile}`);
  console.log(`  - Aggregated: ${aggregatedFile}`);
  console.log('Remote upload: completed\n');
}

main().catch((error) => {
  console.error('\n❌ Process failed:', error.message);
  process.exit(1);
});
