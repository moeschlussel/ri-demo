import { GoogleGenAI } from "@google/genai";

let cachedClient: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  if (cachedClient) {
    return cachedClient;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing required environment variable: GEMINI_API_KEY");
  }

  cachedClient = new GoogleGenAI({ apiKey });
  return cachedClient;
}

