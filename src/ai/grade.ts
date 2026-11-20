import { InferenceMode, InferenceSource } from "firebase/ai";
import type { AIProvider } from "./provider";

export interface AnswerGrade {
  verdict: "correct" | "partial" | "incorrect";
  missing: string[];
  suggestedRating: 1 | 2 | 3 | 4;
}

export interface CheckedAnswer extends AnswerGrade {
  source: InferenceSource;
  simulated: boolean;
}

export function parseGrade(text: string): AnswerGrade {
  const value = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/giu, "")) as Partial<AnswerGrade> | null;
  if (!value || !Array.isArray(value.missing) || !value.missing.every((point) => typeof point === "string")) {
    throw new Error("Answer feedback was incomplete.");
  }
  const { verdict, missing } = value;
  if (verdict === "incorrect") return { verdict, missing, suggestedRating: 1 };
  if (verdict === "partial") return { verdict, missing, suggestedRating: 2 };
  if (verdict === "correct") return { verdict, missing, suggestedRating: value.suggestedRating === 4 ? 4 : 3 };
  throw new Error("Answer feedback was incomplete.");
}

export async function checkAnswer(
  provider: AIProvider, cloudModel: string, question: string, expected: string, answer: string,
): Promise<CheckedAnswer> {
  if ((await provider.status()).nano !== "available") {
    throw new Error("Enable on-device AI in the side panel to check typed answers. You can still reveal the answer and rate yourself.");
  }
  const result = await provider.generate({
    task: { kind: "grade", question, expected, answer },
    mode: InferenceMode.ONLY_ON_DEVICE,
    reason: "Typed answers are graded on-device.",
    cloudModel,
  });
  if (result.source !== InferenceSource.ON_DEVICE) throw new Error("On-device answer feedback is unavailable.");
  return { ...parseGrade(result.text), source: result.source, simulated: result.simulated ?? false };
}
