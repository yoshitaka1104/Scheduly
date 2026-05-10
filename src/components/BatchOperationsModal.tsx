import { useState } from 'react';
import { useTimetableStore } from '../store/useTimetableStore';
import { format } from 'date-fns';
import { X, ArrowUpDown } from 'lucide-react';
import { Period } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function BatchOperationsModal({ isOpen, onClose }: Props) {
  const { batchSwapPeriods, currentDate, addLog, settings } = useTimetableStore();
  const dateStr = format(currentDate, 'yyyy-MM-dd');
  const availablePeriods = Array.from({ length: settings.periodsPerDay }, (_, i) => i + 1);
  
  const [p1, setP1] = useState<Period>(1);
  const [p2, setP2] = useState<Period>(2);
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

  const handleBatchSwap = () => {
    if (p1 === p2) return;
    const gradesStr = targetGrades.join('年, ') + '年';
    batchSwapPeriods(dateStr, p1, p2, targetGrades);
    addLog({ targetDate: dateStr, action: 'swap', details: `${p1}限と${p2}限を${gradesStr}で一括入れ替えしました` });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-slate-50">
          <h2 className="text-lg font-bold text-slate-800">一括入替</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
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
                  targetGrades.includes(grade) ? 'bg-indigo-50 border-indigo-200' : 'hover:bg-slate-50'
                }`}>
                  <input 
                    type="checkbox" 
                    checked={targetGrades.includes(grade)}
                    onChange={() => handleToggleGrade(grade)}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="font-medium text-slate-700">{grade}年生</span>
                </label>
              ))}
            </div>
            <hr className="border-slate-100 my-6" />
          </div>

          {/* 一括入れ替え */}
          <div>
            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-3">
              <ArrowUpDown className="h-4 w-4 text-amber-500" />
              時限の一括入れ替え
            </h3>
            <p className="text-xs text-slate-500 mb-3">
              表示中の日付（{format(currentDate, 'M月d日')}）の選択した学年の指定した時限を入れ替えます。
            </p>
            <div className="flex items-center gap-4">
              <select 
                value={p1} 
                onChange={(e) => setP1(parseInt(e.target.value))}
                className="flex-1 rounded-lg border-slate-300 border p-2 focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                {availablePeriods.map(p => <option key={p} value={p}>{p}限</option>)}
              </select>
              <ArrowUpDown className="h-5 w-5 text-slate-400 flex-shrink-0" />
              <select 
                value={p2} 
                onChange={(e) => setP2(parseInt(e.target.value))}
                className="flex-1 rounded-lg border-slate-300 border p-2 focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                {availablePeriods.map(p => <option key={p} value={p}>{p}限</option>)}
              </select>
            </div>
            <button 
              onClick={handleBatchSwap}
              disabled={p1 === p2}
              className="mt-4 w-full bg-slate-800 hover:bg-slate-900 disabled:bg-slate-300 disabled:cursor-not-allowed text-white py-2.5 rounded-lg font-medium transition-colors"
            >
              一括入れ替えを実行
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
