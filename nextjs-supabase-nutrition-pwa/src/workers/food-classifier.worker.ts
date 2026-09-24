import { env, pipeline, RawImage } from "@huggingface/transformers";

// Everything runs locally in this browser worker. Model files are fetched directly from
// Hugging Face and cached by the browser; no food photo is uploaded to a server.
env.allowLocalModels = false;

const MODEL_ID = "onnx-community/swin-finetuned-food101-ONNX";

type ClassifyMessage = { type: "classify"; requestId: string; image: Blob };
type Runtime = "webgpu" | "wasm";
type ModelMode = "q4f16" | "q8";

const getPreferredRuntime = (): Runtime =>
  typeof navigator !== "undefined" && "gpu" in navigator ? "webgpu" : "wasm";

const loadModel = (dtype: ModelMode, runtime: Runtime) =>
  pipeline("image-classification", MODEL_ID, {
    device: runtime,
    dtype,
    progress_callback: (event) => {
      const progress = event as { status?: string; progress?: number; file?: string };
      if (
        progress.status === "progress" &&
        typeof progress.progress === "number" &&
        progress.file?.includes("model")
      ) {
        self.postMessage({
          type: "progress",
          percent: Math.min(100, Math.round(progress.progress)),
          model: dtype,
          runtime,
        });
      }
    },
  });

let modelPromise: ReturnType<typeof loadModel> | null = null;
let modelMode: ModelMode = "q4f16";
let runtimeMode: Runtime = "wasm";

const FRUIT_LABELS = [
  "apple", "banana", "grapes", "kiwi", "lemon", "lime", "mango", "orange",
  "pear", "pineapple", "pomegranate", "watermelon", "peach", "cherry",
  "papaya", "cantaloupe", "honeydew", "raspberries", "blackberries", "strawberries",
];

const FOOD_FRUIT_IDS = new Set(FRUIT_LABELS);

let fruitModelPromise: Promise<any> | null = null;
const loadFruitModel = async (runtime: Runtime) => {
  const { pipeline: fruitPipeline } = await import("@huggingface/transformers");
  return fruitPipeline("zero-shot-image-classification", "Xenova/clip-vit-base-patch32", {
    device: runtime,
    dtype: "q8" as any,
  });
};

const getModel = async () => {
  if (modelPromise) return modelPromise;

  const preferredRuntime = getPreferredRuntime();
  modelMode = "q4f16";
  runtimeMode = preferredRuntime;

  // WebGPU is faster on supported browsers. If the GPU backend cannot initialize,
  // fall back to WASM without making the user configure anything.
  modelPromise = loadModel("q4f16", preferredRuntime).catch(async (firstError: unknown) => {
    if (preferredRuntime === "webgpu") {
      runtimeMode = "wasm";
      try {
        return await loadModel("q4f16", "wasm");
      } catch {
        // Continue to the smaller-compatible fallback below.
      }
    }

    modelMode = "q8";
    try {
      return await loadModel("q8", runtimeMode);
    } catch {
      modelPromise = null;
      throw firstError;
    }
  });

  return modelPromise;
};

self.onmessage = async (event: MessageEvent<ClassifyMessage>) => {
  if (event.data.type !== "classify") return;

  const { requestId, image } = event.data;

  try {
    self.postMessage({
      type: "loading",
      requestId,
      model: modelMode,
      runtime: runtimeMode,
    });

    const classifier = await getModel();

    self.postMessage({
      type: "analyzing",
      requestId,
      model: modelMode,
      runtime: runtimeMode,
    });

    const pixels = await RawImage.read(image);
    const predictions = await classifier(pixels, { top_k: 5 });
    const top = predictions?.[0];

    let fruitPredictions: { label: string; score: number }[] = [];
    const normalizedTopLabel = String(top?.label || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");

    // Food101 is the primary classifier. A fruit-specific second pass helps when
    // the Food101 label is not one of Bloom's known fruit classes.
    const foodIsFruit = FOOD_FRUIT_IDS.has(normalizedTopLabel);

    if (!foodIsFruit) {
      if (!fruitModelPromise) {
        fruitModelPromise = loadFruitModel(runtimeMode).catch((error: unknown) => {
          fruitModelPromise = null;
          throw error;
        });
      }

      try {
        const fruitClassifier = await fruitModelPromise;
        const fruitResults = await fruitClassifier(pixels, FRUIT_LABELS, { top_k: 5 });
        fruitPredictions = fruitResults.map((x: any) => ({
          label: String(x.label),
          score: Number(x.score),
        }));
      } catch {
        fruitPredictions = [];
      }
    }

    self.postMessage({
      type: "complete",
      requestId,
      predictions,
      fruitPredictions,
      model: modelMode,
      runtime: runtimeMode,
    });
  } catch (error) {
    self.postMessage({
      type: "error",
      requestId,
      message: error instanceof Error ? error.message : "The photo could not be analyzed.",
    });
  }
};
