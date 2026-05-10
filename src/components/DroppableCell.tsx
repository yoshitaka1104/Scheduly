import React from 'react';
import { useDroppable } from '@dnd-kit/core';

interface Props {
  id: string; // cell-${classId}-${period}
  children: React.ReactNode;
  onClick: () => void;
}

export function DroppableCell({ id, children, onClick }: Props) {
  const { isOver, setNodeRef } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      onClick={onClick}
      className={`relative p-0 rounded-xl transition-all h-full min-h-[5rem] flex flex-col justify-center border-2
        ${isOver 
          ? 'bg-indigo-50 border-indigo-400 border-dashed ring-2 ring-indigo-100 scale-[1.02] z-10' 
          : 'bg-slate-50 border-dashed border-slate-200 hover:bg-slate-100 cursor-pointer'}`}
    >
      {children}
    </div>
  );
}
