import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, Footer, Header, SectionType, PageOrientation, HeadingLevel, PageNumber, PageBorderDisplay, PageBorderOffsetFrom } from "docx";
import FileSaver from "file-saver";
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
  Map,
  CheckSquare,
  Eye,
  File as FileIcon,
  ScanSearch,
  Terminal,
  Activity,
  GripHorizontal,
  Maximize2,
  Minimize2,
  HelpCircle,
  TableProperties
} from 'lucide-react';
import { ProjectData, DocumentType, DocSection, WorkingDoc, SavedProject, ConstructionObject, ClientEntry, ContractorEntry, ReferenceFile } from './types';
import { generateSectionContent, extractDocInfo, extractWorksFromEstimate, extractPosData, validateProjectDocs } from './geminiService';

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

interface LogEntry {
  id: string;
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'ai';
}

interface HelpArticle {
    id: string;
    title: string;
    icon: React.ReactNode;
    content: React.ReactNode;
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
  workingDocCode: '', // Default empty as requested
  roleDeveloper: '',
  roleClientChiefEngineer: '',
  roleAuthorSupervision: '',
  date: new Date().toISOString().split('T')[0],
  tkMap: {},
  workingDocs: [],
  gesnDocs: [],
  aiWorksFromEstimate: [],
  aiWorksFromDocs: [],
};

// ... HELP_CONTENT ... (Same as before)
const HELP_CONTENT: HelpArticle[] = [
    {
        id: 'start',
        title: 'Начало работы',
        icon: <PlusCircle className="w-5" />,
        content: (
            <div className="space-y-4">
                <p>Для создания нового проекта ППР выполните следующие шаги:</p>
                <ol className="list-decimal pl-5 space-y-2">
                    <li>Нажмите кнопку <b>"Создать"</b> в верхней панели.</li>
                    <li>В блоке <b>"Исходные данные"</b> загрузите имеющуюся документацию.</li>
                    <li>Если у вас есть выгрузка из ГЭСН/ФЕР (в формате Excel/CSV/JSON), загрузите её в разделе <b>"База знаний"</b>.</li>
                </ol>
            </div>
        )
    },
    // ...
];

// ... splitContentIntoPages ... (Same as before)
const splitContentIntoPages = (content: string): string[] => {
  if (!content) return [""];
  const MAX_LINES_PER_PAGE = 44; 
  const AVG_CHARS_PER_LINE = 85; 
  const AVG_CHARS_PER_TABLE_LINE = 55;

  const pages: string[] = [];
  let currentPageLines: string[] = [];
  let currentHeight = 0;
  let insideTable = false;
  let tableHeader: string[] = [];

  const rawLines = content.split('\n');

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const trimmed = line.trim();
    const isTableLine = trimmed.startsWith('|');
    
    if (isTableLine) {
       if (!insideTable) {
           insideTable = true;
           if (i + 1 < rawLines.length && rawLines[i+1].trim().startsWith('|') && rawLines[i+1].includes('---')) {
               tableHeader = [line, rawLines[i+1]];
           } else {
               tableHeader = [line]; 
           }
       }
    } else {
       if (trimmed !== '') {
           insideTable = false;
           tableHeader = [];
       }
    }
    const charsDivisor = insideTable ? AVG_CHARS_PER_TABLE_LINE : AVG_CHARS_PER_LINE;
    let visualLines = Math.max(1, Math.ceil(line.length / charsDivisor));
    const isHeader = trimmed.startsWith('#');
    if (isHeader) visualLines += 1;
    if (trimmed === '') visualLines = 1;

    const isOrphanCandidate = isHeader && (currentHeight > MAX_LINES_PER_PAGE - 5);
    const willOverflow = currentHeight + visualLines > MAX_LINES_PER_PAGE;

    if (willOverflow || isOrphanCandidate) {
        pages.push(currentPageLines.join('\n'));
        currentPageLines = [];
        currentHeight = 0;
        if (insideTable && tableHeader.length > 0) {
            const isProcessingHeader = tableHeader.includes(line);
            if (!isProcessingHeader) {
                currentPageLines.push(...tableHeader);
                currentHeight += 2;
            }
        }
    }
    currentPageLines.push(line);
    currentHeight += visualLines;
  }
  if (currentPageLines.length > 0) pages.push(currentPageLines.join('\n'));
  return pages;
};

// ... generateWordDocument ... (Same as before)
const generateWordDocument = (project: ProjectData, pprSections: DocSection[], onLog: (msg: string, type: 'info' | 'success' | 'error') => void) => {
    // ... (Code omitted for brevity, logic identical to previous version) ...
    onLog("Начало формирования DOCX файла...", 'info');
    const docCipher = project.workingDocCode ? `ППР-${project.workingDocCode}` : 'ППР-ШИФР';
    const cellBorder = { style: BorderStyle.SINGLE, size: 1, color: "000000" };
    const borderStyle = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder };
    
    const textSmall = { font: "Times New Roman", size: 14 }; 
    const textBold = { font: "Times New Roman", size: 16, bold: true }; 
    const textNormal = { font: "Times New Roman", size: 24 };

    // ... (Helper functions createStampForm6, createStampForm5, parseMarkdownToDocx same as before)
    const createStampForm6 = () => {
        return new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
                new TableRow({
                    height: { value: 850, rule: "exact" }, // 15mm
                    children: [
                        new TableCell({ width: { size: 6, type: WidthType.PERCENTAGE }, borders: borderStyle, children: [new Paragraph({ children: [new TextRun({ text: "Изм.", ...textSmall })], alignment: AlignmentType.CENTER })] }),
                        new TableCell({ width: { size: 6, type: WidthType.PERCENTAGE }, borders: borderStyle, children: [new Paragraph({ children: [new TextRun({ text: "Кол.уч", ...textSmall })], alignment: AlignmentType.CENTER })] }),
                        new TableCell({ width: { size: 6, type: WidthType.PERCENTAGE }, borders: borderStyle, children: [new Paragraph({ children: [new TextRun({ text: "Лист", ...textSmall })], alignment: AlignmentType.CENTER })] }),
                        new TableCell({ width: { size: 6, type: WidthType.PERCENTAGE }, borders: borderStyle, children: [new Paragraph({ children: [new TextRun({ text: "№док", ...textSmall })], alignment: AlignmentType.CENTER })] }),
                        new TableCell({ width: { size: 11, type: WidthType.PERCENTAGE }, borders: borderStyle, children: [new Paragraph({ children: [new TextRun({ text: "Подп.", ...textSmall })], alignment: AlignmentType.CENTER })] }),
                        new TableCell({ width: { size: 11, type: WidthType.PERCENTAGE }, borders: borderStyle, children: [new Paragraph({ children: [new TextRun({ text: "Дата", ...textSmall })], alignment: AlignmentType.CENTER })] }),
                        new TableCell({
                            width: { size: 54, type: WidthType.PERCENTAGE },
                            borders: borderStyle,
                            verticalAlign: "center",
                            children: [new Paragraph({ children: [new TextRun({ text: docCipher, ...textBold, size: 20 })], alignment: AlignmentType.CENTER })]
                        }),
                        new TableCell({
                             width: { size: 10, type: WidthType.PERCENTAGE },
                             borders: borderStyle,
                             children: [
                                 new Paragraph({ children: [new TextRun({ text: "Лист", ...textSmall, size: 10 })], alignment: AlignmentType.CENTER }),
                                 new Paragraph({ children: [new TextRun({ children: [PageNumber.CURRENT], ...textBold, size: 18 })], alignment: AlignmentType.CENTER })
                             ]
                        })
                    ]
                })
            ]
        });
    };

    const createStampForm5 = () => {
        return new Table({
             width: { size: 100, type: WidthType.PERCENTAGE },
             rows: [
                 new TableRow({
                     height: { value: 850, rule: "exact" }, 
                     children: [
                         new TableCell({ columnSpan: 6, width: { size: 55, type: WidthType.PERCENTAGE }, borders: borderStyle, children: [new Paragraph({ text: "", ...textSmall })] }), 
                         new TableCell({ columnSpan: 3, width: { size: 45, type: WidthType.PERCENTAGE }, borders: borderStyle, verticalAlign: "center", children: [new Paragraph({ children: [new TextRun({ text: docCipher, ...textBold, size: 28 })], alignment: AlignmentType.CENTER })] })
                     ]
                 }),
                 new TableRow({
                     height: { value: 567, rule: "exact" },
                     children: [
                         new TableCell({ columnSpan: 2, width: { size: 18, type: WidthType.PERCENTAGE }, borders: borderStyle, children: [
                             new Paragraph({ children: [new TextRun({ text: "Разраб.", ...textSmall }), new TextRun({ text: "  " + project.roleDeveloper, ...textBold })] }),
                             new Paragraph({ children: [new TextRun({ text: "Пров.", ...textSmall }), new TextRun({ text: "  " + project.roleClientChiefEngineer, ...textBold })] })
                         ]}),
                         new TableCell({ columnSpan: 4, width: { size: 37, type: WidthType.PERCENTAGE }, borders: borderStyle, verticalAlign: "center", children: [new Paragraph({ children: [new TextRun({ text: project.objectName, ...textSmall, italics: true })], alignment: AlignmentType.CENTER })] }),
                         new TableCell({ width: { size: 10, type: WidthType.PERCENTAGE }, borders: borderStyle, children: [new Paragraph({ text: "Стадия", ...textSmall, alignment: AlignmentType.CENTER }), new Paragraph({ text: "ППР", ...textBold, alignment: AlignmentType.CENTER })] }),
                         new TableCell({ width: { size: 10, type: WidthType.PERCENTAGE }, borders: borderStyle, children: [new Paragraph({ text: "Лист", ...textSmall, alignment: AlignmentType.CENTER }), new Paragraph({ children: [PageNumber.CURRENT], ...textBold, alignment: AlignmentType.CENTER })] }),
                         new TableCell({ width: { size: 10, type: WidthType.PERCENTAGE }, borders: borderStyle, children: [new Paragraph({ text: "Листов", ...textSmall, alignment: AlignmentType.CENTER }), new Paragraph({ children: [PageNumber.TOTAL_PAGES], ...textBold, alignment: AlignmentType.CENTER })] }),
                     ]
                 }),
                 new TableRow({
                     height: { value: 850, rule: "exact" },
                     children: [
                         new TableCell({ columnSpan: 2, width: { size: 18, type: WidthType.PERCENTAGE }, borders: borderStyle, verticalAlign: "center", children: [new Paragraph({ text: "Н.контр.", ...textSmall, alignment: AlignmentType.CENTER })] }),
                         new TableCell({ columnSpan: 7, width: { size: 82, type: WidthType.PERCENTAGE }, borders: borderStyle, verticalAlign: "center", children: [new Paragraph({ children: [new TextRun({ text: project.contractor, ...textBold, size: 24 })], alignment: AlignmentType.CENTER })] })
                     ]
                 })
             ]
        });
    };

    const parseMarkdownToDocx = (text: string) => {
        const elements: any[] = [];
        const lines = text.split('\n');
        let tableRows: TableRow[] = [];
        let inTable = false;

        lines.forEach(line => {
            const trimmed = line.trim();
            if (trimmed.startsWith('|')) {
                inTable = true;
                const cells = trimmed.split('|').filter(c => c.trim() !== '').map(c => 
                    new TableCell({
                        borders: borderStyle,
                        children: [new Paragraph({ children: [new TextRun({ text: c.trim(), ...textNormal })] })],
                        width: { size: 1, type: WidthType.AUTO }
                    })
                );
                if (!trimmed.includes('---')) tableRows.push(new TableRow({ children: cells }));
                return;
            } else if (inTable) {
                if (tableRows.length > 0) {
                    elements.push(new Table({ rows: tableRows, width: { size: 100, type: WidthType.PERCENTAGE } }));
                    elements.push(new Paragraph({ text: "" })); 
                }
                tableRows = [];
                inTable = false;
            }

            if (trimmed.startsWith('#')) {
                const level = trimmed.match(/^#+/)?.[0].length || 1;
                const content = trimmed.replace(/^#+\s*/, '');
                elements.push(new Paragraph({
                    children: [new TextRun({ text: content, font: "Times New Roman", bold: true, size: level === 1 ? 28 : 26 })],
                    spacing: { before: 240, after: 120 },
                    alignment: AlignmentType.CENTER
                }));
            } else if (trimmed !== '') {
                elements.push(new Paragraph({
                    children: [new TextRun({ text: trimmed, ...textNormal })],
                    alignment: AlignmentType.JUSTIFIED,
                    indent: { firstLine: 709 }, // 1.25cm
                    spacing: { after: 120 }
                }));
            }
        });
        if (inTable && tableRows.length > 0) elements.push(new Table({ rows: tableRows, width: { size: 100, type: WidthType.PERCENTAGE } }));
        return elements;
    };

    const titlePageContent = [
        new Paragraph({ text: "", spacing: { after: 3000 } }), // Top spacer
        new Paragraph({ text: "УТВЕРЖДАЮ", alignment: AlignmentType.RIGHT, ...textBold }),
        new Paragraph({ text: "Руководитель: ___________________", alignment: AlignmentType.RIGHT, ...textNormal }),
        new Paragraph({ text: `________________ / ${project.roleDeveloper || 'Ф.И.О.'}`, alignment: AlignmentType.RIGHT, ...textNormal }),
        new Paragraph({ text: "«___» _____________ 202__ г.", alignment: AlignmentType.RIGHT, spacing: { after: 3000 }, ...textNormal }),
        
        new Paragraph({ text: project.contractor || "ОРГАНИЗАЦИЯ", alignment: AlignmentType.CENTER, bold: true, size: 28, spacing: { after: 1000 }, font: "Times New Roman" }),
        new Paragraph({ text: "ПРОЕКТ ПРОИЗВОДСТВА РАБОТ", alignment: AlignmentType.CENTER, bold: true, size: 48, spacing: { after: 500 }, font: "Times New Roman" }),
        new Paragraph({ text: project.projectName || "НАЗВАНИЕ ПРОЕКТА", alignment: AlignmentType.CENTER, bold: true, size: 36, spacing: { after: 2000 }, font: "Times New Roman" }),
        
        new Paragraph({ text: `Объект: ${project.objectName || '...' }`, alignment: AlignmentType.CENTER, ...textNormal }),
        new Paragraph({ text: `Основание: ${docCipher}`, alignment: AlignmentType.CENTER, italics: true, spacing: { after: 4000 }, ...textNormal }),
        
        new Paragraph({ text: "г. Москва 2024", alignment: AlignmentType.CENTER, ...textNormal, spacing: { before: 2000 } })
    ];

    const mainContentChildren: any[] = [];
    
    mainContentChildren.push(new Paragraph({ text: "СОДЕРЖАНИЕ", bold: true, size: 32, alignment: AlignmentType.CENTER, font: "Times New Roman", spacing: { after: 400 } }));
    pprSections.forEach((s, i) => {
        mainContentChildren.push(new Paragraph({ text: `${i + 1}. ${s.title}`, ...textNormal, spacing: { after: 100 } }));
    });
    project.workType.forEach((w, i) => {
        mainContentChildren.push(new Paragraph({ text: `Приложение ${i + 1}. ТК: ${w}`, ...textNormal, spacing: { after: 100 } }));
    });
    mainContentChildren.push(new Paragraph({ text: "", pageBreakBefore: true }));

    pprSections.forEach((s, i) => {
        mainContentChildren.push(new Paragraph({ text: `${i + 1}. ${s.title}`, bold: true, size: 28, font: "Times New Roman", spacing: { after: 200 }, alignment: AlignmentType.CENTER }));
        mainContentChildren.push(...parseMarkdownToDocx(s.content));
        mainContentChildren.push(new Paragraph({ text: "", spacing: { after: 400 } }));
    });

    project.workType.forEach((w) => {
        mainContentChildren.push(new Paragraph({ text: `Технологическая карта: ${w}`, bold: true, size: 32, font: "Times New Roman", pageBreakBefore: true, alignment: AlignmentType.CENTER, spacing: { after: 400 } }));
        const tkSections = project.tkMap[w] || [];
        tkSections.forEach((s) => {
            mainContentChildren.push(new Paragraph({ text: s.title, bold: true, size: 26, font: "Times New Roman", spacing: { before: 200, after: 200 } }));
            mainContentChildren.push(...parseMarkdownToDocx(s.content));
        });
    });

    const doc = new Document({
        styles: {
            default: {
                document: {
                    run: { font: "Times New Roman", size: 24 }, 
                    paragraph: { alignment: AlignmentType.JUSTIFIED, spacing: { line: 276 } } 
                }
            }
        },
        sections: [
            {
                properties: {
                    type: SectionType.NEXT_PAGE,
                    page: {
                        margin: { top: 567, right: 567, bottom: 567, left: 1134 } 
                    }
                },
                children: titlePageContent
            },
            {
                properties: {
                    type: SectionType.NEXT_PAGE,
                    page: {
                        margin: { top: 567, right: 567, bottom: 2267, left: 1134 }, 
                        borders: {
                            pageBorderTop: { style: BorderStyle.SINGLE, size: 6, space: 0 },
                            pageBorderRight: { style: BorderStyle.SINGLE, size: 6, space: 0 },
                            pageBorderBottom: { style: BorderStyle.SINGLE, size: 6, space: 0 },
                            pageBorderLeft: { style: BorderStyle.SINGLE, size: 6, space: 0 },
                            display: PageBorderDisplay.ALL_PAGES,
                            offsetFrom: PageBorderOffsetFrom.PAGE
                        }
                    },
                    titlePage: true 
                },
                footers: {
                    first: new Footer({ children: [createStampForm5()] }), 
                    default: new Footer({ children: [createStampForm6()] }) 
                },
                children: mainContentChildren
            }
        ]
    });

    Packer.toBlob(doc).then(blob => {
        FileSaver.saveAs(blob, `ППР-${project.workingDocCode || 'Draft'}.docx`);
        onLog("Файл DOCX успешно скачан.", 'success');
    }).catch(e => {
        onLog("Ошибка при создании DOCX.", 'error');
    });
};

// ... Components ... (SearchableInput, WorkTreeSelect, MainStamp) - same as before

// ... (SearchableInput & WorkTreeSelect are omitted to save space, but implied to be present as before)
// ...

interface SearchableInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  suggestions?: string[];
  icon?: React.ReactNode;
  onAdd?: (value: string) => void;
}

const SearchableInput: React.FC<SearchableInputProps> = ({ label, value, onChange, suggestions = [], icon, onAdd }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [filtered, setFiltered] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange(val);
    if (suggestions && suggestions.length > 0) {
        const f = suggestions.filter(s => s.toLowerCase().includes(val.toLowerCase()));
        setFiltered(f);
        setIsOpen(true);
    }
  };

  const handleFocus = () => {
    if (suggestions && suggestions.length > 0) {
        setFiltered(suggestions);
        setIsOpen(true);
    }
  };

  const selectItem = (item: string) => {
    onChange(item);
    setIsOpen(false);
  };

  return (
    <div className="relative group" ref={containerRef}>
      <label className="text-[10px] font-black uppercase text-slate-400 mb-1 block pl-1">{label}</label>
      <div className="relative flex items-center">
        {icon && <div className="absolute left-3 text-slate-400">{icon}</div>}
        <input
          type="text"
          value={value}
          onChange={handleInput}
          onFocus={handleFocus}
          className={`w-full bg-white border border-slate-200 rounded-xl py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all ${icon ? 'pl-9' : 'pl-3'} pr-3`}
          placeholder="..."
        />
        {onAdd && value && suggestions && !suggestions.includes(value) && (
            <button 
                onClick={() => onAdd(value)}
                className="absolute right-2 p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                title="Добавить в справочник"
            >
                <Plus className="w-3 h-3" />
            </button>
        )}
      </div>
      {isOpen && filtered.length > 0 && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-slate-100 rounded-xl shadow-xl max-h-48 overflow-y-auto custom-scrollbar p-1">
          {filtered.map((item, i) => (
            <div 
              key={i} 
              onClick={() => selectItem(item)}
              className="px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-blue-600 rounded-lg cursor-pointer transition-colors"
            >
              {item}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

interface WorkTreeSelectProps {
  label: string;
  selectedItems: string[];
  onChange: (items: string[]) => void;
  catalog: WorkCatalogNode;
}

const WorkTreeSelect: React.FC<WorkTreeSelectProps> = ({ label, selectedItems, onChange, catalog }) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggle = (key: string) => {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSelect = (work: string) => {
    if (selectedItems.includes(work)) {
      onChange(selectedItems.filter(i => i !== work));
    } else {
      onChange([...selectedItems, work]);
    }
  };

  return (
    <div className="space-y-2">
      <label className="text-[10px] font-black uppercase text-slate-400 pl-1">{label}</label>
      <div className="border border-slate-200 rounded-xl bg-white overflow-hidden max-h-[300px] overflow-y-auto custom-scrollbar">
        {Object.entries(catalog).map(([category, subcats]) => (
          <div key={category} className="border-b border-slate-100 last:border-0">
            <div 
              className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors sticky top-0 bg-white z-10"
              onClick={() => toggle(category)}
            >
              <div className="flex items-center gap-2">
                 <div className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${expanded[category] ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300 text-transparent'}`}>
                    <ChevronDown className={`w-3 h-3 transition-transform ${expanded[category] ? 'rotate-0' : '-rotate-90'}`} />
                 </div>
                 <span className="text-xs font-bold text-slate-700">{category}</span>
              </div>
              <span className="text-[9px] font-black bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                {Object.values(subcats).flat().length}
              </span>
            </div>
            
            {expanded[category] && (
              <div className="bg-slate-50 border-t border-slate-100 p-2 space-y-2">
                {Object.entries(subcats).map(([subcat, works]) => (
                  <div key={subcat} className="pl-4">
                     <div 
                       className="flex items-center gap-2 py-1 cursor-pointer hover:text-blue-600"
                       onClick={() => toggle(`${category}-${subcat}`)}
                     >
                        <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${expanded[`${category}-${subcat}`] ? 'rotate-0' : '-rotate-90'}`} />
                        <span className="text-xs font-bold text-slate-600">{subcat}</span>
                     </div>
                     {expanded[`${category}-${subcat}`] && (
                       <div className="pl-5 pt-1 space-y-1">
                         {works.map(work => {
                           const isSelected = selectedItems.includes(work);
                           return (
                             <div 
                               key={work} 
                               onClick={() => handleSelect(work)}
                               className={`flex items-start gap-2 p-1.5 rounded-lg cursor-pointer transition-colors ${isSelected ? 'bg-blue-100 text-blue-800' : 'hover:bg-white text-slate-500'}`}
                             >
                               <div className={`mt-0.5 w-3 h-3 rounded border flex items-center justify-center shrink-0 ${isSelected ? 'bg-blue-600 border-blue-600' : 'border-slate-300 bg-white'}`}>
                                  {isSelected && <CheckCircle2 className="w-2.5 h-2.5 text-white" />}
                               </div>
                               <span className="text-[11px] leading-tight">{work}</span>
                             </div>
                           )
                         })}
                       </div>
                     )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const MainStamp = ({ pageNum, type, project, totalPages }: { pageNum: number; type: 'form5' | 'form6'; project: ProjectData; totalPages: number }) => {
    const docCipher = project.workingDocCode ? `ППР-${project.workingDocCode}` : 'ППР-ШИФР';

    return (
      <div className="absolute bottom-0 left-0 w-full bg-white border-t-2 border-black font-times text-[10px] leading-none" style={{ height: type === 'form5' ? '40mm' : '15mm' }}>
        {type === 'form5' ? (
          <div className="flex flex-col h-full border-l-2 border-black border-r-2 border-b-2">
            <div className="flex h-[15mm] border-b border-black">
              <div className="w-[110mm] border-r border-black"></div>
              <div className="flex-1 flex items-center justify-center font-bold text-[14pt]">{docCipher}</div>
            </div>
            <div className="flex h-[15mm] border-b border-black">
              <div className="w-[10mm] border-r border-black p-1 flex flex-col justify-between"><span>Изм.</span></div>
              <div className="w-[10mm] border-r border-black p-1 flex flex-col justify-between"><span>Кол.</span></div>
              <div className="w-[10mm] border-r border-black p-1 flex flex-col justify-between"><span>Лист</span></div>
              <div className="w-[10mm] border-r border-black p-1 flex flex-col justify-between"><span>№док.</span></div>
              <div className="w-[15mm] border-r border-black p-1 flex flex-col justify-between"><span>Подп.</span></div>
              <div className="w-[15mm] border-r border-black p-1 flex flex-col justify-between"><span>Дата</span></div>
              <div className="flex-1 flex">
                <div className="flex-1 border-r border-black p-1 flex items-center justify-center text-center">{project.objectName}</div>
                <div className="w-[15mm] border-r border-black p-1 flex flex-col justify-between text-center"><span>Стадия</span><span className="font-bold">ППР</span></div>
                <div className="w-[15mm] border-r border-black p-1 flex flex-col justify-between text-center"><span>Лист</span><span className="font-bold">{pageNum}</span></div>
                <div className="w-[15mm] p-1 flex flex-col justify-between text-center"><span>Листов</span><span className="font-bold">{totalPages}</span></div>
              </div>
            </div>
            <div className="flex h-[10mm]">
              <div className="w-[70mm] border-r border-black flex flex-col p-1 justify-center">
                 <div className="flex justify-between"><span>Разраб.</span> <span className="font-bold">{project.roleDeveloper}</span></div>
                 <div className="flex justify-between"><span>Пров.</span> <span className="font-bold">{project.roleClientChiefEngineer}</span></div>
              </div>
              <div className="flex-1 flex items-center justify-center font-bold text-[12pt]">{project.contractor}</div>
            </div>
          </div>
        ) : (
          <div className="flex h-full border-l-2 border-black border-r-2 border-b-2">
             <div className="w-[10mm] border-r border-black flex items-center justify-center">Изм.</div>
             <div className="w-[10mm] border-r border-black flex items-center justify-center">Кол.</div>
             <div className="w-[10mm] border-r border-black flex items-center justify-center">Лист</div>
             <div className="w-[10mm] border-r border-black flex items-center justify-center">№док.</div>
             <div className="w-[15mm] border-r border-black flex items-center justify-center">Подп.</div>
             <div className="w-[15mm] border-r border-black flex items-center justify-center">Дата</div>
             <div className="flex-1 border-r border-black flex items-center justify-center font-bold text-[12pt]">{docCipher}</div>
             <div className="w-[15mm] p-1 flex flex-col justify-between text-center"><span>Лист</span><span className="font-bold">{pageNum}</span></div>
          </div>
        )}
      </div>
    );
  };

export default function App() {
  const [project, setProject] = useState<ProjectData>(INITIAL_PROJECT);
  const [pprSections, setPprSections] = useState<DocSection[]>(PPR_SECTIONS_TEMPLATE);
  const [currentStep, setCurrentStep] = useState<'new-project' | 'edit' | 'dictionaries' | 'ppr-register' | 'knowledge' | 'help'>('new-project');
  const [dictTab, setDictTab] = useState<'objects' | 'clients' | 'contractors' | 'works' | 'system'>('objects');
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzingPos, setIsAnalyzingPos] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{ isConsistent: boolean, issues: string[] } | null>(null);
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error' | 'info' | 'warning'} | null>(null);
  const [dictionaries, setDictionaries] = useState<HierarchicalDict>(INITIAL_HIERARCHICAL_DICT);
  
  const [systemLogs, setSystemLogs] = useState<LogEntry[]>([
      { id: 'init', timestamp: new Date().toLocaleTimeString(), message: 'Система StroyDoc AI готова к работе.', type: 'info' }
  ]);
  const [logHeight, setLogHeight] = useState(220);
  const [isLogOpen, setIsLogOpen] = useState(true);
  const logEndRef = useRef<HTMLDivElement>(null);
  const isResizingRef = useRef(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const estimateInputRef = useRef<HTMLInputElement>(null);
  const posInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const gesnInputRef = useRef<HTMLInputElement>(null); 
  
  const abortControllerRef = useRef<AbortController | null>(null);

  // ... (useEffects, helpers omitted for brevity but remain the same) ...
  const filteredProjects = useMemo(() => {
    return savedProjects.filter(p => 
      p.data.projectName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.data.objectName.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [savedProjects, searchTerm]);

  useEffect(() => {
      if (logEndRef.current) {
          logEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
  }, [systemLogs]);

  const addLog = useCallback((message: string, type: 'info' | 'success' | 'warning' | 'error' | 'ai' = 'info') => {
      setSystemLogs(prev => [...prev, {
          id: Date.now().toString() + Math.random(),
          timestamp: new Date().toLocaleTimeString(),
          message,
          type
      }]);
  }, []);

  const startResizing = useCallback((e: React.MouseEvent) => {
      e.preventDefault();
      isResizingRef.current = true;
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'ns-resize';
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
      if (!isResizingRef.current) return;
      const newHeight = window.innerHeight - e.clientY - 40; 
      if (newHeight > 100 && newHeight < 600) {
          setLogHeight(newHeight);
      }
  }, []);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
      isResizingRef.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'default';
  }, [handleMouseMove]);

  const docLayout = useMemo(() => {
    let currentPage = 1;
    const pages: any[] = [];
    const tocEntries: { title: string; page: number; level: number }[] = [];

    pages.push({ type: 'title', pageNum: currentPage++ });
    pages.push({ type: 'toc', pageNum: currentPage++ });
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

  const isAllComplete = useMemo(() => {
    const pprComplete = pprSections.every(s => s.status === 'completed');
    const tkComplete = project.workType.every(w => {
      const sections = project.tkMap[w] || [];
      return sections.every(s => s.status === 'completed');
    });
    return pprComplete && tkComplete;
  }, [pprSections, project.workType, project.tkMap]);

  useEffect(() => {
    const data = localStorage.getItem('stroydoc_projects');
    if (data) try { setSavedProjects(JSON.parse(data)); } catch (e) {}
    const dicts = localStorage.getItem('stroydoc_dictionaries');
    if (dicts) try { setDictionaries(prev => ({ ...prev, ...JSON.parse(dicts) })); } catch (e) {}
  }, []);

  const showNotification = (message: string, type: 'success' | 'error' | 'info' | 'warning') => {
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

  const addToDictionary = (type: 'client' | 'contractor', name: string) => {
    if (!name) return;
    setDictionaries(prev => {
        const next = { ...prev };
        if (type === 'client') {
            next.clients = [...next.clients, { id: Date.now().toString(), name, legalAddress: '', chiefEngineer: '' }];
        } else {
            next.contractors = [...next.contractors, { id: Date.now().toString(), name, legalAddress: '', developer: '' }];
        }
        
        try {
            localStorage.setItem('stroydoc_dictionaries', JSON.stringify(next));
        } catch (e) {
            console.error("Storage full, item added to session only");
        }
        return next;
    });
    addLog(`Добавлено в справочник (${type === 'client' ? 'Заказчик' : 'Подрядчик'}): ${name}`, 'success');
    showNotification(`${name} добавлен в справочник`, 'success');
  };

  const viewDocument = (doc: WorkingDoc) => {
      try {
        const byteCharacters = atob(doc.data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: doc.mimeType });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        addLog(`Открыт документ для просмотра: ${doc.name}`, 'info');
      } catch (e) {
          console.error("Error viewing document:", e);
          showNotification("Ошибка при открытии файла", "error");
          addLog(`Ошибка открытия файла: ${doc.name}`, 'error');
      }
  };

  const handleValidateDocuments = async () => {
    if (isValidating) return;
    setIsValidating(true);
    setValidationResult(null);
    addLog("Запущена перекрестная проверка документов...", 'ai');

    try {
        const result = await validateProjectDocs(
            project.workingDocs[0],
            project.estimateDoc,
            project.posDoc
        );
        setValidationResult(result);
        if (!result.isConsistent) {
             showNotification("Обнаружены несоответствия в документах", "info");
             addLog("Проверка завершена: Найдены несоответствия данных в документах.", 'warning');
             result.issues.forEach(issue => addLog(` - ${issue}`, 'warning'));
        } else {
             showNotification("Документы согласованы", "success");
             addLog("Проверка завершена: Документы согласованы между собой.", 'success');
        }
    } catch (e: any) {
        console.error(e);
        // Error handling matches logic in geminiService
        if (e.message && e.message.includes('429')) {
             showNotification("Ошибка проверки: Превышен лимит API (429)", "error");
        } else if (e.message && e.message.includes('403')) {
             showNotification("Ошибка проверки: Недоступно в регионе (403)", "error");
        } else {
             showNotification("Ошибка при проверке документов", "error");
        }
        addLog("Ошибка при валидации документов.", 'error');
    } finally {
        setIsValidating(false);
    }
  };

  // ... (handleFileUpload, handleEstimateUpload, handlePosUpload same as before) ...
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    setIsUploading(true);
    addLog(`Начало загрузки РД (${files.length} файл(ов))...`, 'info');
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
        addLog(`Загружен файл: ${file.name}`, 'info');
      }
      
      setProject(p => ({ ...p, workingDocs: [...p.workingDocs, ...newDocs] }));
      showNotification(`Загружено РД: ${files.length}. Начинаю AI-анализ...`, 'info');
      addLog("Запуск AI анализа первого загруженного документа...", 'ai');

      if (newDocs.length > 0) {
        // Here we catch the rethrown error from extraction
        try {
            const info = await extractDocInfo(newDocs[0].data, newDocs[0].mimeType);
            if (info) {
               setProject(p => {
                 const newWorks = Array.from(new Set([...p.workType, ...(info.workTypes || [])]));
                 const newTkMap = { ...p.tkMap };
                 newWorks.forEach(w => {
                    if (!newTkMap[w]) {
                        newTkMap[w] = TK_SECTIONS_TEMPLATE.map(s => ({ ...s }));
                    }
                 });
    
                 return { 
                   ...p, 
                   workingDocCode: info.code || p.workingDocCode, 
                   workingDocName: info.name || p.workingDocName,
                   projectName: info.projectName || p.projectName,
                   objectName: info.objectName || p.objectName,
                   location: info.location || p.location,
                   client: info.client || p.client,
                   contractor: info.contractor || p.contractor,
                   workType: newWorks,
                   tkMap: newTkMap
                 };
               });
    
               if (info.workTypes && info.workTypes.length > 0) {
                 showNotification(`AI добавил ${info.workTypes.length} работ из документа. Данные о проекте обновлены.`, 'success');
                 addLog(`AI Анализ завершен. Извлечено работ: ${info.workTypes.length}. Шифр: ${info.code || 'Не найден'}.`, 'success');
               } else {
                 showNotification(`AI распознал документ: ${info.code}. Данные о проекте обновлены.`, 'info');
                 addLog(`AI Анализ завершен. Работ не найдено, но метаданные обновлены.`, 'info');
               }
            }
        } catch (innerError: any) {
             console.error("Analysis Error:", innerError);
             if (innerError.message.includes("429") || innerError.message.includes("quota")) {
                 showNotification("Лимит квоты (429). Повторите анализ позже.", "error");
                 addLog("Ошибка анализа РД: Превышен лимит квоты.", "error");
             } else if (innerError.message.includes("403") || innerError.message.includes("регион") || innerError.message.includes("VPN")) {
                 showNotification(innerError.message, "error");
                 addLog(innerError.message, "error");
             } else {
                 throw innerError; // Fallthrough
             }
        }
      }
    } catch (e) { 
      console.error(e);
      showNotification("Ошибка при чтении или анализе файлов", "error"); 
      addLog("Ошибка при чтении или анализе файлов РД.", 'error');
    } finally { 
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleEstimateUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsExtracting(true);
    addLog(`Начало загрузки Сметы: ${file.name}...`, 'info');
    try {
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve((e.target?.result as string).split(',')[1]);
        reader.readAsDataURL(file);
      });

      const newEstimateDoc = { name: file.name, data: base64, mimeType: file.type };

      addLog("Запуск AI анализа сметы...", 'ai');
      const result = await extractWorksFromEstimate(base64, file.type, dictionaries.workCatalog);
      
      if (result && result.selectedWorks.length > 0) {
        setProject(p => {
          const newWorks = Array.from(new Set([...p.workType, ...result.selectedWorks]));
          const newTkMap = { ...p.tkMap };
          newWorks.forEach(w => {
             if (!newTkMap[w]) {
                 newTkMap[w] = TK_SECTIONS_TEMPLATE.map(s => ({ ...s }));
             }
          });
          return {
            ...p,
            estimateDoc: newEstimateDoc, 
            projectName: result.projectName || p.projectName,
            objectName: result.objectName || p.objectName,
            location: result.location || p.location,
            client: result.client || p.client,
            contractor: result.contractor || p.contractor,
            workType: newWorks,
            tkMap: newTkMap
          };
        });
        showNotification(`Найдено работ в смете: ${result.selectedWorks.length}. Данные о проекте обновлены.`, 'success');
        addLog(`AI Анализ сметы завершен. Найдено работ: ${result.selectedWorks.length}. Проект: ${result.projectName || '---'}.`, 'success');
      } else {
        setProject(p => ({ ...p, estimateDoc: newEstimateDoc })); 
        showNotification("Работ в смете не обнаружено, но файл сохранен.", "info");
        addLog("AI не нашел работ в смете, но файл сохранен.", 'warning');
      }
    } catch (e: any) { 
      console.error(e);
      if (e.message.includes("429") || e.message.includes("quota")) {
         showNotification("Лимит квоты (429). Повторите позже.", "error");
      } else if (e.message.includes("403") || e.message.includes("VPN")) {
         showNotification(e.message, "error");
      } else {
         showNotification("Не удалось вызвать API Gemini или проанализировать смету", "error"); 
      }
      addLog("Ошибка при анализе сметы.", 'error');
    } finally { 
      setIsExtracting(false); 
      if (estimateInputRef.current) estimateInputRef.current.value = '';
    }
  };

  const handlePosUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsAnalyzingPos(true);
    addLog(`Начало загрузки ПОС: ${file.name}...`, 'info');
    try {
      const base64 = await new Promise<string>((resolve) => {
         const reader = new FileReader();
         reader.onload = (e) => resolve((e.target?.result as string).split(',')[1]);
         reader.readAsDataURL(file);
      });
      
      setProject(p => ({ ...p, posDoc: { name: file.name, data: base64, mimeType: file.type } }));
      
      addLog("Запуск AI анализа ПОС...", 'ai');
      // Wrap extract call to catch specific errors
      try {
          const posData = await extractPosData(base64, file.type);
          if (posData) {
              setProject(prev => {
                  const next = { ...prev };
                  if (posData.projectName) next.projectName = posData.projectName;
                  if (posData.objectName) next.objectName = posData.objectName;
                  if (posData.location) next.location = posData.location;
                  return next;
              });
              showNotification('ПОС успешно проанализирован. Данные об объекте обновлены.', 'success');
              addLog("ПОС проанализирован. Данные объекта обновлены.", 'success');
          } else {
              showNotification('ПОС загружен, но данные извлечь не удалось. Он будет использован при генерации.', 'info');
              addLog("ПОС загружен, но автоматическое извлечение данных не удалось.", 'warning');
          }
      } catch (inner: any) {
          if (inner.message.includes("429") || inner.message.includes("quota")) {
             showNotification("Лимит квоты (429). ПОС сохранен, но не проанализирован.", "warning");
             addLog("Ошибка анализа ПОС: Превышен лимит квоты.", "warning");
          } else if (inner.message.includes("403") || inner.message.includes("VPN")) {
             showNotification(inner.message, "error");
             addLog(inner.message, "error");
          } else {
             throw inner;
          }
      }
    } catch (e) {
      console.error(e);
      showNotification("Ошибка при анализе ПОС", "error");
      addLog("Ошибка при анализе ПОС.", 'error');
    } finally {
      setIsAnalyzingPos(false);
      if (posInputRef.current) posInputRef.current.value = '';
    }
  };

  const handleGesnUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    addLog(`Загрузка базы ГЭСН: ${files.length} файл(ов)...`, 'info');
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
        
        setProject(p => ({
            ...p,
            gesnDocs: [...p.gesnDocs, ...newDocs]
        }));
        
        showNotification(`База ГЭСН пополнена (${newDocs.length} файлов)`, "success");
        addLog(`База ГЭСН пополнена (${newDocs.length} файлов). Данные будут использованы AI.`, 'success');
    } catch (e) {
        console.error(e);
        showNotification("Ошибка при загрузке ГЭСН", "error");
        addLog("Ошибка загрузки файлов ГЭСН.", 'error');
    } finally {
        if (gesnInputRef.current) gesnInputRef.current.value = '';
    }
  };

  const handleLibraryUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    addLog(`Загрузка справочных документов: ${files.length} файл(ов)...`, 'info');
    const newRefs: ReferenceFile[] = [];

    try {
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const base64 = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve((e.target?.result as string).split(',')[1]);
                reader.readAsDataURL(file);
            });
            newRefs.push({ 
                id: Date.now().toString() + i,
                name: file.name, 
                data: base64, 
                mimeType: file.type,
                category: 'СП', 
                uploadedAt: new Date().toISOString()
            });
        }

        setDictionaries(prev => {
            const next = {
                ...prev,
                referenceLibrary: [...prev.referenceLibrary, ...newRefs]
            };
            
            // NOTE: Removed localStorage.setItem here to prevent QuotaExceededError and app crash
            // Large files will be available in session memory only.
            
            return next;
        });

        if (newRefs.length > 0) {
            showNotification(`Библиотека обновлена (${newRefs.length} файлов).`, "success");
            addLog(`В базу знаний добавлено документов: ${newRefs.length}.`, 'success');
        }
    } catch (e) {
        console.error(e);
        showNotification("Ошибка при загрузке документов", "error");
        addLog("Ошибка загрузки документов в базу знаний.", 'error');
    } finally {
        if (libraryInputRef.current) libraryInputRef.current.value = '';
    }
  };

  const removeReferenceDoc = (id: string) => {
      setDictionaries(prev => {
          const next = {
              ...prev,
              referenceLibrary: prev.referenceLibrary.filter(d => d.id !== id)
          };
          try {
              localStorage.setItem('stroydoc_dictionaries', JSON.stringify(next));
          } catch (e) {
              console.warn("Storage update failed");
          }
          return next;
      });
  };

  const generateSinglePprSection = async (idx: number) => {
    setPprSections(prev => { const n = [...prev]; n[idx].status = 'generating'; return n; });
    addLog(`Генерация раздела ППР: "${pprSections[idx].title}"...`, 'ai');
    try {
      const content = await generateSectionContent(project, pprSections[idx].title, `Раздел ППР: ${pprSections[idx].title}`, dictionaries.referenceLibrary);
      setPprSections(prev => { const n = [...prev]; n[idx].content = content; n[idx].status = 'completed'; return n; });
      addLog(`Раздел "${pprSections[idx].title}" успешно сгенерирован.`, 'success');
    } catch (e: any) {
      setPprSections(prev => { const n = [...prev]; n[idx].status = 'error'; return n; });
      addLog(`Ошибка генерации раздела "${pprSections[idx].title}".`, 'error');
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
    addLog(`Генерация ТК (${workType}): "${sectionTitle}"...`, 'ai');

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
      addLog(`ТК раздел "${sectionTitle}" для "${workType}" готов.`, 'success');
    } catch (e: any) {
      setProject(prev => {
        const newMap = { ...prev.tkMap };
        newMap[workType][secIdx] = { ...newMap[workType][secIdx], status: 'error' };
        return { ...prev, tkMap: newMap };
      });
      addLog(`Ошибка генерации ТК раздела "${sectionTitle}".`, 'error');
      throw e;
    }
  };

  const handleStopGeneration = () => {
      if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          setIsGeneratingAll(false);
          showNotification('Генерация остановлена пользователем', 'info');
          addLog("Генерация принудительно остановлена пользователем.", 'warning');
      }
  };

  const handleGenerateAll = async () => {
    if (isGeneratingAll) return;
    setIsGeneratingAll(true);
    addLog("Запущен процесс полной генерации документации...", 'info');
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
                await delay(15000); // 15s delay to be safe
                return true;
            } catch (error: any) {
                const errStr = JSON.stringify(error);
                const msg = error?.message || errStr;

                if (msg.includes("403") || msg.includes("VPN")) {
                    showNotification("Ошибка: API недоступно в регионе. Используйте VPN.", "error");
                    addLog("Генерация прервана: Региональная блокировка (403).", "error");
                    return false; // Stop trying for this item
                }

                const isQuota = 
                    error?.status === 429 || 
                    error?.code === 429 ||
                    error?.status === 'RESOURCE_EXHAUSTED' ||
                    msg.includes('429') || 
                    msg.includes('quota') || 
                    msg.includes('RESOURCE_EXHAUSTED');

                if (isQuota) {
                    if (i < maxRetries - 1) {
                        const waitTime = 30000; 
                        showNotification(`Лимит API (${name}). Пауза 30с...`, 'info');
                        addLog(`Лимит квоты API (${name}). Ожидание 30 сек перед повтором...`, 'warning');
                        for (let k = 0; k < 30; k++) {
                             if (abortControllerRef.current?.signal.aborted) return false;
                             await delay(1000);
                        }
                        continue;
                    } else {
                         showNotification(`Не удалось сгенерировать ${name} из-за лимитов.`, 'error');
                         addLog(`Ошибка генерации ${name}: Превышен лимит API.`, 'error');
                    }
                } else {
                    showNotification(`Ошибка генерации ${name}.`, 'error');
                    addLog(`Ошибка генерации ${name}: ${msg}`, 'error');
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
      addLog("Процесс пакетной генерации завершен.", 'success');
    } catch (e) {
      console.error("Batch generation stopped:", e);
      addLog("Генерация прервана из-за критической ошибки.", 'error');
    } finally {
      setIsGeneratingAll(false);
      abortControllerRef.current = null;
    }
  };

  return (
    <div className="h-screen flex flex-col font-times overflow-hidden bg-white">
      {/* ... Notification Component ... */}
      {notification && (
        <div className={`fixed top-20 right-6 z-[1000] p-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-right-10 duration-300 ${notification.type === 'success' ? 'bg-green-600 text-white' : notification.type === 'error' ? 'bg-red-600 text-white' : notification.type === 'warning' ? 'bg-amber-500 text-white' : 'bg-blue-600 text-white'}`}>
           {notification.type === 'success' ? <CheckCircle2 className="w-5" /> : notification.type === 'error' ? <AlertCircle className="w-5" /> : <Info className="w-5" />}
           <span className="text-xs font-black uppercase max-w-sm">{notification.message}</span>
        </div>
      )}

      {/* ... Header ... */}
      <header className="h-16 shrink-0 no-print bg-gray-200 border-b border-gray-300 sticky top-0 z-[200] px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setCurrentStep('new-project')}>
          <div className="bg-blue-600 p-2 rounded-lg shadow-lg"><HardHat className="text-white w-6 h-6" /></div>
          <div>
            <h1 className="text-xl font-black text-black tracking-tight leading-none font-sans">Генератор ППР</h1>
            <span className="text-[10px] font-bold text-black uppercase tracking-widest leading-none font-sans">StroyDoc AI</span>
          </div>
        </div>
        <nav className="flex items-center gap-8 font-sans">
           <button onClick={() => setCurrentStep('new-project')} className={`text-xs font-black uppercase flex items-center gap-2 ${currentStep === 'new-project' || currentStep === 'edit' ? 'text-blue-700' : 'text-black hover:text-gray-700'}`}><PlusCircle className="w-4" /> Создать</button>
           <button onClick={() => setCurrentStep('ppr-register')} className={`text-xs font-black uppercase flex items-center gap-2 ${currentStep === 'ppr-register' ? 'text-blue-700' : 'text-black hover:text-gray-700'}`}><ClipboardList className="w-4" /> Реестр ППР</button>
           <button onClick={() => setCurrentStep('dictionaries')} className={`text-xs font-black uppercase flex items-center gap-2 ${currentStep === 'dictionaries' ? 'text-blue-700' : 'text-black hover:text-gray-700'}`}><Settings className="w-4" /> Справочники</button>
           <button onClick={() => setCurrentStep('knowledge')} className={`text-xs font-black uppercase flex items-center gap-2 ${currentStep === 'knowledge' ? 'text-blue-700' : 'text-black hover:text-gray-700'}`}><BookMarked className="w-4" /> База знаний</button>
           <button onClick={() => setCurrentStep('help')} className={`text-xs font-black uppercase flex items-center gap-2 ${currentStep === 'help' ? 'text-blue-700' : 'text-black hover:text-gray-700'}`}><HelpCircle className="w-4" /> Справка</button>
           <div className="flex items-center gap-2 border-l pl-4 border-gray-300">
             <button onClick={() => { showNotification('Откроется окно печати. Выберите "Сохранить как PDF".', 'info'); setTimeout(() => window.print(), 500); }} className="bg-white text-black border border-gray-300 px-3 py-2 rounded-xl text-xs font-black uppercase flex items-center gap-2 hover:bg-gray-50 transition-colors" title="Печать PDF через браузер"><Printer className="w-4" /> Сохранить PDF</button>
             <button onClick={() => generateWordDocument(project, pprSections, addLog)} className="bg-blue-600 text-white px-3 py-2 rounded-xl text-xs font-black uppercase flex items-center gap-2 shadow-lg hover:bg-blue-700 transition-all" title="Скачать редактируемый документ"><FileDown className="w-4" /> Печать WORD</button>
           </div>
        </nav>
      </header>

      <main className="flex-1 flex overflow-hidden font-sans relative">
         {/* ... Sidebar ... */}
         <aside className="no-print w-[400px] shrink-0 bg-white border-r border-slate-200 overflow-y-auto p-6 space-y-8 custom-scrollbar flex flex-col">
           {(currentStep === 'new-project' || currentStep === 'edit') && (
             <div className="space-y-6">
                {/* ... (Existing sections) ... */}
                {currentStep === 'new-project' ? (
                  <>
                    <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest border-l-4 border-blue-600 pl-3">Исходные данные</h2>
                    {/* ... File Uploads ... */}
                    <div className="flex flex-col gap-3 mb-6">
                      {/* ... RD, Smeta, POS uploads (omitted for brevity, they are same as before) ... */}
                      {/* RD Upload */}
                      {project.workingDocs.length > 0 ? (
                          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                             <div className="flex items-center justify-between mb-2">
                                 <div className="flex items-center gap-2">
                                     <Upload className="w-4 h-4 text-blue-600" />
                                     <span className="text-xs font-bold text-blue-900">РД ({project.workingDocs.length})</span>
                                 </div>
                                 <div className="flex gap-1">
                                    <button onClick={() => viewDocument(project.workingDocs[0])} title="Открыть первый документ" className="p-1.5 hover:bg-blue-100 rounded-lg text-blue-600 transition-colors">
                                        <Eye className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => setProject(p => ({...p, workingDocs: []}))} title="Удалить все" className="p-1.5 hover:bg-red-100 rounded-lg text-red-500 transition-colors">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                 </div>
                             </div>
                             <div className="text-[10px] text-slate-500 truncate">{project.workingDocs.map(d => d.name).join(', ')}</div>
                          </div>
                      ) : (
                          <div onClick={() => !isUploading && fileInputRef.current?.click()} className={`border-2 border-dashed border-slate-200 rounded-xl p-4 text-center transition-all ${isUploading ? 'bg-slate-50 cursor-not-allowed opacity-50' : 'hover:bg-blue-50 cursor-pointer group'}`}>
                            <input type="file" ref={fileInputRef} className="hidden" multiple onChange={handleFileUpload} />
                            <div className="flex items-center justify-center gap-3">
                                {isUploading ? <Loader2 className="w-5 h-5 text-blue-500 animate-spin" /> : <Upload className="w-5 h-5 text-slate-400 group-hover:text-blue-500" />}
                                <span className="text-xs font-black text-slate-500 uppercase">Загрузить РД (PDF/Img)</span>
                            </div>
                          </div>
                      )}

                      {/* Smeta Upload */}
                      {project.estimateDoc ? (
                           <div className="bg-green-50 border border-green-200 rounded-xl p-3">
                             <div className="flex items-center justify-between mb-2">
                                 <div className="flex items-center gap-2">
                                     <Calculator className="w-4 h-4 text-green-600" />
                                     <span className="text-xs font-bold text-green-900">Смета</span>
                                 </div>
                                 <div className="flex gap-1">
                                    <button onClick={() => viewDocument(project.estimateDoc!)} title="Открыть" className="p-1.5 hover:bg-green-100 rounded-lg text-green-600 transition-colors">
                                        <Eye className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => setProject(p => ({...p, estimateDoc: undefined}))} title="Удалить" className="p-1.5 hover:bg-red-100 rounded-lg text-red-500 transition-colors">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                 </div>
                             </div>
                             <div className="text-[10px] text-slate-500 truncate">{project.estimateDoc.name}</div>
                          </div>
                      ) : (
                          <div onClick={() => !isExtracting && estimateInputRef.current?.click()} className={`border-2 border-dashed border-slate-200 rounded-xl p-4 text-center transition-all ${isExtracting ? 'bg-slate-50 cursor-not-allowed opacity-50' : 'hover:bg-green-50 cursor-pointer group'}`}>
                            <input type="file" ref={estimateInputRef} className="hidden" onChange={handleEstimateUpload} />
                             <div className="flex items-center justify-center gap-3">
                                {isExtracting ? <Loader2 className="w-5 h-5 text-green-500 animate-spin" /> : <Calculator className="w-5 h-5 text-slate-400 group-hover:text-green-500" />}
                                <span className="text-xs font-black text-slate-500 uppercase">Загрузить Смету</span>
                             </div>
                          </div>
                      )}

                      {/* POS Upload */}
                      {project.posDoc ? (
                           <div className="bg-purple-50 border border-purple-200 rounded-xl p-3">
                             <div className="flex items-center justify-between mb-2">
                                 <div className="flex items-center gap-2">
                                     <FileText className="w-4 h-4 text-purple-600" />
                                     <span className="text-xs font-bold text-purple-900">ПОС</span>
                                 </div>
                                 <div className="flex gap-1">
                                    <button onClick={() => viewDocument(project.posDoc!)} title="Открыть" className="p-1.5 hover:bg-purple-100 rounded-lg text-purple-600 transition-colors">
                                        <Eye className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => setProject(p => ({...p, posDoc: undefined}))} title="Удалить" className="p-1.5 hover:bg-red-100 rounded-lg text-red-500 transition-colors">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                 </div>
                             </div>
                             <div className="text-[10px] text-slate-500 truncate">{project.posDoc.name}</div>
                          </div>
                      ) : (
                          <div onClick={() => !isAnalyzingPos && posInputRef.current?.click()} className={`border-2 border-dashed border-slate-200 rounded-xl p-4 text-center transition-all ${isAnalyzingPos ? 'bg-slate-50 cursor-not-allowed opacity-50' : 'hover:bg-purple-50 cursor-pointer group'}`}>
                            <input type="file" ref={posInputRef} className="hidden" onChange={handlePosUpload} />
                             <div className="flex items-center justify-center gap-3">
                                {isAnalyzingPos ? <Loader2 className="w-5 h-5 text-purple-500 animate-spin" /> : <FileText className="w-5 h-5 text-slate-400 group-hover:text-purple-500" />}
                                <span className="text-xs font-black text-slate-500 uppercase">Загрузить ПОС</span>
                             </div>
                          </div>
                      )}
                    </div>
                    {/* ... */}
                    {(project.workingDocs.length > 0 || project.estimateDoc || project.posDoc) && (
                        <div className="mb-6">
                            <button 
                                onClick={handleValidateDocuments} 
                                disabled={isValidating}
                                className={`w-full py-2.5 rounded-xl text-xs font-black uppercase flex items-center justify-center gap-2 transition-all shadow-sm border ${isValidating ? 'bg-slate-100 text-slate-400 border-slate-200' : 'bg-white text-slate-700 border-slate-200 hover:border-blue-300 hover:text-blue-600'}`}
                            >
                                {isValidating ? <Loader2 className="w-4 animate-spin" /> : <ScanSearch className="w-4" />}
                                Проверить согласованность
                            </button>
                            {/* Validation Result UI */}
                            {validationResult && (
                                <div className={`mt-3 p-3 rounded-xl border text-xs ${validationResult.isConsistent ? 'bg-green-50 border-green-200 text-green-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                                    <div className="flex items-center gap-2 font-bold mb-1">
                                        {validationResult.isConsistent ? <CheckCircle2 className="w-4" /> : <AlertCircle className="w-4" />}
                                        {validationResult.isConsistent ? 'Документы согласованы' : 'Найдены несоответствия'}
                                    </div>
                                    {!validationResult.isConsistent && (
                                        <ul className="list-disc pl-5 space-y-1 mt-2">
                                            {validationResult.issues.map((issue, i) => (
                                                <li key={i}>{issue}</li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                    <div className="bg-blue-50/50 p-5 rounded-2xl border border-blue-100 space-y-4">
                      <SearchableInput label="Название проекта" value={project.projectName} onChange={(v: string) => updateProject('projectName', v)} suggestions={[]} icon={<PenLine className="w-4" />} />
                      <SearchableInput label="Объект" value={project.objectName} onChange={(v: string) => updateProject('objectName', v)} suggestions={dictionaries.objects.map(o => o.name)} icon={<Database className="w-4" />} />
                      <SearchableInput label="Адрес объекта" value={project.location} onChange={(v: string) => updateProject('location', v)} suggestions={[]} icon={<MapPin className="w-4" />} />
                      <SearchableInput 
                        label="Заказчик" 
                        value={project.client} 
                        onChange={(v: string) => updateProject('client', v)} 
                        suggestions={dictionaries.clients.map(c => c.name)} 
                        icon={<UserCog className="w-4" />}
                        onAdd={(val: string) => addToDictionary('client', val)}
                      />
                      <SearchableInput 
                        label="Подрядчик" 
                        value={project.contractor} 
                        onChange={(v: string) => updateProject('contractor', v)} 
                        suggestions={dictionaries.contractors.map(c => c.name)} 
                        icon={<Building2 className="w-4" />}
                        onAdd={(val: string) => addToDictionary('contractor', val)}
                      />
                      <SearchableInput label="Шифр РД" value={project.workingDocCode} onChange={(v: string) => updateProject('workingDocCode', v)} suggestions={[]} icon={<FileDown className="w-4" />} />
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
                ) : currentStep === 'edit' ? (
                  // ... (Edit step UI)
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
                ) : null}
             </div>
           )}
           
           {/* ... (Other sidebar sections) ... */}
           {currentStep === 'knowledge' && (
             <div className="space-y-6">
                <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest border-l-4 border-slate-300 pl-3">Библиотека норм</h2>
                
                {/* GESN Upload Section */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-4">
                   <div onClick={() => gesnInputRef.current?.click()} className="border-2 border-dashed border-purple-200 rounded-xl p-6 text-center hover:bg-purple-50 cursor-pointer group relative">
                      <input type="file" ref={gesnInputRef} className="hidden" multiple accept=".csv,.json,.txt,.pdf" onChange={handleGesnUpload} />
                      <div className="absolute top-2 right-2 bg-purple-100 text-purple-700 text-[9px] font-bold px-2 py-1 rounded">Множественный выбор</div>
                      <Database className="w-8 h-8 text-purple-400 mx-auto mb-2 group-hover:text-purple-600 transition-colors" />
                      <p className="text-[10px] font-black uppercase text-purple-600">Загрузить Базу ГЭСН / ФЕР</p>
                      <p className="text-[8px] text-slate-400 mt-1">Выберите один или несколько файлов (CSV, JSON, PDF)</p>
                   </div>
                   {project.gesnDocs.length > 0 ? (
                       <div className="space-y-2">
                           <h3 className="text-[9px] font-bold text-slate-400 uppercase pl-1">Загруженные базы ({project.gesnDocs.length}):</h3>
                           {project.gesnDocs.map((doc, idx) => (
                               <div key={idx} className="flex items-center justify-between bg-white border border-purple-100 p-2 rounded-lg shadow-sm">
                                   <div className="flex items-center gap-2 overflow-hidden">
                                       <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                                       <span className="text-[10px] font-bold text-slate-600 truncate">{doc.name}</span>
                                   </div>
                                   <button onClick={() => setProject(p => ({...p, gesnDocs: p.gesnDocs.filter((_, i) => i !== idx)}))} className="text-slate-400 hover:text-red-500 transition-colors"><X className="w-3 h-3" /></button>
                               </div>
                           ))}
                       </div>
                   ) : (
                       <div className="text-[9px] text-slate-400 italic text-center">База данных не загружена.</div>
                   )}
                </div>

                {/* SP/GOST Upload Section */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-4">
                   <div onClick={() => libraryInputRef.current?.click()} className="border-2 border-dashed border-blue-200 rounded-xl p-6 text-center hover:bg-blue-50 cursor-pointer group relative">
                      <input type="file" ref={libraryInputRef} className="hidden" multiple onChange={handleLibraryUpload} />
                      <div className="absolute top-2 right-2 bg-blue-100 text-blue-700 text-[9px] font-bold px-2 py-1 rounded">Множественный выбор</div>
                      <Library className="w-8 h-8 text-blue-400 mx-auto mb-2 group-hover:text-blue-600 transition-colors" />
                      <p className="text-[10px] font-black uppercase text-blue-600">Загрузить СП / ГОСТ</p>
                      <p className="text-[8px] text-slate-400 mt-1">Выберите файлы нормативов для использования AI</p>
                   </div>
                   
                   {dictionaries.referenceLibrary.length > 0 ? (
                       <div className="space-y-2">
                           <h3 className="text-[9px] font-bold text-slate-400 uppercase pl-1">Справочные документы ({dictionaries.referenceLibrary.length}):</h3>
                           {dictionaries.referenceLibrary.map((doc) => (
                               <div key={doc.id} className="flex items-center justify-between bg-white border border-blue-100 p-2 rounded-lg shadow-sm">
                                   <div className="flex items-center gap-2 overflow-hidden">
                                       <BookOpen className="w-4 h-4 text-blue-500 shrink-0" />
                                       <span className="text-[10px] font-bold text-slate-600 truncate">{doc.name}</span>
                                   </div>
                                   <button onClick={() => removeReferenceDoc(doc.id)} className="text-slate-400 hover:text-red-500 transition-colors"><X className="w-3 h-3" /></button>
                               </div>
                           ))}
                       </div>
                   ) : (
                       <div className="text-[9px] text-slate-400 italic text-center">Библиотека пуста.</div>
                   )}
                </div>
             </div>
           )}

           {/* ... (Other steps like 'dictionaries', 'ppr-register', 'help' - same as before) ... */}
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
           {currentStep === 'help' && (
             <div className="space-y-6">
                <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest border-l-4 border-blue-600 pl-3">Инструкция оператора</h2>
                <div className="flex flex-col gap-2">
                    {HELP_CONTENT.map(item => (
                        <button 
                            key={item.id} 
                            onClick={() => {
                                const el = document.getElementById(`help-${item.id}`);
                                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }}
                            className="w-full text-left px-4 py-3 rounded-xl text-xs font-bold transition-all bg-white border border-slate-200 text-slate-600 flex items-center gap-3 hover:border-blue-300 hover:text-blue-600 hover:shadow-sm"
                        >
                            <span className="text-blue-600 bg-blue-50 p-1.5 rounded-lg">{item.icon}</span>
                            {item.title}
                        </button>
                    ))}
                </div>
                <div className="bg-slate-50 p-4 rounded-xl text-[10px] text-slate-500 italic leading-relaxed">
                    Руководство обновляется автоматически при внесении изменений в систему StroyDoc AI.
                </div>
             </div>
           )}
        </aside>

        {/* ... (Rest of main content area same as before) ... */}
        <div className="flex-1 flex flex-col overflow-hidden bg-slate-100/50">
            {/* ... (Print Content and Logs - same as previous) ... */}
            <section id="print-content" className="flex-1 overflow-y-auto p-10 custom-scrollbar flex flex-col items-center gap-10">
            {currentStep === 'ppr-register' ? (
                <div className="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
                    {/* ... (Quota Info Section) ... */}
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
                        <li className="flex justify-between border-blue-500 pb-1"><span>Запросов (RPM):</span> <span>До 360</span></li>
                        <li className="flex justify-between border-blue-500 pb-1"><span>Токенов (TPM):</span> <span>До 4,000,000</span></li>
                        <li className="flex justify-between border-blue-500 pb-1"><span>Стабильность:</span> <span>Максимальная</span></li>
                        </ul>
                        <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" className="flex items-center justify-center gap-2 bg-white text-blue-600 py-2 rounded-xl text-[10px] font-black uppercase hover:bg-slate-100 transition-all">
                        Подключить биллинг <ExternalLink className="w-3" />
                        </a>
                    </div>
                    </div>
                    {/* ... */}
                </div>
            ) : (
                <div className="flex flex-col items-center gap-10">
                {docLayout.pages.map((page, idx) => {
                    // ... (Rendering of pages - kept identical to before) ...
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
                            <MainStamp pageNum={page.pageNum} type={stampType} project={project} totalPages={docLayout.totalPages} />
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
                            <MainStamp pageNum={page.pageNum} type="form6" project={project} totalPages={docLayout.totalPages} />
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
                            <MainStamp pageNum={page.pageNum} type="form6" project={project} totalPages={docLayout.totalPages} />
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
                            <MainStamp pageNum={page.pageNum} type={stampType} project={project} totalPages={docLayout.totalPages} />
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
                        <MainStamp pageNum={page.pageNum} type={stampType} project={project} totalPages={docLayout.totalPages} />
                        </div>
                    );
                })}
                </div>
            )}
            </section>

            {/* --- System Log Panel --- */}
            {isLogOpen && (
              <div 
                style={{ height: logHeight }} 
                className="shrink-0 bg-white border-t border-slate-200 flex flex-col font-sans text-xs overflow-hidden no-print shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] relative"
              >
                  {/* Drag Handle */}
                  <div 
                    onMouseDown={startResizing}
                    className="h-1.5 w-full bg-slate-50 hover:bg-slate-200 cursor-ns-resize flex items-center justify-center transition-colors absolute top-0 z-10"
                  >
                      <div className="w-10 h-0.5 bg-slate-300 rounded-full"></div>
                  </div>

                  <div className="h-10 bg-slate-50 border-b border-slate-100 flex items-center justify-between px-4 select-none pt-1">
                      <div className="flex items-center gap-2 text-slate-500 font-bold uppercase tracking-widest">
                          <Terminal className="w-4 h-4 text-blue-600" />
                          <span>Журнал событий</span>
                      </div>
                      <div className="flex items-center gap-2">
                          <button onClick={() => setIsLogOpen(false)} className="p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-600 transition-colors" title="Свернуть">
                              <ChevronDown className="w-4 h-4" />
                          </button>
                      </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar bg-white">
                      {systemLogs.length === 0 && <div className="text-slate-400 italic text-center py-4">Событий пока нет...</div>}
                      {systemLogs.map((log) => (
                          <div key={log.id} className="flex gap-4 text-[11px] leading-relaxed group hover:bg-slate-50 p-1 rounded-lg transition-colors border border-transparent hover:border-slate-100">
                              <span className="text-slate-400 shrink-0 select-none w-16 font-mono pt-0.5">{log.timestamp.split(' ')[0]}</span>
                              <div className="flex-1 break-words font-medium flex items-start gap-2">
                                  {log.type === 'info' && <span className="bg-blue-50 text-blue-600 px-1.5 rounded text-[9px] font-black uppercase tracking-wider shrink-0 mt-0.5">INFO</span>}
                                  {log.type === 'success' && <span className="bg-green-50 text-green-600 px-1.5 rounded text-[9px] font-black uppercase tracking-wider shrink-0 mt-0.5">OK</span>}
                                  {log.type === 'warning' && <span className="bg-amber-50 text-amber-600 px-1.5 rounded text-[9px] font-black uppercase tracking-wider shrink-0 mt-0.5">WARN</span>}
                                  {log.type === 'error' && <span className="bg-red-50 text-red-600 px-1.5 rounded text-[9px] font-black uppercase tracking-wider shrink-0 mt-0.5">ERR</span>}
                                  {log.type === 'ai' && <span className="bg-purple-50 text-purple-600 px-1.5 rounded text-[9px] font-black uppercase tracking-wider shrink-0 mt-0.5 flex items-center gap-1"><Sparkles className="w-2 h-2" /> AI</span>}
                                  <span className={log.type === 'error' ? 'text-red-700' : 'text-slate-600'}>{log.message}</span>
                              </div>
                          </div>
                      ))}
                      <div ref={logEndRef} />
                  </div>
              </div>
            )}
        </div>
      </main>
      {/* ... (Footer same as before) ... */}
      <footer className="h-10 shrink-0 no-print bg-gray-200 px-8 py-3 flex items-center justify-between text-[10px] font-black uppercase text-black border-t border-gray-300 font-sans">
         <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isGeneratingAll ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'}`}></div>
              <span className="text-black">{isGeneratingAll ? 'AI в процессе работы...' : 'Система готова'}</span>
            </div>
            <div className="text-black flex items-center gap-2"><ListOrdered className="w-3" /> Страниц: {docLayout.totalPages}</div>
         </div>
         <div className="flex items-center gap-4">
             {!isLogOpen && (
                 <button onClick={() => setIsLogOpen(true)} className="flex items-center gap-2 hover:text-gray-600 transition-colors text-black">
                     <Terminal className="w-3 h-3" /> Развернуть лог
                 </button>
             )}
             <span className="tracking-widest flex items-center gap-1 border-l border-gray-400 pl-4 text-black">StroyDoc AI — Инженерная мощь <Sparkles className="w-3" /></span>
         </div>
      </footer>
    </div>
  );
}