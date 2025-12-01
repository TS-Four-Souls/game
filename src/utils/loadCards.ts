import fs from "fs/promises";
import path from "path";

export async function loadCards(dirPath?: string): Promise<any[]> {
  const dir = dirPath
    ? path.resolve(dirPath)
    : path.resolve(process.cwd(), "data/cards");

  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch (err: any) {
    if (err?.code === "ENOENT") {
      console.warn(`Directory not found: ${dir}`);
      return [];
    }
    throw err;
  }

  const cards: any[] = [];
  for (const entry of entries) {
    const filePath = path.join(dir, entry);
    try {
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) continue;

      const content = await fs.readFile(filePath, "utf8");
      if (!content.trim()) continue;

      const parsed = JSON.parse(content);
      cards.push(parsed);
    } catch (err: any) {
      // Skip files that can't be read or parsed, but continue processing others
      console.warn(`Skipping ${entry}: ${err?.message ?? err}`);
    }
  }
  
  return cards;
}

export default loadCards;
