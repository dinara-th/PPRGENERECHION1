import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, Footer, SectionType, PageNumber } from "docx";
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
  TableProperties,
  Network
} from 'lucide-react';
import { ProjectData, DocumentType, DocSection, WorkingDoc, SavedProject, ConstructionObject, ClientEntry, ContractorEntry, ReferenceFile, TkGroup } from './types';
import { generateSectionContent, extractDocInfo, extractWorksFromEstimate, extractPosData, validateProjectDocs, suggestWorkGrouping } from './geminiService';

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
  tkGroups: [], 
  workDeadlines: {},
  workingDocName: '',
  workingDocCode: '',
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
    {
        id: 'grouping',
        title: 'Группировка работ',
        icon: <Layers className="w-5" />,
        content: (
            <div className="space-y-4">
                <p>Функция группировки позволяет объединять несколько однотипных работ в одну Технологическую Карту (ТК).</p>
                <p><b>Как это работает:</b></p>
                <ul className="list-disc pl-5 space-y-2">
                    <li>Добавьте все работы из сметы.</li>
                    <li>Нажмите "Настроить Группы ТК".</li>
                    <li>Используйте <b>"Авто-группировка AI"</b> для автоматического распределения.</li>
                    <li>Или создайте группы вручную и перетащите в них работы.</li>
                </ul>
            </div>
        )
    },
    {
        id: 'lib',
        title: 'База знаний',
        icon: <BookMarked className="w-5" />,
        content: (
            <div className="space-y-4">
                <p>Используйте этот раздел для загрузки нормативной документации.</p>
                <p><b>Типы документов:</b></p>
                <ul className="list-disc pl-5 space-y-2">
                    <li><b>СП/ГОСТ</b>: Нормативные акты для ссылок в тексте.</li>
                    <li><b>ГЭСН/ФЕР</b>: Базы расценок для точного расчета ресурсов.</li>
                    <li><b>Техкарты</b>: Примеры типовых ТК для обучения модели.</li>
                </ul>
            </div>
        )
    },
    {
        id: 'export',
        title: 'Экспорт',
        icon: <FileDown className="w-5" />,
        content: (
            <div className="space-y-4">
                <p>Вы можете выгрузить готовый документ в двух форматах:</p>
                <ul className="list-disc pl-5 space-y-2">
                    <li><b>PDF</b>: Через стандартную печать браузера (кнопка "Сохранить PDF").</li>
                    <li><b>DOCX</b>: Полноценный редактируемый документ Word с оформлением по ГОСТ.</li>
                </ul>
            </div>
        )
    }
];

// ... (splitContentIntoPages function - same as before)
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

// ... (generateWordDocument and stamp functions - same as before)
const generateWordDocument = (project: ProjectData, pprSections: DocSection[], onLog: (msg: string, type: 'info' | 'success' | 'error') => void) => {
    onLog("Начало формирования DOCX файла...", 'info');
    const docCipher = project.workingDocCode ? `ППР-${project.workingDocCode}` : 'ППР-ШИФР';
    const cellBorder = { style: BorderStyle.SINGLE, size: 1, color: "000000" };
    const borderStyle = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder };
    
    const textSmall = { font: "Times New Roman", size: 14 }; 
    const textBold = { font: "Times New Roman", size: 16, bold: true }; 
    const textNormal = { font: "Times New Roman", size: 24 };

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
                         new TableCell({ columnSpan: 6, width: { size: 55, type: WidthType.PERCENTAGE }, borders: borderStyle, children: [new Paragraph({ children: [new TextRun({ text: "", ...textSmall })] })] }),
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
                         new TableCell({ width: { size: 10, type: WidthType.PERCENTAGE }, borders: borderStyle, children: [new Paragraph({ children: [new TextRun({ text: "Стадия", ...textSmall })], alignment: AlignmentType.CENTER }), new Paragraph({ children: [new TextRun({ text: "ППР", ...textBold })], alignment: AlignmentType.CENTER })] }),
                         new TableCell({ width: { size: 10, type: WidthType.PERCENTAGE }, borders: borderStyle, children: [new Paragraph({ children: [new TextRun({ text: "Лист", ...textSmall })], alignment: AlignmentType.CENTER }), new Paragraph({ children: [new TextRun({ children: [PageNumber.CURRENT], ...textBold })], alignment: AlignmentType.CENTER })] }),
                         new TableCell({ width: { size: 10, type: WidthType.PERCENTAGE }, borders: borderStyle, children: [new Paragraph({ children: [new TextRun({ text: "Листов", ...textSmall })], alignment: AlignmentType.CENTER }), new Paragraph({ children: [new TextRun({ children: [PageNumber.TOTAL_PAGES], ...textBold })], alignment: AlignmentType.CENTER })] }),
                     ]
                 }),
                 new TableRow({
                     height: { value: 850, rule: "exact" },
                     children: [
                         new TableCell({ columnSpan: 2, width: { size: 18, type: WidthType.PERCENTAGE }, borders: borderStyle, verticalAlign: "center", children: [new Paragraph({ children: [new TextRun({ text: "Н.контр.", ...textSmall })], alignment: AlignmentType.CENTER })] }),
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
        new Paragraph({ children: [], spacing: { after: 3000 } }), // Top spacer
        new Paragraph({ children: [new TextRun({ text: "УТВЕРЖДАЮ", ...textBold })], alignment: AlignmentType.RIGHT }),
        new Paragraph({ children: [new TextRun({ text: "Руководитель: ___________________", ...textNormal })], alignment: AlignmentType.RIGHT }),
        new Paragraph({ children: [new TextRun({ text: `________________ / ${project.roleDeveloper || 'Ф.И.О.'}`, ...textNormal })], alignment: AlignmentType.RIGHT }),
        new Paragraph({ children: [new TextRun({ text: "«___» _____________ 202__ г.", ...textNormal })], alignment: AlignmentType.RIGHT, spacing: { after: 3000 } }),

        new Paragraph({ children: [new TextRun({ text: project.contractor || "ОРГАНИЗАЦИЯ", font: "Times New Roman", bold: true, size: 28 })], alignment: AlignmentType.CENTER, spacing: { after: 1000 } }),
        new Paragraph({ children: [new TextRun({ text: "ПРОЕКТ ПРОИЗВОДСТВА РАБОТ", font: "Times New Roman", bold: true, size: 48 })], alignment: AlignmentType.CENTER, spacing: { after: 500 } }),
        new Paragraph({ children: [new TextRun({ text: project.projectName || "НАЗВАНИЕ ПРОЕКТА", font: "Times New Roman", bold: true, size: 36 })], alignment: AlignmentType.CENTER, spacing: { after: 2000 } }),

        new Paragraph({ children: [new TextRun({ text: `Объект: ${project.objectName || '...' }`, ...textNormal })], alignment: AlignmentType.CENTER }),
        new Paragraph({ children: [new TextRun({ text: `Основание: ${docCipher}`, ...textNormal, italics: true })], alignment: AlignmentType.CENTER, spacing: { after: 4000 } }),

        new Paragraph({ children: [new TextRun({ text: `г. Москва ${new Date().getFullYear()}`, ...textNormal })], alignment: AlignmentType.CENTER, spacing: { before: 2000 } })
    ];

    const mainContentChildren: any[] = [];
    
    mainContentChildren.push(new Paragraph({ children: [new TextRun({ text: "СОДЕРЖАНИЕ", font: "Times New Roman", bold: true, size: 32 })], alignment: AlignmentType.CENTER, spacing: { after: 400 } }));
    pprSections.forEach((s, i) => {
        mainContentChildren.push(new Paragraph({ children: [new TextRun({ text: `${i + 1}. ${s.title}`, ...textNormal })], spacing: { after: 100 } }));
    });

    // Updated TOC to show Groups instead of single works if groups exist
    const workItems = project.tkGroups.length > 0 ? project.tkGroups : project.workType.map(w => ({ title: w, id: w }));

    workItems.forEach((w, i) => {
        mainContentChildren.push(new Paragraph({ children: [new TextRun({ text: `Приложение ${i + 1}. ТК: ${w.title}`, ...textNormal })], spacing: { after: 100 } }));
    });
    mainContentChildren.push(new Paragraph({ children: [], pageBreakBefore: true }));

    pprSections.forEach((s, i) => {
        mainContentChildren.push(new Paragraph({ children: [new TextRun({ text: `${i + 1}. ${s.title}`, font: "Times New Roman", bold: true, size: 28 })], spacing: { after: 200 }, alignment: AlignmentType.CENTER }));
        mainContentChildren.push(...parseMarkdownToDocx(s.content));
        mainContentChildren.push(new Paragraph({ children: [], spacing: { after: 400 } }));
    });

    workItems.forEach((w) => {
        mainContentChildren.push(new Paragraph({ children: [new TextRun({ text: `Технологическая карта: ${w.title}`, font: "Times New Roman", bold: true, size: 32 })], pageBreakBefore: true, alignment: AlignmentType.CENTER, spacing: { after: 400 } }));
        const tkSections = project.tkMap[w.id] || [];
        tkSections.forEach((s) => {
            mainContentChildren.push(new Paragraph({ children: [new TextRun({ text: s.title, font: "Times New Roman", bold: true, size: 26 })], spacing: { before: 200, after: 200 } }));
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
                            pageBorderLeft: { style: BorderStyle.SINGLE, size: 6, space: 0 }
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

// ... (SearchableInput and WorkTreeSelect components - same as before)
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
  const [currentStep, setCurrentStep] = useState<'new-project' | 'edit' | 'dictionaries' | 'ppr-register' | 'knowledge' | 'help' | 'grouping'>('new-project');
  const [dictTab, setDictTab] = useState<'objects' | 'clients' | 'contractors' | 'works' | 'system'>('objects');
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [processingFile, setProcessingFile] = useState<'rd' | 'estimate' | 'pos' | 'gesn' | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isGrouping, setIsGrouping] = useState(false);
  const [validationResult, setValidationResult] = useState<{ isConsistent: boolean, issues: string[] } | null>(null);
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error' | 'info' | 'warning'} | null>(null);
  const [dictionaries, setDictionaries] = useState<HierarchicalDict>(INITIAL_HIERARCHICAL_DICT);
  
  // Knowledge base state
  const [libraryCategory, setLibraryCategory] = useState<'СП' | 'ГОСТ' | 'Техкарта' | 'Прочее'>('Прочее');
  
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

  const handleMouseMoveRef = useRef<(e: MouseEvent) => void>(() => {});
  const handleMouseUpRef = useRef<(e: MouseEvent) => void>(() => {});

  handleMouseMoveRef.current = (e: MouseEvent) => {
      if (!isResizingRef.current) return;
      const newHeight = window.innerHeight - e.clientY - 40;
      if (newHeight > 100 && newHeight < 600) {
          setLogHeight(newHeight);
      }
  };

  handleMouseUpRef.current = (e: MouseEvent) => {
      isResizingRef.current = false;
      document.removeEventListener('mousemove', stableMouseMove);
      document.removeEventListener('mouseup', stableMouseUp);
      document.body.style.cursor = 'default';
  };

  const stableMouseMove = useCallback((e: MouseEvent) => handleMouseMoveRef.current(e), []);
  const stableMouseUp = useCallback((e: MouseEvent) => handleMouseUpRef.current(e), []);

  const startResizing = useCallback((e: React.MouseEvent) => {
      e.preventDefault();
      isResizingRef.current = true;
      document.addEventListener('mousemove', stableMouseMove);
      document.addEventListener('mouseup', stableMouseUp);
      document.body.style.cursor = 'ns-resize';
  }, [stableMouseMove, stableMouseUp]);

  const docLayout = useMemo(() => {
    let currentPage = 1;
    const pages: any[] = [];
    const tocEntries: { title: string; page: number; level: number }[] = [];

    // Title page
    pages.push({ type: 'title', pageNum: currentPage++ });

    // Calculate Total TOC Entries
    let totalTocEntries = 0;
    totalTocEntries++; // Approval sheet
    totalTocEntries += pprSections.length;
    
    const workItems = project.tkGroups.length > 0 ? project.tkGroups : project.workType.map(w => ({ id: w, title: w, works: [w] }));
    totalTocEntries += workItems.length; // Group headers
    
    workItems.forEach(item => {
        const workSections = project.tkMap[item.id] || [];
        totalTocEntries += workSections.length;
    });
    totalTocEntries++; // Acquaintance sheet

    // Calculate TOC Pages
    const ITEMS_PER_FIRST_PAGE = 22;
    const ITEMS_PER_NEXT_PAGE = 32;
    
    let tocPagesCount = 1;
    if (totalTocEntries > ITEMS_PER_FIRST_PAGE) {
        const remaining = totalTocEntries - ITEMS_PER_FIRST_PAGE;
        tocPagesCount += Math.ceil(remaining / ITEMS_PER_NEXT_PAGE);
    }

    // Reserve TOC Pages
    const tocPagesIndices: number[] = [];
    for(let k=0; k<tocPagesCount; k++) {
        pages.push({ type: 'toc', pageNum: currentPage++, tocPageIndex: k });
        tocPagesIndices.push(pages.length - 1);
    }

    // Approval Sheet
    pages.push({ type: 'approval-sheet', pageNum: currentPage++, title: 'Лист согласования' });
    tocEntries.push({ title: 'Лист согласования', page: currentPage - 1, level: 1 });

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
    workItems.forEach((item, wIdx) => {
      pages.push({ type: 'tk-separator', title: item.title, pageNum: currentPage++ });
      tocEntries.push({ title: `Приложение ${wIdx + 1}. ТК на ${item.title}`, page: currentPage - 1, level: 1 });
      const workSections = project.tkMap[item.id] || [];
      workSections.forEach((tkSec, tsIdx) => {
        const tkContent = tkSec.content || 'Ожидает генерации...';
        const tkPages = splitContentIntoPages(tkContent);
        tocEntries.push({ title: `${tsIdx + 1}. ${tkSec.title}`, page: currentPage, level: 2 });
        tkPages.forEach((pContent, pIdx) => {
          pages.push({ type: 'tk', workTitle: item.title, secTitle: tkSec.title, index: tsIdx + 1, content: pContent, isFirstPage: pIdx === 0, pageNum: currentPage++ });
        });
      });
    });

    // Acquaintance Sheet
    pages.push({ type: 'acquaintance-sheet', pageNum: currentPage++, title: 'Лист ознакомления' });
    tocEntries.push({ title: 'Лист ознакомления', page: currentPage - 1, level: 1 });

    // Fill TOC Pages
    let currentEntryIndex = 0;
    tocPagesIndices.forEach((pageIndex, i) => {
        const limit = i === 0 ? ITEMS_PER_FIRST_PAGE : ITEMS_PER_NEXT_PAGE;
        pages[pageIndex].entries = tocEntries.slice(currentEntryIndex, currentEntryIndex + limit);
        currentEntryIndex += limit;
    });

    return { pages, tocEntries, totalPages: currentPage - 1 };
  }, [pprSections, project.workType, project.tkMap, project.tkGroups]);

  const isProjectReady = useMemo(() => {
    if (project.workType.length === 0) return false;
    return project.workType.every(work => 
      project.workDeadlines[work]?.start && project.workDeadlines[work]?.end
    );
  }, [project.workType, project.workDeadlines]);

  const isAllComplete = useMemo(() => {
    const pprComplete = pprSections.every(s => s.status === 'completed');
    const itemIds = project.tkGroups.length > 0 ? project.tkGroups.map(g => g.id) : project.workType;
    const tkComplete = itemIds.every(id => {
      const sections = project.tkMap[id] || [];
      return sections.every(s => s.status === 'completed');
    });
    return pprComplete && tkComplete;
  }, [pprSections, project.workType, project.tkMap, project.tkGroups]);

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
        const newWorks = value as string[];
        const newTkMap = { ...prev.tkMap };
        if (prev.tkGroups.length === 0) {
             newWorks.forEach(wt => {
              if (!newTkMap[wt]) newTkMap[wt] = TK_SECTIONS_TEMPLATE.map(s => ({ ...s }));
            });
            const newDeadlines = { ...prev.workDeadlines };
            Object.keys(newDeadlines).forEach(k => {
                if (!newWorks.includes(k)) delete newDeadlines[k];
            });
            next.workDeadlines = newDeadlines;
        } else {
            const newGroups = prev.tkGroups.map(g => ({
                ...g,
                works: g.works.filter(w => newWorks.includes(w))
            })).filter(g => g.works.length > 0);
            next.tkGroups = newGroups;
        }
        next.tkMap = newTkMap;
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

  const handleAiGrouping = async () => {
    if (isGrouping) return;
    setIsGrouping(true);
    addLog("Запуск интеллектуальной группировки работ...", 'ai');
    try {
        const groups = await suggestWorkGrouping(project.workType);
        if (groups && groups.length > 0) {
            setProject(prev => {
                const newTkMap = { ...prev.tkMap };
                groups.forEach(g => {
                    if (!newTkMap[g.id]) newTkMap[g.id] = TK_SECTIONS_TEMPLATE.map(s => ({ ...s }));
                });
                return {
                    ...prev,
                    tkGroups: groups,
                    tkMap: newTkMap
                };
            });
            showNotification(`Создано ${groups.length} групп ТК.`, 'success');
            addLog(`Группировка завершена: создано ${groups.length} групп ТК.`, 'success');
        } else {
            showNotification('AI не предложил вариантов группировки.', 'info');
        }
    } catch (e) {
        console.error(e);
        showNotification('Ошибка при группировке работ', 'error');
        addLog('Ошибка AI группировки.', 'error');
    } finally {
        setIsGrouping(false);
    }
  };

  const createNewGroup = () => {
      const id = `group-${Date.now()}`;
      setProject(prev => ({
          ...prev,
          tkGroups: [...prev.tkGroups, { id, title: 'Новая группа', works: [] }],
          tkMap: { ...prev.tkMap, [id]: TK_SECTIONS_TEMPLATE.map(s => ({ ...s })) }
      }));
  };

  const updateGroupTitle = (id: string, newTitle: string) => {
      setProject(prev => ({
          ...prev,
          tkGroups: prev.tkGroups.map(g => g.id === id ? { ...g, title: newTitle } : g)
      }));
  };

  const moveWorkToGroup = (work: string, groupId: string | null) => {
      setProject(prev => {
          const newGroups = prev.tkGroups.map(g => {
              const works = g.works.filter(w => w !== work);
              if (g.id === groupId) {
                  return { ...g, works: [...works, work] };
              }
              return { ...g, works };
          }).filter(g => g.works.length > 0 || g.id === groupId);

          return { ...prev, tkGroups: newGroups };
      });
  };

  const ungroupAll = () => {
      if (window.confirm("Разгруппировать все работы? Это сбросит текущие ТК.")) {
          setProject(prev => {
              const newTkMap: any = {};
              prev.workType.forEach(w => {
                  newTkMap[w] = TK_SECTIONS_TEMPLATE.map(s => ({ ...s }));
              });
              return { ...prev, tkGroups: [], tkMap: newTkMap };
          });
          addLog("Группировка сброшена.", 'info');
      }
  };

  const generateSingleTkSection = async (itemId: string, secIdx: number, isGroup: boolean) => {
    setProject(prev => {
      const newMap = { ...prev.tkMap };
      if (!newMap[itemId]) newMap[itemId] = [];
      newMap[itemId][secIdx] = { ...newMap[itemId][secIdx], status: 'generating' };
      return { ...prev, tkMap: newMap };
    });

    const sectionTitle = project.tkMap[itemId][secIdx].title;
    
    let title = itemId;
    let subWorks: string[] | undefined = undefined;

    if (isGroup) {
        const group = project.tkGroups.find(g => g.id === itemId);
        if (group) {
            title = group.title;
            subWorks = group.works;
        }
    }

    addLog(`Генерация ТК (${title}): "${sectionTitle}"...`, 'ai');

    try {
      const content = await generateSectionContent(
        project, 
        `${sectionTitle} (ТК на ${title})`, 
        `Технологическая карта на: ${title}. Раздел: ${sectionTitle}`, 
        dictionaries.referenceLibrary,
        subWorks
      );
      
      setProject(prev => {
        const newMap = { ...prev.tkMap };
        newMap[itemId][secIdx] = { ...newMap[itemId][secIdx], content, status: 'completed' };
        return { ...prev, tkMap: newMap };
      });
      addLog(`ТК раздел "${sectionTitle}" для "${title}" готов.`, 'success');
    } catch (e: any) {
      setProject(prev => {
        const newMap = { ...prev.tkMap };
        newMap[itemId][secIdx] = { ...newMap[itemId][secIdx], status: 'error' };
        return { ...prev, tkMap: newMap };
      });
      addLog(`Ошибка генерации ТК раздела "${sectionTitle}".`, 'error');
      throw e;
    }
  };
  
  const generateSinglePprSection = async (idx: number) => {
    setPprSections(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], status: 'generating' };
      return next;
    });

    const section = pprSections[idx];
    addLog(`Генерация раздела ППР: "${section.title}"...`, 'ai');

    try {
      const content = await generateSectionContent(
          project, 
          section.title, 
          `Раздел ППР: ${section.title}`, 
          dictionaries.referenceLibrary
      );
      
      setPprSections(prev => {
        const next = [...prev];
        next[idx] = { ...next[idx], content, status: 'completed' };
        return next;
      });
      addLog(`Раздел "${section.title}" готов.`, 'success');
    } catch (e: any) {
      setPprSections(prev => {
        const next = [...prev];
        next[idx] = { ...next[idx], status: 'error' };
        return next;
      });
      const errMsg = e.message || JSON.stringify(e);
      addLog(`Ошибка генерации раздела "${section.title}": ${errMsg}`, 'error');
      if (errMsg.includes("403") || errMsg.includes("VPN")) {
           throw e;
      }
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
            if (abortControllerRef.current?.signal.aborted) return false;

            try {
                await action();
                await delay(15000); // 15s delay
                return true;
            } catch (error: any) {
                const errStr = JSON.stringify(error);
                const msg = error?.message || errStr;
                 if (msg.includes("403") || msg.includes("VPN")) {
                    showNotification("Ошибка: API недоступно в регионе. Используйте VPN.", "error");
                    addLog("Генерация прервана: Региональная блокировка (403).", "error");
                    return false; 
                }
                const isQuota = error?.status === 429 || error?.code === 429 || error?.status === 'RESOURCE_EXHAUSTED' || msg.includes('429') || msg.includes('quota');

                if (isQuota) {
                    if (i < maxRetries - 1) {
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

      const itemsToGenerate = project.tkGroups.length > 0 
        ? project.tkGroups.map(g => ({ id: g.id, name: g.title, isGroup: true }))
        : project.workType.map(w => ({ id: w, name: w, isGroup: false }));

      for (const item of itemsToGenerate) {
         if (abortControllerRef.current?.signal.aborted) break;
         const sections = project.tkMap[item.id] || [];
         for (let i = 0; i < sections.length; i++) {
           if (abortControllerRef.current?.signal.aborted) break;
           if (sections[i].status === 'completed') continue;
           await processItem(() => generateSingleTkSection(item.id, i, item.isGroup), `ТК-${item.name}-${i+1}`);
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

  const handleFileUpload = async (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProcessingFile('rd');
    addLog(`Анализ документа: ${file.name}...`, 'ai');
    
    try {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const base64 = (ev.target?.result as string).split(',')[1];
        const info = await extractDocInfo(base64, file.type);
        if (info) {
          setProject(prev => {
              const updated = {
                  ...prev,
                  workingDocName: info.name,
                  workingDocCode: info.code,
                  projectName: info.projectName || prev.projectName,
                  objectName: info.objectName || prev.objectName,
                  client: info.client || prev.client,
                  contractor: info.contractor || prev.contractor,
                  location: info.location || prev.location,
                  aiWorksFromDocs: info.workTypes,
                  workingDocs: [...prev.workingDocs, { name: file.name, data: base64, mimeType: file.type }]
              };
              
              if (info.client) addToDictionary('client', info.client);
              if (info.contractor) addToDictionary('contractor', info.contractor);
              
              return updated;
          });
          addLog("Данные из РД успешно извлечены.", 'success');
        } else {
          addLog("Не удалось извлечь данные. Проверьте формат файла.", 'error');
        }
        setProcessingFile(null);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error(err);
      addLog("Ошибка при чтении файла.", 'error');
      setProcessingFile(null);
    }
  };

  const handleEstimateUpload = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setProcessingFile('estimate');
      addLog(`Анализ сметы: ${file.name}...`, 'ai');
      
      try {
        const reader = new FileReader();
        reader.onload = async (ev) => {
          const base64 = (ev.target?.result as string).split(',')[1];
          try {
            const data = await extractWorksFromEstimate(base64, file.type, dictionaries.workCatalog);
            if (data) {
                setProject(prev => {
                    const mergedWorks = Array.from(new Set([...prev.workType, ...data.selectedWorks]));
                    const updated = {
                        ...prev,
                        estimateDoc: { name: file.name, data: base64, mimeType: file.type },
                        aiWorksFromEstimate: data.selectedWorks,
                        workType: mergedWorks, // Auto-add works from estimate
                        projectName: data.projectName || prev.projectName,
                        objectName: data.objectName || prev.objectName,
                        location: data.location || prev.location,
                        client: data.client || prev.client,
                        contractor: data.contractor || prev.contractor
                    };
                    // Init map for new works if grouping not active
                    if (prev.tkGroups.length === 0) {
                        const newTkMap = { ...prev.tkMap };
                        mergedWorks.forEach(w => {
                            if (!newTkMap[w]) newTkMap[w] = TK_SECTIONS_TEMPLATE.map(s => ({ ...s }));
                        });
                        updated.tkMap = newTkMap;
                    }
                    return updated;
                });
                addLog(`Смета обработана. Найдено ${data.selectedWorks.length} работ.`, 'success');
            }
          } catch (err) {
             addLog("Ошибка анализа сметы.", 'error'); 
          }
          setProcessingFile(null);
        };
        reader.readAsDataURL(file);
      } catch (err) {
        setProcessingFile(null);
      }
  };

  const handlePosUpload = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setProcessingFile('pos');
      addLog(`Анализ ПОС: ${file.name}...`, 'ai');
      
      try {
          const reader = new FileReader();
          reader.onload = async (ev) => {
              const base64 = (ev.target?.result as string).split(',')[1];
              try {
                  const data = await extractPosData(base64, file.type);
                  if (data) {
                      setProject(prev => ({
                          ...prev,
                          posDoc: { name: file.name, data: base64, mimeType: file.type },
                          projectName: data.projectName || prev.projectName,
                          objectName: data.objectName || prev.objectName,
                          location: data.location || prev.location
                      }));
                      addLog("ПОС проанализирован. Данные обновлены.", 'success');
                  }
              } catch (e) {
                  addLog("Ошибка анализа ПОС.", 'error');
              }
              setProcessingFile(null);
          };
          reader.readAsDataURL(file);
      } catch (e) {
          setProcessingFile(null);
      }
  };
  
  const handleGesnUpload = async (e: any) => {
      const files = Array.from(e.target.files as FileList);
      if (files.length === 0) return;
      
      setProcessingFile('gesn');
      addLog(`Загрузка базы ГЭСН (${files.length} файлов)...`, 'info');
      const newDocs: WorkingDoc[] = [];

      let processedCount = 0;
      for (const file of files) {
           const reader = new FileReader();
           reader.onload = (ev) => {
               const base64 = (ev.target?.result as string).split(',')[1];
               newDocs.push({ name: file.name, data: base64, mimeType: file.type });
               processedCount++;
               if (processedCount === files.length) {
                   setProject(prev => ({
                       ...prev,
                       gesnDocs: [...prev.gesnDocs, ...newDocs]
                   }));
                   addLog(`База ГЭСН обновлена (+${files.length} файлов).`, 'success');
                   setProcessingFile(null);
               }
           };
           reader.readAsDataURL(file);
      }
  };

  const handleLibraryUpload = async (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = (ev.target?.result as string).split(',')[1];
      const newFile: ReferenceFile = {
        id: Date.now().toString(),
        name: file.name,
        data: base64,
        mimeType: file.type,
        category: libraryCategory,
        uploadedAt: new Date().toLocaleDateString()
      };
      setDictionaries(prev => ({
        ...prev,
        referenceLibrary: [...prev.referenceLibrary, newFile]
      }));
      addLog(`Файл ${file.name} добавлен в библиотеку (Категория: ${libraryCategory}).`, 'success');
    };
    reader.readAsDataURL(file);
  };

  const removeReferenceDoc = (id: string) => {
     setDictionaries(prev => ({
         ...prev,
         referenceLibrary: prev.referenceLibrary.filter(d => d.id !== id)
     }));
  };

  const addToDictionary = (type: 'client' | 'contractor', name: string) => {
    if (!name.trim()) return;
    setDictionaries(prev => {
      if (type === 'client') {
        const exists = prev.clients.some(c => c.name === name);
        if (exists) return prev;
        return {
          ...prev,
          clients: [...prev.clients, { id: Date.now().toString(), name, legalAddress: '', chiefEngineer: '' }]
        };
      } else {
        const exists = prev.contractors.some(c => c.name === name);
        if (exists) return prev;
        return {
          ...prev,
          contractors: [...prev.contractors, { id: Date.now().toString(), name, legalAddress: '', developer: '' }]
        };
      }
    });
  };

  const handleValidateDocuments = async () => {
      if (isValidating) return;
      setIsValidating(true);
      addLog("Запуск перекрестной проверки документов...", 'ai');
      const result = await validateProjectDocs(
          project.workingDocs[0], 
          project.estimateDoc, 
          project.posDoc
      );
      setValidationResult(result);
      if (!result.isConsistent) {
          showNotification("Обнаружены противоречия в документах!", "warning");
          addLog("Проверка завершена: найдены ошибки.", 'warning');
      } else {
          showNotification("Документы согласованы.", "success");
          addLog("Проверка завершена: ошибок нет.", 'success');
      }
      setIsValidating(false);
  };
  
  // Helper to determine unassigned works for the grouping UI
  const getUnassignedWorks = () => {
      const assigned = new Set(project.tkGroups.flatMap(g => g.works));
      return project.workType.filter(w => !assigned.has(w));
  };

  return (
    <div className="h-screen flex flex-col font-times overflow-hidden bg-white">
      {/* Notification */}
      {notification && (
        <div className={`fixed top-20 right-6 z-[1000] p-4 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] flex items-center gap-3 transition-all duration-300 transform translate-y-0 opacity-100 bg-white/95 backdrop-blur-md border border-slate-200 border-l-4 ${notification.type === 'success' ? 'border-l-green-500' : notification.type === 'error' ? 'border-l-red-500' : notification.type === 'warning' ? 'border-l-amber-500' : 'border-l-blue-500'}`}>
           {notification.type === 'success' ? <CheckCircle2 className="w-5 text-green-500" /> : notification.type === 'error' ? <AlertCircle className="w-5 text-red-500" /> : <Info className="w-5 text-blue-500" />}
           <span className="text-xs font-black uppercase max-w-sm text-slate-800">{notification.message}</span>
           <button onClick={() => setNotification(null)} className="ml-2 hover:opacity-80 text-slate-400"><X className="w-4" /></button>
        </div>
      )}

      {/* Header */}
      <header className="h-16 shrink-0 no-print bg-gray-200 border-b border-gray-300 sticky top-0 z-[200] px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setCurrentStep('new-project')}>
          <div className="bg-blue-600 p-2 rounded-lg shadow-lg"><HardHat className="text-white w-6 h-6" /></div>
          <div>
            <h1 className="text-xl font-black text-black tracking-tight leading-none font-sans">Генератор ППР</h1>
            <span className="text-[10px] font-bold text-black uppercase tracking-widest leading-none font-sans">StroyDoc AI</span>
          </div>
        </div>
        <nav className="flex items-center gap-8 font-sans">
           <button onClick={() => setCurrentStep('new-project')} className={`text-xs font-black uppercase flex items-center gap-2 ${currentStep === 'new-project' || currentStep === 'edit' || currentStep === 'grouping' ? 'text-blue-700' : 'text-black hover:text-gray-700'}`}><PlusCircle className="w-4" /> Создать</button>
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
         {/* Sidebar */}
         <aside className="no-print w-[400px] shrink-0 bg-white border-r border-slate-200 overflow-y-auto p-6 space-y-8 custom-scrollbar flex flex-col">
           {/* ... Sidebar content unchanged ... */}
           {(currentStep === 'new-project' || currentStep === 'edit' || currentStep === 'grouping') && (
             <div className="space-y-6">
                {currentStep === 'new-project' ? (
                  <>
                     <div className="flex items-center justify-between">
                        <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest border-l-4 border-blue-600 pl-3">Исходные данные</h2>
                        {processingFile && <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />}
                     </div>

                     <div className="space-y-4">
                        <div className={`border border-slate-200 rounded-xl p-4 bg-slate-50 hover:bg-white transition-all cursor-pointer relative group ${processingFile === 'rd' ? 'ring-2 ring-blue-100 bg-blue-50' : ''}`} onClick={() => !processingFile && fileInputRef.current?.click()}>
                           <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,image/*,.xlsx,.xls" onChange={handleFileUpload} />
                           <div className="flex items-center gap-3">
                              <div className="p-2 bg-white rounded-lg border border-slate-200 group-hover:border-blue-300">
                                  {processingFile === 'rd' ? <Loader2 className="w-6 h-6 text-blue-500 animate-spin" /> : <FileText className="w-6 h-6 text-slate-400 group-hover:text-blue-500" />}
                              </div>
                              <div className={processingFile === 'rd' ? 'opacity-50' : ''}>
                                 <p className="text-xs font-bold text-slate-700">Загрузить РД / Чертеж</p>
                                 <p className="text-[10px] text-slate-400 font-medium">PDF, Excel, Images</p>
                              </div>
                           </div>
                           {project.workingDocName && <div className="mt-2 text-[10px] font-bold text-green-600 bg-green-50 px-2 py-1 rounded w-fit flex items-center gap-1"><CheckCircle2 className="w-3" /> {project.workingDocName}</div>}
                        </div>

                        <div className={`border border-slate-200 rounded-xl p-4 bg-slate-50 hover:bg-white transition-all cursor-pointer relative group ${processingFile === 'estimate' ? 'ring-2 ring-blue-100 bg-blue-50' : ''}`} onClick={() => !processingFile && estimateInputRef.current?.click()}>
                           <input ref={estimateInputRef} type="file" className="hidden" accept=".pdf,.xlsx,.xls,.csv" onChange={handleEstimateUpload} />
                           <div className="flex items-center gap-3">
                              <div className="p-2 bg-white rounded-lg border border-slate-200 group-hover:border-blue-300">
                                  {processingFile === 'estimate' ? <Loader2 className="w-6 h-6 text-blue-500 animate-spin" /> : <Calculator className="w-6 h-6 text-slate-400 group-hover:text-blue-500" />}
                              </div>
                              <div className={processingFile === 'estimate' ? 'opacity-50' : ''}>
                                 <p className="text-xs font-bold text-slate-700">Загрузить Смету</p>
                                 <p className="text-[10px] text-slate-400 font-medium">Для авто-подбора работ</p>
                              </div>
                           </div>
                           {project.estimateDoc && <div className="mt-2 text-[10px] font-bold text-green-600 bg-green-50 px-2 py-1 rounded w-fit flex items-center gap-1"><CheckCircle2 className="w-3" /> {project.estimateDoc.name}</div>}
                        </div>

                        <div className={`border border-slate-200 rounded-xl p-4 bg-slate-50 hover:bg-white transition-all cursor-pointer relative group ${processingFile === 'pos' ? 'ring-2 ring-blue-100 bg-blue-50' : ''}`} onClick={() => !processingFile && posInputRef.current?.click()}>
                           <input ref={posInputRef} type="file" className="hidden" accept=".pdf,.xlsx,.xls" onChange={handlePosUpload} />
                           <div className="flex items-center gap-3">
                              <div className="p-2 bg-white rounded-lg border border-slate-200 group-hover:border-blue-300">
                                  {processingFile === 'pos' ? <Loader2 className="w-6 h-6 text-blue-500 animate-spin" /> : <Activity className="w-6 h-6 text-slate-400 group-hover:text-blue-500" />}
                              </div>
                              <div className={processingFile === 'pos' ? 'opacity-50' : ''}>
                                 <p className="text-xs font-bold text-slate-700">Загрузить ПОС</p>
                                 <p className="text-[10px] text-slate-400 font-medium">Для уточнения сроков</p>
                              </div>
                           </div>
                           {project.posDoc && <div className="mt-2 text-[10px] font-bold text-green-600 bg-green-50 px-2 py-1 rounded w-fit flex items-center gap-1"><CheckCircle2 className="w-3" /> {project.posDoc.name}</div>}
                        </div>
                     </div>
                     
                     <div className="flex justify-between items-center pt-2">
                        <button onClick={handleValidateDocuments} disabled={isValidating} className="text-[10px] font-bold uppercase text-slate-400 hover:text-blue-600 flex items-center gap-1"><ShieldCheck className="w-3" /> Проверить документы</button>
                     </div>
                     
                     {validationResult && !validationResult.isConsistent && (
                         <div className="bg-red-50 p-3 rounded-lg border border-red-100">
                             <p className="text-[10px] font-bold text-red-700 mb-1 flex items-center gap-1"><ShieldAlert className="w-3" /> Найдены проблемы:</p>
                             <ul className="list-disc pl-4 space-y-1">
                                 {validationResult.issues.map((iss, i) => <li key={i} className="text-[9px] text-red-600">{iss}</li>)}
                             </ul>
                         </div>
                     )}

                     <div className="space-y-4 pt-4 border-t border-slate-100">
                        <SearchableInput label="Проект" value={project.projectName} onChange={v => updateProject('projectName', v)} />
                        <SearchableInput label="Шифр проекта" value={project.workingDocCode} onChange={v => updateProject('workingDocCode', v)} />
                        <SearchableInput label="Объект" value={project.objectName} onChange={v => updateProject('objectName', v)} suggestions={dictionaries.objects.map(o => o.name)} />
                        <SearchableInput label="Адрес" value={project.location} onChange={v => updateProject('location', v)} icon={<MapPin className="w-3 h-3" />} />
                        <SearchableInput label="Заказчик" value={project.client} onChange={v => updateProject('client', v)} suggestions={dictionaries.clients.map(c => c.name)} />
                        <SearchableInput label="Подрядчик" value={project.contractor} onChange={v => updateProject('contractor', v)} suggestions={dictionaries.contractors.map(c => c.name)} />
                     </div>

                     {/* Work Type Selection */}
                     <div className="space-y-4 mt-6">
                        <h2 className="text-[10px] font-black uppercase text-slate-400 tracking-widest border-l-4 border-slate-300 pl-3">Виды работ ({project.workType.length})</h2>
                        <WorkTreeSelect label="Выбрать из каталога" selectedItems={project.workType} onChange={(v: any) => updateProject('workType', v)} catalog={dictionaries.workCatalog} />
                        
                        {/* Selected Works List with Date Inputs */}
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
                     
                     {project.workType.length > 0 && (
                         <button 
                            onClick={() => setCurrentStep('grouping')} 
                            className="w-full py-3 mt-4 border border-blue-200 bg-blue-50 text-blue-700 rounded-xl font-bold uppercase text-[10px] hover:bg-blue-100 transition-all flex items-center justify-center gap-2"
                         >
                            <Network className="w-4 h-4" /> Настроить Группы ТК
                         </button>
                     )}

                     <button 
                      onClick={() => setCurrentStep('edit')} 
                      disabled={!isProjectReady}
                      className={`w-full py-4 mt-2 rounded-2xl font-black uppercase shadow-xl transition-all flex items-center justify-center gap-2 ${isProjectReady ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
                    >
                      Перейти к генерации <ChevronRight className="w-4" />
                    </button>
                  </>
                ) : currentStep === 'grouping' ? (
                  <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest border-l-4 border-purple-500 pl-3">Группировка ТК</h2>
                        <button onClick={() => setCurrentStep('new-project')} className="text-[10px] font-bold text-slate-400 hover:text-slate-600 uppercase">Назад</button>
                      </div>

                      <div className="bg-purple-50 p-4 rounded-xl border border-purple-100">
                          <p className="text-[10px] text-purple-800 mb-3 leading-relaxed">
                              Объедините схожие работы в одну Технологическую карту для сокращения объема документации. Используйте AI или настройте вручную.
                          </p>
                          <button 
                            onClick={handleAiGrouping}
                            disabled={isGrouping}
                            className="w-full py-2 bg-purple-600 text-white rounded-lg text-xs font-black uppercase hover:bg-purple-700 transition-all flex items-center justify-center gap-2 shadow-sm"
                          >
                             {isGrouping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                             Авто-группировка AI
                          </button>
                      </div>

                      {/* Manual Group Controls */}
                      <div className="flex gap-2">
                          <button onClick={createNewGroup} className="flex-1 py-2 border border-slate-200 rounded-lg text-[10px] font-bold uppercase hover:bg-slate-50 flex items-center justify-center gap-1">
                              <Plus className="w-3" /> Создать группу
                          </button>
                          {project.tkGroups.length > 0 && (
                            <button onClick={ungroupAll} className="flex-1 py-2 border border-red-200 text-red-600 rounded-lg text-[10px] font-bold uppercase hover:bg-red-50 flex items-center justify-center gap-1">
                                <Trash2 className="w-3" /> Сброс
                            </button>
                          )}
                      </div>

                      <div className="space-y-4">
                          {/* List of Groups */}
                          {project.tkGroups.map((group) => (
                              <div key={group.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                                  <div className="bg-slate-50 px-3 py-2 border-b border-slate-100 flex items-center justify-between">
                                      <input 
                                        className="bg-transparent text-xs font-bold text-slate-700 w-full outline-none"
                                        value={group.title}
                                        onChange={(e) => updateGroupTitle(group.id, e.target.value)}
                                      />
                                      <span className="text-[9px] font-bold bg-slate-200 text-slate-500 px-1.5 rounded ml-2">{group.works.length}</span>
                                  </div>
                                  <div className="p-2 space-y-1">
                                      {group.works.length === 0 && <div className="text-[9px] text-slate-300 text-center py-2">Перетащите работы сюда</div>}
                                      {group.works.map(w => (
                                          <div key={w} className="flex items-center justify-between text-[10px] text-slate-600 bg-slate-50 px-2 py-1.5 rounded border border-transparent hover:border-slate-200 group/item">
                                              <span className="truncate w-[180px]">{w}</span>
                                              <button onClick={() => moveWorkToGroup(w, null)} className="opacity-0 group-hover/item:opacity-100 text-slate-400 hover:text-red-500"><X className="w-3" /></button>
                                          </div>
                                      ))}
                                  </div>
                              </div>
                          ))}

                          {/* Ungrouped Works */}
                          {getUnassignedWorks().length > 0 && (
                              <div className="mt-6 border-t border-slate-100 pt-4">
                                  <h3 className="text-[10px] font-black uppercase text-slate-400 mb-3 pl-1">Несгруппированные работы</h3>
                                  <div className="space-y-2">
                                      {getUnassignedWorks().map(w => (
                                          <div key={w} className="bg-white border border-slate-200 p-2 rounded-lg shadow-sm flex flex-col gap-2">
                                              <span className="text-[11px] font-bold text-slate-700">{w}</span>
                                              {project.tkGroups.length > 0 && (
                                                  <select 
                                                    className="w-full text-[10px] bg-slate-50 border border-slate-200 rounded px-2 py-1 outline-none"
                                                    onChange={(e) => moveWorkToGroup(w, e.target.value)}
                                                    value=""
                                                  >
                                                      <option value="" disabled>Переместить в группу...</option>
                                                      {project.tkGroups.map(g => (
                                                          <option key={g.id} value={g.id}>{g.title}</option>
                                                      ))}
                                                  </select>
                                              )}
                                          </div>
                                      ))}
                                  </div>
                              </div>
                          )}
                      </div>
                      
                      <button 
                        onClick={() => setCurrentStep('edit')}
                        className="w-full py-4 mt-4 bg-blue-600 text-white rounded-2xl font-black uppercase shadow-xl hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
                      >
                         Подтвердить и Продолжить <ChevronRight className="w-4" />
                      </button>
                  </div>
                ) : currentStep === 'edit' ? (
                  // ... (Edit step UI)
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                       <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest border-l-4 border-blue-600 pl-3">Генерация разделов</h2>
                       <div className="flex gap-2">
                            {/* ... Buttons ... */}
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

                    {/* Rendering TK Sections: Either Groups or Individual Works */}
                    {(project.tkGroups.length > 0 ? project.tkGroups.map(g => ({ id: g.id, title: g.title, isGroup: true })) : project.workType.map(w => ({ id: w, title: w, isGroup: false }))).map((item) => (
                      <div key={item.id} className="space-y-2 mt-4 pt-4 border-t border-slate-100">
                         <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-2 truncate flex items-center gap-2" title={item.title}>
                           {item.isGroup && <Layers className="w-3 h-3 text-purple-400" />} ТК: {item.title}
                         </h3>
                         {(project.tkMap[item.id] || []).map((s, idx) => (
                           <div key={`${item.id}-${idx}`} className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-white shadow-sm hover:border-blue-200 transition-all">
                             <span className={`text-xs font-bold truncate pr-2 ${s.status === 'completed' ? 'text-green-700' : 'text-slate-700'}`}>
                               {idx + 1}. {s.title}
                             </span>
                             <button onClick={() => generateSingleTkSection(item.id, idx, item.isGroup)} className={`p-1 rounded-lg transition-colors ${
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
           
           {/* ... Dictionaries, Help, Knowledge Base unchanged ... */}
           {currentStep === 'dictionaries' && (
             <div className="space-y-6">
                <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest border-l-4 border-blue-600 pl-3">Справочники</h2>
                <div className="space-y-1">
                   {[
                     { id: 'objects', label: 'Объекты', icon: <Building2 className="w-4" /> },
                     { id: 'clients', label: 'Заказчики', icon: <UserCog className="w-4" /> },
                     { id: 'contractors', label: 'Подрядчики', icon: <HardHat className="w-4" /> },
                     { id: 'works', label: 'Виды работ', icon: <ListPlus className="w-4" /> }
                   ].map((t) => (
                      <button key={t.id} onClick={() => setDictTab(t.id as any)} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all ${dictTab === t.id ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50'}`}>
                        {t.icon} {t.label}
                      </button>
                   ))}
                </div>
             </div>
           )}
           
           {currentStep === 'knowledge' && (
               <div className="space-y-6">
                   <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest border-l-4 border-blue-600 pl-3">База знаний</h2>
                   <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                       <p className="text-[10px] text-slate-500 mb-3">Загрузите файлы, которые AI будет использовать как источник истины.</p>
                       
                       {/* Category Selector */}
                       <div className="flex gap-2 mb-4 overflow-x-auto pb-2 no-scrollbar">
                           {['СП', 'ГОСТ', 'Техкарта', 'Прочее'].map(cat => (
                               <button 
                                key={cat}
                                onClick={() => setLibraryCategory(cat as any)}
                                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-colors whitespace-nowrap ${libraryCategory === cat ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-100'}`}
                               >
                                   {cat}
                               </button>
                           ))}
                       </div>

                       <div className="border border-dashed border-blue-300 rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer bg-white hover:bg-blue-50 transition-colors" onClick={() => libraryInputRef.current?.click()}>
                            <input ref={libraryInputRef} type="file" className="hidden" accept=".pdf,.doc,.docx" onChange={handleLibraryUpload} />
                            <Upload className="w-6 h-6 text-blue-400" />
                            <span className="text-[10px] font-bold text-blue-600">Загрузить {libraryCategory}</span>
                       </div>
                   </div>
                   
                   <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mt-4">
                       <p className="text-[10px] text-slate-500 mb-3">База данных ГЭСН (Excel/CSV)</p>
                       <div className={`border border-dashed border-green-300 rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors ${processingFile === 'gesn' ? 'bg-green-50 ring-2 ring-green-100' : 'bg-white hover:bg-green-50'}`} onClick={() => !processingFile && gesnInputRef.current?.click()}>
                            <input ref={gesnInputRef} type="file" className="hidden" accept=".xlsx,.xls,.csv" multiple onChange={handleGesnUpload} />
                            {processingFile === 'gesn' ? <Loader2 className="w-6 h-6 text-green-500 animate-spin" /> : <Database className="w-6 h-6 text-green-400" />}
                            <span className="text-[10px] font-bold text-green-600">Загрузить ГЭСН</span>
                       </div>
                       <p className="text-[9px] text-slate-400 mt-2 text-center">Загружено: {project.gesnDocs.length} файлов</p>
                   </div>
               </div>
           )}
           
           {currentStep === 'ppr-register' && (
                 <div className="flex-1 overflow-y-auto p-8">
                     <h2 className="text-2xl font-bold mb-6 text-slate-800">Реестр проектов ППР</h2>
                     <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                         <table className="w-full text-left">
                             <thead className="bg-slate-50 border-b border-slate-200">
                                 <tr>
                                     <th className="p-4 text-xs font-black uppercase text-slate-500">Название проекта</th>
                                     <th className="p-4 text-xs font-black uppercase text-slate-500">Объект</th>
                                     <th className="p-4 text-xs font-black uppercase text-slate-500">Дата</th>
                                     <th className="p-4 text-xs font-black uppercase text-slate-500 text-right">Действия</th>
                                 </tr>
                             </thead>
                             <tbody className="divide-y divide-slate-100">
                                 {filteredProjects.map(p => (
                                     <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                                         <td className="p-4 font-bold text-slate-700">{p.data.projectName}</td>
                                         <td className="p-4 text-sm text-slate-600">{p.data.objectName}</td>
                                         <td className="p-4 text-sm text-slate-500">{new Date(p.timestamp).toLocaleDateString()}</td>
                                         <td className="p-4 text-right">
                                             <button onClick={() => { setProject(p.data); setPprSections(p.pprSections); setCurrentStep('edit'); }} className="text-blue-600 font-bold text-xs hover:underline">Открыть</button>
                                         </td>
                                     </tr>
                                 ))}
                                 {filteredProjects.length === 0 && (
                                     <tr>
                                         <td colSpan={4} className="p-8 text-center text-slate-400">Нет сохраненных проектов</td>
                                     </tr>
                                 )}
                             </tbody>
                         </table>
                     </div>
                 </div>
             )}
             
             {currentStep === 'help' && (
                 <div className="flex-1 overflow-y-auto p-8">
                     <h2 className="text-2xl font-bold mb-6 text-slate-800">Справка и документация</h2>
                     <div className="grid grid-cols-2 gap-6">
                         {HELP_CONTENT.map(article => (
                             <div key={article.id} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                                 <div className="flex items-center gap-3 mb-4 text-blue-600">
                                     {article.icon}
                                     <h3 className="font-bold text-lg">{article.title}</h3>
                                 </div>
                                 <div className="text-sm text-slate-600 leading-relaxed">
                                     {article.content}
                                 </div>
                             </div>
                         ))}
                     </div>
                 </div>
             )}
        </aside>
        
        {/* Main Content Area */}
        <div className="flex-1 bg-slate-100 overflow-hidden relative flex flex-col" id="print-content">
             {(currentStep === 'new-project' || currentStep === 'edit' || currentStep === 'grouping') && (
                <div className="flex-1 overflow-y-auto custom-scrollbar p-8 flex flex-col items-center gap-8 pb-[300px]">
                  {docLayout.pages.map((pContent, i) => (
                    <div key={i} className="page-container shadow-2xl">
                      <div className="gost-frame"></div>
                      <div className={`gost-content ${i === 0 || (pContent.type === 'toc' && pContent.tocPageIndex === 0) || pContent.type === 'approval-sheet' ? 'content-with-form-5' : 'content-with-form-6'} ${i === 0 ? 'title-page-content' : ''}`}>
                         {pContent.type === 'title' ? (
                            <div className="flex flex-col h-full justify-between">
                                {/* Title content rendered via docx generator mainly, here plain preview */}
                                <div className="text-center pt-20">
                                    <h1 className="font-bold text-xl uppercase mb-10">{project.contractor || "ОРГАНИЗАЦИЯ"}</h1>
                                    <h2 className="font-bold text-3xl uppercase mb-5">ПРОЕКТ ПРОИЗВОДСТВА РАБОТ</h2>
                                    <p className="text-lg mb-20">{project.projectName || "НАЗВАНИЕ ПРОЕКТА"}</p>
                                    <p className="italic">Шифр: {project.workingDocCode || "..."}</p>
                                </div>
                                <div className="text-center pb-10">г. Москва {new Date().getFullYear()}</div>
                            </div>
                         ) : pContent.type === 'toc' ? (
                            <div className="p-10">
                                {pContent.tocPageIndex === 0 && <h2 className="font-bold text-center uppercase mb-6">СОДЕРЖАНИЕ</h2>}
                                {pContent.entries.map((entry: any, idx: number) => (
                                    <div key={idx} className={`flex justify-between mb-2 text-sm ${entry.level === 1 ? 'font-bold' : 'pl-4'}`}>
                                        <span>{entry.title}</span>
                                        <span>{entry.page}</span>
                                    </div>
                                ))}
                            </div>
                         ) : pContent.type === 'tk-separator' ? (
                            <div className="flex items-center justify-center h-full text-center p-20">
                                <div>
                                    <h1 className="font-bold text-2xl uppercase mb-4">ТЕХНОЛОГИЧЕСКАЯ КАРТА</h1>
                                    <p className="text-xl">{pContent.title}</p>
                                </div>
                            </div>
                         ) : pContent.type === 'approval-sheet' ? (
                            <div className="p-10">
                                <h2 className="font-bold text-center uppercase mb-8">ЛИСТ СОГЛАСОВАНИЯ</h2>
                                <table className="w-full border-collapse border border-black text-sm">
                                    <thead>
                                        <tr>
                                            <th className="border border-black p-2 w-[5%]">№</th>
                                            <th className="border border-black p-2 w-[30%]">Должность</th>
                                            <th className="border border-black p-2 w-[25%]">Ф.И.О.</th>
                                            <th className="border border-black p-2 w-[20%]">Подпись</th>
                                            <th className="border border-black p-2 w-[20%]">Дата</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {[1,2,3,4,5].map(n => (
                                            <tr key={n}>
                                                <td className="border border-black p-2 text-center">{n}</td>
                                                <td className="border border-black p-2">&nbsp;</td>
                                                <td className="border border-black p-2">&nbsp;</td>
                                                <td className="border border-black p-2">&nbsp;</td>
                                                <td className="border border-black p-2">&nbsp;</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                         ) : pContent.type === 'acquaintance-sheet' ? (
                            <div className="p-10">
                                <h2 className="font-bold text-center uppercase mb-8">ЛИСТ ОЗНАКОМЛЕНИЯ</h2>
                                <p className="text-sm mb-6 text-justify">С содержанием настоящего проекта производства работ ознакомлены:</p>
                                <table className="w-full border-collapse border border-black text-sm">
                                    <thead>
                                        <tr>
                                            <th className="border border-black p-2 w-[5%]">№</th>
                                            <th className="border border-black p-2 w-[30%]">Ф.И.О.</th>
                                            <th className="border border-black p-2 w-[25%]">Должность</th>
                                            <th className="border border-black p-2 w-[20%]">Подпись</th>
                                            <th className="border border-black p-2 w-[20%]">Дата</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {[1,2,3,4,5,6,7,8,9,10].map(n => (
                                            <tr key={n}>
                                                <td className="border border-black p-2 text-center">{n}</td>
                                                <td className="border border-black p-2">&nbsp;</td>
                                                <td className="border border-black p-2">&nbsp;</td>
                                                <td className="border border-black p-2">&nbsp;</td>
                                                <td className="border border-black p-2">&nbsp;</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                         ) : (
                           <>
                             {pContent.isFirstPage && <h3 className="font-bold text-center uppercase mb-4">{pContent.secTitle || pContent.title}</h3>}
                             <ReactMarkdown 
                               remarkPlugins={[remarkGfm]}
                               components={{
                                 h1: ({node, ...props}) => <h1 className="font-bold text-center uppercase text-lg my-4" {...props} />,
                                 h2: ({node, ...props}) => <h2 className="font-bold text-center uppercase text-base my-3" {...props} />,
                                 h3: ({node, ...props}) => <h3 className="font-bold text-left uppercase text-sm my-2" {...props} />,
                                 p: ({node, ...props}) => <p className="mb-2 text-justify indent-8" {...props} />,
                                 ul: ({node, ...props}) => <ul className="list-disc pl-10 mb-2" {...props} />,
                                 ol: ({node, ...props}) => <ol className="list-decimal pl-10 mb-2" {...props} />,
                                 table: ({node, ...props}) => <table className="w-full border-collapse border border-black mb-4 text-xs" {...props} />,
                                 th: ({node, ...props}) => <th className="border border-black p-1 bg-gray-100" {...props} />,
                                 td: ({node, ...props}) => <td className="border border-black p-1" {...props} />,
                               }}
                             >
                               {pContent.content}
                             </ReactMarkdown>
                           </>
                         )}
                      </div>
                      <div className={`main-stamp ${i === 0 || (pContent.type === 'toc' && pContent.tocPageIndex === 0) || pContent.type === 'approval-sheet' ? 'stamp-form-5' : 'stamp-form-6'}`}>
                         <MainStamp pageNum={pContent.pageNum} totalPages={docLayout.totalPages} type={i === 0 || (pContent.type === 'toc' && pContent.tocPageIndex === 0) || pContent.type === 'approval-sheet' ? 'form5' : 'form6'} project={project} />
                      </div>
                    </div>
                  ))}
                </div>
             )}
             
             {currentStep === 'dictionaries' && (
                 <div className="flex-1 overflow-y-auto p-8">
                     <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                         <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                             {dictTab === 'objects' && <Building2 className="w-6 text-blue-600" />}
                             {dictTab === 'clients' && <UserCog className="w-6 text-blue-600" />}
                             {dictTab === 'contractors' && <HardHat className="w-6 text-blue-600" />}
                             {dictTab === 'objects' ? 'Справочник объектов' : dictTab === 'clients' ? 'Справочник заказчиков' : 'Справочник подрядчиков'}
                         </h2>
                         
                         {/* Simple list view for now */}
                         <div className="space-y-2">
                             {(dictionaries as any)[dictTab]?.map((item: any) => (
                                 <div key={item.id} className="p-3 border border-slate-100 rounded-xl hover:bg-slate-50 flex justify-between items-center">
                                     <div>
                                         <p className="font-bold text-sm text-slate-700">{item.name}</p>
                                         <p className="text-xs text-slate-400">{item.address || item.legalAddress}</p>
                                     </div>
                                 </div>
                             ))}
                             <button className="w-full py-3 border border-dashed border-slate-300 rounded-xl text-slate-400 font-bold uppercase text-xs hover:border-blue-400 hover:text-blue-500 transition-colors flex items-center justify-center gap-2">
                                 <Plus className="w-4" /> Добавить запись
                             </button>
                         </div>
                     </div>
                 </div>
             )}
             
             {/* ... */}
             
             {/* Log Panel */}
             {isLogOpen && (
                 <div 
                    style={{ height: logHeight }} 
                    className="absolute bottom-0 left-0 right-0 bg-slate-900 text-slate-300 font-mono text-xs border-t border-slate-700 shadow-2xl flex flex-col z-[50]"
                 >
                     <div 
                        className="h-1 bg-slate-700 cursor-ns-resize hover:bg-blue-500 transition-colors w-full"
                        onMouseDown={startResizing}
                     ></div>
                     <div className="flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700 shrink-0">
                         <div className="flex items-center gap-2">
                             <Terminal className="w-3 h-3 text-green-400" />
                             <span className="font-bold text-slate-100">System Logs</span>
                         </div>
                         <div className="flex items-center gap-2">
                             <button onClick={() => setSystemLogs([])} className="hover:text-white"><Trash2 className="w-3 h-3" /></button>
                             <button onClick={() => setIsLogOpen(false)} className="hover:text-white"><ChevronDown className="w-3 h-3" /></button>
                         </div>
                     </div>
                     <div className="flex-1 overflow-y-auto p-4 space-y-1.5 scroll-smooth custom-scrollbar bg-slate-900">
                         {systemLogs.map(log => (
                             <div key={log.id} className="flex gap-3">
                                 <span className="text-slate-500 shrink-0">[{log.timestamp}]</span>
                                 <span className={`${
                                     log.type === 'error' ? 'text-red-400' : 
                                     log.type === 'success' ? 'text-green-400' : 
                                     log.type === 'warning' ? 'text-amber-400' : 
                                     log.type === 'ai' ? 'text-purple-400' : 'text-slate-300'
                                 }`}>
                                     {log.type === 'ai' && '🤖 '}{log.message}
                                 </span>
                             </div>
                         ))}
                         <div ref={logEndRef} />
                     </div>
                 </div>
             )}
        </div>
      </main>
      
      {/* ... Footer ... */}
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