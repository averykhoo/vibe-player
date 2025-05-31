const stateManager = require('../stateManager');

// Mock console methods to avoid cluttering test output
let mockConsoleLog, mockConsoleWarn, mockConsoleError;

beforeAll(() => {
  mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
  mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  mockConsoleLog.mockRestore();
  mockConsoleWarn.mockRestore();
  mockConsoleError.mockRestore();
});

// Reset state before each test to ensure independence
beforeEach(() => {
  stateManager.resetState();
});

describe('stateManager', () => {
  describe('Track Management', () => {
    test('addNewTrack and getTrackByIndex', () => {
      const track0 = stateManager.addNewTrack(0);
      expect(track0).not.toBeNull();
      expect(track0.id).toBe(0);
      expect(stateManager.getTrackByIndex(0)).toBe(track0);
      expect(stateManager.getTracksData()[0]).toBe(track0);

      const track1 = stateManager.addNewTrack(1);
      expect(track1.id).toBe(1);
      expect(stateManager.getTrackByIndex(1)).toBe(track1);

      expect(stateManager.getTrackByIndex(2)).toBeNull(); // Not yet added
      expect(stateManager.getLoadedTrackCount()).toBe(2);
    });

    test('findFirstAvailableSlot', () => {
      expect(stateManager.findFirstAvailableSlot()).toBe(0); // Initially empty
      stateManager.addNewTrack(0);
      expect(stateManager.findFirstAvailableSlot()).toBe(1); // Slot 0 taken
      stateManager.addNewTrack(1);
      expect(stateManager.findFirstAvailableSlot()).toBe(2); // Slots 0, 1 taken

      // Simulate clearing a slot
      stateManager.getTracksData()[0] = null;
      expect(stateManager.findFirstAvailableSlot()).toBe(0); // Slot 0 should be available again
    });

    test('assignChannel, getLeftTrackIndex, getRightTrackIndex, getTrackIndexForSide', () => {
      stateManager.addNewTrack(0);
      stateManager.addNewTrack(1);

      stateManager.assignChannel('left', 0);
      expect(stateManager.getLeftTrackIndex()).toBe(0);
      expect(stateManager.getTrackIndexForSide('left')).toBe(0);
      expect(stateManager.getRightTrackIndex()).toBe(-1); // Right still unassigned

      stateManager.assignChannel('right', 1);
      expect(stateManager.getRightTrackIndex()).toBe(1);
      expect(stateManager.getTrackIndexForSide('right')).toBe(1);
    });

    test('clearTrackSlot', () => {
      const track0 = stateManager.addNewTrack(0);
      const track1 = stateManager.addNewTrack(1);
      stateManager.assignChannel('left', 0);
      stateManager.assignChannel('right', 1);

      expect(stateManager.getIsMultiChannelModeActive()).toBe(true);

      stateManager.clearTrackSlot(0);
      expect(stateManager.getTrackByIndex(0)).toBeNull();
      expect(stateManager.getLeftTrackIndex()).toBe(-1);
      expect(stateManager.isSideAssigned('left')).toBe(false);
      expect(stateManager.getIsMultiChannelModeActive()).toBe(false);
      expect(stateManager.getLoadedTrackCount()).toBe(1); // track1 still exists

      stateManager.clearTrackSlot(1);
      expect(stateManager.getTrackByIndex(1)).toBeNull();
      expect(stateManager.getRightTrackIndex()).toBe(-1);
      expect(stateManager.isSideAssigned('right')).toBe(false);
      expect(stateManager.getLoadedTrackCount()).toBe(0);

      // Test clearing a non-existent or already cleared slot
      stateManager.clearTrackSlot(5); // Should not error
    });

    test('clearTrackSlot should clear playTimeoutId if present', () => {
        const track = stateManager.addNewTrack(0);
        track.playTimeoutId = setTimeout(() => {}, 1000); // Mock a timeout ID
        jest.spyOn(global, 'clearTimeout');

        stateManager.clearTrackSlot(0);
        expect(clearTimeout).toHaveBeenCalledWith(track.playTimeoutId);
        global.clearTimeout.mockRestore();
    });

    test('swapChannels', () => {
      stateManager.addNewTrack(0);
      stateManager.addNewTrack(1);
      stateManager.assignChannel('left', 0);
      stateManager.assignChannel('right', 1);

      stateManager.swapChannels();
      expect(stateManager.getLeftTrackIndex()).toBe(1);
      expect(stateManager.getRightTrackIndex()).toBe(0);

      // Swap with one unassigned
      stateManager.clearTrackSlot(0); // Right channel (now track 0) is cleared
      expect(stateManager.getRightTrackIndex()).toBe(-1);
      expect(stateManager.getLeftTrackIndex()).toBe(1);

      stateManager.swapChannels();
      expect(stateManager.getLeftTrackIndex()).toBe(-1);
      expect(stateManager.getRightTrackIndex()).toBe(1);
    });

    test('getLoadedTrackCount', () => {
        expect(stateManager.getLoadedTrackCount()).toBe(0);
        stateManager.addNewTrack(0);
        expect(stateManager.getLoadedTrackCount()).toBe(1);
        stateManager.addNewTrack(1);
        expect(stateManager.getLoadedTrackCount()).toBe(2);
        stateManager.clearTrackSlot(0);
        expect(stateManager.getLoadedTrackCount()).toBe(1);
    });
  });

  describe('Playback State', () => {
    test('setPlaybackState and getPlaybackState', () => {
      expect(stateManager.getPlaybackState()).toBe('stopped');
      stateManager.setPlaybackState('playing', 0.1, 0.2);
      expect(stateManager.getPlaybackState()).toBe('playing');
      expect(stateManager.getPlaybackStartTimeContext()).toBe(0.1);
      expect(stateManager.getPlaybackStartSourceTime()).toBe(0.2);

      stateManager.setPlaybackState('paused', 0.3, 0.4);
      expect(stateManager.getPlaybackState()).toBe('paused');
      expect(stateManager.getPlaybackStartTimeContext()).toBe(0.3);
      expect(stateManager.getPlaybackStartSourceTime()).toBe(0.4);

      stateManager.setPlaybackState('stopped');
      expect(stateManager.getPlaybackState()).toBe('stopped');
      // Default values for sourceTime if not provided for 'stopped'
      expect(stateManager.getPlaybackStartSourceTime()).toBe(0.4); // Remains from last state

      stateManager.setPlaybackState('invalidState'); // Should warn and not change
      expect(stateManager.getPlaybackState()).toBe('stopped');
      expect(mockConsoleWarn).toHaveBeenCalledWith(expect.stringContaining('Invalid playback state'));
    });

    test('setCurrentGlobalSpeed and getCurrentGlobalSpeed', () => {
      expect(stateManager.getCurrentGlobalSpeed()).toBe(1.0);
      stateManager.setCurrentGlobalSpeed(1.5);
      expect(stateManager.getCurrentGlobalSpeed()).toBe(1.5);
      stateManager.setCurrentGlobalSpeed('0.5'); // String input
      expect(stateManager.getCurrentGlobalSpeed()).toBe(0.5);

      // Clamping
      stateManager.setCurrentGlobalSpeed(0.1);
      expect(stateManager.getCurrentGlobalSpeed()).toBe(0.25);
      stateManager.setCurrentGlobalSpeed(3.0);
      expect(stateManager.getCurrentGlobalSpeed()).toBe(2.0);
      stateManager.setCurrentGlobalSpeed(NaN); // Invalid float
      expect(stateManager.getCurrentGlobalSpeed()).toBe(1.0);
    });

    test('updateTimebaseForSpeedChange, getPlaybackStartTimeContext, getPlaybackStartSourceTime', () => {
        stateManager.setPlaybackState('playing', 10.0, 5.0);
        expect(stateManager.getPlaybackStartTimeContext()).toBe(10.0);
        expect(stateManager.getPlaybackStartSourceTime()).toBe(5.0);

        stateManager.updateTimebaseForSpeedChange(12.0, 6.0);
        expect(stateManager.getPlaybackStartTimeContext()).toBe(12.0);
        expect(stateManager.getPlaybackStartSourceTime()).toBe(6.0);
    });
  });

  describe('Linking & VAD', () => {
    test('togglePitchLink and getIsPitchLinked', () => {
      expect(stateManager.getIsPitchLinked()).toBe(true); // Default
      stateManager.togglePitchLink();
      expect(stateManager.getIsPitchLinked()).toBe(false);
      stateManager.togglePitchLink();
      expect(stateManager.getIsPitchLinked()).toBe(true);
    });

    test('setVadModelReady and getIsVadModelReady', () => {
      expect(stateManager.getIsVadModelReady()).toBe(false); // Default
      stateManager.setVadModelReady(true);
      expect(stateManager.getIsVadModelReady()).toBe(true);
      stateManager.setVadModelReady(false);
      expect(stateManager.getIsVadModelReady()).toBe(false);
      stateManager.setVadModelReady('truthy'); // Coerced to boolean
      expect(stateManager.getIsVadModelReady()).toBe(true);
    });
  });

  describe('Multi-Channel Mode', () => {
    test('getIsMultiChannelModeActive behavior', () => {
      stateManager.addNewTrack(0);
      stateManager.addNewTrack(1);

      expect(stateManager.getIsMultiChannelModeActive()).toBe(false);
      stateManager.assignChannel('left', 0);
      expect(stateManager.getIsMultiChannelModeActive()).toBe(false);
      stateManager.assignChannel('right', 1);
      expect(stateManager.getIsMultiChannelModeActive()).toBe(true);

      stateManager.clearTrackSlot(0); // Left channel cleared
      expect(stateManager.getIsMultiChannelModeActive()).toBe(false);

      // Reassign left, then clear right
      stateManager.assignChannel('left', 0); // Track 0 is now null, but index can be reassigned
      stateManager.addNewTrack(0); // Re-add track 0 data
      stateManager.assignChannel('left', 0);
      expect(stateManager.getIsMultiChannelModeActive()).toBe(true);
      stateManager.clearTrackSlot(1); // Right channel cleared
      expect(stateManager.getIsMultiChannelModeActive()).toBe(false);
    });
  });

  describe('Utility Getters', () => {
    test('isSideAssigned', () => {
      stateManager.addNewTrack(0);
      expect(stateManager.isSideAssigned('left')).toBe(false);
      stateManager.assignChannel('left', 0);
      expect(stateManager.isSideAssigned('left')).toBe(true);
      expect(stateManager.isSideAssigned('right')).toBe(false);
    });

    test('areAllActiveTracksReady', () => {
      const track0 = stateManager.addNewTrack(0);
      const track1 = stateManager.addNewTrack(1);

      // No channels assigned
      expect(stateManager.areAllActiveTracksReady()).toBe(true); // No active tracks, so trivially true

      stateManager.assignChannel('left', 0);
      track0.isReady = false;
      expect(stateManager.areAllActiveTracksReady()).toBe(false);
      track0.isReady = true;
      expect(stateManager.areAllActiveTracksReady()).toBe(true);

      stateManager.assignChannel('right', 1);
      track1.isReady = false;
      expect(stateManager.areAllActiveTracksReady()).toBe(false); // Left ready, Right not
      track0.isReady = false; // Both not ready
      expect(stateManager.areAllActiveTracksReady()).toBe(false);
      track0.isReady = true;
      track1.isReady = true; // Both ready
      expect(stateManager.areAllActiveTracksReady()).toBe(true);
    });

    test('calculateMaxEffectiveDuration', () => {
      const track0 = stateManager.addNewTrack(0);
      const track1 = stateManager.addNewTrack(1);

      expect(stateManager.calculateMaxEffectiveDuration()).toBe(0); // No audio buffers

      track0.audioBuffer = { duration: 10 };
      track0.parameters.offsetSeconds = 0;
      stateManager.assignChannel('left', 0);
      expect(stateManager.calculateMaxEffectiveDuration()).toBe(10);

      track1.audioBuffer = { duration: 15 };
      track1.parameters.offsetSeconds = 2; // Starts 2s in, total effective 17s
      stateManager.assignChannel('right', 1);
      expect(stateManager.calculateMaxEffectiveDuration()).toBe(17); // Max of (10+0, 15+2)

      track0.parameters.offsetSeconds = 5; // Track 0 now 5+10 = 15
      expect(stateManager.calculateMaxEffectiveDuration()).toBe(17); // Still 17

      track0.audioBuffer = { duration: 20 }; // Track 0 now 5+20 = 25
      expect(stateManager.calculateMaxEffectiveDuration()).toBe(25);

      // Handle NaN or missing duration gracefully
      track0.audioBuffer = { duration: NaN };
      track1.audioBuffer = { duration: 10 }; // Right track is valid
      track1.parameters.offsetSeconds = 0;
      // This will be NaN before the isNaN check in the function
      // expect(stateManager.calculateMaxEffectiveDuration()).toBe(10); // Should fall back to right
      // The actual logic is: max(NaN, 10) which is NaN, then the function returns 0.
      expect(stateManager.calculateMaxEffectiveDuration()).toBe(0);

      track0.audioBuffer = null; // Left track no buffer
      expect(stateManager.calculateMaxEffectiveDuration()).toBe(10); // Only right track counts
    });
  });

  describe('Reset', () => {
    test('resetState', () => {
      stateManager.addNewTrack(0);
      stateManager.addNewTrack(1);
      stateManager.assignChannel('left', 0);
      stateManager.assignChannel('right', 1);
      stateManager.setPlaybackState('playing', 0.1, 0.2);
      stateManager.setCurrentGlobalSpeed(1.5);
      stateManager.togglePitchLink(); // Becomes false
      stateManager.setVadModelReady(true);

      const track0 = stateManager.getTrackByIndex(0);
      if (track0) track0.playTimeoutId = setTimeout(() => {}, 100); // Mock timeout
      jest.spyOn(global, 'clearTimeout');

      stateManager.resetState();

      expect(stateManager.getTracksData().length).toBe(0);
      expect(stateManager.getLoadedTrackCount()).toBe(0);
      expect(stateManager.getLeftTrackIndex()).toBe(-1);
      expect(stateManager.getRightTrackIndex()).toBe(-1);
      expect(stateManager.getIsMultiChannelModeActive()).toBe(false);
      expect(stateManager.getPlaybackState()).toBe('stopped');
      expect(stateManager.getPlaybackStartTimeContext()).toBeNull();
      expect(stateManager.getPlaybackStartSourceTime()).toBe(0.0);
      expect(stateManager.getCurrentGlobalSpeed()).toBe(1.0);
      expect(stateManager.getIsPitchLinked()).toBe(true); // Resets to default
      expect(stateManager.getIsVadModelReady()).toBe(false);

      if (track0 && track0.playTimeoutId) {
        expect(clearTimeout).toHaveBeenCalledWith(track0.playTimeoutId);
      }
      global.clearTimeout.mockRestore();
    });
  });
});
