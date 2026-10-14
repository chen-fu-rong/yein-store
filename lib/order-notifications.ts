export function playOrderNotificationChime() {
  if (typeof window === "undefined" || !window.AudioContext) return;

  let audioContext: AudioContext | null = null;
  try {
    audioContext = new window.AudioContext();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const startAt = audioContext.currentTime;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, startAt);
    oscillator.frequency.setValueAtTime(1174.66, startAt + 0.12);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.18, startAt + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.42);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.onended = () => {
      void audioContext?.close().catch(() => {});
    };
    oscillator.start(startAt);
    oscillator.stop(startAt + 0.44);
    void audioContext.resume().catch(() => {});
  } catch (error) {
    console.warn("Unable to play order notification chime:", error);
    if (audioContext) void audioContext.close().catch(() => {});
  }
}
