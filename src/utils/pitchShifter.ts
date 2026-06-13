/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Time-stretches an AudioBuffer by stretchFactor (alpha) using Overlap-Add (OLA).
 * This preserves original pitch. When played back at rate = stretchFactor,
 * the duration matches the original EXACTLY, while the pitch is shifted by stretchFactor.
 */
export function stretchAudioBuffer(
  audioContext: AudioContext,
  inputBuffer: AudioBuffer,
  stretchFactor: number
): AudioBuffer {
  // Clamp stretchFactor to realistic limits to prevent CPU overload
  const alpha = Math.max(0.4, Math.min(2.5, stretchFactor));
  
  const numChannels = inputBuffer.numberOfChannels;
  const sampleRate = inputBuffer.sampleRate;
  const inputLength = inputBuffer.length;
  
  // Predict output length exactly
  const outputLength = Math.max(1, Math.round(inputLength * alpha));
  const outputBuffer = audioContext.createBuffer(numChannels, outputLength, sampleRate);

  const frameSize = 1024;
  const hopIn = 128; // 87.5% overlap (8x overlap) - dramatically smoothes window transitions and reduces robotic flanging
  const hopOut = Math.max(16, Math.round(hopIn * alpha));

  // Pre-generate Hann window to soften grain boundaries
  const window = new Float32Array(frameSize);
  for (let i = 0; i < frameSize; i++) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (frameSize - 1)));
  }

  // Process each channel independently
  for (let channel = 0; channel < numChannels; channel++) {
    const input = inputBuffer.getChannelData(channel);
    const output = outputBuffer.getChannelData(channel);

    const accum = new Float32Array(outputLength + frameSize);
    const accumWeight = new Float32Array(outputLength + frameSize);

    let inPos = 0;
    let outPos = 0;

    // Direct overlap-add looping
    while (inPos + frameSize < inputLength && outPos + frameSize < outputLength) {
      for (let i = 0; i < frameSize; i++) {
        const val = input[inPos + i];
        const w = window[i];
        accum[outPos + i] += val * w;
        accumWeight[outPos + i] += w * w;
      }

      inPos += hopIn;
      outPos += hopOut;
    }

    // Normalize overlapping windows to prevent flanging / volume variance
    for (let i = 0; i < outputLength; i++) {
      const weight = accumWeight[i];
      if (weight > 1e-4) {
        output[i] = accum[i] / weight;
      } else {
        output[i] = accum[i];
      }
      
      // Safety clip to prevent hardware digital distortion
      if (output[i] > 1.0) output[i] = 1.0;
      else if (output[i] < -1.0) output[i] = -1.0;
    }
  }

  return outputBuffer;
}

/**
 * Calculates the exact stretch ratio needed for a desired semitones pitch shift.
 */
export function semitonesToRatio(semitones: number): number {
  return Math.pow(2, semitones / 12);
}
