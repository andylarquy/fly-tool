export const MODEL = "qwen3:8b";

const MODELS_WITH_INLINE_THINKING = new Set(["qwen3:4b"]);

const THINK_TAGS = ["<think>", "</think>"];

const stripInlineThinking = (content: string): string => {
  const thinkingEnd = THINK_TAGS.reduce((furthest, tag) => {
    const index = content.lastIndexOf(tag);
    return index === -1 ? furthest : Math.max(furthest, index + tag.length);
  }, -1);

  return thinkingEnd === -1 ? content : content.slice(thinkingEnd).trim();
};

export const parseModelContent = (content: string): string =>
  MODELS_WITH_INLINE_THINKING.has(MODEL) ? stripInlineThinking(content) : content;
