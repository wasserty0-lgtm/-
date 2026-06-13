/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

// Initialize Google Gen AI SDK
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Let express accept larger JSON payloads since we upload audio base64 clips
  app.use(express.json({ limit: "15mb" }));

  // API endpoint for voice style and intonation analysis
  app.post("/api/analyze-voice", async (req, res) => {
    try {
      const { audioBase64, mimeType } = req.body;
      if (!audioBase64) {
        return res.status(400).json({ error: "Аудиозапись не получена." });
      }

      // Convert body fields to the payload part
      const audioPart = {
        inlineData: {
          mimeType: mimeType || "audio/webm",
          data: audioBase64,
        },
      };

      const prompt = `
        Ты — профессиональный вокальный тренер, эксперт по акустике и анализу речи.
        Прослушай эту аудиозапись голоса пользователя.
        Проанализируй его уникальный тембр, ритм, стиль речи, интонацию и эмоциональную уверенность.
        Составь честный, позитивный и профессиональный акустический отчет строго на русском языке в формате структуры JSON.
        Обрати внимание на то, как человек держится, его темп, стабильность высоты тона. Напиши практические рекомендации для развития его дикции.
        Также обязательно расшифруй слова пользователя из этой аудиозаписи дословно на языке оригинала (в поле transcription), сохранив все сказанные слова.
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [audioPart, prompt],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              transcription: {
                type: Type.STRING,
                description: "Дословная текстовая расшифровка (транскрипция) речи из аудиозаписи на языке оригинала."
              },
              tempo: {
                type: Type.STRING,
                description: "Скорость речи говорящего (например: 'Размеренная, спокойная', 'Драматически быстрая' и др.)"
              },
              dynamicRange: {
                type: Type.STRING,
                description: "Диапазон громкости и выразительности голоса (например: 'Широкий, эмоционально богатый', 'Сдержанный, ровный')"
              },
              expressionRating: {
                type: Type.INTEGER,
                description: "Общая выразительность речевых интонаций (число от 1 до 100)"
              },
              pitchDescription: {
                type: Type.STRING,
                description: "Высотное описание тембра (например: 'Мягкий грудной баритон', 'Высокий звонкий сопрано-тон')"
              },
              vibe: {
                type: Type.STRING,
                description: "Общий психологический вайб речи (например: 'Серьезный, деловой', 'Заботливый, дружелюбный, теплый')"
              },
              insights: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Индивидуальные советы и полезные наблюдения за его речью (от 3 до 5 пунктов)"
              },
              suggestions: {
                type: Type.OBJECT,
                properties: {
                  female: {
                    type: Type.STRING,
                    description: "Как этот стиль речи раскроется в ласковом приятном женском звуке при повышении тона"
                  },
                  male: {
                    type: Type.STRING,
                    description: "Как этот стиль речи зазвучит в глубоком уверенном мужском голосе при понижении тона"
                  }
                },
                required: ["female", "male"]
              }
            },
            required: [
              "transcription",
              "tempo",
              "dynamicRange",
              "expressionRating",
              "pitchDescription",
              "vibe",
              "insights",
              "suggestions"
            ]
          }
        }
      });

      const textOutput = response.text;
      if (!textOutput) {
        throw new Error("Пустой ответ от Gemini модели при анализе голоса");
      }

      res.setHeader("Content-Type", "application/json");
      res.send(textOutput);
    } catch (error: any) {
      console.error("Gemini speech analysis failed:", error);
      res.status(500).json({ 
        error: "Не удалось получить аудио-анализ от ИИ. Убедитесь, что запись содержит различимый голос." 
      });
    }
  });

  // API endpoint for professional high-fidelity TTS generation using gemini-3.1-flash-tts-preview
  app.post("/api/generate-tts", async (req, res) => {
    try {
      const { text, voiceName } = req.body;
      if (!text) {
        return res.status(400).json({ error: "Текст для синтеза пуст." });
      }

      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-tts-preview",
        contents: [{ parts: [{ text: text }] }],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voiceName || "Zephyr" },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        throw new Error("От модели Gemini TTS не получены аудиоданные.");
      }

      res.json({ base64Audio });
    } catch (error: any) {
      console.error("Gemini TTS failed:", error);
      res.status(500).json({ 
        error: "Не удалось выполнить высокоточный синтез речи: " + error.message 
      });
    }
  });

  // Health check route
  app.get("/api/health", (req, res) => {
    res.json({ status: "alive" });
  });

  // Serve frontend files & hot code loading in development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server launched and running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
