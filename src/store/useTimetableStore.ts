import { create } from 'zustand';
import { supabase } from '../lib/supabaseClient';
import { User } from '@supabase/supabase-js';
import { TimetableBlock, ClassInfo, Settings, AuditLog, Period } from '../types';
import { format } from 'date-fns';

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
  
  // エラー監視
  dbError: string | null;
  setDbError: (error: string | null) => void;
  
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
  dbError: null,

  setDbError: (error) => set({ dbError: error }),

  // ログイン処理（共通のメールアドレスを使用し、パスワードのみでログイン）
  login: async (password) => {
    set({ dbError: null });
    const email = 'admin@scheduly.internal';
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error && data.user) {
      set({ user: data.user });
    }
    return { error };
  },

  // ログアウト処理
  logout: async () => {
    set({ dbError: null });
    await supabase.auth.signOut();
    set({ user: null });
  },

  // 初期ロードと購読
  initializeStore: async () => {
    set({ isInitializing: true, dbError: null });

    // 1. ログイン状態の取得と監視
    const { data: { session } } = await supabase.auth.getSession();
    set({ user: session?.user || null });

    supabase.auth.onAuthStateChange((_event, session) => {
      set({ user: session?.user || null });
    });

    // デバウンス用のタイマーとフェッチ処理
    let blocksTimer: ReturnType<typeof setTimeout> | null = null;
    let classesTimer: ReturnType<typeof setTimeout> | null = null;

    const fetchBlocksDebounced = () => {
      if (blocksTimer) clearTimeout(blocksTimer);
      blocksTimer = setTimeout(async () => {
        try {
          const dateStr = format(get().currentDate, 'yyyy-MM-dd');
          const { data: blocksData, error } = await supabase
            .from('blocks')
            .select('*')
            .eq('date', dateStr);
          if (error) {
            set({ dbError: `同期中のデータ取得に失敗しました: ${error.message} (${error.code})` });
            return;
          }
          const loadedBlocks = (blocksData || []).map(mapBlockFromDB);
          set({ blocks: loadedBlocks });
        } catch (e: any) {
          console.error('Error in debounced blocks fetch:', e);
          set({ dbError: `同期エラー: ${e.message || e}` });
        }
      }, 250);
    };

    const fetchClassesDebounced = () => {
      if (classesTimer) clearTimeout(classesTimer);
      classesTimer = setTimeout(async () => {
        try {
          const { data: classesData, error } = await supabase.from('classes').select('*');
          if (error) {
            set({ dbError: `クラスデータの同期に失敗しました: ${error.message}` });
            return;
          }
          const loadedClasses: ClassInfo[] = (classesData as ClassInfo[]) || [];
          set({ classes: loadedClasses });
        } catch (e: any) {
          console.error('Error in debounced classes fetch:', e);
        }
      }, 250);
    };

    try {
      // 2. データの初期ロード
      // classes
      const { data: classesData, error: classErr } = await supabase.from('classes').select('*');
      if (classErr) throw classErr;
      let loadedClasses: ClassInfo[] = (classesData as ClassInfo[]) || [];
      if (loadedClasses.length === 0) {
        loadedClasses = generateDefaultClasses();
        const { data: { session: activeSession } } = await supabase.auth.getSession();
        if (activeSession?.user) {
          const { error: insErr } = await supabase.from('classes').insert(loadedClasses);
          if (insErr) throw insErr;
        }
      }

      // settings
      const { data: settingsData, error: settingsErr } = await supabase.from('settings').select('*').eq('id', 'global').maybeSingle();
      if (settingsErr) throw settingsErr;
      let loadedSettings: Settings = { periodsPerDay: 7, namingRule: 'number' };
      if (settingsData) {
        loadedSettings = mapSettingsFromDB(settingsData);
      } else {
        const { data: { session: activeSession } } = await supabase.auth.getSession();
        if (activeSession?.user) {
          const { error: insErr } = await supabase.from('settings').insert({ id: 'global', periods_per_day: 7, naming_rule: 'number' });
          if (insErr) throw insErr;
        }
      }

      // blocks
      const dateStr = format(get().currentDate, 'yyyy-MM-dd');
      const { data: blocksData, error: blocksErr } = await supabase
        .from('blocks')
        .select('*')
        .eq('date', dateStr);
      if (blocksErr) throw blocksErr;
      const loadedBlocks = (blocksData || []).map(mapBlockFromDB);

      // logs
      const { data: logsData, error: logsErr } = await supabase.from('logs').select('*').order('timestamp', { ascending: false }).limit(50);
      if (logsErr) throw logsErr;
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
    } catch (e: any) {
      console.error('Error initializing store data from Supabase:', e);
      set({ 
        isInitializing: false, 
        dbError: `起動時のデータ取得に失敗しました。URLやAPIキー、インターネット接続を確認してください: ${e.message || e}` 
      });
    }

    // 3. リアルタイム同期の有効化
    supabase.channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'blocks' },
        () => {
          fetchBlocksDebounced();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'classes' },
        () => {
          fetchClassesDebounced();
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'settings' },
        async () => {
          try {
            const { data: settingsData } = await supabase.from('settings').select('*').eq('id', 'global').maybeSingle();
            if (settingsData) {
              set({ settings: mapSettingsFromDB(settingsData) });
            }
          } catch (e) {
            console.error('Error updating settings from subscription:', e);
          }
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
  setCurrentDate: async (date) => {
    set({ currentDate: date, dbError: null });
    const dateStr = format(date, 'yyyy-MM-dd');
    try {
      const { data: blocksData, error } = await supabase
        .from('blocks')
        .select('*')
        .eq('date', dateStr);
      if (error) throw error;
      set({ blocks: (blocksData || []).map(mapBlockFromDB) });
    } catch (e: any) {
      console.error('Error fetching blocks for date:', dateStr, e);
      set({ dbError: `日付切り替え時のデータ取得に失敗しました: ${e.message || e}` });
    }
  },
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
        logs: newLogs,
        dbError: null
      };
    });

    if (!get().user) {
      set({ dbError: 'ログインしていないため、元に戻した時間割を保存できませんでした。編集ログインをしてください。' });
      return;
    }
    if (!prevBlocks) return;

    try {
      const dateStr = format(get().currentDate, 'yyyy-MM-dd');
      const { error: delError } = await supabase.from('blocks').delete().eq('date', dateStr);
      if (delError) throw delError;

      if (prevBlocks.length > 0) {
        const { error: insError } = await supabase.from('blocks').insert(prevBlocks.map(mapBlockToDB));
        if (insError) throw insError;
      }
    } catch (e: any) {
      console.error('Error during undo write to Supabase:', e);
      set({ dbError: `保存エラー (Undo): ${e.message || e}` });
    }
  },

  setBlocks: async (blocks) => {
    set({ blocks, dbError: null });
    if (!get().user) {
      set({ dbError: 'ログインしていないため、時間割データを保存できませんでした。編集ログインをしてください。' });
      return;
    }
    try {
      const { error: delError } = await supabase.from('blocks').delete().neq('id', 'dummy');
      if (delError) throw delError;

      if (blocks.length > 0) {
        const dbBlocks = blocks.map(mapBlockToDB);
        const { error: insError } = await supabase.from('blocks').insert(dbBlocks);
        if (insError) throw insError;
      }
    } catch (e: any) {
      console.error('Error during setBlocks write to Supabase:', e);
      set({ dbError: `保存エラー (setBlocks): ${e.message || e}` });
    }
  },

  mergeBlocks: async (newBlocks) => {
    set((state) => {
      const curDateStr = format(state.currentDate, 'yyyy-MM-dd');
      const todayNewBlocks = newBlocks.filter(nb => nb.date === curDateStr);
      const newBlocksSet = new Set(todayNewBlocks.map(nb => `${nb.date}-${nb.classId}-${nb.period}`));
      const existingFiltered = state.blocks.filter(b => !newBlocksSet.has(`${b.date}-${b.classId}-${b.period}`));
      return { 
        pastBlocks: [...state.pastBlocks.slice(-19), state.blocks],
        blocks: [...existingFiltered, ...todayNewBlocks],
        dbError: null
      };
    });

    if (!get().user) {
      set({ dbError: 'ログインしていないため、インポートした時間割をデータベースに保存できませんでした。右上の「編集ログイン」からログインしてください。' });
      return;
    }
    try {
      if (newBlocks.length <= 5) {
        const deletePromises = newBlocks.map(nb => 
          supabase.from('blocks').delete().match({ date: nb.date, class_id: nb.classId, period: nb.period })
        );
        const deleteResults = await Promise.all(deletePromises);
        for (const res of deleteResults) {
          if (res.error) throw res.error;
        }
      } else {
        const uniqueDates = Array.from(new Set(newBlocks.map(nb => nb.date)));
        const uniqueClassIds = Array.from(new Set(newBlocks.map(nb => nb.classId)));
        const { error: delError } = await supabase.from('blocks')
          .delete()
          .in('date', uniqueDates)
          .in('class_id', uniqueClassIds);
        if (delError) throw delError;
      }

      if (newBlocks.length > 0) {
        const { error: upsertError } = await supabase.from('blocks').upsert(newBlocks.map(mapBlockToDB));
        if (upsertError) throw upsertError;
      }

      // インポート完了後、現在表示中の日付のデータをSupabaseから再取得して、メモリ上の blocks を最新にする
      const curDateStr = format(get().currentDate, 'yyyy-MM-dd');
      const { data: blocksData, error: fetchErr } = await supabase
        .from('blocks')
        .select('*')
        .eq('date', curDateStr);
      if (fetchErr) throw fetchErr;
      
      set({ blocks: (blocksData || []).map(mapBlockFromDB) });

    } catch (e: any) {
      console.error('Error during mergeBlocks write to Supabase:', e);
      set({ dbError: `保存エラー (マージ/インポート): ${e.message || e}` });
    }
  },

  setClasses: async (classes) => {
    set({ classes, dbError: null });
    if (!get().user) {
      set({ dbError: 'ログインしていないため、クラスデータを保存できませんでした。編集ログインをしてください。' });
      return;
    }
    try {
      const { error: delError } = await supabase.from('classes').delete().neq('id', 'dummy');
      if (delError) throw delError;

      if (classes.length > 0) {
        const { error: insError } = await supabase.from('classes').insert(classes);
        if (insError) throw insError;
      }
    } catch (e: any) {
      console.error('Error during setClasses write to Supabase:', e);
      set({ dbError: `保存エラー (クラス設定): ${e.message || e}` });
    }
  },

  setSettings: async (settings) => {
    set((state) => ({ settings: { ...state.settings, ...settings }, dbError: null }));
    if (!get().user) {
      set({ dbError: 'ログインしていないため、基本設定を保存できませんでした。編集ログインをしてください。' });
      return;
    }
    try {
      const mapped = mapSettingsToDB(settings);
      const { error } = await supabase.from('settings').update(mapped).eq('id', 'global');
      if (error) throw error;
    } catch (e: any) {
      console.error('Error during setSettings write to Supabase:', e);
      set({ dbError: `保存エラー (設定): ${e.message || e}` });
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
        blocks: newBlocks,
        dbError: null
      };
    });

    if (!get().user) {
      set({ dbError: 'ログインしていないため、変更をデータベースに保存できませんでした。編集ログインをしてください。' });
      return;
    }
    if (!updatedBlock) return;
    try {
      const { error } = await supabase.from('blocks').upsert(mapBlockToDB(updatedBlock));
      if (error) throw error;
    } catch (e: any) {
      console.error('Error during updateBlock write to Supabase:', e);
      set({ dbError: `保存エラー (ブロック更新): ${e.message || e}` });
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
        blocks: newBlocks,
        dbError: null
      };
    });

    if (!get().user || updatedBlocks.length === 0) {
      if (!get().user) set({ dbError: 'ログインしていないため、一括変更をデータベースに保存できませんでした。' });
      return;
    }
    try {
      const { error } = await supabase.from('blocks').upsert(updatedBlocks.map(mapBlockToDB));
      if (error) throw error;
    } catch (e: any) {
      console.error('Error during updateBlocks write to Supabase:', e);
      set({ dbError: `保存エラー (複数ブロック更新): ${e.message || e}` });
    }
  },
  
  deleteBlock: async (id) => {
    set((state) => ({
      pastBlocks: [...state.pastBlocks.slice(-19), state.blocks],
      blocks: state.blocks.filter(b => b.id !== id),
      dbError: null
    }));

    if (!get().user) {
      set({ dbError: 'ログインしていないため、コマの削除をデータベースに保存できませんでした。' });
      return;
    }
    try {
      const { error } = await supabase.from('blocks').delete().eq('id', id);
      if (error) throw error;
    } catch (e: any) {
      console.error('Error during deleteBlock write to Supabase:', e);
      set({ dbError: `削除エラー: ${e.message || e}` });
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
        blocks: newBlocks,
        dbError: null
      };
    });

    if (!get().user || !updatedBlock) {
      if (!get().user) set({ dbError: 'ログインしていないため、コマの移動をデータベースに保存できませんでした。' });
      return;
    }
    try {
      const { error } = await supabase.from('blocks').upsert(mapBlockToDB(updatedBlock));
      if (error) throw error;
    } catch (e: any) {
      console.error('Error during moveBlock write to Supabase:', e);
      set({ dbError: `保存エラー (移動): ${e.message || e}` });
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
        blocks: newBlocks,
        dbError: null
      };
    });

    if (!get().user) {
      set({ dbError: 'ログインしていないため、入れ替えをデータベースに保存できませんでした。' });
      return;
    }
    try {
      if (b1 && b2) {
        const { error } = await supabase.from('blocks').upsert([mapBlockToDB(b1), mapBlockToDB(b2)]);
        if (error) throw error;
      }
    } catch (e: any) {
      console.error('Error during swapBlocks write to Supabase:', e);
      set({ dbError: `保存エラー (入れ替え): ${e.message || e}` });
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
        blocks: newBlocks,
        dbError: null
      };
    });

    if (!get().user || updatedBlocks.length === 0) {
      if (!get().user) set({ dbError: 'ログインしていないため、結合セルの入れ替えをデータベースに保存できませんでした。' });
      return;
    }
    try {
      const { error } = await supabase.from('blocks').upsert(updatedBlocks.map(mapBlockToDB));
      if (error) throw error;
    } catch (e: any) {
      console.error('Error during swapMergedBlocks write to Supabase:', e);
      set({ dbError: `保存エラー (結合セル入れ替え): ${e.message || e}` });
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
        blocks: newBlocks,
        dbError: null
      };
    });

    if (!get().user || updatedBlocks.length === 0) {
      if (!get().user) set({ dbError: 'ログインしていないため、一括入替をデータベースに保存できませんでした。' });
      return;
    }
    try {
      const { error } = await supabase.from('blocks').upsert(updatedBlocks.map(mapBlockToDB));
      if (error) throw error;
    } catch (e: any) {
      console.error('Error during batchSwapPeriods write to Supabase:', e);
      set({ dbError: `保存エラー (一括入替): ${e.message || e}` });
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
        blocks: newBlocks,
        dbError: null
      };
    });

    if (!get().user || deletedIds.length === 0) {
      if (!get().user) set({ dbError: 'ログインしていないため、一括削除をデータベースに保存できませんでした。' });
      return;
    }
    try {
      const { error } = await supabase.from('blocks').delete().in('id', deletedIds);
      if (error) throw error;
    } catch (e: any) {
      console.error('Error during batchDeletePeriod write to Supabase:', e);
      set({ dbError: `保存エラー (一括削除): ${e.message || e}` });
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
        blocks: [...filteredBlocks, ...newBlocks],
        dbError: null
      };
    });

    if (!get().user) {
      set({ dbError: 'ログインしていないため、一括変更をデータベースに保存できませんでした。' });
      return;
    }
    try {
      if (deletedIds.length > 0) {
        const { error: delError } = await supabase.from('blocks').delete().in('id', deletedIds);
        if (delError) throw delError;
      }
      if (createdBlocks.length > 0) {
        const { error: insError } = await supabase.from('blocks').insert(createdBlocks.map(mapBlockToDB));
        if (insError) throw insError;
      }
    } catch (e: any) {
      console.error('Error during batchUpdatePeriod write to Supabase:', e);
      set({ dbError: `保存エラー (一括変更): ${e.message || e}` });
    }
  },

  copyDayTimetable: async (sourceDate, targetDate, targetGrades) => {
    set({ dbError: null });
    if (!get().user) {
      set({ dbError: 'ログインしていないため、日課コピーをデータベースに保存できませんでした。' });
      return;
    }

    try {
      // 1. コピー元のデータを Supabase から直接フェッチ
      const { data: sourceData, error: srcError } = await supabase
        .from('blocks')
        .select('*')
        .eq('date', sourceDate);
      if (srcError) throw srcError;

      const sourceBlocks = (sourceData || []).map(mapBlockFromDB).filter(b => {
        const cls = get().classes.find(c => c.id === b.classId);
        return cls && targetGrades.includes(cls.grade);
      });

      // 2. コピー先の既存データ（削除対象）を特定
      const { data: targetData, error: tgtError } = await supabase
        .from('blocks')
        .select('id, class_id')
        .eq('date', targetDate);
      if (tgtError) throw tgtError;

      const deletedIds = (targetData || [])
        .filter(b => {
          const cls = get().classes.find(c => c.id === b.class_id);
          return cls && targetGrades.includes(cls.grade);
        })
        .map(b => b.id);

      // コピー元から新しいブロックを生成
      const newBlocks = sourceBlocks.map(b => ({
        ...b,
        id: `copy-${targetDate}-${b.classId}-${b.period}-${crypto.randomUUID ? crypto.randomUUID().substring(0, 8) : Math.random().toString(36).substring(2, 10)}`,
        date: targetDate,
        isBase: false
      }));

      // 3. データベースへの反映
      if (deletedIds.length > 0) {
        const { error: delError } = await supabase.from('blocks').delete().in('id', deletedIds);
        if (delError) throw delError;
      }
      if (newBlocks.length > 0) {
        const { error: insError } = await supabase.from('blocks').insert(newBlocks.map(mapBlockToDB));
        if (insError) throw insError;
      }

      // 4. メモリ上の blocks の更新（現在表示中の日付と同じなら反映）
      const curDateStr = format(get().currentDate, 'yyyy-MM-dd');
      if (curDateStr === targetDate || curDateStr === sourceDate) {
        const { data: currentBlocks, error: curError } = await supabase
          .from('blocks')
          .select('*')
          .eq('date', curDateStr);
        if (curError) throw curError;
        set({ blocks: (currentBlocks || []).map(mapBlockFromDB) });
      }

    } catch (e: any) {
      console.error('Error during copyDayTimetable write to Supabase:', e);
      set({ dbError: `保存エラー (日課コピー): ${e.message || e}` });
    }
  },

  addLog: async (log) => {
    const newLog: AuditLog = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...log
    };

    set((state) => ({
      logs: [newLog, ...state.logs],
      dbError: null
    }));

    if (!get().user) return;
    try {
      const { error } = await supabase.from('logs').insert({
        id: newLog.id,
        timestamp: newLog.timestamp,
        action: newLog.action,
        details: { message: newLog.details }
      });
      if (error) throw error;
    } catch (e: any) {
      console.error('Error during addLog write to Supabase:', e);
    }
  }
}));
