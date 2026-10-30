# voz-transcribe-file

I built this to turn recordings into text without leaving Voz. Drag an audio or video file toward the top of your screen, and the notch opens a drop zone. Drop the file there, and Voz writes a Markdown transcript next to it and copies it to the clipboard.

If more than one person talks, the transcript splits into turns:

```md
**[00:00:00] Speaker 1:** Did you finish the quarterly report for Thursday?

**[00:00:04] Speaker 2:** Almost. I still need the revenue numbers from sales.
```

With one speaker, you get plain text.

## Install

```sh
voz install voz-transcribe-file
```

You need Voz with extension API 3, and a Parakeet speech model picked in Settings.

## How it works

- Voz transcribes the file on your Mac with Parakeet. Nothing leaves the Mac
- Voz fixes words from your dictionary, the same way it does when you dictate
- Voz finds the speakers with NVIDIA's Nemotron 3 diarization model, and counts up to 8 itself. The first file downloads that model, 95 MB
- An hour of audio takes about a minute
- `meeting.mp3` becomes `meeting.md` in the same folder. If that file exists, you get `meeting 2.md`. Voz never overwrites a file
- Voz reads audio such as MP3, M4A, WAV, AIFF and FLAC, and video such as MP4, MOV and M4V, where it uses only the sound. MKV and WebM don't work

Speaker names are numbers in the order people first talk. Rename them in the file.
