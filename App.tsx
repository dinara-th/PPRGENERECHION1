
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
  Scissors,
  PlayCircle,
  RefreshCw,
  Sparkle,
  ListOrdered
} from 'lucide-react';
import { ProjectData, DocumentType, DocSection, WorkingDoc, SavedProject, ConstructionObject, ClientEntry, ContractorEntry, ReferenceFile } from './types';
import { generateSectionContent, extractDocInfo, extractWorksFromEstimate } from './geminiService';

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

const splitContentIntoPages = (content: string, charsPerPage: number = 2600): string[] => {
  if (!content) return [""];
  const pages: string[] = [];
  let remaining = content;
  while (remaining.length > 0) {
    if (remaining.length <= charsPerPage) {
      pages.push(remaining);
      break;
    }
    let splitIdx = remaining.lastIndexOf('\n', charsPerPage);
    if (splitIdx < charsPerPage * 0.7) splitIdx = charsPerPage;
    pages.push(remaining.substring(0, splitIdx).trim());
    remaining = remaining.substring(splitIdx).trim();
  }
  return pages.length > 0 ? pages : [""];
};

export default function App() {
  const [project, setProject] = useState<ProjectData>(INITIAL_PROJECT);
  const [pprSections, setPprSections] = useState<DocSection[]>(PPR_SECTIONS_TEMPLATE);
  const [currentStep, setCurrentStep] = useState<'new-project' | 'edit' | 'dictionaries' | 'ppr-register' | 'knowledge'>('new-project');
  const [dictTab, setDictTab] = useState<'objects' | 'clients' | 'contractors' | 'works'>('objects');
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error' | 'info'} | null>(null);
  const [dictionaries, setDictionaries] = useState<HierarchicalDict>(INITIAL_HIERARCHICAL_DICT);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const estimateInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);

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

    // Title Page
    pages.push({ type: 'title', pageNum: currentPage++ });
    
    // TOC Placeholder
    pages.push({ type: 'toc', pageNum: currentPage++ });
    
    // PPR Sections
    pprSections.forEach((s, idx) => {
      const content = s.content || 'Раздел ожидает генерации...';
      const sectionPages = splitContentIntoPages(content);
      tocEntries.push({ title: `${idx + 1}. ${s.title}`, page: currentPage, level: 1 });
      sectionPages.forEach((pContent, pIdx) => {
        pages.push({ type: 'ppr', title: s.title, index: idx + 1, content: pContent, isFirstPage: pIdx === 0, pageNum: currentPage++ });
      });
    });

    // TK Sections
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

    return { pages, tocEntries, totalPages: currentPage - 1 };
  }, [pprSections, project.workType, project.tkMap]);

  useEffect(() => {
    const data = localStorage.getItem('stroydoc_projects');
    if (data) try { setSavedProjects(JSON.parse(data)); } catch (e) {}
    const dicts = localStorage.getItem('stroydoc_dictionaries');
    if (dicts) try { setDictionaries(prev => ({ ...prev, ...JSON.parse(dicts) })); } catch (e) {}
  }, []);

  const showNotification = (message: string, type: 'success' | 'error' | 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
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
      }
      return next;
    });
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    setIsUploading(true);
    const newDocs: WorkingDoc[] = [];
    
    try {
      // 1. Сначала читаем все файлы и добавляем их в стейт, чтобы импорт "сработал"
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

      // 2. Затем пробуем извлечь информацию из первого файла (фоново)
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

  const generateSinglePprSection = async (idx: number) => {
    setPprSections(prev => { const n = [...prev]; n[idx].status = 'generating'; return n; });
    try {
      const content = await generateSectionContent(project, pprSections[idx].title, `Раздел ППР: ${pprSections[idx].title}`, dictionaries.referenceLibrary);
      setPprSections(prev => { const n = [...prev]; n[idx].content = content; n[idx].status = 'completed'; return n; });
    } catch (e) {
      setPprSections(prev => { const n = [...prev]; n[idx].status = 'idle'; return n; });
      showNotification("Ошибка генерации раздела", "error");
    }
  };

  const MainStamp = ({ pageNum }: { pageNum: number }) => (
    <div className="main-stamp font-sans">
      <table className="stamp-table">
        <tbody>
          <tr style={{ height: '12mm' }}>
            <td colSpan={2} style={{ width: '120mm' }} className="border-r border-black">
              <div className="flex flex-col h-full text-[6pt]">
                <div className="border-b border-black grid grid-cols-5 text-center py-0.5">
                  <div>Изм.</div><div>Кол.уч</div><div>Лист</div><div>№док</div><div>Подп.</div>
                </div>
                <div className="flex-1 flex items-center justify-center font-bold text-[8pt]">{project.workingDocCode || 'ШИФР'}</div>
              </div>
            </td>
            <td colSpan={2} className="p-1 text-center align-middle">
              <div className="text-[7pt] font-black uppercase leading-tight">{project.projectName || 'ПРОЕКТ'}</div>
            </td>
          </tr>
          <tr style={{ height: '14mm' }}>
            <td style={{ width: '40mm' }} className="border-r border-black">
              <div className="grid grid-rows-2 h-full text-[6pt]">
                <div className="border-b border-black px-1 flex items-center justify-between"><span>Разраб.</span><span className="font-bold">{project.roleDeveloper}</span></div>
                <div className="px-1 flex items-center justify-between"><span>Пров.</span><span className="font-bold">{project.roleClientChiefEngineer}</span></div>
              </div>
            </td>
            <td style={{ width: '80mm' }} className="border-r border-black text-center p-1 align-middle text-[7pt] italic">{project.objectName}</td>
            <td className="w-[20mm] border-r border-black text-center"><div className="text-[6pt]">Стадия</div><div className="font-bold text-[9pt]">П</div></td>
            <td className="w-[20mm] text-center"><div className="text-[6pt]">Лист</div><div className="font-bold text-[9pt]">{pageNum}</div></td>
          </tr>
          <tr style={{ height: '14mm' }}>
             <td colSpan={3} className="border-r border-black text-center align-middle text-[8pt] font-black uppercase">{project.contractor}</td>
             <td className="text-center align-middle"><div className="text-[7pt]">Листов</div><div className="font-bold text-[9pt]">{docLayout.totalPages}</div></td>
          </tr>
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col">
      {notification && (
        <div className={`fixed top-20 right-6 z-[1000] p-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-bounce ${notification.type === 'success' ? 'bg-green-600 text-white' : notification.type === 'error' ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'}`}>
           {notification.type === 'success' ? <CheckCircle2 className="w-5" /> : <Info className="w-5" />}
           <span className="text-xs font-black uppercase">{notification.message}</span>
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
           <button onClick={() => setCurrentStep('new-project')} className={`text-xs font-black uppercase flex items-center gap-2 ${currentStep === 'new-project' || currentStep === 'edit' ? 'text-blue-600' : 'text-slate-400'}`}><PlusCircle className="w-4" /> Создать</button>
           <button onClick={() => setCurrentStep('ppr-register')} className={`text-xs font-black uppercase flex items-center gap-2 ${currentStep === 'ppr-register' ? 'text-blue-600' : 'text-slate-400'}`}><ClipboardList className="w-4" /> Реестр ППР</button>
           <button onClick={() => setCurrentStep('dictionaries')} className={`text-xs font-black uppercase flex items-center gap-2 ${currentStep === 'dictionaries' ? 'text-blue-600' : 'text-slate-400'}`}><Settings className="w-4" /> Справочники</button>
           <button onClick={() => setCurrentStep('knowledge')} className={`text-xs font-black uppercase flex items-center gap-2 ${currentStep === 'knowledge' ? 'text-blue-600' : 'text-slate-400'}`}><BookMarked className="w-4" /> База знаний</button>
           <button onClick={() => window.print()} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-black uppercase flex items-center gap-2 shadow-lg hover:bg-blue-700"><Printer className="w-4" /> Печать</button>
        </nav>
      </header>

      <main className="flex-1 flex overflow-hidden">
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

                    <div className="grid grid-cols-2 gap-4">
                      <div onClick={() => !isUploading && fileInputRef.current?.click()} className={`border-2 border-dashed border-slate-200 rounded-2xl p-4 text-center transition-all ${isUploading ? 'bg-slate-50 cursor-not-allowed opacity-50' : 'hover:bg-blue-50 cursor-pointer group'}`}>
                        <input type="file" ref={fileInputRef} className="hidden" multiple onChange={handleFileUpload} />
                        {isUploading ? <Loader2 className="w-6 h-6 text-blue-500 mx-auto mb-1 animate-spin" /> : <Upload className="w-6 h-6 text-slate-300 mx-auto mb-1 group-hover:text-blue-500" />}
                        <p className="text-[9px] font-black text-slate-500 uppercase">{isUploading ? 'Загрузка...' : 'Импорт РД'}</p>
                      </div>
                      <div onClick={() => !isExtracting && estimateInputRef.current?.click()} className={`border-2 border-dashed border-slate-200 rounded-2xl p-4 text-center transition-all ${isExtracting ? 'bg-slate-50 cursor-not-allowed opacity-50' : 'hover:bg-green-50 cursor-pointer group'}`}>
                        <input type="file" ref={estimateInputRef} className="hidden" onChange={handleEstimateUpload} />
                        {isExtracting ? <Loader2 className="w-6 h-6 text-green-500 mx-auto mb-1 animate-spin" /> : <Calculator className="w-6 h-6 text-slate-300 mx-auto mb-1 group-hover:text-green-500" />}
                        <p className="text-[9px] font-black text-slate-500 uppercase">{isExtracting ? 'Анализ...' : 'Импорт сметы'}</p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h2 className="text-[10px] font-black uppercase text-slate-400 tracking-widest border-l-4 border-slate-300 pl-3">Виды работ ({project.workType.length})</h2>
                      <WorkTreeSelect label="Выбрать из каталога" selectedItems={project.workType} onChange={(v: any) => updateProject('workType', v)} catalog={dictionaries.workCatalog} />
                      {project.workType.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {project.workType.map(w => (
                            <span key={w} className="bg-slate-100 text-slate-600 px-2 py-1 rounded-lg text-[9px] font-bold flex items-center gap-1">
                              {w} <X className="w-3 cursor-pointer hover:text-red-500" onClick={() => updateProject('workType', project.workType.filter(i => i !== w))} />
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <button onClick={() => setCurrentStep('edit')} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black uppercase shadow-xl hover:bg-blue-700 transition-all flex items-center justify-center gap-2">
                      Перейти к генерации <ChevronRight className="w-4" />
                    </button>
                  </>
                ) : (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                       <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest border-l-4 border-blue-600 pl-3">Генерация разделов</h2>
                       <button onClick={() => setIsGeneratingAll(true)} className="bg-blue-50 text-blue-600 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 hover:bg-blue-100 transition-all"><Zap className="w-4" /> Старт AI</button>
                    </div>
                    <div className="space-y-2">
                       {pprSections.map((s, idx) => (
                         <div key={s.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-white shadow-sm hover:border-blue-200 transition-all">
                           <span className="text-xs font-bold text-slate-700 truncate pr-2">{idx + 1}. {s.title}</span>
                           <button onClick={() => generateSinglePprSection(idx)} className="text-blue-600 p-1 hover:bg-blue-50 rounded-lg">
                             {s.status === 'generating' ? <Loader2 className="w-4 animate-spin" /> : <PlayCircle className="w-5" />}
                           </button>
                         </div>
                       ))}
                    </div>
                    <button onClick={() => setCurrentStep('new-project')} className="w-full bg-slate-100 text-slate-600 py-3 rounded-xl font-black uppercase text-[10px] hover:bg-slate-200 transition-all">Назад к данным</button>
                  </div>
                )}
             </div>
           )}

           {currentStep === 'dictionaries' && (
             <div className="space-y-6">
                <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest border-l-4 border-slate-300 pl-3">Справочники</h2>
                <div className="flex flex-col gap-2">
                   {['objects', 'clients', 'contractors', 'works'].map((tab: any) => (
                     <button key={tab} onClick={() => setDictTab(tab)} className={`w-full text-left px-4 py-3 rounded-xl text-xs font-black uppercase transition-all ${dictTab === tab ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}>
                       {tab === 'objects' && 'Строительные объекты'}
                       {tab === 'clients' && 'Заказчики / ГИПы'}
                       {tab === 'contractors' && 'Подрядные организации'}
                       {tab === 'works' && 'Каталог видов работ'}
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
           ) : currentStep === 'dictionaries' ? (
              <div className="bg-white rounded-3xl shadow-xl p-10 max-w-4xl mx-auto border border-slate-100">
                 <div className="flex items-center justify-between mb-8">
                    <h2 className="text-2xl font-black uppercase tracking-tight text-slate-800">Редактор справочника</h2>
                    <button className="bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-black uppercase flex items-center gap-2"><Plus className="w-4" /> Добавить</button>
                 </div>
                 <div className="overflow-hidden rounded-2xl border border-slate-100">
                    <table className="w-full text-left">
                       <thead className="bg-slate-50 border-b border-slate-100">
                          <tr>
                             <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400">Наименование</th>
                             <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400">Параметры</th>
                             <th className="px-6 py-4 text-right"></th>
                          </tr>
                       </thead>
                       <tbody className="divide-y divide-slate-50">
                          {dictTab === 'objects' && dictionaries.objects.map(o => (
                            <tr key={o.id} className="hover:bg-slate-50 transition-colors">
                               <td className="px-6 py-4 text-sm font-bold text-slate-700">{o.name}</td>
                               <td className="px-6 py-4 text-xs text-slate-500">{o.address}</td>
                               <td className="px-6 py-4 text-right"><button className="text-slate-300 hover:text-red-500"><Trash2 className="w-4" /></button></td>
                            </tr>
                          ))}
                       </tbody>
                    </table>
                 </div>
              </div>
           ) : currentStep === 'knowledge' ? (
              <div className="bg-white rounded-3xl shadow-xl p-10 max-w-3xl mx-auto border border-slate-100 text-center space-y-6">
                 <div className="bg-blue-50 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto"><BookOpen className="text-blue-600 w-10 h-10" /></div>
                 <h2 className="text-2xl font-black uppercase">База знаний AI</h2>
                 <p className="text-slate-500 max-w-md mx-auto">Здесь хранятся ваши корпоративные стандарты, техкарты и нормативы. AI будет строить ответы, опираясь на эти данные.</p>
                 <div className="grid grid-cols-2 gap-4">
                    <div className="p-6 border border-slate-100 rounded-3xl text-left bg-slate-50/50">
                       <h4 className="text-[10px] font-black uppercase text-slate-400 mb-2">Загружено файлов</h4>
                       <div className="text-3xl font-black text-blue-600">0</div>
                    </div>
                    <div className="p-6 border border-slate-100 rounded-3xl text-left bg-slate-50/50">
                       <h4 className="text-[10px] font-black uppercase text-slate-400 mb-2">Проиндексировано</h4>
                       <div className="text-3xl font-black text-green-600">100%</div>
                    </div>
                 </div>
              </div>
           ) : (
             <div className="flex flex-col items-center gap-10">
               {docLayout.pages.map((page, idx) => {
                  if (page.type === 'title') {
                    return (
                      <div key={idx} className="page-container">
                        <div className="gost-frame"></div>
                        <div className="gost-content title-page-content font-gost p-12 text-center flex flex-col justify-center">
                           <div className="text-[14pt] font-black uppercase mb-16 underline decoration-2 underline-offset-8">{project.contractor || 'ОРГАНИЗАЦИЯ'}</div>
                           <div className="flex-1 flex flex-col items-center justify-center space-y-10">
                              <div className="text-[18pt] font-black border-y-4 border-black py-8 px-12 uppercase leading-tight">ПРОЕКТ ПРОИЗВОДСТВА РАБОТ</div>
                              <div className="text-[22pt] font-black uppercase tracking-tight px-4 leading-none">{project.projectName || '[НАЗВАНИЕ ПРОЕКТА]'}</div>
                              <div className="space-y-6 pt-10">
                                 <div className="text-[13pt] font-bold border-t-2 border-black pt-6 uppercase">Объект: {project.objectName || '[ОБЪЕКТ]'}</div>
                                 <div className="text-[11pt] italic text-slate-600">Разработано на основании РД: {project.workingDocCode || '[ШИФР]'}</div>
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
                  if (page.type === 'toc') {
                    return (
                      <div key={idx} className="page-container">
                        <div className="gost-frame"></div>
                        <div className="gost-content p-12 font-gost">
                           <h3 className="text-[16pt] font-black text-center mb-10 border-b-2 border-black pb-2 uppercase">Содержание</h3>
                           <div className="space-y-4">
                              {docLayout.tocEntries.map((entry, eIdx) => (
                                <div key={eIdx} className={`flex items-baseline gap-2 ${entry.level === 2 ? 'pl-8 text-[10pt]' : 'text-[11pt] font-bold'}`}>
                                   <span className="flex-shrink-0">{entry.title}</span>
                                   <div className="flex-1 border-b border-dotted border-slate-400 translate-y-[-4px]"></div>
                                   <span className="flex-shrink-0">{entry.page}</span>
                                </div>
                              ))}
                           </div>
                        </div>
                        <MainStamp pageNum={page.pageNum} />
                      </div>
                    );
                  }
                  if (page.type === 'tk-separator') {
                    return (
                      <div key={idx} className="page-container">
                        <div className="gost-frame"></div>
                        <div className="gost-content flex flex-col items-center justify-center text-center p-20 space-y-12">
                           <Scissors className="w-16 h-16 text-slate-300" />
                           <h2 className="text-[24pt] font-black uppercase border-b-8 border-black pb-6 px-10 leading-tight">{page.title}</h2>
                           <div className="text-[12pt] font-bold text-slate-400 uppercase tracking-widest">Технологическая карта</div>
                        </div>
                        <MainStamp pageNum={page.pageNum} />
                      </div>
                    );
                  }
                  return (
                    <div key={idx} className="page-container">
                       <div className="gost-frame"></div>
                       <div className="gost-content p-12">
                          {page.isFirstPage && (
                            <div className="border-b-2 border-black mb-6 pb-2">
                               <h3 className="text-[13pt] font-black uppercase">
                                 {page.type === 'ppr' ? `${page.index}. ${page.title}` : `${page.index}. ${page.secTitle}`}
                               </h3>
                            </div>
                          )}
                          <div className="text-[11pt] whitespace-pre-wrap leading-relaxed font-gost text-justify">
                             {cleanMarkdown(page.content)}
                          </div>
                       </div>
                       <MainStamp pageNum={page.pageNum} />
                    </div>
                  );
               })}
             </div>
           )}
        </section>
      </main>
      
      <footer className="no-print bg-slate-900 px-8 py-3 flex items-center justify-between text-[10px] font-black uppercase text-slate-500 border-t border-slate-800">
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
      <label className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2 ml-1 text-blue-700">{icon} {label}</label>
      <input type="text" value={value} onChange={(e) => { onChange(e.target.value); setIsOpen(true); }} onFocus={() => setIsOpen(true)} className="w-full bg-white border border-blue-200 rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none shadow-sm transition-all" />
      {isOpen && suggestions.length > 0 && (
        <div className="absolute z-[250] left-0 right-0 mt-1 bg-white border border-slate-100 rounded-xl shadow-2xl max-h-48 overflow-y-auto custom-scrollbar">
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
      <label className="text-[10px] font-black uppercase ml-1 text-slate-400">{label}</label>
      <div onClick={() => setIsOpen(!isOpen)} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold flex justify-between items-center cursor-pointer shadow-sm hover:border-blue-300 transition-all">
        <span className="truncate">{selectedItems.length ? `Выбрано: ${selectedItems.length}` : 'Выбрать работы...'}</span>
        <ChevronDown className="w-4 text-slate-400" />
      </div>
      {isOpen && (
        <div className="absolute z-[250] left-0 right-0 mt-1 bg-white border border-slate-100 rounded-xl shadow-2xl max-h-64 overflow-y-auto p-2 custom-scrollbar">
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
