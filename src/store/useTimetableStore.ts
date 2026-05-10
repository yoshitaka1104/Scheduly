import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import { TimetableBlock, ClassInfo, Settings, AuditLog, Period } from '../types';

interface TimetableState {
  currentDate: Date;
  blocks: TimetableBlock[];
  classes: ClassInfo[];
  settings: Settings;
  logs: AuditLog[];
  visibleGrades: number[];
  
  setCurrentDate: (date: Date) => void;
  setBlocks: (blocks: TimetableBlock[]) => void;
  mergeBlocks: (blocks: TimetableBlock[]) => void;
  setClasses: (classes: ClassInfo[]) => void;
  setSettings: (settings: Partial<Settings>) => void;
  setVisibleGrades: (grades: number[]) => void;
  updateBlock: (id: string, partial: Partial<TimetableBlock>) => void;
  updateBlocks: (ids: string[], partial: Partial<TimetableBlock>) => void;
  moveBlock: (id: string, targetClassId: string, targetPeriod: Period) => void;
  swapBlocks: (id1: string, id2: string) => void;
  swapMergedBlocks: (date: string, sourceCells: { classId: string, period: Period }[], periodOffset: number) => void;
  batchSwapPeriods: (date: string, period1: Period, period2: Period, targetGrades: number[]) => void;
  batchDeletePeriod: (date: string, startPeriod: Period, endPeriod: Period, targetGrades: number[]) => void;
  batchUpdatePeriod: (date: string, startPeriod: Period, endPeriod: Period, text: string, targetGrades: number[]) => void;
  copyDayTimetable: (sourceDate: string, targetDate: string, targetGrades: number[]) => void;
  addLog: (log: Omit<AuditLog, 'id' | 'timestamp'>) => void;
  pastBlocks: TimetableBlock[][];
  undo: () => void;
  isChangeOnlyView: boolean;
  setIsChangeOnlyView: (value: boolean) => void;
}

const generateDefaultClasses = (): ClassInfo[] => {
  const classes: ClassInfo[] = [];
  for (let grade = 1; grade <= 3; grade++) {
    for (let c = 1; c <= 7; c++) {
      classes.push({ id: `g${grade}c${c}`, grade, name: `${c}組` });
    }
  }
  return classes;
};

// ブロックが本来の場所（Excelインポート時の初期位置）に戻ったかどうかを判定する
const checkIsOriginalPosition = (id: string, newClassId: string, newDate: string, newPeriod: number): boolean => {
  if (!id.startsWith('base-')) return false; // 手動追加されたものは常にfalse
  const parts = id.split('-');
  if (parts.length >= 6) {
    const origDate = `${parts[1]}-${parts[2]}-${parts[3]}`;
    const origClassId = parts[4];
    const origPeriod = parseInt(parts[5]);
    return origDate === newDate && origClassId === newClassId && origPeriod === newPeriod;
  }
  return false;
};


const idbStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    return new Promise((resolve) => {
      const request = indexedDB.open('scheduly-db', 1);
      request.onupgradeneeded = (e: any) => e.target.result.createObjectStore('store');
      request.onsuccess = (e: any) => {
        const db = e.target.result;
        // storeが存在しない場合はnullを返す（アップグレード処理がうまく走らなかった場合など）
        if (!db.objectStoreNames.contains('store')) {
          resolve(null);
          return;
        }
        const tx = db.transaction('store', 'readonly');
        const store = tx.objectStore('store');
        const getReq = store.get(name);
        getReq.onsuccess = () => resolve(getReq.result || null);
        getReq.onerror = () => resolve(null);
      };
      request.onerror = () => resolve(null);
    });
  },
  setItem: async (name: string, value: string): Promise<void> => {
    return new Promise((resolve) => {
      const request = indexedDB.open('scheduly-db', 1);
      request.onupgradeneeded = (e: any) => e.target.result.createObjectStore('store');
      request.onsuccess = (e: any) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('store')) {
          resolve();
          return;
        }
        const tx = db.transaction('store', 'readwrite');
        const store = tx.objectStore('store');
        store.put(value, name);
        tx.oncomplete = () => resolve();
      };
    });
  },
  removeItem: async (name: string): Promise<void> => {
    return new Promise((resolve) => {
      const request = indexedDB.open('scheduly-db', 1);
      request.onsuccess = (e: any) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('store')) {
          resolve();
          return;
        }
        const tx = db.transaction('store', 'readwrite');
        const store = tx.objectStore('store');
        store.delete(name);
        tx.oncomplete = () => resolve();
      };
    });
  },
};

export const useTimetableStore = create<TimetableState>()(
  persist(
    (set) => ({
      currentDate: new Date(), // アプリを開いた時は今日を表示
      blocks: [],
      classes: generateDefaultClasses(),
      settings: {
        periodsPerDay: 7,
        namingRule: 'number'
      },
      logs: [],
      visibleGrades: [1, 2, 3],
      pastBlocks: [],
      isChangeOnlyView: false,

      setIsChangeOnlyView: (value) => set({ isChangeOnlyView: value }),
      setCurrentDate: (date) => set({ currentDate: date }),
      undo: () => set((state) => {
        if (state.pastBlocks.length === 0) return state;
        const previousBlocks = state.pastBlocks[state.pastBlocks.length - 1];
        const newPastBlocks = state.pastBlocks.slice(0, -1);
        const newLogs = state.logs.length > 0 ? state.logs.slice(1) : [];
        return { 
          blocks: previousBlocks, 
          pastBlocks: newPastBlocks,
          logs: newLogs
        };
      }),
      setBlocks: (blocks) => set({ blocks }),
      mergeBlocks: (newBlocks) => set((state) => {
        const newBlocksSet = new Set(newBlocks.map(nb => `${nb.date}-${nb.classId}-${nb.period}`));
        const existingFiltered = state.blocks.filter(b => !newBlocksSet.has(`${b.date}-${b.classId}-${b.period}`));
        const updatedBlocks = [...existingFiltered, ...newBlocks];
        return { 
          pastBlocks: [...state.pastBlocks.slice(-19), state.blocks],
          blocks: updatedBlocks 
        };
      }),
      setClasses: (classes) => set({ classes }),
      setSettings: (settings) => set((state) => ({ settings: { ...state.settings, ...settings } })),
      setVisibleGrades: (grades) => set({ visibleGrades: grades }),
      
      updateBlock: (id, partial) => set((state) => {
        const newBlocks = state.blocks.map(b => b.id === id ? { ...b, ...partial } : b);
        return {
          pastBlocks: [...state.pastBlocks.slice(-19), state.blocks],
          blocks: newBlocks
        };
      }),

      updateBlocks: (ids, partial) => set((state) => {
        const idSet = new Set(ids);
        const newBlocks = state.blocks.map(b => idSet.has(b.id) ? { ...b, ...partial } : b);
        return {
          pastBlocks: [...state.pastBlocks.slice(-19), state.blocks],
          blocks: newBlocks
        };
      }),

      moveBlock: (id, targetClassId, targetPeriod) => set((state) => {
        const newBlocks = state.blocks.map(b => {
          if (b.id === id) {
            const isOrig = checkIsOriginalPosition(b.id, targetClassId, b.date, targetPeriod);
            return { ...b, classId: targetClassId, period: targetPeriod, isBase: isOrig };
          }
          return b;
        });
        return {
          pastBlocks: [...state.pastBlocks.slice(-19), state.blocks],
          blocks: newBlocks
        };
      }),

      swapBlocks: (id1, id2) => set((state) => {
        const block1 = state.blocks.find(b => b.id === id1);
        const block2 = state.blocks.find(b => b.id === id2);
        
        if (!block1 || !block2) return state;

        const newBlocks = state.blocks.map(b => {
          if (b.id === id1) {
            const isOrig = checkIsOriginalPosition(b.id, block2.classId, b.date, block2.period);
            return { ...b, classId: block2.classId, period: block2.period, isBase: isOrig };
          }
          if (b.id === id2) {
            const isOrig = checkIsOriginalPosition(b.id, block1.classId, b.date, block1.period);
            return { ...b, classId: block1.classId, period: block1.period, isBase: isOrig };
          }
          return b;
        });

        return { 
          pastBlocks: [...state.pastBlocks.slice(-19), state.blocks],
          blocks: newBlocks 
        };
      }),

      swapMergedBlocks: (date, sourceCells, periodOffset) => set((state) => {
        if (periodOffset === 0) return state;
        
        const newBlocks = state.blocks.map(b => {
          if (b.date !== date) return b;

          // ソースセルに該当するか確認
          const isSource = sourceCells.find(sc => sc.classId === b.classId && sc.period === b.period);
          if (isSource) {
            const newPeriod = (b.period + periodOffset) as Period;
            const isOrig = checkIsOriginalPosition(b.id, b.classId, b.date, newPeriod);
            return { ...b, period: newPeriod, isBase: isOrig };
          }

          // ターゲットセルに該当するか確認
          const isTarget = sourceCells.find(sc => sc.classId === b.classId && (sc.period + periodOffset) === b.period);
          if (isTarget) {
            const newPeriod = (b.period - periodOffset) as Period;
            const isOrig = checkIsOriginalPosition(b.id, b.classId, b.date, newPeriod);
            return { ...b, period: newPeriod, isBase: isOrig };
          }

          return b;
        });

        return {
          pastBlocks: [...state.pastBlocks.slice(-19), state.blocks],
          blocks: newBlocks
        };
      }),

      batchSwapPeriods: (date, p1, p2, targetGrades) => set((state) => {
        const newBlocks = state.blocks.map(b => {
          const cls = state.classes.find(c => c.id === b.classId);
          if (cls && targetGrades.includes(cls.grade) && b.date === date) {
            if (b.period === p1) {
              const isOrig = checkIsOriginalPosition(b.id, b.classId, b.date, p2);
              return { ...b, period: p2, isBase: isOrig };
            }
            if (b.period === p2) {
              const isOrig = checkIsOriginalPosition(b.id, b.classId, b.date, p1);
              return { ...b, period: p1, isBase: isOrig };
            }
          }
          return b;
        });
        return { 
          pastBlocks: [...state.pastBlocks.slice(-19), state.blocks],
          blocks: newBlocks 
        };
      }),

      batchDeletePeriod: (date, startPeriod, endPeriod, targetGrades) => set((state) => {
        const minPeriod = Math.min(startPeriod, endPeriod);
        const maxPeriod = Math.max(startPeriod, endPeriod);
        const newBlocks = state.blocks.filter(b => {
          const cls = state.classes.find(c => c.id === b.classId);
          if (!cls || !targetGrades.includes(cls.grade)) return true; // 対象外の学年はそのまま残す
          return !(b.date === date && b.period >= minPeriod && b.period <= maxPeriod);
        });
        return { 
          pastBlocks: [...state.pastBlocks.slice(-19), state.blocks],
          blocks: newBlocks 
        };
      }),

      batchUpdatePeriod: (date, startPeriod, endPeriod, text, targetGrades) => set((state) => {
        const minPeriod = Math.min(startPeriod, endPeriod);
        const maxPeriod = Math.max(startPeriod, endPeriod);
        
        const filteredBlocks = state.blocks.filter(b => {
          const cls = state.classes.find(c => c.id === b.classId);
          if (!cls || !targetGrades.includes(cls.grade)) return true;
          return !(b.date === date && b.period >= minPeriod && b.period <= maxPeriod);
        });
        
        const newBlocks: TimetableBlock[] = [];
        for (let p = minPeriod; p <= maxPeriod; p++) {
          state.classes.forEach(cls => {
            if (targetGrades.includes(cls.grade)) {
              newBlocks.push({
                id: `b-${date}-${cls.id}-${p}-${crypto.randomUUID()}`,
                classId: cls.id,
                date: date,
                period: p as Period,
                isBase: false,
                isBatch: true,
                subClasses: [{
                  id: crypto.randomUUID(),
                  subject: text,
                  teacher: ''
                }]
              });
            }
          });
        }
        
        return { 
          pastBlocks: [...state.pastBlocks.slice(-19), state.blocks],
          blocks: [...filteredBlocks, ...newBlocks] 
        };
      }),

      copyDayTimetable: (sourceDate, targetDate, targetGrades) => set((state) => {
        const filteredBlocks = state.blocks.filter(b => {
          const cls = state.classes.find(c => c.id === b.classId);
          if (!cls || !targetGrades.includes(cls.grade)) return true;
          return b.date !== targetDate;
        });

        const sourceBlocks = state.blocks.filter(b => {
          const cls = state.classes.find(c => c.id === b.classId);
          return b.date === sourceDate && cls && targetGrades.includes(cls.grade);
        });

        const newBlocks = sourceBlocks.map(b => ({
          ...b,
          id: `copy-${targetDate}-${b.classId}-${b.period}-${crypto.randomUUID ? crypto.randomUUID().substring(0, 8) : Math.random().toString(36).substring(2, 10)}`,
          date: targetDate,
          isBase: false
        }));

        return { 
          pastBlocks: [...state.pastBlocks.slice(-19), state.blocks],
          blocks: [...filteredBlocks, ...newBlocks] 
        };
      }),

      addLog: (log) => set((state) => ({
        logs: [{
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          ...log
        }, ...state.logs]
      }))
    }),
    {
      name: 'scheduly-storage-v2',
      storage: createJSONStorage(() => idbStorage),
      partialize: (state) => ({
        blocks: state.blocks,
        classes: state.classes,
        settings: state.settings,
        logs: state.logs,
        visibleGrades: state.visibleGrades,
        pastBlocks: state.pastBlocks,
      }),
    }
  )
);
