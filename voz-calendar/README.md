# voz-calendar

Say "calendar" at the start of a dictation to add a time block to Apple Calendar, or to move or resize an event.

```
calendar deep work tomorrow at 9 for 2 hours
calendar move the thesis meeting with Milan to Thursday at 4pm
calendar push dinner with Lisa to Friday
calendar extend gym by 30 minutes
```

## Install

```sh
voz install voz-calendar
```

You need a Mac with Apple Intelligence. The first time it runs, macOS asks whether Voz may access your calendars. Choose full access. The extension needs it to read your events before it moves one.

## What you can say

| Part     | Say                                                             | Example                                              |
| -------- | --------------------------------------------------------------- | ---------------------------------------------------- |
| Add      | A title and a start time                                        | "dentist Wednesday at 8:30"                          |
| Move     | "move", "push" or "reschedule", the event's name and a new time | "move gym to 7pm"                                    |
| Resize   | The event's name and a length                                   | "make deep work 3 hours", "extend gym by 30 minutes" |
| Length   | Minutes, hours or a range                                       | "for 45 minutes", "3pm to 5pm"                       |
| Calendar | The calendar's name                                             | "in work"                                            |

When you move an event, it keeps what you don't change. If you say only a time, it stays on the same day. If you say only a day, it keeps its time. If you say only a length, it keeps its start.

## How it works

1. A small JavaScript for Automation script uses EventKit to list your calendars and the events in the next 7 days. Querying events through AppleScript takes minutes, while EventKit takes a fraction of a second.
2. Voz's on-device model decides whether you want to add or change an event, and writes a short title.
3. Code does the rest. [chrono](https://github.com/wanasit/chrono) reads the time and length in English or German. The event to move is the next one whose name you said. The calendar is the one you named, else your default.
4. The script saves the new or changed event.

Nothing leaves your Mac. The extension never sends invites.

## Settings

| Setting                   | Default            | What it does                                             |
| ------------------------- | ------------------ | -------------------------------------------------------- |
| Trigger words             | `calendar`         | Words that start a calendar request, separated by commas |
| Default calendar          | Calendar's default | Where new events go when you don't name a calendar       |
| Default length in minutes | `60`               | How long a new event is when you don't say               |

## Limits

- It only sees events in the next 7 days and skips all-day events.
- With two events of the same name, such as daily standups, it moves the next one.
- It only changes single occurrences of repeating events.
- It doesn't delete events, send invites or answer "when am I free". Those are easy to get wrong by voice, so do them in Calendar.
