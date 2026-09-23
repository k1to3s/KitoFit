import { env, pipeline, RawImage } from "@huggingface/transformers";

// Inference happens entirely in this browser worker. The model weights are
// downloaded from Hugging Face on first use and cached by the browser.
env.allowLocalModels = false;

const MODEL_ID = "onnx-community/swin-finetuned-food101-ONNX";
const FRUIT_MODEL_ID = "Xenova/mobilenetv2-1.0-224";
const FRUIT_LABELS = new Set(["banana","granny smith","orange","pineapple","strawberry","lemon","fig","pomegranate","custard apple","jackfruit","corn","acorn squash","butternut squash"]);

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
let fruitModelPromise: ReturnType<typeof loadFruitModel> | null = null;

const loadFruitModel = () => pipeline("image-classification", FRUIT_MODEL_ID, {
  device: "wasm",
  dtype: "q8",
});

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
    const fruitClassifier = await (fruitModelPromise ??= loadFruitModel());
    const [predictions, fruitPredictions] = await Promise.all([
      classifier(pixels, { top_k: 5 }),
      fruitClassifier(pixels, { top_k: 5 }),
    ]);
    const fruit = (fruitPredictions as {label:string;score:number}[])
      .filter((p) => FRUIT_LABELS.has(p.label.toLowerCase()))
      .map((p) => ({label:p.label, score:p.score + 0.15}));
    const combined = [...(predictions as {label:string;score:number}[]), ...fruit]
      .sort((a,b) => b.score-a.score)
      .slice(0, 5);
    self.postMessage({ type: "complete", requestId, predictions: combined });
  } catch (error) {
    self.postMessage({
      type: "error", requestId,
      message: error instanceof Error ? error.message : "The photo could not be analyzed.",
    });
  }
};
