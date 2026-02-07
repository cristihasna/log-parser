import { ParsedEvent } from './types';

/**
 * Format a date as ISO string with local timezone
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Format events to CSV
 */
export function formatToCSV(events: ParsedEvent[]): string {
  const header = 'timestamp,event_type,details,weight,raw_message';
  const rows = events.map(event => {
    const timestamp = formatDate(event.timestamp);
    const type = event.type;
    const details = event.details ? `"${event.details.replace(/"/g, '""')}"` : '';
    const weight = event.weight ?? '';
    const rawMessage = `"${event.rawMessage.replace(/"/g, '""')}"`;
    
    return `${timestamp},${type},${details},${weight},${rawMessage}`;
  });

  return [header, ...rows].join('\n');
}

/**
 * Format events to JSON
 */
export function formatToJSON(events: ParsedEvent[]): string {
  const formattedEvents = events.map(event => ({
    timestamp: formatDate(event.timestamp),
    type: event.type,
    ...(event.details && { details: event.details }),
    ...(event.weight && { weight: event.weight }),
    rawMessage: event.rawMessage
  }));

  return JSON.stringify(formattedEvents, null, 2);
}

/**
 * Format events to simple log format
 */
export function formatToLog(events: ParsedEvent[]): string {
  return events.map(event => {
    const timestamp = formatDate(event.timestamp);
    const weight = event.weight ? ` (${event.weight}g)` : '';
    return `${timestamp} | ${event.type}${weight} | ${event.rawMessage}`;
  }).join('\n');
}

/**
 * Format events as NDJSON (Newline Delimited JSON)
 */
export function formatToNDJSON(events: ParsedEvent[]): string {
  return events.map(event => JSON.stringify({
    timestamp: formatDate(event.timestamp),
    type: event.type,
    ...(event.details && { details: event.details }),
    ...(event.weight && { weight: event.weight }),
    rawMessage: event.rawMessage
  })).join('\n');
}
