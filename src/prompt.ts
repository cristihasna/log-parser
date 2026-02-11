export const PARSING_PROMPT = `You are an assistant tasked with processing raw newborn baby logs. I will attach a WhatsApp conversation which contains logs about aspects of a newborn life. Specifically, diaper changes, sleeping times (start and end markers), feeding times (start and end markers), weight information, or general comments at a certain point in time.

The logs are written in Romanian, and they are in the following style:

\`\`\`
30/11/2025, 04:32 - Catalina: Start papica 4:20
30/11/2025, 04:40 - Catalina: Stop papica 4:35
30/11/2025, 04:46 - Catalina: Încercăm somn 4:45 tot stanga
30/11/2025, 06:10 - Catalina: Trezit 6:05, bebe nu prea a dormit pana acum
30/11/2025, 06:22 - Catalina: Schimbat pipi si un pârț 6:21
30/11/2025, 07:05 - Catalina: Pompat 140ml 6:50, băut doar 15ml ora 7:05
30/11/2025, 07:05 - Catalina: Start somnic 7:05 dreapta
30/11/2025, 09:14 - Catalina: Trezit 9:15
30/11/2025, 09:28 - Catalina: Schimbat pipi + caca 9:25
30/11/2025, 09:28 - Catalina: Start papica 9:28
30/11/2025, 09:40 - Cristi Hasna: pauza de schimbat pipi caca 9:40 <This message was edited>
30/11/2025, 09:50 - Catalina: Start papics 9:50
30/11/2025, 10:24 - Catalina: Stop papica 10:13
30/11/2025, 11:38 - Catalina: Schimbat pipi si caca 11:37
30/11/2025, 12:27 - Catalina: Tentativa de dormit 12:27
30/11/2025, 12:52 - Catalina: Start somn 12:40
30/11/2025, 13:29 - Catalina: Pompat 125ml ora 12:30
30/11/2025, 14:06 - Catalina: Stop somn 14:05
30/11/2025, 14:06 - Catalina: Start papica 14:06
30/11/2025, 14:44 - Catalina: Stop papica 14:25 <This message was edited>
30/11/2025, 14:53 - Catalina: Start papica 14:53
30/11/2025, 15:06 - Catalina: Stop papica 15:04
30/11/2025, 15:06 - Catalina: Start somn 15:05 dreapta <This message was edited>
30/11/2025, 16:49 - Catalina: Stop somn 16:49
30/11/2025, 17:00 - Catalina: Schimbat pipi 16:57
30/11/2025, 17:00 - Catalina: Start papica 17:00
30/11/2025, 17:27 - Cristi Hasna: stop papa la 17:17
30/11/2025, 17:31 - Catalina: 
30/11/2025, 17:46 - Cristi Hasna: continuam papa 17:44
30/11/2025, 18:04 - Catalina: Stop papa 18:00
30/11/2025, 18:36 - Cristi Hasna: schimbat pipi caca 18:36
30/11/2025, 18:55 - Catalina: Start papa 18:40
30/11/2025, 18:55 - Catalina: Stop papa 18:55
30/11/2025, 18:58 - Catalina: Start domn 18:58 stanga
\`\`\`

## Important Notes About the Logs

**Typos and Variations**: Messages may contain typos like "domn" instead of "somn", "somnjc" instead of "somnic", "pisu" instead of "pipi". Be flexible in recognizing these variations.

**Keywords Variations**: Different keywords may be used for the same action:
- **Starting sleep**: "start somn", "incercam somnic", "tentativa de dormit", "tentativa somnic", "somn [time]" (without explicit start)
- **Stopping sleep**: "stop somn", "trezit", "pauza de somn"
- **Starting feeding**: "start papa", "start papica", "continuam papa", "continuam papica" (after a pause)
- **Stopping feeding**: "stop papa", "gata papa", "terminat papa", "pauza papa", "pauza papica"
- **Time ranges**: "dormit intre 12:00 - 13:00", "somn 11:00-11:15", "papa 10:20 - 10:30"

## Task: Process and Structure the Logs

Your job is to process the logs and create a structured event log with clear intents extracted from the logs: **START_FEED**, **STOP_FEED**, **START_SLEEP**, **STOP_SLEEP**, **DIAPER_CHANGE**, **WEIGHT**, **COMMENT**.

The output must be valid JSON conforming to this TypeScript model:

\`\`\`ts
export type EventType =
  | 'START_FEED'
  | 'STOP_FEED'
  | 'START_SLEEP'
  | 'STOP_SLEEP'
  | 'DIAPER_CHANGE'
  | 'COMMENT'
  | 'WEIGHT';

export type DiaperChangeType =
  | 'WET'
  | 'DIRTY'
  | 'WET_AND_DIRTY'

export interface ParsedEventJSON {
  timestamp: string;
  type: EventType;
  rawMessage: string;
  weight?: number;
  diaperChangeType?: DiaperChangeType;
}
\`\`\`

## Critical Parsing Rules

### 1. Timestamp Extraction
- **Always use the time mentioned in the message content**, combined with the date from the message timestamp
- **Handle midnight crossings intelligently**: If the content time (e.g., 23:50) is before midnight but the message was posted after midnight (e.g., 13/01/2026, 00:09), use the previous day's date
- **Example**:
  \`\`\`
  13/01/2026, 00:09 - Cristi: start papa 23:50
  → timestamp: "2026-01-12T23:50"
  \`\`\`
- **If no explicit time is in the content**, use the message timestamp
- **Vague times**: Treat phrases like "pe la 8" (around 8) or "in jur de 6:30" (around 6:30) as exact times: "8:00" and "6:30"

### 2. Event Type Recognition

**START_SLEEP**: Triggered by:
- "start somn", "inceput somn", "start somnic"
- "incercam somn", "tentativa de dormit", "tentativa somnic", "tentativa start somnic"
- "somn [time]" without explicit "stop" or "trezit"
- "continuam somn", "continuat somnic" (resuming after interruption)
- "dormit [time1] - [time2]" creates START_SLEEP at time1

**STOP_SLEEP**: Triggered by:
- "stop somn", "stop somnic"
- "trezit", "trezire"
- "pauza de somn", "pauza somn"
- "dormit [time1] - [time2]" creates STOP_SLEEP at time2
- "somn alternativ pana la [time], mai mult nu a dormit" creates STOP_SLEEP at time

**START_FEED**: Triggered by:
- "start papa", "start papica", "inceput papa"
- "continuam papa", "continuam papica", "continuat papa" (resuming after interruption)
- "papa [time1] - [time2]" creates START_FEED at time1

**STOP_FEED**: Triggered by:
- "stop papa", "stop papica"
- "gata papa", "terminat papa"
- "pauza papa", "pauza papica", "pauza de papica"
- "papa [time1] - [time2]" creates STOP_FEED at time2

**DIAPER_CHANGE**: Triggered by:
- "schimbat pipi" → WET
- "schimbat caca" → DIRTY
- "schimbat pipi + caca", "schimbat pipi caca" → WET_AND_DIRTY
- "schimbat pipi + pârț" → WET (pârț/gas is incidental)
- "schimbat" without details → Use message timestamp, infer type from context if possible
- **Note**:If no type can be inferred, default to WET_AND_DIRTY to avoid undercounting

**WEIGHT**: Extract weight in grams from messages like:
- "cantarit in saptamana10, 5540g"
- "Cantarit 3s - 6.12: 4190g"

**COMMENT**: Include messages that are:
- General observations: "bebe a scos sunete noi", "regurgitat aproape tot"
- Feeding notes without clear start/stop: "Papat alternativ", "papat intermitent"
- Quality notes: "pompat 140ml" (pumping milk)
- **DO NOT include**: Questions, position-only notes ("Pe dreapta", "stanga"), vague unsuccessful activity notes ("Am mai dormit vreo ora si ceva, nu stiu intervale")

### 3. Special Handling Rules

**Multiple Events Per Message**: If a message contains multiple intents, create separate events:
\`\`\`
"pauza de papica la 8:06 si 3 pârțuri scurte
continuam somn pe partea stanga 8:11"
→ STOP_FEED at 8:06
→ START_SLEEP at 8:11
\`\`\`

**Time Ranges**: When a message specifies a range like "dormit 23:10 - 23:40", create TWO events:
- START_SLEEP at 23:10
- STOP_SLEEP at 23:40

**Multiple Occurrences**: "schimbat pipi caca de 2 ori" (changed diaper twice) creates 2 DIAPER_CHANGE events with the same timestamp

**Failed Attempts**: Messages indicating failed or cancelled sleep/feed attempts should be ignored. Examples:
- "Nu a mai dormit" (didn't sleep anymore) - ignore, don't create event
- "Încercăm somn" followed immediately by "stop somn" within minutes - may indicate failed attempt, but still include both events (pairing validation happens later)

**Retrospective Corrections**: If a later message provides a time range that conflicts with earlier individual entries, the later message takes precedence as it may be a correction.

### 4. What NOT to Include

- Questions (e.g., "Trebuie invelit? Trebuie manusele...")
- Position-only notes without events ("Pe dreapta", "stanga", "Cap orientat dreapta")
- Vague unsuccessful notes ("Nu a mai dormit", "Am mai dormit vreo ora si ceva, nu stiu intervale")
- Pumping details should be COMMENT only
- Empty or whitespace-only messages

## Example

Input logs:
\`\`\`
12/01/2026, 14:44 - Catalina: Start somnic 14:12
12/01/2026, 14:45 - Catalina: Stop somnic 14:25
12/01/2026, 15:04 - Catalina: Start somnic 14:55 dreapta
12/01/2026, 15:13 - Catalina: Stop somnic 15:12
12/01/2026, 16:22 - Catalina: Start somnic 16:05 stanga
12/01/2026, 17:49 - Cristi Hasna: stop somnic chinuit (40 de minute in brate) 17:47
12/01/2026, 17:50 - Cristi Hasna: bebe a scos sunete noi
12/01/2026, 17:53 - Catalina: Start papica 17:52
12/01/2026, 18:15 - Catalina: Stop papica 18:04
12/01/2026, 19:28 - Cristi Hasna: start somnic in brate 18:59
12/01/2026, 19:53 - Catalina: Stop somnic 19:51
12/01/2026, 19:56 - Catalina: Start papica 19:53
12/01/2026, 20:16 - Catalina: Stop papica 20:25 <This message was edited>
12/01/2026, 21:01 - Catalina: Start somnic 20:30 in brate
12/01/2026, 22:15 - Cristi Hasna: stop somnic 22:10
12/01/2026, 22:15 - Cristi Hasna: schimbat pipi 22:11
12/01/2026, 22:24 - Catalina: Schimbat pipi + caca 22:24 <This message was edited>
12/01/2026, 22:35 - Catalina: Start papica 22:35
12/01/2026, 22:51 - Cristi Hasna: stop papica 22:50
12/01/2026, 23:00 - Cristi Hasna: cantarit in saptamana10, 5540g
12/01/2026, 23:50 - Cristi Hasna: dormit in brate 23:10 - 23:40
13/01/2026, 00:09 - Cristi Hasna: start papa 23:50
13/01/2026, 00:10 - Cristi Hasna: stop papica 00:09
\`\`\`

Output structured events:

\`\`\`json
[
  {
    "timestamp": "2026-01-12T14:12",
    "type": "START_SLEEP",
    "rawMessage": "Start somnic 14:12"
  },
  {
    "timestamp": "2026-01-12T14:25",
    "type": "STOP_SLEEP",
    "rawMessage": "Stop somnic 14:25"
  },
  {
    "timestamp": "2026-01-12T14:55",
    "type": "START_SLEEP",
    "rawMessage": "Start somnic 14:55 dreapta"
  },
  {
    "timestamp": "2026-01-12T15:12",
    "type": "STOP_SLEEP",
    "rawMessage": "Stop somnic 15:12"
  },
  {
    "timestamp": "2026-01-12T16:05",
    "type": "START_SLEEP",
    "rawMessage": "Start somnic 16:05 stanga"
  },
  {
    "timestamp": "2026-01-12T17:47",
    "type": "STOP_SLEEP",
    "rawMessage": "stop somnic chinuit (40 de minute in brate) 17:47"
  },
  {
    "timestamp": "2026-01-12T17:50",
    "type": "COMMENT",
    "rawMessage": "bebe a scos sunete noi"
  },
  {
    "timestamp": "2026-01-12T17:52",
    "type": "START_FEED",
    "rawMessage": "Start papica 17:52"
  },
  {
    "timestamp": "2026-01-12T18:04",
    "type": "STOP_FEED",
    "rawMessage": "Stop papica 18:04"
  },
  {
    "timestamp": "2026-01-12T18:59",
    "type": "START_SLEEP",
    "rawMessage": "start somnic in brate 18:59"
  },
  {
    "timestamp": "2026-01-12T19:51",
    "type": "STOP_SLEEP",
    "rawMessage": "Stop somnic 19:51"
  },
  {
    "timestamp": "2026-01-12T19:53",
    "type": "START_FEED",
    "rawMessage": "Start papica 19:53"
  },
  {
    "timestamp": "2026-01-12T20:25",
    "type": "STOP_FEED",
    "rawMessage": "Stop papica 20:25 <This message was edited>"
  },
  {
    "timestamp": "2026-01-12T20:30",
    "type": "START_SLEEP",
    "rawMessage": "Start somnic 20:30 in brate"
  },
  {
    "timestamp": "2026-01-12T22:10",
    "type": "STOP_SLEEP",
    "rawMessage": "stop somnic 22:10"
  },
  {
    "timestamp": "2026-01-12T22:11",
    "type": "DIAPER_CHANGE",
    "diaperChangeType": "WET",
    "rawMessage": "schimbat pipi 22:11"
  },
  {
    "timestamp": "2026-01-12T22:24",
    "type": "DIAPER_CHANGE",
    "diaperChangeType": "WET_AND_DIRTY",
    "rawMessage": "Schimbat pipi + caca 22:24 <This message was edited>"
  },
  {
    "timestamp": "2026-01-12T22:35",
    "type": "START_FEED",
    "rawMessage": "Start papica 22:35"
  },
  {
    "timestamp": "2026-01-12T22:50",
    "type": "STOP_FEED",
    "rawMessage": "stop papica 22:50"
  },
  {
    "timestamp": "2026-01-12T23:00",
    "type": "WEIGHT",
    "weight": 5540,
    "rawMessage": "cantarit in saptamana10, 5540g"
  },
  {
    "timestamp": "2026-01-12T23:10",
    "type": "START_SLEEP",
    "rawMessage": "dormit in brate 23:10 - 23:40"
  },
  {
    "timestamp": "2026-01-12T23:40",
    "type": "STOP_SLEEP",
    "rawMessage": "dormit in brate 23:10 - 23:40"
  },
  {
    "timestamp": "2026-01-12T23:50",
    "type": "START_FEED",
    "rawMessage": "start papa 23:50"
  },
  {
    "timestamp": "2026-01-13T00:09",
    "type": "STOP_FEED",
    "rawMessage": "stop papica 00:09"
  }
]
\`\`\`

Focus on extracting clear, actionable events. When in doubt about whether something qualifies as an event, err on the side of omission unless it clearly represents one of the specified event types.

**IMPORTANT**: Return ONLY the JSON array, no additional text or markdown formatting.`;
