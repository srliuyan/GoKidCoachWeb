type BrowserAudioContext = typeof AudioContext;

type WindowWithWebkitAudio = Window & {
  webkitAudioContext?: BrowserAudioContext;
};

let audioContext: AudioContext | null = null;
let lastPlayedAt = 0;

export function playStoneSound(captured = 0): void {
  const context = getAudioContext();
  if (!context) return;

  void context.resume().then(() => {
    const now = context.currentTime;
    if (now - lastPlayedAt < 0.045) return;
    lastPlayedAt = now;

    const volume = captured > 0 ? 0.16 : 0.11;
    playClickTone(context, now, volume);
    playBoardTap(context, now, volume);
  }).catch(() => {
    audioContext = null;
  });
}

export function playTreefrogSound(): void {
  const context = getAudioContext();
  if (!context) return;

  void context.resume().then(() => {
    const now = context.currentTime;
    playCroak(context, now, 0.2);
    playCroak(context, now + 0.34, 0.18);
  }).catch(() => {
    audioContext = null;
  });
}

export function playCaptureChompSound(kind: 'dinosaur' | 'frog'): void {
  const context = getAudioContext();
  if (!context) return;

  void context.resume().then(() => {
    const now = context.currentTime;
    if (kind === 'frog') {
      playCroak(context, now, 0.13);
      return;
    }
    playDinosaurChomp(context, now, 0.16);
  }).catch(() => {
    audioContext = null;
  });
}

function getAudioContext(): AudioContext | null {
  if (audioContext) return audioContext;
  const AudioContextCtor = window.AudioContext ?? (window as WindowWithWebkitAudio).webkitAudioContext;
  if (!AudioContextCtor) return null;
  try {
    audioContext = new AudioContextCtor();
    return audioContext;
  } catch {
    return null;
  }
}

function playClickTone(context: AudioContext, startAt: number, volume: number): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(780, startAt);
  oscillator.frequency.exponentialRampToValueAtTime(260, startAt + 0.055);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.075);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + 0.085);
}

function playBoardTap(context: AudioContext, startAt: number, volume: number): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = 'triangle';
  oscillator.frequency.setValueAtTime(170, startAt + 0.018);
  oscillator.frequency.exponentialRampToValueAtTime(95, startAt + 0.12);
  gain.gain.setValueAtTime(0.0001, startAt + 0.018);
  gain.gain.exponentialRampToValueAtTime(volume * 0.55, startAt + 0.026);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.14);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startAt + 0.018);
  oscillator.stop(startAt + 0.15);
}

function playCroak(context: AudioContext, startAt: number, volume: number): void {
  const oscillator = context.createOscillator();
  const warble = context.createOscillator();
  const warbleGain = context.createGain();
  const gain = context.createGain();
  const filter = context.createBiquadFilter();

  oscillator.type = 'sawtooth';
  oscillator.frequency.setValueAtTime(180, startAt);
  oscillator.frequency.exponentialRampToValueAtTime(115, startAt + 0.16);

  warble.type = 'sine';
  warble.frequency.setValueAtTime(18, startAt);
  warbleGain.gain.setValueAtTime(18, startAt);
  warble.connect(warbleGain);
  warbleGain.connect(oscillator.frequency);

  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(520, startAt);
  filter.Q.setValueAtTime(5.5, startAt);

  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.025);
  gain.gain.exponentialRampToValueAtTime(volume * 0.6, startAt + 0.09);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.22);

  oscillator.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startAt);
  warble.start(startAt);
  oscillator.stop(startAt + 0.24);
  warble.stop(startAt + 0.24);
}

function playDinosaurChomp(context: AudioContext, startAt: number, volume: number): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const filter = context.createBiquadFilter();

  oscillator.type = 'square';
  oscillator.frequency.setValueAtTime(140, startAt);
  oscillator.frequency.exponentialRampToValueAtTime(62, startAt + 0.11);

  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(420, startAt);
  filter.Q.setValueAtTime(3.2, startAt);

  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.01);
  gain.gain.exponentialRampToValueAtTime(volume * 0.55, startAt + 0.055);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.14);

  oscillator.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + 0.16);
}
