
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
            { text: "Найди в этом документе наименование рабочей документации, её шифр и перечень видов строительных работ. Верни ответ строго в формате JSON: {\"name\": \"...\", \"code\": \"...\", \"workTypes\": [\"Вид 1\", \"Вид 2\"]}." }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
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
            { text: `Проанализируй сметную ведомость. Выбери из списка справочника подходящие работы.\n\nСПИСОК ИЗ СПРАВОЧНИКА:\n${allAvailableWorks.join('\n')}\n\nВерни JSON: {"selectedWorks": ["..."]}.` }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
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
      ВИДЫ РАБОТ: ${project.workType.join(', ')}
      СРОКИ: ${deadlinesText}
      
      ИНСТРУКЦИЯ ПО ИСПОЛЬЗОВАНИЮ НОРМАТИВНОЙ БАЗЫ:
      К запросу приложены файлы из "Базы знаний" (ГЭСН, ФЕР, СП). 
      ОБЯЗАТЕЛЬНО используй данные из этих файлов (технологические последовательности, требования к материалам, нормы расхода, требования безопасности) для наполнения раздела. Если данные в файлах противоречат общим знаниям, приоритет имеют данные из загруженных файлов.

      Стиль: Технический, ГОСТ. Только Markdown.
    `;

  const parts: any[] = [{ text: promptText }];

  // Добавляем документы проекта (РД)
  if (project.workingDocs && project.workingDocs.length > 0) {
    project.workingDocs.forEach(doc => {
      parts.push({ inlineData: { mimeType: doc.mimeType, data: doc.data } });
    });
  }

  // Добавляем глобальную базу знаний (RAG контекст)
  if (referenceFiles && referenceFiles.length > 0) {
    referenceFiles.forEach(ref => {
      parts.push({ 
        inlineData: { mimeType: ref.mimeType, data: ref.data },
        // Мы можем добавить текстовое описание для AI, чтобы он понимал, что это за файл
      });
    });
  }

  try {
    const response = await ai.models.generateContent({
      model,
      contents: { parts },
      config: {
        temperature: 0.2, // Меньше креатива, больше точности по документам
        topP: 0.95,
        thinkingConfig: { thinkingBudget: 4000 } // Даем AI подумать над нормативами
      },
    });

    return response.text || "Ошибка: модель вернула пустой ответ.";
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    return `Ошибка генерации: ${error?.message || "Неизвестная ошибка."}`;
  }
}
