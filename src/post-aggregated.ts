#!/usr/bin/env tsx
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import dayjs from 'dayjs';

const DEFAULT_AGGREGATED_DIR = './aggregated';
const API_URL = process.env.AGGREGATED_LOGS_API_URL || 'http://localhost:8080/logs';

function printUsage(): void {
  console.log(`
Usage: npx tsx src/post-aggregated.ts [date] [options]

Arguments:
  [date]          Date in YYYY-MM-DD format (defaults to current date)

Options:
  --help, -h      Show this help message

Examples:
  npx tsx src/post-aggregated.ts
  npx tsx src/post-aggregated.ts 2026-02-09
`);
}

function parseArgs(args: string[]): dayjs.Dayjs {
  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  const positionalArgs = args.filter((arg) => !arg.startsWith('--'));
  if (positionalArgs.length === 0) {
    const date = dayjs();
    console.log(`No date provided, defaulting to current date: ${date.format('YYYY-MM-DD')}`);
    return date;
  }

  const dateStr = positionalArgs[0];
  const date = dayjs(dateStr, 'YYYY-MM-DD', true);
  if (!date.isValid()) {
    console.error(`Error: Invalid date: ${dateStr}`);
    process.exit(1);
  }

  return date;
}

async function main(): Promise<void> {
  const date = parseArgs(process.argv.slice(2));
  const dateStr = date.format('YYYY-MM-DD');
  const apiKey = process.env.AGGREGATED_LOGS_API_KEY;

  if (!apiKey) {
    console.error('Error: Missing AGGREGATED_LOGS_API_KEY in environment variables.');
    process.exit(1);
  }

  const inputFile = path.join(DEFAULT_AGGREGATED_DIR, `aggregated_${dateStr}.json`);
  const resolvedInputPath = path.resolve(inputFile);

  if (!fs.existsSync(resolvedInputPath)) {
    console.error(`Error: Aggregated file not found: ${resolvedInputPath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(resolvedInputPath, 'utf-8');

  let payload: unknown;
  try {
    payload = JSON.parse(content);
  } catch (error) {
    console.error(`Error: Invalid JSON in ${resolvedInputPath}`);
    throw error;
  }

  console.log(`Posting aggregated logs for ${dateStr} to ${API_URL}...`);

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const responseText = await response.text();
    console.error(`Error: Upload failed with status ${response.status} ${response.statusText}`);
    if (responseText) {
      console.error(`Response body: ${responseText}`);
    }
    process.exit(1);
  }

  console.log(`Upload successful for ${dateStr} (status ${response.status}).`);
}

main().catch((error) => {
  console.error('\n❌ Failed to upload aggregated logs:', error.message);
  process.exit(1);
});
