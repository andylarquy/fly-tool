type Model =
  | "qwen3:4b-instruct-2507-q4_K_M"
  | "maternion/lfm2.5:8b" //{temperature: 0.2, top_p: 80, repeat_penalty: 1.05}
  | "qwen3:4b"
  | "qwen3:8b"
  | "maternion/lfm2:8b-a1b";

export const MODEL: Model = "qwen3:4b-instruct-2507-q4_K_M";

const MODELS_WITH_INLINE_THINKING = new Set(["qwen3:4b"]);

const THINK_TAGS = ["<think>", "</think>"];

export interface ParsedModelContent {
  content: string;
  thinking: string;
}

const extractInlineThinking = (content: string): ParsedModelContent => {
  const thinkingEnd = THINK_TAGS.reduce((furthest, tag) => {
    const index = content.lastIndexOf(tag);
    return index === -1 ? furthest : Math.max(furthest, index + tag.length);
  }, -1);

  if (thinkingEnd === -1) {
    return { content, thinking: "" };
  }

  return {
    content: content.slice(thinkingEnd).trim(),
    thinking: content.slice(0, thinkingEnd).trim(),
  };
};

export const parseModelContent = (content: string): ParsedModelContent =>
  MODELS_WITH_INLINE_THINKING.has(MODEL)
    ? extractInlineThinking(content)
    : { content, thinking: "" };
