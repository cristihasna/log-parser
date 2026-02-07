import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { parseWithGemini, sortEvents, validateTimestamps } from './gemini-parser';

type OutputFormat = 'json' | 'ndjson';

function printUsage(): void {
  console.log(`
Usage: npx ts-node src/index.ts <input-file> [options]

Options:
  --format, -f    Output format: json, ndjson (default: json)
  --output, -o    Output file path (default: stdout)
  --help, -h      Show this help message

Environment:
  GEMINI_API_KEY  Required. Your Gemini API key.

Examples:
  npx ts-node src/index.ts logs.txt
  npx ts-node src/index.ts logs.txt --format json --output parsed.json
  npx ts-node src/index.ts logs/logs_week1.txt -o parsed_week1.json
`);
}

function parseArgs(args: string[]): { inputFile: string; format: OutputFormat; outputFile?: string } {
  let inputFile = '';
  let format: OutputFormat = 'json';
  let outputFile: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }

    if (arg === '--format' || arg === '-f') {
      const nextArg = args[++i];
      if (['json', 'ndjson'].includes(nextArg)) {
        format = nextArg as OutputFormat;
      } else {
        console.error(`Invalid format: ${nextArg}. Supported: json, ndjson`);
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

function formatToJSON(events: any[]): string {
  return JSON.stringify(events, null, 2);
}

function formatToNDJSON(events: any[]): string {
  return events.map(e => JSON.stringify(e)).join('\n');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    printUsage();
    process.exit(1);
  }

  const { inputFile, format, outputFile } = parseArgs(args);

  // Check for API key
  if (!process.env.GEMINI_API_KEY) {
    console.error('Error: GEMINI_API_KEY environment variable is not set');
    console.error('Create a .env file with GEMINI_API_KEY=your_key or set it in your environment');
    process.exit(1);
  }

  // Resolve input file path
  const resolvedInputPath = path.resolve(inputFile);

  if (!fs.existsSync(resolvedInputPath)) {
    console.error(`Error: File not found: ${resolvedInputPath}`);
    process.exit(1);
  }

  // Read the log file
  const content = fs.readFileSync(resolvedInputPath, 'utf-8');
  console.error(`Reading ${inputFile} (${content.length} characters)...`);

  try {
    // Parse using Gemini API
    let events = await parseWithGemini(content);
    
    // Validate and sort
    events = validateTimestamps(events);
    events = sortEvents(events);

    console.error(`Successfully parsed ${events.length} events`);

    // Format output
    let output: string;
    switch (format) {
      case 'ndjson':
        output = formatToNDJSON(events);
        break;
      case 'json':
      default:
        output = formatToJSON(events);
    }

    // Write output
    if (outputFile) {
      const resolvedOutputPath = path.resolve(outputFile);
      const outputDir = path.dirname(resolvedOutputPath);
      
      // Create directory if it doesn't exist
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      fs.writeFileSync(resolvedOutputPath, output, 'utf-8');
      console.error(`Output written to ${resolvedOutputPath}`);
    } else {
      console.log(output);
    }
  } catch (error) {
    console.error('Error parsing logs:', error);
    process.exit(1);
  }
}

main();
