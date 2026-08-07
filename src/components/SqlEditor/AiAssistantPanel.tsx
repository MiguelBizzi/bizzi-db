import React, { useState } from 'react';
import {
  Sparkles,
  Send,
  Zap,
  HelpCircle,
  Code,
  Check,
  ArrowRight,
  AlertCircle,
  Lightbulb,
  BookOpen,
} from 'lucide-react';
import {
  generateSqlWithAi,
  explainSqlWithAi,
  optimizeSqlWithAi,
  SqlGenerateResponse,
  SqlExplainResponse,
  SqlOptimizeResponse,
} from '../../services/aiService';

interface AiAssistantPanelProps {
  currentSql: string;
  schemaContext: any;
  dialect: string;
  onApplySqlToEditor: (sql: string) => void;
  onRunSql: (sql: string) => void;
}

export const AiAssistantPanel: React.FC<AiAssistantPanelProps> = ({
  currentSql,
  schemaContext,
  dialect,
  onApplySqlToEditor,
  onRunSql,
}) => {
  const [activeTab, setActiveTab] = useState<'generate' | 'explain' | 'optimize'>('generate');
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);

  const [genResponse, setGenResponse] = useState<SqlGenerateResponse | null>(null);
  const [explainResponse, setExplainResponse] = useState<SqlExplainResponse | null>(null);
  const [optimizeResponse, setOptimizeResponse] = useState<SqlOptimizeResponse | null>(null);

  const PROMPT_SUGGESTIONS = [
    'Find top 10 customers by total revenue in 2025',
    'List products with low stock quantity (< 20 units)',
    'Active orders with customer email and shipping address',
    'Calculate average order value grouped by customer role',
  ];

  const handleGenerate = async (queryText?: string) => {
    const textToUse = queryText || prompt;
    if (!textToUse.trim()) return;

    setLoading(true);
    try {
      const res = await generateSqlWithAi(textToUse, schemaContext, dialect);
      setGenResponse(res);
    } catch (e: any) {
      setGenResponse({
        sql: '-- Error generating query\nSELECT * FROM orders LIMIT 10;',
        explanation: e.message || 'Failed to contact AI service.',
        tablesUsed: ['orders'],
        estimatedComplexity: 'Simple',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleExplain = async () => {
    if (!currentSql.trim()) return;
    setLoading(true);
    try {
      const res = await explainSqlWithAi(currentSql, schemaContext, dialect);
      setExplainResponse(res);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleOptimize = async () => {
    if (!currentSql.trim()) return;
    setLoading(true);
    try {
      const res = await optimizeSqlWithAi(currentSql, schemaContext, dialect);
      setOptimizeResponse(res);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-80 bg-card border-l border-border flex flex-col h-full font-sans select-none text-card-foreground shrink-0 overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-border bg-background/60 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-primary/15 border border-primary/30 text-primary">
            <Sparkles className="w-4 h-4 animate-pulse" />
          </div>
          <span className="font-mono text-xs font-bold text-foreground">
            Gemini SQL Assistant
          </span>
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 font-semibold">
          {dialect}
        </span>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-3 border-b border-border bg-background/40 text-[11px] font-mono font-medium">
        <button
          onClick={() => setActiveTab('generate')}
          className={`py-2 text-center border-b-2 transition-colors ${
            activeTab === 'generate'
              ? 'border-primary text-primary font-bold bg-primary/10'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Generate
        </button>

        <button
          onClick={() => {
            setActiveTab('explain');
            if (!explainResponse) handleExplain();
          }}
          className={`py-2 text-center border-b-2 transition-colors ${
            activeTab === 'explain'
              ? 'border-primary text-primary font-bold bg-primary/10'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Explain
        </button>

        <button
          onClick={() => {
            setActiveTab('optimize');
            if (!optimizeResponse) handleOptimize();
          }}
          className={`py-2 text-center border-b-2 transition-colors ${
            activeTab === 'optimize'
              ? 'border-primary text-primary font-bold bg-primary/10'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Optimize
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4 scrollbar-thin scrollbar-thumb-muted">
        {/* GENERATE TAB */}
        {activeTab === 'generate' && (
          <div className="space-y-3 text-xs">
            {/* Prompt input */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono">
                Ask in Plain English:
              </label>
              <div className="relative">
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g., Get top 10 products by review count with category name..."
                  rows={3}
                  className="w-full p-2.5 bg-background border border-border rounded-xl text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary resize-none font-sans"
                />
                <button
                  onClick={() => handleGenerate()}
                  disabled={loading || !prompt.trim()}
                  className="absolute right-2 bottom-2 p-1.5 rounded-lg bg-primary hover:opacity-90 text-primary-foreground disabled:opacity-40 transition-colors"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Suggestions */}
            <div className="space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-mono">
                Prompt Suggestions:
              </div>
              <div className="space-y-1">
                {PROMPT_SUGGESTIONS.map((sug, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setPrompt(sug);
                      handleGenerate(sug);
                    }}
                    className="w-full text-left p-2 rounded-lg bg-background hover:bg-muted border border-border text-foreground text-[11px] font-sans transition-colors flex items-center justify-between group"
                  >
                    <span className="truncate pr-1">{sug}</span>
                    <ArrowRight className="w-3 h-3 text-muted-foreground group-hover:text-primary shrink-0" />
                  </button>
                ))}
              </div>
            </div>

            {/* Generated Result */}
            {loading ? (
              <div className="p-6 text-center text-muted-foreground font-mono space-y-2">
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                <p>Generating optimal SQL...</p>
              </div>
            ) : genResponse ? (
              <div className="p-3 rounded-xl bg-background border border-primary/30 space-y-2 font-mono">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-primary font-bold">
                    Complexity: {genResponse.estimatedComplexity}
                  </span>
                  <div className="flex gap-1">
                    {genResponse.tablesUsed.map((t) => (
                      <span
                        key={t}
                        className="px-1.5 py-0.2 rounded bg-muted text-muted-foreground text-[10px]"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="p-2 rounded bg-card text-foreground text-xs overflow-x-auto whitespace-pre-wrap leading-relaxed border border-border font-mono">
                  {genResponse.sql}
                </div>

                <p className="text-muted-foreground font-sans text-[11px] leading-normal">
                  {genResponse.explanation}
                </p>

                <div className="pt-1 flex gap-2">
                  <button
                    onClick={() => onApplySqlToEditor(genResponse.sql)}
                    className="flex-1 py-1.5 rounded-lg bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 text-xs font-semibold font-sans transition-colors"
                  >
                    Apply to Editor
                  </button>
                  <button
                    onClick={() => {
                      onApplySqlToEditor(genResponse.sql);
                      onRunSql(genResponse.sql);
                    }}
                    className="flex-1 py-1.5 rounded-lg bg-primary hover:opacity-90 text-primary-foreground font-sans text-xs font-bold shadow transition-colors"
                  >
                    Run Query
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* EXPLAIN TAB */}
        {activeTab === 'explain' && (
          <div className="space-y-3 text-xs">
            <button
              onClick={handleExplain}
              disabled={loading}
              className="w-full py-2 rounded-lg bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 font-semibold font-mono text-xs transition-colors"
            >
              {loading ? 'Analyzing Query...' : 'Explain Active Query'}
            </button>

            {explainResponse && (
              <div className="space-y-3 font-sans">
                <div className="p-3 rounded-xl bg-background border border-border space-y-2">
                  <div className="font-mono text-xs font-bold text-primary flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>Summary</span>
                  </div>
                  <p className="text-foreground text-xs leading-relaxed">
                    {explainResponse.summary}
                  </p>
                </div>

                {explainResponse.stepByStep && (
                  <div className="p-3 rounded-xl bg-background border border-border space-y-1.5">
                    <div className="font-mono text-xs font-bold text-foreground">
                      Step-by-Step Execution:
                    </div>
                    <ul className="space-y-1 text-[11px] text-muted-foreground list-disc pl-4">
                      {explainResponse.stepByStep.map((step, idx) => (
                        <li key={idx}>{step}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* OPTIMIZE TAB */}
        {activeTab === 'optimize' && (
          <div className="space-y-3 text-xs">
            <button
              onClick={handleOptimize}
              disabled={loading}
              className="w-full py-2 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 font-semibold font-mono text-xs transition-colors"
            >
              {loading ? 'Optimizing Query...' : 'Analyze & Optimize Query'}
            </button>

            {optimizeResponse && (
              <div className="space-y-3 font-mono">
                <div className="p-3 rounded-xl bg-background border border-emerald-500/30 space-y-2">
                  <div className="text-xs font-bold text-emerald-400 flex items-center justify-between">
                    <span>Performance Gain</span>
                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px]">
                      {optimizeResponse.estimatedPerformanceGain}
                    </span>
                  </div>

                  {optimizeResponse.indexRecommendations && (
                    <div className="space-y-1 pt-1">
                      <div className="text-[10px] text-muted-foreground font-bold uppercase">
                        Recommended Index DDL:
                      </div>
                      {optimizeResponse.indexRecommendations.map((idxSql, i) => (
                        <div
                          key={i}
                          className="p-1.5 rounded bg-card border border-border text-emerald-400 text-[10px] overflow-x-auto"
                        >
                          {idxSql}
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    onClick={() => onApplySqlToEditor(optimizeResponse.optimizedSql)}
                    className="w-full mt-2 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-sans font-bold text-xs shadow transition-colors"
                  >
                    Apply Optimized Query
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
