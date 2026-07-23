# 8th Wall Magic Portal Travel Guide

This project uses 8th Wall SLAM tracking with three.js to pin a Dr. Strange-inspired magic portal into the real world. The first prototype lets a visitor tap the portal to rotate through world destinations and ask a lightweight Portal LLM Agent mock UI for guidance.

![Virtual cube aligned to the floor of a room](./public/preview.jpg)

## Idea Plan

### Vision

Create an AR learning experience where users open magic portals to places around the world, step closer, and ask an embedded LLM Agent about history, culture, travel tips, and visual landmarks.

### Experience Flow

1. **SLAM placement** - 8th Wall world tracking anchors the portal in front of the user.
2. **Magic portal reveal** - Animated rings, runes, sparks, and a destination window make the space feel like a magical doorway.
3. **Destination browsing** - Tapping the canvas recenters the AR scene and cycles the first destinations: Bagan, Kyoto, and Machu Picchu.
4. **LLM Agent overlay** - A bottom panel shows the current destination and accepts user questions.
5. **Contextual answers** - Next milestone is to send questions, destination metadata, and safety instructions to a hosted LLM endpoint.

### LLM Agent Design

- **Role**: Friendly travel-learning guide inside the portal.
- **Inputs**: User question, selected destination, detected language, session age, and optional coordinates/content pack.
- **Outputs**: Concise explanations, suggested things to notice, cultural etiquette, accessibility notes, and source-backed facts.
- **Safety**: Refuse unsafe travel advice, avoid hallucinated live details, cite sources for historical claims, and clearly separate prototype content from live travel guidance.
- **Future tools**: Retrieval over curated destination packs, translation, text-to-speech, image recognition, and itinerary builder.

### Milestones

- **MVP 1 - First Portal**: Build a SLAM-anchored animated portal with destination preview cards and an agent chat mock.
- **MVP 2 - Real Agent**: Add a backend API route for LLM calls with destination context and moderation.
- **MVP 3 - Content Packs**: Add structured destination JSON with images, narrated facts, and quiz prompts.
- **MVP 4 - Spatial Interaction**: Add raycasting hotspots inside the portal and hand/tap interactions.
- **MVP 5 - Multi-Portal Map**: Let users summon portals by region, theme, or learning objective.

## Current Prototype

- Animated portal ring, rune marks, particles, and glowing destination window are created in `src/threejs-scene-init.js`.
- The Portal LLM Agent UI is created in `src/app.js` and styled in `src/index.css`.
- Tap the AR canvas to recenter tracking and cycle to the next destination.

## Usage

1. Install dependencies: `npm install`
2. Start the dev server: `npm run serve`
3. To connect to a mobile device, follow [8th Wall's testing instructions](https://8th.io/test-on-mobile).
4. Open the experience on a supported mobile browser and allow camera access.

## Deployment

Create a production build with `npm run build`, which outputs the app to the `dist` folder. Publish the generated files to your preferred static host.

## Notes

This project relies on the [8th Wall Engine](https://www.npmjs.com/package/@8thwall/engine-binary), [XRExtras](https://www.npmjs.com/package/@8thwall/xrextras), and [Landing Page](https://www.npmjs.com/package/@8thwall/landing-page), which are loaded as script tags in `index.html`.
