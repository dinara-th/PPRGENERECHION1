
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
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
  Scissors
} from 'lucide-react';
import { ProjectData, DocumentType, DocSection, WorkingDoc, SavedProject, ConstructionObject, ClientEntry, ContractorEntry, ReferenceFile } from './types';
import { generateSectionContent, extractDocInfo, extractWorksFromEstimate } from './geminiService';

interface WorkCatalogNode {
  [category: string]: {
    [workType: string]: string[]; // Specific jobs
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
      "Планировка площадей механизированным способом",
      "Устройство выемок в скальных грунтах"
    ],
    "Разработка грунта вручную": [
      "Разработка грунта в траншеях и котлованах вручную",
      "Доработка дна и стенок траншей после мех. разработки",
      "Разработка грунта в стесненных условиях",
      "Копка ям под опоры и столбы"
    ],
    "Насыпи и обратная засыпка": [
      "Устройство насыпей с послойным уплотнением катками",
      "Обратная засыпка пазух котлованов вручную",
      "Засыпка траншей бульдозерами",
      "Уплотнение грунта пневматическими трамбовками",
      "Устройство песчаных и щебеночных подушек"
    ]
  },
  "Свайные работы (ФЕР-05)": {
    "Забивные сваи": [
      "Погружение железобетонных свай копровыми установками",
      "Погружение стальных свай-оболочек",
      "Устройство лидерных скважин при забивке свай",
      "Срубка голов железобетонных свай вручную",
      "Срубка голов свай гидравлическим оборудованием"
    ],
    "Буронабивные и буроинъекционные сваи": [
      "Бурение скважин под защитой бентонитового раствора",
      "Устройство свай с применением обсадных труб",
      "Изготовление и монтаж арматурных каркасов свай",
      "Бетонирование свай методом ВПТ",
      "Устройство свай по технологии CFA (НПШ)",
      "Инъектирование цементного раствора в скважины"
    ]
  },
  "Бетонные и ЖБ конструкции (ФЕР-06/07)": {
    "Монолитные работы (ФЕР-06)": [
      "Устройство монолитных фундаментных плит",
      "Бетонирование монолитных колонн и пилонов",
      "Устройство монолитных перекрытий (балочных/безбалочных)",
      "Возведение стен в скользящей опалубке",
      "Устройство монолитных лестничных маршей и площадок",
      "Монтаж и демонтаж систем опалубки",
      "Вязка арматурных каркасов и монтаж сеток"
    ],
    "Сборный железобетон (ФЕР-07)": [
      "Установка фундаментных блоков (ФБС)",
      "Монтаж сборных колонн и ригелей",
      "Укладка плит перекрытий (пустотных/ребристых)",
      "Монтаж стеновых панелей и блоков",
      "Установка лестничных маршей и ступеней",
      "Замоноличивание стыков и швов"
    ]
  },
  "Каменные работы (ФЕР-08)": {
    "Кладка стен и перегородок": [
      "Кирпичная кладка наружных стен с облицовкой",
      "Кладка внутренних стен из керамического кирпича",
      "Возведение стен из газобетонных и пеноблоков",
      "Устройство перегородок из ПГП и ячеистого бетона",
      "Кладка из природного камня (бутовая кладка)",
      "Армирование каменных конструкций"
    ]
  },
  "Металлоконструкции (ФЕР-09)": {
    "Монтаж несущих конструкций": [
      "Монтаж стальных колонн и вертикальных связей",
      "Установка подкрановых балок и тормозных конструкций",
      "Монтаж стропильных и подстропильных ферм",
      "Монтаж прогонов и связей покрытия",
      "Установка закладных деталей и анкерных болтов"
    ],
    "Мелкие и вспомогательные конструкции": [
      "Монтаж стальных лестниц, площадок и ограждений",
      "Установка фахверка и конструкций остекления",
      "Монтаж путей подвесного транспорта",
      "Укрупнительная сборка МК на стапеле"
    ],
    "Защитные работы (ФЕР-13)": [
      "Пескоструйная очистка металлоконструкций",
      "Грунтование металлических поверхностей ГФ-021",
      "Окраска МК эмалями и спецсоставами",
      "Нанесение огнезащитных покрытий",
      "Антикоррозионная защита сварных швов"
    ]
  },
  "Монтаж оборудования (ФЕРм-03..12)": {
    "Подъемно-транспортное (ФЕРм-03)": [
      "Монтаж кранов мостовых электрических",
      "Установка талей электрических и ручных",
      "Монтаж лифтов пассажирских и грузовых",
      "Установка подъемников мачтовых строительных",
      "Монтаж ленточных конвейеров",
      "Установка эскалаторов"
    ],
    "Теплосиловое оборудование (ФЕРм-06)": [
      "Монтаж паровых котлов",
      "Установка экономайзеров и воздухоподогревателей",
      "Монтаж деаэрационных колонок",
      "Установка теплообменников пластинчатых",
      "Монтаж сетевых и питательных насосов"
    ],
    "Компрессоры и насосы (ФЕРм-07)": [
      "Монтаж компрессорных агрегатов",
      "Установка воздухосборников (ресиверов)",
      "Монтаж центробежных насосов",
      "Установка вакуум-насосов",
      "Монтаж вентиляторов центробежных и осевых"
    ],
    "Электротехнические установки (ФЕРм-08)": [
      "Монтаж силовых трансформаторов",
      "Установка комплектных трансформаторных подстанций (КТП)",
      "Монтаж распределительных щитов и шкафов (ГРЩ, ВРУ)",
      "Прокладка шинопроводов магистральных",
      "Монтаж аккумуляторных батарей",
      "Устройство контура заземления",
      "Монтаж опор и светильников наружного освещения"
    ],
    "Приборы и системы автоматизации (ФЕРм-11)": [
      "Монтаж щитов и пультов автоматизации",
      "Установка датчиков давления, температуры, расхода",
      "Монтаж исполнительных механизмов (электроприводы)",
      "Прокладка импульсных и командных трубопроводов",
      "Установка контроллеров и модулей ввода-вывода",
      "Монтаж систем пожарной сигнализации (АПС)"
    ],
    "Технологические трубопроводы (ФЕРм-12)": [
      "Монтаж узлов трубопроводов из стальных труб",
      "Монтаж трубопроводов из легированных сталей",
      "Установка арматуры фланцевой (задвижки, клапаны)",
      "Монтаж опорных конструкций под трубопроводы",
      "Промывка и продувка трубопроводов",
      "Испытание систем на прочность и герметичность"
    ]
  }
};

const INITIAL_HIERARCHICAL_DICT: HierarchicalDict = {
  objects: [
    { id: '1', name: 'ЖК "Меридиан"', address: 'г. Москва, ул. Ленина, д. 10' },
    { id: '2', name: 'Индустриальный парк "Технополис"', address: 'Московская обл., г. Одинцово, пр-д Мира, 4' }
  ],
  clients: [
    { id: '1', name: 'ООО "Газпром Инвест"', legalAddress: 'г. Санкт-Петербург, пр. Лахтинский, д. 2', chiefEngineer: 'Иванов И.И.' },
    { id: '2', name: 'ПАО "Лукойл"', legalAddress: 'г. Москва, Сретенский бульвар, д. 11', chiefEngineer: 'Петров П.П.' }
  ],
  contractors: [
    { id: '1', name: 'АО "СтройТрансНефтеГаз"', legalAddress: 'г. Москва, ул. Арбат, д. 1', developer: 'Сидоров С.С.' },
    { id: '2', name: 'ООО "Велесстрой"', legalAddress: 'г. Москва, ул. Тверская, д. 22', developer: 'Алексеев А.А.' }
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
  workingDocCode: '',
  roleDeveloper: '',
  roleClientChiefEngineer: '',
  roleAuthorSupervision: '',
  date: new Date().toISOString().split('T')[0],
  tkMap: {},
  workingDocs: [],
  aiWorksFromEstimate: [],
  aiWorksFromDocs: [],
};

const cleanMarkdown = (text: string) => {
  if (!text) return "";
  return text
    .replace(/#{1,6}\s?/g, '') 
    .replace(/\*\*/g, '')      
    .replace(/^- /gm, '— ')   
    .trim();
};

export default function App() {
  const [project, setProject] = useState<ProjectData>(INITIAL_PROJECT);
  const [pprSections, setPprSections] = useState<DocSection[]>(PPR_SECTIONS_TEMPLATE);
  const [currentStep, setCurrentStep] = useState<'new-project' | 'edit' | 'dictionaries' | 'ppr-register'>('new-project');
  const [dictTab, setDictTab] = useState<'objects' | 'clients' | 'contractors' | 'works' | 'library'>('objects');
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error' | 'info'} | null>(null);
  const [dictionaries, setDictionaries] = useState<HierarchicalDict>(INITIAL_HIERARCHICAL_DICT);
  const [isDictDropdownOpen, setIsDictDropdownOpen] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Set<string>>(new Set());
  const [expandedTks, setExpandedTks] = useState<Set<string>>(new Set());
  
  const [isWorkDetailsExpanded, setIsWorkDetailsExpanded] = useState(true);

  const filteredProjects = useMemo(() => {
    return savedProjects.filter(p => 
      p.data.projectName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.data.objectName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.data.contractor.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [savedProjects, searchTerm]);

  const estimateInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const dictRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const data = localStorage.getItem('stroydoc_projects');
    if (data) {
      try { setSavedProjects(JSON.parse(data)); } catch (e) {}
    }
    const dicts = localStorage.getItem('stroydoc_dictionaries');
    if (dicts) {
      try { 
        const parsed = JSON.parse(dicts);
        setDictionaries(prev => ({ ...prev, ...parsed })); 
      } catch (e) {}
    }

    const restoreOriginalTitle = () => {
      document.title = "StroyDoc AI - Генератор ППР и ТК (ГОСТ)";
    };

    const handleClickOutside = (event: MouseEvent) => {
      if (dictRef.current && !dictRef.current.contains(event.target as Node)) {
        setIsDictDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("afterprint", restoreOriginalTitle);
    
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("afterprint", restoreOriginalTitle);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('stroydoc_projects', JSON.stringify(savedProjects));
  }, [savedProjects]);

  useEffect(() => {
    localStorage.setItem('stroydoc_dictionaries', JSON.stringify(dictionaries));
  }, [dictionaries]);

  const showNotification = (message: string, type: 'success' | 'error' | 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const validateProjectData = (): boolean => {
    const errors = new Set<string>();
    if (!project.projectName.trim()) errors.add('projectName');
    if (!project.objectName.trim()) errors.add('objectName');
    if (!project.client.trim()) errors.add('client');
    if (!project.contractor.trim()) errors.add('contractor');
    if (!project.roleClientChiefEngineer.trim()) errors.add('roleClientChiefEngineer');
    if (!project.roleDeveloper.trim()) errors.add('roleDeveloper');
    if (project.workType.length === 0) errors.add('workType');

    setValidationErrors(errors);
    
    if (errors.size > 0) {
      showNotification("Необходимо заполнить все поля проекта для соответствия ГОСТ", "error");
      return false;
    }
    return true;
  };

  const updateProject = (field: keyof ProjectData, value: any) => {
    setProject(prev => {
      const next = { ...prev, [field]: value };
      
      if (validationErrors.has(field)) {
        const nextErrors = new Set(validationErrors);
        if (typeof value === 'string' ? value.trim() : (Array.isArray(value) ? value.length > 0 : !!value)) {
          nextErrors.delete(field);
          setValidationErrors(nextErrors);
        }
      }

      if (field === 'objectName') {
        const obj = dictionaries.objects.find(o => o.name === value);
        if (obj) next.location = obj.address;
      }
      if (field === 'client') {
        const client = dictionaries.clients.find(c => c.name === value);
        if (client) next.roleClientChiefEngineer = client.chiefEngineer;
      }
      if (field === 'contractor') {
        const contractor = dictionaries.contractors.find(c => c.name === value);
        if (contractor) next.roleDeveloper = contractor.developer;
      }

      if (field === 'workType') {
        const newWorkTypes = value as string[];
        const newTkMap: Record<string, DocSection[]> = {};
        const newWorkDeadlines: Record<string, string> = { ...prev.workDeadlines };

        newWorkTypes.forEach(wt => {
          newTkMap[wt] = prev.tkMap[wt] || TK_SECTIONS_TEMPLATE.map(s => ({ ...s }));
          if (!newWorkDeadlines[wt]) newWorkDeadlines[wt] = " - ";
        });
        
        Object.keys(newWorkDeadlines).forEach(k => {
          if (!newWorkTypes.includes(k)) delete newWorkDeadlines[k];
        });

        next.tkMap = newTkMap;
        next.workDeadlines = newWorkDeadlines;
      }
      return next;
    });
  };

  const updateDeadline = (work: string, type: 'start' | 'end', val: string) => {
    setProject(prev => {
      const current = prev.workDeadlines[work] || " - ";
      let [start, end] = current.split(' - ');
      if (type === 'start') start = val;
      if (type === 'end') end = val;
      return {
        ...prev,
        workDeadlines: {
          ...prev.workDeadlines,
          [work]: `${start || ''} - ${end || ''}`
        }
      };
    });
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    setIsUploading(true);
    const newDocs: WorkingDoc[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve((e.target?.result as string).split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        newDocs.push({ name: file.name, data: base64, mimeType: file.type });
        
        if (i === 0 && file.type === 'application/pdf') {
          setIsExtracting(true);
          const info = await extractDocInfo(base64, file.type);
          if (info) {
            setProject(prev => {
              const next = { ...prev };
              if (info.name && !next.workingDocName) next.workingDocName = info.name;
              if (info.code && !next.workingDocCode) next.workingDocCode = info.code;
              if (info.workTypes?.length > 0) {
                next.aiWorksFromDocs = Array.from(new Set([...prev.aiWorksFromDocs, ...info.workTypes]));
              }
              return next;
            });
          }
          setIsExtracting(false);
        }
      }
      setProject(prev => ({ ...prev, workingDocs: [...prev.workingDocs, ...newDocs] }));
      showNotification(`Загружено ${files.length} док.`, 'success');
    } catch (error) {
      showNotification("Ошибка загрузки", "error");
    } finally {
      setIsUploading(false);
      setIsExtracting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleLibraryUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    const newRefs: ReferenceFile[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve((e.target?.result as string).split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        
        let category: any = 'Прочее';
        if (file.name.includes('ГЭСН')) category = 'ГЭСН';
        else if (file.name.includes('ФЕР')) category = 'ФЕР';
        else if (file.name.includes('СП ')) category = 'СП';
        else if (file.name.includes('ГОСТ')) category = 'ГОСТ';

        newRefs.push({
          id: `ref-${Date.now()}-${i}`,
          name: file.name,
          data: base64,
          mimeType: file.type,
          category,
          uploadedAt: new Date().toISOString()
        });
      }
      setDictionaries(prev => ({
        ...prev,
        referenceLibrary: [...prev.referenceLibrary, ...newRefs]
      }));
      showNotification(`Нормативная база пополнена на ${files.length} файл(ов)`, 'success');
    } catch (e) {
      showNotification("Ошибка загрузки в базу", "error");
    } finally {
      if (libraryInputRef.current) libraryInputRef.current.value = '';
    }
  };

  const handleEstimateUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsExtracting(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve((e.target?.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const selectedWorks = await extractWorksFromEstimate(base64, file.type, dictionaries.workCatalog);
      if (selectedWorks.length > 0) {
        setProject(prev => ({
            ...prev,
            aiWorksFromEstimate: Array.from(new Set([...prev.aiWorksFromEstimate, ...selectedWorks]))
        }));
        showNotification(`AI нашел ${selectedWorks.length} видов работ.`, 'success');
      }
    } catch (error) {
      showNotification("Ошибка анализа сметы", 'error');
    } finally {
      setIsExtracting(false);
      if (estimateInputRef.current) estimateInputRef.current.value = '';
    }
  };

  const generateAllInOne = async () => {
    setIsGeneratingAll(true);
    const activeRefs = dictionaries.referenceLibrary;
    
    // 1. Generate PPR Sections
    for (let i = 0; i < pprSections.length; i++) {
      setPprSections(prev => { const n = [...prev]; n[i].status = 'generating'; return n; });
      const content = await generateSectionContent(project, pprSections[i].title, `Генерация основного раздела ППР: ${pprSections[i].title}`, activeRefs);
      setPprSections(prev => { const n = [...prev]; n[i].content = content; n[i].status = 'completed'; return n; });
    }

    // 2. Generate TK Sections for each selected work
    for (const work of project.workType) {
      const sections = project.tkMap[work] || [];
      for (let j = 0; j < sections.length; j++) {
        setProject(prev => {
          const nextTkMap = { ...prev.tkMap };
          const nextSections = [...nextTkMap[work]];
          nextSections[j].status = 'generating';
          nextTkMap[work] = nextSections;
          return { ...prev, tkMap: nextTkMap };
        });

        const content = await generateSectionContent(
          project, 
          sections[j].title, 
          `Генерация раздела "${sections[j].title}" Технологической Карты на вид работ: ${work}`, 
          activeRefs
        );

        setProject(prev => {
          const nextTkMap = { ...prev.tkMap };
          const nextSections = [...nextTkMap[work]];
          nextSections[j].content = content;
          nextSections[j].status = 'completed';
          nextTkMap[work] = nextSections;
          return { ...prev, tkMap: nextTkMap };
        });
      }
    }

    setIsGeneratingAll(false);
    showNotification("Документ ППР со всеми вложенными ТК успешно сформирован", "success");
  };

  const saveProjectVersion = () => {
    if (!project.projectName) return;
    setIsSaving(true);
    setTimeout(() => {
      const newId = project.id || `proj-${Date.now()}`;
      const versions = savedProjects.filter(p => p.id === newId);
      const nextVersion = versions.length > 0 ? Math.max(...versions.map(v => v.version)) + 1 : 1;
      const newSavedProject: SavedProject = {
        id: newId,
        version: nextVersion,
        data: { ...project, id: newId, version: nextVersion },
        pprSections: [...pprSections],
        timestamp: new Date().toISOString()
      };
      setSavedProjects(prev => [newSavedProject, ...prev]);
      setProject(prev => ({ ...prev, id: newId, version: nextVersion }));
      setIsSaving(false);
      showNotification(`Версия ${nextVersion} сохранена`, 'success');
    }, 500);
  };

  const loadProject = (saved: SavedProject) => {
    setProject(saved.data);
    setPprSections(saved.pprSections);
    setCurrentStep('edit');
  };

  const triggerSystemPrint = useCallback(() => {
    const fileName = `${project.projectName || "Документ"}`.replace(/[\s\W]+/g, '_');
    document.title = fileName;
    setTimeout(() => window.print(), 300);
  }, [project.projectName]);

  const toggleTkExpand = (work: string) => {
    setExpandedTks(prev => {
      const next = new Set(prev);
      if (next.has(work)) next.delete(work);
      else next.add(work);
      return next;
    });
  };

  const MainStamp = ({ pageNum, docCode }: { pageNum: number, docCode?: string }) => (
    <div className="main-stamp font-sans">
      <table className="stamp-table">
        <tbody>
          <tr style={{ height: '12mm' }}>
            <td colSpan={2} style={{ width: '120mm' }} className="border-r border-black">
              <div className="flex flex-col h-full text-[6pt]">
                <div className="border-b border-black grid grid-cols-5 text-center py-0.5">
                  <div className="border-r border-black">Изм.</div>
                  <div className="border-r border-black">Кол.уч</div>
                  <div className="border-r border-black">Лист</div>
                  <div className="border-r border-black">№док</div>
                  <div>Подп.</div>
                </div>
                <div className="flex-1 flex items-center justify-center font-bold text-[8pt]">
                  {docCode || project.workingDocCode || 'ШИФР-ДОКУМЕНТА'}
                </div>
              </div>
            </td>
            <td colSpan={2} className="p-1 text-center align-middle">
              <div className="text-[8pt] font-black uppercase leading-tight">{project.projectName || 'НАЗВАНИЕ ПРОЕКТА'}</div>
            </td>
          </tr>
          <tr style={{ height: '14mm' }}>
            <td style={{ width: '40mm' }} className="border-r border-black">
              <div className="grid grid-rows-2 h-full text-[6pt]">
                <div className="border-b border-black grid grid-cols-2 h-full">
                  <div className="border-r border-black flex items-center px-1">Разраб.</div>
                  <div className="flex items-center px-1 font-bold truncate">{project.roleDeveloper}</div>
                </div>
                <div className="grid grid-cols-2 h-full">
                  <div className="border-r border-black flex items-center px-1">Пров.</div>
                  <div className="flex items-center px-1 font-bold truncate">{project.roleClientChiefEngineer}</div>
                </div>
              </div>
            </td>
            <td style={{ width: '80mm' }} className="border-r border-black text-center p-1 align-middle">
               <div className="text-[7pt] font-medium leading-tight italic">{project.objectName || 'ОБЪЕКТ СТРОИТЕЛЬСТВА'}</div>
            </td>
            <td className="w-[20mm] border-r border-black text-center">
              <div className="text-[6pt]">Стадия</div>
              <div className="font-bold text-[9pt]">П</div>
            </td>
            <td className="w-[20mm] text-center">
              <div className="text-[6pt]">Лист</div>
              <div className="font-bold text-[9pt]">{pageNum}</div>
            </td>
          </tr>
          <tr style={{ height: '14mm' }}>
             <td colSpan={3} className="border-r border-black text-center align-middle">
                <div className="text-[8pt] font-black uppercase tracking-widest">{project.contractor || 'ОРГАНИЗАЦИЯ'}</div>
             </td>
             <td className="text-center align-middle">
                <div className="text-[7pt]">Листов</div>
                <div className="font-bold text-[9pt]">--</div>
             </td>
          </tr>
        </tbody>
      </table>
    </div>
  );

  // Global counter for pages
  let globalPageNum = 1;

  return (
    <div className="min-h-screen flex flex-col">
      {notification && (
        <div className={`fixed top-24 left-1/2 -translate-x-1/2 z-[300] bg-slate-900 text-white px-6 py-3 rounded-2xl shadow-2xl font-bold flex items-center gap-3 animate-in fade-in slide-in-from-top-4 ${notification.type === 'info' ? 'border-l-4 border-blue-500' : ''}`}>
          {notification.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-green-400" /> : notification.type === 'info' ? <Sparkles className="w-5 h-5 text-blue-400" /> : <AlertCircle className="w-5 h-5 text-red-400" />}
          {notification.message}
        </div>
      )}

      <header className="no-print bg-white border-b border-slate-200 sticky top-0 z-[200] px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setCurrentStep('new-project')}>
          <div className="bg-blue-600 p-2 rounded-lg shadow-lg"><HardHat className="text-white w-6 h-6" /></div>
          <div>
            <h1 className="text-xl font-black text-slate-800 tracking-tight leading-none">StroyDoc AI</h1>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Engineering Portal</span>
          </div>
        </div>
        <nav className="flex items-center gap-8">
           <button onClick={() => setCurrentStep('new-project')} className={`text-xs font-black uppercase flex items-center gap-2 ${currentStep === 'new-project' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>
             <PlusCircle className="w-4 h-4" /> Новый ППР
           </button>
           <button onClick={() => setCurrentStep('ppr-register')} className={`text-xs font-black uppercase flex items-center gap-2 ${currentStep === 'ppr-register' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>
             <ClipboardList className="w-4 h-4" /> Реестр ППР
           </button>
           <div className="relative" ref={dictRef}>
             <button onClick={() => setIsDictDropdownOpen(!isDictDropdownOpen)} className={`text-xs font-black uppercase flex items-center gap-2 ${currentStep === 'dictionaries' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>
               <Settings className="w-4 h-4" /> Справочники <ChevronDown className={`w-3 h-3 transition-transform ${isDictDropdownOpen ? 'rotate-180' : ''}`} />
             </button>
             {isDictDropdownOpen && (
               <div className="absolute top-full right-0 mt-2 w-64 bg-white border border-slate-100 rounded-2xl shadow-2xl py-2 z-[300] animate-in fade-in slide-in-from-top-2">
                 <button onClick={() => { setCurrentStep('dictionaries'); setDictTab('objects'); setIsDictDropdownOpen(false); }} className="w-full text-left px-4 py-2.5 text-[11px] font-black uppercase text-slate-600 hover:bg-slate-50 flex items-center gap-3">
                   <Database className="w-3.5 h-3.5" /> Объекты
                 </button>
                 <button onClick={() => { setCurrentStep('dictionaries'); setDictTab('clients'); setIsDictDropdownOpen(false); }} className="w-full text-left px-4 py-2.5 text-[11px] font-black uppercase text-slate-600 hover:bg-slate-50 flex items-center gap-3">
                   <Briefcase className="w-3.5 h-3.5" /> Заказчики
                 </button>
                 <button onClick={() => { setCurrentStep('dictionaries'); setDictTab('contractors'); setIsDictDropdownOpen(false); }} className="w-full text-left px-4 py-2.5 text-[11px] font-black uppercase text-slate-600 hover:bg-slate-50 flex items-center gap-3">
                   <Building2 className="w-3.5 h-3.5" /> Подрядчики
                 </button>
                 <div className="h-px bg-slate-100 mx-2 my-1" />
                 <button onClick={() => { setCurrentStep('dictionaries'); setDictTab('library'); setIsDictDropdownOpen(false); }} className="w-full text-left px-4 py-2.5 text-[11px] font-black uppercase text-blue-600 hover:bg-blue-50 flex items-center gap-3">
                   <Library className="w-3.5 h-3.5" /> Нормативы (RAG)
                 </button>
                 <button onClick={() => { setCurrentStep('dictionaries'); setDictTab('works'); setIsDictDropdownOpen(false); }} className="w-full text-left px-4 py-2.5 text-[11px] font-black uppercase text-slate-600 hover:bg-slate-50 flex items-center gap-3">
                   <Layers className="w-3.5 h-3.5" /> Каталог работ
                 </button>
               </div>
             )}
           </div>
        </nav>
      </header>

      <main className="flex-1 flex overflow-hidden">
        <aside className="no-print w-[400px] bg-white border-r border-slate-200 overflow-y-auto p-6 space-y-8 no-scrollbar">
           {currentStep === 'new-project' && (
             <div className="space-y-6 animate-in slide-in-from-left duration-300">
                <div className="bg-blue-50/50 p-5 rounded-2xl border border-blue-100 space-y-4">
                  <div className="space-y-2">
                    <h2 className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-2 ml-1 ${validationErrors.has('projectName') ? 'text-red-500' : 'text-blue-700'}`}>
                      <PenLine className="w-4 h-4" /> Название проекта {validationErrors.has('projectName') && <AlertCircle className="w-3 h-3" />}
                    </h2>
                    <input type="text" placeholder="Напр: ППР на монтаж металлоконструкций" value={project.projectName} onChange={(e) => updateProject('projectName', e.target.value)} className={`w-full bg-white border rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none shadow-sm transition-all ${validationErrors.has('projectName') ? 'border-red-400 bg-red-50/30' : 'border-blue-200'}`} />
                  </div>
                  <div className="space-y-2">
                    <SearchableInput label="Объект" value={project.objectName} onChange={(v: string) => updateProject('objectName', v)} suggestions={dictionaries.objects.map(o => o.name)} icon={<Database className="w-4 h-4" />} hasError={validationErrors.has('objectName')} />
                  </div>
                  <div className="space-y-2">
                    <SearchableInput label="Заказчик" value={project.client} onChange={(v: string) => updateProject('client', v)} suggestions={dictionaries.clients.map(c => c.name)} icon={<Briefcase className="w-4 h-4" />} hasError={validationErrors.has('client')} />
                    {project.client && (
                      <div className="pl-4 border-l-2 border-blue-100 mt-1 animate-in slide-in-from-left-2 duration-200">
                        <SearchableInput label="Гл. инженер заказчика" value={project.roleClientChiefEngineer} onChange={(v: string) => updateProject('roleClientChiefEngineer', v)} suggestions={dictionaries.clients.find(c => c.name === project.client)?.chiefEngineer ? [dictionaries.clients.find(c => c.name === project.client)!.chiefEngineer] : []} icon={<FileSignature className="w-3.5 h-3.5" />} placeholder="ФИО главного инженера" hasError={validationErrors.has('roleClientChiefEngineer')} />
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <SearchableInput label="Подрядчик" value={project.contractor} onChange={(v: string) => updateProject('contractor', v)} suggestions={dictionaries.contractors.map(c => c.name)} icon={<Building2 className="w-4 h-4" />} hasError={validationErrors.has('contractor')} />
                    {project.contractor && (
                      <div className="pl-4 border-l-2 border-blue-100 mt-1 animate-in slide-in-from-left-2 duration-200">
                        <SearchableInput label="Разработчик" value={project.roleDeveloper} onChange={(v: string) => updateProject('roleDeveloper', v)} suggestions={dictionaries.contractors.find(c => c.name === project.contractor)?.developer ? [dictionaries.contractors.find(c => c.name === project.contractor)!.developer] : []} icon={<UserCog className="w-3.5 h-3.5" />} placeholder="ФИО разработчика ППР" hasError={validationErrors.has('roleDeveloper')} />
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest border-l-4 border-slate-300 pl-3">Исходные документы (РД)</h2>
                    {isUploading && <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />}
                  </div>
                  
                  {project.workingDocs.length > 0 && (
                    <div className="space-y-2">
                      {project.workingDocs.map((doc, idx) => (
                        <div key={idx} className="flex items-center justify-between bg-slate-50 p-2 rounded-xl border border-slate-100 group">
                          <div className="flex items-center gap-2 overflow-hidden">
                            <Paperclip className="w-3 h-3 text-slate-400 flex-shrink-0" />
                            <span className="text-[10px] font-bold text-slate-600 truncate">{doc.name}</span>
                          </div>
                          <button onClick={() => setProject(p => ({...p, workingDocs: p.workingDocs.filter((_, i) => i !== idx)}))} className="p-1 hover:bg-red-50 text-slate-300 hover:text-red-500 rounded-lg transition-colors">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-slate-200 rounded-2xl p-6 text-center hover:border-blue-400 hover:bg-blue-50 cursor-pointer transition-all group shadow-sm">
                    <input type="file" ref={fileInputRef} className="hidden" multiple accept="application/pdf,image/*" onChange={handleFileUpload} />
                    <Upload className="w-8 h-8 text-slate-300 mx-auto mb-2 group-hover:text-blue-500 transition-colors" />
                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Загрузить документы РД</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest border-l-4 border-slate-300 pl-3">Анализ сметы</h2>
                  </div>
                  <div onClick={() => estimateInputRef.current?.click()} className="border-2 border-dashed border-slate-200 rounded-2xl p-6 text-center hover:border-blue-400 hover:bg-blue-50 cursor-pointer transition-all group shadow-sm">
                    <input type="file" ref={estimateInputRef} className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.xml" onChange={handleEstimateUpload} />
                    <Calculator className="w-8 h-8 text-slate-300 mx-auto mb-2 group-hover:text-blue-500 transition-colors" />
                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Импорт ведомости работ</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <button onClick={() => setIsWorkDetailsExpanded(!isWorkDetailsExpanded)} className="w-full flex items-center justify-between text-left">
                    <h2 className={`text-sm font-black uppercase tracking-widest border-l-4 pl-3 ${validationErrors.has('workType') ? 'text-red-500 border-red-500' : 'text-slate-400 border-slate-300'}`}>
                      Виды работ и Сроки {validationErrors.has('workType') && <AlertCircle className="w-4 h-4 inline ml-2" />}
                    </h2>
                    {isWorkDetailsExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  {isWorkDetailsExpanded && (
                    <div className="space-y-4">
                      <WorkTreeSelect label="Выбор из каталога (ФЕР/ФЕРм)" selectedItems={project.workType} onChange={(v) => updateProject('workType', v)} catalog={dictionaries.workCatalog} hasError={validationErrors.has('workType')} />
                      {project.workType.length > 0 && (
                        <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Calendar className="w-3.5 h-3.5" /> График (даты)</h3>
                          {project.workType.map(wt => {
                            const [start, end] = (project.workDeadlines[wt] || " - ").split(' - ');
                            return (
                              <div key={wt} className="space-y-1.5 pb-3 border-b border-slate-200 last:border-0 last:pb-0">
                                <p className="text-[10px] font-bold text-slate-700 truncate">{wt}</p>
                                <div className="grid grid-cols-2 gap-2">
                                  <input type="date" value={start || ''} onChange={(e) => updateDeadline(wt, 'start', e.target.value)} className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-[10px] font-bold text-slate-600" />
                                  <input type="date" value={end || ''} onChange={(e) => updateDeadline(wt, 'end', e.target.value)} className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-[10px] font-bold text-slate-600" />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-3">
                  <button onClick={() => { if(validateProjectData()) setCurrentStep('edit'); }} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black uppercase shadow-xl hover:bg-blue-700 transition-all flex items-center justify-center gap-2">
                    <PenLine className="w-5 h-5" /> Сформировать ППР и ТК
                  </button>
                  <button onClick={triggerSystemPrint} className="w-full bg-slate-100 text-slate-600 py-3 rounded-2xl font-black uppercase hover:bg-slate-200 transition-all flex items-center justify-center gap-2">
                    <Printer className="w-4 h-4" /> Предварительный просмотр
                  </button>
                </div>
             </div>
           )}

           {currentStep === 'edit' && (
             <div className="space-y-6 animate-in slide-in-from-left duration-300">
                <div className="flex items-center justify-between">
                   <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest border-l-4 border-blue-600 pl-3">Разделы ППР</h2>
                   <button onClick={generateAllInOne} disabled={isGeneratingAll} className="bg-blue-50 text-blue-600 p-2 rounded-lg flex items-center gap-2 text-[10px] font-black uppercase">
                     {isGeneratingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />} AI-Генерация всего
                   </button>
                </div>
                
                <div className="space-y-2">
                   {pprSections.map((s, idx) => (
                     <button key={s.id} onClick={() => document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth' })} className="w-full text-left p-3 rounded-xl border border-slate-100 hover:bg-slate-50 flex items-center justify-between text-xs font-bold transition-all group">
                        <span className="truncate group-hover:text-blue-600">{idx + 1}. {s.title}</span>
                        {s.status === 'completed' && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                        {s.status === 'generating' && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
                     </button>
                   ))}
                </div>

                <div className="space-y-3 pt-4 border-t border-slate-100">
                   <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-l-4 border-slate-300 pl-3">Технологические карты (в составе ППР)</h2>
                   {project.workType.map((work) => (
                     <div key={work} className="space-y-1">
                        <button onClick={() => toggleTkExpand(work)} className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-50 hover:bg-blue-50 border border-slate-100 transition-all group">
                           <div className="flex items-center gap-2 overflow-hidden">
                              <BookOpen className="w-4 h-4 text-blue-600 flex-shrink-0" />
                              <span className="text-[10px] font-black uppercase text-slate-700 truncate">{work}</span>
                           </div>
                           <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${expandedTks.has(work) ? 'rotate-180' : ''}`} />
                        </button>
                        {expandedTks.has(work) && (
                          <div className="pl-4 space-y-1 animate-in slide-in-from-top-2 duration-200">
                             {project.tkMap[work]?.map((tkSec, idx) => (
                               <button key={tkSec.id} onClick={() => document.getElementById(`${work}-${tkSec.id}`)?.scrollIntoView({ behavior: 'smooth' })} className="w-full text-left p-2 rounded-lg border border-transparent hover:border-slate-100 hover:bg-white flex items-center justify-between text-[9px] font-bold group">
                                  <span className="truncate group-hover:text-blue-600 italic">Раздел {idx + 1}: {tkSec.title}</span>
                                  {tkSec.status === 'completed' && <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}
                                  {tkSec.status === 'generating' && <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />}
                               </button>
                             ))}
                          </div>
                        )}
                     </div>
                   ))}
                </div>

                <div className="space-y-3 pt-6 border-t border-slate-100">
                  <button onClick={saveProjectVersion} disabled={isSaving} className="w-full bg-slate-900 text-white py-4 rounded-2xl text-xs font-black uppercase flex items-center justify-center gap-2 shadow-xl hover:bg-slate-800 transition-all">
                    <Save className="w-4 h-4" /> Сохранить весь проект
                  </button>
                </div>
             </div>
           )}

           {currentStep === 'ppr-register' && (
             <div className="space-y-4 animate-in slide-in-from-left duration-300">
                <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest border-l-4 border-blue-600 pl-3">
                  Реестр документов
                </h2>
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                  <input type="text" placeholder="Поиск по архиву..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-slate-50 border border-slate-100 rounded-xl pl-10 pr-4 py-2 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
                </div>
             </div>
           )}

           {currentStep === 'dictionaries' && (
             <div className="space-y-6 animate-in slide-in-from-left duration-300">
                <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest border-l-4 border-blue-600 pl-3">Системные данные</h2>
                <div className="flex flex-col gap-2">
                  <button onClick={() => setDictTab('library')} className={`text-left px-4 py-3 rounded-xl text-xs font-black uppercase transition-all flex items-center gap-3 ${dictTab === 'library' ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}>
                    <BookMarked className="w-4 h-4" /> Знания (RAG)
                  </button>
                  <button onClick={() => setDictTab('objects')} className={`text-left px-4 py-3 rounded-xl text-xs font-black uppercase transition-all flex items-center gap-3 ${dictTab === 'objects' ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}>
                    <Database className="w-4 h-4" /> Объекты
                  </button>
                  <button onClick={() => setDictTab('clients')} className={`text-left px-4 py-3 rounded-xl text-xs font-black uppercase transition-all flex items-center gap-3 ${dictTab === 'clients' ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}>
                    <Briefcase className="w-4 h-4" /> Заказчики
                  </button>
                  <button onClick={() => setDictTab('contractors')} className={`text-left px-4 py-3 rounded-xl text-xs font-black uppercase transition-all flex items-center gap-3 ${dictTab === 'contractors' ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}>
                    <Building2 className="w-4 h-4" /> Подрядчики
                  </button>
                </div>
             </div>
           )}
        </aside>

        <section className="flex-1 overflow-y-auto no-scrollbar scroll-smooth bg-slate-100/30">
           {currentStep === 'ppr-register' ? (
             <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h2 className="text-3xl font-black text-slate-800 uppercase tracking-tight leading-none">Реестр ППР</h2>
                    <p className="text-slate-400 font-medium mt-2">Комплексные проекты производства работ</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <button onClick={() => setCurrentStep('new-project')} className="bg-blue-600 text-white px-6 py-3 rounded-2xl text-xs font-black uppercase shadow-xl hover:bg-blue-700 transition-all flex items-center gap-2">
                      <Plus className="w-4 h-4" /> Создать новый
                    </button>
                  </div>
                </div>

                <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>
                        <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400">Название проекта</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400">Кол-во ТК</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400">Версия</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 w-24">Принтер</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {filteredProjects.length > 0 ? filteredProjects.map((p) => (
                        <tr key={`${p.id}-${p.version}`} className="hover:bg-blue-50/50 transition-colors group cursor-pointer" onClick={() => loadProject(p)}>
                          <td className="px-6 py-5">
                            <div className="text-sm font-black text-slate-800 group-hover:text-blue-600 uppercase leading-tight">{p.data.projectName}</div>
                          </td>
                          <td className="px-6 py-5"><div className="text-sm font-bold text-slate-600">{p.data.workType.length} шт.</div></td>
                          <td className="px-6 py-5"><span className="bg-slate-100 text-slate-500 px-3 py-1 rounded-full text-[10px] font-black">v.{p.version}</span></td>
                          <td className="px-6 py-5">
                            <button onClick={(e) => { e.stopPropagation(); loadProject(p); setTimeout(triggerSystemPrint, 500); }} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-white rounded-xl shadow-sm border border-transparent hover:border-blue-100 transition-all">
                              <Printer className="w-5 h-5" />
                            </button>
                          </td>
                        </tr>
                      )) : (
                        <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-300 font-black uppercase text-xs">Проекты не найдены</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
             </div>
           ) : currentStep === 'dictionaries' ? (
             <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
                {dictTab === 'library' ? (
                  <div className="space-y-8">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-3xl font-black text-slate-800 uppercase tracking-tight">Нормативы (RAG)</h2>
                        <p className="text-slate-400 font-medium mt-1">Файлы ГЭСН, ФЕР и СП для интеллектуальной генерации</p>
                      </div>
                      <button onClick={() => libraryInputRef.current?.click()} className="bg-blue-600 text-white px-6 py-3 rounded-2xl text-xs font-black uppercase flex items-center gap-2 shadow-xl hover:bg-blue-700 transition-all">
                        <Upload className="w-4 h-4" /> Добавить нормативы
                        <input type="file" ref={libraryInputRef} className="hidden" multiple accept=".pdf,.doc,.docx,.xls,.xlsx" onChange={handleLibraryUpload} />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {dictionaries.referenceLibrary.map((ref) => (
                        <div key={ref.id} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl transition-all group relative">
                          <button onClick={() => setDictionaries(d => ({...d, referenceLibrary: d.referenceLibrary.filter(f => f.id !== ref.id)}))} className="absolute top-4 right-4 p-2 opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all">
                            <Trash2 className="w-4 h-4" />
                          </button>
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${
                            ref.category === 'ГЭСН' ? 'bg-orange-100 text-orange-600' :
                            ref.category === 'ФЕР' ? 'bg-blue-100 text-blue-600' :
                            ref.category === 'СП' ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-600'
                          }`}>
                            <BookOpen className="w-6 h-6" />
                          </div>
                          <div className="text-[10px] font-black uppercase text-slate-400 mb-1">{ref.category}</div>
                          <h3 className="text-sm font-black text-slate-800 leading-tight mb-2 truncate" title={ref.name}>{ref.name}</h3>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 p-8 text-center">
                     <Database className="w-16 h-16 text-slate-100 mx-auto mb-4" />
                     <h3 className="text-xl font-black text-slate-800 uppercase">Раздел находится в разработке</h3>
                  </div>
                )}
             </div>
           ) : (
             <div className="document-preview-container flex flex-col items-center">
                {/* 1. Title Page */}
                <div className="page-container">
                    <div className="gost-frame"></div>
                    <div className="gost-content title-page-content font-gost p-8 text-center space-y-12">
                      <div className="text-[14pt] font-black uppercase">{project.contractor || 'НАИМЕНОВАНИЕ ОРГАНИЗАЦИИ'}</div>
                      <div className="text-[16pt] font-black border-y-4 border-black py-6 inline-block px-16">ПРОЕКТ ПРОИЗВОДСТВА РАБОТ</div>
                      <div className="text-[20pt] font-black uppercase">{project.projectName || '[НАЗВАНИЕ ПРОЕКТА]'}</div>
                      <div className="mt-auto absolute bottom-[15mm] left-0 right-0 text-center font-bold text-[12pt]">2024</div>
                    </div>
                </div>

                {/* 2. PPR Main Sections */}
                {pprSections.map((s, idx) => (
                  <div key={s.id} id={s.id} className="page-container">
                      <div className="gost-frame"></div>
                      <div className="gost-content p-10">
                        <h3 className="text-[14pt] font-black border-b-2 border-black mb-8 pb-2 uppercase">{idx + 1}. {s.title}</h3>
                        <div className="text-[11pt] whitespace-pre-wrap leading-relaxed font-gost">
                            {s.content ? cleanMarkdown(s.content) : 'Раздел еще не сгенерирован...'}
                        </div>
                      </div>
                      <MainStamp pageNum={++globalPageNum} />
                  </div>
                ))}

                {/* 3. Integrated Technological Cards (TK) */}
                {project.workType.map((work, workIdx) => (
                  <React.Fragment key={work}>
                    {/* TK Divider/Separator Title Page within PPR */}
                    <div className="page-container" id={`${work}-start`}>
                      <div className="gost-frame"></div>
                      <div className="gost-content flex flex-col items-center justify-center text-center p-20 space-y-10">
                         <Scissors className="w-16 h-16 text-slate-200" />
                         <div className="text-[12pt] font-bold text-slate-400 uppercase tracking-widest">Раздел: Технологические карты</div>
                         <h2 className="text-[22pt] font-black uppercase border-b-8 border-black pb-4">{work}</h2>
                         <div className="text-[11pt] font-medium leading-relaxed italic">
                           Приложение к ППР: {project.projectName}
                         </div>
                      </div>
                      <MainStamp pageNum={++globalPageNum} />
                    </div>

                    {/* TK Sections */}
                    {project.tkMap[work]?.map((tkSec, secIdx) => (
                      <div key={tkSec.id} id={`${work}-${tkSec.id}`} className="page-container">
                        <div className="gost-frame"></div>
                        <div className="gost-content p-10">
                           <div className="flex justify-between items-baseline border-b-2 border-black mb-6">
                             <h4 className="text-[13pt] font-black uppercase">ТК: {work}</h4>
                             <span className="text-[10pt] font-bold">Раздел {secIdx + 1}</span>
                           </div>
                           <h3 className="text-[14pt] font-black mb-6">{tkSec.title}</h3>
                           <div className="text-[11pt] whitespace-pre-wrap leading-relaxed font-gost">
                              {tkSec.content ? cleanMarkdown(tkSec.content) : 'Раздел ТК не сгенерирован...'}
                           </div>
                        </div>
                        <MainStamp pageNum={++globalPageNum} />
                      </div>
                    ))}
                  </React.Fragment>
                ))}
             </div>
           )}
        </section>
      </main>

      <footer className="no-print bg-slate-900 px-8 py-3 flex items-center justify-between text-[10px] font-black uppercase text-slate-500 border-t border-slate-800">
         <div className="flex items-center gap-8">
            <div className="flex items-center gap-2"><div className={`w-2 h-2 rounded-full ${isGeneratingAll ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'}`}></div> {isGeneratingAll ? 'AI Generating Document...' : 'AI Engine Ready'}</div>
            <div className="text-blue-500 flex items-center gap-2"><BookMarked className="w-3 h-3" /> Grounding: {dictionaries.referenceLibrary.length > 0 ? 'Active (RAG)' : 'Local Only'}</div>
         </div>
         <span className="tracking-widest opacity-50">StroyDoc AI — Комплексный генератор ППР и ТК — v2.6</span>
      </footer>
    </div>
  );
}

function SearchableInput({ label, value, onChange, suggestions, icon, placeholder, hasError }: any) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const click = (e: any) => { if (ref.current && !ref.current.contains(e.target)) setIsOpen(false); };
    document.addEventListener('mousedown', click);
    return () => document.removeEventListener('mousedown', click);
  }, []);
  const filteredSuggestions = suggestions.filter((s: string) => s.toLowerCase().includes(value.toLowerCase()));
  return (
    <div className="space-y-1 relative" ref={ref}>
      {label && (
        <label className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-2 ml-1 ${hasError ? 'text-red-500' : 'text-blue-700'}`}>
          {icon} {label} {hasError && <AlertCircle className="w-3 h-3" />}
        </label>
      )}
      <div className="relative">
        <input 
          type="text" 
          value={value} 
          onChange={(e) => { onChange(e.target.value); setIsOpen(true); }} 
          onFocus={() => setIsOpen(true)} 
          className={`w-full bg-white border rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none shadow-sm transition-all ${hasError ? 'border-red-400 bg-red-50/30' : 'border-blue-200'}`} 
          placeholder={placeholder || `Введите или выберите...`} 
        />
        <ChevronDown className={`absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>
      {isOpen && filteredSuggestions.length > 0 && (
        <div className="absolute z-[250] left-0 right-0 mt-1 bg-white border border-slate-100 rounded-xl shadow-2xl max-h-56 overflow-y-auto animate-in fade-in slide-in-from-top-2">
          {filteredSuggestions.map((s: string) => (
            <button key={s} onClick={() => { onChange(s); setIsOpen(false); }} className="w-full text-left px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-blue-50 border-b border-slate-50 last:border-0 transition-colors">{s}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function WorkTreeSelect({ label, selectedItems, onChange, catalog, hasError }: { label: string, selectedItems: string[], onChange: (v: string[]) => void, catalog: WorkCatalogNode, hasError?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const click = (e: any) => { if (ref.current && !ref.current.contains(e.target)) setIsOpen(false); };
    document.addEventListener('mousedown', click);
    return () => document.removeEventListener('mousedown', click);
  }, []);

  const toggleItem = (v: string) => {
    if (selectedItems.includes(v)) onChange(selectedItems.filter(i => i !== v));
    else onChange([...selectedItems, v]);
  };

  const toggleCategory = (cat: string) => {
    setExpandedCats(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const toggleType = (type: string) => {
    setExpandedTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  return (
    <div className="space-y-1 relative" ref={ref}>
      <label className={`text-[10px] font-black uppercase ml-1 ${hasError ? 'text-red-500' : 'text-slate-400'}`}>
        {label} {hasError && <AlertCircle className="w-3 h-3 inline ml-1" />}
      </label>
      <div className={`min-h-[44px] border rounded-2xl p-2.5 flex flex-wrap gap-1.5 cursor-pointer shadow-inner transition-all ${hasError ? 'border-red-400 bg-red-50/30' : 'bg-slate-50 border-slate-100'}`} onClick={() => setIsOpen(!isOpen)}>
        {selectedItems.map(v => (
          <span key={v} className="text-[9px] font-black uppercase px-2 py-1 rounded-lg flex items-center gap-1.5 shadow-sm bg-blue-600 text-white">
            {v} <X className="w-2.5 h-2.5 cursor-pointer" onClick={(e) => { e.stopPropagation(); toggleItem(v); }} />
          </span>
        ))}
        {selectedItems.length === 0 && <span className="text-slate-300 text-[10px] p-1.5 font-bold uppercase">Выбор работ...</span>}
      </div>

      {isOpen && (
        <div className="absolute z-[250] left-0 right-0 mt-2 bg-white border border-slate-100 rounded-2xl shadow-2xl max-h-[550px] flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-2">
          <div className="p-4 bg-slate-50 border-b border-slate-100">
            <input type="text" placeholder="Поиск по названию работы..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          
          <div className="overflow-y-auto flex-1 p-2 space-y-1 custom-scrollbar bg-white">
            {Object.entries(catalog).map(([catName, types]) => {
              const isCatExpanded = expandedCats.has(catName);
              
              return (
                <div key={catName} className="space-y-1">
                  <button onClick={() => toggleCategory(catName)} className={`w-full flex items-center gap-2 p-2.5 rounded-xl hover:bg-slate-50 text-left transition-colors ${isCatExpanded ? 'bg-slate-50' : ''}`}>
                    <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isCatExpanded ? '' : '-rotate-90'}`} />
                    <span className="text-[11px] font-black uppercase text-slate-800 tracking-wider">{catName}</span>
                  </button>

                  {isCatExpanded && (
                    <div className="pl-6 space-y-1">
                      {Object.entries(types).map(([typeName, jobs]) => {
                        const typeId = `${catName}-${typeName}`;
                        const isTypeExpanded = expandedTypes.has(typeId);
                        
                        return (
                          <div key={typeName} className="space-y-1">
                            <button onClick={() => toggleType(typeId)} className={`w-full flex items-center gap-2 p-2 rounded-lg hover:bg-blue-50/30 text-left transition-colors ${isTypeExpanded ? 'bg-blue-50/20' : ''}`}>
                              <ChevronRight className={`w-3.5 h-3.5 text-blue-400 transition-transform ${isTypeExpanded ? 'rotate-90' : ''}`} />
                              <span className="text-[10px] font-bold text-slate-600 uppercase">{typeName}</span>
                            </button>

                            {isTypeExpanded && (
                              <div className="pl-6 space-y-0.5 border-l-2 border-slate-100 ml-1.5">
                                {jobs.filter(j => j.toLowerCase().includes(search.toLowerCase())).map((job) => (
                                  <button 
                                    key={job} 
                                    onClick={() => toggleItem(job)} 
                                    className={`w-full text-left px-3 py-1.5 rounded-lg text-[10px] font-medium flex items-center justify-between transition-all group ${selectedItems.includes(job) ? 'bg-blue-600 text-white' : 'hover:bg-slate-50 text-slate-500'}`}
                                  >
                                    <span className="truncate">{job}</span>
                                    {selectedItems.includes(job) && <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          
          <div className="p-4 border-t border-slate-100 flex justify-end bg-slate-50">
            <button onClick={() => setIsOpen(false)} className="bg-slate-900 text-white px-6 py-2.5 rounded-xl text-[10px] font-black uppercase shadow-lg hover:bg-slate-800 transition-all">Готово</button>
          </div>
        </div>
      )}
    </div>
  );
}
