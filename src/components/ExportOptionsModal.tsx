import { X, Image, FileImage } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onExport: (changeOnly: boolean) => void;
}

export function ExportOptionsModal({ isOpen, onClose, onExport }: Props) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-slate-50">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Image className="h-5 w-5 text-indigo-600" />
            画像で保存
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-200 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        
        <div className="p-6 space-y-4">
          <p className="text-sm font-medium text-slate-600 mb-2">
            保存する画像の表示形式を選択してください。
          </p>
          
          <button 
            onClick={() => {
              onExport(false);
              onClose();
            }}
            className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-indigo-100 hover:border-indigo-600 hover:bg-indigo-50 transition-all text-left group"
          >
            <div className="bg-indigo-100 text-indigo-600 p-2 rounded-lg group-hover:bg-indigo-600 group-hover:text-white transition-colors">
              <FileImage className="h-5 w-5" />
            </div>
            <div>
              <div className="font-bold text-slate-800">すべてを表示して保存</div>
              <div className="text-xs text-slate-500 mt-1">変更がない基本の授業も含め、すべてのコマを画像化します。</div>
            </div>
          </button>

          <button 
            onClick={() => {
              onExport(true);
              onClose();
            }}
            className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-amber-100 hover:border-amber-500 hover:bg-amber-50 transition-all text-left group"
          >
            <div className="bg-amber-100 text-amber-600 p-2 rounded-lg group-hover:bg-amber-500 group-hover:text-white transition-colors">
              <Image className="h-5 w-5" />
            </div>
            <div>
              <div className="font-bold text-slate-800">変更した部分のみ保存</div>
              <div className="text-xs text-slate-500 mt-1">追加・移動・変更したコマだけを抽出し、他は空欄にして画像化します。</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
