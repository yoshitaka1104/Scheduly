import { useTimetableStore } from '../store/useTimetableStore';
import { X, History, ArrowRightLeft, Move, Upload } from 'lucide-react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function LogViewerModal({ isOpen, onClose }: Props) {
  const { logs, currentDate } = useTimetableStore();
  const dateStr = format(currentDate, 'yyyy-MM-dd');
  
  const filteredLogs = logs.filter(log => !log.targetDate || log.targetDate === dateStr);

  if (!isOpen) return null;

  const getIcon = (action: string) => {
    switch (action) {
      case 'swap': return <ArrowRightLeft className="h-5 w-5 text-blue-500" />;
      case 'move': return <Move className="h-5 w-5 text-indigo-500" />;
      case 'import': return <Upload className="h-5 w-5 text-emerald-500" />;
      default: return <History className="h-5 w-5 text-slate-500" />;
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col h-[80vh]">
        <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-slate-50 flex-shrink-0">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <History className="h-5 w-5 text-indigo-600" />
            変更履歴 ({format(currentDate, 'M月d日')}の予定)
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X className="h-5 w-5" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {filteredLogs.length === 0 ? (
            <div className="text-center text-slate-400 py-10">
              この日の変更履歴はまだありません。
            </div>
          ) : (
            filteredLogs.map(log => (
              <div key={log.id} className="flex gap-4 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="mt-1 flex-shrink-0">
                  {getIcon(log.action)}
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800">{log.details}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {format(new Date(log.timestamp), 'yyyy年M月d日 HH:mm:ss', { locale: ja })}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
