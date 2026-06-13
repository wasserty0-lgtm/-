/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect, DragEvent, ChangeEvent } from "react";
import { 
  Mic, 
  Square, 
  Play, 
  Pause, 
  RotateCcw, 
  Download, 
  Upload, 
  Sliders, 
  Music, 
  Activity, 
  Volume2, 
  AlertCircle,
  Sparkles,
  Info
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

import { VoiceMode, VoiceProfile, SpeechAnalysis } from "./types";
import { stretchAudioBuffer, semitonesToRatio } from "./utils/pitchShifter";
import { audioBufferToWav } from "./utils/audioBufferToWav";
import AudioVisualizer from "./components/AudioVisualizer";
import VoiceAnalyzer from "./components/VoiceAnalyzer";

const VOICE_PROFILES: VoiceProfile[] = [
  {
    id: "original",
    name: "Оригинал",
    emoji: "👤",
    pitchShift: 0,
    eqBass: 0,
    eqTreble: 0,
    description: "Оригинальный голос без изменения частоты и обертонов.",
    tag: "1:1 Копия"
  },
  {
    id: "female",
    name: "Приятный женский",
    emoji: "👩",
    pitchShift: 6.8, // +6.8 semitones (about 1.48x shift)
    eqBass: -3.5,    // Reduce lower frequencies to cut heavy chest nodes
    eqTreble: 4.0,   // Boost high frequencies for a crisp, bright presence
    description: "Повышение высоты тона с вырезом бубнящих басов и добавлением воздушности в верхнем регистре.",
    tag: "Приятный тембр"
  },
  {
    id: "male",
    name: "Уверенный мужской",
    emoji: "👨",
    pitchShift: -4.5, // -4.5 semitones (about 0.77x shift)
    eqBass: 5.0,     // Substantial bass boost for a deep chest resonance
    eqTreble: -1.0,  // Smooth off excessive high hiss
    description: "Понижение тона с бархатным усилением низких частот для придания уверенного, глубокого мужского звучания.",
    tag: "Мужественный баритон"
  },
  {
    id: "custom",
    name: "Ручная настройка",
    emoji: "🎛️",
    pitchShift: 0,
    eqBass: 0,
    eqTreble: 0,
    description: "Полная свобода контроля: настройте высоту голоса и частотный спектр под особенности своего голоса.",
    tag: "Инструменты PRO"
  }
];

export default function App() {
  // Audio Context and Nodes
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const animFrameRef = useRef<number | null>(null);
  
  // Backing audio buffers
  const [originalBuffer, setOriginalBuffer] = useState<AudioBuffer | null>(null);
  const [processedBuffer, setProcessedBuffer] = useState<AudioBuffer | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingError, setProcessingError] = useState<string | null>(null);

  // Core configuration states
  const [activeProfile, setActiveProfile] = useState<VoiceMode>("original");
  const [pitchShift, setPitchShift] = useState<number>(0); // -12 to 12 semitones
  const [bassGain, setBassGain] = useState<number>(0); // -10 to 10 dB
  const [trebleGain, setTrebleGain] = useState<number>(0); // -10 to 10 dB
  const [volume, setVolume] = useState<number>(0.8); // 0 to 1

  // Recording timer
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const recordingTimerRef = useRef<number | null>(null);

  // Playback player states
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  
  const playStartTimeRef = useRef<number>(0);
  const playStartOffsetRef = useRef<number>(0); // in original seconds
  const playTimerRef = useRef<number | null>(null);
  
  // Real-time audio graphing
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const bassFilterNodeRef = useRef<BiquadFilterNode | null>(null);
  const trebleFilterNodeRef = useRef<BiquadFilterNode | null>(null);

  // Gemini speech AI analyser states
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [analysis, setAnalysis] = useState<SpeechAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);

  // TTS Blender & Mixing Deck states
  const [ttsBuffer, setTtsBuffer] = useState<AudioBuffer | null>(null);
  const [isGeneratingTts, setIsGeneratingTts] = useState<boolean>(false);
  const [ttsVoice, setTtsVoice] = useState<"Charon" | "Zephyr">("Charon"); // Charon = male, Zephyr = female
  const [textToSynthesize, setTextToSynthesize] = useState<string>("");
  
  // Custom Mixing Deck Volumes
  const [pitchedVolume, setPitchedVolume] = useState<number>(0.8); // 0 to 1
  const [ttsVolume, setTtsVolume] = useState<number>(0.8); // 0 to 1

  // Spatial Smoothing & Widener Node
  const [spatialSmoothing, setSpatialSmoothing] = useState<boolean>(true);

  // Background audio refs for simultaneous TTS playback
  const ttsSourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const ttsGainNodeRef = useRef<GainNode | null>(null);

  // Drag and drop states
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Initialize Web Audio block safely on demand
  const initAudioContext = (): AudioContext => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
        latencyHint: "interactive"
      });
    }
    if (audioContextRef.current.state === "suspended") {
      audioContextRef.current.resume();
    }
    return audioContextRef.current;
  };

  // Auto processing buffer lock: Triggered dynamically on slider / profile tweaks
  useEffect(() => {
    if (!originalBuffer) return;

    let selectedShift = pitchShift;
    let selectedBass = bassGain;
    let selectedTreble = trebleGain;

    // Apply profile presets directly unless custom
    if (activeProfile !== "custom") {
      const profile = VOICE_PROFILES.find((p) => p.id === activeProfile);
      if (profile) {
        selectedShift = profile.pitchShift;
        selectedBass = profile.eqBass;
        selectedTreble = profile.eqTreble;
        
        // Keep sliders visually synchronized with profile constants
        setPitchShift(profile.pitchShift);
        setBassGain(profile.eqBass);
        setTrebleGain(profile.eqTreble);
      }
    }

    const processAudio = async () => {
      setIsProcessing(true);
      setProcessingError(null);
      const ctx = initAudioContext();

      try {
        // If shift is flat, bypass OLA for pure rendering speed and high fidelity
        if (Math.abs(selectedShift) < 0.1) {
          setProcessedBuffer(originalBuffer);
        } else {
          // In stretch-and-resample pitch shifting, the stretch factor is pitchRatio itself
          const ratio = semitonesToRatio(selectedShift);
          const stretched = stretchAudioBuffer(ctx, originalBuffer, ratio);
          setProcessedBuffer(stretched);
        }
      } catch (err: any) {
        console.error("Audio block calculation failed:", err);
        setProcessingError("Ошибка алгоритма изменения тона.");
      } finally {
        setIsProcessing(false);
      }
    };

    // Debounce processing slightly if adjusting custom sliders rapidly
    const timeout = setTimeout(processAudio, activeProfile === "custom" ? 180 : 50);
    return () => clearTimeout(timeout);
  }, [originalBuffer, activeProfile, pitchShift, bassGain, trebleGain]);

  // Synchronize live Web Audio Nodes equalizer parameter changes immediately during active playback
  useEffect(() => {
    if (bassFilterNodeRef.current) {
      bassFilterNodeRef.current.gain.setValueAtTime(bassGain, audioContextRef.current?.currentTime || 0);
    }
  }, [bassGain]);

  useEffect(() => {
    if (trebleFilterNodeRef.current) {
      trebleFilterNodeRef.current.gain.setValueAtTime(trebleGain, audioContextRef.current?.currentTime || 0);
    }
  }, [trebleGain]);

  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.setValueAtTime(volume * pitchedVolume, audioContextRef.current?.currentTime || 0);
    }
    if (ttsGainNodeRef.current) {
      ttsGainNodeRef.current.gain.setValueAtTime(volume * ttsVolume, audioContextRef.current?.currentTime || 0);
    }
  }, [volume, pitchedVolume, ttsVolume]);

  // Track recording stopwatch duration
  useEffect(() => {
    if (isRecording) {
      setRecordingSeconds(0);
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    }
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, [isRecording]);

  // Synchronized Player Clock update
  useEffect(() => {
    if (isPlaying && duration > 0) {
      const ratio = semitonesToRatio(pitchShift);
      const currentRate = Math.abs(pitchShift) < 0.1 ? 1.0 : ratio;

      const updateClock = () => {
        const elapsed = playStartOffsetRef.current + ((Date.now() - playStartTimeRef.current) / 1000) * currentRate;
        
        if (elapsed >= duration) {
          // Playback reached end
          stopPlayback();
          setCurrentTime(duration);
        } else {
          setCurrentTime(elapsed);
          playTimerRef.current = requestAnimationFrame(updateClock);
        }
      };
      playTimerRef.current = requestAnimationFrame(updateClock);
    } else {
      if (playTimerRef.current) {
        cancelAnimationFrame(playTimerRef.current);
        playTimerRef.current = null;
      }
    }

    return () => {
      if (playTimerRef.current) cancelAnimationFrame(playTimerRef.current);
    };
  }, [isPlaying, duration, pitchShift]);

  // Helper: Decode uploaded or recorded Blob into raw AudioBuffer
  const decodeAudioBlob = async (blob: Blob) => {
    setAudioBlob(blob);
    setIsProcessing(true);
    setProcessingError(null);
    const ctx = initAudioContext();

    try {
      const arrayBuffer = await blob.arrayBuffer();
      // Decode audio in safe thread
      const decodedBuffer = await ctx.decodeAudioData(arrayBuffer);
      setOriginalBuffer(decodedBuffer);
      setProcessedBuffer(decodedBuffer);
      setDuration(decodedBuffer.duration);
      setCurrentTime(0);
      playStartOffsetRef.current = 0;
      setAnalysis(null); // Clear previous voice report of old track
    } catch (err: any) {
      console.error("Audio binary decoding error:", err);
      setProcessingError("Не удалось прочесть аудиофайл. Попробуйте другой формат (.wav, .mp3).");
    } finally {
      setIsProcessing(false);
    }
  };

  // --- RECORDING CONTROLS ---
  const startRecording = async () => {
    try {
      const ctx = initAudioContext();
      stopPlayback();
      setOriginalBuffer(null);
      setProcessedBuffer(null);
      setAudioBlob(null);
      setAnalysis(null);
      setDuration(0);
      setCurrentTime(0);
      playStartOffsetRef.current = 0;

      // Access User mic
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Bind analyzer for real-time wave graph during recording
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      source.connect(analyser);
      setAnalyserNode(analyser);

      // Setup recorder
      audioChunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/ogg")
        ? "audio/ogg"
        : "audio/mp4";

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const recordedBlob = new Blob(audioChunksRef.current, { type: mimeType });
        await decodeAudioBlob(recordedBlob);
        
        // Clean stream tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }
      };

      recorder.start();
      setIsRecording(true);
    } catch (err: any) {
      console.error("Failed to fetch microphone feed:", err);
      alert("Не удалось запустить микрофон. Проверьте разрешения в настройках.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // --- PLAYBACK ENGINE ---
  const startPlayback = () => {
    const ctx = initAudioContext();
    
    // Stop any running sources first
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.stop(); } catch (e) {}
      sourceNodeRef.current = null;
    }
    if (ttsSourceNodeRef.current) {
      try { ttsSourceNodeRef.current.stop(); } catch (e) {}
      ttsSourceNodeRef.current = null;
    }

    // Prepare master live spectrum analyzer so both streams merge into it
    const masterAnalyser = ctx.createAnalyser();
    masterAnalyser.smoothingTimeConstant = 0.78;
    setAnalyserNode(masterAnalyser);

    let startedAny = false;

    // 1. Setup and play original pitch-shifted audio
    if (processedBuffer && pitchedVolume > 0.0) {
      const source = ctx.createBufferSource();
      source.buffer = processedBuffer;

      // Apply relative rate shift based on pitch ratio to restore original duration
      const currentRate = Math.abs(pitchShift) < 0.1 ? 1.0 : semitonesToRatio(pitchShift);
      source.playbackRate.value = currentRate;

      // Build standard high-performance DB equalizer node graph
      const bassFilter = ctx.createBiquadFilter();
      bassFilter.type = "lowshelf";
      bassFilter.frequency.value = 200; // Bass bands below 200Hz
      bassFilter.gain.value = bassGain;

      const trebleFilter = ctx.createBiquadFilter();
      trebleFilter.type = "highshelf";
      trebleFilter.frequency.value = 4000; // Treble bands above 4000Hz
      trebleFilter.gain.value = trebleGain;

      const gainNode = ctx.createGain();
      gainNode.gain.value = volume * pitchedVolume;

      // Connect source to DSP nodes
      source.connect(bassFilter);
      bassFilter.connect(trebleFilter);

      // HAAS EFFECT Spatial Chorus / Smoothing: splits and parallel delays the signal to counter phase/metallic buzzing
      if (spatialSmoothing) {
        const delayNode = ctx.createDelay(1.0);
        delayNode.delayTime.value = 0.022; // 22ms is optimal for a thick, natural-sounding chorused vocal
        const delayGain = ctx.createGain();
        delayGain.gain.value = 0.5; // robust blend level

        source.connect(delayNode);
        delayNode.connect(delayGain);
        delayGain.connect(trebleFilter);
      }

      trebleFilter.connect(gainNode);
      gainNode.connect(masterAnalyser);

      sourceNodeRef.current = source;
      gainNodeRef.current = gainNode;
      bassFilterNodeRef.current = bassFilter;
      trebleFilterNodeRef.current = trebleFilter;

      const startOffsetInStretchedSeconds = currentTime * currentRate;
      try {
        source.start(0, startOffsetInStretchedSeconds);
        startedAny = true;
      } catch (e: any) {
        console.error("Failed to start pitched voice source node:", e);
      }
    }

    // 2. Setup and play synthesized clear TTS voice layer speaking the same text
    if (ttsBuffer && ttsVolume > 0.0) {
      const ttsSource = ctx.createBufferSource();
      ttsSource.buffer = ttsBuffer;

      const ttsGainNode = ctx.createGain();
      ttsGainNode.gain.value = volume * ttsVolume;

      ttsSource.connect(ttsGainNode);
      ttsGainNode.connect(masterAnalyser);

      ttsSourceNodeRef.current = ttsSource;
      ttsGainNodeRef.current = ttsGainNode;

      // Calculate approximate TTS offset proportional to the main scrubber position
      const elapsedPercent = duration > 0 ? (currentTime / duration) : 0;
      const ttsStartOffset = elapsedPercent * ttsBuffer.duration;

      try {
        if (ttsStartOffset < ttsBuffer.duration) {
          ttsSource.start(0, ttsStartOffset);
          startedAny = true;
        }
      } catch (e) {
        console.error("Failed to start TTS playback source:", e);
      }
    }

    if (startedAny) {
      masterAnalyser.connect(ctx.destination);
      playStartTimeRef.current = Date.now();
      playStartOffsetRef.current = currentTime;
      setIsPlaying(true);
    }
  };

  const pausePlayback = () => {
    if (isPlaying) {
      if (sourceNodeRef.current) {
        try { sourceNodeRef.current.stop(); } catch (e) {}
        sourceNodeRef.current = null;
      }
      if (ttsSourceNodeRef.current) {
        try { ttsSourceNodeRef.current.stop(); } catch (e) {}
        ttsSourceNodeRef.current = null;
      }
      setIsPlaying(false);
      
      // Save current timestamp
      const currentRate = Math.abs(pitchShift) < 0.1 ? 1.0 : semitonesToRatio(pitchShift);
      const elapsed = playStartOffsetRef.current + ((Date.now() - playStartTimeRef.current) / 1000) * currentRate;
      setCurrentTime(Math.min(elapsed, duration));
    }
  };

  const stopPlayback = () => {
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.stop(); } catch (e) {}
      sourceNodeRef.current = null;
    }
    if (ttsSourceNodeRef.current) {
      try { ttsSourceNodeRef.current.stop(); } catch (e) {}
      ttsSourceNodeRef.current = null;
    }
    setIsPlaying(false);
    setCurrentTime(0);
    playStartOffsetRef.current = 0;
  };

  // Scrubber drag seeking
  const handleSeek = (value: number) => {
    const wasPlaying = isPlaying;
    if (isPlaying) {
      pausePlayback();
    }
    setCurrentTime(value);
    playStartOffsetRef.current = value;
    if (wasPlaying) {
      // Resume playing instantly post seek release
      setTimeout(() => {
        setCurrentTime(value);
        playStartOffsetRef.current = value;
        startPlayback();
      }, 50);
    }
  };

  // Reset audio to initial virgin state
  const handleReset = () => {
    stopPlayback();
    setOriginalBuffer(null);
    setProcessedBuffer(null);
    setTtsBuffer(null);
    setAudioBlob(null);
    setAnalysis(null);
    setDuration(0);
    setCurrentTime(0);
    playStartOffsetRef.current = 0;
    setActiveProfile("original");
    setPitchShift(0);
    setBassGain(0);
    setTrebleGain(0);
    setTextToSynthesize("");
  };

  // --- COMPILING FILE DOWNLOAD ---
  const handleDownloadWav = () => {
    if (!processedBuffer) return;

    try {
      const wavBlob = audioBufferToWav(processedBuffer);
      const url = URL.createObjectURL(wavBlob);
      const link = document.createElement("a");
      link.href = url;
      
      // Descriptive native-named audio record downloads
      const fileSuffix = activeProfile === "female" ? "женский_тембр" : activeProfile === "male" ? "мужской_тембр" : "измененный";
      link.download = `голос_${fileSuffix}.wav`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert("Не удалось экспортировать файл: " + e.message);
    }
  };

  // --- GEMINI REST API INTEGRATION ---
  const handleAnalyzeSpeech = async () => {
    if (!audioBlob) return;
    setIsAnalyzing(true);
    setAnalysis(null);

    try {
      // Transform audio record Blob into raw base64 string
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = async () => {
        const base64data = reader.result as string;
        // Trim standard dataUrl prefix to feed pure binary base64
        const rawBase64 = base64data.split(",")[1];

        const response = await fetch("/api/analyze-voice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            audioBase64: rawBase64,
            mimeType: audioBlob.type
          })
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || "Failed communication with Gemini");
        }

        const speechReport: SpeechAnalysis = await response.json();
        setAnalysis(speechReport);
        if (speechReport.transcription) {
          setTextToSynthesize(speechReport.transcription);
        }
      };
    } catch (err: any) {
      console.error("AI Analysis process crashed:", err);
      alert(err.message || "Ошибка подключения к ИИ-серверу аналитики. Пожалуйста, попробуйте другую фразу.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleGenerateTts = async () => {
    if (!textToSynthesize) return;
    setIsGeneratingTts(true);
    setProcessingError(null);

    try {
      const response = await fetch("/api/generate-tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: textToSynthesize,
          voiceName: ttsVoice
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed speech synthesis");
      }

      const { base64Audio } = await response.json();
      
      const binaryString = atob(base64Audio);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const ctx = initAudioContext();
      const decodedBuffer = await ctx.decodeAudioData(bytes.buffer);
      setTtsBuffer(decodedBuffer);
      
      if (!originalBuffer) {
        setDuration(decodedBuffer.duration);
      }
    } catch (err: any) {
      console.error("Synthesizing speech failed:", err);
      setProcessingError("Не удалось выполнить высококачественный синтез: " + err.message);
    } finally {
      setIsGeneratingTts(false);
    }
  };

  // --- FILE DRAG & DROP HANDLERS ---
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type.startsWith("audio/")) {
        await decodeAudioBlob(file);
      } else {
        alert("Пожалуйста, загрузите аудиозапись (wav, mp3, m4a, ogg, webm).");
      }
    }
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await decodeAudioBlob(files[0]);
    }
  };

  // Time formatter companion
  const formatTime = (secs: number) => {
    const mm = Math.floor(secs / 60);
    const ss = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 10);
    return `${mm}:${ss < 10 ? "0" : ""}${ss}.${ms}`;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-indigo-500/20 antialiased">
      
      {/* Top Professional Header */}
      <header className="border-b border-slate-900/80 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50 px-6 py-4">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-sky-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-600/10">
              <Sliders className="w-5 h-5 text-white animate-pulse" />
            </div>
            <div>
              <h1 className="text-md sm:text-lg font-sans font-medium text-white tracking-tight flex items-center gap-2">
                Voice Pitch Transformer
                <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/10">
                  v2.0 Full-Stack
                </span>
              </h1>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Инструмент преобразования исходной высоты голоса в женские и мужские тембры
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono text-slate-500 select-none">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>CORE_NODE: ONLINE</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Console Workspace */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Side: Audio record & deck controllers */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          
          {/* Card: Audio Capture Dashboard */}
          <div className="bg-slate-900/40 backdrop-blur-md rounded-2xl p-6 border border-slate-800 shadow-xl space-y-5">
            <div className="flex justify-between items-center border-b border-slate-800/60 pb-3">
              <h2 className="text-sm font-sans font-semibold text-slate-200 tracking-wide flex items-center gap-2">
                <Mic className="w-4 h-4 text-indigo-400" />
                ИСТОЧНИК ГОЛОСА
              </h2>
              {originalBuffer && (
                <button
                  id="btn-reset-audio"
                  onClick={handleReset}
                  className="text-xs font-sans text-slate-400 hover:text-red-400 flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Сбросить дорожку
                </button>
              )}
            </div>

            {/* Display Visualizer HUD */}
            <AudioVisualizer
              audioBuffer={originalBuffer}
              analyserNode={analyserNode}
              isRecording={isRecording}
              isPlaying={isPlaying}
            />

            {/* Drag & Drop Upload Space or Audio capture state */}
            {!originalBuffer && !isRecording ? (
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border border-dashed rounded-xl p-8 transition-all duration-300 text-center flex flex-col items-center justify-center ${
                  isDragging
                    ? "border-sky-400 bg-sky-950/20 bg-opacity-10 scale-[0.99] shadow-lg shadow-sky-500/10"
                    : "border-slate-800 bg-slate-950/20 hover:border-slate-700 hover:bg-slate-950/40"
                }`}
              >
                <Upload className="w-8 h-8 text-slate-500 mb-3" />
                <p className="text-sm text-slate-300 font-medium font-sans">
                  Перетащите сюда аудиофайл или запустите запись
                </p>
                <p className="text-[11px] text-slate-500 mt-1 mb-4">
                  Поддерживаются WAV, MP3, M4A, WEBM
                </p>
                
                <div id="dropzone-actions" className="flex flex-col sm:flex-row items-center gap-3 w-full max-w-md justify-center">
                  <button
                    id="btn-record"
                    onClick={startRecording}
                    className="w-full sm:w-auto px-5 py-2.5 bg-red-600 hover:bg-red-500 hover:shadow-lg hover:shadow-red-500/10 active:bg-red-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all duration-300 active:scale-95 border border-red-500/20 cursor-pointer"
                  >
                    <Mic className="w-4 h-4 animate-pulse" />
                    Запись микрофона
                  </button>

                  <label className="w-full sm:w-auto px-5 py-2.5 bg-slate-800 hover:bg-slate-700 active:bg-slate-900 border border-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all duration-300 active:scale-95 cursor-pointer">
                    <Music className="w-4 h-4" />
                    <span>Выбрать аудио</span>
                    <input
                      type="file"
                      accept="audio/*"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            ) : isRecording ? (
              <div className="bg-red-950/10 border border-red-500/20 rounded-xl p-6 text-center space-y-4">
                <div className="flex justify-center items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-red-500 animate-ping" />
                  <span className="text-2xl font-mono text-red-400 font-bold tracking-tight">
                    {formatTime(recordingSeconds)}
                  </span>
                </div>
                <p className="text-xs text-slate-300">
                  Запись идет... Скажите короткую фразу своим обычным стилем.
                </p>
                <button
                  id="btn-stop-record"
                  onClick={stopRecording}
                  className="mx-auto px-6 py-2.5 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition-all duration-300 shadow-lg shadow-red-500/20 active:scale-95 cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5 fill-white" />
                  Остановить запись
                </button>
              </div>
            ) : (
              /* Decoded buffer layout / Player Controls list */
              <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800/60 transition-all">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                      <Music className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div>
                      <h4 className="text-xs font-sans font-medium text-slate-200">Ваша голосовая волна</h4>
                      <div className="flex items-center gap-1.5 mt-0.5 text-[10px] font-mono text-slate-500">
                        <span>Длительность: {formatTime(duration)}</span>
                        <span>•</span>
                        <span>Частота: {originalBuffer ? originalBuffer.sampleRate : 44100}Гц</span>
                      </div>
                    </div>
                  </div>

                  {/* Play & Pause actions */}
                  <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                    <button
                      id="btn-play"
                      onClick={isPlaying ? pausePlayback : startPlayback}
                      disabled={isProcessing}
                      className={`h-9 w-9 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                        isPlaying 
                          ? "bg-amber-600 hover:bg-amber-500 text-white" 
                          : "bg-indigo-600 hover:bg-indigo-500 text-white"
                      } active:scale-95 disabled:bg-slate-800 disabled:text-slate-500`}
                    >
                      {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 translate-x-0.5" />}
                    </button>

                    <button
                      id="btn-stop-playback"
                      onClick={stopPlayback}
                      disabled={isProcessing}
                      className="h-9 w-9 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 active:scale-95 flex items-center justify-center cursor-pointer"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>

                    <button
                      id="btn-download"
                      onClick={handleDownloadWav}
                      disabled={isProcessing}
                      title="Скачать WAV"
                      className="h-9 px-3 gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-sans text-xs font-medium active:scale-95 flex items-center justify-center cursor-pointer disabled:bg-slate-800 disabled:text-slate-500"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Скачать WAV
                    </button>
                  </div>
                </div>

                {/* Timeline slide controller */}
                <div className="mt-4 space-y-1">
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={0}
                      max={duration || 1}
                      step={0.05}
                      value={currentTime}
                      onChange={(e) => handleSeek(parseFloat(e.target.value))}
                      className="flex-1 accent-indigo-500 h-1 bg-slate-800 rounded-lg cursor-pointer leading-none"
                    />
                  </div>
                  <div className="flex justify-between font-mono text-[10px] text-slate-500 pt-1">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Voice Speech AI expansion (Full-Stack endpoint) */}
          <VoiceAnalyzer
            analysis={analysis}
            isLoading={isAnalyzing}
            onAnalyze={handleAnalyzeSpeech}
            hasAudio={!!audioBlob && !isRecording}
          />
        </div>

        {/* Right Side: Pitch Presets & Advanced EQ panel */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          
          {/* Preset Selectors */}
          <div className="bg-slate-900/40 backdrop-blur-md rounded-2xl p-6 border border-slate-800 shadow-xl space-y-4">
            <h2 className="text-sm font-sans font-semibold text-slate-200 border-b border-slate-800 pb-2 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-emerald-400" />
              РЕЖИМЫ ТЕМБРА
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {VOICE_PROFILES.map((profile) => {
                const isSelected = activeProfile === profile.id;
                return (
                  <button
                    key={profile.id}
                    onClick={() => {
                      setActiveProfile(profile.id);
                      if (profile.id !== "custom") {
                        setPitchShift(profile.pitchShift);
                        setBassGain(profile.eqBass);
                        setTrebleGain(profile.eqTreble);
                      }
                    }}
                    className={`p-4 rounded-xl text-left transition-all duration-300 border flex flex-col justify-between hover:scale-[1.01] active:scale-[0.99] cursor-pointer ${
                      isSelected
                        ? "bg-indigo-600/10 border-indigo-500/80 shadow-md shadow-indigo-600/5 text-slate-100"
                        : "bg-slate-950/30 border-slate-800/80 text-slate-400 hover:text-slate-200 hover:border-slate-700/60"
                    }`}
                  >
                    <div className="flex justify-between items-start w-full">
                      <span className="text-2xl mb-2">{profile.emoji}</span>
                      <span className={`text-[9px] font-mono font-medium px-2 py-0.5 rounded-full ${
                        isSelected 
                          ? "bg-indigo-500/20 text-indigo-300" 
                          : "bg-slate-800/60 text-slate-500"
                      }`}>
                        {profile.tag}
                      </span>
                    </div>
                    <div>
                      <h3 className="text-sm font-sans font-medium text-slate-200">
                        {profile.name}
                      </h3>
                      <p className="text-[10px] text-slate-400 mt-1 leading-normal line-clamp-2">
                        {profile.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Slider calibration boards */}
          <div className="bg-slate-900/40 backdrop-blur-md rounded-2xl p-6 border border-slate-800 shadow-xl space-y-5">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <h2 className="text-sm font-sans font-semibold text-slate-200 flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-sky-400" />
                ПАРАМЕТРЫ СИГНАЛА
              </h2>
              {activeProfile !== "custom" && (
                <span className="text-[10px] font-mono text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/5">
                  Режим автокоррекции
                </span>
              )}
            </div>

            {/* Slider 1: Pitch Shift (semitones) */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-medium text-slate-300">Высота голоса (Полутона)</span>
                <span className={`font-mono text-[11px] font-semibold px-2 py-0.5 rounded ${
                  pitchShift > 0 
                    ? "bg-pink-500/10 text-pink-300" 
                    : pitchShift < 0 
                    ? "bg-sky-500/10 text-sky-300" 
                    : "bg-slate-800 text-slate-400"
                }`}>
                  {pitchShift > 0 ? `+${pitchShift.toFixed(1)}` : pitchShift.toFixed(1)} полутонов
                </span>
              </div>
              <input
                type="range"
                min={-12}
                max={12}
                step={0.5}
                value={pitchShift}
                disabled={activeProfile !== "custom"}
                onChange={(e) => setPitchShift(parseFloat(e.target.value))}
                className="w-full accent-indigo-500 h-1 bg-slate-800 rounded-lg cursor-pointer disabled:opacity-50"
              />
              <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                <span>Бас (-12)</span>
                <span>Оригинал (0)</span>
                <span>Высота (+12)</span>
              </div>
            </div>

            {/* Slider 2: Bass EQ */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-medium text-slate-300">Глубина / Бас (200Гц)</span>
                <span className="text-slate-400 font-mono text-[11px]">
                  {bassGain > 0 ? `+${bassGain.toFixed(1)}` : bassGain.toFixed(1)} дБ
                </span>
              </div>
              <input
                type="range"
                min={-10}
                max={10}
                step={0.5}
                value={bassGain}
                disabled={activeProfile !== "custom"}
                onChange={(e) => setBassGain(parseFloat(e.target.value))}
                className="w-full accent-emerald-500 h-1 bg-slate-800 rounded-lg cursor-pointer disabled:opacity-50"
              />
            </div>

            {/* Slider 3: Treble EQ */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-medium text-slate-300">Воздушность / Высокие (4кГц)</span>
                <span className="text-slate-400 font-mono text-[11px]">
                  {trebleGain > 0 ? `+${trebleGain.toFixed(1)}` : trebleGain.toFixed(1)} дБ
                </span>
              </div>
              <input
                type="range"
                min={-10}
                max={10}
                step={0.5}
                value={trebleGain}
                disabled={activeProfile !== "custom"}
                onChange={(e) => setTrebleGain(parseFloat(e.target.value))}
                className="w-full accent-sky-500 h-1 bg-slate-800 rounded-lg cursor-pointer disabled:opacity-50"
              />
            </div>

            {/* Slider 4: Volume */}
            <div className="space-y-2 pt-3 border-t border-slate-800/60">
              <div className="flex justify-between items-center text-xs">
                <span className="font-medium text-slate-300 flex items-center gap-1.5">
                  <Volume2 className="w-3.5 h-3.5" />
                  Громкость монитора
                </span>
                <span className="text-slate-400 font-mono text-[11px]">
                  {Math.round(volume * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1.2}
                step={0.05}
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="w-full accent-indigo-500 h-1 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>

            {/* Spatial Chorus Smoothing Toggle */}
            <div className="space-y-2 pt-3 border-t border-slate-800/60">
              <label className="flex items-center justify-between text-xs font-sans text-slate-300 cursor-pointer select-none">
                <span className="flex items-center gap-1.5 font-medium">
                  <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                  Убрать роботический скрежет (Хорус)
                </span>
                <input
                  type="checkbox"
                  checked={spatialSmoothing}
                  onChange={(e) => setSpatialSmoothing(e.target.checked)}
                  className="w-4 h-4 rounded accent-indigo-500 cursor-pointer"
                />
              </label>
              <p className="text-[10px] text-slate-400 leading-normal">
                Раздваивает аудио по фазе на 22мс (эффект Хааса). Сглаживает зернистые артефакты и придает голосу мягкий студийный объем.
              </p>
            </div>

            {/* Tip box */}
            {activeProfile !== "custom" && (
              <div className="bg-indigo-950/20 rounded-lg p-3 text-[11px] text-slate-400 border border-indigo-500/10 flex items-start gap-2.5">
                <Info className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  Параметры заблокированы пресетом <strong>{VOICE_PROFILES.find((p) => p.id === activeProfile)?.name}</strong>. Выберите <strong>Ручную настройку</strong> для свободного управления частотами.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Dynamic Processing Status Banner */}
      <AnimatePresence>
        {isProcessing && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-6 right-6 z-50 bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-2xl flex items-center gap-3 w-80"
          >
            <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <div>
              <p className="text-xs font-semibold text-slate-200">Перерасчет звуковой волны...</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Применяются алгоритмы фазового ресемплирования</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Rendering Errors Banner */}
      <AnimatePresence>
        {processingError && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-6 left-6 right-6 sm:left-auto sm:right-6 z-50 bg-red-950/90 border border-red-800 p-4 rounded-xl shadow-2xl flex items-start gap-3 max-w-sm"
          >
            <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-semibold text-slate-200">Ошибка обработки звука</p>
              <p className="text-[10px] text-red-300 mt-1 leading-normal">{processingError}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Humble Footer */}
      <footer className="border-t border-slate-900/80 bg-slate-950 px-6 py-4">
        <p className="text-[10px] text-slate-600 font-mono text-center">
          COGNITIVE SOUND LAB • COMPRESSED VOCAL CONVERSION PROCESS • RUNS LOCAL OFFLINE RESAMPLING
        </p>
      </footer>
    </div>
  );
}
