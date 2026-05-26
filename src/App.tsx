import React from 'react';
import { CalendarDays, Settings, History, ChevronLeft, ChevronRight, Undo2, Copy, LogIn, LogOut, Loader2 } from 'lucide-react';
import { format, addDays, subDays } from 'date-fns';
import { ja } from 'date-fns/locale';
import { toPng } from 'html-to-image';
import { TimetableBoard } from './components/TimetableBoard';
import { AdminDashboard } from './components/AdminDashboard';
import { BatchOperationsModal } from './components/BatchOperationsModal';
import { BatchDeleteModal } from './components/BatchDeleteModal';
import { BatchUpdateModal } from './components/BatchUpdateModal';
import { LogViewerModal } from './components/LogViewerModal';
import { CopyDayModal } from './components/CopyDayModal';
import { ExportOptionsModal } from './components/ExportOptionsModal';
import { LoginModal } from './components/LoginModal';
import { useTimetableStore } from './store/useTimetableStore';

function App() {
  const [view, setView] = React.useState<'board' | 'admin'>('board');
  const [isBatchModalOpen, setIsBatchModalOpen] = React.useState(false);
  const [isBatchDeleteModalOpen, setIsBatchDeleteModalOpen] = React.useState(false);
  const [isBatchUpdateModalOpen, setIsBatchUpdateModalOpen] = React.useState(false);
  const [isCopyModalOpen, setIsCopyModalOpen] = React.useState(false);
  const [isLogModalOpen, setIsLogModalOpen] = React.useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = React.useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = React.useState(false);
  const [isExporting, setIsExporting] = React.useState(false);

  const { 
    currentDate, 
    setCurrentDate, 
    visibleGrades, 
    setVisibleGrades, 
    pastBlocks, 
    undo, 
    isChangeOnlyView, 
    setIsChangeOnlyView, 
    displayMode, 
    setDisplayMode,
    user,
    isInitializing,
    initializeStore,
    logout
  } = useTimetableStore();

  const dateInputRef = React.useRef<HTMLInputElement>(null);

  // 初期ロードと購読の設定
  React.useEffect(() => {
    initializeStore();
  }, [initializeStore]);

  const isLoggedIn = !!user;

  // ログアウトしたときに管理者画面を開いていた場合、ボード画面に戻す
  React.useEffect(() => {
    if (!isLoggedIn && view === 'admin') {
      setView('board');
    }
  }, [isLoggedIn, view]);

  const handlePrevDay = () => setCurrentDate(subDays(currentDate, 1));
  const handleNextDay = () => setCurrentDate(addDays(currentDate, 1));
  const handleToday = () => setCurrentDate(new Date());

  const handleToggleGrade = (grade: number) => {
    if (visibleGrades.includes(grade)) {
      if (visibleGrades.length > 1) {
        setVisibleGrades(visibleGrades.filter((g: number) => g !== grade));
      }
    } else {
      setVisibleGrades([...visibleGrades, grade].sort());
    }
  };

  const executeExport = async (changeOnly: boolean) => {
    const originalState = isChangeOnlyView;
    if (originalState !== changeOnly) {
      setIsChangeOnlyView(changeOnly);
    }
    
    setIsExporting(true);
    
    // Reactの再レンダリングとDOMの更新を待つ
    await new Promise(resolve => setTimeout(resolve, 300));

    const boardElement = document.getElementById('timetable-export-container');
    if (!boardElement) {
      setIsExporting(false);
      if (originalState !== changeOnly) setIsChangeOnlyView(originalState);
      return;
    }

    try {
      const url = await toPng(boardElement, {
        backgroundColor: '#ffffff',
        pixelRatio: 2,
      });
      const link = document.createElement('a');
      const suffix = changeOnly ? '_変更のみ' : '';
      const modeSuffix = displayMode === 'subject' ? '_科目' : '_教員';
      link.download = `時間割_${format(currentDate, 'yyyyMMdd')}${modeSuffix}${suffix}.png`;
      link.href = url;
      link.click();
    } catch (err) {
      console.error('PNG出力に失敗しました', err);
    } finally {
      setIsExporting(false);
      if (originalState !== changeOnly) {
        setIsChangeOnlyView(originalState);
      }
    }
  };

  // 初期ロード中の表示
  if (isInitializing) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 text-indigo-600 animate-spin" />
        <p className="text-sm font-bold text-slate-600 tracking-wide">時間割データを読み込んでいます...</p>
      </div>
    );
  }


  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white shadow-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-2 rounded-lg">
              <CalendarDays className="h-5 w-5 text-white" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Scheduly - 時間割管理アプリ</h1>
          </div>
          <nav className="flex items-center gap-4">
            <button 
              onClick={() => {
                setDisplayMode(displayMode === 'subject' ? 'teacher' : 'subject');
              }}
              className="flex items-center gap-2 bg-slate-50 hover:bg-slate-100 text-slate-700 px-4 py-2 rounded-lg font-bold transition-colors whitespace-nowrap border border-slate-200 shadow-sm"
            >
              {displayMode === 'subject' ? '表示：科目' : '表示：教員'}
            </button>
            
            {/* ログイン時のみ表示するナビゲーション */}
            {isLoggedIn && (
              <>
                <button 
                  onClick={() => setIsCopyModalOpen(true)}
                  className="flex items-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-4 py-2 rounded-lg font-bold transition-colors whitespace-nowrap border border-indigo-200 shadow-sm"
                >
                  <Copy className="h-4 w-4" />
                  日課コピー
                </button>
                <button 
                  onClick={() => setIsLogModalOpen(true)}
                  className="flex items-center gap-2 text-slate-600 hover:text-indigo-600 transition-colors px-3 py-2 rounded-md hover:bg-indigo-50"
                >
                  <History className="h-5 w-5" />
                  <span className="font-medium text-sm">履歴</span>
                </button>
                <button 
                  onClick={() => setView('admin')}
                  className={`flex items-center gap-2 transition-colors px-3 py-2 rounded-md ${
                    view === 'admin' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:text-indigo-600 hover:bg-indigo-50'
                  }`}
                >
                  <Settings className="h-5 w-5" />
                  <span className="font-medium text-sm">設定</span>
                </button>
              </>
            )}

            <button 
              onClick={() => setView('board')}
              className={`flex items-center gap-2 transition-colors px-3 py-2 rounded-md ${
                view === 'board' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:text-indigo-600 hover:bg-indigo-50'
              }`}
            >
              <CalendarDays className="h-5 w-5" />
              <span className="font-medium text-sm">ボード</span>
            </button>

            {/* ログイン・ログアウトボタン */}
            {isLoggedIn ? (
              <div className="flex items-center gap-3 pl-2 border-l border-slate-200">
                <span className="hidden md:inline text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md max-w-32 truncate">
                  {user.email}
                </span>
                <button 
                  onClick={logout}
                  className="flex items-center gap-1.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50 transition-colors px-3 py-2 rounded-md border border-transparent hover:border-rose-100"
                >
                  <LogOut className="h-4.5 w-4.5" />
                  <span className="font-medium text-sm">ログアウト</span>
                </button>
              </div>
            ) : (
              <button 
                onClick={() => setIsLoginModalOpen(true)}
                className="flex items-center gap-1.5 text-indigo-600 hover:text-white hover:bg-indigo-600 transition-all px-3.5 py-2 rounded-lg border border-indigo-200 hover:border-indigo-600 font-bold text-sm shadow-sm"
              >
                <LogIn className="h-4.5 w-4.5" />
                <span>編集ログイン</span>
              </button>
            )}
          </nav>
        </div>
      </header>

      <main className={`flex-1 max-w-[1400px] mx-auto px-4 py-6 w-full flex flex-col ${view === 'board' ? 'h-[calc(100vh-4rem)]' : ''}`}>
        {view === 'board' ? (
          <>
            <div className="mb-4 flex flex-wrap justify-between items-center gap-4 bg-white p-3 rounded-xl shadow-sm border border-slate-200">
              <div className="flex items-center flex-wrap gap-4">
                <button 
                  onClick={handlePrevDay}
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-600 flex-shrink-0"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <div 
                  className="relative group cursor-pointer flex items-center justify-center rounded-lg hover:bg-indigo-50 transition-colors px-2 py-1"
                  onClick={() => {
                    try {
                      dateInputRef.current?.showPicker();
                    } catch (e) {
                      dateInputRef.current?.focus();
                    }
                  }}
                >
                  <h2 className="text-2xl font-bold text-slate-800 w-56 text-center flex-shrink-0 whitespace-nowrap group-hover:text-indigo-700 transition-colors">
                    {format(currentDate, 'yyyy年M月d日 (E)', { locale: ja })}
                  </h2>
                  <input
                    ref={dateInputRef}
                    type="date"
                    className="absolute inset-0 opacity-0 cursor-pointer pointer-events-none"
                    value={format(currentDate, 'yyyy-MM-dd')}
                    onChange={(e) => {
                      if (e.target.value) {
                        setCurrentDate(new Date(e.target.value));
                      }
                    }}
                  />
                </div>
                <button 
                  onClick={handleNextDay}
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-600 flex-shrink-0"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
                <button 
                  onClick={handleToday}
                  className="ml-2 px-3 py-1.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
                >
                  今日
                </button>
                
                {/* ログイン時のみ「元に戻す」を表示 */}
                {isLoggedIn && (
                  <>
                    <div className="hidden sm:block w-px h-6 bg-slate-300 mx-2"></div>
                    <button 
                      onClick={undo}
                      disabled={pastBlocks.length === 0}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      <Undo2 className="h-4 w-4" />
                      元に戻す
                    </button>
                  </>
                )}
              </div>
              
              <div className="flex items-center flex-wrap gap-3">
                <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
                  {[1, 2, 3].map(grade => (
                    <label key={grade} className={`px-3 py-1.5 rounded-md text-sm font-bold cursor-pointer transition-colors whitespace-nowrap ${
                      visibleGrades.includes(grade) 
                        ? 'bg-white text-indigo-700 shadow-sm' 
                        : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                    }`}>
                      <input 
                        type="checkbox" 
                        className="hidden"
                        checked={visibleGrades.includes(grade)}
                        onChange={() => handleToggleGrade(grade)}
                      />
                      {grade}年
                    </label>
                  ))}
                </div>
                <button 
                  onClick={() => setIsChangeOnlyView(!isChangeOnlyView)}
                  className={`px-4 py-2 border rounded-lg shadow-sm text-sm font-medium transition-colors whitespace-nowrap ${
                    isChangeOnlyView 
                      ? 'bg-amber-100 border-amber-300 text-amber-800 hover:bg-amber-200' 
                      : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  変更のみ表示
                </button>
                
                {/* ログイン時のみ一括編集アクションボタン群を表示 */}
                {isLoggedIn && (
                  <>
                    <div className="hidden sm:block w-px h-6 bg-slate-200 mx-1"></div>
                    <button 
                      onClick={() => setIsBatchModalOpen(true)}
                      className="px-4 py-2 bg-white border border-slate-300 rounded-lg shadow-sm text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
                    >
                      一括入替
                    </button>
                    <button 
                      onClick={() => setIsBatchUpdateModalOpen(true)}
                      className="px-4 py-2 bg-white border border-indigo-200 rounded-lg shadow-sm text-sm font-medium text-indigo-700 hover:bg-indigo-50 hover:border-indigo-300 transition-colors whitespace-nowrap"
                    >
                      一括変更
                    </button>
                    <button 
                      onClick={() => setIsBatchDeleteModalOpen(true)}
                      className="px-4 py-2 bg-white border border-red-200 rounded-lg shadow-sm text-sm font-medium text-red-600 hover:bg-red-50 hover:border-red-300 transition-colors whitespace-nowrap"
                    >
                      一括削除
                    </button>
                  </>
                )}
                
                <button 
                  onClick={() => setIsExportModalOpen(true)}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg shadow-sm text-sm font-medium hover:bg-indigo-700 transition-colors whitespace-nowrap"
                >
                  画像で保存
                </button>
              </div>
            </div>

            <div 
              id="timetable-export-container" 
              className={`bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col ${
                isExporting ? 'p-6 h-max overflow-visible' : 'p-4 flex-1 overflow-hidden'
              }`}
            >
              {isExporting && (
                <div className="flex items-center justify-between mb-6 px-2">
                  <div className="text-2xl font-bold text-slate-800 flex items-center">
                    {format(currentDate, 'yyyy年M月d日 (E)', { locale: ja })}
                    {isChangeOnlyView ? ' 【変更のみ】' : ''}
                  </div>
                  <div className="flex items-center gap-5 text-xl font-bold bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded shadow-sm border bg-emerald-100 border-emerald-300"></div>
                      <span className="text-slate-600 tracking-wide">授業変更</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded shadow-sm border bg-amber-100 border-amber-300"></div>
                      <span className="text-slate-600 tracking-wide">課題</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded shadow-sm border bg-sky-100 border-sky-300"></div>
                      <span className="text-slate-600 tracking-wide">場所変更</span>
                    </div>
                  </div>
                </div>
              )}
              <TimetableBoard isExporting={isExporting} />
            </div>
          </>
        ) : isLoggedIn ? (
          <AdminDashboard />
        ) : null}
      </main>
      
      {/* ログイン時のみ機能する各種モーダル */}
      {isLoggedIn && (
        <>
          {isBatchModalOpen && <BatchOperationsModal isOpen={isBatchModalOpen} onClose={() => setIsBatchModalOpen(false)} />}
          {isBatchUpdateModalOpen && <BatchUpdateModal isOpen={isBatchUpdateModalOpen} onClose={() => setIsBatchUpdateModalOpen(false)} />}
          {isBatchDeleteModalOpen && <BatchDeleteModal isOpen={isBatchDeleteModalOpen} onClose={() => setIsBatchDeleteModalOpen(false)} />}
          {isCopyModalOpen && <CopyDayModal isOpen={isCopyModalOpen} onClose={() => setIsCopyModalOpen(false)} />}
          {isLogModalOpen && <LogViewerModal isOpen={isLogModalOpen} onClose={() => setIsLogModalOpen(false)} />}
        </>
      )}
      
      <ExportOptionsModal isOpen={isExportModalOpen} onClose={() => setIsExportModalOpen(false)} onExport={executeExport} />
      <LoginModal isOpen={isLoginModalOpen} onClose={() => setIsLoginModalOpen(false)} />
    </div>
  );
}

export default App;
