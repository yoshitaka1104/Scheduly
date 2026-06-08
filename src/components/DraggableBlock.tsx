import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { TimetableBlock } from '../types';
import { useTimetableStore } from '../store/useTimetableStore';

interface Props {
  block: TimetableBlock;
  onClick: (e: React.MouseEvent) => void;
  duplicateTeachers?: string[];
  duplicateLastNames?: string[];
  mergedClassIds?: string[];
  mergedPeriods?: number[];
  isChangeOnlyView?: boolean;
}

export function DraggableBlock({ block, onClick, duplicateTeachers = [], duplicateLastNames = [], mergedClassIds = [], mergedPeriods = [], isChangeOnlyView = false }: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: block.id,
    data: { block, mergedClassIds, mergedPeriods }
  });

  const displayMode = useTimetableStore(state => state.displayMode);

  let displaySubClasses = block.subClasses || [];
  if (isChangeOnlyView && block.isBase) {
    displaySubClasses = displaySubClasses.filter(s => s.hasTask || s.location);
    if (displaySubClasses.length === 0) {
      displaySubClasses = block.subClasses || []; // フォールバック
    }
  }

  const style = {
    transform: CSS.Translate.toString(transform),
    zIndex: isDragging ? 50 : 1,
    opacity: isDragging ? 0.7 : 1,
    containerType: 'size' as const,
  };

  const parseTeachers = (teacherStr?: string) => {
    if (!teacherStr) return [];
    return teacherStr.split(/[,、・\n]+/).map(t => t.trim()).filter(Boolean);
  };

  const getBlockStyle = () => {
    const time = !block.isBase;
    const task = block.subClasses?.some(s => s.hasTask) || false;
    const loc = block.subClasses?.some(s => !!s.location) || false;

    if (time && task && loc) {
      return {
        bg: 'bg-[linear-gradient(to_bottom,theme(colors.emerald.100)_33.3%,theme(colors.amber.100)_33.3%,theme(colors.amber.100)_66.6%,theme(colors.sky.100)_66.6%)]',
        leftLine: 'bg-[linear-gradient(to_bottom,theme(colors.emerald.500)_33.3%,theme(colors.amber.500)_33.3%,theme(colors.amber.500)_66.6%,theme(colors.sky.500)_66.6%)]',
        border: 'border-emerald-300'
      };
    }
    if (time && task) {
      return {
        bg: 'bg-[linear-gradient(to_bottom,theme(colors.emerald.100)_50%,theme(colors.amber.100)_50%)]',
        leftLine: 'bg-[linear-gradient(to_bottom,theme(colors.emerald.500)_50%,theme(colors.amber.500)_50%)]',
        border: 'border-emerald-300'
      };
    }
    if (time && loc) {
      return {
        bg: 'bg-[linear-gradient(to_bottom,theme(colors.emerald.100)_50%,theme(colors.sky.100)_50%)]',
        leftLine: 'bg-[linear-gradient(to_bottom,theme(colors.emerald.500)_50%,theme(colors.sky.500)_50%)]',
        border: 'border-emerald-300'
      };
    }
    if (task && loc) {
      return {
        bg: 'bg-[linear-gradient(to_bottom,theme(colors.amber.100)_50%,theme(colors.sky.100)_50%)]',
        leftLine: 'bg-[linear-gradient(to_bottom,theme(colors.amber.500)_50%,theme(colors.sky.500)_50%)]',
        border: 'border-amber-300'
      };
    }
    if (time) return { bg: 'bg-emerald-100', leftLine: 'bg-emerald-500', border: 'border-emerald-300' };
    if (task) return { bg: 'bg-amber-100', leftLine: 'bg-amber-500', border: 'border-amber-300' };
    if (loc) return { bg: 'bg-sky-100', leftLine: 'bg-sky-500', border: 'border-sky-300' };
    
    return { bg: 'bg-white', leftLine: 'bg-indigo-100', border: 'border-slate-200' };
  };

  const { bg, leftLine, border } = getBlockStyle();

  const hasDuplicate = block.subClasses?.some(sub => 
    parseTeachers(sub.teacher).some(t => duplicateTeachers.includes(t))
  );

  const finalBorder = hasDuplicate ? 'border-red-500 border-2 shadow-sm shadow-red-200' : border;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      className={`absolute inset-0 p-0.5 pl-[7px] md:p-1 md:pl-[10px] rounded-lg border overflow-hidden transition-all cursor-grab active:cursor-grabbing flex flex-col justify-between hover:shadow-sm ${bg} ${finalBorder} ${isDragging ? 'shadow-xl scale-105 rotate-2 z-10' : ''}`}
    >
      {/* 多色対応の左側ライン */}
      <div className={`absolute left-0 top-0 bottom-0 w-[3px] md:w-[4px] ${leftLine}`} />

      <div className="w-full h-full pointer-events-none relative z-10 overflow-hidden flex flex-col">
        {(() => {
          let groupedEntries: [string, typeof block.subClasses][] = [];
          
          const getTeacherDisplayParts = (fullName: string) => {
            if (!fullName || fullName === '未設定') return { last: '未設定', first: '' };
            const parts = fullName.trim().split(/[\s　]+/);
            const lastName = parts[0];
            
            if (duplicateLastNames.includes(lastName) && parts.length > 1) {
              return { last: lastName, first: parts[1].charAt(0) };
            }
            return { last: lastName, first: '' };
          };

          if (displayMode === 'subject') {
            const grouped = displaySubClasses.reduce((acc, sub) => {
              if (!acc[sub.subject]) acc[sub.subject] = [];
              acc[sub.subject].push(sub);
              return acc;
            }, {} as Record<string, typeof block.subClasses>);
            groupedEntries = Object.entries(grouped);
          } else {
            const grouped: Record<string, typeof block.subClasses> = {};
            displaySubClasses.forEach(sub => {
              const teachers = parseTeachers(sub.teacher);
              if (teachers.length === 0) {
                if (block.isBatch && sub.subject) {
                  teachers.push(sub.subject);
                } else {
                  teachers.push('未設定');
                }
              }
              teachers.forEach(t => {
                if (!grouped[t]) grouped[t] = [];
                grouped[t].push(sub);
              });
            });
            groupedEntries = Object.entries(grouped);
          }

          if (isChangeOnlyView) {
            return (
              <div className={`flex ${block.isBatch ? 'flex-col justify-center' : 'flex-row justify-center items-center'} gap-px md:gap-0.5 w-full flex-1 overflow-hidden`}>
                {groupedEntries.map(([mainText, subs]) => {
                  const locations = Array.from(new Set(subs.map(s => s.location).filter(Boolean)));
                  
                  let badges: string[] = [];
                  if (displayMode === 'subject') {
                    const tasks = subs.filter(s => s.hasTask);
                    const originalSubsForSubject = block.subClasses?.filter(s => s.subject === mainText) || [];
                    const isDuplicatedSubject = originalSubsForSubject.length > 1;
                    badges = tasks.filter(taskSub => isDuplicatedSubject && taskSub.teacher).map(taskSub => {
                      return taskSub.teacher ? taskSub.teacher.split(/[,\s・、\n]/)[0] : '';
                    }).filter(Boolean);
                  }

                  let displayNode: React.ReactNode = mainText;
                  let displayText = mainText;
                  if (displayMode === 'teacher' && !block.isBatch) {
                    const { last, first } = getTeacherDisplayParts(mainText);
                    displayNode = first ? (
                      <>
                        {last}<span style={{ fontSize: '10px', marginInlineStart: '-0.15em' }}>{first}</span>
                      </>
                    ) : (
                      last
                    );
                    displayText = last + first;
                  }

                  let verticalFontSize = '11px';
                  if (displayText.length <= 3) {
                    verticalFontSize = '15px';
                  }

                  return (
                    <div key={mainText} className={`flex flex-col items-center justify-center h-full shrink-0 ${block.isBatch ? 'text-center w-full px-1' : ''}`}>
                      <div className={`flex ${block.isBatch ? 'flex-col items-center justify-center w-full h-full overflow-hidden' : 'flex-col items-center justify-center gap-0.5 h-full'}`}>
                        <span 
                          className={`font-black text-slate-800 tracking-tight shrink-0 ${block.isBatch ? 'flex items-baseline justify-center leading-none whitespace-nowrap overflow-hidden text-ellipsis' : 'leading-none text-center'}`}
                          style={block.isBatch 
                            ? { 
                                fontSize: `min(calc(95cqw / ${Math.max(mainText.length, 1)}), 80px, 80cqh)`, 
                                maxWidth: '100%',
                              } 
                            : { 
                                writingMode: 'vertical-rl', 
                                textOrientation: 'upright', 
                                textAlign: 'center',
                                maxHeight: '100%',
                                fontSize: verticalFontSize
                              }
                          }
                        >
                          {displayNode}
                        </span>
                        {badges.length > 0 && (
                          <div 
                            className="flex justify-center mt-1 px-1"
                            style={{ display: 'flex', flexDirection: 'row', flexWrap: 'nowrap', gap: '4px', justifyContent: 'center' }}
                          >
                            {badges.map((name, idx) => {
                              const { last, first } = getTeacherDisplayParts(name);
                              return (
                                <span key={idx} className={`px-1.5 py-0.5 rounded-sm text-[10px] md:text-[11px] font-black text-white shadow-sm tracking-wider whitespace-nowrap ${displayMode === 'teacher' ? 'bg-indigo-500' : 'bg-amber-500'}`}>
                                  {last}{first && <span style={{ fontSize: '0.7em', marginInlineStart: '-0.15em' }}>{first}</span>}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      {locations.length > 0 && (
                        <div className={`flex flex-wrap gap-1 mt-1.5 justify-center ${block.isBatch ? 'w-full' : ''}`}>
                          {locations.map((loc, idx) => (
                            <span key={idx} className="text-[10px] font-black text-sky-800 bg-sky-100 border border-sky-300 px-1 py-0.5 rounded-sm shadow-sm whitespace-nowrap tracking-wide">
                              {loc}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          }

          // 通常表示（isChangeOnlyView === false）
          return (
            <div className={`flex ${block.isBatch ? 'flex-col justify-center' : 'flex-row justify-center items-center'} gap-px md:gap-0.5 w-full h-full`}>
              {groupedEntries.map(([mainText, subs]) => {
                const locations = Array.from(new Set(subs.map(s => s.location).filter(Boolean)));
                
                let badges: string[] = [];
                if (displayMode === 'subject') {
                  const tasks = subs.filter(s => s.hasTask);
                  const originalSubsForSubject = block.subClasses?.filter(s => s.subject === mainText) || [];
                  const isDuplicatedSubject = originalSubsForSubject.length > 1;
                  badges = tasks.filter(taskSub => isDuplicatedSubject && taskSub.teacher).map(taskSub => {
                    return taskSub.teacher ? taskSub.teacher.split(/[,\s・、\n]/)[0] : '';
                  }).filter(Boolean);
                }

                let displayNode: React.ReactNode = mainText;
                let displayText = mainText;
                if (displayMode === 'teacher' && !block.isBatch) {
                  const { last, first } = getTeacherDisplayParts(mainText);
                  displayNode = first ? (
                    <>
                      {last}<span style={{ fontSize: '10px', marginInlineStart: '-0.15em' }}>{first}</span>
                    </>
                  ) : (
                    last
                  );
                  displayText = last + first;
                }

                let verticalFontSize = '11px';
                if (displayText.length <= 3) {
                  verticalFontSize = '15px';
                }

                return (
                  <div key={mainText} className={`flex flex-col items-center justify-center h-full shrink-0 ${block.isBatch ? 'text-center w-full px-1' : ''}`}>
                    <div className={`flex ${block.isBatch ? 'flex-col items-center justify-center w-full h-full overflow-hidden' : 'flex-col items-center justify-center gap-0.5 h-full'}`}>
                        <span 
                          className={`font-black text-slate-800 tracking-tight shrink-0 ${block.isBatch ? 'flex items-baseline justify-center leading-none whitespace-nowrap overflow-hidden text-ellipsis' : 'leading-none text-center'}`}
                          style={block.isBatch 
                            ? { 
                                fontSize: `min(calc(95cqw / ${Math.max(mainText.length, 1)}), 80px, 80cqh)`, 
                                maxWidth: '100%',
                              } 
                            : { 
                                writingMode: 'vertical-rl', 
                                textOrientation: 'upright', 
                                textAlign: 'center',
                                maxHeight: '100%',
                                fontSize: verticalFontSize
                              }
                          }
                        >
                          {displayNode}
                        </span>
                      {badges.length > 0 && (
                        <div 
                          className="flex mt-1 px-1 shrink-0"
                          style={{ display: 'flex', flexDirection: 'row', flexWrap: 'nowrap', gap: '4px', justifyContent: 'center' }}
                        >
                          {badges.map((name, idx) => {
                            const { last, first } = getTeacherDisplayParts(name);
                            return (
                              <span key={idx} className={`px-1.5 py-0.5 rounded-sm text-[10px] md:text-[11px] font-black text-white shadow-sm tracking-wider whitespace-nowrap ${displayMode === 'teacher' ? 'bg-indigo-500' : 'bg-amber-500'}`}>
                                {last}{first && <span style={{ fontSize: '0.7em', marginInlineStart: '-0.15em' }}>{first}</span>}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    {locations.length > 0 && (
                      <div className={`flex flex-wrap gap-1 mt-1.5 justify-center ${block.isBatch ? 'w-full' : ''}`}>
                        {locations.map((loc, idx) => (
                          <span key={idx} className="text-[10px] font-black text-sky-800 bg-sky-100 border border-sky-300 px-1 py-0.5 rounded-sm shadow-sm whitespace-nowrap tracking-wide">
                            {loc}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
