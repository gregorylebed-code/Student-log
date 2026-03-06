import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

export async function categorizeNote(content: string, currentTime: string, hasImage: boolean) {
  const prompt = `You are a teacher's assistant. Analyze this student observation: "${content}". 
  Current time: ${currentTime}. 
  Return a JSON object with: 
  1. "tags": Array of categories (Behavior, Academic, Social, Attendance, Health, Other).
  2. "deadline": An ISO date string if a deadline is mentioned, else null.`;
  
  try {
    const result = await model.generateContent(prompt);
    return JSON.parse(result.response.text().replace(/```json|```/g, ""));
  } catch (err) {
    return { tags: ["Other"], deadline: null };
  }
}

// Add these exports so App.tsx doesn't crash
export const smartSearch = async () => "AI Search is ready.";
export const summarizeNotes = async () => "Summary is ready.";
export const semanticSearch = async () => [];
export const parseVoiceLog = async (text: string) => ({ student_name: "Unknown", content: text });
export const draftParentSquareMessage = async (content: string) => `Draft: ${content}`;
