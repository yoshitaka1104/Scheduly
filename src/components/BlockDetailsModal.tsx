import React, { useState, useEffect } from 'react';
import { useTimetableStore } from '../store/useTimetableStore';
import { X, BookOpen, User, Save, MapPin } from 'lucide-react';
import { TimetableBlock } from '../types';

interface Props {
  activeItem: { block: TimetableBlock, mergedClassIds: string[], mergedPeriods: number[] } | null;
  onClose: () => void;
}

export function BlockDetailsModal({ activeItem, onClose }: Props) {
  const { updateBlocks, classes, addLog, blocks } = useTimetableStore();
  const block = activeItem?.block || null;
  const [editedSubClasses, setEditedSubClasses] = useState<TimetableBlock['subClasses']>([]);
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);

  useEffect(() => {
    if (activeItem) {
      setEditedSubClasses(JSON.parse(JSON.stringify(activeItem.block.subClasses || [])));
      setSelectedClassIds(activeItem.mergedClassIds);
    }
  }, [activeItem]);

  const { classTeachers, otherTeachers, teacherToSubjectsMap } = React.useMemo(() => {
    const allT = new Set<string>();
    const classT = new Set<string>();
    const subjMap = new Map<string, Set<string>>();
    
    if (block) {
      blocks.forEach(b => {
        b.subClasses?.forEach(s => {
          allT.add(s.teacher);
          if (b.classId === block.classId) {
            classT.add(s.teacher);
          }
          if (!subjMap.has(s.teacher)) subjMap.set(s.teacher, new Set());
          subjMap.get(s.teacher)!.add(s.subject);
        });
      });
    }

    const tMap: Record<string, string[]> = {};
    subjMap.forEach((subjects, teacher) => {
      tMap[teacher] = Array.from(subjects).sort();
    });

    return {
      classTeachers: Array.from(classT).sort(),
      otherTeachers: Array.from(allT).filter(t => !classT.has(t)).sort(),
      teacherToSubjectsMap: tMap
    };
  }, [blocks, block]);

  if (!block) return null;

  const targetClass = classes.find(c => c.id === block.classId);

  const handleSubClassChange = (id: string, field: keyof TimetableBlock['subClasses'][0], value: any) => {
    setEditedSubClasses(prev => prev.map(s => {
      if (s.id === id) {
        const updated = { ...s, [field]: value };
        // If teacher changes, auto-update subject if current subject is not valid for new teacher
        if (field === 'teacher') {
          const available = teacherToSubjectsMap[value as string] || [];
          if (available.length > 0 && !available.includes(updated.subject)) {
            updated.subject = available[0];
          }
        }
        return updated;
      }
      return s;
    }));
  };

  const handleAddSubClass = () => {
    setEditedSubClasses(prev => [
      ...prev,
      {
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2),
        subject: prev[0]?.subject || '',
        teacher: '',
        isElective: prev[0]?.isElective || false,
        hasTask: false,
        location: ''
      }
    ]);
  };

  const handleRemoveSubClass = (id: string) => {
    setEditedSubClasses(prev => prev.filter(s => s.id !== id));
  };

  const handleSave = () => {
    const isChanged = JSON.stringify(block.subClasses) !== JSON.stringify(editedSubClasses);
    if (isChanged) {
      const isBaseModified = editedSubClasses.some((s, i) => 
        s.subject !== block.subClasses![i]?.subject || 
        s.teacher !== block.subClasses![i]?.teacher
      );
      
      const isMemoModified = editedSubClasses.some((s, i) => 
        s.location !== block.subClasses![i]?.location ||
        s.hasTask !== block.subClasses![i]?.hasTask ||
        s.isElective !== block.subClasses![i]?.isElective
      );
      
      if (!block || !activeItem) return;

      // 対象となる全ての選択済みクラスのブロックIDを収集
      const targetIds = blocks
        .filter(b => 
          b.date === block.date && 
          selectedClassIds.includes(b.classId) && 
          activeItem.mergedPeriods.includes(b.period)
        )
        .map(b => b.id);

      updateBlocks(targetIds, { 
        subClasses: editedSubClasses, 
        isBase: isBaseModified ? false : block.isBase,
        isMemoModified: block.isMemoModified || isMemoModified
      });
      
      const subjectsStr = editedSubClasses.map(s => s.subject).join(' / ');
      addLog({ targetDate: block.date, action: 'update_memo', details: `${targetClass?.grade}年${targetClass?.name} ${block.period}限 (${subjectsStr}) の詳細を更新しました` });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-slate-50 flex-shrink-0">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <span className="bg-indigo-100 text-indigo-800 px-2.5 py-1 rounded-md text-sm">
              {targetClass?.grade}年{targetClass?.name} - {block.period}限
            </span>
            授業詳細
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-200 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        
        <div className="p-4 border-b border-slate-100 bg-white">
          <p className="text-xs font-bold text-slate-500 mb-2">対象クラス（合同授業にする場合は複数チェック）</p>
          <div className="flex flex-wrap gap-2">
            {classes.filter(c => c.grade === targetClass?.grade).map(c => (
              <label key={c.id} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm font-bold cursor-pointer transition-colors ${selectedClassIds.includes(c.id) ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'}`}>
                <input 
                  type="checkbox" 
                  className="hidden"
                  checked={selectedClassIds.includes(c.id)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedClassIds(prev => [...prev, c.id]);
                    } else {
                      if (selectedClassIds.length > 1) {
                        setSelectedClassIds(prev => prev.filter(id => id !== c.id));
                      }
                    }
                  }}
                />
                {c.name}
              </label>
            ))}
          </div>
        </div>
        
        <div className="p-6 overflow-y-auto space-y-8 flex-1">
          {editedSubClasses.map((sub) => {
            const availableSubjects = teacherToSubjectsMap[sub.teacher] || [];

            return (
                <div className="flex justify-between items-center absolute -top-4 left-0 right-0">
                  <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2 bg-white pr-3 pl-1">
                    <div className="w-1.5 h-5 bg-indigo-500 rounded-full" />
                    {sub.subject || '科目未定'} <span className="text-sm font-normal text-slate-400">の設定</span>
                  </h3>
                  {editedSubClasses.length > 1 && (
                    <button 
                      onClick={() => handleRemoveSubClass(sub.id)}
                      className="text-red-500 hover:text-red-700 bg-white pl-3 text-sm font-bold flex items-center gap-1 transition-colors"
                    >
                      <X className="w-4 h-4" />
                      この枠を削除
                    </button>
                  )}
                </div>

                <div className="pt-4 space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="bg-emerald-50 p-3.5 rounded-xl text-emerald-600 flex-shrink-0">
                      <User className="h-6 w-6" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-bold text-slate-400 mb-1.5">担当教員を変更</p>
                      <select 
                        value={sub.teacher}
                        onChange={e => handleSubClassChange(sub.id, 'teacher', e.target.value)}
                        className="w-full rounded-lg border-slate-300 border p-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-slate-800 font-bold bg-white"
                      >
                        {classTeachers.length > 0 && (
                          <optgroup label={`${targetClass?.grade}年${targetClass?.name} の担当教員`}>
                            {classTeachers.map(t => (
                              <option key={`class-${t}`} value={t}>{t ? t.replace(/\n/g, ' / ') : '未設定'}</option>
                            ))}
                          </optgroup>
                        )}
                        {otherTeachers.length > 0 && (
                          <optgroup label="その他の教員">
                            {otherTeachers.map(t => (
                              <option key={`other-${t}`} value={t}>{t ? t.replace(/\n/g, ' / ') : '未設定'}</option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="bg-indigo-50 p-3.5 rounded-xl text-indigo-600 flex-shrink-0">
                      <BookOpen className="h-6 w-6" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-bold text-slate-400 mb-1.5">科目を変更</p>
                      <select 
                        value={sub.subject}
                        onChange={e => handleSubClassChange(sub.id, 'subject', e.target.value)}
                        className="w-full rounded-lg border-slate-300 border p-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-slate-800 font-extrabold bg-white"
                      >
                        {availableSubjects.map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="bg-sky-50 p-3.5 rounded-xl text-sky-600 flex-shrink-0">
                      <MapPin className="h-6 w-6" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-bold text-slate-400 mb-1.5">授業場所</p>
                      <input 
                        type="text"
                        value={sub.location || ''}
                        onChange={e => handleSubClassChange(sub.id, 'location', e.target.value)}
                        placeholder="例：第1体育館、物理室"
                        className="w-full rounded-lg border-slate-300 border p-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-slate-800 font-bold"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-3 bg-amber-50 p-4 rounded-xl border border-amber-200 cursor-pointer hover:bg-amber-100 transition-colors" onClick={() => handleSubClassChange(sub.id, 'hasTask', !sub.hasTask)}>
                    <input 
                      type="checkbox" 
                      checked={sub.hasTask || false}
                      onChange={(e) => handleSubClassChange(sub.id, 'hasTask', e.target.checked)}
                      onClick={e => e.stopPropagation()}
                      className="w-5 h-5 text-amber-600 rounded border-amber-300 focus:ring-amber-500 cursor-pointer"
                    />
                    <label className="font-bold text-amber-900 cursor-pointer select-none flex-1">
                      この授業に自習課題を設定する
                    </label>
                  </div>
                  
                  <div className="flex items-center gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSubClassChange(sub.id, 'isElective', !sub.isElective)}>
                    <input 
                      type="checkbox" 
                      checked={sub.isElective || false}
                      onChange={(e) => handleSubClassChange(sub.id, 'isElective', e.target.checked)}
                      onClick={e => e.stopPropagation()}
                      className="w-5 h-5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                    />
                    <label className="font-bold text-slate-700 cursor-pointer select-none flex-1">
                      この授業は選択科目（合同授業）である
                    </label>
                  </div>
                </div>
              </div>
            );
          })}
          
          <div className="pt-2">
            <button
              onClick={handleAddSubClass}
              className="w-full py-3 border-2 border-dashed border-indigo-200 text-indigo-600 rounded-xl font-bold hover:bg-indigo-50 transition-colors flex items-center justify-center gap-2"
            >
              <div className="bg-indigo-100 rounded-full p-1">
                <User className="w-4 h-4" />
              </div>
              ＋ もう1名、担当教員を追加する
            </button>
          </div>
        </div>
        
        <div className="p-4 border-t border-slate-100 bg-white flex-shrink-0">
          <button 
            onClick={handleSave}
            className="w-full flex justify-center items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white py-3.5 rounded-xl font-bold transition-colors shadow-sm"
          >
            <Save className="h-5 w-5" />
            保存して閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
