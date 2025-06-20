# Vibe Player V2 - React Edition

Vibe Player V2 is a browser-based audio player designed for analyzing and manipulating audio files. It runs entirely client-side. This version is a complete refactor of the original Vibe Player, now built with React, TypeScript, and Vite.

**Live Demo: [Vibe Player V2 (React)](https://YOUR_GITHUB_USERNAME.github.io/YOUR_REPO_NAME/)**
*(Note: Update this link after the first successful deployment via GitHub Actions to the `gh-pages` branch, using the actual GitHub username and repository name)*

## Features

*   Load local audio files (common formats supported by browser `decodeAudioData`).
*   Real-time playback control (Play, Pause, Stop).
*   Adjust playback Speed (0.5x - 2.0x) using Rubberband WASM.
*   Adjust playback Pitch (-12 to +12 semitones) using Rubberband WASM.
*   Adjust playback Gain (Volume).
*   Voice Activity Detection (VAD) using Silero VAD model (ONNX Runtime).
*   Visualizations:
    *   Waveform display.
    *   Spectrogram display.
*   DTMF and Call Progress Tone (CPT) detection and display.

## Tech Stack

*   **React** with **TypeScript**
*   **Vite** for frontend tooling (dev server, build)
*   **Zustand** for state management
*   **Tailwind CSS** for styling
*   **Shadcn/ui** for UI components
*   **Playwright** for End-to-End testing
*   **Vitest** and **React Testing Library** for unit and component testing
*   Web Audio API, ONNX Runtime Web, Rubberband WASM for core audio processing.

## Development

The main application code is located in the `vibe-player-v2-react` directory.

**Prerequisites:**
*   Node.js (version specified in `.nvmrc` if present, or latest LTS)
*   npm (or yarn/pnpm)

**Setup:**
1.  Clone the repository.
2.  Navigate to the new application directory: `cd vibe-player-v2-react`
3.  Install dependencies: `npm install`

**Running the Development Server:**
```bash
npm run dev
```
This will start the Vite development server, typically at `http://localhost:5173`.

**Building for Production:**
```bash
npm run build
```
This command builds the static application assets into the `vibe-player-v2-react/dist` directory.

**Running Tests:**
*   Unit and Component Tests: `npm run test:unit`
*   End-to-End Tests: `npm run test:e2e` (requires a running application, often handled by CI)

## CI/CD

The project uses GitHub Actions for continuous integration and deployment:
*   **Linting and Testing:** On every push and pull request to `main`, the CI pipeline runs linters (`npm run lint`) and unit/component tests (`npm run test:unit`).
*   **Build Check:** The application build (`npm run build`) is also verified.
*   **Deployment:** Merges to the `main` branch trigger a deployment to GitHub Pages. (The E2E tests also run as part of this deployment workflow).

## Old Versions

The previous versions of the Vibe Player (`vibe-player` - VanillaJS, and `vibe-player-v2` - SvelteKit) are still present in the repository in their respective directories but are deprecated. They could not be automatically removed during the refactor process and will need to be manually deleted from the repository.

## Contributing

Contributions are welcome. Please ensure that your changes adhere to the existing coding style, pass all tests, and that any new features are appropriately tested.