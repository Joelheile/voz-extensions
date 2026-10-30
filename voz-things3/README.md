# voz-things3

Jot down to-dos without leaving what you are doing. Say "add todo" at the start of a dictation, and Voz adds the rest as a to-do in [Things 3](https://culturedcode.com/things/), with the project, dates, checklist and notes filled in. A bare "todo" is not a trigger, so a code comment like "todo refactor this" stays text.

```
add todo write the launch tweet for voz, deadline Friday, checklist record demo video, write the hook, schedule it
```

This adds "Write the launch tweet for Voz" to your Voz project, due Friday, with three checklist items.

## Install

```sh
voz install voz-things3
```

You need Things 3 and a Mac with Apple Intelligence. The first time it runs, macOS asks whether Voz may control Things. Allow it, so the extension can read your project names.

## What you can say

| Part      | Say                                         | Example                                                  |
| --------- | ------------------------------------------- | -------------------------------------------------------- |
| To-do     | The first words                             | "call Milan"                                             |
| Project   | A word from a project's or area's name      | "for the SF trip", "folder work", "in Voz"               |
| When      | A day or time                               | "tomorrow", "next Tuesday", "Thursday at 3pm", "someday" |
| Deadline  | "deadline", "due", "by" or "until"          | "due in 3 days", "bis Donnerstag"                        |
| Checklist | "checklist", then items separated by commas | ", checklist slides, budget, send it"                    |
| Notes     | "notes", then the text                      | ", notes she sent it in October"                         |
| Tags      | "tags", then tags you already have          | ", tags errands, prio 1"                                 |

Pause, or say a comma, before "checklist", "notes" and "tags". Voz then copies those parts word for word. Without them, the model writes a short title that starts with a verb, and adds notes or a checklist only when you give details or two or more steps. If you correct yourself, such as "no, not crockpot, grok bot", the title uses the correction.

## Links back to where you were

Say "add todo reply to this" while you read a mail, and the to-do's notes link to that mail. In a browser, they link to the page. This works in Mail, Safari, Chrome, Arc, Dia, Brave, Edge and Vivaldi.

The first time, macOS asks whether Voz may control that app. If you don't allow it, or nothing is selected, the to-do is added without a link.

## How it works

1. Voz's on-device model writes the title and picks the project or area. It also finds steps and notes when you don't name those parts. The list comes from Things, so the model can only pick one you have.
2. Code does the rest. [chrono](https://github.com/wanasit/chrono) finds the dates in English or German, and a date after "due", "by", "deadline for" or "bis" becomes the deadline. Code also takes dates out of the title, drops notes and checklist items that only repeat a date or list, and keeps a project only if you said a word from its name.
3. The extension opens a [Things URL](https://culturedcode.com/things/help/url-scheme/) in the background. Things adds the to-do without asking for an auth token.

Destinations use Things IDs. If multiple projects or areas have the selected name, the extension stops and asks you to give them distinct names. A failure to read projects stops the command instead of silently using Inbox.

"Sent to Things" confirms URL dispatch, not that Things saved the to-do. With Quick Entry enabled, "Opened for review" means you still need to save it.

Nothing leaves your Mac.

## Settings

| Setting               | Default                                     | What it does                                                                  |
| --------------------- | ------------------------------------------- | ----------------------------------------------------------------------------- |
| Trigger words         | `add todo, add a todo, add to do, new todo` | Words that start a to-do, separated by commas                                 |
| Review in Quick Entry | Off                                         | Opens the to-do in Things Quick Entry, so you can check it before you save it |

## Limits

- A project you only hint at, such as "apply at Anthropic" for "Job search", goes to the Inbox.
- The model sometimes translates a German title into English. Turn on "Review in Quick Entry" if you want to check each to-do.
- Things has no "tomorrow evening". A time on another day becomes a reminder at that time.
- It only adds to-dos. Completing or editing them needs a Things auth token, and finding the right one by voice is error-prone.
