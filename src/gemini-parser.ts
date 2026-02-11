import { GoogleGenerativeAI } from '@google/generative-ai';
import { ParsedEvent } from './types';
import { PARSING_PROMPT } from './prompt';

const DEFAULT_MODEL = 'gemini-2.5-flash';
const GEMINI_MODEL = process.env.GEMINI_MODEL || DEFAULT_MODEL;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

/**
 * Parse log file content using Gemini API
 */
export async function parseWithGemini(logContent: string): Promise<ParsedEvent[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not set');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ 
    model: GEMINI_MODEL,
    generationConfig: {
      responseMimeType: 'application/json',
    }
  });

  const fullPrompt = `${PARSING_PROMPT}

## Logs to Process

\`\`\`
${logContent}
\`\`\``;

  console.error('Sending request to Gemini API...');

  const maxAttempts = 5;
  const baseDelayMs = 1000;
  const maxDelayMs = 20000;

  let text = '';
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await model.generateContent(fullPrompt);
      const response = result.response;
      text = response.text();
      break;
    } catch (error: unknown) {
      const shouldRetry = isRetryableGeminiError(error);
      if (!shouldRetry || attempt === maxAttempts) {
        throw error;
      }

      const delay = getBackoffDelayMs(attempt, baseDelayMs, maxDelayMs);
      console.error(
        `Gemini request failed (attempt ${attempt}/${maxAttempts}). Retrying in ${Math.round(delay / 1000)}s...`,
      );
      await sleep(delay);
    }
  }

  // Parse the JSON response
  let events: ParsedEvent[];
  try {
    // Try to extract JSON from the response (in case there's extra text)
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      events = JSON.parse(jsonMatch[0]);
    } else {
      events = JSON.parse(text);
    }
  } catch (error) {
    console.error('Failed to parse Gemini response as JSON:');
    console.error(text);
    throw new Error(`Failed to parse Gemini response: ${error}`);
  }

  // Validate the events structure
  if (!Array.isArray(events)) {
    throw new Error('Gemini response is not an array');
  }

  // Basic validation of each event
  events = events.filter(event => {
    if (!event.timestamp || !event.type || !event.rawMessage) {
      console.error('Invalid event (missing required fields):', event);
      return false;
    }
    return true;
  });

  console.error(`Parsed ${events.length} events from Gemini response`);

  return events;
}

/**
 * Sort events by timestamp
 */
export function sortEvents(events: ParsedEvent[]): ParsedEvent[] {
  return events.sort((a, b) => {
    const dateA = new Date(a.timestamp);
    const dateB = new Date(b.timestamp);
    return dateA.getTime() - dateB.getTime();
  });
}

/**
 * Validate and fix event timestamps
 * Ensures all timestamps are in ISO format
 */
export function validateTimestamps(events: ParsedEvent[]): ParsedEvent[] {
  return events.map(event => {
    // Ensure timestamp is in proper ISO format
    const timestamp = event.timestamp;
    if (!timestamp.includes('T')) {
      // Try to fix malformed timestamps
      console.error(`Warning: Malformed timestamp "${timestamp}" for event:`, event.rawMessage);
    }
    return event;
  });
}
