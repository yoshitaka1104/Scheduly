import React, { useState } from 'react';
import { useTimetableStore } from '../store/useTimetableStore';
import * as XLSX from 'xlsx';
import { Upload, Save, Settings, Info, CheckCircle2, AlertCircle } from 'lucide-react';
import { ClassInfo, TimetableBlock, Period } from '../types';
import { format, addDays } from 'date-fns';

export function AdminDashboard() {
  const { settings, setSettings, classes, setClasses, mergeBlocks, currentDate } = useTimetableStore();
  
  const [periods, setPeriods] = useState(settings.periodsPerDay);
  const [namingRule, setNamingRule] = useState(settings.namingRule);
  const [classCounts, setClassCounts] = useState({
    1: classes.filter(c => c.grade === 1).length || 7,
    2: classes.filter(c => c.grade === 2).length || 7,
    3: classes.filter(c => c.grade === 3).length || 7,
  });
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error' | 'info', message: string } | null>(null);

  const handleSaveSettings = () => {
    setSettings({ periodsPerDay: periods, namingRule });
    
    // クラスの再生成
    const newClasses: ClassInfo[] = [];
    for (let g = 1; g <= 3; g++) {
      const count = classCounts[g as keyof typeof classCounts];
      for (let c = 1; c <= count; c++) {
        const name = namingRule === 'alphabet' ? String.fromCharCode(64 + c) + '組' : `${c}組`;
        newClasses.push({ id: `g${g}c${c}`, grade: g, name });
      }
    }
    setClasses(newClasses);
    setImportStatus({ type: 'success', message: '基本設定を保存しました。' });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportStatus({ type: 'info', message: 'ファイルを解析中...' });

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json<any>(ws);

        // 今年度（4月1日〜翌年3月31日）の全ての日付を取得する
        const currentYear = currentDate.getFullYear();
        const currentMonth = currentDate.getMonth(); // 0-based, April is 3
        const startYear = currentMonth >= 3 ? currentYear : currentYear - 1;
        const startDate = new Date(startYear, 3, 1);
        const endDate = new Date(startYear + 1, 2, 31);

        const datesByDay: Record<string, string[]> = { '月': [], '火': [], '水': [], '木': [], '金': [], '土': [], '日': [] };
        let d = new Date(startDate);
        const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
        
        while (d <= endDate) {
          const dayStr = dayNames[d.getDay()];
          if (datesByDay[dayStr]) {
            datesByDay[dayStr].push(format(d, 'yyyy-MM-dd'));
          }
          d = addDays(d, 1);
        }

        const groupedRows = new Map<string, Array<{ subject: string, teacher: string, isElective: boolean }>>();

        data.forEach((row: any) => {
          const className = row['クラス']?.toString();
          const dayStr = row['曜日'];
          const period = parseInt(row['時限']);
          const subject = row['科目名'];
          const teacher = row['代表教員'];
          const isElective = row['選択'] === '〇' || row['選択'] === '○';

          if (!className || !dayStr || !period || !subject) return;

          const key = `${className}-${dayStr}-${period}`;
          if (!groupedRows.has(key)) {
            groupedRows.set(key, []);
          }
          const group = groupedRows.get(key)!;
          const sub = subject.toString().trim();
          const tcr = teacher ? teacher.toString().trim() : '';
          
          if (!group.some(g => g.subject === sub && g.teacher === tcr)) {
            group.push({ subject: sub, teacher: tcr, isElective });
          }
        });

        const importedBlocks: TimetableBlock[] = [];
        
        groupedRows.forEach((group, key) => {
          const [className, dayStr, periodStr] = key.split('-');
          const period = parseInt(periodStr);

          // 対象クラスを検索 ("2E", "2年E組", "2-E" などの表記揺れに対応)
          const normalizeClass = (str: string) => str.replace(/年|組|-|\s/g, '').toLowerCase();
          const targetClass = classes.find(c => normalizeClass(`${c.grade}${c.name}`) === normalizeClass(className));
          const dates = datesByDay[dayStr];

          if (targetClass && dates && period <= periods) {
            dates.forEach(dateStr => {
              importedBlocks.push({
                id: `base-${dateStr}-${targetClass.id}-${period}`,
                classId: targetClass.id,
                date: dateStr,
                period: period as Period,
                isBase: true,
                subClasses: group.map((g: any, index) => ({
                  id: `sub-${dateStr}-${targetClass.id}-${period}-${index}`,
                  subject: g.subject,
                  teacher: g.teacher,
                  isElective: g.isElective
                }))
              });
            });
          }
        });

        if (importedBlocks.length > 0) {
          try {
            await mergeBlocks(importedBlocks);
            
            // storeにエラーがセットされていないか確認
            const currentError = useTimetableStore.getState().dbError;
            if (currentError) {
              setImportStatus({ type: 'error', message: currentError });
            } else {
              setImportStatus({ type: 'success', message: `${importedBlocks.length}件のコマデータをインポートしました。` });
            }
          } catch (err: any) {
            setImportStatus({ type: 'error', message: `保存に失敗しました：${err.message || '不明なエラー'}` });
          }
        } else {
          setImportStatus({ type: 'error', message: 'インポートできるデータが見つかりませんでした。クラス名（例: "1年1組"）やヘッダー列名（曜日, 時限, 科目名）を確認してください。' });
        }
      } catch (err: any) {
        console.error('Excel Import Error:', err);
        setImportStatus({ type: 'error', message: `保存に失敗しました：${err.message || '不明なエラー'}` });
      }
    };
    reader.readAsBinaryString(file);
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-6 space-y-8">
      {importStatus && (
        <div className={`p-4 rounded-xl flex items-center gap-3 ${
          importStatus.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' :
          importStatus.type === 'error' ? 'bg-red-50 text-red-800 border border-red-200' :
          'bg-blue-50 text-blue-800 border border-blue-200'
        }`}>
          {importStatus.type === 'success' && <CheckCircle2 className="h-5 w-5" />}
          {importStatus.type === 'error' && <AlertCircle className="h-5 w-5" />}
          {importStatus.type === 'info' && <Info className="h-5 w-5" />}
          <p className="font-medium">{importStatus.message}</p>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50 p-4">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Settings className="h-5 w-5 text-indigo-600" />
            基本設定・クラス構成
          </h2>
        </div>
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">1日の最大時限数</label>
              <select 
                value={periods} 
                onChange={e => setPeriods(parseInt(e.target.value))}
                className="w-full rounded-lg border-slate-300 border p-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              >
                {[4, 5, 6, 7, 8].map(p => <option key={p} value={p}>{p}限まで</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">クラス命名規則</label>
              <select 
                value={namingRule} 
                onChange={e => setNamingRule(e.target.value as any)}
                className="w-full rounded-lg border-slate-300 border p-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              >
                <option value="number">数字 (1組, 2組...)</option>
                <option value="alphabet">アルファベット (A組, B組...)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">学年ごとのクラス数</label>
            <div className="grid grid-cols-3 gap-4">
              {[1, 2, 3].map(grade => (
                <div key={grade} className="flex items-center gap-3 bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <span className="font-bold text-slate-700 w-12">{grade}年生</span>
                  <input 
                    type="number" 
                    min="1" max="20"
                    value={classCounts[grade as keyof typeof classCounts]}
                    onChange={e => setClassCounts({ ...classCounts, [grade]: parseInt(e.target.value) || 1 })}
                    className="w-full rounded-md border-slate-300 border p-1.5 text-center focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                  <span className="text-slate-500 text-sm">クラス</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button 
              onClick={handleSaveSettings}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg font-medium transition-colors shadow-sm"
            >
              <Save className="h-5 w-5" />
              設定を保存してクラスを再生成
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50 p-4">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Upload className="h-5 w-5 text-emerald-600" />
            ベース時間割のExcelインポート
          </h2>
        </div>
        <div className="p-6">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 text-center">
            <p className="text-emerald-800 font-medium mb-4">
              Excelファイル（.xlsx）を選択して、今年度（4月〜翌3月）の1年分を一括インポートします。<br/>
              <span className="text-sm opacity-80 mt-1 block">A列:No., B列:クラス(例:1年1組), C列:曜日(月~金), D列:時限, E列:科目名, F列:代表教員</span>
            </p>
            <label className="inline-flex items-center gap-2 bg-white border-2 border-emerald-600 text-emerald-700 hover:bg-emerald-600 hover:text-white px-6 py-3 rounded-lg font-bold cursor-pointer transition-colors shadow-sm">
              <Upload className="h-5 w-5" />
              ファイルを選択
              <input 
                type="file" 
                accept=".xlsx, .xls" 
                className="hidden" 
                onChange={handleFileUpload}
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
