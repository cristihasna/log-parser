import { GoogleGenerativeAI } from '@google/generative-ai';
import { ParsedEvent } from './types';
import { PARSING_PROMPT } from './prompt';

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
    model: 'gemini-2.5-flash',
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
  
  const result = await model.generateContent(fullPrompt);
  const response = result.response;
  const text = response.text();

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
