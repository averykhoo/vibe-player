// vibe-player-v2-react/src/workers/rubberband.worker.ts
// vibe-player-v2/src/lib/workers/rubberband.worker.ts
import type {
  RubberbandInitPayload,
  RubberbandProcessPayload,
  RubberbandProcessResultPayload,
  RubberbandSetPitchPayload,
  RubberbandSetSpeedPayload,
  WorkerMessage,
  WorkerPayload,
} from "@/types/worker.types";
import { RB_WORKER_MSG_TYPE } from "@/types/worker.types";

// --- Type definitions for the Emscripten/WASM Module ---

/**
 * @interface RubberbandModule
 * @description Defines the expected interface of the compiled Rubberband WASM module.
 * This includes memory management functions (_malloc, _free), RubberbandStretcher API functions,
 * and heap accessors (HEAPU32, HEAPF32).
 */
interface RubberbandModule {
  _malloc: (size: number) => number; // Allocates memory in the WASM heap
  _free: (ptr: number) => void; // Frees previously allocated memory
  _rubberband_new: (
    sampleRate: number,
    channels: number,
    options: number,
    timeRatio: number,
    pitchScale: number,
  ) => number;
  _rubberband_delete: (stretcher: number) => void;
  _rubberband_set_time_ratio: (stretcher: number, ratio: number) => void;
  _rubberband_set_pitch_scale: (stretcher: number, scale: number) => void;
  _rubberband_reset: (stretcher: number) => void;
  _rubberband_process: (
    stretcher: number,
    inputPtrs: number,
    samples: number,
    final: number,
  ) => void;
  _rubberband_available: (stretcher: number) => number;
  _rubberband_retrieve: (
    stretcher: number,
    outputPtrs: number,
    samples: number,
  ) => number;
  HEAPU32: Uint32Array; // View into the WASM heap as unsigned 32-bit integers
  HEAPF32: Float32Array; // View into the WASM heap as 32-bit floats
  RubberBandOptionFlag?: { [key: string]: number }; // Optional: Flags for RubberbandStretcher options
}

/**
 * @function Rubberband
 * @description Declaration for the Rubberband factory function, which is typically
 * produced by the Emscripten glue code (loader script). This function initializes
 * and returns a Promise that resolves with the RubberbandModule instance.
 * @param moduleArg - An object containing `instantiateWasm` function for WASM instantiation.
 * @returns {Promise<RubberbandModule>} A promise resolving to the initialized WASM module.
 */
// Removed unused Rubberband declaration

// --- Worker State ---
let wasmModule: RubberbandModule | null = null; // Holds the instantiated WASM module
let stretcher: number = 0; // Opaque pointer (integer handle) to the C++ RubberbandStretcher object

// --- Main Worker Logic ---

/**
 * @global self
 * @description Handles incoming messages for the Rubberband worker.
 * Dispatches actions based on the message `type`.
 * @param {MessageEvent<WorkerMessage<WorkerPayload>>} event - The incoming message event.
 */
self.onmessage = async (event: MessageEvent<WorkerMessage<WorkerPayload>>): Promise<void> => {
  const { type, payload, messageId } = event.data;

  try {
    switch (type) {
      case RB_WORKER_MSG_TYPE.INIT: {
        await handleInit(payload as RubberbandInitPayload);
        self.postMessage({ type: RB_WORKER_MSG_TYPE.INIT_SUCCESS, messageId } as WorkerMessage<null>);
        break;
      }
      case RB_WORKER_MSG_TYPE.SET_SPEED: {
        const speedPayload = payload as RubberbandSetSpeedPayload;
        if (stretcher && wasmModule && typeof speedPayload?.speed === 'number') {
          wasmModule._rubberband_set_time_ratio(stretcher, 1.0 / speedPayload.speed);
        } else {
          console.warn("RubberbandWorker: SET_SPEED called with invalid payload or uninitialized state.");
        }
        break;
      }
      case RB_WORKER_MSG_TYPE.SET_PITCH: {
        const pitchPayload = payload as RubberbandSetPitchPayload;
        if (stretcher && wasmModule && typeof pitchPayload?.pitch === 'number') {
          const pitchScale = Math.pow(2, pitchPayload.pitch / 12.0);
          wasmModule._rubberband_set_pitch_scale(stretcher, pitchScale);
        } else {
          console.warn("RubberbandWorker: SET_PITCH called with invalid payload or uninitialized state.");
        }
        break;
      }
      case RB_WORKER_MSG_TYPE.RESET: {
        if (stretcher && wasmModule) {
          wasmModule._rubberband_reset(stretcher);
        } else {
          console.warn("RubberbandWorker: RESET called on uninitialized stretcher.");
        }
        break;
      }
      case RB_WORKER_MSG_TYPE.PROCESS: {
        const processResult = handleProcess(payload as RubberbandProcessPayload);
        const responseMsg: WorkerMessage<RubberbandProcessResultPayload> = {
            type: RB_WORKER_MSG_TYPE.PROCESS_RESULT,
            payload: processResult,
            messageId,
          };
        self.postMessage(
          responseMsg,
          processResult.outputBuffer.map((b: Float32Array) => b.buffer) // Added type for b
        );
        break;
      }
      case RB_WORKER_MSG_TYPE.FLUSH: {
        // FLUSH is intended to retrieve any remaining processed samples from the stretcher.
        // This simplified version sends back an empty buffer, assuming PROCESS handles final chunks.
        // A full implementation might involve calling _rubberband_available and _rubberband_retrieve.
        console.log("RubberbandWorker: FLUSH received. Sending empty result.");
        self.postMessage({
          type: RB_WORKER_MSG_TYPE.PROCESS_RESULT,
          payload: { outputBuffer: [] }, // Empty buffer for flush in this simplified version
          messageId,
        } as WorkerMessage<RubberbandProcessResultPayload>);
        break;
      }
      default: {
        console.warn(`RubberbandWorker: Received unknown message type: ${type}`);
      }
    }
  } catch (e: unknown) {
    const error = e as Error;
    console.error(`RubberbandWorker: Error processing message type ${type}:`, error.message, error.stack);
    self.postMessage({
      type: RB_WORKER_MSG_TYPE.ERROR, // Use a generic ERROR type for broader error reporting
      error: error.message,
      messageId,
    } as WorkerMessage<null>); // Payload might be null for generic errors
  }
};

/**
 * @async
 * @function handleInit
 * @description Initializes the Rubberband WASM module and stretcher instance.
 * This involves fetching and evaluating the loader script, instantiating the WASM,
 * and creating a new RubberbandStretcher.
 * @param {RubberbandInitPayload} payload - The initialization payload containing WASM binary,
 * loader script text, and initial stretcher parameters.
 * @throws {Error} If initialization fails at any step.
 */
async function handleInit(payload: RubberbandInitPayload): Promise<void> {
  console.log("RubberbandWorker: Initializing...");
  if (stretcher && wasmModule) {
    console.log("RubberbandWorker: Deleting existing stretcher instance.");
    wasmModule._rubberband_delete(stretcher);
    stretcher = 0; // Reset stretcher handle
  }

  const { wasmBinary, loaderScriptText, sampleRate, channels, initialSpeed, initialPitch } = payload; // Removed 'origin'
  if (!wasmBinary || !loaderScriptText) {
    throw new Error("RubberbandWorker handleInit: Missing wasmBinary or loaderScriptText in payload.");
  }

  // Dynamically evaluate the loader script text to get the Rubberband factory function.
  // This is a common pattern for Emscripten-generated loader scripts.
  // `self` might be needed in the scope if the loader script uses it.
  const getRubberbandFactory = new Function('self', loaderScriptText + "\nreturn Rubberband;")(self);
  const RubberbandFactory = getRubberbandFactory;

  // Define `instantiateWasm` as expected by the Emscripten loader.
  // This function is called by the loader to perform the actual WASM instantiation.
  const instantiateWasm = (
    imports: WebAssembly.Imports,
    callback: (instance: WebAssembly.Instance) => void,
  ): WebAssembly.WebAssemblyInstantiatedSource | Record<string, never> => { // Adjusted return type
    WebAssembly.instantiate(wasmBinary, imports)
      .then((output: WebAssembly.WebAssemblyInstantiatedSource) => {
        callback(output.instance);
      })
      .catch((err: Error) => {
        console.error("RubberbandWorker: WASM instantiation failed:", err);
        throw err; // Propagate error to stop initialization
      });
    return {}; // Emscripten glue code might expect an empty object or specific structure.
  };

  wasmModule = await RubberbandFactory({ instantiateWasm });
  if (!wasmModule) {
    throw new Error("RubberbandWorker: Failed to instantiate WASM module.");
  }
  console.log("RubberbandWorker: WASM module instantiated.");

  // Default options: RealTime for responsiveness, PitchHighQuality for better audio.
  // These might need to be configurable via payload if more flexibility is needed.
  const rubberbandOptions = wasmModule.RubberBandOptionFlag || {};
  const selectedOptions =
    (rubberbandOptions.ProcessRealTime || 0) | // Favor responsiveness
    (rubberbandOptions.PitchHighQuality || 0);   // Favor quality for pitch shifting

  stretcher = wasmModule._rubberband_new(
    sampleRate,
    channels,
    selectedOptions,
    1.0 / initialSpeed, // Time ratio is inverse of speed
    Math.pow(2, initialPitch / 12.0), // Pitch scale from semitones
  );

  if (!stretcher) {
    throw new Error("RubberbandWorker: Failed to create Rubberband stretcher instance.");
  }
  console.log("RubberbandWorker: Stretcher instance created successfully.");
}

/**
 * @function handleProcess
 * @description Processes a chunk of audio data using the Rubberband stretcher.
 * This involves allocating memory in the WASM heap, copying input data,
 * calling `rubberband_process`, retrieving processed data, and freeing memory.
 * @param {RubberbandProcessPayload} payload - The payload containing input audio buffer.
 * @returns {RubberbandProcessResultPayload} The payload containing processed audio buffer.
 * @throws {Error} If the worker is not initialized or if processing fails.
 */
function handleProcess(
  payload: RubberbandProcessPayload,
): RubberbandProcessResultPayload {
  if (!wasmModule || !stretcher) {
    throw new Error("RubberbandWorker: PROCESS called but worker or stretcher not initialized.");
  }

  const { inputBuffer /*, isFinalChunk */ } = payload; // isFinalChunk might be used with _rubberband_study if needed
  const channels = inputBuffer.length;
  if (channels === 0) return { outputBuffer: [] };

  const frameCount = inputBuffer[0].length;
  if (frameCount === 0) {
    return { outputBuffer: [] };
  }

  // 1. Allocate memory in the WASM heap for an array of pointers (one for each channel).
  const inputPtrs = wasmModule._malloc(channels * 4);

  // 2. For each channel, allocate memory and copy the audio data into the WASM heap.
  //    Store the pointer to this memory in the pointers array.
  for (let i = 0; i < channels; i++) {
    const bufferPtr = wasmModule._malloc(frameCount * 4);
    wasmModule.HEAPF32.set(inputBuffer[i], bufferPtr / 4);
    wasmModule.HEAPU32[inputPtrs / 4 + i] = bufferPtr;
  }

  // 3. Call the C++ `rubberband_process` function.
  wasmModule._rubberband_process(stretcher, inputPtrs, frameCount, 0);

  // 4. Free the memory we allocated for the input buffers and the pointer array.
  for (let i = 0; i < channels; i++) {
    wasmModule._free(wasmModule.HEAPU32[inputPtrs / 4 + i]);
  }
  wasmModule._free(inputPtrs);

  // 5. Retrieve the processed audio from Rubberband's internal buffers.
  const available = wasmModule._rubberband_available(stretcher);
  const outputBuffer: Float32Array[] = [];
  if (available > 0) {
    const outputPtrs = wasmModule._malloc(channels * 4);
    const retrievedPtrs: number[] = [];
    for (let i = 0; i < channels; i++) {
      const bufferPtr = wasmModule._malloc(available * 4);
      wasmModule.HEAPU32[outputPtrs / 4 + i] = bufferPtr;
      retrievedPtrs.push(bufferPtr);
    }

    const retrievedCount = wasmModule._rubberband_retrieve(
      stretcher,
      outputPtrs,
      available,
    );

    for (let i = 0; i < channels; i++) {
      const channelData = new Float32Array(retrievedCount);
      channelData.set(
        wasmModule.HEAPF32.subarray(
          retrievedPtrs[i] / 4,
          retrievedPtrs[i] / 4 + retrievedCount,
        ),
      );
      outputBuffer.push(channelData);
      wasmModule._free(retrievedPtrs[i]);
    }
    wasmModule._free(outputPtrs);
  }

  return { outputBuffer };
}
