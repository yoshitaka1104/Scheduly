import { useState, useMemo } from 'react';
import { useTimetableStore } from '../store/useTimetableStore';
import { format } from 'date-fns';
import { Period, TimetableBlock } from '../types';
import { 
  DndContext, 
  DragEndEvent, 
  PointerSensor, 
  useSensor, 
  useSensors,
  Modifier
} from '@dnd-kit/core';
import { DraggableBlock } from './DraggableBlock';
import { DroppableCell } from './DroppableCell';
import { BlockDetailsModal } from './BlockDetailsModal';

const restrictToVerticalAxis: Modifier = ({ transform }) => {
  return {
    ...transform,
    x: 0,
  };
};

const formatClassName = (grade: number, name: string) => {
  const label = name.replace('組', '');
  if (!isNaN(Number(label))) {
    return `${grade}-${label}`;
  }
  return `${grade}${label}`;
};

const parseTeachers = (teacherStr?: string) => {
  if (!teacherStr) return [];
  return teacherStr.split(/[,、・\n]+/).map(t => t.trim()).filter(Boolean);
};

const isMergeable = (b1: TimetableBlock | undefined, b2: TimetableBlock | undefined) => {
  if (!b1 || !b2) return false;
  
  const s1 = b1.subClasses || [];
  const s2 = b2.subClasses || [];
  if (s1.length !== s2.length || s1.length === 0) return false;

  const isBatch = b1.isBatch && b2.isBatch;
  // 選択科目の判定: 全てがisElectiveフラグを持っているか、あるいは複数科目が登録されている場合は選択科目とみなす
  const isElective = (s1.every(s => s.isElective) && s2.every(s => s.isElective)) || (s1.length > 1 && s2.length > 1 && s1.length === s2.length);

  // 一括変更で作成されたブロック、または選択科目の場合のみマージを許可
  if (!isBatch && !isElective) return false;

  // 「総探」が含まれる場合は、一括変更でない限り結合しない
  if (!isBatch && (s1.some(s => s.subject.includes('総探')) || s2.some(s => s.subject.includes('総探')))) {
    return false;
  }

  // 科目名が完全に一致するか確認（教員名や教室の違いは無視して結合する）
  for (let i = 0; i < s1.length; i++) {
    const match = s2.find(s => s.subject === s1[i].subject);
    if (!match) return false;
  }
  return true;
};

export function TimetableBoard({ isExporting = false }: { isExporting?: boolean }) {
  const { blocks, classes, currentDate, settings, swapBlocks, moveBlock, swapMergedBlocks, addLog, visibleGrades, isChangeOnlyView } = useTimetableStore();
  const dateStr = format(currentDate, 'yyyy-MM-dd');
  
  const filteredClasses = classes.filter(cls => visibleGrades.includes(cls.grade));
  const activePeriods = Array.from({ length: settings.periodsPerDay }, (_, i) => i + 1);
  
  const [activeDetailsBlock, setActiveDetailsBlock] = useState<{ block: TimetableBlock, mergedClassIds: string[], mergedPeriods: number[] } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );



  const blocksForToday = useMemo(() => blocks.filter(b => b.date === dateStr), [blocks, dateStr]);

  const getBlock = (classId: string, period: Period) => {
    return blocksForToday.find(b => b.classId === classId && b.period === period);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const blockId = active.id as string;
    const overId = over.id as string;

    if (overId.startsWith('cell-')) {
      const [, classId, periodStr] = overId.split('-');
      const targetPeriod = parseInt(periodStr) as Period;

      const activeBlock = blocks.find(b => b.id === blockId);
      if (!activeBlock) return;

      const activeData = active.data.current;
      const mergedClassIds: string[] = activeData?.mergedClassIds || [activeBlock.classId];
      const mergedPeriods: number[] = activeData?.mergedPeriods || [activeBlock.period];

      const getClassNameStr = (cId: string) => {
        const cls = classes.find(c => c.id === cId);
        return cls ? `${cls.grade}年${cls.name}` : cId;
      };

      // 横移動（別のクラスへの移動）を禁止する
      // ただし、結合されているブロックの場合は、結合元のいずれかのクラスの列であれば縦移動とみなして許可する
      if (!mergedClassIds.includes(classId)) {
        return;
      }

      if (mergedClassIds.length > 1 || mergedPeriods.length > 1) {
        // Handle merged block move
        const periodOffset = targetPeriod - activeBlock.period;
        if (periodOffset === 0) return; // 同じ時限の場合は何もしない
        
        // 移動先が範囲外の場合は何もしない
        const isTargetOutOfBounds = mergedPeriods.some(p => (p + periodOffset) < 1 || (p + periodOffset) > settings.periodsPerDay);
        if (isTargetOutOfBounds) return;

        const sourceCells = [];
        for (const cId of mergedClassIds) {
          for (const pId of mergedPeriods) {
            sourceCells.push({ classId: cId, period: pId as Period });
          }
        }
        
        swapMergedBlocks(dateStr, sourceCells, periodOffset);
        
        const subjectNames = activeBlock.subClasses?.map(s => s.subject).join('/') || '';
        addLog({ 
          targetDate: dateStr,
          action: 'swap', 
          details: `結合ブロック「${subjectNames}」（${mergedClassIds.length}クラス分、${activeBlock.period}限）を ${targetPeriod}限 に一括移動` 
        });
      } else {
        const targetBlock = getBlock(classId, targetPeriod);

        if (targetBlock) {
          if (targetBlock.id !== blockId) {
            swapBlocks(blockId, targetBlock.id);
            addLog({ 
              targetDate: dateStr,
              action: 'swap', 
              details: `${getClassNameStr(activeBlock.classId)} ${activeBlock.period}限(${activeBlock.subClasses?.map(s=>s.subject).join('/') || ''}) と ${getClassNameStr(targetBlock.classId)} ${targetBlock.period}限(${targetBlock.subClasses?.map(s=>s.subject).join('/') || ''}) を入れ替え` 
            });
          }
        } else {
          moveBlock(blockId, classId, targetPeriod);
          addLog({ 
            targetDate: dateStr,
            action: 'move', 
            details: `${getClassNameStr(activeBlock.classId)} ${activeBlock.period}限(${activeBlock.subClasses?.map(s=>s.subject).join('/') || ''}) を ${getClassNameStr(classId)} ${targetPeriod}限に移動` 
          });
        }
      }
    }
  };

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd} modifiers={[restrictToVerticalAxis]}>
      <div className={`w-full ${isExporting ? 'h-auto overflow-visible' : 'h-full overflow-auto'} p-2`}>
        <div className="w-full min-w-0" onClick={e => e.stopPropagation()}>
          {/* 2D Grid Layout */}
          <div 
            className="grid gap-[2px] md:gap-[4px] relative pb-2" 
            style={{ 
              gridTemplateColumns: `40px repeat(${filteredClasses.length}, minmax(0, 1fr))`,
              gridTemplateRows: `auto repeat(${activePeriods.length}, minmax(100px, 1fr))`,
              '--gap-x': 'max(2px, 4px)', // Transform用の変数を定義
              '--gap-y': 'max(2px, 4px)'
            } as React.CSSProperties}
          >
            {/* Top-left empty cell */}
            <div className="sticky top-0 bg-white z-30 pb-2 col-start-1 row-start-1"></div>

            {/* 学年の境界線（縦線） */}
            {filteredClasses.map((cls, i) => {
              const nextCls = filteredClasses[i + 1];
              if (nextCls && cls.grade !== nextCls.grade) {
                return (
                  <div 
                    key={`v-line-${cls.id}`}
                    className="pointer-events-none z-0 border-r-[2px] border-slate-300"
                    style={{
                      gridColumn: i + 2,
                      gridRow: '1 / -1',
                      width: '100%',
                      height: '100%',
                      transform: 'translateX(calc(var(--gap-x) / 2))' // gapの中央に配置するための調整
                    }}
                  />
                );
              }
              return null;
            })}

            {/* 4限目と5限目の境界線（横二重線） */}
            {activePeriods.includes(4) && activePeriods.includes(5) && (
              <div 
                className="pointer-events-none z-0 border-b-[4px] border-double border-slate-300"
                style={{
                  gridColumn: '1 / -1',
                  gridRow: activePeriods.indexOf(4) + 2,
                  width: '100%',
                  height: '100%',
                  transform: 'translateY(calc(var(--gap-y) / 2))' // gapの中央に配置するための調整
                }}
              />
            )}
            
            {/* Class Headers */}
            {filteredClasses.map((cls, i) => (
              <div 
                key={`header-${cls.id}`} 
                className="sticky top-0 bg-white z-20 pb-2 flex"
                style={{ gridColumnStart: i + 2, gridRowStart: 1 }}
              >
                <div className="w-full text-center font-bold text-indigo-900 bg-indigo-100 rounded-xl py-2 shadow-sm border border-indigo-200 text-sm truncate px-1 self-end">
                  {formatClassName(cls.grade, cls.name)}
                </div>
              </div>
            ))}

            {/* Period Labels */}
            {activePeriods.map((period, i) => (
              <div 
                key={`period-${period}`} 
                className="flex relative"
                style={{ gridColumnStart: 1, gridRowStart: i + 2 }}
              >
                <div className="w-full flex items-center justify-center font-bold text-indigo-900 bg-indigo-100 rounded-xl py-4 border border-indigo-200 text-sm shadow-sm h-full max-h-[140px] m-auto sticky left-0 z-10">
                  {period}
                </div>
              </div>
            ))}

            {/* Timetable Cells with 2D Merging */}
            {(() => {
              const cells = [];
              const visited = new Set<string>();

              // Precalculate duplicate teachers for each period
              const duplicateTeachersByPeriod = new Map<number, string[]>();
              activePeriods.forEach(p => {
                const blocksInPeriod = blocksForToday.filter(b => b.period === p);
                const teacherSubClasses = new Map<string, Array<{sub: any, block: TimetableBlock}>>();
                blocksInPeriod.forEach(b => {
                  b.subClasses?.forEach(sub => {
                    const teachers = parseTeachers(sub.teacher);
                    teachers.forEach(t => {
                      if (t) {
                        if (!teacherSubClasses.has(t)) teacherSubClasses.set(t, []);
                        teacherSubClasses.get(t)!.push({sub, block: b});
                      }
                    });
                  });
                });
                const duplicates = Array.from(teacherSubClasses.entries())
                  .filter(([_, items]) => {
                    if (items.length <= 1) return false;
                    const hasNonElective = items.some(item => {
                      const isExplicitlyElective = item.sub.isElective;
                      const isImplicitlyElective = item.block.subClasses && item.block.subClasses.length > 1;
                      return !isExplicitlyElective && !isImplicitlyElective;
                    });
                    if (hasNonElective) return true;
                    return false;
                  })
                  .map(([teacher]) => teacher);
                duplicateTeachersByPeriod.set(p, duplicates);
              });

              for (let pIdx = 0; pIdx < activePeriods.length; pIdx++) {
                for (let cIdx = 0; cIdx < filteredClasses.length; cIdx++) {
                  const period = activePeriods[pIdx];
                  const cls = filteredClasses[cIdx];
                  const key = `${period}-${cls.id}`;
                  
                  if (visited.has(key)) continue;
                  
                  const realBlock = getBlock(cls.id, period);
                  
                  // Find max width using real block
                  let w = 1;
                  while (cIdx + w < filteredClasses.length) {
                    const nextCls = filteredClasses[cIdx + w];
                    const nextKey = `${period}-${nextCls.id}`;
                    if (visited.has(nextKey)) break;
                    const nextRealBlock = getBlock(nextCls.id, period);
                    
                    if (!isMergeable(realBlock, nextRealBlock)) break;
                    w++;
                  }
                  
                  // Find max height using real block
                  let h = 1;
                  let canExpandH = true;
                  while (pIdx + h < activePeriods.length && canExpandH) {
                    const nextPeriod = activePeriods[pIdx + h];
                    for (let i = 0; i < w; i++) {
                      const nextCls = filteredClasses[cIdx + i];
                      const nextKey = `${nextPeriod}-${nextCls.id}`;
                      if (visited.has(nextKey)) { canExpandH = false; break; }
                      
                      const nextRealBlock = getBlock(nextCls.id, nextPeriod);
                      if (!isMergeable(realBlock, nextRealBlock)) { canExpandH = false; break; }
                    }
                    if (canExpandH) h++;
                  }

                  // グループ全体の可視性を判定
                  let isGroupVisible = true;
                  if (isChangeOnlyView && realBlock) {
                    let anyModified = false;
                    for (let hp = 0; hp < h; hp++) {
                      for (let wp = 0; wp < w; wp++) {
                        const vp = activePeriods[pIdx + hp];
                        const vc = filteredClasses[cIdx + wp];
                        const b = getBlock(vc.id, vp);
                        if (b && (!b.isBase || b.isMemoModified)) {
                          anyModified = true;
                        }
                      }
                    }
                    isGroupVisible = anyModified;
                  }

                  const block = isGroupVisible ? realBlock : undefined;

                  // 完全に空のマスの場合（非表示とは異なる）
                  if (!block && !realBlock) {
                    cells.push({ cls, period, w: 1, h: 1, block: undefined, cIdx, pIdx });
                    visited.add(key);
                    continue;
                  }
                  
                  // Mark region as visited
                  const currentMergedClassIds: string[] = [];
                  const currentMergedPeriods: number[] = [];
                  for (let wp = 0; wp < w; wp++) {
                    currentMergedClassIds.push(filteredClasses[cIdx + wp].id);
                  }
                  for (let hp = 0; hp < h; hp++) {
                    currentMergedPeriods.push(activePeriods[pIdx + hp]);
                  }

                  for (let hp = 0; hp < h; hp++) {
                    for (let wp = 0; wp < w; wp++) {
                      const vp = activePeriods[pIdx + hp];
                      const vc = filteredClasses[cIdx + wp];
                      visited.add(`${vp}-${vc.id}`);
                    }
                  }
                  
                  cells.push({ cls, period, w, h, block, cIdx, pIdx, mergedClassIds: currentMergedClassIds, mergedPeriods: currentMergedPeriods });
                }
              }

              return cells.map(cell => {
                const { cls, period, w, h, block, cIdx, pIdx, mergedClassIds, mergedPeriods } = cell;
                const cellId = `cell-${cls.id}-${period}`;
                const duplicateTeachers = duplicateTeachersByPeriod.get(period) || [];

                return (
                  <div 
                    key={cellId} 
                    style={{ 
                      gridColumn: `${cIdx + 2} / span ${w}`, 
                      gridRow: `${pIdx + 2} / span ${h}`,
                      minWidth: 0,
                      minHeight: 0
                    }}
                  >
                    <DroppableCell 
                      id={cellId} 
                      onClick={() => {
                        if (!block && !isChangeOnlyView) {
                          const newBlock: TimetableBlock = {
                            id: `b-${dateStr}-${cls.id}-${period}-${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2)}`,
                            classId: cls.id,
                            date: dateStr,
                            period,
                            isBase: false,
                            subClasses: [{
                              id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2),
                              subject: '新規予定',
                              teacher: ''
                            }]
                          };
                          useTimetableStore.getState().mergeBlocks([newBlock]);
                          setActiveDetailsBlock({ block: newBlock, mergedClassIds: [cls.id], mergedPeriods: [period] });
                        }
                      }}
                    >
                      {block ? (
                        <DraggableBlock 
                          block={block} 
                          onClick={() => setActiveDetailsBlock({ block, mergedClassIds, mergedPeriods })}
                          duplicateTeachers={duplicateTeachers}
                          mergedClassIds={mergedClassIds}
                          mergedPeriods={mergedPeriods}
                          isChangeOnlyView={isChangeOnlyView}
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full text-slate-300 text-xs font-medium pointer-events-none">
                          {!isChangeOnlyView && '空き'}
                        </div>
                      )}
                    </DroppableCell>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      </div>
      <BlockDetailsModal activeItem={activeDetailsBlock} onClose={() => setActiveDetailsBlock(null)} />
    </DndContext>
  );
}
