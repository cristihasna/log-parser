#!/usr/bin/env tsx
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import dayjs, { Dayjs } from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Chat, Client, LocalAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import { buildInsightsPrompt } from './insights-prompt';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

const DEFAULT_INSIGHTS_OUTPUT_DIR = './insights';
const DEFAULT_LOGS_DIR = './logs';
const DEFAULT_AGGREGATED_DIR = './aggregated';
const DEFAULT_AUTH_DIR = '.wwebjs_auth';
const DEFAULT_TIMEZONE = 'Europe/Bucharest';
const DEFAULT_MODEL = 'gemini-2.5-flash';
const DEFAULT_SYNC_DELAY_SECONDS = 30;
const DEFAULT_PREVIOUS_CONTEXT_DAYS = 5;
const DEFAULT_WHATSAPP_INSIGHTS_FETCH_LIMIT = 100;
const CLIENT_ID = 'log-parser';
const INSIGHTS_HEADER_PREFIX = 'Daily insights -';

const TIMEZONE = process.env.TIMEZONE || DEFAULT_TIMEZONE;
const AUTH_DIR = process.env.WHATSAPP_AUTH_DIR || DEFAULT_AUTH_DIR;
const INSIGHTS_OUTPUT_DIR = process.env.INSIGHTS_OUTPUT_DIR || DEFAULT_INSIGHTS_OUTPUT_DIR;
const LOGS_DIR = process.env.WHATSAPP_OUTPUT_DIR || DEFAULT_LOGS_DIR;
const AGGREGATED_DIR = process.env.AGGREGATED_OUTPUT_DIR || DEFAULT_AGGREGATED_DIR;
const SYNC_DELAY = getEnvNumber('SYNC_DELAY_SECONDS', DEFAULT_SYNC_DELAY_SECONDS);
const FETCH_LIMIT = getEnvNumber('WHATSAPP_INSIGHTS_FETCH_LIMIT', DEFAULT_WHATSAPP_INSIGHTS_FETCH_LIMIT);
const HEADLESS_ENV = process.env.WHATSAPP_HEADLESS;
const CHROME_PATH = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
const INSIGHTS_GROUP_NAME = process.env.WHATSAPP_INSIGHTS_GROUP_NAME;
const GEMINI_MODEL = process.env.GEMINI_INSIGHTS_MODEL || process.env.GEMINI_MODEL || DEFAULT_MODEL;

type AtomicPreviousContextSource = 'insight_file' | 'whatsapp_message' | 'previous_raw_logs' | 'none';
type PreviousContextSource = AtomicPreviousContextSource | 'mixed';

interface PreviousContextResult {
  source: PreviousContextSource;
  content: string;
  requestedDays: number;
  includedDays: number;
}

interface PreviousContextChunk {
  date: Dayjs;
  source: Exclude<AtomicPreviousContextSource, 'none'>;
  content: string;
}

interface BabyAge {
  months: number;
  weeks: number;
  days: number;
}

interface ParsedArgs {
  targetDate: Dayjs;
  storeOnly: boolean;
  preferLocal: boolean;
  previousContextDays: number;
}

function getEnvNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function printUsage(): void {
  console.log(`
Usage: npx tsx src/insights-daily.ts [date] [options]

Arguments:
  [date]          Date in YYYY-MM-DD format (defaults to yesterday)

Options:
  --store-only    Generate and store insights locally, skip WhatsApp operations
  --prefer-local  Reuse local insights file if it already exists for the date
  --previous-days Number of previous days to include in context (default: 5)
  --help, -h      Show this help message

Environment:
  GEMINI_API_KEY                 Required when generating new insights.
  WHATSAPP_INSIGHTS_GROUP_NAME   Required only when sending to WhatsApp.
  BIRTHDATE                      Required when generating new insights.
  GEMINI_INSIGHTS_MODEL          Optional. Insights model override.
  PREVIOUS_CONTEXT_DAYS          Optional. Default: 5
  WHATSAPP_INSIGHTS_FETCH_LIMIT  Optional. Default: 100
  INSIGHTS_OUTPUT_DIR            Optional. Default: ./insights
`);
}

function parsePositiveIntegerArg(optionName: string, rawValue: string): number {
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.error(`Error: Invalid ${optionName} value "${rawValue}". Expected a positive integer.`);
    process.exit(1);
  }

  return parsed;
}

function parseArgs(args: string[]): ParsedArgs {
  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  let storeOnly = false;
  let preferLocal = false;
  let previousContextDays = getEnvNumber('PREVIOUS_CONTEXT_DAYS', DEFAULT_PREVIOUS_CONTEXT_DAYS);
  const positionalArgs: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--store-only') {
      storeOnly = true;
      continue;
    }

    if (arg === '--prefer-local') {
      preferLocal = true;
      continue;
    }

    if (arg === '--previous-days') {
      const value = args[i + 1];
      if (!value || value.startsWith('--')) {
        console.error('Error: Missing value for --previous-days');
        process.exit(1);
      }
      previousContextDays = parsePositiveIntegerArg('--previous-days', value);
      i += 1;
      continue;
    }

    if (arg.startsWith('--previous-days=')) {
      const value = arg.slice('--previous-days='.length);
      previousContextDays = parsePositiveIntegerArg('--previous-days', value);
      continue;
    }

    if (arg.startsWith('--')) {
      console.error(`Error: Unknown option: ${arg}`);
      process.exit(1);
    }

    positionalArgs.push(arg);
  }

  if (positionalArgs.length > 1) {
    console.error(`Error: Too many positional arguments: ${positionalArgs.join(' ')}`);
    process.exit(1);
  }

  if (positionalArgs.length === 0) {
    const defaultDate = dayjs().tz(TIMEZONE).subtract(1, 'day').startOf('day');
    console.log(`No date provided, defaulting to yesterday: ${defaultDate.format('YYYY-MM-DD')}`);
    return { targetDate: defaultDate, storeOnly, preferLocal, previousContextDays };
  }

  const dateStr = positionalArgs[0];
  const date = dayjs.tz(dateStr, 'YYYY-MM-DD', TIMEZONE);
  if (!date.isValid()) {
    console.error(`Error: Invalid date: ${dateStr}`);
    process.exit(1);
  }

  return { targetDate: date.startOf('day'), storeOnly, preferLocal, previousContextDays };
}

function sleep(seconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

async function waitForSync(seconds: number): Promise<void> {
  if (seconds <= 0) return;

  console.info(`Waiting ${seconds}s for chat history to sync...`);
  for (let i = seconds; i > 0; i--) {
    if (i % 10 === 0 || i <= 5) {
      console.info(`  ${i}s remaining...`);
    }
    await sleep(1);
  }
  console.info('Sync wait complete.');
}

function getBackoffDelayMs(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const exponential = baseDelayMs * Math.pow(2, attempt - 1);
  const jitter = Math.floor(Math.random() * 250);
  return Math.min(exponential + jitter, maxDelayMs);
}

function isRetryableGeminiError(error: unknown): boolean {
  const err = error as { message?: string; status?: number; response?: { status?: number } };
  const status = err?.status ?? err?.response?.status;
  if (status === 429 || status === 503) return true;

  const message = (err?.message || '').toLowerCase();
  return (
    message.includes('too many requests') ||
    message.includes('rate limit') ||
    message.includes('resource_exhausted') ||
    message.includes('service busy') ||
    message.includes('unavailable')
  );
}

function requireFile(filePath: string): string {
  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Required file not found: ${resolvedPath}`);
  }

  return fs.readFileSync(resolvedPath, 'utf-8');
}

function getInsightsFilePath(date: Dayjs): string {
  return path.join(INSIGHTS_OUTPUT_DIR, `insights_${date.format('YYYY-MM-DD')}.txt`);
}

function getRawLogsPath(date: Dayjs): string {
  return path.join(LOGS_DIR, `logs_${date.format('YYYY-MM-DD')}.txt`);
}

function getAggregatedPath(date: Dayjs): string {
  return path.join(AGGREGATED_DIR, `aggregated_${date.format('YYYY-MM-DD')}.json`);
}

function formatDateRo(date: Dayjs): string {
  const months = ['ian.', 'feb.', 'mar.', 'apr.', 'mai', 'iun.', 'iul.', 'aug.', 'sept.', 'oct.', 'nov.', 'dec.'];
  const month = months[date.month()] ?? '';
  return `${date.date()} ${month} ${date.year()}`;
}

function getInsightsHeader(date: Dayjs): string {
  return `${INSIGHTS_HEADER_PREFIX} ${formatDateRo(date)}`;
}

function readNonEmptyFile(filePath: string): string | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const content = fs.readFileSync(filePath, 'utf-8').trim();
  if (!content) {
    return null;
  }

  return content;
}

function formatPreviousContext(chunks: PreviousContextChunk[]): string {
  return chunks
    .map((chunk) => {
      return [`Date: ${chunk.date.format('YYYY-MM-DD')}`, `Source: ${chunk.source}`, chunk.content].join('\n');
    })
    .join('\n\n---\n\n');
}

function computeBabyAge(targetDate: Dayjs): BabyAge {
  const birthdateRaw = process.env.BIRTHDATE;
  if (!birthdateRaw) {
    throw new Error('Missing BIRTHDATE environment variable.');
  }

  const birthdate = dayjs(birthdateRaw).tz(TIMEZONE);
  if (!birthdate.isValid()) {
    throw new Error(`Invalid BIRTHDATE value: ${birthdateRaw}`);
  }

  const targetMoment = targetDate.endOf('day');
  if (targetMoment.isBefore(birthdate)) {
    throw new Error(`BIRTHDATE ${birthdate.format()} is after target date ${targetDate.format('YYYY-MM-DD')}`);
  }

  const months = targetMoment.diff(birthdate, 'month');
  const afterMonths = birthdate.add(months, 'month');
  const remainingDays = targetMoment.diff(afterMonths, 'day');
  const weeks = Math.floor(remainingDays / 7);
  const days = remainingDays % 7;

  return { months, weeks, days };
}

function sanitizeGeneratedText(text: string): string {
  let cleaned = text.trim();
  cleaned = cleaned
    .replace(/^```[a-zA-Z]*\n?/, '')
    .replace(/\n?```$/, '')
    .trim();
  return cleaned;
}

function enforceHeader(text: string, targetDate: Dayjs): string {
  const formattedDateRo = formatDateRo(targetDate);
  const expectedHeader = `${INSIGHTS_HEADER_PREFIX} ${formattedDateRo}`;

  return `${expectedHeader}\n\n${text.trim()}`;
}

async function generateInsights(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing GEMINI_API_KEY environment variable.');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: {
      responseMimeType: 'text/plain',
    },
  });

  const maxAttempts = 5;
  const baseDelayMs = 1000;
  const maxDelayMs = 20000;

  let text = '';
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      text = result.response.text();
      break;
    } catch (error: unknown) {
      const shouldRetry = isRetryableGeminiError(error);
      if (!shouldRetry || attempt === maxAttempts) {
        throw error;
      }

      const delay = getBackoffDelayMs(attempt, baseDelayMs, maxDelayMs);
      console.error(
        `Gemini insights request failed (attempt ${attempt}/${maxAttempts}). Retrying in ${Math.round(delay / 1000)}s...`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return sanitizeGeneratedText(text);
}

async function findGroupChat(client: Client, groupName: string): Promise<Chat> {
  const chats = await client.getChats();
  const groupChat = chats.find((chat) => chat.isGroup && chat.name === groupName);

  if (!groupChat) {
    const groupNames = chats.filter((chat) => chat.isGroup).map((chat) => chat.name);
    const available = groupNames.length > 0 ? groupNames.join(', ') : '(none)';
    throw new Error(`Group "${groupName}" not found. Available groups: ${available}`);
  }

  return groupChat;
}

async function loadPreviousContext(targetDate: Dayjs, previousDays: number): Promise<PreviousContextResult> {
  const previousDates = Array.from({ length: previousDays }, (_, index) => targetDate.subtract(index + 1, 'day'));

  const chunks: PreviousContextChunk[] = [];

  for (const previousDate of previousDates) {
    const previousRawLogsPath = getRawLogsPath(previousDate);
    const previousRawLogs = readNonEmptyFile(previousRawLogsPath);
    if (previousRawLogs) {
      chunks.push({
        date: previousDate,
        source: 'previous_raw_logs',
        content: previousRawLogs,
      });
    }

    const previousInsightsPath = getInsightsFilePath(previousDate);
    const previousInsights = readNonEmptyFile(previousInsightsPath);
    if (previousInsights) {
      chunks.push({
        date: previousDate,
        source: 'insight_file',
        content: previousInsights,
      });
    }
  }

  if (chunks.length === 0) {
    return {
      source: 'none',
      content: 'no previous insights available (first request)',
      requestedDays: previousDays,
      includedDays: 0,
    };
  }

  const uniqueSources = new Set(chunks.map((chunk) => chunk.source));
  const source: PreviousContextSource = uniqueSources.size === 1 ? chunks[0].source : 'mixed';
  return {
    source,
    content: formatPreviousContext(chunks),
    requestedDays: previousDays,
    includedDays: chunks.length,
  };
}

async function withWhatsAppClient<T>(work: (client: Client) => Promise<T>): Promise<T> {
  const puppeteerOptions: Record<string, unknown> = {
    headless: HEADLESS_ENV !== '0',
    protocolTimeout: 60 * 1000 * 10,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  };

  if (CHROME_PATH) {
    console.error(`Using custom Chrome path: ${CHROME_PATH}`);
    puppeteerOptions.executablePath = CHROME_PATH;
  }

  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: AUTH_DIR, clientId: CLIENT_ID }),
    puppeteer: puppeteerOptions,
  });

  return await new Promise<T>((resolve, reject) => {
    let settled = false;

    const safeReject = async (error: unknown): Promise<void> => {
      if (settled) return;
      settled = true;
      try {
        await client.destroy();
      } catch {
        // best-effort cleanup
      }
      reject(error);
    };

    const safeResolve = async (value: T): Promise<void> => {
      if (settled) return;
      settled = true;
      try {
        await client.destroy();
      } catch {
        // best-effort cleanup
      }
      resolve(value);
    };

    client.on('qr', (qr: string) => {
      console.info('QR received. Scan it with WhatsApp to authenticate.');
      qrcode.generate(qr, { small: true });
    });

    client.on('auth_failure', (msg: string) => {
      void safeReject(new Error(`Authentication failed: ${msg}`));
    });

    client.on('disconnected', (reason: string) => {
      if (!settled) {
        console.error(`Client disconnected: ${reason}`);
      }
    });

    client.on('ready', async () => {
      try {
        console.info('WhatsApp client ready.');
        await waitForSync(SYNC_DELAY);
        const result = await work(client);
        await safeResolve(result);
      } catch (error) {
        await safeReject(error);
      }
    });

    client.initialize();
  });
}

interface InsightsGenerationInput {
  targetDate: Dayjs;
  age: BabyAge;
  previousContext: PreviousContextResult;
  aggregatedJson: string;
  rawLogs: string;
  insightsOutputPath: string;
}

async function generateAndStoreInsights(input: InsightsGenerationInput): Promise<string> {
  const prompt = buildInsightsPrompt({
    targetDate: input.targetDate.format('YYYY-MM-DD'),
    timezone: TIMEZONE,
    ageMonths: input.age.months,
    ageWeeks: input.age.weeks,
    ageDays: input.age.days,
    previousContextSource: input.previousContext.source,
    previousContextRequestedDays: input.previousContext.requestedDays,
    previousContextIncludedDays: input.previousContext.includedDays,
    previousContext: input.previousContext.content,
    aggregatedJson: input.aggregatedJson,
    rawLogs: input.rawLogs,
  });

  console.log(
    `Previous context source: ${input.previousContext.source} (${input.previousContext.includedDays}/${input.previousContext.requestedDays} days included)`,
  );
  console.log(`Generating insights with Gemini model: ${GEMINI_MODEL}...`);

  let insightsText = await generateInsights(prompt);
  insightsText = enforceHeader(insightsText, input.targetDate);

  fs.mkdirSync(path.dirname(input.insightsOutputPath), { recursive: true });
  fs.writeFileSync(input.insightsOutputPath, insightsText, 'utf-8');
  console.log(`Insights saved to ${input.insightsOutputPath}`);

  return insightsText;
}

function getExistingLocalInsights(date: Dayjs): string | null {
  const insightsPath = path.resolve(getInsightsFilePath(date));
  if (!fs.existsSync(insightsPath)) {
    return null;
  }

  const content = fs.readFileSync(insightsPath, 'utf-8').trim();
  if (!content) {
    return null;
  }

  return content;
}

async function main(): Promise<void> {
  const { targetDate, storeOnly, preferLocal, previousContextDays } = parseArgs(process.argv.slice(2));
  const dateStr = targetDate.format('YYYY-MM-DD');

  if (!storeOnly && !INSIGHTS_GROUP_NAME) {
    throw new Error('Missing WHATSAPP_INSIGHTS_GROUP_NAME environment variable.');
  }

  const insightsOutputPath = path.resolve(getInsightsFilePath(targetDate));
  const existingLocalInsights = preferLocal ? getExistingLocalInsights(targetDate) : null;

  if (preferLocal && existingLocalInsights) {
    console.log(`\n=== Reusing local insights for ${dateStr} ===\n`);
    console.log(`Output: ${insightsOutputPath}`);

    if (storeOnly) {
      console.log('Mode: store-only + prefer-local');
      console.log('Existing local insights found. Skipping generation and WhatsApp send.');
      console.log('\n✅ Daily insights already available locally.\n');
      return;
    }

    console.log(`Insights group: ${INSIGHTS_GROUP_NAME}\n`);
    await withWhatsAppClient(async (client) => {
      const insightsGroup = await findGroupChat(client, INSIGHTS_GROUP_NAME!);
      console.log(`Found group "${INSIGHTS_GROUP_NAME}".`);
      await insightsGroup.sendMessage(existingLocalInsights, { waitUntilMsgSent: true });
      console.log('Posted existing local insights to WhatsApp successfully.');
    });
    console.log('\n✅ Daily insights pipeline completed successfully.\n');
    return;
  }

  const rawLogsPath = getRawLogsPath(targetDate);
  const aggregatedPath = getAggregatedPath(targetDate);
  const rawLogs = requireFile(rawLogsPath);
  const aggregatedRaw = requireFile(aggregatedPath);

  // Validate JSON before sending to Gemini so runtime failures are explicit.
  let aggregatedJson: string;
  try {
    aggregatedJson = JSON.stringify(JSON.parse(aggregatedRaw), null, 2);
  } catch (error) {
    throw new Error(`Invalid aggregated JSON in ${path.resolve(aggregatedPath)}: ${String(error)}`);
  }

  const age = computeBabyAge(targetDate);

  console.log(`\n=== Generating daily insights for ${dateStr} ===\n`);
  console.log(`Raw logs: ${path.resolve(rawLogsPath)}`);
  console.log(`Aggregated: ${path.resolve(aggregatedPath)}`);
  console.log(`Output: ${insightsOutputPath}`);
  console.log(`Previous context days requested: ${previousContextDays}`);
  if (storeOnly) {
    console.log('Mode: store-only (skipping WhatsApp)\n');
  } else if (preferLocal) {
    console.log('Mode: prefer-local (no local file found, generating a new one)');
    console.log(`Insights group: ${INSIGHTS_GROUP_NAME}\n`);
  } else {
    console.log(`Insights group: ${INSIGHTS_GROUP_NAME}\n`);
  }

  if (storeOnly) {
    const previousContext = await loadPreviousContext(targetDate, previousContextDays);
    await generateAndStoreInsights({
      targetDate,
      age,
      previousContext,
      aggregatedJson,
      rawLogs,
      insightsOutputPath,
    });
    console.log('\n✅ Daily insights generated and stored locally.\n');
    return;
  }

  await withWhatsAppClient(async (client) => {
    const insightsGroup = await findGroupChat(client, INSIGHTS_GROUP_NAME!);
    console.log(`Found group "${INSIGHTS_GROUP_NAME}".`);

    const previousContext = await loadPreviousContext(targetDate, previousContextDays);
    const insightsText = await generateAndStoreInsights({
      targetDate,
      age,
      previousContext,
      aggregatedJson,
      rawLogs,
      insightsOutputPath,
    });

    await insightsGroup.sendMessage(insightsText, { waitUntilMsgSent: true });
    console.log('Insights message sent to WhatsApp successfully.');
  });

  console.log('\n✅ Daily insights pipeline completed successfully.\n');
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\n❌ Daily insights failed: ${message}`);
  process.exit(1);
});
