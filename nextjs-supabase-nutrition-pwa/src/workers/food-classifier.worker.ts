import { env, pipeline, RawImage } from "@huggingface/transformers";

// Inference happens entirely in this browser worker. The Swin Food101 model weights are
// downloaded from Hugging Face on first use and cached by the browser. Fruit foods
// remain available in Bloom's catalog without requiring a second external model.
env.allowLocalModels = false;

const MODEL_ID = "onnx-community/swin-finetuned-food101-ONNX";

type ClassifyMessage = { type: "classify"; requestId: string; image: Blob };

const loadModel = (dtype: "q4f16" | "q8" = "q4f16") => pipeline("image-classification", MODEL_ID, {
  device: "wasm",
  dtype,
  progress_callback: (event) => {
    const progress = event as { status?: string; progress?: number; file?: string };
    if (progress.status === "progress" && typeof progress.progress === "number" && progress.file?.includes("model")) {
      self.postMessage({ type: "progress", percent: Math.min(100, Math.round(progress.progress)) });
    }
  },
});

let modelPromise: ReturnType<typeof loadModel> | null = null;
let modelMode: "q4f16" | "q8" = "q4f16";
let fruitModelPromise: Promise<any> | null = null;
const FRUIT_LABELS = ["apple","banana","grapes","kiwi","lemon","lime","mango","orange","pear","pineapple","pomegranate","watermelon","peach","cherry","papaya","cantaloupe","honeydew","raspberries","blackberries"];
const loadFruitModel = async () => {
  const { pipeline: fruitPipeline } = await import("@huggingface/transformers");
  return fruitPipeline("zero-shot-image-classification", "Xenova/clip-vit-base-patch32", { device: "wasm", dtype: "q8" as any });
};
self.onmessage = async (event: MessageEvent<ClassifyMessage>) => {
  if (event.data.type !== "classify") return;
  const { requestId, image } = event.data;
  try {
    self.postMessage({ type: "loading", requestId, model: modelMode });
    if (!modelPromise) {
      modelMode = "q4f16";
      modelPromise = loadModel("q4f16").catch(async (error: unknown) => {
        modelMode = "q8";
        try {
          return await loadModel("q8");
        } catch {
          modelPromise = null;
          throw error;
        }
      });
    }
    const classifier = await modelPromise;
    self.postMessage({ type: "analyzing", requestId, model: modelMode });
    const pixels = await RawImage.read(image);
    const predictions = await classifier(pixels, { top_k: 5 });
    const top = predictions?.[0];
    let fruitPredictions: {label:string;score:number}[] = [];
    // Swin Food101 remains the primary model. If it does not confidently identify a
    // fruit, use the same Transformers.js worker for a fruit-specific second pass.
    const foodFruitIds = new Set(["apple","banana","grapes","kiwi","lemon","lime","mango","orange","pear","pineapple","pomegranate","watermelon","peach","cherry","papaya","cantaloupe","honeydew","raspberries","blackberries","strawberries"]);
    const foodIsFruit = String(top?.label || "").toLowerCase().replace(/[^a-z0-9]+/g, "_") in Object.fromEntries(Array.from(foodFruitIds).map(x => [x, true]));
    if (!foodIsFruit) {
      if (!fruitModelPromise) fruitModelPromise = loadFruitModel().catch((error: unknown) => { fruitModelPromise = null; throw error; });
      try {
        const fruitClassifier = await fruitModelPromise;
        const fruitResults = await fruitClassifier(pixels, FRUIT_LABELS, { top_k: 5 });
        fruitPredictions = fruitResults.map((x: any) => ({ label: String(x.label), score: Number(x.score) }));
      } catch {
        fruitPredictions = [];
      }
    }
    self.postMessage({ type: "complete", requestId, predictions, fruitPredictions });
  } catch (error) {
    self.postMessage({
      type: "error", requestId,
      message: error instanceof Error ? error.message : "The photo could not be analyzed.",
    });
  }
};
