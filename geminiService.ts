
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { ProjectData, DocumentType, ReferenceFile } from "./types";

// Список типов MIME, которые официально поддерживаются Gemini API для inlineData
const SUPPORTED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
  'image/heif'
];

/**
 * Helper function to retry operations with exponential backoff
 */
async function retryOperation<T>(operation: () => Promise<T>, maxRetries: number = 3, baseDelay: number = 15000): Promise<T> {
  let lastError: any;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      
      // Detailed check for rate limit or quota error
      const errString = JSON.stringify(error);
      const isQuotaError = 
        error?.code === 429 || 
        error?.status === 429 || 
        error?.error?.code === 429 ||
        error?.status === 'RESOURCE_EXHAUSTED' || 
        (error?.message && (error.message.includes('429') || error.message.includes('quota') || error.message.includes('RESOURCE_EXHAUSTED'))) ||
        errString.includes('RESOURCE_EXHAUSTED') ||
        errString.includes('"code":429');

      if (isQuotaError && i < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, i) + (Math.random() * 2000);
        console.warn(`Quota exceeded. Retrying in ${Math.round(delay/1000)}s... (Attempt ${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      throw error; // If not a quota error or retries exhausted, throw immediately
    }
  }
  
  throw lastError;
}

/**
 * Extracts document information (name, code, and types of work) from a PDF or image.
 */
export async function extractDocInfo(fileData: string, mimeType: string): Promise<{ name: string; code: string; workTypes: string[] } | null> {
  if (!SUPPORTED_MIME_TYPES.includes(mimeType)) {
    console.warn(`Тип файла ${mimeType} не поддерживается для прямого анализа AI. Пропускаю...`);
    return null;
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = 'gemini-3-pro-preview';
  
  try {
    const response = await retryOperation<GenerateContentResponse>(() => ai.models.generateContent({
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
    }));
    
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
  // Если это Excel (XLSX), API Gemini его не примет как inlineData. 
  // В данной версии мы ограничиваем анализ только PDF-сметами.
  if (!SUPPORTED_MIME_TYPES.includes(mimeType)) {
    throw new Error(`Тип файла ${mimeType} не поддерживается для AI-анализа. Пожалуйста, используйте PDF версию сметы.`);
  }

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
    const response = await retryOperation<GenerateContentResponse>(() => ai.models.generateContent({
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
    }));
    
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
  
  // Format deadlines for the prompt
  const deadlinesList = project.workType.map(work => {
    const d = project.workDeadlines[work];
    if (d?.start && d?.end) {
      return `- ${work}: с ${d.start} по ${d.end}`;
    }
    return `- ${work}: сроки не указаны`;
  }).join('\n');

  let specificInstruction = "";
  
  // Specific Logic for Schedule Generation
  if (sectionTitle.toLowerCase().includes('график') || sectionTitle.toLowerCase().includes('schedule')) {
     specificInstruction = `
       ВНИМАНИЕ: Это раздел "График производства работ".
       На основе переданных сроков сформируй Markdown-таблицу.
       
       Требования к таблице:
       1. Строки: Наименования работ.
       2. Столбцы: Временные периоды (Месяцы или Недели, в зависимости от общей длительности проекта).
       3. Ячейки: Используй символ "█" или "+" для обозначения периода выполнения работ. Пустые ячейки оставляй пустыми.
       4. Добавь также столбцы "Начало" и "Окончание" с датами.
       
       Пример структуры:
       | Вид работы | Начало | Окончание | Янв | Фев | Мар |
       | --- | --- | --- | --- | --- | --- |
       | Работа 1 | 01.01 | 15.02 | █ | █ | |
     `;
  }

  const promptText = `
      Ты — элитный инженер ПТО. Твоя задача: Составить раздел "${sectionTitle}" для документа "${project.docType}".
      
      ДАННЫЕ ПРОЕКТА:
      ПРОЕКТ: ${project.projectName} | ОБЪЕКТ: ${project.objectName}
      АДРЕС: ${project.location}
      ВИДЫ РАБОТ И СРОКИ:
      ${deadlinesList}
      
      ИНСТРУКЦИЯ ПО ИСПОЛЬЗОВАНИЮ НОРМАТИВНОЙ БАЗЫ:
      К запросу приложены файлы из "Базы знаний" и текущая рабочая документация. 
      ОБЯЗАТЕЛЬНО используй данные из этих файлов для наполнения раздела. 
      Если это раздел "Техника безопасности", опирайся на СП и ГОСТ.
      Если это "Технология работ", детально распиши последовательность для: ${project.workType.join(', ')}.

      ${specificInstruction}

      Стиль: Строго технический, профессиональный инженерный язык, соответствие ГОСТ. Только Markdown (без # заголовков).
    `;

  const parts: any[] = [{ text: promptText }];

  // Фильтруем документы, оставляя только поддерживаемые типы, чтобы избежать ошибки 400
  if (project.workingDocs && project.workingDocs.length > 0) {
    project.workingDocs
      .filter(doc => SUPPORTED_MIME_TYPES.includes(doc.mimeType))
      .forEach(doc => {
        parts.push({ inlineData: { mimeType: doc.mimeType, data: doc.data } });
      });
  }

  if (referenceFiles && referenceFiles.length > 0) {
    referenceFiles
      .filter(ref => SUPPORTED_MIME_TYPES.includes(ref.mimeType))
      .forEach(ref => {
        parts.push({ inlineData: { mimeType: ref.mimeType, data: ref.data } });
      });
  }

  // We rely on retryOperation to handle transient errors.
  // If it fails after retries, we let the error bubble up so the UI can handle the 'error' state properly.
  const response = await retryOperation<GenerateContentResponse>(() => ai.models.generateContent({
    model,
    contents: { parts },
    config: {
      temperature: 0.1,
      topP: 0.95,
      // Reduced thinking budget to save tokens and avoid TPM limits
      thinkingConfig: { thinkingBudget: 4096 }
    },
  }));

  return response.text || "Ошибка: модель вернула пустой ответ.";
}
