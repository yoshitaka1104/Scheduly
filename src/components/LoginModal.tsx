import React from 'react';
import { X, Lock, Loader2, AlertCircle } from 'lucide-react';
import { useTimetableStore } from '../store/useTimetableStore';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose }) => {
  const [password, setPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const login = useTimetableStore((state) => state.login);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    try {
      const { error } = await login(password);
      if (error) {
        if (error.status === 400) {
          setErrorMsg('編集パスワードが正しくありません。');
        } else {
          setErrorMsg(error.message || 'ログインに失敗しました。');
        }
      } else {
        setPassword(''); // フォームをクリア
        onClose();
      }
    } catch (err) {
      setErrorMsg('予期せぬエラーが発生しました。インターネット接続を確認してください。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-slate-100 flex flex-col transform transition-all scale-100 animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-indigo-600 to-indigo-700 flex items-center justify-between text-white">
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            <h2 className="text-lg font-bold">編集者ログイン</h2>
          </div>
          <button 
            onClick={onClose} 
            className="p-1 hover:bg-white/10 rounded-full transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-5">
          <div className="text-sm text-slate-500">
            時間割を編集するには、共通の編集用パスワードを入力してください。
          </div>

          {errorMsg && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-lg text-sm flex items-start gap-2.5">
              <AlertCircle className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Password field */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-700" htmlFor="password">
              編集用パスワード
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                <Lock className="h-4.5 w-4.5" />
              </span>
              <input
                id="password"
                type="password"
                required
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:bg-white transition-all"
                placeholder="パスワードを入力"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold shadow-sm hover:shadow transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                認証中...
              </>
            ) : (
              'ログインする'
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
