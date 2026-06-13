/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from "react";

interface AudioVisualizerProps {
  audioBuffer: AudioBuffer | null;
  analyserNode: AnalyserNode | null;
  isRecording: boolean;
  isPlaying: boolean;
}

export default function AudioVisualizer({
  audioBuffer,
  analyserNode,
  isRecording,
  isPlaying,
}: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set high-resolution back-buffer (DPR)
    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    const draw = () => {
      if (!canvas || !ctx) return;
      const width = canvas.width / (window.devicePixelRatio || 1);
      const height = canvas.height / (window.devicePixelRatio || 1);

      // 1. CLEAR WITH SUBTLE BLUR EFFECT FOR MOTION TRAILS
      ctx.fillStyle = "rgba(10, 10, 14, 0.25)";
      ctx.fillRect(0, 0, width, height);

      // Draw subtle grid lines for sound studio vibe
      ctx.strokeStyle = "rgba(255, 255, 255, 0.02)";
      ctx.lineWidth = 1;
      for (let i = 0; i < width; i += 40) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, height);
        ctx.stroke();
      }
      for (let j = 0; j < height; j += 30) {
        ctx.beginPath();
        ctx.moveTo(0, j);
        ctx.lineTo(width, j);
        ctx.stroke();
      }

      // 2. RENDER REAL-TIME FREQUENCY OR OSCILLOSCOPE (DURING RECORDING/PLAYBACK)
      if (analyserNode && (isRecording || isPlaying)) {
        analyserNode.fftSize = 512;
        const bufferLength = analyserNode.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        if (isRecording) {
          // Oscilloscope time-domain wave for raw mic input
          analyserNode.getByteTimeDomainData(dataArray);
          ctx.beginPath();
          ctx.lineWidth = 3;
          ctx.strokeStyle = "#ef4444"; // Red for recording
          ctx.shadowBlur = 12;
          ctx.shadowColor = "#ef4444";

          const sliceWidth = width / bufferLength;
          let x = 0;

          for (let i = 0; i < bufferLength; i++) {
            const v = dataArray[i] / 128.0; // Normalized -1.0 to 1.0 around middle
            const y = (v * height) / 2;

            if (i === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
            x += sliceWidth;
          }
          ctx.lineTo(width, height / 2);
          ctx.stroke();
        } else {
          // Frequency Spectrum visualizer for playback
          analyserNode.getByteFrequencyData(dataArray);
          const barWidth = (width / bufferLength) * 1.5;
          let barHeight;
          let x = 0;

          ctx.shadowBlur = 8;
          ctx.shadowColor = "#3b82f6"; // Cyan-blue for playing

          for (let i = 0; i < bufferLength; i++) {
            barHeight = (dataArray[i] / 255) * (height * 0.85);

            // Create aesthetic blue-to-emerald gradient
            const gradient = ctx.createLinearGradient(0, height - barHeight, 0, height);
            gradient.addColorStop(0, "#38bdf8"); // Light blue
            gradient.addColorStop(0.5, "#3b82f6"); // Azure blue
            gradient.addColorStop(1, "#10b981"); // Emerald green

            ctx.fillStyle = gradient;
            ctx.fillRect(x, height - barHeight, barWidth - 1, barHeight);

            x += barWidth;
          }
        }
        
        // Reset shadow for subsequent draws
        ctx.shadowBlur = 0;
      } 
      // 3. RENDER STATIC CAPTURED WAVEFORM (AFTER RECORDING)
      else if (audioBuffer) {
        ctx.shadowBlur = 0;
        const data = audioBuffer.getChannelData(0);
        const step = Math.ceil(data.length / width);
        const amp = height / 2.2;

        ctx.fillStyle = "rgba(59, 130, 246, 0.03)";
        ctx.fillRect(0, 0, width, height);

        // Center line
        ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();

        // Waveform columns
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, "rgba(59, 130, 246, 0.85)"); // bright blue top
        gradient.addColorStop(0.5, "rgba(16, 185, 129, 0.9)"); // emerald green center
        gradient.addColorStop(1, "rgba(59, 130, 246, 0.85)"); // bright blue bottom

        ctx.lineWidth = 1.8;
        ctx.strokeStyle = gradient;

        for (let i = 0; i < width; i++) {
          let min = 1.0;
          let max = -1.0;
          for (let j = 0; j < step; j++) {
            const datum = data[i * step + j];
            if (datum < min) min = datum;
            if (datum > max) max = datum;
          }

          const yMin = (1 + min) * amp;
          const yMax = (1 + max) * amp;

          ctx.beginPath();
          ctx.moveTo(i, Math.max(2, yMin));
          ctx.lineTo(i, Math.min(height - 2, yMax));
          ctx.stroke();
        }
      } 
      // 4. IDLE STATE
      else {
        // Draw elegant pulsating grid dots in idle state
        const time = Date.now() * 0.001;
        const pulse = Math.sin(time * 2.5) * 5 + 10;
        
        ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
        ctx.beginPath();
        ctx.arc(width / 2, height / 2, pulse, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#94a3b8";
        ctx.font = "normal 12px JetBrains Mono, monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("СТУДИЯ ГОТОВА К ЗАПИСИ", width / 2, height / 2 + 35);
      }

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [audioBuffer, analyserNode, isRecording, isPlaying]);

  return (
    <div id="visualizer-container" className="relative w-full h-44 bg-slate-950 rounded-xl overflow-hidden border border-slate-800/80 shadow-inner">
      <canvas ref={canvasRef} className="w-full h-full block" />
      
      {/* Decorative HUD margins */}
      <div className="absolute top-3 left-3 flex items-center gap-1.5 font-mono text-[10px] text-slate-400 select-none">
        <span className={`w-1.5 h-1.5 rounded-full ${isRecording ? "bg-red-500 animate-ping" : isPlaying ? "bg-sky-400 animate-pulse" : "bg-slate-500"}`} />
        <span>STATUS: {isRecording ? "REC" : isPlaying ? "PLAYING" : "STANDBY"}</span>
      </div>

      <div className="absolute top-3 right-3 font-mono text-[10px] text-slate-500 select-none">
        CH_0 / PRE_GAIN: +0.0dB
      </div>
    </div>
  );
}
