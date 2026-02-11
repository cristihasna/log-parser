import * as fs from 'fs';
import * as path from 'path';
import dayjs from 'dayjs';
import { aggregateByDay } from './aggregator';
import { ParsedEvent } from './types';

const DEFAULT_INPUT_DIR = './parsed';
const DEFAULT_OUTPUT_DIR = './aggregated';

function printUsage(): void {
  console.log(`
Usage: npx ts-node src/aggregate.ts [input-file] [options]

Options:
  --input, -i     Input JSON file with parsed events (default: parsed/parsed.json)
  --output, -o    Output file path (default: aggregated/aggregated.json)
  --date, -d      Filter to a single date (YYYY-MM-DD) and output one object
  --help, -h      Show this help message

Examples:
  npx ts-node src/aggregate.ts
  npx ts-node src/aggregate.ts parsed.json
  npx ts-node src/aggregate.ts -i parsed/parsed_week5.json -o aggregated/week5.json
  npx ts-node src/aggregate.ts -i parsed/parsed_2026-02-08.json -o aggregated/aggregated_2026-02-08.json --date 2026-02-08
`);
}

function parseArgs(args: string[]): { inputFile: string; outputFile: string; date?: string } {
  let inputFile = path.join(DEFAULT_INPUT_DIR, 'parsed.json');
  let outputFile = path.join(DEFAULT_OUTPUT_DIR, 'aggregated.json');
  let date: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }

    if (arg === '--input' || arg === '-i') {
      inputFile = args[++i];
      continue;
    }

    if (arg === '--output' || arg === '-o') {
      outputFile = args[++i];
      continue;
    }

    if (arg === '--date' || arg === '-d') {
      const dateStr = args[++i];
      const parsedDate = dayjs(dateStr, 'YYYY-MM-DD', true);
      if (!parsedDate.isValid()) {
        console.error(`Error: Invalid date: ${dateStr}`);
        process.exit(1);
      }
      date = parsedDate.format('YYYY-MM-DD');
      continue;
    }

    // Positional argument: treat as input file
    if (!arg.startsWith('-')) {
      inputFile = arg;
    }
  }

  return { inputFile, outputFile, date };
}

function main(): void {
  const args = process.argv.slice(2);
  const { inputFile, outputFile, date } = parseArgs(args);

  // Resolve input file path
  const resolvedInputPath = path.resolve(inputFile);

  if (!fs.existsSync(resolvedInputPath)) {
    console.error(`Error: File not found: ${resolvedInputPath}`);
    process.exit(1);
  }

  // Read and parse the JSON file
  const content = fs.readFileSync(resolvedInputPath, 'utf-8');
  const events: ParsedEvent[] = JSON.parse(content);

  console.error(`Loaded ${events.length} events from ${inputFile}`);

  // Aggregate by day
  const dailySummaries = aggregateByDay(events);

  console.error(`Generated summaries for ${dailySummaries.length} days`);

  const outputData = date
    ? (() => {
        const summary = dailySummaries.find((s) => s.date === date);
        if (!summary) {
          console.error(`Error: No summary found for date ${date}`);
          process.exit(1);
        }
        return summary;
      })()
    : dailySummaries;

  // Format output
  const output = JSON.stringify(outputData, null, 2);

  // Write output
  const resolvedOutputPath = path.resolve(outputFile);
  const outputDir = path.dirname(resolvedOutputPath);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(resolvedOutputPath, output, 'utf-8');
  console.error(`Output written to ${resolvedOutputPath}`);
}

main();
