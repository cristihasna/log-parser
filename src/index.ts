import * as fs from 'fs';
import * as path from 'path';
import { parseLogFile } from './parser';
import { formatToCSV, formatToJSON, formatToLog, formatToNDJSON } from './formatter';

type OutputFormat = 'csv' | 'json' | 'log' | 'ndjson';

function printUsage(): void {
  console.log(`
Usage: npx ts-node src/index.ts <input-file> [options]

Options:
  --format, -f    Output format: csv, json, log, ndjson (default: log)
  --output, -o    Output file path (default: stdout)
  --help, -h      Show this help message

Examples:
  npx ts-node src/index.ts logs.txt
  npx ts-node src/index.ts logs.txt --format csv --output parsed.csv
  npx ts-node src/index.ts logs.txt -f json -o parsed.json
`);
}

function parseArgs(args: string[]): { inputFile: string; format: OutputFormat; outputFile?: string } {
  let inputFile = '';
  let format: OutputFormat = 'log';
  let outputFile: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }

    if (arg === '--format' || arg === '-f') {
      const nextArg = args[++i];
      if (['csv', 'json', 'log', 'ndjson'].includes(nextArg)) {
        format = nextArg as OutputFormat;
      } else {
        console.error(`Invalid format: ${nextArg}`);
        process.exit(1);
      }
      continue;
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

  return { inputFile, format, outputFile };
}

function main(): void {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    printUsage();
    process.exit(1);
  }

  const { inputFile, format, outputFile } = parseArgs(args);

  // Resolve input file path
  const resolvedInputPath = path.resolve(inputFile);

  if (!fs.existsSync(resolvedInputPath)) {
    console.error(`Error: File not found: ${resolvedInputPath}`);
    process.exit(1);
  }

  // Read and parse the log file
  const content = fs.readFileSync(resolvedInputPath, 'utf-8');
  const events = parseLogFile(content);

  console.error(`Parsed ${events.length} events from ${inputFile}`);

  // Format output
  let output: string;
  switch (format) {
    case 'csv':
      output = formatToCSV(events);
      break;
    case 'json':
      output = formatToJSON(events);
      break;
    case 'ndjson':
      output = formatToNDJSON(events);
      break;
    case 'log':
    default:
      output = formatToLog(events);
  }

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
