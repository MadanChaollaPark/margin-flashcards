import { InferenceMode, InferenceSource } from "firebase/ai";
import { dedupe } from "../cards/dedupe";
import { validate, type CardDraft } from "../cards/schema";
import { DEFAULTS } from "../firebase/remoteConfig";
import { curatedCards } from "./demoSamples";
import { routeReason, type AIProvider, type InferenceRequest, type InferenceResult, type LocalAvailability } from "./provider";
import { canRunOnDevice, estimateInputTokens, hasSensitiveText } from "./router";

interface MockOptions {
  nano?: LocalAvailability;
  online?: boolean;
  maxCardsPerChunk?: number;
  maxOnDeviceTokens?: number;
}

const subject = String.raw`[\p{L}][\p{L}\p{N}–'-]*(?:\s+[\p{L}][\p{L}\p{N}–'-]*){0,5}`;
const definition = new RegExp("^(" + subject + ") (is|are|means|refers to) (.+)$", "iu");
const location = new RegExp("^(" + subject + ") (occurs?|happens?|takes? place) (in|at|within) (.+)$", "iu");
const action = new RegExp("^(" + subject + ") (absorbs?|carries|carry|contains?|converts?|forms?|moves?|produces?|provides?|repels?|regulates?|stores?|transports?|uses?) (.+)$", "iu");
const dependent = /^(?:this|that|these|those|it|they|he|she|we|you|the process|the resulting energy)\b/iu;
const validSubject = (value: string) => !dependent.test(value) &&
  !/\b(?:and|or|which|when|where|because|can|could|must|will|has|have|was|were|is|are|uses|absorbs|produces)\b/iu.test(value);
const sentenceCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
const inQuestion = (value: string) => value.replace(/^(The|A|An)(?= )/u, (article) => article.toLowerCase());

export const MAX_DEMO_CARDS = 8;

function generateCards(text: string, maxCards: number, quoteSource = false): CardDraft[] {
  const limit = Math.min(maxCards, MAX_DEMO_CARDS);
  const curated = curatedCards(text, quoteSource);
  if (curated) return curated.slice(0, limit);

  let previousProcess: string | undefined;
  const candidates: { card: CardDraft & { sourceQuote?: string }; score: number; topic: string }[] = [];
  for (const passage of text.split(/(?<=[.!?])\s+|\n+/u)) {
    const sourceQuote = passage.trim().replace(/^[-*•]\s+/u, "");
    let sentence = sourceQuote;
    if (!sentence) continue;
    const antecedent = previousProcess;
    previousProcess = undefined;
    if (sentence.length < 15 || sentence.length > 350 || /[!?]$/u.test(sentence)) continue;
    if (dependent.test(sentence)) {
      if (!antecedent || !/^(?:it|this process|the process) (?:occurs|happens|takes place|produces|uses) /iu.test(sentence)) continue;
      sentence = sentence.replace(/^(?:it|this process|the process)/iu, antecedent);
    }

    const match = sentence.match(location) ?? sentence.match(action) ?? sentence.match(definition);
    if (!match || !validSubject(match[1])) continue;
    const [, topic, verb, phrase, place] = match;
    const name = inQuestion(topic);
    const auxiliary = /s(?:\s|$)/iu.test(verb) ? "does" : "do";
    let draft: CardDraft;
    let score: number;
    if (place) {
      draft = { type: "basic", front: "Where " + auxiliary + " " + name + " happen?", back: sentenceCase(phrase + " " + place) };
      score = 4;
    } else if (/^(?:is|are|means|refers to)$/iu.test(verb)) {
      if (/^(?:is|are)$/iu.test(verb) && !/^(?:an? |the |pores? |cells? |proteins? |molecules? |structures? )/iu.test(phrase)) continue;
      draft = { type: "basic", front: "What " + (verb.toLowerCase() === "are" ? "are " : "is ") + name + "?", back: sentenceCase(phrase) };
      if (/\b(?:process|conversion|breakdown|reaction|movement)\b/iu.test(phrase)) previousProcess = topic;
      score = 5;
    } else {
      const acronym = phrase.match(/\b[A-Z][A-Z0-9]{1,7}\b/u)?.[0];
      if (acronym && !topic.includes(acronym) && phrase.indexOf(acronym) === phrase.lastIndexOf(acronym)) {
        draft = { type: "cloze", front: topic + " " + verb + " " + phrase.replace(acronym, "{{c1::" + acronym + "}}"), back: acronym };
        score = 4;
      } else {
        draft = { type: "basic", front: "What " + auxiliary + " " + name + " do?", back: sentence };
        score = 3;
      }
    }
    const card = validate(draft);
    if (card) candidates.push({ card: quoteSource ? { ...card, sourceQuote: sourceQuote.split(/\s+/u).slice(0, 12).join(" ") } : card,
      score, topic: name.toLowerCase() });
  }

  const counts = new Map<string, number>();
  const ranked = candidates.sort((a, b) => b.score - a.score).filter(({ topic }) => {
    const count = counts.get(topic) ?? 0;
    counts.set(topic, count + 1);
    return count < 2;
  });
  return dedupe(ranked.map(({ card }) => card)).slice(0, limit);
}

const stopwords = new Set(
  ("a an the and but or of in on at with as to by for from into than is are be being been this that " +
   "these those it they its their was were can may do does which what where how when who called known " +
   "such example examples used uses use process something provide provides supply supplies").split(" "),
);
const equivalents = new Map(Object.entries({
  adenosine_triphosphate: "atp", energy_currency: "energy", power: "energy", usable_energy: "energy", cell_work: "cell_work", cellular_work: "cell_work",
  cells: "cell", cellular: "cell", non_polar: "nonpolar",
  o2: "oxygen", co2: "carbon_dioxide", h2o: "water", protons: "proton",
  produces: "make", produce: "make", makes: "make", generates: "make", generated: "make",
  moves: "move", moving: "move", transports: "move", transported: "move",
}));

function keywords(text: string): Map<string, string> {
  const normalized = text.toLowerCase().replace(/\b(?:adenosine triphosphate|energy currency|usable energy|non[- ]polar|carbon dioxide|cellular (?:respiration|work)|cell work|usable energy)\b/gu,
    (phrase) => phrase.replace(/[- ]/gu, "_"));
  const terms = new Map<string, string>();
  for (const word of normalized.match(/[\p{L}\p{N}_]+/gu) ?? []) {
    if (!stopwords.has(word)) terms.set(equivalents.get(word) ?? word, word.replaceAll("_", " "));
  }
  return terms;
}

function grade(question: string, expected: string, answer: string) {
  const expectedTerms = keywords(expected);
  const questionTerms = keywords(question);
  const answerTerms = keywords(answer);
  const novel = [...expectedTerms].filter(([term]) => !questionTerms.has(term));
  const keyTerms = novel.length ? novel : [...expectedTerms];
  const missing = keyTerms.filter(([term]) => !answerTerms.has(term)).map(([, label]) => label);
  const coverage = keyTerms.length ? 1 - missing.length / keyTerms.length : 0;
  const normalize = (value: string) => value.trim().toLowerCase().replace(/[\p{P}\s]+/gu, " ").trim();
  if (answer.trim() && (normalize(expected) === normalize(answer) || coverage === 1)) {
    return { verdict: "correct", missing: [], suggestedRating: 3 };
  }
  return { verdict: coverage > 0 ? "partial" : "incorrect", missing: missing.slice(0, 4), suggestedRating: coverage > 0 ? 2 : 1 };
}

export class MockProvider implements AIProvider {
  private nano: LocalAvailability;
  private readonly online: boolean;
  private readonly maxCards: number;
  private readonly maxTokens: number;

  constructor(options: MockOptions = {}) {
    this.nano = options.nano ?? "available";
    this.online = options.online ?? true;
    this.maxCards = options.maxCardsPerChunk ?? DEFAULTS.maxCardsPerChunk;
    this.maxTokens = options.maxOnDeviceTokens ?? DEFAULTS.maxOnDeviceTokens;
  }

  async status(): Promise<{ nano: LocalAvailability }> {
    return { nano: this.nano };
  }

  async initializeDeviceModel(onProgress?: (progress: number) => void): Promise<void> {
    if (this.nano === "unavailable") throw new Error("Gemini Nano is unavailable in this browser.");
    if (this.nano !== "available" && !this.online) throw new Error("Connect to the internet to download Gemini Nano.");
    this.nano = "available";
    onProgress?.(1);
  }

  async generate({ task, mode, reason }: InferenceRequest): Promise<InferenceResult> {
    const compatible = task.kind !== "cards" ||
      (canRunOnDevice(task.input) && estimateInputTokens(task.input) <= this.maxTokens);
    const local = compatible && this.nano === "available";
    if (mode === InferenceMode.ONLY_ON_DEVICE && !local) {
      throw new Error("Gemini Nano is unavailable for this request.");
    }
    const cloud = mode === InferenceMode.ONLY_IN_CLOUD ||
      (mode === InferenceMode.PREFER_IN_CLOUD ? this.online || !local : !local);
    if (cloud && !this.online) throw new Error("Cloud inference is unavailable while offline.");
    const source = cloud ? InferenceSource.IN_CLOUD : InferenceSource.ON_DEVICE;
    reason = routeReason(mode, source, reason);

    let result: unknown;
    switch (task.kind) {
      case "cards":
        if (task.input.kind !== "text") {
          const examples = {
            pdf: "OCR means optical character recognition. A searchable PDF contains a layer of machine-readable text.",
            image: "A pixel is the smallest addressable element of a raster image. PNG uses lossless compression.",
            youtube: "Captions are timed text synchronized with a video's audio. A transcript is a text record of what was said.",
          };
          result = generateCards(examples[task.input.kind], this.maxCards);
          reason = `${reason} Demo example cards for this attachment.`;
        } else {
          result = generateCards(task.input.text, this.maxCards, task.quoteSource);
        }
        break;
      case "grade":
        result = grade(task.question, task.expected, task.answer);
        break;
      case "sensitivity":
        result = { sensitive: hasSensitiveText(task.text) || /\b(?:private correspondence|confidential memo|medical record)\b/iu.test(task.text) };
        break;
    }
    return {
      text: JSON.stringify(result),
      source,
      reason: `Simulated — ${reason}`,
      simulated: true,
    };
  }
}
