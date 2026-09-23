import { env, pipeline, RawImage } from "@huggingface/transformers";

// Inference happens entirely in this browser worker. The Food101 model weights are
// downloaded from Hugging Face on first use and cached by the browser. Fruit foods
// remain available in Bloom's catalog without requiring a second external model.
env.allowLocalModels = false;

const MODEL_ID = "onnx-community/swin-finetuned-food101-ONNX";

type ClassifyMessage = { type: "classify"; requestId: string; image: Blob };

const loadModel = () => pipeline("image-classification", MODEL_ID, {
  device: "wasm",
  dtype: "q8",
  progress_callback: (event) => {
    const progress = event as { status?: string; progress?: number; file?: string };
    if (progress.status === "progress" && typeof progress.progress === "number" && progress.file?.includes("model")) {
      self.postMessage({ type: "progress", percent: Math.min(100, Math.round(progress.progress)) });
    }
  },
});

let modelPromise: ReturnType<typeof loadModel> | null = null;
self.onmessage = async (event: MessageEvent<ClassifyMessage>) => {
  if (event.data.type !== "classify") return;
  const { requestId, image } = event.data;
  try {
    self.postMessage({ type: "loading", requestId });
    if (!modelPromise) {
      modelPromise = loadModel().catch((error: unknown) => {
        modelPromise = null; // allow retry when a download fails
        throw error;
      });
    }
    const classifier = await modelPromise;
    self.postMessage({ type: "analyzing", requestId });
    const pixels = await RawImage.read(image);
    const predictions = await classifier(pixels, { top_k: 5 });
    self.postMessage({ type: "complete", requestId, predictions });
  } catch (error) {
    self.postMessage({
      type: "error", requestId,
      message: error instanceof Error ? error.message : "The photo could not be analyzed.",
    });
  }
};
