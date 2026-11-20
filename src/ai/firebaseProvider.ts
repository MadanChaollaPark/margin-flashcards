import {
  getAI, getGenerativeModel, GoogleAIBackend, InferenceMode, InferenceSource,
  type AI, type LanguageModelCreateOptions, type LanguageModelExpected, type Part,
} from "firebase/ai";
import type { FirebaseApp } from "firebase/app";
import { MAX_INPUT_BUDGET, NANO_CONTEXT_TOKENS, NANO_OUTPUT_RESERVE, type RoutingConfig } from "../firebase/remoteConfig";
import { createPrompt, firebaseSchema } from "./prompts";
import { canRunOnDevice, estimateInputTokens, estimateTokens, nanoHint } from "./router";
import { routeReason, type AIProvider, type ContentInput, type InferenceRequest, type InferenceResult, type LocalAvailability } from "./provider";

type PromptAPI = {
  availability(options?: LanguageModelCreateOptions): Promise<LocalAvailability>;
};

const text: LanguageModelExpected = { type: "text", languages: ["en", "es", "ja"] };
const textOptions: LanguageModelCreateOptions = {
  expectedInputs: [text],
  expectedOutputs: [text],
};
const imageOptions: LanguageModelCreateOptions = {
  ...textOptions,
  expectedInputs: [text, { type: "image" }],
};

export function browserModel(): PromptAPI | undefined {
  return (globalThis as typeof globalThis & { LanguageModel?: PromptAPI }).LanguageModel;
}

export class FirebaseProvider implements AIProvider {
  private readonly ai: AI;

  constructor(app: FirebaseApp, private readonly config: RoutingConfig) {
    this.ai = getAI(app, { backend: new GoogleAIBackend(), useLimitedUseAppCheckTokens: true });
  }

  async status(input?: ContentInput): Promise<{ nano: LocalAvailability }> {
    try {
      return { nano: await browserModel()?.availability(input?.kind === "image" ? imageOptions : textOptions) ?? "unavailable" };
    } catch {
      return { nano: "unavailable" };
    }
  }

  // Call directly from the extension page's model enable button.
  async initializeDeviceModel(onProgress?: (progress: number) => void): Promise<void> {
    if (!browserModel()) throw new Error("Gemini Nano is unavailable in this browser.");
    const model = getGenerativeModel(this.ai, {
      mode: InferenceMode.ONLY_ON_DEVICE,
      inCloudParams: { model: this.config.cloudModel },
      onDeviceParams: { createOptions: textOptions },
    });
    await model.initializeDeviceModel(onProgress);
  }

  async generate({ task, mode, cloudModel, reason, repair }: InferenceRequest): Promise<InferenceResult> {
    const { prompt, schema } = createPrompt(task, this.config.maxCardsPerChunk, repair);
    const input = task.kind === "cards" ? task.input : undefined;
    const supported = !input || canRunOnDevice(input);
    const inputTokens = input ? estimateInputTokens(input)
      : estimateTokens(task.kind === "sensitivity" ? task.text : prompt);
    const extraMediaTokens = input ? inputTokens - estimateTokens(input.text ?? "") : 0;
    const fits = inputTokens <= Math.min(this.config.maxOnDeviceTokens, MAX_INPUT_BUDGET) &&
      estimateTokens(prompt) + estimateTokens(JSON.stringify(schema)) + extraMediaTokens <= NANO_CONTEXT_TOKENS - NANO_OUTPUT_RESERVE;

    if (mode === InferenceMode.ONLY_ON_DEVICE) {
      if (!supported || !fits) throw new Error("This request exceeds Gemini Nano's supported formats or token budget.");
      // Without a document-side adapter the SDK can dispatch directly to cloud.
      const { nano } = await this.status(input);
      if (nano !== "available" || typeof window === "undefined") {
        throw new Error(nanoHint(nano));
      }
    }

    const effectiveMode = mode === InferenceMode.PREFER_ON_DEVICE && (!supported || !fits)
      ? InferenceMode.ONLY_IN_CLOUD : mode;
    const model = getGenerativeModel(this.ai, {
      mode: effectiveMode,
      onDeviceParams: {
        createOptions: input?.kind === "image" ? imageOptions : textOptions,
        promptOptions: { responseConstraint: schema },
      },
      inCloudParams: {
        model: effectiveMode === mode ? cloudModel : this.config.longDocModel,
        generationConfig: { responseMimeType: "application/json", responseSchema: firebaseSchema(schema) },
      },
    });
    const parts: Part[] = [{ type: "text", text: prompt }];
    if (input?.kind === "youtube") {
      parts.push({ type: "fileData", fileData: { mimeType: "video/mp4", fileUri: input.url } });
    } else if (input && input.kind !== "text") {
      parts.push({ type: "inlineData", inlineData: { mimeType: input.mimeType, data: input.data } });
    }
    const { response } = await model.generateContent({ contents: [{ role: "user", parts }] });
    const source = response.inferenceSource ??
      (effectiveMode === InferenceMode.ONLY_IN_CLOUD ? InferenceSource.IN_CLOUD : undefined);
    if (source !== InferenceSource.ON_DEVICE && source !== InferenceSource.IN_CLOUD) {
      throw new Error("Firebase did not report where inference ran.");
    }
    if (effectiveMode === InferenceMode.ONLY_ON_DEVICE && source !== InferenceSource.ON_DEVICE) {
      throw new Error("Firebase reported an unexpected inference source for a local request.");
    }
    const actualReason = effectiveMode !== mode
      ? "The request exceeds the on-device format or token limits. Used cloud inference."
      : routeReason(mode, source, reason);
    return { text: response.text(), source, reason: actualReason };
  }
}
