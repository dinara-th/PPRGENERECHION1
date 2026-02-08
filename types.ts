
export enum DocumentType {
  PPR = 'ППР',
  TK = 'ТК'
}

export interface WorkingDoc {
  name: string;
  data: string; // base64
  mimeType: string;
}

export interface ReferenceFile extends WorkingDoc {
  id: string;
  category: 'ГЭСН' | 'ФЕР' | 'СП' | 'ГОСТ' | 'Техкарта' | 'Прочее';
  uploadedAt: string;
}

export interface DocSection {
  id: string;
  title: string;
  content: string;
  status: 'idle' | 'generating' | 'completed' | 'error';
}

export interface ConstructionObject {
  id: string;
  name: string;
  address: string;
}

export interface ClientEntry {
  id: string;
  name: string;
  legalAddress: string;
  chiefEngineer: string;
}

export interface ContractorEntry {
  id: string;
  name: string;
  legalAddress: string;
  developer: string;
}

export interface TkGroup {
  id: string;
  title: string; // Название общей ТК (например, "Монтаж трубопроводов")
  works: string[]; // Список конкретных работ, входящих в эту ТК
}

export interface ProjectData {
  id: string;
  version: number;
  docType: DocumentType.PPR;
  projectName: string;
  objectName: string;
  client: string;
  contractor: string;
  location: string;
  workType: string[]; // Полный список работ (исходный)
  tkGroups: TkGroup[]; // Группировка работ по ТК
  workDeadlines: Record<string, { start: string; end: string }>;
  workingDocName: string;
  workingDocCode: string;
  posDoc?: WorkingDoc; 
  estimateDoc?: WorkingDoc; 
  gesnDocs: WorkingDoc[]; 
  roleDeveloper: string;
  roleClientChiefEngineer: string;
  roleAuthorSupervision: string;
  date: string;
  workingDocs: WorkingDoc[];
  tkMap: Record<string, DocSection[]>; // Key is now Group ID (or Work Name for legacy)
  aiWorksFromEstimate: string[];
  aiWorksFromDocs: string[];
}

export interface SavedProject {
  id: string;
  version: number;
  data: ProjectData;
  pprSections: DocSection[];
  timestamp: string;
}

export interface PrintOptions {
  showHeader: boolean;
  showFooter: boolean;
  showPageNumbers: boolean;
  fontSize: 'small' | 'medium' | 'large';
}
