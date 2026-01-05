
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  FileText, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  HardHat,
  Printer,
  ChevronRight,
  Search,
  ChevronDown,
  Upload,
  X,
  FileCheck,
  BookOpen,
  Trash2,
  Plus,
  PlusCircle,
  Briefcase,
  Save,
  History,
  Layout,
  Zap,
  PenLine,
  FileSignature,
  ChevronUp,
  Settings,
  Database,
  Layers,
  FileDown,
  Info,
  Sparkles,
  UserPlus,
  Calendar,
  ChevronLeft,
  Filter,
  Calculator,
  ShieldAlert,
  ShieldCheck,
  ArrowRightLeft,
  Building2,
  Building,
  MapPin,
  UserCog,
  Edit2,
  ListPlus,
  MoreVertical,
  ClipboardList,
  Paperclip,
  BookMarked,
  Library,
  Scissors,
  PlayCircle,
  RefreshCw,
  Sparkle,
  ListOrdered,
  ExternalLink,
  CreditCard,
  Square,
  Map
} from 'lucide-react';
import { ProjectData, DocumentType, DocSection, WorkingDoc, SavedProject, ConstructionObject, ClientEntry, ContractorEntry, ReferenceFile } from './types';
import { generateSectionContent, extractDocInfo, extractWorksFromEstimate, extractPosData } from './geminiService';

interface WorkCatalogNode {
  [category: string]: {
    [workType: string]: string[];
  }
}

interface HierarchicalDict {
  objects: ConstructionObject[];
  clients: ClientEntry[];
  contractors: ContractorEntry[];
  referenceLibrary: ReferenceFile[];
  workCatalog: WorkCatalogNode;
}

const INITIAL_WORK_CATALOG: WorkCatalogNode = {
  "Земляные работы (ФЕР-01)": {
    "Разработка грунта механизированная": [
      "Разработка грунта экскаваторами в отвал (1-3 группа)",
      "Разработка грунта экскаваторами с погрузкой в самосвалы",
      "Разработка траншей роторными экскаваторами",
      "Рыхление мерзлого грунта клин-бабой",
      "Планировка площадей механизированным способом"
    ],
    "Разработка грунта вручную": [
      "Разработка грунта в траншеях и котлованах вручную",
      "Доработка дна и стенок траншей после мех. разработки",
      "Копка ям под опоры и столбы"
    ]
  },
  "Бетонные и ЖБ конструкции (ФЕР-06/07)": {
    "Монолитные работы (ФЕР-06)": [
      "Устройство монолитных фундаментных плит",
      "Бетонирование монолитных колонн и пилонов",
      "Устройство монолитных перекрытий",
      "Вязка арматурных каркасов и монтаж сеток"
    ]
  }
};

const INITIAL_HIERARCHICAL_DICT: HierarchicalDict = {
  objects: [
    { id: '1', name: 'ЖК "Меридиан"', address: 'г. Москва, ул. Ленина, д. 10' },
    { id: '2', name: 'Индустриальный парк "Технополис"', address: 'Московская обл., г. Одинцово, пр-д Мира, 4' }
  ],
  clients: [
    { id: '1', name: 'ООО "Газпром Инвест"', legalAddress: 'г. Санкт-Петербург, пр. Лахтинский, д. 2', chiefEngineer: 'Иванов И.И.' }
  ],
  contractors: [
    { id: '1', name: 'АО "СтройТрансНефтеГаз"', legalAddress: 'г. Москва, ул. Арбат, д. 1', developer: 'Сидоров С.С.' }
  ],
  referenceLibrary: [],
  workCatalog: INITIAL_WORK_CATALOG
};

const PPR_SECTIONS_TEMPLATE: DocSection[] = [
  { id: 'ppr-1', title: 'Общие сведения', content: '', status: 'idle' },
  { id: 'ppr-2', title: 'Подготовительные мероприятия', content: '', status: 'idle' },
  { id: 'ppr-3', title: 'Организация работ на объекте', content: '', status: 'idle' },
  { id: 'ppr-4', title: 'Потребность в ресурсах (общая)', content: '', status: 'idle' },
  { id: 'ppr-5', title: 'Контроль качества', content: '', status: 'idle' },
  { id: 'ppr-6', title: 'Охрана труда и ТБ', content: '', status: 'idle' },
  { id: 'ppr-7', title: 'Экология и Пожарная безопасность', content: '', status: 'idle' },
  { id: 'ppr-8', title: 'График производства работ', content: '', status: 'idle' },
];

const TK_SECTIONS_TEMPLATE: DocSection[] = [
  { id: 'tk-1', title: 'Область применения', content: '', status: 'idle' },
  { id: 'tk-2', title: 'Технология выполнения работ', content: '', status: 'idle' },
  { id: 'tk-3', title: 'Требования к качеству', content: '', status: 'idle' },
  { id: 'tk-4', title: 'Материально-технические ресурсы', content: '', status: 'idle' },
  { id: 'tk-5', title: 'Техника безопасности', content: '', status: 'idle' },
];

const INITIAL_PROJECT: ProjectData = {
  id: '',
  version: 1,
  docType: DocumentType.PPR,
  projectName: '',
  objectName: '',
  client: '',
  contractor: '',
  location: '',
  workType: [],
  workDeadlines: {},
  workingDocName: '',
  workingDocCode: 'РД ППР', // Set default cipher
  roleDeveloper: '',
  roleClientChiefEngineer: '',
  roleAuthorSupervision: '',
  date: new Date().toISOString().split('T')[0],
  tkMap: {},
  workingDocs: [],
  aiWorksFromEstimate: [],
  aiWorksFromDocs: [],
};

// --- Advanced Pagination Engine (Queue Based) ---
const splitContentIntoPages = (content: string, charsPerPage: number = 2500): string[] => {
  if (!content) return [""];
  
  const pages: string[] = [];
  // Используем очередь строк. Если строку нужно разбить, остаток возвращается в начало очереди.
  const linesQueue = content.split('\n');
  
  let currentPage = "";
  let currentLen = 0;

  // Настройка "веса" элементов (в символах)
  const COST_NEWLINE = 20; 
  const COST_HEADER_BONUS = 150; // Заголовки занимают больше места
  const COST_TABLE_ROW_BONUS = 50; // Таблицы требуют отступов
  const COST_LIST_BONUS = 30; // Списки
  const MIN_SPACE_TO_FILL = 150; // Минимальное место, которое стоит заполнять (иначе перенос)

  while (linesQueue.length > 0) {
    const line = linesQueue.shift()!; // Берем первую строку
    const trimmed = line.trim();
    
    // Рассчитываем стоимость строки
    let lineCost = line.length + COST_NEWLINE;
    let isStructure = false;
    
    // Проверка на структурные элементы (их лучше не рвать)
    if (trimmed.startsWith('#')) { lineCost += COST_HEADER_BONUS; isStructure = true; }
    else if (trimmed.startsWith('|')) { lineCost += COST_TABLE_ROW_BONUS; isStructure = true; }
    else if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.match(/^\d+\./)) { lineCost += COST_LIST_BONUS; isStructure = true; }

    // 1. Если влезает целиком - добавляем
    if (currentLen + lineCost <= charsPerPage) {
       currentPage += (currentPage ? "\n" : "") + line;
       currentLen += lineCost;
       continue;
    }

    // 2. Не влезает. Считаем остаток места.
    const spaceLeft = charsPerPage - currentLen;

    // Если места совсем мало (меньше минимума), то нет смысла пытаться впихнуть кусок.
    // Просто переносим на новую страницу.
    if (spaceLeft < MIN_SPACE_TO_FILL) {
       pages.push(currentPage);
       currentPage = "";
       currentLen = 0;
       linesQueue.unshift(line); // Возвращаем строку в начало очереди для новой страницы
       continue;
    }

    // Если это заголовок или таблица - их рвать нельзя.
    // Если они не влезают, переносим на новую страницу.
    if (isStructure) {
       pages.push(currentPage);
       currentPage = "";
       currentLen = 0;
       linesQueue.unshift(line);
       continue;
    }

    // 3. Это обычный текст. Место есть. РВЕМ ЕГО!
    // Находим пробел, ближайший к концу доступного места.
    // Отступаем немного назад (например, на 10-20 символов) для страховки.
    const safeLimit = Math.max(0, spaceLeft - 10);
    let splitIdx = line.lastIndexOf(' ', safeLimit);

    // Если пробел не найден (одно длинное слово) или кусок получается слишком маленьким (висячая строка)
    if (splitIdx === -1 || splitIdx < 50) {
       // Если строка сама по себе огромная (больше страницы), нам придется её резать всё равно.
       // Но если она просто длинная, но меньше страницы, лучше перенести целиком.
       if (lineCost > charsPerPage) {
           // Принудительная резка по лимиту, если это монструозная строка
           splitIdx = safeLimit; 
       } else {
           // Перенос
           pages.push(currentPage);
           currentPage = "";
           currentLen = 0;
           linesQueue.unshift(line);
           continue;
       }
    }

    // Режем
    const part1 = line.substring(0, splitIdx);
    const part2 = line.substring(splitIdx).trim(); // Убираем пробел в начале остатка

    // Добавляем первую часть и закрываем страницу
    currentPage += (currentPage ? "\n" : "") + part1;
    pages.push(currentPage);
    
    // Сброс для новой страницы
    currentPage = "";
    currentLen = 0;

    // Возвращаем остаток в очередь (он пойдет на новую страницу, и может быть снова разбит, если он огромный)
    if (part2.length > 0) {
        linesQueue.unshift(part2);
    }
  }

  // Добавляем последний хвост
  if (currentPage) {
    pages.push(currentPage);
  }

  return pages.length > 0 ? pages : [""];
};

export default function App() {
  const [project, setProject] = useState<ProjectData>(INITIAL_PROJECT);
  const [pprSections, setPprSections] = useState<DocSection[]>(PPR_SECTIONS_TEMPLATE);
  const [currentStep, setCurrentStep] = useState<'new-project' | 'edit' | 'dictionaries' | 'ppr-register' | 'knowledge'>('new-project');
  const [dictTab, setDictTab] = useState<'objects' | 'clients' | 'contractors' | 'works' | 'system'>('objects');
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzingPos, setIsAnalyzingPos] = useState(false);
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error' | 'info'} | null>(null);
  const [dictionaries, setDictionaries] = useState<HierarchicalDict>(INITIAL_HIERARCHICAL_DICT);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const estimateInputRef = useRef<HTMLInputElement>(null);
  const posInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  
  // Ref to control the generation loop
  const abortControllerRef = useRef<AbortController | null>(null);

  const filteredProjects = useMemo(() => {
    return savedProjects.filter(p => 
      p.data.projectName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.data.objectName.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [savedProjects, searchTerm]);

  // --- Layout Calculation (Pagination Engine) ---
  const docLayout = useMemo(() => {
    let currentPage = 1;
    const pages: any[] = [];
    const tocEntries: { title: string; page: number; level: number }[] = [];

    pages.push({ type: 'title', pageNum: currentPage++ });
    pages.push({ type: 'toc', pageNum: currentPage++ });
    
    // Лист согласования (Approval Sheet)
    pages.push({ type: 'approval-sheet', pageNum: currentPage++, title: 'Лист согласования' });
    tocEntries.push({ title: 'Лист согласования', page: currentPage - 1, level: 1 });

    pprSections.forEach((s, idx) => {
      const content = s.content || 'Раздел ожидает генерации...';
      const sectionPages = splitContentIntoPages(content);
      tocEntries.push({ title: `${idx + 1}. ${s.title}`, page: currentPage, level: 1 });
      sectionPages.forEach((pContent, pIdx) => {
        pages.push({ type: 'ppr', title: s.title, index: idx + 1, content: pContent, isFirstPage: pIdx === 0, pageNum: currentPage++ });
      });
    });

    project.workType.forEach((work, wIdx) => {
      pages.push({ type: 'tk-separator', title: work, pageNum: currentPage++ });
      tocEntries.push({ title: `Приложение ${wIdx + 1}. ТК на ${work}`, page: currentPage - 1, level: 1 });
      const workSections = project.tkMap[work] || [];
      workSections.forEach((tkSec, tsIdx) => {
        const tkContent = tkSec.content || 'Ожидает генерации...';
        const tkPages = splitContentIntoPages(tkContent);
        tocEntries.push({ title: `${tsIdx + 1}. ${tkSec.title}`, page: currentPage, level: 2 });
        tkPages.forEach((pContent, pIdx) => {
          pages.push({ type: 'tk', workTitle: work, secTitle: tkSec.title, index: tsIdx + 1, content: pContent, isFirstPage: pIdx === 0, pageNum: currentPage++ });
        });
      });
    });

    // Лист ознакомления (Acquaintance Sheet) at the end
    pages.push({ type: 'acquaintance-sheet', pageNum: currentPage++, title: 'Лист ознакомления' });
    tocEntries.push({ title: 'Лист ознакомления', page: currentPage - 1, level: 1 });

    return { pages, tocEntries, totalPages: currentPage - 1 };
  }, [pprSections, project.workType, project.tkMap]);

  const isProjectReady = useMemo(() => {
    if (project.workType.length === 0) return false;
    return project.workType.every(work => 
      project.workDeadlines[work]?.start && project.workDeadlines[work]?.end
    );
  }, [project.workType, project.workDeadlines]);

  useEffect(() => {
    const data = localStorage.getItem('stroydoc_projects');
    if (data) try { setSavedProjects(JSON.parse(data)); } catch (e) {}
    const dicts = localStorage.getItem('stroydoc_dictionaries');
    if (dicts) try { setDictionaries(prev => ({ ...prev, ...JSON.parse(dicts) })); } catch (e) {}
  }, []);

  // ... (Notification and Update functions remain the same) ...
  const showNotification = (message: string, type: 'success' | 'error' | 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  const updateProject = (field: keyof ProjectData, value: any) => {
    setProject(prev => {
      const next = { ...prev, [field]: value };
      
      if (field === 'objectName') {
        const obj = dictionaries.objects.find(o => o.name === value);
        if (obj) next.location = obj.address;
      }
      if (field === 'client') {
        const cl = dictionaries.clients.find(c => c.name === value);
        if (cl) next.roleClientChiefEngineer = cl.chiefEngineer;
      }
      if (field === 'contractor') {
        const co = dictionaries.contractors.find(c => c.name === value);
        if (co) next.roleDeveloper = co.developer;
      }

      if (field === 'workType') {
        const newTkMap: Record<string, DocSection[]> = {};
        (value as string[]).forEach(wt => {
          newTkMap[wt] = prev.tkMap[wt] || TK_SECTIONS_TEMPLATE.map(s => ({ ...s }));
        });
        next.tkMap = newTkMap;
        
        const newDeadlines = { ...prev.workDeadlines };
        Object.keys(newDeadlines).forEach(k => {
          if (!(value as string[]).includes(k)) delete newDeadlines[k];
        });
        next.workDeadlines = newDeadlines;
      }
      return next;
    });
  };

  const updateDeadline = (work: string, type: 'start' | 'end', date: string) => {
    setProject(prev => ({
      ...prev,
      workDeadlines: {
        ...prev.workDeadlines,
        [work]: {
          ...prev.workDeadlines[work],
          [type]: date
        }
      }
    }));
  };

  // ... (Upload handlers remain the same) ...
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    setIsUploading(true);
    const newDocs: WorkingDoc[] = [];
    
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve((e.target?.result as string).split(',')[1]);
          reader.readAsDataURL(file);
        });
        newDocs.push({ name: file.name, data: base64, mimeType: file.type });
      }
      
      setProject(p => ({ ...p, workingDocs: [...p.workingDocs, ...newDocs] }));
      showNotification(`Загружено РД: ${files.length}. Начинаю AI-анализ...`, 'info');

      if (newDocs.length > 0) {
        const info = await extractDocInfo(newDocs[0].data, newDocs[0].mimeType);
        if (info) {
           setProject(p => ({ 
             ...p, 
             workingDocCode: info.code || p.workingDocCode, 
             workingDocName: info.name || p.workingDocName,
             workType: Array.from(new Set([...p.workType, ...(info.workTypes || [])]))
           }));
           showNotification(`AI распознал: ${info.code}`, 'success');
        }
      }
    } catch (e) { 
      console.error(e);
      showNotification("Ошибка при чтении файлов", "error"); 
    } finally { 
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleEstimateUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsExtracting(true);
    try {
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve((e.target?.result as string).split(',')[1]);
        reader.readAsDataURL(file);
      });
      const works = await extractWorksFromEstimate(base64, file.type, dictionaries.workCatalog);
      if (works && works.length > 0) {
        setProject(p => ({
          ...p,
          workType: Array.from(new Set([...p.workType, ...works]))
        }));
        showNotification(`Найдено работ в смете: ${works.length}`, 'success');
      } else {
        showNotification("Работ в смете не обнаружено или формат не поддерживается", "info");
      }
    } catch (e) { 
      console.error(e);
      showNotification("Не удалось вызвать API Gemini или проанализировать смету", "error"); 
    } finally { 
      setIsExtracting(false); 
      if (estimateInputRef.current) estimateInputRef.current.value = '';
    }
  };

  const handlePosUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsAnalyzingPos(true);
    try {
      const base64 = await new Promise<string>((resolve) => {
         const reader = new FileReader();
         reader.onload = (e) => resolve((e.target?.result as string).split(',')[1]);
         reader.readAsDataURL(file);
      });
      
      setProject(p => ({ ...p, posDoc: { name: file.name, data: base64, mimeType: file.type } }));
      
      const posData = await extractPosData(base64, file.type);
      if (posData) {
          setProject(prev => {
              const next = { ...prev };
              if (posData.projectName) next.projectName = posData.projectName;
              if (posData.objectName) next.objectName = posData.objectName;
              if (posData.location) next.location = posData.location;
              if (posData.mainWorks && posData.mainWorks.length > 0) {
                  next.workType = Array.from(new Set([...prev.workType, ...posData.mainWorks]));
              }
              return next;
          });
          showNotification('ПОС успешно проанализирован. Данные обновлены.', 'success');
      } else {
          showNotification('ПОС загружен, но данные извлечь не удалось. Он будет использован при генерации.', 'info');
      }
    } catch (e) {
      console.error(e);
      showNotification("Ошибка при анализе ПОС", "error");
    } finally {
      setIsAnalyzingPos(false);
      if (posInputRef.current) posInputRef.current.value = '';
    }
  };

  // ... (Generation handlers remain the same) ...
  const generateSinglePprSection = async (idx: number) => {
    setPprSections(prev => { const n = [...prev]; n[idx].status = 'generating'; return n; });
    try {
      const content = await generateSectionContent(project, pprSections[idx].title, `Раздел ППР: ${pprSections[idx].title}`, dictionaries.referenceLibrary);
      setPprSections(prev => { const n = [...prev]; n[idx].content = content; n[idx].status = 'completed'; return n; });
    } catch (e: any) {
      setPprSections(prev => { const n = [...prev]; n[idx].status = 'error'; return n; });
      throw e;
    }
  };

  const generateSingleTkSection = async (workType: string, secIdx: number) => {
    setProject(prev => {
      const newMap = { ...prev.tkMap };
      if (!newMap[workType]) newMap[workType] = [];
      newMap[workType][secIdx] = { ...newMap[workType][secIdx], status: 'generating' };
      return { ...prev, tkMap: newMap };
    });

    const sectionTitle = project.tkMap[workType][secIdx].title;

    try {
      const content = await generateSectionContent(
        project, 
        `${sectionTitle} (ТК на ${workType})`, 
        `Технологическая карта на вид работ: ${workType}. Раздел: ${sectionTitle}`, 
        dictionaries.referenceLibrary
      );
      
      setProject(prev => {
        const newMap = { ...prev.tkMap };
        newMap[workType][secIdx] = { ...newMap[workType][secIdx], content, status: 'completed' };
        return { ...prev, tkMap: newMap };
      });
    } catch (e: any) {
      setProject(prev => {
        const newMap = { ...prev.tkMap };
        newMap[workType][secIdx] = { ...newMap[workType][secIdx], status: 'error' };
        return { ...prev, tkMap: newMap };
      });
      throw e;
    }
  };

  const isAllComplete = useMemo(() => {
    const pprComplete = pprSections.every(s => s.status === 'completed');
    const tkComplete = project.workType.every(work => 
       (project.tkMap[work] || []).every(s => s.status === 'completed')
    );
    return pprComplete && tkComplete;
  }, [pprSections, project.workType, project.tkMap]);

  const handleStopGeneration = () => {
      if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          setIsGeneratingAll(false);
          showNotification('Генерация остановлена пользователем', 'info');
      }
  };

  const handleGenerateAll = async () => {
    if (isGeneratingAll) return;
    setIsGeneratingAll(true);
    abortControllerRef.current = new AbortController();
    
    const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

    const processItem = async (action: () => Promise<void>, name: string) => {
        const maxRetries = 2;
        for (let i = 0; i < maxRetries; i++) {
            if (abortControllerRef.current?.signal.aborted) {
                return false;
            }

            try {
                await action();
                await delay(8000); 
                return true;
            } catch (error: any) {
                const errStr = JSON.stringify(error);
                const isQuota = 
                    error?.status === 429 || 
                    error?.code === 429 ||
                    error?.status === 'RESOURCE_EXHAUSTED' ||
                    errStr.includes('429') || 
                    errStr.includes('quota') || 
                    errStr.includes('RESOURCE_EXHAUSTED');

                if (isQuota) {
                    if (i < maxRetries - 1) {
                        const waitTime = 30000; 
                        showNotification(`Лимит API (${name}). Пауза 30с... Перейдите в Справочники > Система для инструкций по увеличению лимита.`, 'info');
                        for (let k = 0; k < 30; k++) {
                             if (abortControllerRef.current?.signal.aborted) return false;
                             await delay(1000);
                        }
                        continue;
                    } else {
                         showNotification(`Не удалось сгенерировать ${name} из-за лимитов. Подождите пару минут.`, 'error');
                    }
                } else {
                    showNotification(`Ошибка генерации ${name}.`, 'error');
                }
                return false; 
            }
        }
        return false;
    };
    
    try {
      for (let i = 0; i < pprSections.length; i++) {
          if (abortControllerRef.current?.signal.aborted) break;
          if (pprSections[i].status === 'completed') continue; 
          await processItem(() => generateSinglePprSection(i), `ППР-${i+1}`);
      }
      for (const work of project.workType) {
         if (abortControllerRef.current?.signal.aborted) break;
         const sections = project.tkMap[work] || [];
         for (let i = 0; i < sections.length; i++) {
           if (abortControllerRef.current?.signal.aborted) break;
           if (sections[i].status === 'completed') continue;
           await processItem(() => generateSingleTkSection(work, i), `ТК-${work}-${i+1}`);
         }
      }
    } catch (e) {
      console.error("Batch generation stopped:", e);
    } finally {
      setIsGeneratingAll(false);
      abortControllerRef.current = null;
    }
  };

  const MainStamp = ({ pageNum, type = 'form6' }: { pageNum: number, type?: 'form5' | 'form6' }) => {
    if (type === 'form5') {
        return (
            <div className="main-stamp stamp-form-5 font-times">
                <table className="stamp-table">
                    <tbody>
                        <tr style={{ height: '15mm' }}>
                            <td colSpan={2} style={{ width: '120mm' }} className="border-r border-black p-0">
                                <div className="grid grid-cols-5 h-full text-center">
                                    <div className="border-r border-black flex flex-col justify-center text-[7pt]">Изм.</div>
                                    <div className="border-r border-black flex flex-col justify-center text-[7pt]">Кол.уч</div>
                                    <div className="border-r border-black flex flex-col justify-center text-[7pt]">Лист</div>
                                    <div className="border-r border-black flex flex-col justify-center text-[7pt]">№док</div>
                                    <div className="flex flex-col justify-center text-[7pt]">Подп.</div>
                                </div>
                            </td>
                            <td colSpan={2} className="text-center align-middle">
                                <div className="text-[7pt] font-bold uppercase leading-tight">{project.workingDocCode || 'ШИФР'}</div>
                            </td>
                        </tr>
                        <tr style={{ height: '10mm' }}>
                            <td style={{ width: '40mm' }} className="p-0 border-r border-black">
                                <div className="grid grid-rows-2 h-full text-[7pt]">
                                    <div className="border-b border-black px-1 flex items-center justify-between"><span>Разраб.</span><span className="font-bold">{project.roleDeveloper}</span></div>
                                    <div className="px-1 flex items-center justify-between"><span>Пров.</span><span className="font-bold">{project.roleClientChiefEngineer}</span></div>
                                </div>
                            </td>
                             <td style={{ width: '80mm' }} className="border-r border-black text-center p-1 align-middle text-[7pt] italic">
                                {project.objectName || 'Наименование объекта строительства'}
                            </td>
                            <td className="w-[20mm] border-r border-black text-center p-0">
                                <div className="h-full flex flex-col">
                                    <div className="border-b border-black text-[6pt] h-1/2 flex items-center justify-center">Стадия</div>
                                    <div className="font-bold text-[9pt] flex-1 flex items-center justify-center">П</div>
                                </div>
                            </td>
                            <td className="w-[20mm] text-center p-0">
                                <div className="h-full flex flex-col">
                                    <div className="border-b border-black text-[6pt] h-1/2 flex items-center justify-center">Лист</div>
                                    <div className="font-bold text-[9pt] flex-1 flex items-center justify-center">{pageNum}</div>
                                </div>
                            </td>
                        </tr>
                        <tr style={{ height: '15mm' }}>
                            <td colSpan={2} className="border-r border-black text-center align-middle text-[7pt]">Н.контр.</td>
                            <td colSpan={1} className="border-r border-black text-center align-middle text-[8pt] font-black uppercase">{project.contractor}</td>
                             <td className="text-center p-0">
                                <div className="h-full flex flex-col">
                                    <div className="border-b border-black text-[6pt] h-1/2 flex items-center justify-center">Листов</div>
                                    <div className="font-bold text-[9pt] flex-1 flex items-center justify-center">{docLayout.totalPages}</div>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        );
    }

    return (
        <div className="main-stamp stamp-form-6 font-times">
            <table className="stamp-table">
                <tbody>
                    <tr>
                         <td style={{ width: '120mm' }} className="border-r border-black p-0">
                            <div className="flex h-full text-[7pt]">
                                <div className="w-[10mm] border-r border-black flex items-center justify-center">Изм.</div>
                                <div className="w-[10mm] border-r border-black flex items-center justify-center">Кол.уч</div>
                                <div className="w-[10mm] border-r border-black flex items-center justify-center">Лист</div>
                                <div className="w-[20mm] border-r border-black flex items-center justify-center">№док</div>
                                <div className="w-[20mm] border-r border-black flex items-center justify-center">Подп.</div>
                                <div className="w-[20mm] flex items-center justify-center">Дата</div>
                            </div>
                        </td>
                        <td className="border-r border-black text-center align-middle font-bold text-[8pt]">
                           {project.workingDocCode || 'ШИФР'}
                        </td>
                        <td style={{ width: '20mm' }} className="text-center align-middle p-0">
                             <div className="flex flex-col h-full">
                                <div className="border-b border-black text-[5pt] leading-none">Лист</div>
                                <div className="font-bold text-[9pt] flex-1 flex items-center justify-center">{pageNum}</div>
                             </div>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col font-times">
      {notification && (
        <div className={`fixed top-20 right-6 z-[1000] p-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-right-10 duration-300 ${notification.type === 'success' ? 'bg-green-600 text-white' : notification.type === 'error' ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'}`}>
           {notification.type === 'success' ? <CheckCircle2 className="w-5" /> : <Info className="w-5" />}
           <span className="text-xs font-black uppercase max-w-sm">{notification.message}</span>
        </div>
      )}

      <header className="no-print bg-white border-b border-slate-200 sticky top-0 z-[200] px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setCurrentStep('new-project')}>
          <div className="bg-blue-600 p-2 rounded-lg shadow-lg"><HardHat className="text-white w-6 h-6" /></div>
          <div>
            <h1 className="text-xl font-black text-slate-800 tracking-tight leading-none font-sans">StroyDoc AI</h1>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none font-sans">Engineering Portal</span>
          </div>
        </div>
        <nav className="flex items-center gap-8 font-sans">
           <button onClick={() => setCurrentStep('new-project')} className={`text-xs font-black uppercase flex items-center gap-2 ${currentStep === 'new-project' || currentStep === 'edit' ? 'text-blue-600' : 'text-slate-400'}`}><PlusCircle className="w-4" /> Создать</button>
           <button onClick={() => setCurrentStep('ppr-register')} className={`text-xs font-black uppercase flex items-center gap-2 ${currentStep === 'ppr-register' ? 'text-blue-600' : 'text-slate-400'}`}><ClipboardList className="w-4" /> Реестр ППР</button>
           <button onClick={() => setCurrentStep('dictionaries')} className={`text-xs font-black uppercase flex items-center gap-2 ${currentStep === 'dictionaries' ? 'text-blue-600' : 'text-slate-400'}`}><Settings className="w-4" /> Справочники</button>
           <button onClick={() => setCurrentStep('knowledge')} className={`text-xs font-black uppercase flex items-center gap-2 ${currentStep === 'knowledge' ? 'text-blue-600' : 'text-slate-400'}`}><BookMarked className="w-4" /> База знаний</button>
           <button onClick={() => window.print()} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-black uppercase flex items-center gap-2 shadow-lg hover:bg-blue-700"><Printer className="w-4" /> Печать</button>
        </nav>
      </header>

      <main className="flex-1 flex overflow-hidden font-sans">
        {/* ... (Aside content same as previous) ... */}
        <aside className="no-print w-[400px] bg-white border-r border-slate-200 overflow-y-auto p-6 space-y-8 no-scrollbar">
           {(currentStep === 'new-project' || currentStep === 'edit') && (
             <div className="space-y-6">
                {currentStep === 'new-project' ? (
                  <>
                    <div className="bg-blue-50/50 p-5 rounded-2xl border border-blue-100 space-y-4">
                      <SearchableInput label="Название проекта" value={project.projectName} onChange={(v: string) => updateProject('projectName', v)} suggestions={[]} icon={<PenLine className="w-4" />} />
                      <SearchableInput label="Объект" value={project.objectName} onChange={(v: string) => updateProject('objectName', v)} suggestions={dictionaries.objects.map(o => o.name)} icon={<Database className="w-4" />} />
                      <SearchableInput label="Адрес объекта" value={project.location} onChange={(v: string) => updateProject('location', v)} suggestions={[]} icon={<MapPin className="w-4" />} />
                      <SearchableInput label="Заказчик" value={project.client} onChange={(v: string) => updateProject('client', v)} suggestions={dictionaries.clients.map(c => c.name)} icon={<UserCog className="w-4" />} />
                      <SearchableInput label="Шифр РД" value={project.workingDocCode} onChange={(v: string) => updateProject('workingDocCode', v)} suggestions={[]} icon={<FileDown className="w-4" />} />
                      <SearchableInput label="Подрядчик" value={project.contractor} onChange={(v: string) => updateProject('contractor', v)} suggestions={dictionaries.contractors.map(c => c.name)} icon={<Building2 className="w-4" />} />
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div onClick={() => !isUploading && fileInputRef.current?.click()} className={`border-2 border-dashed border-slate-200 rounded-2xl p-2 text-center transition-all ${isUploading ? 'bg-slate-50 cursor-not-allowed opacity-50' : 'hover:bg-blue-50 cursor-pointer group'}`}>
                        <input type="file" ref={fileInputRef} className="hidden" multiple onChange={handleFileUpload} />
                        {isUploading ? <Loader2 className="w-5 h-5 text-blue-500 mx-auto mb-1 animate-spin" /> : <Upload className="w-5 h-5 text-slate-300 mx-auto mb-1 group-hover:text-blue-500" />}
                        <p className="text-[9px] font-black text-slate-500 uppercase leading-none">{isUploading ? '...' : 'РД'}</p>
                      </div>
                      <div onClick={() => !isExtracting && estimateInputRef.current?.click()} className={`border-2 border-dashed border-slate-200 rounded-2xl p-2 text-center transition-all ${isExtracting ? 'bg-slate-50 cursor-not-allowed opacity-50' : 'hover:bg-green-50 cursor-pointer group'}`}>
                        <input type="file" ref={estimateInputRef} className="hidden" onChange={handleEstimateUpload} />
                        {isExtracting ? <Loader2 className="w-5 h-5 text-green-500 mx-auto mb-1 animate-spin" /> : <Calculator className="w-5 h-5 text-slate-300 mx-auto mb-1 group-hover:text-green-500" />}
                        <p className="text-[9px] font-black text-slate-500 uppercase leading-none">{isExtracting ? '...' : 'Смета'}</p>
                      </div>
                      <div onClick={() => !isAnalyzingPos && posInputRef.current?.click()} className={`border-2 border-dashed border-slate-200 rounded-2xl p-2 text-center transition-all ${isAnalyzingPos ? 'bg-slate-50 cursor-not-allowed opacity-50' : 'hover:bg-purple-50 cursor-pointer group'}`}>
                        <input type="file" ref={posInputRef} className="hidden" onChange={handlePosUpload} />
                        {isAnalyzingPos ? <Loader2 className="w-5 h-5 text-purple-500 mx-auto mb-1 animate-spin" /> : <FileText className="w-5 h-5 text-slate-300 mx-auto mb-1 group-hover:text-purple-500" />}
                        <p className="text-[9px] font-black text-slate-500 uppercase leading-none">{isAnalyzingPos ? '...' : 'ПОС'}</p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h2 className="text-[10px] font-black uppercase text-slate-400 tracking-widest border-l-4 border-slate-300 pl-3">Виды работ ({project.workType.length})</h2>
                      <WorkTreeSelect label="Выбрать из каталога" selectedItems={project.workType} onChange={(v: any) => updateProject('workType', v)} catalog={dictionaries.workCatalog} />
                      
                      {project.workType.length > 0 && (
                        <div className="space-y-3 mt-4">
                          {project.workType.map(w => (
                            <div key={w} className="bg-slate-50 p-3 rounded-xl border border-slate-100 relative group">
                                <div className="flex justify-between items-start mb-2">
                                  <span className="text-xs font-bold text-slate-700 leading-tight w-[90%]">{w}</span>
                                  <X className="w-4 h-4 text-slate-300 cursor-pointer hover:text-red-500" onClick={() => updateProject('workType', project.workType.filter(i => i !== w))} />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="space-y-1">
                                     <label className="text-[8px] font-black uppercase text-slate-400">Начало</label>
                                     <input 
                                       type="date" 
                                       className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold outline-none focus:border-blue-400"
                                       value={project.workDeadlines[w]?.start || ''}
                                       onChange={(e) => updateDeadline(w, 'start', e.target.value)}
                                     />
                                  </div>
                                  <div className="space-y-1">
                                     <label className="text-[8px] font-black uppercase text-slate-400">Окончание</label>
                                     <input 
                                       type="date" 
                                       className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold outline-none focus:border-blue-400"
                                       value={project.workDeadlines[w]?.end || ''}
                                       onChange={(e) => updateDeadline(w, 'end', e.target.value)}
                                     />
                                  </div>
                                </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <button 
                      onClick={() => setCurrentStep('edit')} 
                      disabled={!isProjectReady}
                      className={`w-full py-4 rounded-2xl font-black uppercase shadow-xl transition-all flex items-center justify-center gap-2 ${isProjectReady ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
                    >
                      Перейти к генерации <ChevronRight className="w-4" />
                    </button>
                    {!isProjectReady && project.workType.length > 0 && (
                       <p className="text-[9px] text-center text-red-500 font-bold uppercase">Заполните сроки выполнения для всех работ</p>
                    )}
                  </>
                ) : (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                       <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest border-l-4 border-blue-600 pl-3">Генерация разделов</h2>
                       <div className="flex gap-2">
                            {isGeneratingAll && (
                                <button
                                    onClick={handleStopGeneration}
                                    className="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 transition-all bg-red-50 text-red-600 hover:bg-red-100"
                                >
                                    <Square className="w-3 fill-current" /> Стоп
                                </button>
                            )}
                           <button 
                             onClick={handleGenerateAll}
                             disabled={isGeneratingAll}
                             className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 transition-all ${
                               isAllComplete 
                                 ? 'bg-green-100 text-green-700 hover:bg-green-200' 
                                 : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                             }`}
                           >
                             {isGeneratingAll ? (
                               <><Loader2 className="w-4 animate-spin" /> Генерация...</>
                             ) : isAllComplete ? (
                               <><CheckCircle2 className="w-4" /> Готово</>
                             ) : (
                               <><Zap className="w-4" /> Старт AI</>
                             )}
                           </button>
                       </div>
                    </div>
                    
                    <div className="space-y-2">
                       <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-2">Общий ППР</h3>
                       {pprSections.map((s, idx) => (
                         <div key={s.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-white shadow-sm hover:border-blue-200 transition-all">
                           <span className={`text-xs font-bold truncate pr-2 ${s.status === 'completed' ? 'text-green-700' : 'text-slate-700'}`}>
                             {idx + 1}. {s.title}
                           </span>
                           <button onClick={() => generateSinglePprSection(idx)} className={`p-1 rounded-lg transition-colors ${
                             s.status === 'completed' ? 'text-green-600 hover:bg-green-50' : 
                             s.status === 'error' ? 'text-red-600 hover:bg-red-50' : 
                             'text-blue-600 hover:bg-blue-50'
                           }`}>
                             {s.status === 'generating' ? <Loader2 className="w-4 animate-spin" /> : 
                              s.status === 'completed' ? <CheckCircle2 className="w-5" /> : 
                              s.status === 'error' ? <AlertCircle className="w-5" /> :
                              <PlayCircle className="w-5" />}
                           </button>
                         </div>
                       ))}
                    </div>

                    {project.workType.map((work, wIdx) => (
                      <div key={work} className="space-y-2 mt-4 pt-4 border-t border-slate-100">
                         <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-2 truncate" title={work}>
                           ТК: {work}
                         </h3>
                         {(project.tkMap[work] || []).map((s, idx) => (
                           <div key={`${work}-${idx}`} className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-white shadow-sm hover:border-blue-200 transition-all">
                             <span className={`text-xs font-bold truncate pr-2 ${s.status === 'completed' ? 'text-green-700' : 'text-slate-700'}`}>
                               {idx + 1}. {s.title}
                             </span>
                             <button onClick={() => generateSingleTkSection(work, idx)} className={`p-1 rounded-lg transition-colors ${
                               s.status === 'completed' ? 'text-green-600 hover:bg-green-50' : 
                               s.status === 'error' ? 'text-red-600 hover:bg-red-50' : 
                               'text-blue-600 hover:bg-blue-50'
                             }`}>
                               {s.status === 'generating' ? <Loader2 className="w-4 animate-spin" /> : 
                                s.status === 'completed' ? <CheckCircle2 className="w-5" /> : 
                                s.status === 'error' ? <AlertCircle className="w-5" /> :
                                <PlayCircle className="w-5" />}
                             </button>
                           </div>
                         ))}
                      </div>
                    ))}

                    <button onClick={() => setCurrentStep('new-project')} className="w-full bg-slate-100 text-slate-600 py-3 rounded-xl font-black uppercase text-[10px] hover:bg-slate-200 transition-all">Назад к данным</button>
                  </div>
                )}
             </div>
           )}
           
           {/* ... (Other sidebar sections: dictionaries, ppr-register, knowledge - same as previous) ... */}
           {currentStep === 'dictionaries' && (
             <div className="space-y-6">
                <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest border-l-4 border-slate-300 pl-3">Справочники</h2>
                <div className="flex flex-col gap-2">
                   {['objects', 'clients', 'contractors', 'works', 'system'].map((tab: any) => (
                     <button key={tab} onClick={() => setDictTab(tab)} className={`w-full text-left px-4 py-3 rounded-xl text-xs font-black uppercase transition-all ${dictTab === tab ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}>
                       {tab === 'objects' && 'Строительные объекты'}
                       {tab === 'clients' && 'Заказчики / ГИПы'}
                       {tab === 'contractors' && 'Подрядные организации'}
                       {tab === 'works' && 'Каталог видов работ'}
                       {tab === 'system' && 'Система и Квоты'}
                     </button>
                   ))}
                </div>
             </div>
           )}

           {currentStep === 'ppr-register' && (
             <div className="space-y-6">
                <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest border-l-4 border-slate-300 pl-3">Поиск проекта</h2>
                <div className="relative">
                   <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 text-slate-400" />
                   <input type="text" placeholder="Поиск в реестре..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
             </div>
           )}

           {currentStep === 'knowledge' && (
             <div className="space-y-6">
                <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest border-l-4 border-slate-300 pl-3">Библиотека норм</h2>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-4">
                   <div onClick={() => libraryInputRef.current?.click()} className="border-2 border-dashed border-blue-200 rounded-xl p-6 text-center hover:bg-blue-100/50 cursor-pointer">
                      <input type="file" ref={libraryInputRef} className="hidden" />
                      <Library className="w-8 h-8 text-blue-400 mx-auto mb-2" />
                      <p className="text-[10px] font-black uppercase text-blue-600">Загрузить ГЭСН / ФЕР / СП</p>
                   </div>
                   <div className="text-[9px] text-slate-400 italic">Эти документы будут использоваться AI как приоритетный источник при генерации разделов.</div>
                </div>
             </div>
           )}
        </aside>

        <section className="flex-1 overflow-y-auto document-preview-container no-scrollbar bg-slate-200/50 p-10 custom-scrollbar">
           {currentStep === 'ppr-register' ? (
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredProjects.map(p => (
                  <div key={p.id} className="bg-white p-6 rounded-3xl shadow-lg border border-slate-100 hover:shadow-xl transition-all cursor-pointer group">
                    <div className="flex justify-between items-start mb-4">
                      <div className="bg-blue-50 p-3 rounded-2xl group-hover:bg-blue-600 group-hover:text-white transition-colors"><FileText className="w-6 h-6" /></div>
                    </div>
                    <h3 className="text-sm font-black text-slate-800 mb-1">{p.data.projectName || 'Без названия'}</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase mb-4 truncate">{p.data.objectName || 'Объект не указан'}</p>
                    <div className="flex items-center justify-between border-t border-slate-50 pt-4">
                      <span className="text-[9px] text-slate-400 font-black uppercase">{p.timestamp}</span>
                      <button className="text-blue-600 font-black text-[10px] uppercase hover:underline">Открыть</button>
                    </div>
                  </div>
                ))}
                {filteredProjects.length === 0 && (
                  <div className="col-span-full py-20 text-center text-slate-400 font-bold italic">Проекты не найдены</div>
                )}
             </div>
           ) : currentStep === 'dictionaries' && dictTab === 'system' ? (
              <div className="bg-white rounded-3xl shadow-xl p-10 max-w-4xl mx-auto border border-slate-100 space-y-8 animate-in fade-in zoom-in-95 duration-300">
                {/* ... (Quota Info Section - same as previous) ... */}
                <div className="flex items-center gap-4 mb-6">
                  <div className="p-3 bg-blue-100 rounded-2xl text-blue-600"><CreditCard className="w-8 h-8" /></div>
                  <div>
                    <h2 className="text-2xl font-black uppercase text-slate-800 leading-none">Управление квотами API</h2>
                    <p className="text-xs text-slate-400 font-bold uppercase mt-1">Инструкция по увеличению лимитов для StroyDoc AI</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="p-6 rounded-2xl bg-slate-50 border border-slate-100 space-y-4">
                    <h3 className="text-sm font-black uppercase text-slate-700 flex items-center gap-2"><Sparkle className="w-4 text-yellow-500" /> Текущие лимиты (Free)</h3>
                    <ul className="text-xs space-y-2 font-bold text-slate-500">
                      <li className="flex justify-between border-b border-slate-200 pb-1"><span>Запросов (RPM):</span> <span className="text-red-500">2 - 15</span></li>
                      <li className="flex justify-between border-b border-slate-200 pb-1"><span>Токенов (TPM):</span> <span className="text-red-500">32,000</span></li>
                      <li className="flex justify-between border-b border-slate-200 pb-1"><span>Запросов в день:</span> <span className="text-red-500">1,500</span></li>
                    </ul>
                    <p className="text-[10px] italic text-slate-400">Бесплатный уровень вызывает ошибку 429 при массовой генерации ППР.</p>
                  </div>

                  <div className="p-6 rounded-2xl bg-blue-600 text-white space-y-4 shadow-xl">
                    <h3 className="text-sm font-black uppercase flex items-center gap-2"><Zap className="w-4" /> Платный тариф (Pay-as-you-go)</h3>
                    <ul className="text-xs space-y-2 font-bold opacity-90">
                      <li className="flex justify-between border-b border-blue-500 pb-1"><span>Запросов (RPM):</span> <span>До 360</span></li>
                      <li className="flex justify-between border-b border-blue-500 pb-1"><span>Токенов (TPM):</span> <span>До 4,000,000</span></li>
                      <li className="flex justify-between border-b border-blue-500 pb-1"><span>Стабильность:</span> <span>Максимальная</span></li>
                    </ul>
                    <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" className="flex items-center justify-center gap-2 bg-white text-blue-600 py-2 rounded-xl text-[10px] font-black uppercase hover:bg-slate-100 transition-all">
                      Подключить биллинг <ExternalLink className="w-3" />
                    </a>
                  </div>
                </div>

                <div className="space-y-4 border-t border-slate-100 pt-8">
                  <h3 className="text-sm font-black uppercase text-slate-800">Как повысить лимиты вручную?</h3>
                  <div className="space-y-3">
                    <div className="flex gap-4 items-start">
                      <div className="w-6 h-6 rounded-full bg-slate-800 text-white flex items-center justify-center text-[10px] font-black shrink-0">1</div>
                      <p className="text-xs font-medium text-slate-600">Перейдите в <a href="https://console.cloud.google.com/" className="text-blue-600 underline">Google Cloud Console</a> и выберите ваш проект.</p>
                    </div>
                    <div className="flex gap-4 items-start">
                      <div className="w-6 h-6 rounded-full bg-slate-800 text-white flex items-center justify-center text-[10px] font-black shrink-0">2</div>
                      <p className="text-xs font-medium text-slate-600">В меню выберите <b>"IAM & Admin" > "Quotas"</b>.</p>
                    </div>
                    <div className="flex gap-4 items-start">
                      <div className="w-6 h-6 rounded-full bg-slate-800 text-white flex items-center justify-center text-[10px] font-black shrink-0">3</div>
                      <p className="text-xs font-medium text-slate-600">Найдите <b>"Generative AI Analysis API"</b> или <b>"Gemini API"</b>.</p>
                    </div>
                    <div className="flex gap-4 items-start">
                      <div className="w-6 h-6 rounded-full bg-slate-800 text-white flex items-center justify-center text-[10px] font-black shrink-0">4</div>
                      <p className="text-xs font-medium text-slate-600">Нажмите <b>"Edit Quotas"</b> и отправьте запрос на увеличение RPM (например, до 100).</p>
                    </div>
                  </div>
                </div>
              </div>
           ) : (
             <div className="flex flex-col items-center gap-10">
               {docLayout.pages.map((page, idx) => {
                  if (page.type === 'title') {
                    return (
                      <div key={idx} className="page-container title-page font-times">
                        <div className="gost-content title-page-content text-center flex flex-col justify-between">
                            <div className="flex justify-end mb-10">
                                <div className="text-left w-[80mm] space-y-2 text-[12pt]">
                                    <div className="uppercase font-bold">УТВЕРЖДАЮ</div>
                                    <div className="py-1">Руководитель: ___________________</div>
                                    <div className="py-1">________________ / {project.roleDeveloper || 'Ф.И.О.'}</div>
                                    <div className="py-1">«___» _____________ 202__ г.</div>
                                </div>
                            </div>

                           <div className="flex-1 flex flex-col items-center justify-center space-y-10">
                              <div className="text-[14pt] font-black uppercase mb-10">{project.contractor || 'ОРГАНИЗАЦИЯ'}</div>
                              
                              <div className="text-[18pt] font-black py-8 px-12 uppercase leading-tight">ПРОЕКТ ПРОИЗВОДСТВА РАБОТ</div>
                              <div className="text-[20pt] font-black uppercase tracking-tight px-4 leading-none">{project.projectName || '[НАЗВАНИЕ ПРОЕКТА]'}</div>
                              
                              <div className="space-y-6 pt-10 text-[14pt]">
                                 <div className="font-bold pt-6 uppercase">Объект: {project.objectName || '[ОБЪЕКТ]'}</div>
                                 <div className="italic">Разработано на основании РД: {project.workingDocCode || '[ШИФР]'}</div>
                              </div>
                           </div>
                           <div className="mt-auto font-bold text-[12pt] flex justify-between w-full px-10">
                             <span>г. Москва</span>
                             <span>2024</span>
                           </div>
                        </div>
                      </div>
                    );
                  }
                  
                  // Logic for stamp type
                  const isToc = page.type === 'toc';
                  const stampType = isToc ? 'form5' : 'form6';

                  if (page.type === 'toc') {
                    return (
                      <div key={idx} className="page-container font-times">
                        <div className="gost-frame"></div>
                        <div className={`gost-content content-with-form-5`}>
                           <h3 className="text-[16pt] font-black text-center mb-10 border-b-2 border-black pb-2 uppercase">Содержание</h3>
                           <div className="space-y-4">
                              {docLayout.tocEntries.map((entry, eIdx) => (
                                <div key={eIdx} className={`flex items-baseline gap-2 ${entry.level === 2 ? 'pl-8 text-[12pt]' : 'text-[13pt] font-bold'}`}>
                                   <span className="flex-shrink-0">{entry.title}</span>
                                   <div className="flex-1 border-b border-dotted border-black translate-y-[-4px]"></div>
                                   <span className="flex-shrink-0">{entry.page}</span>
                                </div>
                              ))}
                           </div>
                        </div>
                        <MainStamp pageNum={page.pageNum} type={stampType} />
                      </div>
                    );
                  }
                  
                  if (page.type === 'approval-sheet') {
                    return (
                      <div key={idx} className="page-container font-times">
                        <div className="gost-frame"></div>
                        <div className="gost-content content-with-form-6">
                            <h3 className="text-[16pt] font-black text-center mb-6 border-b-2 border-black pb-2 uppercase">Лист согласования</h3>
                            <table className="w-full border-collapse border border-black text-[10pt]">
                                <thead className="bg-slate-50">
                                    <tr>
                                        <th className="border border-black p-2 w-[10mm]">№ п/п</th>
                                        <th className="border border-black p-2">Наименование организации</th>
                                        <th className="border border-black p-2 w-[40mm]">Должность, Ф.И.О.</th>
                                        <th className="border border-black p-2 w-[25mm]">Дата</th>
                                        <th className="border border-black p-2 w-[25mm]">Подпись</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[...Array(15)].map((_, i) => (
                                        <tr key={i} className="h-[12mm]">
                                            <td className="border border-black p-1 text-center">{i + 1}</td>
                                            <td className="border border-black p-1"></td>
                                            <td className="border border-black p-1"></td>
                                            <td className="border border-black p-1"></td>
                                            <td className="border border-black p-1"></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <MainStamp pageNum={page.pageNum} type="form6" />
                      </div>
                    );
                  }

                  if (page.type === 'acquaintance-sheet') {
                    return (
                      <div key={idx} className="page-container font-times">
                        <div className="gost-frame"></div>
                        <div className="gost-content content-with-form-6">
                            <h3 className="text-[16pt] font-black text-center mb-6 border-b-2 border-black pb-2 uppercase">Лист ознакомления</h3>
                            <table className="w-full border-collapse border border-black text-[10pt]">
                                <thead className="bg-slate-50">
                                    <tr>
                                        <th className="border border-black p-2 w-[10mm]">№ п/п</th>
                                        <th className="border border-black p-2">Должность, Ф.И.О.</th>
                                        <th className="border border-black p-2 w-[30mm]">Дата</th>
                                        <th className="border border-black p-2 w-[30mm]">Подпись</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[...Array(15)].map((_, i) => (
                                        <tr key={i} className="h-[12mm]">
                                            <td className="border border-black p-1 text-center">{i + 1}</td>
                                            <td className="border border-black p-1"></td>
                                            <td className="border border-black p-1"></td>
                                            <td className="border border-black p-1"></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <MainStamp pageNum={page.pageNum} type="form6" />
                      </div>
                    );
                  }

                  if (page.type === 'tk-separator') {
                    return (
                      <div key={idx} className="page-container font-times">
                        <div className="gost-frame"></div>
                        <div className={`gost-content flex flex-col items-center justify-center text-center p-20 space-y-12 content-with-form-6`}>
                           <Scissors className="w-16 h-16 text-slate-300" />
                           <h2 className="text-[24pt] font-black uppercase border-b-8 border-black pb-6 px-10 leading-tight">{page.title}</h2>
                           <div className="text-[12pt] font-bold text-slate-400 uppercase tracking-widest">Технологическая карта</div>
                        </div>
                        <MainStamp pageNum={page.pageNum} type={stampType} />
                      </div>
                    );
                  }
                  return (
                    <div key={idx} className="page-container font-times">
                       <div className="gost-frame"></div>
                       <div className={`gost-content content-with-form-6`}>
                          {page.isFirstPage && (
                            <div className="border-b-2 border-black mb-6 pb-2">
                               <h3 className="text-[14pt] font-black uppercase">
                                 {page.type === 'ppr' ? `${page.index}. ${page.title}` : `${page.index}. ${page.secTitle}`}
                               </h3>
                            </div>
                          )}
                          <div className="text-[12pt] leading-relaxed text-justify">
                             <ReactMarkdown
                               remarkPlugins={[remarkGfm]}
                               components={{
                                  table: (props) => <table className="w-full border-collapse border border-black mb-4 text-[11pt]" {...props} />,
                                  thead: (props) => <thead className="bg-slate-50" {...props} />,
                                  th: (props) => <th className="border border-black p-2 text-center font-bold align-middle bg-gray-100" {...props} />,
                                  td: (props) => <td className="border border-black p-2 align-top" {...props} />,
                                  p: (props) => <p className="mb-2 indent-[12mm]" {...props} />,
                                  ul: (props) => <ul className="list-disc pl-8 mb-2" {...props} />,
                                  ol: (props) => <ol className="list-decimal pl-8 mb-2" {...props} />,
                                  h1: (props) => <div className="font-bold uppercase text-center mb-3 text-[14pt]" {...props} />,
                                  h2: (props) => <div className="font-bold text-center mb-2 text-[13pt]" {...props} />,
                                  h3: (props) => <div className="font-bold mb-1 text-[12pt]" {...props} />,
                               }}
                             >
                               {page.content}
                             </ReactMarkdown>
                          </div>
                       </div>
                       <MainStamp pageNum={page.pageNum} type={stampType} />
                    </div>
                  );
               })}
             </div>
           )}
        </section>
      </main>
      {/* ... (Footer same as previous) ... */}
      <footer className="no-print bg-slate-900 px-8 py-3 flex items-center justify-between text-[10px] font-black uppercase text-slate-500 border-t border-slate-800 font-sans">
         <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isGeneratingAll ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'}`}></div>
              {isGeneratingAll ? 'AI в процессе работы...' : 'Система готова'}
            </div>
            <div className="text-blue-500 flex items-center gap-2"><ListOrdered className="w-3" /> Страниц: {docLayout.totalPages}</div>
         </div>
         <span className="tracking-widest opacity-50 flex items-center gap-1">StroyDoc AI — Инженерная мощь <Sparkles className="w-3" /></span>
      </footer>
    </div>
  );
}
// ... (Helper components same as previous) ...
function SearchableInput({ label, value, onChange, suggestions, icon }: any) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const click = (e: any) => { if (ref.current && !ref.current.contains(e.target)) setIsOpen(false); };
    document.addEventListener('mousedown', click);
    return () => document.removeEventListener('mousedown', click);
  }, []);
  return (
    <div className="space-y-1 relative" ref={ref}>
      <label className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2 ml-1 text-blue-700 font-sans">{icon} {label}</label>
      <input type="text" value={value} onChange={(e) => { onChange(e.target.value); setIsOpen(true); }} onFocus={() => setIsOpen(true)} className="w-full bg-white border border-blue-200 rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none shadow-sm transition-all font-sans" />
      {isOpen && suggestions.length > 0 && (
        <div className="absolute z-[250] left-0 right-0 mt-1 bg-white border border-slate-100 rounded-xl shadow-2xl max-h-48 overflow-y-auto custom-scrollbar font-sans">
          {suggestions.map((s: string) => (
            <button key={s} onClick={() => { onChange(s); setIsOpen(false); }} className="w-full text-left px-4 py-2 text-xs font-bold hover:bg-blue-50 transition-colors border-b border-slate-50 last:border-0">{s}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function WorkTreeSelect({ label, selectedItems, onChange, catalog }: any) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const click = (e: any) => { if (ref.current && !ref.current.contains(e.target)) setIsOpen(false); };
    document.addEventListener('mousedown', click);
    return () => document.removeEventListener('mousedown', click);
  }, []);
  const toggle = (v: string) => {
    if (selectedItems.includes(v)) onChange(selectedItems.filter((i: string) => i !== v));
    else onChange([...selectedItems, v]);
  };
  return (
    <div className="space-y-1 relative" ref={ref}>
      <label className="text-[10px] font-black uppercase ml-1 text-slate-400 font-sans">{label}</label>
      <div onClick={() => setIsOpen(!isOpen)} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold flex justify-between items-center cursor-pointer shadow-sm hover:border-blue-300 transition-all font-sans">
        <span className="truncate">{selectedItems.length ? `Выбрано: ${selectedItems.length}` : 'Выбрать работы...'}</span>
        <ChevronDown className="w-4 text-slate-400" />
      </div>
      {isOpen && (
        <div className="absolute z-[250] left-0 right-0 mt-1 bg-white border border-slate-100 rounded-xl shadow-2xl max-h-64 overflow-y-auto p-2 custom-scrollbar font-sans">
           {Object.entries(catalog).map(([cat, types]: any) => (
             <div key={cat} className="mb-3">
                <div className="text-[9px] font-black uppercase text-slate-400 px-2 mb-1 border-l-2 border-slate-200 ml-1">{cat}</div>
                {Object.keys(types).map(type => (
                  <div key={type} onClick={() => toggle(type)} className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer mb-0.5 transition-all ${selectedItems.includes(type) ? 'bg-blue-600 text-white shadow-md' : 'hover:bg-slate-50 text-slate-600'}`}>
                    {type}
                  </div>
                ))}
             </div>
           ))}
        </div>
      )}
    </div>
  );
}
