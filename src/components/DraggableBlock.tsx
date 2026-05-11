import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { TimetableBlock } from '../types';

interface Props {
  block: TimetableBlock;
  onClick: (e: React.MouseEvent) => void;
  duplicateTeachers?: string[];
  mergedClassIds?: string[];
  mergedPeriods?: number[];
  isChangeOnlyView?: boolean;
}

export function DraggableBlock({ block, onClick, duplicateTeachers = [], mergedClassIds = [], mergedPeriods = [], isChangeOnlyView = false }: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: block.id,
    data: { block, mergedClassIds, mergedPeriods }
  });

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
          const grouped = displaySubClasses.reduce((acc, sub) => {
            if (!acc[sub.subject]) acc[sub.subject] = [];
            acc[sub.subject].push(sub);
            return acc;
          }, {} as Record<string, typeof block.subClasses>);

          const hasAnyTask = displaySubClasses.some(s => s.hasTask);

          if (isChangeOnlyView) {
            return (
              <>
                <div className={`flex ${block.isBatch ? 'flex-col justify-center' : 'flex-row justify-center items-center'} gap-px md:gap-0.5 w-full flex-1 overflow-hidden`}>
                  {Object.entries(grouped).map(([subject, subs]) => {
                    const locations = Array.from(new Set(subs.map(s => s.location).filter(Boolean)));
                    // 文字数によるフォントサイズ調整
                    let verticalFontSize = 'clamp(14px, 21cqh, 20px)';
                    if (subject.length >= 4) {
                      verticalFontSize = 'clamp(11px, 15cqh, 14px)';
                    }
                    return (
                      <div key={subject} className={`flex flex-col items-center justify-center h-full shrink-0 ${block.isBatch ? 'text-center w-full' : ''}`}>
                        <div className={`flex ${block.isBatch ? 'items-center justify-center w-full' : 'flex-col items-center justify-center gap-0.5 h-full'}`}>
                          <span 
                            className={`font-black text-slate-800 tracking-tight shrink-0 ${block.isBatch ? 'leading-none truncate break-words' : 'leading-none text-center'}`}
                            style={block.isBatch 
                              ? { fontSize: 'min(45cqmin, 80px)', maxWidth: '95%' } 
                              : { 
                                  writingMode: 'vertical-rl', 
                                  textOrientation: 'upright', 
                                  textAlign: 'center',
                                  maxHeight: '100%',
                                  fontSize: verticalFontSize
                                }
                            }
                          >
                            {subject}
                          </span>
                        </div>
                        {locations.length > 0 && (
                          <div className={`flex flex-wrap gap-1 mt-1.5 justify-center ${block.isBatch ? 'w-full' : ''}`}>
                            {locations.map((loc, idx) => (
                              <span key={idx} className="text-[11px] md:text-[12px] font-black text-sky-800 bg-sky-100 border border-sky-300 px-2 py-0.5 rounded-sm shadow-sm truncate max-w-full tracking-wide">
                                {loc}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {hasAnyTask && (
                  <div className="flex justify-center pb-0.5 shrink-0">
                    <span className="px-2 py-0.5 rounded-sm text-[11px] md:text-[12px] font-black bg-amber-500 text-white shadow-sm tracking-wider">
                      課題
                    </span>
                  </div>
                )}
              </>
            );
          }

          // 通常表示（isChangeOnlyView === false）
          return (
            <div className={`flex ${block.isBatch ? 'flex-col justify-center' : 'flex-row justify-center items-center'} gap-px md:gap-0.5 w-full h-full`}>
              {Object.entries(grouped).map(([subject, subs]) => {
                const hasTask = subs.some(s => s.hasTask);
                const locations = Array.from(new Set(subs.map(s => s.location).filter(Boolean)));
                let verticalFontSize = 'clamp(14px, 21cqh, 20px)';
                if (subject.length >= 4) {
                  verticalFontSize = (hasTask || locations.length > 0) ? 'clamp(11px, 15cqh, 14px)' : 'clamp(12px, 17cqh, 16px)';
                }
                return (
                  <div key={subject} className={`flex flex-col items-center justify-center h-full shrink-0 ${block.isBatch ? 'text-center w-full' : ''}`}>
                    <div className={`flex ${block.isBatch ? 'items-center justify-center w-full' : 'flex-col items-center justify-center gap-0.5 h-full'}`}>
                      <span 
                        className={`font-black text-slate-800 tracking-tight shrink-0 ${block.isBatch ? 'leading-none truncate break-words' : 'leading-none text-center'}`}
                        style={block.isBatch 
                          ? { fontSize: 'min(45cqmin, 80px)', maxWidth: '95%' } 
                          : { 
                              writingMode: 'vertical-rl', 
                              textOrientation: 'upright', 
                              textAlign: 'center',
                              maxHeight: '100%',
                              fontSize: verticalFontSize
                            }
                        }
                      >
                        {subject}
                      </span>
                      {hasTask && (
                        <div className="flex gap-0.5 items-center flex-shrink-0 mt-1">
                          <span className="px-2 py-0.5 rounded-sm text-[11px] md:text-[12px] font-black bg-amber-500 text-white shadow-sm tracking-wider">
                            課題
                          </span>
                        </div>
                      )}
                    </div>
                    {locations.length > 0 && (
                      <div className={`flex flex-wrap gap-1 mt-1.5 justify-center ${block.isBatch ? 'w-full' : ''}`}>
                        {locations.map((loc, idx) => (
                          <span key={idx} className="text-[11px] md:text-[12px] font-black text-sky-800 bg-sky-100 border border-sky-300 px-2 py-0.5 rounded-sm shadow-sm truncate max-w-full tracking-wide">
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
