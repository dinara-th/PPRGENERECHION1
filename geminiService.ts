
import { GoogleGenAI, Type } from "@google/genai";
import { ProjectData, DocumentType, ReferenceFile } from "./types";

/**
 * Extracts document information (name, code, and types of work) from a PDF or image.
 */
export async function extractDocInfo(fileData: string, mimeType: string): Promise<{ name: string; code: string; workTypes: string[] } | null> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = 'gemini-3-pro-preview';
  
  try {
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          parts: [
            { inlineData: { data: fileData, mimeType } },
            { text: "Проанализируй этот строительный документ (чертеж или пояснительную записку). Найди полное наименование документации, её шифр (марку) и перечень основных видов работ. Верни ответ строго в формате JSON: {\"name\": \"...\", \"code\": \"...\", \"workTypes\": [\"...\", \"...\"]}." }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 2000 },
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            code: { type: Type.STRING },
            workTypes: { 
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: ["name", "code", "workTypes"]
        }
      }
    });
    
    const text = response.text;
    if (text) {
      return JSON.parse(text);
    }
  } catch (e) {
    console.error("Extraction error:", e);
  }
  return null;
}

/**
 * Specifically analyzes a bill of quantities (estimate) and matches it against the work catalog.
 */
export async function extractWorksFromEstimate(
  fileData: string, 
  mimeType: string, 
  catalog: any
): Promise<string[]> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = 'gemini-3-pro-preview';
  
  const allAvailableWorks: string[] = [];
  Object.values(catalog).forEach((categories: any) => {
    Object.entries(categories).forEach(([type, jobs]) => {
      allAvailableWorks.push(type);
      if (Array.isArray(jobs)) {
        allAvailableWorks.push(...jobs);
      }
    });
  });

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          parts: [
            { inlineData: { data: fileData, mimeType } },
            { text: `Ты инженер-сметчик. Проанализируй сметную ведомость. Сопоставь позиции сметы с нашим каталогом видов работ. Выбери только те названия из каталога, которые реально присутствуют в смете.\n\nКАТАЛОГ:\n${allAvailableWorks.join('\n')}\n\nВерни результат в формате JSON: {"selectedWorks": ["..."]}.` }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 4000 },
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            selectedWorks: { 
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: ["selectedWorks"]
        }
      }
    });
    
    const text = response.text;
    if (text) {
      const parsed = JSON.parse(text);
      return parsed.selectedWorks || [];
    }
  } catch (e) {
    console.error("Estimate extraction error:", e);
    throw e;
  }
  return [];
}

/**
 * Generates professional construction document section content with support for reference knowledge base.
 */
export async function generateSectionContent(
  project: ProjectData,
  sectionTitle: string,
  context: string,
  referenceFiles: ReferenceFile[] = []
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = 'gemini-3-pro-preview';
  
  const deadlinesText = Object.entries(project.workDeadlines)
    .map(([work, deadline]) => `${work}: ${deadline}`)
    .join('; ');

  const promptText = `
      Ты — элитный инженер ПТО. Твоя задача: Составить раздел "${sectionTitle}" для документа "${project.docType}".
      
      ДАННЫЕ ПРОЕКТА:
      ПРОЕКТ: ${project.projectName} | ОБЪЕКТ: ${project.objectName}
      АДРЕС: ${project.location}
      ВИДЫ РАБОТ: ${project.workType.join(', ')}
      СРОКИ: ${deadlinesText}
      
      ИНСТРУКЦИЯ ПО ИСПОЛЬЗОВАНИЮ НОРМАТИВНОЙ БАЗЫ:
      К запросу приложены файлы из "Базы знаний" и текущая рабочая документация. 
      ОБЯЗАТЕЛЬНО используй данные из этих файлов для наполнения раздела. 
      Если это раздел "Техника безопасности", опирайся на СП и ГОСТ.
      Если это "Технология работ", детально распиши последовательность для: ${project.workType.join(', ')}.

      Стиль: Строго технический, профессиональный инженерный язык, соответствие ГОСТ. Только Markdown (без # заголовков).
    `;

  const parts: any[] = [{ text: promptText }];

  if (project.workingDocs && project.workingDocs.length > 0) {
    project.workingDocs.forEach(doc => {
      parts.push({ inlineData: { mimeType: doc.mimeType, data: doc.data } });
    });
  }

  if (referenceFiles && referenceFiles.length > 0) {
    referenceFiles.forEach(ref => {
      parts.push({ inlineData: { mimeType: ref.mimeType, data: ref.data } });
    });
  }

  try {
    const response = await ai.models.generateContent({
      model,
      contents: { parts },
      config: {
        temperature: 0.1,
        topP: 0.95,
        thinkingConfig: { thinkingBudget: 8000 }
      },
    });

    return response.text || "Ошибка: модель вернула пустой ответ.";
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    return `Ошибка генерации: ${error?.message || "Неизвестная ошибка."}`;
  }
}
