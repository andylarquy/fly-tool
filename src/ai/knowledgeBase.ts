import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const KNOWLEDGE_BASE_DIR = join(process.cwd(), "knowledge");

const knowledgeBaseFiles = readdirSync(KNOWLEDGE_BASE_DIR)
  .filter((file) => file.endsWith(".md"))
  .sort();

const loadKnowledgeBase = (): string =>
  knowledgeBaseFiles
    .map((file) => {
      const content = readFileSync(
        join(KNOWLEDGE_BASE_DIR, file),
        "utf-8",
      ).trim();

      return `## ${file}\n\n${content}`;
    })
    .join("\n\n---\n\n");

export const KNOWLEDGE_BASE = loadKnowledgeBase();
export const KNOWLEDGE_BASE_FILE_COUNT = knowledgeBaseFiles.length;
