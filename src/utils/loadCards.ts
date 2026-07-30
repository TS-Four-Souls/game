import fs from "fs/promises";
import path from "path";
import { type GenericCardType } from "../types/cardTypes.ts";
const FORBIDDEN_PREFIXES = ["r-"]

function prefixIsAccepted(slug:string){
  for(const prefix of FORBIDDEN_PREFIXES)
    if(slug.startsWith(prefix))
      return false;
  return true;
}

export async function loadCards(dirPath: string | undefined): Promise<GenericCardType[]> {
  const dir = dirPath
    ? path.resolve(dirPath)
    : path.resolve(process.cwd(), "/four-souls-game/data/cards");

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

  const cards: GenericCardType[] = [];
  for (const entry of entries.toSorted()) {
    // only consider .json files
    if (!entry.toLowerCase().endsWith(".json")) continue;
    if(!prefixIsAccepted(entry)) continue;
    const filePath = path.join(dir, entry);
    try {
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) continue;

      const content = await fs.readFile(filePath, "utf8");
      if (!content.trim()) continue;

      const parsed: GenericCardType = JSON.parse(content);
      cards.push(parsed);
    } catch (err: any) {
      // Skip files that can't be read or parsed, but continue processing others
      console.warn(`Skipping ${entry}: ${err?.message ?? err}`);
    }
  }
  
  return cards;
}

export default loadCards;
