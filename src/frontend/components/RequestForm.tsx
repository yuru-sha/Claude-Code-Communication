import { useState } from 'react';

interface RequestFormProps {
  onSubmit?: (task: { title: string; description: string }) => void;
}

export const RequestForm = ({ onSubmit }: RequestFormProps) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleButtonClick = async () => {
    if (title.trim() && !isSubmitting) {
      setIsSubmitting(true);
      const taskData = { 
        title: title.trim(), 
        description: description.trim() || title.trim() 
      };
      
      try {
        onSubmit?.(taskData);
        setTitle('');
        setDescription('');
        
        // 提出アニメーション
        setTimeout(() => setIsSubmitting(false), 1500);
      } catch (error) {
        setIsSubmitting(false);
      }
    }
  };

  const canSubmit = title.trim().length > 0 && !isSubmitting;

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl shadow-xl overflow-hidden">
      <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 p-3 lg:p-4 border-b border-slate-700/50">
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
            <span className="text-sm">📝</span>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-white">New Task</h2>
            <p className="text-slate-400 text-xs hidden lg:block">AI team request</p>
          </div>
        </div>
      </div>
      
      <div className="p-3 lg:p-4 space-y-3">
        <div>
          <input 
            type="text" 
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Task title (e.g., Create a TODO list app)"
            className="w-full p-3 rounded-lg bg-slate-900/50 text-white border border-slate-600/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all duration-200 placeholder-slate-500 text-sm"
          />
        </div>
        
        <div>
          <textarea 
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            rows={2}
            className="w-full p-3 rounded-lg bg-slate-900/50 text-white border border-slate-600/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all duration-200 placeholder-slate-500 resize-none text-sm"
          />
        </div>

        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${canSubmit ? 'bg-emerald-400' : 'bg-slate-500'}`}></div>
            <span className={`text-xs font-medium ${canSubmit ? 'text-emerald-400' : 'text-slate-500'}`}>
              {canSubmit ? 'Ready' : 'Enter title'}
            </span>
          </div>
          
          <button 
            onClick={handleButtonClick}
            disabled={!canSubmit}
            className={`px-4 py-2 rounded-lg font-semibold transition-all duration-200 text-sm ${
              canSubmit 
                ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white shadow-lg shadow-blue-500/25' 
                : 'bg-slate-700 text-slate-500 cursor-not-allowed'
            }`}
          >
            {isSubmitting ? (
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                <span>...</span>
              </div>
            ) : (
              'Submit 🚀'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};