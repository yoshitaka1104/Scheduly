import { useState } from 'react';
import { useTimetableStore } from '../store/useTimetableStore';
import { format } from 'date-fns';
import { X, Trash2 } from 'lucide-react';
import { Period } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function BatchDeleteModal({ isOpen, onClose }: Props) {
  const { batchDeletePeriod, currentDate, addLog, settings } = useTimetableStore();
  const dateStr = format(currentDate, 'yyyy-MM-dd');
  const availablePeriods = Array.from({ length: settings.periodsPerDay }, (_, i) => i + 1);
  
  const [startPeriod, setStartPeriod] = useState<Period>(1);
  const [endPeriod, setEndPeriod] = useState<Period>(1);
  const [targetGrades, setTargetGrades] = useState<number[]>([1, 2, 3]);

  if (!isOpen) return null;

  const handleToggleGrade = (grade: number) => {
    if (targetGrades.includes(grade)) {
      if (targetGrades.length > 1) {
        setTargetGrades(targetGrades.filter(g => g !== grade));
      }
    } else {
      setTargetGrades([...targetGrades, grade].sort());
    }
  };

  const handleBatchDelete = () => {
    const minP = Math.min(startPeriod, endPeriod);
    const maxP = Math.max(startPeriod, endPeriod);
    const rangeText = minP === maxP ? `${minP}限` : `${minP}限から${maxP}限まで`;
    const gradesStr = targetGrades.join('年, ') + '年';
    
    batchDeletePeriod(dateStr, startPeriod, endPeriod, targetGrades);
    addLog({ targetDate: dateStr, action: 'delete', details: `${rangeText}を${gradesStr}で一括削除しました` });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="flex justify-between items-center p-4 border-b border-red-100 bg-red-50">
          <h2 className="text-lg font-bold text-red-800 flex items-center gap-2">
            <Trash2 className="h-5 w-5" />
            一括削除
          </h2>
          <button onClick={onClose} className="text-red-400 hover:text-red-600 p-1 rounded-md hover:bg-red-100 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        
        <div className="p-6 space-y-6">
          {/* 対象学年 */}
          <div>
            <h3 className="text-sm font-bold text-slate-700 mb-3">
              対象の学年
            </h3>
            <div className="flex gap-3 mb-4">
              {[1, 2, 3].map(grade => (
                <label key={grade} className={`flex-1 flex items-center justify-center gap-2 border rounded-lg p-3 cursor-pointer transition-colors ${
                  targetGrades.includes(grade) ? 'bg-red-50 border-red-200' : 'hover:bg-slate-50'
                }`}>
                  <input 
                    type="checkbox" 
                    checked={targetGrades.includes(grade)}
                    onChange={() => handleToggleGrade(grade)}
                    className="rounded text-red-600 focus:ring-red-500"
                  />
                  <span className="font-medium text-slate-700">{grade}年生</span>
                </label>
              ))}
            </div>
            <hr className="border-slate-100 my-6" />
          </div>

          <div>
            <h3 className="text-sm font-bold text-slate-700 mb-3">
              時限の一括削除
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              表示中の日付（{format(currentDate, 'M月d日')}）の選択した学年の指定した範囲の時限を削除し、空きコマにします。<br/>
              単一の時限を削除する場合は、同じ時限を選択してください。
            </p>
            <div className="flex items-center gap-3">
              <select 
                value={startPeriod} 
                onChange={(e) => setStartPeriod(parseInt(e.target.value) as Period)}
                className="flex-1 rounded-lg border-slate-300 border p-2.5 focus:ring-2 focus:ring-red-500 outline-none font-medium text-slate-700"
              >
                {availablePeriods.map(p => <option key={p} value={p}>{p}限</option>)}
              </select>
              <span className="text-slate-500 font-medium">〜</span>
              <select 
                value={endPeriod} 
                onChange={(e) => setEndPeriod(parseInt(e.target.value) as Period)}
                className="flex-1 rounded-lg border-slate-300 border p-2.5 focus:ring-2 focus:ring-red-500 outline-none font-medium text-slate-700"
              >
                {availablePeriods.map(p => <option key={p} value={p}>{p}限</option>)}
              </select>
            </div>
            <button 
              onClick={handleBatchDelete}
              className="mt-6 w-full bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              <Trash2 className="h-4 w-4" />
              一括削除を実行
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
