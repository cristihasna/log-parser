import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import dayjs, { Dayjs } from 'dayjs';
import { Client, LocalAuth, Message, Chat } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';

const DEFAULT_FETCH_LIMIT = 500;
const DEFAULT_AUTH_DIR = '.wwebjs_auth';
const DEFAULT_OUTPUT_DIR = './logs';
const CLIENT_ID = 'log-parser';
const DEFAULT_SYNC_DELAY_SECONDS = 30;
const DEFAULT_FETCH_RETRIES = 3;
const DEFAULT_RETRY_DELAY_SECONDS = 10;
const WHATSAPP_GROUP_NAME = 'Baby log';

// Overlap window to capture sessions that cross into next day
const OVERLAP_HOURS_AFTER = 8; // End fetching at 08:00 next day (covers long sleep sessions)

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
    if (i % 10 === 0 || i <= 5) {
      console.info(`  ${i}s remaining...`);
    }
    await sleep(1);
  }
  console.info('Sync wait complete.');
}

function formatLogPrefix(date: Dayjs): string {
  return date.format('DD/MM/YYYY, HH:mm');
}

async function findGroupChat(chats: Chat[], groupName: string): Promise<Chat | null> {
  for (const chat of chats) {
    if (chat.isGroup && chat.name === groupName) {
      return chat;
    }
  }
  return null;
}

async function formatMessageLine(message: Message): Promise<string[]> {
  const contact = await message.getContact();
  const sender = contact.pushname || contact.name || contact.number || 'Unknown';

  const timestamp = dayjs.unix(message.timestamp);
  const prefix = `${formatLogPrefix(timestamp)} - ${sender}: `;
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
  const groupName = process.env.WHATSAPP_GROUP_NAME || WHATSAPP_GROUP_NAME;

  const authDir = process.env.WHATSAPP_AUTH_DIR || DEFAULT_AUTH_DIR;
  const outputDir = process.env.WHATSAPP_OUTPUT_DIR || DEFAULT_OUTPUT_DIR;
  const headlessEnv = process.env.WHATSAPP_HEADLESS;
  const headless = headlessEnv === '0' ? false : true;
  const chromePath = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
  const syncDelay = getEnvNumber('SYNC_DELAY_SECONDS', DEFAULT_SYNC_DELAY_SECONDS);
  const fetchRetries = getEnvNumber('FETCH_RETRIES', DEFAULT_FETCH_RETRIES);
  const retryDelay = getEnvNumber('RETRY_DELAY_SECONDS', DEFAULT_RETRY_DELAY_SECONDS);

  // Define fetch window: start at midnight of target date, end with overlap into next day
  const windowStart = targetDate.startOf('day');
  const windowEnd = targetDate.add(1, 'day').add(OVERLAP_HOURS_AFTER, 'hour').startOf('hour');
  const now = dayjs();
  const effectiveEnd = windowEnd.isAfter(now) ? now : windowEnd;

  console.error(`Fetching messages for group "${groupName}"`);
  console.error(`Target date: ${targetDate.format('YYYY-MM-DD')}`);
  console.error(`Window (with overlap): ${windowStart.format('YYYY-MM-DD HH:mm')} → ${effectiveEnd.format('YYYY-MM-DD HH:mm')}`);

  const puppeteerOptions: Record<string, unknown> = {
    headless,
    protocolTimeout: 60 * 1000 * 10, // 10 minutes
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  };

  if (chromePath) {
    console.error(`Using custom Chrome path: ${chromePath}`);
    puppeteerOptions.executablePath = chromePath;
  }

  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: authDir, clientId: CLIENT_ID }),
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
      await waitForSync(syncDelay);

      const chats = await client.getChats();
      const groupChat = await findGroupChat(chats, groupName);

      if (!groupChat) {
        const groupNames = chats.filter((chat) => chat.isGroup).map((chat) => chat.name);
        console.error(`Group "${groupName}" not found.`);
        console.warn('Available groups:');
        for (const name of groupNames) {
          console.log(`- ${name}`);
        }
        await client.destroy();
        process.exit(1);
      }

      console.info(`Found group "${groupName}", fetching messages...`);

      // Retry fetching messages until we get enough or run out of retries
      let messages: Message[] = [];
      let filtered: Message[] = [];

      for (let attempt = 1; attempt <= fetchRetries; attempt++) {
        console.info(`Fetch attempt ${attempt}/${fetchRetries}...`);

        messages = await groupChat.fetchMessages({ limit: DEFAULT_FETCH_LIMIT });
        filtered = messages.filter((msg) => {
          if (msg.type !== 'chat') return false;
          if (!msg.body || !msg.body.trim()) return false;
          const msgDate = dayjs.unix(msg.timestamp);
          return msgDate.valueOf() >= windowStart.valueOf() && msgDate.valueOf() <= effectiveEnd.valueOf();
        });

        console.info(`  Fetched ${messages.length} total messages, ${filtered.length} in time window`);

        // If we got a reasonable number of messages, we're done
        if (filtered.length >= 20 || attempt === fetchRetries) {
          break;
        }

        // Otherwise wait and retry
        console.info(`  Low message count, waiting ${retryDelay}s before retry...`);
        await sleep(retryDelay);
      }

      filtered.sort((a, b) => a.timestamp - b.timestamp);

      const lines: string[] = [];
      for (const message of filtered) {
        const formattedLines = await formatMessageLine(message);
        for (const line of formattedLines) {
          lines.push(line);
        }
      }

      fs.mkdirSync(outputDir, { recursive: true });
      const filename = `logs_${targetDate.format('YYYY-MM-DD')}.txt`;
      const outputPath = path.join(outputDir, filename);
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
