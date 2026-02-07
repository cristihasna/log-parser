import * as fs from 'fs';
import * as path from 'path';
import { aggregateByDay } from './aggregator';
import { ParsedEventJSON } from './types';

function printUsage(): void {
  console.log(`
Usage: npx ts-node src/aggregate.ts <input-json-file> [options]

Options:
  --output, -o    Output file path (default: stdout)
  --help, -h      Show this help message

Examples:
  npx ts-node src/aggregate.ts parsed.json
  npx ts-node src/aggregate.ts parsed.json --output daily-summary.json
`);
}

function parseArgs(args: string[]): { inputFile: string; outputFile?: string } {
  let inputFile = '';
  let outputFile: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }

    if (arg === '--output' || arg === '-o') {
      outputFile = args[++i];
      continue;
    }

    if (!arg.startsWith('-')) {
      inputFile = arg;
    }
  }

  if (!inputFile) {
    console.error('Error: No input file specified');
    printUsage();
    process.exit(1);
  }

  return { inputFile, outputFile };
}

function main(): void {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    printUsage();
    process.exit(1);
  }

  const { inputFile, outputFile } = parseArgs(args);

  // Resolve input file path
  const resolvedInputPath = path.resolve(inputFile);

  if (!fs.existsSync(resolvedInputPath)) {
    console.error(`Error: File not found: ${resolvedInputPath}`);
    process.exit(1);
  }

  // Read and parse the JSON file
  const content = fs.readFileSync(resolvedInputPath, 'utf-8');
  const events: ParsedEventJSON[] = JSON.parse(content);

  console.error(`Loaded ${events.length} events from ${inputFile}`);

  // Aggregate by day
  const dailySummaries = aggregateByDay(events);

  console.error(`Generated summaries for ${dailySummaries.length} days`);

  // Format output
  const output = JSON.stringify(dailySummaries, null, 2);

  // Write output
  if (outputFile) {
    const resolvedOutputPath = path.resolve(outputFile);
    fs.writeFileSync(resolvedOutputPath, output, 'utf-8');
    console.error(`Output written to ${resolvedOutputPath}`);
  } else {
    console.log(output);
  }
}

main();
