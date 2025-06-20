<!-- vibe-player-v2/src/routes/+page.svelte -->
<script lang="ts">
    /**
     * @file Main page component for Vibe Player V2.
     * @description This component serves as the main entry point for the application. It orchestrates
     * the initialization and disposal of various services and manages the primary UI layout.
     * It interacts with `AudioEngineService` via events to update the UI and player state.
     * It also leverages `url.store.ts` to synchronize relevant player parameters with the URL.
     */
	import { onMount, onDestroy } from 'svelte';
	import type { PageData } from './$types';
    import {get} from 'svelte/store';
    import {Toaster} from 'svelte-sonner';
    import {RangeSlider} from '@skeletonlabs/skeleton'; // <-- ADD THIS IMPORT
    // Components
    import Controls from '$lib/components/Controls.svelte';
    import FileLoader from '$lib/components/FileLoader.svelte';
    import ToneDisplay from '$lib/components/ToneDisplay.svelte';
    import Waveform from '$lib/components/visualizers/Waveform.svelte';
    import Spectrogram from '$lib/components/visualizers/Spectrogram.svelte';

    // Services and Stores
    import audioEngineService from '$lib/services/audioEngine.service';
    import analysisService from '$lib/services/analysis.service';
    import dtmfService from '$lib/services/dtmf.service';
    import spectrogramService from '$lib/services/spectrogram.service';
	import { VAD_CONSTANTS, UI_CONSTANTS } from '$lib/utils/constants';
    import {playerStore} from '$lib/stores/player.store';
    import {analysisStore} from '$lib/stores/analysis.store';
    import {formatTime} from '$lib/utils/formatters';
    import { updateUrlWithCurrentTime, urlParamsStore } from '$lib/stores/url.store';

    export let data: PageData;

    // --- START: FIX FOR SEEK SLIDER ---
    let seekTime = $playerStore.currentTime; // Bound to the slider's visual position.
    let isSeeking = false; // Flag to indicate if the user is actively dragging the slider.
    let wasPlayingBeforeSeek = false; // Remembers the playback state before the seek started.

    // Update the slider's position reactively from the store, but only when not seeking.
    playerStore.subscribe((value) => {
        if (!isSeeking) {
            seekTime = value.currentTime;
        }
    });

    // When the user presses down on the slider.
    function handleSeekStart() {
        isSeeking = true;
        wasPlayingBeforeSeek = get(playerStore).isPlaying;
        console.log(`[+page.svelte] handleSeekStart called.`);
        if (wasPlayingBeforeSeek) {
            audioEngineService.pause();
        }
    }

    // While the user is dragging the slider.
    function handleSeekInput() {
        // Only update the store's currentTime for the visual display.
        // Do not call the audio engine here.
        console.log(`[+page.svelte] handleSeekInput called. Target seekTime: ${seekTime.toFixed(2)}s`);
        playerStore.update((s) => ({...s, currentTime: seekTime}));
    }

    // When the user releases the slider.
    function handleSeekEnd() {
        isSeeking = false;
        // Perform the final, single seek operation.
        audioEngineService.seek(seekTime);
        console.log(`[+page.svelte] handleSeekEnd called. Target seekTime: ${seekTime.toFixed(2)}s`);
        // Resume playback if it was active before.
        if (wasPlayingBeforeSeek) {
            audioEngineService.play();
        }
    }

    onMount(() => {
	function initializeStoresFromData() {
		console.log('[+page.svelte onMount] Initializing stores from pre-loaded data:', data);
		const { player: playerData } = data;

		// Update playerStore if any initial data exists
		if (Object.values(playerData).some((v) => v !== undefined)) {
			playerStore.update((s) => ({
				...s,
				speed: playerData.speed ?? s.speed,
				pitch: playerData.pitch ?? s.pitch,
				gain: playerData.gain ?? s.gain,
				currentTime: playerData.currentTime ?? s.currentTime // ADD THIS
			}));
			console.log('[+page.svelte onMount] playerStore updated with:', playerData);
		}

		// Initialize seekTime if currentTime is available from URL
		if (playerData.currentTime) {
			seekTime = playerData.currentTime;
		}

		// A similar block would be needed for analysisStore if VAD params were handled
	}

	initializeStoresFromData();
        // Initialize all services eagerly when the application component mounts.
        // This is the most robust approach to ensure everything is ready.
        console.log('Initializing all services onMount...');

        // Initialize the analysis service, which prepares the SileroVAD worker.
        analysisService.initialize();

        // Initialize the DTMF service and its worker.
        dtmfService.initialize(16000);

        // Original keydown handler can remain if needed for global shortcuts
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.code === 'Space') {
                event.preventDefault();
                // Play/pause logic here if not handled within Controls component
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        // --- ADD EVENT LISTENERS ---
        let lastUiUpdateTime = 0;
        const UI_UPDATE_THROTTLE_MS = 100; // Update UI ~10 times/sec

        const handleTimeUpdate = (event: Event) => {
            const now = performance.now();
            if (now - lastUiUpdateTime > UI_UPDATE_THROTTLE_MS) {
                const customEvent = event as CustomEvent<{ currentTime: number }>;
                playerStore.update(s => ({ ...s, currentTime: customEvent.detail.currentTime }));
                lastUiUpdateTime = now;
            }
        };

        const handlePlay = () => playerStore.update(s => ({ ...s, isPlaying: true, status: `Playing: ${get(playerStore).fileName}` }));
        const handlePause = () => {
            playerStore.update(s => ({ ...s, isPlaying: false, status: `Paused: ${get(playerStore).fileName || ""}` }));
            updateUrlWithCurrentTime(); // Update URL on pause
        };
        const handleStop = () => {
            playerStore.update(s => ({ ...s, isPlaying: false, currentTime: 0, status: `Stopped: ${get(playerStore).fileName || ""}` }));
            updateUrlWithCurrentTime(); // Update URL on stop
        };
        const handleSeek = (event: Event) => {
            const customEvent = event as CustomEvent<{ currentTime: number }>;
            playerStore.update(s => ({...s, currentTime: customEvent.detail.currentTime}));
            updateUrlWithCurrentTime(); // Update URL on seek
        };
        const handleReady = () => playerStore.update(s => ({ ...s, isPlayable: true, status: `Ready: ${get(playerStore).fileName || "Ready to play"}` }));
        const handleError = (event: Event) => {
            const customEvent = event as CustomEvent<{ message: string }>;
            playerStore.update(s => ({ ...s, isPlaying: false, isPlayable: false, status: "Error", error: customEvent.detail.message }));
        };


        audioEngineService.addEventListener('timeupdate', handleTimeUpdate);
        audioEngineService.addEventListener('play', handlePlay);
        audioEngineService.addEventListener('pause', handlePause);
        audioEngineService.addEventListener('stop', handleStop);
        audioEngineService.addEventListener('seek', handleSeek);
        audioEngineService.addEventListener('ready', handleReady);
        audioEngineService.addEventListener('error', handleError); // Add listener for 'error'
        audioEngineService.addEventListener('ended', handleStop); // Treat 'ended' like 'stop' for UI purposes


        // Cleanup function
        return () => {
            console.log('Disposing all services onDestroy...');
            window.removeEventListener('keydown', handleKeyDown);

            // --- REMOVE EVENT LISTENERS ---
            audioEngineService.removeEventListener('timeupdate', handleTimeUpdate);
            audioEngineService.removeEventListener('play', handlePlay);
            audioEngineService.removeEventListener('pause', handlePause);
            audioEngineService.removeEventListener('stop', handleStop);
            audioEngineService.removeEventListener('seek', handleSeek);
            audioEngineService.removeEventListener('ready', handleReady);
            audioEngineService.removeEventListener('error', handleError);
            audioEngineService.removeEventListener('ended', handleStop);

            // Dispose all services when the component is destroyed.
            audioEngineService.dispose();
            analysisService.dispose();
            dtmfService.dispose();
            spectrogramService.dispose();
        };
    });
</script>

<Toaster/>

<div class="container mx-auto p-4 max-w-4xl">
    <header class="mb-6 text-center">
        <h1 class="text-4xl font-bold text-primary" data-testid="app-bar-title">Vibe Player V2</h1>
        <p class="text-muted-foreground">Experimental Audio Analysis & Playback</p>
    </header>

    <section id="file-loader" class="mb-8 p-6 bg-card rounded-lg shadow">
        <FileLoader/>
    </section>

    <section class="mb-8 p-6 bg-card rounded-lg shadow">
        <div class="text-center font-mono text-lg" data-testid="time-display">
            {formatTime($playerStore.currentTime)} / {formatTime($playerStore.duration)}
        </div>
        <RangeSlider
                name="seek"
                bind:value={seekTime}
                max={$playerStore.duration || 1}
                step="any"
                on:input={handleSeekInput}
                on:mousedown={handleSeekStart}
                on:mouseup={handleSeekEnd}
                on:touchstart={handleSeekStart}
                on:touchend={handleSeekEnd}
                disabled={!$playerStore.isPlayable}
                data-testid="seek-slider-input"
        />
    </section>

    <section id="controls" class="mb-8 p-6 bg-card rounded-lg shadow">
        <Controls/>
    </section>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
        <section id="waveform" class="p-6 bg-card rounded-lg shadow">
            <h2 class="text-2xl font-semibold mb-4 text-center text-primary">Waveform</h2>
            <Waveform/>
        </section>

        <section id="tone-display" class="p-6 bg-card rounded-lg shadow">
            <h2 class="text-2xl font-semibold mb-4 text-center text-primary">Tone Activity</h2>
            <ToneDisplay/>
        </section>
    </div>

    <section id="spectrogram" class="p-6 bg-card rounded-lg shadow">
        <h2 class="text-2xl font-semibold mb-4 text-center text-primary">Spectrogram</h2>
        <Spectrogram/>
    </section>

    <footer class="mt-12 text-center text-sm text-muted-foreground">
        <p>Vibe Player V2 written mostly by Gemini and Jules</p>
    </footer>
</div>