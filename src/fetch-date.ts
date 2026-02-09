import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import dayjs, { Dayjs } from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { Client, LocalAuth, Message, Chat } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';

dayjs.extend(utc);
dayjs.extend(timezone);

const DEFAULT_FETCH_LIMIT = 500;
const DEFAULT_AUTH_DIR = '.wwebjs_auth';
const DEFAULT_OUTPUT_DIR = './logs';
const CLIENT_ID = 'log-parser';
const DEFAULT_SYNC_DELAY_SECONDS = 30;
const DEFAULT_FETCH_RETRIES = 3;
const DEFAULT_RETRY_DELAY_SECONDS = 10;
const WHATSAPP_GROUP_NAME = 'Baby log';
const DEFAULT_TIMEZONE = 'Europe/Bucharest'; // Change if needed

// Overlap window to capture sessions that cross into next day
const OVERLAP_HOURS_AFTER = 8; // End fetching at 08:00 next day (covers long sleep sessions)

const GROUP_NAME = process.env.WHATSAPP_GROUP_NAME || WHATSAPP_GROUP_NAME;

const AUTH_DIR = process.env.WHATSAPP_AUTH_DIR || DEFAULT_AUTH_DIR;
const OUTPUT_DIR = process.env.WHATSAPP_OUTPUT_DIR || DEFAULT_OUTPUT_DIR;
const HEADLESS_ENV = process.env.WHATSAPP_HEADLESS;
const CHROME_PATH = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
const SYNC_DELAY = getEnvNumber('SYNC_DELAY_SECONDS', DEFAULT_SYNC_DELAY_SECONDS);
const FETCH_RETRIES = getEnvNumber('FETCH_RETRIES', DEFAULT_FETCH_RETRIES);
const RETRY_DELAY = getEnvNumber('RETRY_DELAY_SECONDS', DEFAULT_RETRY_DELAY_SECONDS);
const TIMEZONE = process.env.TIMEZONE || DEFAULT_TIMEZONE;

function getEnvNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(seconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

async function waitForSync(seconds: number): Promise<void> {
  console.info(`Waiting ${seconds}s for chat history to sync...`);
  for (let i = seconds; i > 0; i--) {
    if (i % 10 === 0) {
      console.info(`  ${i}s remaining...`);
    }
    await sleep(1);
  }
  console.info('Sync wait complete.');
}

async function formatMessageLine(message: Message): Promise<string[]> {
  const contact = await message.getContact();
  const sender = contact.name || contact.pushname || 'Unknown Sender';

  const timestamp = dayjs.unix(message.timestamp).tz(TIMEZONE);
  const prefix = `${timestamp.format('DD/MM/YYYY, HH:mm')} - ${sender}: `;
  const body = message.body || '';

  const lines = body.split(/\r?\n/);
  if (lines.length === 0) {
    return [];
  }

  const formatted: string[] = [];
  formatted.push(`${prefix}${lines[0]}`);
  for (let i = 1; i < lines.length; i++) {
    formatted.push(lines[i]);
  }

  return formatted;
}

function parseDateArg(args: string[]): Dayjs {
  const [value] = args;
  if (!value) {
    console.error('Usage: npx ts-node src/fetch-logs-daily.ts <YYYY-MM-DD>');
    process.exit(1);
  }

  const date = dayjs(value, 'YYYY-MM-DD', true);
  if (!date.isValid()) {
    console.error(`Error: Invalid date format: ${value}. Use YYYY-MM-DD`);
    process.exit(1);
  }

  return date;
}

async function main(): Promise<void> {
  const targetDate = parseDateArg(process.argv.slice(2));
  // Define fetch window: start at midnight of target date, end with overlap into next day
  const windowStart = targetDate.startOf('day').tz(TIMEZONE, true);
  const windowEnd = targetDate.add(1, 'day').add(OVERLAP_HOURS_AFTER, 'hour').startOf('hour');
  const now = dayjs();
  const effectiveEnd = windowEnd.isAfter(now) ? now : windowEnd;

  console.error(`Fetching messages for group "${GROUP_NAME}"`);
  console.error(`Target date: ${targetDate.format('YYYY-MM-DD')}`);
  console.error(
    `Window (with overlap): ${windowStart.format('YYYY-MM-DD HH:mm')} → ${effectiveEnd.format('YYYY-MM-DD HH:mm')}`,
  );

  const puppeteerOptions: Record<string, unknown> = {
    headless: HEADLESS_ENV !== '0',
    protocolTimeout: 60 * 1000 * 10, // 10 minutes
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

  client.on('qr', (qr: string) => {
    console.info('QR received. Scan it with WhatsApp to authenticate.');
    qrcode.generate(qr, { small: true });
  });

  client.on('auth_failure', (msg: string) => {
    console.error(`Authentication failed: ${msg}`);
  });

  client.on('disconnected', (reason: string) => {
    console.error(`Client disconnected: ${reason}`);
  });

  client.on('ready', async () => {
    try {
      console.info('Client is ready.');

      // Wait for chat history to sync
      // await waitForSync(SYNC_DELAY);

      const chats = await client.getChats();
      const groupChat = chats.find((chat) => chat.isGroup && chat.name === GROUP_NAME);

      if (!groupChat) {
        const groupNames = chats.filter((chat) => chat.isGroup).map((chat) => chat.name);
        console.error(`Group "${GROUP_NAME}" not found.`);
        console.warn('Available groups:');
        for (const name of groupNames) {
          console.log(`- ${name}`);
        }
        await client.destroy();
        process.exit(1);
      }

      console.info(`Found group "${GROUP_NAME}", fetching messages...`);

      // Retry fetching messages until we get enough or run out of retries
      let messages: Message[] = [];
      let filtered: Message[] = [];

      for (let attempt = 1; attempt <= FETCH_RETRIES; attempt++) {
        console.info(`Fetch attempt ${attempt}/${FETCH_RETRIES}...`);

        messages = await groupChat.fetchMessages({ limit: DEFAULT_FETCH_LIMIT });
        filtered = messages.filter((msg) => {
          if (msg.type !== 'chat') return false;
          if (!msg.body || !msg.body.trim()) return false;
          const msgDate = dayjs.unix(msg.timestamp);
          return msgDate.valueOf() >= windowStart.valueOf() && msgDate.valueOf() <= effectiveEnd.valueOf();
        });

        console.info(`  Fetched ${messages.length} total messages, ${filtered.length} in time window`);

        // If we got a reasonable number of messages, we're done
        if (filtered.length >= 20 || attempt === FETCH_RETRIES) {
          break;
        }

        // Otherwise wait and retry
        console.info(`  Low message count, waiting ${RETRY_DELAY}s before retry...`);
        await sleep(RETRY_DELAY);
      }

      filtered.sort((a, b) => a.timestamp - b.timestamp);

      const lines: string[] = [];
      for (const message of filtered) {
        const formattedLines = await formatMessageLine(message);
        for (const line of formattedLines) {
          lines.push(line);
        }
      }

      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
      const filename = `logs_${targetDate.format('YYYY-MM-DD')}.txt`;
      const outputPath = path.join(OUTPUT_DIR, filename);
      fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');

      console.error(`Wrote ${lines.length} lines to ${outputPath}`);
      await client.destroy();
      process.exit(0);
    } catch (error) {
      console.error('Failed to fetch logs:', error);
      await client.destroy();
      process.exit(1);
    }
  });

  client.initialize();
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
