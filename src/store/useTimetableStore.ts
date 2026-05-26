import { create } from 'zustand';
import { supabase } from '../lib/supabaseClient';
import { User } from '@supabase/supabase-js';
import { TimetableBlock, ClassInfo, Settings, AuditLog, Period } from '../types';

interface TimetableState {
  currentDate: Date;
  blocks: TimetableBlock[];
  classes: ClassInfo[];
  settings: Settings;
  logs: AuditLog[];
  visibleGrades: number[];
  pastBlocks: TimetableBlock[][];
  isChangeOnlyView: boolean;
  displayMode: 'subject' | 'teacher';
  
  // 認証関連
  user: User | null;
  isInitializing: boolean;
  login: (password: string) => Promise<{ error: any | null }>;
  logout: () => Promise<void>;
  
  // 初期ロードと購読
  initializeStore: () => Promise<void>;
  
  setCurrentDate: (date: Date) => void;
  setBlocks: (blocks: TimetableBlock[]) => Promise<void>;
  mergeBlocks: (blocks: TimetableBlock[]) => Promise<void>;
  setClasses: (classes: ClassInfo[]) => Promise<void>;
  setSettings: (settings: Partial<Settings>) => Promise<void>;
  setVisibleGrades: (grades: number[]) => void;
  updateBlock: (id: string, partial: Partial<TimetableBlock>) => Promise<void>;
  updateBlocks: (ids: string[], partial: Partial<TimetableBlock>) => Promise<void>;
  deleteBlock: (id: string) => Promise<void>;
  moveBlock: (id: string, targetClassId: string, targetPeriod: Period) => Promise<void>;
  swapBlocks: (id1: string, id2: string) => Promise<void>;
  swapMergedBlocks: (date: string, sourceCells: { classId: string, period: Period }[], periodOffset: number) => Promise<void>;
  batchSwapPeriods: (date: string, period1: Period, period2: Period, targetGrades: number[]) => Promise<void>;
  batchDeletePeriod: (date: string, startPeriod: Period, endPeriod: Period, targetGrades: number[]) => Promise<void>;
  batchUpdatePeriod: (date: string, startPeriod: Period, endPeriod: Period, text: string, targetGrades: number[]) => Promise<void>;
  copyDayTimetable: (sourceDate: string, targetDate: string, targetGrades: number[]) => Promise<void>;
  addLog: (log: Omit<AuditLog, 'id' | 'timestamp'>) => Promise<void>;
  undo: () => Promise<void>;
  setIsChangeOnlyView: (value: boolean) => void;
  setDisplayMode: (mode: 'subject' | 'teacher') => void;
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

// マッピング関数
const mapBlockFromDB = (dbBlock: any): TimetableBlock => ({
  id: dbBlock.id,
  classId: dbBlock.class_id,
  date: dbBlock.date,
  period: dbBlock.period,
  isBase: dbBlock.is_base,
  isBatch: dbBlock.is_batch,
  subClasses: dbBlock.sub_classes || []
});

const mapBlockToDB = (block: TimetableBlock) => ({
  id: block.id,
  class_id: block.classId,
  date: block.date,
  period: block.period,
  is_base: block.isBase,
  is_batch: block.isBatch || false,
  sub_classes: block.subClasses
});

const mapSettingsFromDB = (dbSettings: any): Settings => ({
  periodsPerDay: dbSettings.periods_per_day,
  namingRule: dbSettings.naming_rule
});

const mapSettingsToDB = (settings: Partial<Settings>) => {
  const result: any = {};
  if (settings.periodsPerDay !== undefined) result.periods_per_day = settings.periodsPerDay;
  if (settings.namingRule !== undefined) result.naming_rule = settings.namingRule;
  return result;
};

export const useTimetableStore = create<TimetableState>((set, get) => ({
  currentDate: new Date(),
  blocks: [],
  classes: [],
  settings: {
    periodsPerDay: 7,
    namingRule: 'number'
  },
  logs: [],
  visibleGrades: [1, 2, 3],
  pastBlocks: [],
  isChangeOnlyView: false,
  displayMode: 'subject',
  
  user: null,
  isInitializing: true,

  // ログイン処理（共通のメールアドレスを使用し、パスワードのみでログイン）
  login: async (password) => {
    const email = 'admin@scheduly.internal';
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error && data.user) {
      set({ user: data.user });
    }
    return { error };
  },

  // ログアウト処理
  logout: async () => {
    await supabase.auth.signOut();
    set({ user: null });
  },

  // 初期ロードと購読
  initializeStore: async () => {
    set({ isInitializing: true });

    // 1. ログイン状態の取得と監視
    const { data: { session } } = await supabase.auth.getSession();
    set({ user: session?.user || null });

    supabase.auth.onAuthStateChange((_event, session) => {
      set({ user: session?.user || null });
    });

    try {
      // 2. データの初期ロード
      // classes
      const { data: classesData } = await supabase.from('classes').select('*');
      let loadedClasses: ClassInfo[] = (classesData as ClassInfo[]) || [];
      if (loadedClasses.length === 0) {
        loadedClasses = generateDefaultClasses();
        const { data: { session: activeSession } } = await supabase.auth.getSession();
        if (activeSession?.user) {
          await supabase.from('classes').insert(loadedClasses);
        }
      }

      // settings
      const { data: settingsData } = await supabase.from('settings').select('*').eq('id', 'global').maybeSingle();
      let loadedSettings: Settings = { periodsPerDay: 7, namingRule: 'number' };
      if (settingsData) {
        loadedSettings = mapSettingsFromDB(settingsData);
      } else {
        const { data: { session: activeSession } } = await supabase.auth.getSession();
        if (activeSession?.user) {
          await supabase.from('settings').insert({ id: 'global', periods_per_day: 7, naming_rule: 'number' });
        }
      }

      // blocks
      const { data: blocksData } = await supabase.from('blocks').select('*');
      const loadedBlocks = (blocksData || []).map(mapBlockFromDB);

      // logs
      const { data: logsData } = await supabase.from('logs').select('*').order('timestamp', { ascending: false }).limit(50);
      const loadedLogs: AuditLog[] = (logsData || []).map(l => ({
        id: l.id,
        timestamp: l.timestamp,
        action: l.action,
        details: l.details ? (l.details as any).message || '' : ''
      }));

      set({
        classes: loadedClasses,
        settings: loadedSettings,
        blocks: loadedBlocks,
        logs: loadedLogs,
        isInitializing: false
      });
    } catch (e) {
      console.error('Error initializing store data from Supabase:', e);
      set({ isInitializing: false });
    }

    // 3. リアルタイム同期の有効化
    supabase.channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'blocks' },
        (payload) => {
          const { eventType, new: newRecord, old: oldRecord } = payload;
          set((state) => {
            if (eventType === 'INSERT' || eventType === 'UPDATE') {
              const mapped = mapBlockFromDB(newRecord);
              const filtered = state.blocks.filter(b => b.id !== mapped.id);
              return { blocks: [...filtered, mapped] };
            } else if (eventType === 'DELETE') {
              return { blocks: state.blocks.filter(b => b.id !== oldRecord.id) };
            }
            return {};
          });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'classes' },
        (payload) => {
          const { eventType, new: newRecord } = payload;
          set((state) => {
            if (eventType === 'INSERT' || eventType === 'UPDATE') {
              const newClass = newRecord as ClassInfo;
              const filtered = state.classes.filter(c => c.id !== newClass.id);
              return { classes: [...filtered, newClass] };
            }
            return {};
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'settings' },
        (payload) => {
          const { new: newRecord } = payload;
          set({ settings: mapSettingsFromDB(newRecord) });
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'logs' },
        (payload) => {
          const { new: newRecord } = payload;
          set((state) => {
            const log: AuditLog = {
              id: newRecord.id,
              timestamp: newRecord.timestamp,
              action: newRecord.action,
              details: newRecord.details ? (newRecord.details as any).message || '' : ''
            };
            if (state.logs.some(l => l.id === log.id)) return {};
            return { logs: [log, ...state.logs] };
          });
        }
      )
      .subscribe();
  },

  setDisplayMode: (mode) => set({ displayMode: mode }),
  setIsChangeOnlyView: (value) => set({ isChangeOnlyView: value }),
  setCurrentDate: (date) => set({ currentDate: date }),
  setVisibleGrades: (grades) => set({ visibleGrades: grades }),

  undo: async () => {
    let prevBlocks: TimetableBlock[] | undefined;
    set((state) => {
      if (state.pastBlocks.length === 0) return state;
      prevBlocks = state.pastBlocks[state.pastBlocks.length - 1];
      const newPastBlocks = state.pastBlocks.slice(0, -1);
      const newLogs = state.logs.length > 0 ? state.logs.slice(1) : [];
      return { 
        blocks: prevBlocks, 
        pastBlocks: newPastBlocks,
        logs: newLogs
      };
    });

    if (!get().user || !prevBlocks) return;

    try {
      await supabase.from('blocks').delete().neq('id', 'dummy');
      if (prevBlocks.length > 0) {
        await supabase.from('blocks').insert(prevBlocks.map(mapBlockToDB));
      }
    } catch (e) {
      console.error('Error during undo write to Supabase:', e);
    }
  },

  setBlocks: async (blocks) => {
    set({ blocks });
    if (!get().user) return;
    try {
      await supabase.from('blocks').delete().neq('id', 'dummy');
      if (blocks.length > 0) {
        const dbBlocks = blocks.map(mapBlockToDB);
        await supabase.from('blocks').insert(dbBlocks);
      }
    } catch (e) {
      console.error('Error during setBlocks write to Supabase:', e);
    }
  },

  mergeBlocks: async (newBlocks) => {
    set((state) => {
      const newBlocksSet = new Set(newBlocks.map(nb => `${nb.date}-${nb.classId}-${nb.period}`));
      const existingFiltered = state.blocks.filter(b => !newBlocksSet.has(`${b.date}-${b.classId}-${b.period}`));
      return { 
        pastBlocks: [...state.pastBlocks.slice(-19), state.blocks],
        blocks: [...existingFiltered, ...newBlocks] 
      };
    });

    if (!get().user) return;
    try {
      for (const nb of newBlocks) {
        await supabase.from('blocks').delete().match({ date: nb.date, class_id: nb.classId, period: nb.period });
      }
      if (newBlocks.length > 0) {
        await supabase.from('blocks').upsert(newBlocks.map(mapBlockToDB));
      }
    } catch (e) {
      console.error('Error during mergeBlocks write to Supabase:', e);
    }
  },

  setClasses: async (classes) => {
    set({ classes });
    if (!get().user) return;
    try {
      await supabase.from('classes').delete().neq('id', 'dummy');
      if (classes.length > 0) {
        await supabase.from('classes').insert(classes);
      }
    } catch (e) {
      console.error('Error during setClasses write to Supabase:', e);
    }
  },

  setSettings: async (settings) => {
    set((state) => ({ settings: { ...state.settings, ...settings } }));
    if (!get().user) return;
    try {
      const mapped = mapSettingsToDB(settings);
      await supabase.from('settings').update(mapped).eq('id', 'global');
    } catch (e) {
      console.error('Error during setSettings write to Supabase:', e);
    }
  },
  
  updateBlock: async (id, partial) => {
    let updatedBlock: TimetableBlock | undefined;
    set((state) => {
      const newBlocks = state.blocks.map(b => {
        if (b.id === id) {
          updatedBlock = { ...b, ...partial };
          return updatedBlock;
        }
        return b;
      });
      return {
        pastBlocks: [...state.pastBlocks.slice(-19), state.blocks],
        blocks: newBlocks
      };
    });

    if (!get().user || !updatedBlock) return;
    try {
      await supabase.from('blocks').upsert(mapBlockToDB(updatedBlock));
    } catch (e) {
      console.error('Error during updateBlock write to Supabase:', e);
    }
  },

  updateBlocks: async (ids, partial) => {
    let updatedBlocks: TimetableBlock[] = [];
    set((state) => {
      const newBlocks = state.blocks.map(b => {
        if (ids.includes(b.id)) {
          const updated = { ...b, ...partial };
          updatedBlocks.push(updated);
          return updated;
        }
        return b;
      });
      return {
        pastBlocks: [...state.pastBlocks.slice(-19), state.blocks],
        blocks: newBlocks
      };
    });

    if (!get().user || updatedBlocks.length === 0) return;
    try {
      await supabase.from('blocks').upsert(updatedBlocks.map(mapBlockToDB));
    } catch (e) {
      console.error('Error during updateBlocks write to Supabase:', e);
    }
  },
  
  deleteBlock: async (id) => {
    set((state) => ({
      pastBlocks: [...state.pastBlocks.slice(-19), state.blocks],
      blocks: state.blocks.filter(b => b.id !== id)
    }));

    if (!get().user) return;
    try {
      await supabase.from('blocks').delete().eq('id', id);
    } catch (e) {
      console.error('Error during deleteBlock write to Supabase:', e);
    }
  },

  moveBlock: async (id, targetClassId, targetPeriod) => {
    let updatedBlock: TimetableBlock | undefined;
    set((state) => {
      const newBlocks = state.blocks.map(b => {
        if (b.id === id) {
          const isOrig = checkIsOriginalPosition(b.id, targetClassId, b.date, targetPeriod);
          updatedBlock = { ...b, classId: targetClassId, period: targetPeriod, isBase: isOrig };
          return updatedBlock;
        }
        return b;
      });
      return {
        pastBlocks: [...state.pastBlocks.slice(-19), state.blocks],
        blocks: newBlocks
      };
    });

    if (!get().user || !updatedBlock) return;
    try {
      await supabase.from('blocks').upsert(mapBlockToDB(updatedBlock));
    } catch (e) {
      console.error('Error during moveBlock write to Supabase:', e);
    }
  },

  swapBlocks: async (id1, id2) => {
    let b1: TimetableBlock | undefined;
    let b2: TimetableBlock | undefined;
    set((state) => {
      const block1 = state.blocks.find(b => b.id === id1);
      const block2 = state.blocks.find(b => b.id === id2);
      
      if (!block1 || !block2) return state;

      const newBlocks = state.blocks.map(b => {
        if (b.id === id1) {
          const isOrig = checkIsOriginalPosition(b.id, block2.classId, b.date, block2.period);
          b1 = { ...b, classId: block2.classId, period: block2.period, isBase: isOrig };
          return b1;
        }
        if (b.id === id2) {
          const isOrig = checkIsOriginalPosition(b.id, block1.classId, b.date, block1.period);
          b2 = { ...b, classId: block1.classId, period: block1.period, isBase: isOrig };
          return b2;
        }
        return b;
      });

      return { 
        pastBlocks: [...state.pastBlocks.slice(-19), state.blocks],
        blocks: newBlocks 
      };
    });

    if (!get().user) return;
    try {
      if (b1 && b2) {
        await supabase.from('blocks').upsert([mapBlockToDB(b1), mapBlockToDB(b2)]);
      }
    } catch (e) {
      console.error('Error during swapBlocks write to Supabase:', e);
    }
  },

  swapMergedBlocks: async (date, sourceCells, periodOffset) => {
    if (periodOffset === 0) return;
    
    let updatedBlocks: TimetableBlock[] = [];
    set((state) => {
      const newBlocks = state.blocks.map(b => {
        if (b.date !== date) return b;

        // ソースセルに該当するか確認
        const isSource = sourceCells.find(sc => sc.classId === b.classId && sc.period === b.period);
        if (isSource) {
          const newPeriod = (b.period + periodOffset) as Period;
          const isOrig = checkIsOriginalPosition(b.id, b.classId, b.date, newPeriod);
          const updated = { ...b, period: newPeriod, isBase: isOrig };
          updatedBlocks.push(updated);
          return updated;
        }

        // ターゲットセルに該当するか確認
        const isTarget = sourceCells.find(sc => sc.classId === b.classId && (sc.period + periodOffset) === b.period);
        if (isTarget) {
          const newPeriod = (b.period - periodOffset) as Period;
          const isOrig = checkIsOriginalPosition(b.id, b.classId, b.date, newPeriod);
          const updated = { ...b, period: newPeriod, isBase: isOrig };
          updatedBlocks.push(updated);
          return updated;
        }

        return b;
      });

      return {
        pastBlocks: [...state.pastBlocks.slice(-19), state.blocks],
        blocks: newBlocks
      };
    });

    if (!get().user || updatedBlocks.length === 0) return;
    try {
      await supabase.from('blocks').upsert(updatedBlocks.map(mapBlockToDB));
    } catch (e) {
      console.error('Error during swapMergedBlocks write to Supabase:', e);
    }
  },

  batchSwapPeriods: async (date, p1, p2, targetGrades) => {
    let updatedBlocks: TimetableBlock[] = [];
    set((state) => {
      const newBlocks = state.blocks.map(b => {
        const cls = state.classes.find(c => c.id === b.classId);
        if (cls && targetGrades.includes(cls.grade) && b.date === date) {
          if (b.period === p1) {
            const isOrig = checkIsOriginalPosition(b.id, b.classId, b.date, p2);
            const updated = { ...b, period: p2, isBase: isOrig };
            updatedBlocks.push(updated);
            return updated;
          }
          if (b.period === p2) {
            const isOrig = checkIsOriginalPosition(b.id, b.classId, b.date, p1);
            const updated = { ...b, period: p1, isBase: isOrig };
            updatedBlocks.push(updated);
            return updated;
          }
        }
        return b;
      });
      return { 
        pastBlocks: [...state.pastBlocks.slice(-19), state.blocks],
        blocks: newBlocks 
      };
    });

    if (!get().user || updatedBlocks.length === 0) return;
    try {
      await supabase.from('blocks').upsert(updatedBlocks.map(mapBlockToDB));
    } catch (e) {
      console.error('Error during batchSwapPeriods write to Supabase:', e);
    }
  },

  batchDeletePeriod: async (date, startPeriod, endPeriod, targetGrades) => {
    let deletedIds: string[] = [];
    set((state) => {
      const minPeriod = Math.min(startPeriod, endPeriod);
      const maxPeriod = Math.max(startPeriod, endPeriod);
      const newBlocks = state.blocks.filter(b => {
        const cls = state.classes.find(c => c.id === b.classId);
        if (!cls || !targetGrades.includes(cls.grade)) return true;
        const matches = b.date === date && b.period >= minPeriod && b.period <= maxPeriod;
        if (matches) deletedIds.push(b.id);
        return !matches;
      });
      return { 
        pastBlocks: [...state.pastBlocks.slice(-19), state.blocks],
        blocks: newBlocks 
      };
    });

    if (!get().user || deletedIds.length === 0) return;
    try {
      await supabase.from('blocks').delete().in('id', deletedIds);
    } catch (e) {
      console.error('Error during batchDeletePeriod write to Supabase:', e);
    }
  },

  batchUpdatePeriod: async (date, startPeriod, endPeriod, text, targetGrades) => {
    let deletedIds: string[] = [];
    const minPeriod = Math.min(startPeriod, endPeriod);
    const maxPeriod = Math.max(startPeriod, endPeriod);
    let createdBlocks: TimetableBlock[] = [];

    set((state) => {
      const filteredBlocks = state.blocks.filter(b => {
        const cls = state.classes.find(c => c.id === b.classId);
        if (!cls || !targetGrades.includes(cls.grade)) return true;
        const matches = b.date === date && b.period >= minPeriod && b.period <= maxPeriod;
        if (matches) deletedIds.push(b.id);
        return !matches;
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
      
      createdBlocks = newBlocks;
      return { 
        pastBlocks: [...state.pastBlocks.slice(-19), state.blocks],
        blocks: [...filteredBlocks, ...newBlocks] 
      };
    });

    if (!get().user) return;
    try {
      if (deletedIds.length > 0) {
        await supabase.from('blocks').delete().in('id', deletedIds);
      }
      if (createdBlocks.length > 0) {
        await supabase.from('blocks').insert(createdBlocks.map(mapBlockToDB));
      }
    } catch (e) {
      console.error('Error during batchUpdatePeriod write to Supabase:', e);
    }
  },

  copyDayTimetable: async (sourceDate, targetDate, targetGrades) => {
    let deletedIds: string[] = [];
    let createdBlocks: TimetableBlock[] = [];

    set((state) => {
      const filteredBlocks = state.blocks.filter(b => {
        const cls = state.classes.find(c => c.id === b.classId);
        if (!cls || !targetGrades.includes(cls.grade)) return true;
        const matches = b.date === targetDate;
        if (matches) deletedIds.push(b.id);
        return !matches;
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

      createdBlocks = newBlocks;
      return { 
        pastBlocks: [...state.pastBlocks.slice(-19), state.blocks],
        blocks: [...filteredBlocks, ...newBlocks] 
      };
    });

    if (!get().user) return;
    try {
      if (deletedIds.length > 0) {
        await supabase.from('blocks').delete().in('id', deletedIds);
      }
      if (createdBlocks.length > 0) {
        await supabase.from('blocks').insert(createdBlocks.map(mapBlockToDB));
      }
    } catch (e) {
      console.error('Error during copyDayTimetable write to Supabase:', e);
    }
  },

  addLog: async (log) => {
    const newLog: AuditLog = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...log
    };

    set((state) => ({
      logs: [newLog, ...state.logs]
    }));

    if (!get().user) return;
    try {
      await supabase.from('logs').insert({
        id: newLog.id,
        timestamp: newLog.timestamp,
        action: newLog.action,
        details: { message: newLog.details }
      });
    } catch (e) {
      console.error('Error during addLog write to Supabase:', e);
    }
  }
}));
