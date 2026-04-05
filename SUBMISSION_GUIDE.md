# Applied Submission Guide

This file is the shortest path from working demo to actual submission.

## Before you record

1. Stop any old Python server already running on port `8000`.
2. Start the latest build:

```powershell
python server.py
```

3. Open `http://127.0.0.1:8000` in Chrome.
4. Confirm the right-side panel shows:
   - `Brake lights`
   - `Headlights`
   - `Utility bed tilt`
5. Confirm `API Connection` changes to `Live stream connected`.

## Demo commands

Current state:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/state
```

Turn everything on:

```powershell
Invoke-RestMethod -Method POST -Uri "http://127.0.0.1:8000/api/state" -ContentType "application/json" -Body '{"brakeLights": true, "headlights": true, "dumpBedTilt": 72}'
```

Switch to diagnostic mode:

```powershell
Invoke-RestMethod -Method POST -Uri "http://127.0.0.1:8000/api/state" -ContentType "application/json" -Body '{"hudMode": "diagnostic"}'
```

Reset to a calm default:

```powershell
Invoke-RestMethod -Method POST -Uri "http://127.0.0.1:8000/api/state" -ContentType "application/json" -Body '{"brakeLights": false, "headlights": false, "dumpBedTilt": 0, "hudMode": "tracking", "bodyColor": "#5ce1e6"}'
```

## Suggested 4-6 minute video flow

### 1. Open with intent

Say:

> I built a browser-based 3D vehicle telemetry demo for an autonomous site utility truck designed for construction and mining support. I wanted it to feel like a lightweight operator console rather than just a 3D model viewer.

### 2. Show the product quickly

- Orbit around the truck
- Use `Hero`, `Side`, and `Rear`
- Zoom in on the lights and utility bed

Say:

> The main goal was to create a Chrome-friendly visualization that can be inspected from any angle and controlled live from a backend API.

### 3. Show the real-time controls

- Click `Activate` for brake lights
- Click `Enable` for headlights
- Move `Utility bed tilt`
- Switch HUD mode
- Change body color

Say:

> I exposed multiple live state controls through a simple REST API. The frontend listens for updates and applies them directly into the 3D scene so the interface stays synchronized.

### 4. Show the backend control path

Run:

```powershell
Invoke-RestMethod -Method POST -Uri "http://127.0.0.1:8000/api/state" -ContentType "application/json" -Body '{"brakeLights": true, "headlights": true, "dumpBedTilt": 72}'
```

Say:

> This is the core requirement from the prompt: the visualization is not static. An external API call changes the scene live, which is closer to an operations or autonomy product surface.

### 5. Explain technical choices

Say:

> I chose a site utility truck because it still fits industrial autonomy, but gives the demo a more recognizable and realistic silhouette. The stack is a lightweight Python server with a REST endpoint plus server-sent events, and a Three.js frontend for the vehicle visualization and HUD.

### 6. Close with what you optimized for

Say:

> I prioritized speed to a presentable end-to-end prototype, strong browser compatibility, live controllability, and a visual style that feels like a futuristic vehicle operations interface.

## Short narration points about AI usage

Mention these naturally:

- You used AI to speed up iteration on scene structure, interaction design, and frontend/backend wiring.
- You used AI as a collaborator, but still validated the integration points and runtime behavior.
- You focused prompts on producing a polished demo quickly, which matches the spirit of the assignment.

## Email draft

Subject:

```text
Applied AI Engineer Submission - 3D Vehicle Telemetry Demo
```

Body:

```text
Hi Sam,

Please find my submission for the AI Engineer take-home below.

Video:
[private link]

Project:
[private repo link or attached files]

Live demo (optional):
[private deployment link]

Summary:
I built a browser-based 3D visualization for an autonomous site utility truck with 360-degree inspection, live REST-driven state updates, and a Jarvis-inspired operator console UI. The demo supports live control of brake lights, headlights, utility-bed tilt, body color, and HUD mode.

Thanks for the opportunity. I enjoyed building this.

Best,
[Your Name]
```

## Final checklist

- Restart the server so you are definitely using the newest code
- Record in Chrome with the browser and terminal both visible
- Show at least one live PowerShell API call
- Keep the video under about 6 minutes unless you have a reason to go longer
- Upload the video privately
- Send one clean email with all links
