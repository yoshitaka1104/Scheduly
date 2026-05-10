import { useState } from 'react';
import { useTimetableStore } from '../store/useTimetableStore';
import { format } from 'date-fns';
import { X, Copy } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function CopyDayModal({ isOpen, onClose }: Props) {
  const { currentDate, copyDayTimetable, addLog } = useTimetableStore();
  const dateStr = format(currentDate, 'yyyy-MM-dd');
  
  const [sourceDate, setSourceDate] = useState(dateStr);
  const [targetDate, setTargetDate] = useState(dateStr);
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

  const handleExecute = () => {
    if (sourceDate === targetDate) {
      alert('コピー元と適用先が同じ日付です。');
      return;
    }
    
    if (confirm(`${format(new Date(sourceDate), 'M月d日')} の日課を ${format(new Date(targetDate), 'M月d日')} にコピー（上書き）します。よろしいですか？`)) {
      copyDayTimetable(sourceDate, targetDate, targetGrades);
      addLog({ targetDate, action: 'bulk_update', details: `${format(new Date(sourceDate), 'M月d日')} の日課を ${format(new Date(targetDate), 'M月d日')} に振替コピーしました` });
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
        <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-slate-50">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Copy className="h-5 w-5 text-indigo-600" />
            日課コピー（曜日振替）
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X className="h-5 w-5" />
          </button>
        </div>
        
        <div className="p-6 space-y-6">
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 text-indigo-800 text-sm font-medium leading-relaxed">
            行事や祝日などで、特定の曜日の日課を別の日に行う場合に使用します。<br/>
            適用先の日付に既に設定されている予定は上書きされ、イレギュラーな設定として緑色で表示されます。
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">コピー元の日付（どの日の日課を使うか）</label>
              <input 
                type="date"
                value={sourceDate}
                onChange={e => setSourceDate(e.target.value)}
                className="w-full rounded-lg border-slate-300 border p-2.5 focus:ring-2 focus:ring-indigo-500 outline-none font-medium"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">適用先の日付（いつ実施するか）</label>
              <input 
                type="date"
                value={targetDate}
                onChange={e => setTargetDate(e.target.value)}
                className="w-full rounded-lg border-slate-300 border p-2.5 focus:ring-2 focus:ring-indigo-500 outline-none font-medium"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">適用する学年</label>
              <div className="flex gap-2">
                {[1, 2, 3].map(grade => (
                  <button
                    key={grade}
                    onClick={() => handleToggleGrade(grade)}
                    className={`flex-1 py-2 rounded-lg font-bold border transition-colors ${
                      targetGrades.includes(grade)
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {grade}年生
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button 
            onClick={handleExecute}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-bold transition-colors shadow-sm"
          >
            この内容でコピーする
          </button>
        </div>
      </div>
    </div>
  );
}
