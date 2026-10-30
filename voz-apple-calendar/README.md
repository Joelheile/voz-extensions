# voz-apple-calendar

Plan your day without opening Calendar. Say "calendar" at the start of a dictation to add an event to Apple Calendar, find free time for it, or move, resize, rename or relocate an event you already have.

```
calendar deep work tomorrow at 9 for 2 hours
calendar find an hour this afternoon to review the pitch deck
calendar dinner with Lisa Saturday at 7 at Nobu
calendar move my 3pm to Thursday
calendar push standup by 15 minutes
calendar extend the design review by 30 minutes
calendar rename my 4pm to quarterly planning
undo calendar
```

## Install

```sh
voz install voz-apple-calendar
```

You need a Mac with Apple Intelligence. The first time it runs, macOS asks whether Voz may access your calendars. Choose full access. The extension needs it to read your events before it changes one or looks for free time.

## Add an event

| Say                 | Example                                      | What happens                                   |
| ------------------- | -------------------------------------------- | ---------------------------------------------- |
| A title and a time  | "dentist Wednesday at 8:30"                  | Adds it for your default length                |
| A length or a range | "for 45 minutes", "from 3 to 4:30"           | Sets the end                                   |
| No time             | "report tomorrow", "1 hour prep next week"   | Finds the first free gap in your workday       |
| A part of the day   | "tomorrow morning", "Friday afternoon"       | Looks for free time only then                  |
| A place             | "lunch with Tom Friday at noon at Café Nero" | Sets the location                              |
| A calendar          | "in Work"                                    | Adds it there instead of your default calendar |

A bare hour means a work hour: "at 4" is 4 PM and "at 9" is 9 AM. Dinner, drinks and other evening plans move it to the evening, so "dinner at 7" is 7 PM. If the time has passed today, it goes on tomorrow.

## Change an event

Name the event by its title, its time or its order: "the design review", "my 3pm", "tomorrow's standup", "my next meeting".

| Say                   | Example                                                              |
| --------------------- | -------------------------------------------------------------------- |
| A new time or day     | "move my 3pm to 4", "push deep work to Friday"                       |
| An amount to shift by | "push standup by 15 minutes", "pull it 10 minutes earlier"           |
| A new length or end   | "make deep work 3 hours", "should end at 11", "extend by 30 minutes" |
| A new name            | "rename the design review to roadmap review"                         |
| A new place           | "move lunch with Tom to Café Luna"                                   |

An event keeps what you don't change. A new day keeps its time, and a new time keeps its length. A repeating event changes only the occurrence you named. If you correct yourself with "oh no", "actually" or "I mean", what you say after the correction wins: "from 10 to 10:30, oh no, to 10:45" ends at 10:45.

It won't change a meeting someone else organized, because that only changes your copy. It also won't touch events in calendars you can't edit. When nothing matches what you said, it tells you instead of adding a new event.

## Undo

Say "undo calendar". It removes the event it just added, or puts the event it just changed back.

## How it works

1. A small JavaScript for Automation script uses EventKit to read your calendars and the events from today through the next 14 days. EventKit answers in under half a second.
2. At the same time, Voz's on-device model reads the dictation. It decides whether you add or change an event, writes the title and picks out the words that name the event and the place.
3. Code does the rest: the times, lengths and days in English or German, which event you meant, and where the free time is. Days come from [chrono](https://github.com/wanasit/chrono).
4. The script saves the event, and Voz shows what changed.

Nothing leaves your Mac. The extension never sends invites.

## Settings

| Setting                   | Default                                                     | What it does                                             |
| ------------------------- | ----------------------------------------------------------- | -------------------------------------------------------- |
| Trigger words             | `calendar, add to calendar, change calendar, move calendar` | Words that start a calendar request, separated by commas |
| Default calendar          | Calendar's default                                          | Where new events go when you don't name a calendar       |
| Default length in minutes | `60`                                                        | How long a new event is when you don't say               |
| Workday starts at         | `9`                                                         | The earliest hour it looks for free time                 |
| Workday ends at           | `18`                                                        | The latest hour it looks for free time                   |

## Limits

- It skips all-day events, and it skips weekends when it looks for free time unless you name the day.
- It doesn't delete events, create repeating events or send invites. Do those in Calendar.
- Undo reverses only the last change.
