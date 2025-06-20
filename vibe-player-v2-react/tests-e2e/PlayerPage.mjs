// vibe-player-v2-react/tests-e2e/PlayerPage.mjs
import { expect } from "@playwright/test";

export class PlayerPage {
  constructor(page) {
    this.page = page;
    this.devServerUrl = "http://localhost:5173/"; // Updated port
    this.appBarTitle = page.locator('h1:has-text("Vibe Player V2 - React Edition")'); // Updated
    this.fileInput = page.locator('input[type="file"]'); // Should still work
    this.fileNameDisplay = page.locator('p:has-text("Selected:")'); // Updated, might need refinement
    // fileStatusDisplay focuses on positive status like 'Ready' or general success.
    this.fileStatusDisplay = page.locator('[data-testid="status-success"], [data-testid="file-success-message"], [data-testid="status-loading"]:has-text("Ready")'); // Updated to catch success or specific loading messages
    this.fileErrorDisplay = page.locator('[data-testid="status-error"], [data-testid="file-error-message"]'); // Updated

    this.playButton = page.getByTestId("play-button");
    this.stopButton = page.getByTestId("stop-button");

    // this.timeDisplay = page.getByTestId("time-display"); // Commented out - Not implemented in React yet
    // this.seekSliderInput = page.getByTestId("seek-slider-input"); // Commented out - Not implemented

    this.speedSliderInput = page.getByTestId("speed-slider-input");
    this.speedValueDisplay = page.getByTestId("speed-value");
    this.pitchSliderInput = page.getByTestId("pitch-slider-input");
    this.pitchValueDisplay = page.getByTestId("pitch-value");
    this.gainSliderInput = page.getByTestId("gain-slider-input");
    this.gainValueDisplay = page.getByTestId("gain-value");
    this.vadPositiveSliderInput = page.getByTestId("vad-positive-slider-input");
    this.vadPositiveValueDisplay = page.getByTestId("vad-positive-value");
    this.vadNegativeSliderInput = page.getByTestId("vad-negative-slider-input");
    this.vadNegativeValueDisplay = page.getByTestId("vad-negative-value");
    this.dtmfDisplay = page.getByTestId("dtmf-display");
  }

  async goto() {
    await this.page.goto(this.devServerUrl);
    // Increased timeout for initial load, especially in CI
    await expect(this.appBarTitle).toBeVisible({ timeout: 20000 });
    await expect(this.fileInput).toBeVisible({ timeout: 10000 });
  }

  async loadAudioFile(fileName) {
    // In Vite, public assets are served from the root.
    // The original Svelte project had /static/test-audio. The React project also has /public/test-audio
    // `setInputFiles` expects a file path on the system running the test.
    // Playwright runs from project root (`vibe-player-v2-react`), so path is `public/test-audio/${fileName}`.
    const filePath = `public/test-audio/${fileName}`;
    await this.fileInput.setInputFiles(filePath);
  }

  async expectControlsToBeReadyForPlayback() {
    // Check for absence of general loading/error messages that would block playback.
    // StatusMessages component hides when message is null or "Ready" and not loading.
    // FileLoader hides its messages when not loading/error.
    // So, if play button is enabled, it's a good sign.
    await expect(this.playButton, "Play button was not enabled after file load").toBeEnabled({
      timeout: 20000, // Increased timeout for file processing
    });
    // A more specific check for "Ready" status could be if a specific "loading done" message appears briefly
    // or if the waveform visualizer shows data.
    // For now, playButton enabled is the primary check.
    // The fileStatusDisplay locator might catch a "Ready" message if one is specifically set.
    // await expect(this.fileStatusDisplay.first()).toBeVisible({ timeout: 20000 }); // Example: Check if any relevant status is visible
  }

  async getPlayButtonText() {
    return this.playButton.textContent();
  }

  async setSliderValue(sliderInputLocator, valueStr) {
    // This method might need adjustment for Shadcn sliders if direct input manipulation is better.
    // For now, keeping the click simulation logic.
    const targetValue = parseFloat(valueStr);
    const boundingBox = await sliderInputLocator.boundingBox();
    if (!boundingBox) throw new Error(`Could not get bounding box for slider ${sliderInputLocator}`);

    const min = parseFloat(await sliderInputLocator.getAttribute("min") || "0");
    const max = parseFloat(await sliderInputLocator.getAttribute("max") || "100");

    // Handle case where min or max might be null or slider not fully initialized
    if (min == null || max == null) throw new Error("Slider min/max attributes not found or invalid.");

    // Prevent division by zero if min and max are the same
    if (max === min) {
        if (targetValue === min) { // If target is the only value, click center
            await this.page.mouse.click(boundingBox.x + boundingBox.width / 2, boundingBox.y + boundingBox.height / 2);
            await this.page.waitForTimeout(350);
            return;
        }
        throw new Error("Slider min and max are equal, but target value is different.");
    }

    const ratio = (targetValue - min) / (max - min);
    let clickX = boundingBox.x + boundingBox.width * ratio;

    // Ensure clickX is within the slider's bounds
    clickX = Math.max(boundingBox.x, Math.min(clickX, boundingBox.x + boundingBox.width -1)); // -1 to avoid clicking exact edge

    const clickY = boundingBox.y + boundingBox.height / 2;

    await this.page.mouse.click(clickX, clickY);
    await this.page.waitForTimeout(350); // Allow for debounced updates
  }

  async getSliderInputValue(sliderInputLocator) {
    return sliderInputLocator.inputValue(); // This might not work for Shadcn sliders which aren't native inputs
                                          // May need .getAttribute('aria-valuenow') or similar
  }

  // Commenting out getCurrentTime as timeDisplay is not implemented
  /*
  async getCurrentTime() {
    const timeDisplayText = await this.timeDisplay.textContent();
    if (!timeDisplayText)
      throw new Error("Time display text content is empty or null.");

    const timeParts = timeDisplayText.split(" / ");
    if (timeParts.length < 1)
      throw new Error(`Unexpected time display format: ${timeDisplayText}`);

    const currentTimeStr = timeParts[0].trim();
    const segments = currentTimeStr.split(":").map(Number);
    let currentTimeInSeconds = 0;
    if (segments.length === 3) {
      currentTimeInSeconds = segments[0] * 3600 + segments[1] * 60 + segments[2];
    } else if (segments.length === 2) {
      currentTimeInSeconds = segments[0] * 60 + segments[1];
    } else if (segments.length === 1) {
      currentTimeInSeconds = segments[0];
    } else {
      throw new Error(`Unexpected current time segment format: ${currentTimeStr}`);
    }
    return currentTimeInSeconds;
  }
  */
}
