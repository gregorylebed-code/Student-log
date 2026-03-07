import { GoogleGenAI, Type } from "@google/genai";
import { Note } from "../types";

let aiInstance: GoogleGenAI | null = null;

function getAi() {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'undefined') {
      console.warn("GEMINI_API_KEY is not defined. AI features will not work.");
      // Return a mock or handle gracefully. For now, we'll still try to initialize 
      // but we should ideally guard all calls.
    }
    aiInstance = new GoogleGenAI({ apiKey: apiKey || "" });
  }
  return aiInstance;
}

export async function categorizeNote(content: string, currentTime: string, hasImage: any) {
  try {
    const ai = getAi();
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Current Time: ${currentTime}\nNote Content: ${content}\n${hasImage ? "Note has an attached image." : ""}\nCategorize this student observation and extract a deadline if mentioned.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            tags: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "List of categories: Behavior, Academic, Social, Attendance, Health, Other"
            },
            deadline: {
              type: Type.STRING,
              description: "ISO date string if a deadline is mentioned, otherwise null"
            }
          },
          required: ["tags"]
        }
      }
    });

    const result = JSON.parse(response.text || '{"tags": ["Other"]}');
    if (result.deadline === 'null') result.deadline = null;
    return result;
  } catch (e) {
    console.error("Categorization failed:", e);
    return { tags: ["Other"], deadline: null };
  }
}

export async function smartSearch(query: string, notes: Note[]) {
  const ai = getAi();
  const context = notes.map(n => `[${n.student_name} - ${n.created_at}]: ${n.content}`).join("\n");
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Context:\n${context}\n\nQuestion: ${query}\nAnswer the question based on the student logs provided. Be concise.`,
  });
  return response.text;
}

export async function summarizeNotes(notes: Note[]) {
  const ai = getAi();
  const context = notes.map(n => n.content).join("\n");
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Summarize the following student observations:\n${context}\nProvide key takeaways and patterns.`,
  });
  return response.text;
}

export async function semanticSearch(query: string, notes: Note[]) {
  const ai = getAi();
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Query: ${query}\nNotes:\n${JSON.stringify(notes.map(n => ({ id: n.id, content: n.content, student: n.student_name })))}\nReturn the IDs of the notes that are semantically relevant to the query.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: { type: Type.STRING }
      }
    }
  });
  return JSON.parse(response.text || "[]");
}

export async function parseVoiceLog(transcript: string) {
  const ai = getAi();
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Transcript: ${transcript}\nExtract the student name and the actual observation content from this voice log.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          student_name: { type: Type.STRING },
          content: { type: Type.STRING }
        },
        required: ["student_name", "content"]
      }
    }
  });
  return JSON.parse(response.text || "{}");
}

export async function draftParentSquareMessage(noteContent: string, studentName: string) {
  const ai = getAi();
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Student: ${studentName}\nNote: ${noteContent}\n\nDraft a polite, professional, and encouraging message for a parent based on this observation. The message should be suitable for ParentSquare.`,
  });
  return response.text;
}
