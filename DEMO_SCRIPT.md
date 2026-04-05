# Demo Script

## Fast version

I built a browser-based 3D vehicle telemetry demo for an autonomous site utility truck used in construction and mining support. I kept the industrial-autonomy framing, but pushed the silhouette toward a more recognizable real-world pickup-style truck so the demo feels more believable on first glance.

The app runs in Chrome with no special setup. You can orbit around the truck in full 360 degrees, jump between camera presets, and control multiple parts of the visualization live.

On the right, I can toggle brake lights, enable headlights, change the body color, switch HUD modes, and raise the utility bed. These states are also exposed through a REST API, so the 3D scene is being driven by backend state rather than only local UI state.

To show that, I'll make a direct API call from PowerShell and the scene updates in real time. That gives a simple but clear example of how an autonomy or vehicle operations platform could sync backend state into a browser visualization.

Under the hood, this is a lightweight Python server serving a REST endpoint plus server-sent events, and a Three.js frontend rendering the vehicle, HUD, and animations.

I optimized for end-to-end completeness, fast iteration with AI tooling, and a polished interface that feels aligned with the Jarvis-style prompt from the assignment.

## Backup lines if you get stuck

- I wanted the submission to show product thinking, not just rendering.
- The key requirement was proving that the visualization reacts to live backend state.
- I added multiple live controls so the demo feels more like a real operator console.
- I kept the stack intentionally simple so it runs immediately in a normal browser.
