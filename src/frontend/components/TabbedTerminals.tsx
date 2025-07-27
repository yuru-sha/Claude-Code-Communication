import { useState } from 'react';
import { Terminal } from './Terminal';

interface Agent {
  id: string;
  name: string;
  role: 'president' | 'manager' | 'worker';
  status: 'idle' | 'working' | 'offline';
  currentTask?: string;
}

interface TabbedTerminalsProps {
  agents: Agent[];
}

export const TabbedTerminals = ({ agents }: TabbedTerminalsProps) => {
  const [activeTab, setActiveTab] = useState(0);

  const getTabIcon = (role: string) => {
    switch (role) {
      case 'president': return '👑';
      case 'manager': return '📊';
      case 'worker': return '⚡';
      default: return '🤖';
    }
  };

  const getTabColor = (role: string, isActive: boolean) => {
    const baseColors = {
      president: isActive ? 'from-yellow-500 to-amber-600' : 'from-yellow-500/20 to-amber-600/20',
      manager: isActive ? 'from-blue-500 to-indigo-600' : 'from-blue-500/20 to-indigo-600/20',
      worker: isActive ? 'from-green-500 to-emerald-600' : 'from-green-500/20 to-emerald-600/20'
    };
    return baseColors[role as keyof typeof baseColors] || 'from-gray-500 to-gray-600';
  };

  const getStatusIndicator = (status: Agent['status']) => {
    switch (status) {
      case 'working': return { color: 'bg-emerald-400', animation: 'animate-pulse' };
      case 'idle': return { color: 'bg-amber-400', animation: '' };
      case 'offline': return { color: 'bg-red-400', animation: '' };
      default: return { color: 'bg-gray-400', animation: '' };
    }
  };

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-500/10 to-cyan-500/10 p-4 md:p-6 border-b border-slate-700/50">
        <div className="flex items-center space-x-3">
          <div className="w-6 h-6 md:w-8 md:h-8 bg-gradient-to-br from-green-500 to-cyan-600 rounded-lg flex items-center justify-center">
            <span className="text-sm md:text-lg">💻</span>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg md:text-2xl font-bold text-white truncate">Agent Terminals</h2>
            <p className="text-slate-400 text-xs md:text-sm hidden sm:block">Live view of agent activities and outputs</p>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-slate-900/50 border-b border-slate-700/50">
        <div className="flex overflow-x-auto scrollbar-hide">
          {agents.map((agent, index) => {
            const isActive = activeTab === index;
            const statusInfo = getStatusIndicator(agent.status);
            
            return (
              <button
                key={agent.id}
                onClick={() => setActiveTab(index)}
                className={`group relative flex items-center space-x-2 md:space-x-3 px-3 md:px-6 py-3 md:py-4 transition-all duration-200 whitespace-nowrap ${
                  isActive 
                    ? 'bg-slate-800/80 border-b-2 border-blue-400' 
                    : 'hover:bg-slate-800/50'
                }`}
              >
                {/* Tab Icon */}
                <div className={`w-6 h-6 md:w-8 md:h-8 bg-gradient-to-br ${getTabColor(agent.role, isActive)} rounded-lg flex items-center justify-center text-xs md:text-sm transition-all duration-200 ${
                  isActive ? 'scale-110' : 'group-hover:scale-105'
                }`}>
                  {getTabIcon(agent.role)}
                </div>

                {/* Tab Info - Hidden on small screens */}
                <div className="hidden sm:flex flex-col items-start">
                  <div className="flex items-center space-x-2">
                    <span className={`font-semibold text-sm ${
                      isActive ? 'text-white' : 'text-slate-300 group-hover:text-white'
                    }`}>
                      {agent.name}
                    </span>
                    <div className={`w-2 h-2 rounded-full ${statusInfo.color} ${statusInfo.animation}`}></div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-slate-500 capitalize">{agent.role}</span>
                    <span className="text-xs text-slate-600">•</span>
                    <span className={`text-xs capitalize ${
                      agent.status === 'working' ? 'text-emerald-400' : 
                      agent.status === 'idle' ? 'text-amber-400' : 'text-red-400'
                    }`}>
                      {agent.status}
                    </span>
                  </div>
                </div>

                {/* Mobile Status Indicator */}
                <div className="sm:hidden">
                  <div className={`w-2 h-2 rounded-full ${statusInfo.color} ${statusInfo.animation}`}></div>
                </div>

                {/* Current Task Indicator */}
                {agent.currentTask && (
                  <div className="absolute -top-1 -right-1 w-2 h-2 md:w-3 md:h-3 bg-blue-500 rounded-full animate-pulse"></div>
                )}

                {/* Active Tab Indicator */}
                {isActive && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-400 to-cyan-400"></div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Terminal Content */}
      <div className="p-4 md:p-6">
        {agents.length > 0 && (
          <div className="space-y-4">
            {/* Agent Info Panel */}
            <div className="bg-slate-900/30 border border-slate-700/30 rounded-xl p-3 md:p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0">
                <div className="flex items-center space-x-3 md:space-x-4">
                  <div className={`w-10 h-10 md:w-12 md:h-12 bg-gradient-to-br ${getTabColor(agents[activeTab].role, true)} rounded-xl flex items-center justify-center text-lg md:text-xl`}>
                    {getTabIcon(agents[activeTab].role)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg md:text-xl font-bold text-white truncate">{agents[activeTab].name}</h3>
                    <div className="flex items-center space-x-2 md:space-x-3 text-xs md:text-sm">
                      <span className="text-slate-400 capitalize">{agents[activeTab].role}</span>
                      <span className="text-slate-600">•</span>
                      <span className={`capitalize ${
                        agents[activeTab].status === 'working' ? 'text-emerald-400' : 
                        agents[activeTab].status === 'idle' ? 'text-amber-400' : 'text-red-400'
                      }`}>
                        {agents[activeTab].status}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Status Badge */}
                <div className={`self-start sm:self-auto px-3 md:px-4 py-1 md:py-2 rounded-full text-xs font-semibold ${
                  agents[activeTab].status === 'working' 
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                  agents[activeTab].status === 'idle'
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                    'bg-red-500/20 text-red-400 border border-red-500/30'
                }`}>
                  {agents[activeTab].status === 'working' ? '🔄 Active' :
                   agents[activeTab].status === 'idle' ? '💤 Idle' : '❌ Offline'}
                </div>
              </div>

              {/* Current Task */}
              {agents[activeTab].currentTask && (
                <div className="mt-3 md:mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                  <div className="text-xs text-blue-400 font-medium mb-1">Current Task</div>
                  <div className="text-xs md:text-sm text-slate-200 break-words">{agents[activeTab].currentTask}</div>
                </div>
              )}
            </div>

            {/* Terminal */}
            <div className="min-h-[300px] md:min-h-[400px]">
              <Terminal title={`${agents[activeTab].name} (${agents[activeTab].role})`} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};