import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const KNOWLEDGE_BASE_DIR = join(process.cwd(), "knowledge");

const loadKnowledgeBase = (): string => {
  const files = readdirSync(KNOWLEDGE_BASE_DIR)
    .filter((file) => file.endsWith(".md"))
    .sort();

  return files
    .map((file) => {
      const content = readFileSync(
        join(KNOWLEDGE_BASE_DIR, file),
        "utf-8",
      ).trim();

      return `## ${file}\n\n${content}`;
    })
    .join("\n\n---\n\n");
};

export const KNOWLEDGE_BASE = loadKnowledgeBase();
