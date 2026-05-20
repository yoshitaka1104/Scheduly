import { useState, useMemo } from 'react';
import { useTimetableStore } from '../store/useTimetableStore';
import { format } from 'date-fns';
import { Period, TimetableBlock, ClassInfo } from '../types';
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
  // 選択科目の判定: 選択科目フラグ（isElective）が立っている場合のみ選択科目とみなす
  const isElective = s1.some(s => s.isElective) && s2.some(s => s.isElective);

  // 一括変更で作成されたブロック、または選択科目の場合のみマージを許可
  if (!isBatch && !isElective) return false;


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
  const hasLunchSpacer = activePeriods.includes(4) && activePeriods.includes(5);

  const getGridRow = (period: number) => {
    const baseIndex = activePeriods.indexOf(period);
    if (baseIndex === -1) return 2;
    const offset = (hasLunchSpacer && period >= 5) ? 1 : 0;
    return baseIndex + 2 + offset;
  };

  const getRowSpan = (startPeriod: number, height: number) => {
    let span = height;
    if (hasLunchSpacer) {
      const endPeriod = startPeriod + height - 1;
      if (startPeriod <= 4 && endPeriod >= 5) {
        span += 1;
      }
    }
    return span;
  };

  const rowTemplates = ['auto'];
  activePeriods.forEach(p => {
    rowTemplates.push('minmax(100px, 1fr)');
    if (hasLunchSpacer && p === 4) {
      rowTemplates.push('6px'); // 昼休み用のスペーサー行
    }
  });

  const colTemplates = ['40px'];
  filteredClasses.forEach((cls, i) => {
    colTemplates.push('minmax(0, 1fr)');
    const nextCls = filteredClasses[i + 1];
    if (nextCls && cls.grade !== nextCls.grade) {
      colTemplates.push('4px'); // 学年境界のスペーサー列
    }
  });

  const getGridColumn = (cIdx: number) => {
    let col = 2 + cIdx;
    for (let i = 0; i < cIdx; i++) {
      const cls = filteredClasses[i];
      const nextCls = filteredClasses[i + 1];
      if (nextCls && cls.grade !== nextCls.grade) {
        col += 1;
      }
    }
    return col;
  };

  const getColSpan = (startIdx: number, width: number) => {
    let span = width;
    for (let i = startIdx; i < startIdx + width - 1; i++) {
      const cls = filteredClasses[i];
      const nextCls = filteredClasses[i + 1];
      if (nextCls && cls.grade !== nextCls.grade) {
        span += 1;
      }
    }
    return span;
  };

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
      <style>{`
        .timetable-grid {
          gap: 2px;
          --gap-size: 2px;
        }
        @media (min-width: 768px) {
          .timetable-grid {
            gap: 4px;
            --gap-size: 4px;
          }
        }
      `}</style>
      <div className={`w-full ${isExporting ? 'h-auto overflow-visible' : 'h-full overflow-auto'} p-2`}>
        <div className="w-full min-w-0" onClick={e => e.stopPropagation()}>
          {/* 2D Grid Layout */}
          <div 
            className="grid timetable-grid relative pb-2" 
            style={{ 
              gridTemplateColumns: colTemplates.join(' '),
              gridTemplateRows: rowTemplates.join(' '),
              '--gap-size': '2px'
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
                    className="pointer-events-none z-0 flex justify-center items-center"
                    style={{
                      gridColumn: getGridColumn(i) + 1,
                      gridRow: '1 / -1',
                      width: '100%',
                      height: '100%'
                    }}
                  >
                    <div className="h-full border-l-[2px] border-slate-400 opacity-60" />
                  </div>
                );
              }
              return null;
            })}

            {/* 4限目と5限目の境界線（横二重線・昼休み） */}
            {hasLunchSpacer && (
              <div 
                className="pointer-events-none z-0 flex items-center justify-center"
                style={{
                  gridColumn: '1 / -1',
                  gridRow: getGridRow(4) + 1,
                  width: '100%',
                  height: '100%'
                }}
              >
                <div className="w-full border-b-[4px] border-double border-slate-400 opacity-60" />
              </div>
            )}
            
            {/* Class Headers */}
            {filteredClasses.map((cls, i) => (
              <div 
                key={`header-${cls.id}`} 
                className="sticky top-0 bg-white z-20 pb-2 flex"
                style={{ gridColumnStart: getGridColumn(i), gridRowStart: 1 }}
              >
                <div className="w-full text-center font-bold text-indigo-900 bg-indigo-100 rounded-xl py-2 shadow-sm border border-indigo-200 text-sm truncate px-1 self-end">
                  {formatClassName(cls.grade, cls.name)}
                </div>
              </div>
            ))}

            {/* Period Labels */}
            {activePeriods.map((period) => (
              <div 
                key={`period-${period}`} 
                className="flex relative"
                style={{ gridColumnStart: 1, gridRowStart: getGridRow(period) }}
              >
                <div className="w-full flex items-center justify-center font-bold text-indigo-900 bg-indigo-100 rounded-xl py-4 border border-indigo-200 text-sm shadow-sm h-full max-h-[140px] m-auto sticky left-0 z-10">
                  {period}
                </div>
              </div>
            ))}

            {/* Timetable Cells with 2D Merging */}
            {(() => {
              // cells配列の作成を先に行い、視覚的に結合された単位で教員の重複を判定する
              const cells: { cls: ClassInfo, period: Period, w: number, h: number, block?: TimetableBlock, cIdx: number, pIdx: number, mergedClassIds?: string[], mergedPeriods?: number[] }[] = [];
              const visited = new Set<string>();

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

                  // 完全に空のマスの場合（非表示とは異なる）
                  if (!realBlock) {
                    cells.push({ cls, period, w: 1, h: 1, block: undefined, cIdx, pIdx });
                    visited.add(key);
                    continue;
                  }

                  let combinedSubClasses = realBlock.subClasses || [];
                  if (w > 1 || h > 1) {
                    // 結合対象の全ブロックから教員データを抽出して重複排除
                    const uniqueSubs = new Map<string, typeof combinedSubClasses[0]>();
                    for (let hp = 0; hp < h; hp++) {
                      for (let wp = 0; wp < w; wp++) {
                        const vp = activePeriods[pIdx + hp];
                        const vc = filteredClasses[cIdx + wp];
                        const b = getBlock(vc.id, vp);
                        if (b && b.subClasses) {
                          b.subClasses.forEach(sub => {
                            // subject と teacher の組み合わせで一意にする
                            const subKey = `${sub.subject}-${sub.teacher}`;
                            if (!uniqueSubs.has(subKey)) {
                              uniqueSubs.set(subKey, sub);
                            }
                          });
                        }
                      }
                    }
                    combinedSubClasses = Array.from(uniqueSubs.values());
                  }

                  const blockToRender = isGroupVisible ? { ...realBlock, subClasses: combinedSubClasses } as TimetableBlock : undefined;

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
                  
                  cells.push({ cls, period, w, h, block: blockToRender, cIdx, pIdx, mergedClassIds: currentMergedClassIds, mergedPeriods: currentMergedPeriods });
                }
              }

              // セル（視覚的に結合済みのブロック）をベースに重複教員を判定
              const duplicateTeachersByPeriod = new Map<number, string[]>();
              activePeriods.forEach(p => {
                const overlappingCells = cells.filter(c => c.block !== undefined && c.mergedPeriods?.includes(p));
                // 教員名 -> 担当している授業情報のリスト
                const teacherActiveClasses = new Map<string, Array<{ isElective: boolean, subject: string, key: string }>>();
                
                overlappingCells.forEach(cell => {
                  cell.block?.subClasses?.forEach(sub => {
                    const teachers = parseTeachers(sub.teacher);
                    teachers.forEach(t => {
                      if (!t) return;
                      if (!teacherActiveClasses.has(t)) {
                        teacherActiveClasses.set(t, []);
                      }
                      
                      const activeLessons = teacherActiveClasses.get(t)!;
                      const isElective = !!sub.isElective;
                      
                      if (isElective) {
                        // 特例ルール：「SKⅡβ」と「数研Ⅱ」は科目名が全く異なるが、同一の合同授業とする
                        const isSpecialJoint = (s1: string, s2: string) => {
                          const names = [s1, s2];
                          return names.includes('SKⅡβ') && names.includes('数研Ⅱ');
                        };

                        // 選択科目（合同授業）の場合：すでに登録されている選択科目の中に、
                        // 科目名が部分一致する授業、または特例ルールに合致する授業があれば同じ授業とみなす
                        const hasSameElective = activeLessons.some(l => 
                          l.isElective && 
                          (
                            l.subject.includes(sub.subject) || 
                            sub.subject.includes(l.subject) ||
                            isSpecialJoint(l.subject, sub.subject)
                          )
                        );
                        
                        if (!hasSameElective) {
                          activeLessons.push({
                            isElective: true,
                            subject: sub.subject,
                            key: `elective-${sub.subject}`
                          });
                        }
                      } else {
                        // 通常授業の場合：セルごとに異なる授業（同時並行不可）とみなす
                        activeLessons.push({
                          isElective: false,
                          subject: sub.subject,
                          key: `normal-${cell.cls.id}-${sub.subject}`
                        });
                      }
                    });
                  });
                });

                const duplicates = Array.from(teacherActiveClasses.entries())
                  .filter(([_, activeLessons]) => activeLessons.length > 1)
                  .map(([teacher]) => teacher);
                duplicateTeachersByPeriod.set(p, duplicates);
              });

              return cells.map(cell => {
                const { cls, period, w, h, block, cIdx, mergedClassIds, mergedPeriods } = cell;
                const cellId = `cell-${cls.id}-${period}`;
                const duplicateTeachers = duplicateTeachersByPeriod.get(period) || [];

                return (
                  <div 
                    key={cellId} 
                    style={{ 
                      gridColumn: `${getGridColumn(cIdx)} / span ${getColSpan(cIdx, w)}`, 
                      gridRow: `${getGridRow(period)} / span ${getRowSpan(period, h)}`,
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
                          onClick={() => setActiveDetailsBlock({ block, mergedClassIds: mergedClassIds || [cls.id], mergedPeriods: mergedPeriods || [period] })}
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
