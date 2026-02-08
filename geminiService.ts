import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { ProjectData, DocumentType, ReferenceFile, WorkingDoc, TkGroup } from "./types";
import * as XLSX from "xlsx";

// Список типов MIME, которые официально поддерживаются Gemini API для inlineData
// Добавляем Excel типы, которые мы будем конвертировать вручную перед отправкой
const SUPPORTED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
  'image/heif',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel' // .xls
];

const EXCEL_MIME_TYPES = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv'
];

/**
 * Helper to clean Markdown code blocks from JSON string
 */
function cleanJsonString(text: string): string {
  if (!text) return "";
  // Remove ```json ... ``` or ``` ... ``` wrappers
  return text.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
}

/**
 * Helper function to parse Excel/CSV data to string
 */
function parseExcelData(base64Data: string, _mimeType?: string): string {
    try {
        const workbook = XLSX.read(base64Data, { type: 'base64' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        // Convert to CSV as it is token-efficient and structured enough for LLM
        return XLSX.utils.sheet_to_csv(worksheet);
    } catch (e) {
        console.error("Error parsing Excel file:", e);
        return "";
    }
}

/**
 * Helper function to retry operations with exponential backoff
 * Updated to handle 500/RPC errors gracefully and 429 Quota errors aggressively
 */
async function retryOperation<T>(operation: () => Promise<T>, maxRetries: number = 5, baseDelay: number = 5000): Promise<T> {
  let lastError: any;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      
      const errString = JSON.stringify(error);
      const errMsg = error?.message || errString;

      // 1. Check for Region/Permission errors (Non-retryable usually, but we throw clear error)
      const isRegionError = 
        error?.status === 403 || 
        error?.code === 403 ||
        errMsg.includes('403') ||
        errMsg.includes('PERMISSION_DENIED') ||
        errMsg.includes('Region not supported') ||
        errMsg.includes('User location is not supported');

      if (isRegionError) {
        throw new Error("API Gemini недоступно в вашем текущем регионе (Ошибка 403). Пожалуйста, включите VPN (США/Европа) или смените регион.");
      }

      // 2. Check for Rate Limit / Quota errors
      const isQuotaError = 
        error?.code === 429 || 
        error?.status === 429 || 
        error?.status === 'RESOURCE_EXHAUSTED' ||
        errMsg.includes('429') ||
        errMsg.includes('quota') ||
        errMsg.includes('RESOURCE_EXHAUSTED');

      // 3. Check for Network / Server errors (Transient)
      const isServerError = 
        error?.code === 500 ||
        error?.status === 500 ||
        error?.status === 'UNKNOWN' ||
        error?.status === 'INTERNAL' ||
        errMsg.includes('500') ||
        errMsg.includes('UNKNOWN') ||
        errMsg.includes('Rpc failed') ||
        errMsg.includes('xhr error') ||
        errMsg.includes('fetch failed') ||
        errMsg.includes('overloaded');

      if ((isQuotaError || isServerError) && i < maxRetries - 1) {
        // Calculate delay with exponential backoff for quotas
        let delay = baseDelay;
        
        if (isQuotaError) {
             // Exponential: 5s, 10s, 20s, 40s... to clear RPM limits
             delay = baseDelay * Math.pow(2, i) + (Math.random() * 2000);
        } else {
             // Linear/Faster for server glitches
             delay = 2000 * (i + 1) + (Math.random() * 1000);
        }

        console.warn(`Attempt ${i + 1} failed (${isQuotaError ? 'Quota 429' : 'Server Error'}). Retrying in ${Math.round(delay/1000)}s...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // If error is not retryable or retries exhausted, throw it
      throw error;
    }
  }
  
  throw lastError;
}

/**
 * Extracts document information (name, code, project details and types of work) from a PDF or image.
 */
export async function extractDocInfo(fileData: string, mimeType: string): Promise<{ name: string; code: string; workTypes: string[]; projectName?: string; objectName?: string; location?: string; client?: string; contractor?: string } | null> {
  if (!SUPPORTED_MIME_TYPES.includes(mimeType)) {
    console.warn(`Тип файла ${mimeType} не поддерживается для прямого анализа AI. Пропускаю...`);
    return null;
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = 'gemini-3-pro-preview';

  let parts: any[] = [];

  if (EXCEL_MIME_TYPES.includes(mimeType)) {
    const csvContent = parseExcelData(fileData, mimeType);
    parts = [
        { text: "Вот содержимое документа (преобразовано из Excel/CSV):" },
        { text: csvContent }
    ];
  } else {
    parts = [
        { inlineData: { data: fileData, mimeType } }
    ];
  }

  parts.push({ text: "Проанализируй этот строительный документ (чертеж или РД). Извлеки: 1. Шифр документа. 2. Полное название документа. 3. Название проекта. 4. Название объекта строительства. 5. Адрес объекта. 6. Заказчик (организация). 7. Подрядчик/Генподрядчик (организация). 8. Перечень основных видов работ. Верни JSON." });
  
  try {
    const response = await retryOperation<GenerateContentResponse>(() => ai.models.generateContent({
      model,
      contents: [ { parts } ],
      config: {
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 2000 },
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING, description: "Название самого документа (листа)" },
            code: { type: Type.STRING, description: "Шифр (марка) чертежа" },
            projectName: { type: Type.STRING, description: "Общее название проекта" },
            objectName: { type: Type.STRING, description: "Наименование объекта строительства" },
            location: { type: Type.STRING, description: "Адрес объекта" },
            client: { type: Type.STRING, description: "Наименование Заказчика" },
            contractor: { type: Type.STRING, description: "Наименование Подрядчика" },
            workTypes: { 
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: ["name", "code", "workTypes"]
        }
      }
    }), 5, 8000); // 5 retries, start with 8s delay
    
    const text = response.text;
    if (text) {
      return JSON.parse(cleanJsonString(text));
    }
  } catch (e: any) {
    console.error("Extraction error:", e);
    // Rethrow known errors so UI can handle them
    if (e?.message?.includes("429") || e?.message?.includes("403") || e?.message?.includes("VPN")) throw e;
  }
  return null;
}

/**
 * specifically analyzes POS (Project Organization of Construction)
 * NOTE: Per request, POS is NOT used for work selection, only metadata.
 */
export async function extractPosData(fileData: string, mimeType: string): Promise<{ projectName?: string; objectName?: string; location?: string } | null> {
  if (!SUPPORTED_MIME_TYPES.includes(mimeType)) return null;

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = 'gemini-3-pro-preview';

  let parts: any[] = [];
  if (EXCEL_MIME_TYPES.includes(mimeType)) {
      const csvContent = parseExcelData(fileData, mimeType);
      parts = [
          { text: "Вот содержимое ПОС (из Excel/CSV):" },
          { text: csvContent }
      ];
  } else {
      parts = [{ inlineData: { data: fileData, mimeType } }];
  }
  
  parts.push({ text: "Ты эксперт ПТО. Проанализируй файл ПОС (Проект Организации Строительства). Извлеки только общие данные: Название проекта, Адрес объекта, Наименование объекта строительства. Список работ извлекать НЕ НУЖНО. Верни JSON." });

  try {
    const response = await retryOperation<GenerateContentResponse>(() => ai.models.generateContent({
      model,
      contents: [ { parts } ],
      config: {
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 2000 },
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            projectName: { type: Type.STRING },
            objectName: { type: Type.STRING },
            location: { type: Type.STRING }
          },
          required: ["projectName", "objectName"]
        }
      }
    }), 5, 8000);

    const text = response.text;
    if (text) return JSON.parse(cleanJsonString(text));
  } catch (e: any) {
    console.error("POS Extraction error:", e);
    if (e?.message?.includes("429") || e?.message?.includes("403") || e?.message?.includes("VPN")) throw e;
  }
  return null;
}

/**
 * Specifically analyzes a bill of quantities (estimate) and matches it against the work catalog.
 * Also extracts project metadata including Client and Contractor.
 */
export async function extractWorksFromEstimate(
  fileData: string, 
  mimeType: string, 
  catalog: any
): Promise<{ selectedWorks: string[]; projectName?: string; objectName?: string; location?: string; client?: string; contractor?: string } | null> {
  if (!SUPPORTED_MIME_TYPES.includes(mimeType)) {
    throw new Error(`Тип файла ${mimeType} не поддерживается для AI-анализа. Пожалуйста, используйте PDF версию сметы или Excel.`);
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

  let parts: any[] = [];
  if (EXCEL_MIME_TYPES.includes(mimeType)) {
      const csvContent = parseExcelData(fileData, mimeType);
      parts = [
          { text: "Вот содержимое сметы (из Excel/CSV). Внимательно изучи колонки с кодами расценок." },
          { text: csvContent }
      ];
  } else {
      parts = [{ inlineData: { data: fileData, mimeType } }];
  }

  parts.push({ text: `Ты профессиональный инженер-сметчик.
            Твоя цель: Детально проанализировать смету и извлечь все строительные работы.
            
            КРИТЕРИЙ ПОИСКА РАБОТ:
            Любая строка сметы, содержащая код расценки из сборников ГЭСН, ФЕР, ТЕР (например, "ГЭСН 01-01...", "ФЕР06-...", "ТЕР..."), ЯВЛЯЕТСЯ РАБОТОЙ.
            Обязательно найди их все.
            
            ЗАДАЧА:
            1. Извлеки метаданные: Проект, Объект, Адрес, Заказчик, Подрядчик.
            2. Найди ВСЕ позиции с кодами ГЭСН/ФЕР/ТЕР/ЕНиР.
            3. Извлеки их полные наименования из колонки "Наименование работ и затрат".
            4. Приведи названия к чистому, техническому виду (удали лишние объемы, цены, но сохрани марку бетона, группу грунта и т.д., если это важно для технологии).
            5. СРАВНЕНИЕ С КАТАЛОГОМ:
               - Если извлеченная работа явно соответствует позиции из нашего каталога (список ниже) — верни название из каталога.
               - Если работы нет в каталоге, но она ЕСТЬ В СМЕТЕ с кодом ГЭСН — ВЕРНИ ЕЁ КАК ЕСТЬ (в очищенном виде). Не отбрасывай работы, которых нет в каталоге!
            
            СПРАВОЧНЫЙ КАТАЛОГ (для унификации, но не для ограничения):
            ${allAvailableWorks.join('\n')}
            
            Верни результат в формате JSON.` });

  try {
    const response = await retryOperation<GenerateContentResponse>(() => ai.models.generateContent({
      model,
      contents: [ { parts } ],
      config: {
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 4000 },
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            projectName: { type: Type.STRING },
            objectName: { type: Type.STRING },
            location: { type: Type.STRING },
            client: { type: Type.STRING, description: "Наименование Заказчика" },
            contractor: { type: Type.STRING, description: "Наименование Подрядчика" },
            selectedWorks: { 
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: ["selectedWorks"]
        }
      }
    }), 5, 8000);
    
    const text = response.text;
    if (text) {
      return JSON.parse(cleanJsonString(text));
    }
  } catch (e) {
    console.error("Estimate extraction error:", e);
    throw e;
  }
  return null;
}

/**
 * Analyzes a list of works and groups them into logical Technological Maps (TK).
 */
export async function suggestWorkGrouping(works: string[]): Promise<TkGroup[]> {
    if (!works || works.length === 0) return [];

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const model = 'gemini-3-pro-preview';

    const prompt = `
        Ты главный инженер ПТО. У тебя есть список строительных работ.
        Твоя задача: Оптимизировать количество Технологических Карт (ТК).
        
        ОБЪЕДИНИ однородные работы в общие группы.
        
        Примеры:
        - "Прокладка труб д50", "Прокладка труб д100", "Монтаж фасонных частей" -> Группа: "Монтаж технологических трубопроводов".
        - "Грунтовка стен", "Шпатлевка стен", "Окраска стен" -> Группа: "Отделочные работы (стены)".
        - "Разработка грунта", "Обратная засыпка" -> Группа: "Земляные работы".
        
        СПИСОК РАБОТ:
        ${JSON.stringify(works)}
        
        Верни JSON массив объектов. Каждый объект - это Группа.
    `;

    try {
        const response = await retryOperation<GenerateContentResponse>(() => ai.models.generateContent({
            model,
            contents: [{ text: prompt }],
            config: {
                responseMimeType: "application/json",
                thinkingConfig: { thinkingBudget: 2000 },
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            title: { type: Type.STRING, description: "Название общей ТК (Группы)" },
                            works: { 
                                type: Type.ARRAY, 
                                items: { type: Type.STRING },
                                description: "Список работ из исходного списка, входящих в эту группу" 
                            }
                        },
                        required: ["title", "works"]
                    }
                }
            }
        }), 3, 5000);

        const text = response.text;
        if (text) {
            const rawGroups = JSON.parse(cleanJsonString(text));
            // Add unique IDs to groups
            return rawGroups.map((g: any, index: number) => ({
                id: `group-${Date.now()}-${index}`,
                title: g.title,
                works: g.works
            }));
        }
    } catch (e) {
        console.error("Grouping error:", e);
        throw e;
    }
    return [];
}

/**
 * Validates consistency between uploaded documents.
 */
export async function validateProjectDocs(
  rdDoc: WorkingDoc | undefined,
  estimateDoc: WorkingDoc | undefined,
  posDoc: WorkingDoc | undefined
): Promise<{ issues: string[], isConsistent: boolean }> {
  
  if (!rdDoc && !estimateDoc && !posDoc) {
     return { issues: ["Нет загруженных документов для проверки."], isConsistent: false };
  }

  const parts: any[] = [];
  let docCount = 0;

  if (rdDoc && SUPPORTED_MIME_TYPES.includes(rdDoc.mimeType)) {
    if (EXCEL_MIME_TYPES.includes(rdDoc.mimeType)) {
        parts.push({ text: `Документ 1: РД (${rdDoc.name}) - Контент из Excel:` });
        parts.push({ text: parseExcelData(rdDoc.data, rdDoc.mimeType) });
    } else {
        parts.push({ inlineData: { mimeType: rdDoc.mimeType, data: rdDoc.data } });
        parts.push({ text: `Документ 1: РД (${rdDoc.name})` });
    }
    docCount++;
  }
  if (estimateDoc && SUPPORTED_MIME_TYPES.includes(estimateDoc.mimeType)) {
    if (EXCEL_MIME_TYPES.includes(estimateDoc.mimeType)) {
        parts.push({ text: `Документ 2: Смета (${estimateDoc.name}) - Контент из Excel:` });
        parts.push({ text: parseExcelData(estimateDoc.data, estimateDoc.mimeType) });
    } else {
        parts.push({ inlineData: { mimeType: estimateDoc.mimeType, data: estimateDoc.data } });
        parts.push({ text: `Документ 2: Смета (${estimateDoc.name})` });
    }
    docCount++;
  }
  if (posDoc && SUPPORTED_MIME_TYPES.includes(posDoc.mimeType)) {
    if (EXCEL_MIME_TYPES.includes(posDoc.mimeType)) {
        parts.push({ text: `Документ 3: ПОС (${posDoc.name}) - Контент из Excel:` });
        parts.push({ text: parseExcelData(posDoc.data, posDoc.mimeType) });
    } else {
        parts.push({ inlineData: { mimeType: posDoc.mimeType, data: posDoc.data } });
        parts.push({ text: `Документ 3: ПОС (${posDoc.name})` });
    }
    docCount++;
  }

  parts.push({ text: `
    Ты эксперт по анализу строительной документации.
    Твоя задача: Провести перекрестную проверку загруженных документов на непротиворечивость исходных данных.
    
    Проверь следующие параметры между документами:
    1. Название проекта / Стройки.
    2. Наименование объекта (корпус, здание).
    3. Адрес строительства.
    4. Заказчик.
    5. Подрядчик.
    
    Если документы относятся к разным проектам или содержат противоречивую информацию (например, разный адрес или разные заказчики), сообщи об этом как о проблеме.
    Если какой-то документ кажется нерелевантным (другой год, другой город), отметь это.
    Также укажи, если какие-то обязательные поля (Заказчик, Подрядчик) отсутствуют во всех документах.
    
    Верни результат в формате JSON:
    {
      "isConsistent": boolean, // true если критических противоречий нет
      "issues": string[] // список найденных несоответствий, предупреждений или ошибок на русском языке
    }
  `});

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = 'gemini-3-pro-preview';

  try {
    const response = await retryOperation<GenerateContentResponse>(() => ai.models.generateContent({
      model,
      contents: [{ parts }],
      config: {
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 2000 },
        responseSchema: {
            type: Type.OBJECT,
            properties: {
                isConsistent: { type: Type.BOOLEAN },
                issues: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["isConsistent", "issues"]
        }
      }
    }), 3, 10000);

    const text = response.text;
    if (text) return JSON.parse(cleanJsonString(text));
  } catch (e: any) {
    console.error("Validation error:", e);
    // Return specific error message in issues so UI displays it
    if (e.message.includes("VPN") || e.message.includes("403")) {
         return { issues: ["Ошибка проверки: API недоступно в регионе (403). Включите VPN."], isConsistent: false };
    }
    if (e.message.includes("429")) {
         return { issues: ["Ошибка проверки: Превышен лимит квоты (429). Повторите позже."], isConsistent: false };
    }
    return { issues: ["Ошибка при анализе документов. Сбой сети или API."], isConsistent: false };
  }
  
  return { issues: [], isConsistent: true };
}

/**
 * Generates professional construction document section content with support for reference knowledge base and Google Search.
 */
export async function generateSectionContent(
  project: ProjectData,
  sectionTitle: string,
  context: string,
  referenceFiles: ReferenceFile[],
  groupWorks?: string[] // Optional list of works if this is a Group TK
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
  let gesnPromptInstruction = "";
  let estimatePromptInstruction = "";
  let groupingInstruction = "";

  // Logic for Grouped TKs
  if (groupWorks && groupWorks.length > 0) {
      groupingInstruction = `
      ВНИМАНИЕ: Это СВОДНАЯ Технологическая карта.
      Название ТК: "${sectionTitle}".
      Она должна охватывать следующие конкретные виды работ из сметы:
      ${groupWorks.map(w => `- ${w}`).join('\n')}
      
      В тексте раздела обязательно учти специфику КАЖДОГО из перечисленных видов работ.
      Например, если в группу входят трубы разных диаметров или разные слои покрытия, опиши технологию для всех вариантов.
      `;
  }
  
  // Logic for GESN database usage
  if (project.gesnDocs && project.gesnDocs.length > 0) {
      gesnPromptInstruction = `
      ВАЖНО: К проекту приложена БАЗА ДАННЫХ ГЭСН/ФЕР (в количестве ${project.gesnDocs.length} файл(ов)).
      ПРИОРИТЕТНАЯ ЗАДАЧА:
      1. Найди в этих файлах соответствующие расценки для видов работ: ${groupWorks ? groupWorks.join(', ') : project.workType.join(', ')}.
      2. Извлеки оттуда нормативную трудоемкость (чел-час) и состав машин/механизмов.
      3. Используй эти ТОЧНЫЕ данные при формировании раздела ресурсов и технологии.
      4. Укажи коды найденных расценок (например, ГЭСН 01-01-001-01).
      `;
  }

  // Logic for Estimate Priority
  if (project.estimateDoc) {
      estimatePromptInstruction = `
      КРИТИЧЕСКИ ВАЖНО: К проекту приложена СМЕТА.
      Для разделов, касающихся Ресурсов, Механизмов, Техники и Трудоемкости, данные из СМЕТЫ являются ПРИОРИТЕТНЫМИ и ГЛАВНЫМИ.
      Игнорируй данные из других документов, если они противоречат смете в части состава машин и трудозатрат.
      Используй точные наименования механизмов из сметы.
      `;
  }

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
      ЗАКАЗЧИК: ${project.client} | ПОДРЯДЧИК: ${project.contractor}
      ВИДЫ РАБОТ И СРОКИ:
      ${deadlinesList}
      
      ИСХОДНЫЕ ДАННЫЕ И ИЕРАРХИЯ ДОКУМЕНТОВ:
      1. СМЕТА (если загружена) — КЛЮЧЕВОЙ ДОКУМЕНТ для определения видов работ, трудоемкости и используемых механизмов.
      2. ПОС (Проект Организации Строительства) — основной документ для технологии, сроков и общих схем организации.
      3. Рабочая документация (РД) — для геометрических параметров и детализации.
      4. База знаний (ГОСТ, СП) — для нормативных ссылок.
      5. Используй Поиск Google для проверки актуальных версий СП/ГОСТ и технических характеристик оборудования (краны, экскаваторы), если они упоминаются.
      
      ${estimatePromptInstruction}
      ${gesnPromptInstruction}
      ${groupingInstruction}

      ИНСТРУКЦИЯ ПО НАПОЛНЕНИЮ:
      Если это раздел "Техника безопасности", опирайся на СП и ГОСТ.
      Если это "Технология работ", детально распиши последовательность для: ${groupWorks ? groupWorks.join(', ') : project.workType.join(', ')}.

      ${specificInstruction}

      Стиль: Строго технический, профессиональный инженерный язык, соответствие ГОСТ. Только Markdown (без # заголовков).
    `;

  const parts: any[] = [{ text: promptText }];

  // Добавляем СМЕТУ в контекст как приоритетный документ
  if (project.estimateDoc && SUPPORTED_MIME_TYPES.includes(project.estimateDoc.mimeType)) {
    if (EXCEL_MIME_TYPES.includes(project.estimateDoc.mimeType)) {
        parts.push({ text: "ВНИМАНИЕ: ЭТО ФАЙЛ СМЕТЫ (из Excel). ОН ЯВЛЯЕТСЯ КЛЮЧЕВЫМ ДЛЯ ОПРЕДЕЛЕНИЯ ТРУДОЕМКОСТИ И МЕХАНИЗМОВ." });
        parts.push({ text: parseExcelData(project.estimateDoc.data, project.estimateDoc.mimeType) });
    } else {
        parts.push({ 
            inlineData: { mimeType: project.estimateDoc.mimeType, data: project.estimateDoc.data } 
        });
        parts.push({ text: "ВНИМАНИЕ: ЭТО ФАЙЛ СМЕТЫ. ОН ЯВЛЯЕТСЯ КЛЮЧЕВЫМ ДЛЯ ОПРЕДЕЛЕНИЯ ТРУДОЕМКОСТИ И МЕХАНИЗМОВ." });
    }
  }

  // Добавляем ПОС в контекст
  if (project.posDoc && SUPPORTED_MIME_TYPES.includes(project.posDoc.mimeType)) {
    if (EXCEL_MIME_TYPES.includes(project.posDoc.mimeType)) {
        parts.push({ text: "ВНИМАНИЕ: Это файл ПОС (из Excel). Используй его решения приоритетно для сроков и организации." });
        parts.push({ text: parseExcelData(project.posDoc.data, project.posDoc.mimeType) });
    } else {
        parts.push({ 
            inlineData: { mimeType: project.posDoc.mimeType, data: project.posDoc.data } 
        });
        parts.push({ text: "ВНИМАНИЕ: Это файл ПОС. Используй его решения приоритетно для сроков и организации." });
    }
  }
  
  // Добавляем файлы базы ГЭСН в контекст
  if (project.gesnDocs && project.gesnDocs.length > 0) {
      project.gesnDocs.forEach(doc => {
          if (SUPPORTED_MIME_TYPES.includes(doc.mimeType) || doc.mimeType.includes('text') || doc.mimeType.includes('json') || doc.mimeType.includes('csv') || doc.mimeType.includes('pdf')) {
               if (EXCEL_MIME_TYPES.includes(doc.mimeType)) {
                   parts.push({ text: `ЭТО ФАЙЛ БАЗЫ ДАННЫХ (ГЭСН/ФЕР из Excel): ${doc.name}. ИСПОЛЬЗУЙ ЕГО ДЛЯ ПОДБОРА РАСЦЕНОК.` });
                   parts.push({ text: parseExcelData(doc.data, doc.mimeType) });
               } else {
                   parts.push({
                      inlineData: { mimeType: doc.mimeType, data: doc.data }
                  });
                  parts.push({ text: `ЭТО ФАЙЛ БАЗЫ ДАННЫХ (ГЭСН/ФЕР): ${doc.name}. ИСПОЛЬЗУЙ ЕГО ДЛЯ ПОДБОРА РАСЦЕНОК.` });
               }
          }
      });
  }

  // Фильтруем документы, оставляя только поддерживаемые типы
  if (project.workingDocs && project.workingDocs.length > 0) {
    project.workingDocs
      .filter(doc => SUPPORTED_MIME_TYPES.includes(doc.mimeType))
      .forEach(doc => {
        if (EXCEL_MIME_TYPES.includes(doc.mimeType)) {
            // Usually RD are PDFs, but if Excel is passed, treat as text
            parts.push({ text: `Документ РД (${doc.name}) содержимое:` });
            parts.push({ text: parseExcelData(doc.data, doc.mimeType) });
        } else {
            parts.push({ inlineData: { mimeType: doc.mimeType, data: doc.data } });
        }
      });
  }

  if (referenceFiles && referenceFiles.length > 0) {
    referenceFiles
      .filter(ref => SUPPORTED_MIME_TYPES.includes(ref.mimeType))
      .forEach(ref => {
        if (EXCEL_MIME_TYPES.includes(ref.mimeType)) {
             parts.push({ text: `Справочный файл (${ref.name}):` });
             parts.push({ text: parseExcelData(ref.data, ref.mimeType) });
        } else {
             parts.push({ inlineData: { mimeType: ref.mimeType, data: ref.data } });
        }
      });
  }

  // Use higher maxRetries for generation as it's critical
  const response = await retryOperation<GenerateContentResponse>(() => ai.models.generateContent({
    model,
    contents: [{ parts }],
    config: {
      temperature: 0.1,
      topP: 0.95,
      // Enable Google Search to find real equipment specs and norms
      tools: [{ googleSearch: {} }],
      // Reduced thinking budget to save tokens and avoid TPM limits
      thinkingConfig: { thinkingBudget: 2048 }
    },
  }), 5, 8000);

  let content = response.text || "Ошибка: модель вернула пустой ответ. Попробуйте сгенерировать раздел повторно.";

  // Extract grounding chunks and append to text as a reference list
  const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (groundingChunks && groundingChunks.length > 0) {
    const references: string[] = [];
    groundingChunks.forEach((chunk: any) => {
        if (chunk.web && chunk.web.uri && chunk.web.title) {
            references.push(`- [${chunk.web.title}](${chunk.web.uri})`);
        }
    });

    if (references.length > 0) {
        content += "\n\n**Использованные источники (Web):**\n" + references.join("\n");
    }
  }

  return content;
}