import { CreateMLCEngine } from "@mlc-ai/web-llm";

const MODEL_ID = "Qwen2-0.5B-Instruct-q4f16_1-MLC";

type CoachMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type RequestMessage = {
  type: "chat";
  requestId: string;
  messages: CoachMessage[];
};

let enginePromise: ReturnType<typeof CreateMLCEngine> | null = null;

async function getEngine(requestId: string) {
  if (!enginePromise) {
    if (!("gpu" in navigator)) throw new Error("WebGPU is not available on this device.");
    enginePromise = CreateMLCEngine(MODEL_ID, {
      initProgressCallback: (progress) => {
        self.postMessage({
          type: "progress",
          requestId,
          text: progress.text || "Loading Bloom Kito Coach…",
          progress: typeof progress.progress === "number" ? Math.round(progress.progress * 100) : null,
        });
      },
    }).catch((error: unknown) => {
      enginePromise = null;
      throw error;
    });
  }
  return enginePromise;
}

self.onmessage = async (event: MessageEvent<RequestMessage>) => {
  if (event.data.type !== "chat") return;
  const { requestId, messages } = event.data;
  try {
    self.postMessage({ type: "loading", requestId, text: "Waking up Bloom Kito Coach…" });
    const engine = await getEngine(requestId);
    const result = await engine.chat.completions.create({
      messages,
      temperature: 0.55,
      max_tokens: 300,
    });
    const content = result.choices?.[0]?.message?.content;
    self.postMessage({
      type: "complete",
      requestId,
      text: typeof content === "string" ? content.trim() : "I couldn't form a response just yet.",
    });
  } catch (error) {
    self.postMessage({
      type: "error",
      requestId,
      text: error instanceof Error ? error.message : "Bloom Kito Coach could not start on this device.",
    });
  }
};
