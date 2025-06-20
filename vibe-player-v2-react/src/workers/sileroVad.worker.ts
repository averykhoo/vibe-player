// vibe-player-v2-react/src/workers/sileroVad.worker.ts
// vibe-player-v2/src/lib/workers/sileroVad.worker.ts
import * as ort from "onnxruntime-web";
import type {
  SileroVadInitPayload,
  SileroVadProcessPayload,
  SileroVadProcessResultPayload,
  WorkerMessage,
  WorkerPayload, // Import WorkerPayload
} from "@/types/worker.types";
import { VAD_WORKER_MSG_TYPE } from "@/types/worker.types";
import { assert } from "@/utils/assert";

// --- Worker State ---
/** ONNX Runtime inference session for the Silero VAD model. */
let vadSession: ort.InferenceSession | null = null;
/** Sample rate expected by the VAD model (e.g., 16000 Hz). Set during INIT. */
let modelSampleRate: number;
/** Number of samples per audio frame for VAD processing. Set during INIT. */
let modelFrameSamples: number;
/** Threshold for considering a frame as speech (0-1). Set during INIT. */
let vadPositiveThreshold: number;
/** Threshold for considering a frame as non-speech (hysteresis, 0-1). Set during INIT. */
let vadNegativeThreshold: number;
/** Hidden state tensor for the VAD model's RNN. */
let _h: ort.Tensor | null = null;
/** Cell state tensor for the VAD model's RNN. */
let _c: ort.Tensor | null = null;
/** Tensor holding the sample rate, passed as input to the model. */
const srData = new Int32Array(1); // Pre-allocate for performance
let srTensor: ort.Tensor | null = null;

/**
 * @global self
 * @description Main message handler for the Silero VAD Web Worker.
 * Responds to 'INIT', 'PROCESS', and 'RESET' messages from the main thread.
 * - 'INIT': Initializes the ONNX session, VAD parameters, and RNN states.
 * - 'PROCESS': Processes a single audio frame for voice activity.
 * - 'RESET': Resets the RNN states.
 * @param {MessageEvent<WorkerMessage<WorkerPayload>>} event - The message event from the main thread.
 */
self.onmessage = async (event: MessageEvent<WorkerMessage<WorkerPayload>>): Promise<void> => {
  const { type, payload: unknownPayload, messageId } = event.data;

  try {
    switch (type) {
      case VAD_WORKER_MSG_TYPE.INIT:
        const initPayload = unknownPayload as SileroVadInitPayload;

        // --- ADD THESE ASSERTIONS ---
        assert(
          initPayload && typeof initPayload === "object",
          "INIT payload is missing or not an object.",
        );
        assert(initPayload.origin, "INIT payload is missing `origin`.");
        assert(
          initPayload.modelBuffer &&
            initPayload.modelBuffer instanceof ArrayBuffer,
          "INIT payload is missing a valid `modelBuffer`.",
        );
        assert(
          typeof initPayload.sampleRate === "number",
          "INIT payload is missing `sampleRate`.",
        );
        // --- END ASSERTIONS ---

        modelSampleRate = initPayload.sampleRate;
        modelFrameSamples = initPayload.frameSamples;
        vadPositiveThreshold = initPayload.positiveThreshold || 0.5; // Default if not provided
        vadNegativeThreshold = initPayload.negativeThreshold || 0.35; // Default if not provided

        // --- THE FIX ---
        if (!initPayload.origin) {
          throw new Error(
            "SileroVadWorker INIT: `origin` is missing in payload.",
          );
        }
        // Ensure the path has a trailing slash before ORT uses it.
        // Point to the /assets/wasm/ directory where viteStaticCopy places them.
        ort.env.wasm.wasmPaths = `/assets/wasm/`;
        // --- END FIX ---

        if (!initPayload.modelBuffer) {
          throw new Error(
            "SileroVadWorker INIT: modelBuffer is missing in payload",
          );
        }

        try {
          vadSession = await ort.InferenceSession.create(
            initPayload.modelBuffer,
            { executionProviders: ["wasm"] },
          );
        } catch (e) {
          const ortError = e as Error;
          throw new Error(
            `ONNX session creation failed: ${ortError.message}. Check WASM paths and model buffer.`,
          );
        }

        _h = new ort.Tensor(
          "float32",
          new Float32Array(2 * 1 * 64).fill(0),
          [2, 1, 64],
        );
        _c = new ort.Tensor(
          "float32",
          new Float32Array(2 * 1 * 64).fill(0),
          [2, 1, 64],
        );
        srData[0] = modelSampleRate; // Use the initialized modelSampleRate
        srTensor = new ort.Tensor("int32", srData, [1]);

        self.postMessage({ type: VAD_WORKER_MSG_TYPE.INIT_SUCCESS, messageId } as WorkerMessage<null>);
        break;

      case VAD_WORKER_MSG_TYPE.PROCESS:
        if (!vadSession || !_h || !_c || !srTensor) {
          throw new Error("VAD worker not initialized or tensors not ready.");
        }
        const processPayload = unknownPayload as SileroVadProcessPayload;

        // --- ADD THIS ASSERTION ---
        assert(
          processPayload.audioFrame &&
            processPayload.audioFrame instanceof Float32Array,
          "PROCESS payload is missing a valid `audioFrame`.",
        );
        // --- END ASSERTION ---

        const audioFrame = processPayload.audioFrame;

        if (audioFrame.length !== modelFrameSamples) {
          throw new Error(
            `Input audio frame size ${audioFrame.length} does not match expected frameSamples ${modelFrameSamples}`,
          );
        }

        const inputTensor = new ort.Tensor("float32", audioFrame, [
          1,
          audioFrame.length,
        ]);
        const feeds: Record<string, ort.Tensor> = {
          input: inputTensor,
          sr: srTensor,
          h: _h,
          c: _c,
        };

        const results = await vadSession.run(feeds);
        const outputScore = (results.output.data as Float32Array)[0];
        _h = results.hn;
        _c = results.cn;

        const isSpeech = outputScore >= vadPositiveThreshold; // Use initialized threshold

        const resultPayload: SileroVadProcessResultPayload = {
          isSpeech: isSpeech,
          timestamp: processPayload.timestamp || 0, // Use timestamp from casted processPayload
          score: outputScore,
        };
        self.postMessage({
          type: VAD_WORKER_MSG_TYPE.PROCESS_RESULT,
          payload: resultPayload,
          messageId,
        });
        break;

      case VAD_WORKER_MSG_TYPE.RESET:
        if (_h && _c) {
          _h.data.fill(0);
          _c.data.fill(0);
        }
        self.postMessage({
          type: `${VAD_WORKER_MSG_TYPE.RESET}_SUCCESS`,
          messageId,
        });
        break;

      default:
        self.postMessage({
          type: "unknown_message",
          error: `Unknown message type: ${type}`,
          messageId,
        });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error(
      `Error in SileroVadWorker (type: ${type}):`,
      errorMessage,
      errorStack,
    );
    self.postMessage({
      type: `${type}_ERROR` as string,
      error: errorMessage,
      messageId,
    });
  }
};
