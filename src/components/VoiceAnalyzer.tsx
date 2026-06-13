/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SpeechAnalysis } from "../types";
import { Sparkles, Activity, Award, Compass, MessageSquareCode, Disc } from "lucide-react";
import { motion } from "motion/react";

interface VoiceAnalyzerProps {
  analysis: SpeechAnalysis | null;
  isLoading: boolean;
  onAnalyze: () => void;
  hasAudio: boolean;
}

export default function VoiceAnalyzer({
  analysis,
  isLoading,
  onAnalyze,
  hasAudio,
}: VoiceAnalyzerProps) {
  return (
    <div id="voice-analyzer" className="bg-slate-900/50 backdrop-blur-md rounded-2xl p-6 border border-slate-800 shadow-xl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-sans font-medium text-white tracking-tight">
              ИИ Анализ уникального стиля речи
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Gemini расшифрует ваши интонации, тембр и эмоциональные обертоны
          </p>
        </div>

        <button
          id="btn-analyze-speech"
          onClick={onAnalyze}
          disabled={!hasAudio || isLoading}
          className={`px-5 py-2.5 rounded-xl font-medium text-sm flex items-center gap-2 transition-all duration-300 ${
            !hasAudio
              ? "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/30"
              : isLoading
              ? "bg-indigo-600/30 text-indigo-300 cursor-not-allowed border border-indigo-500/20"
              : "bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white shadow-lg shadow-indigo-600/20 active:scale-95 border border-indigo-400/20"
          }`}
        >
          {isLoading ? (
            <>
              <div className="w-4 h-4 border-2 border-indigo-300 border-t-transparent rounded-full animate-spin" />
              <span>Нейросеть слушает...</span>
            </>
          ) : (
            <>
              <Activity className="w-4 h-4" />
              <span>Анализировать интонации</span>
            </>
          )}
        </button>
      </div>

      {!hasAudio && (
        <div className="border border-dashed border-slate-800 rounded-xl p-8 text-center bg-slate-950/20">
          <p className="text-sm text-slate-500 max-w-sm mx-auto">
            Оставьте аудиозапись выше, чтобы разблокировать глубокий акустический разбор вашего стиля речи искусственным интеллектом.
          </p>
        </div>
      )}

      {hasAudio && !analysis && !isLoading && (
        <div className="border border-slate-800 rounded-xl p-6 text-center bg-slate-950/10">
          <p className="text-sm text-slate-400 max-w-sm mx-auto">
            Ваше аудио успешно импортировано! Нажмите кнопку выше, чтобы ИИ прослушал ваши микро-интонации и построил голосовую модель.
          </p>
        </div>
      )}

      {isLoading && !analysis && (
        <div className="space-y-4 py-8 animate-pulse text-center">
          <Disc className="w-10 h-10 text-indigo-500 animate-spin mx-auto opacity-75" />
          <div className="space-y-2 max-w-xs mx-auto">
            <div className="h-3 bg-slate-800 rounded w-full"></div>
            <div className="h-2.5 bg-slate-800 rounded w-5/6 mx-auto"></div>
            <div className="h-2.5 bg-slate-800 rounded w-2/3 mx-auto"></div>
          </div>
        </div>
      )}

      {analysis && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="space-y-6"
        >
          {/* Transcription Display */}
          {analysis.transcription && (
            <div className="bg-indigo-950/15 p-4 rounded-xl border border-indigo-500/10">
              <span className="text-[10px] font-mono text-indigo-400 block mb-1">РАСПОЗНАННЫЙ ТЕКСТ (ТРАНСКРИПЦИЯ)</span>
              <p className="text-sm font-sans text-slate-200 italic leading-relaxed">
                "{analysis.transcription}"
              </p>
            </div>
          )}

          {/* Main stats matrix */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800/60">
              <span className="text-[10px] font-mono text-slate-500 block">ПСИХОЛОГИЧЕСКИЙ ВАЙБ</span>
              <span className="text-sm font-medium text-indigo-300 block mt-1">{analysis.vibe}</span>
            </div>

            <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800/60">
              <span className="text-[10px] font-mono text-slate-500 block">СКОРОСТЬ РЕЧИ (ТЕМП)</span>
              <span className="text-sm font-medium text-emerald-300 block mt-1">{analysis.tempo}</span>
            </div>

            <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800/60">
              <span className="text-[10px] font-mono text-slate-500 block">МЫШЕЧНЫЙ РЕГИСТР И ВЫСОТА</span>
              <span className="text-sm font-medium text-amber-300 block mt-1">{analysis.pitchDescription}</span>
            </div>

            <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800/60">
              <span className="text-[10px] font-mono text-slate-500 block">ВЫРАЗИТЕЛЬНОСТЬ РЕЧИ</span>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-lg font-bold text-sky-400">{analysis.expressionRating}</span>
                <span className="text-xs text-slate-500">/ 100</span>
                <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-sky-500 to-indigo-500" 
                    style={{ width: `${analysis.expressionRating}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* EQ Alignment details */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Advice column */}
            <div className="lg:col-span-7 bg-slate-950/20 p-5 rounded-xl border border-slate-800/50 space-y-4">
              <h3 className="text-sm font-medium text-slate-300 flex items-center gap-1.5">
                <Award className="w-4 h-4 text-emerald-400" />
                Индивидуальные вокальные особенности:
              </h3>
              <ul className="space-y-2.5 text-xs text-slate-300">
                {analysis.insights.map((insight, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 bg-slate-950/30 p-2.5 rounded-lg border border-slate-800/40">
                    <span className="text-emerald-400 font-mono mt-0.5">•</span>
                    <span>{insight}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Timbre Mapping column */}
            <div className="lg:col-span-5 space-y-4">
              <h3 className="text-sm font-medium text-slate-300 flex items-center gap-1.5">
                <Compass className="w-4 h-4 text-amber-400" />
                Как раскроются интонации при конверсии:
              </h3>
              
              <div className="space-y-3">
                <div className="bg-pink-950/10 p-3.5 rounded-xl border border-pink-500/10 hover:border-pink-500/20 transition-all">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="w-2 h-2 rounded-full bg-pink-500" />
                    <span className="text-xs font-semibold text-pink-300">В женском тембре (Приятный)</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {analysis.suggestions.female}
                  </p>
                </div>

                <div className="bg-sky-950/10 p-3.5 rounded-xl border border-sky-500/10 hover:border-sky-500/20 transition-all">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="w-2 h-2 rounded-full bg-sky-500" />
                    <span className="text-xs font-semibold text-sky-300">В мужском тембре (Уверенный)</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {analysis.suggestions.male}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
