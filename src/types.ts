/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type VoiceMode = 'original' | 'female' | 'male' | 'custom';

export interface VoiceProfile {
  id: VoiceMode;
  name: string;
  emoji: string;
  pitchShift: number; // in semitones (e.g. +7.5 for female, -5 for male)
  eqBass: number; // in dB (low shelf below ~200Hz)
  eqTreble: number; // in dB (high shelf above ~4kHz)
  description: string;
  tag: string;
}

export interface SpeechAnalysis {
  transcription?: string;  // Распознанный текст речи пользователя
  tempo: string;           // Скорость речи (e.g. "Умеренная, ритмичная")
  dynamicRange: string;    // Динамический диапазон (e.g. "Выразительный, эмоциональный")
  expressionRating: number;// Оценка выразительности от 1 до 100
  pitchDescription: string;// Описание тембра и высоты (e.g. "Баритон средней высоты")
  vibe: string;            // Преобладающая эмоция (e.g. "Уверенный, доброжелательный")
  insights: string[];      // Индивидуальные советы и особенности
  suggestions: {
    female: string;        // Как тембр раскроется в женской версии
    male: string;          // Как тембр раскроется в мужской версии
  };
}
