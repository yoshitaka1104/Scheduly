export type Period = number;

export interface ClassInfo {
  id: string;
  grade: number;
  name: string; // e.g., "1組", "A組"
}

export interface SubClass {
  id: string;
  subject: string;
  teacher: string;
  memo?: string;
  hasTask?: boolean;
  location?: string;
  isElective?: boolean;
}

export interface TimetableBlock {
  id: string;
  classId: string;
  date: string; // YYYY-MM-DD
  period: Period;
  isBase: boolean; // Excelからインポートされた基本設定か、手動で変更されたものか
  isBatch?: boolean; // 一括処理で作成されたものかどうか（マージ判定用）
  isMemoModified?: boolean; // 課題や場所が変更されたかどうか
  subClasses: SubClass[];
}

export interface Settings {
  periodsPerDay: number; // 一律の設定（簡略化）あるいは曜日別
  namingRule: 'number' | 'alphabet' | 'custom';
}

export interface AuditLog {
  id: string;
  timestamp: string;
  targetDate?: string;
  action: 'move' | 'swap' | 'update_memo' | 'import' | 'delete' | 'bulk_update';
  details: string;
}
