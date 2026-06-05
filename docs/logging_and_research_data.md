# Usage Logging And Research Data

The browser prototype can save local JSONL usage logs for research testing.

Because learner prompts can contain private information, logging is disabled by default. Enable it only after your consent, IRB, or ethics review procedures are ready.

## What Can Be Logged

Each chat turn can record:

- Random anonymous student ID
- Session ID and turn ID
- Student dwell time: time between the last chatbot response and the next student submission
- Server processing time: time needed for the scaffold engine and OpenAI API response
- Conversation state before and after the turn
- Student input length and language signal
- Assistant response length
- Scaffold diagnosis summary, such as sense-making level, question type, scaffold family, and modeling dose
- Grounding mode, such as `source_grounded` or `general_background_fallback`

If `LOG_RAW_TEXT=true`, the log also stores:

- The student's actual prompt text
- The chatbot response text

## Enable Logging

Open `.env` and set:

```text
USAGE_LOGGING=true
LOG_RAW_TEXT=true
REQUIRE_LOG_CONSENT=true
USAGE_LOG_DIR=logs
```

Recommended research setting:

```text
USAGE_LOGGING=true
LOG_RAW_TEXT=false
REQUIRE_LOG_CONSENT=true
```

Use `LOG_RAW_TEXT=true` only when you truly need exact prompts and have consent to collect them.

## Where Logs Are Saved

Logs are saved locally as:

```text
logs/usage-YYYY-MM-DD.jsonl
```

The `logs/` folder is ignored by Git, so research data is not accidentally committed.

## Example Log Shape

```json
{
  "event_type": "chat_turn",
  "timestamp": "2026-05-21T15:10:00.000Z",
  "student_id": "student-a1b2c3d4",
  "session_id": "browser-generated-session-id",
  "turn_id": 1,
  "consent_given": true,
  "raw_text_logged": false,
  "client_timing": {
    "page_loaded_at": "2026-05-21T15:09:30.000Z",
    "last_assistant_at": "2026-05-21T15:09:30.000Z",
    "message_created_at": "2026-05-21T15:10:00.000Z",
    "dwell_ms": 30000
  },
  "server_timing": {
    "processing_ms": 1420
  },
  "student_input_stats": {
    "char_count": 42,
    "word_count": 7,
    "has_korean": false
  }
}
```

## Check Logs By Student

To see how many turns each anonymous student has:

```powershell
$logs = Get-Content .\logs\usage-*.jsonl | ConvertFrom-Json
$logs | Group-Object student_id | Select-Object Name, Count
```

To inspect one student's turns:

```powershell
$logs = Get-Content .\logs\usage-*.jsonl | ConvertFrom-Json
$logs | Where-Object { $_.student_id -eq "student-a1b2c3d4" } |
  Select-Object timestamp, turn_id, student_input, @{Name="dwell_ms";Expression={$_.client_timing.dwell_ms}}
```

## Consent Note

When logging is enabled, the web interface shows a consent checkbox. If `REQUIRE_LOG_CONSENT=true`, the server writes logs only when the learner has checked that box.

The anonymous student ID is randomly generated in the browser and stored in `localStorage`, so it is stable for the same browser profile but not the same as a verified institutional ID. This prototype does not yet anonymize, encrypt, or upload logs. Treat the `logs/` folder as sensitive research data.
