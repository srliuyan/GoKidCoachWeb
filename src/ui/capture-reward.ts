import { THEMES } from '../config/theme';
import type { Player } from '../game/types';
import type { CaptureRewardKind } from './reward';
import { chompImageFor, rewardImageFor } from './reward';
import { playCaptureChompSound, playTreefrogSound } from './sound';

export interface CaptureRewardPoint {
  x: number;
  y: number;
  cell: number;
}

export class CaptureRewardController {
  private timer: number | null = null;
  private readonly cleanupTimers: number[] = [];

  constructor(
    private readonly container: HTMLElement,
    private readonly image: HTMLImageElement,
    private readonly text: HTMLElement,
  ) {}

  show(kind: CaptureRewardKind, points: CaptureRewardPoint[] = [], capturedColor: Player = 'white'): void {
    const theme = THEMES[kind];
    this.clearTimers();
    this.image.src = rewardImageFor(kind);
    this.text.textContent = theme.rewardText;
    this.container.hidden = false;
    this.container.classList.remove('capture-reward-show');
    this.container.classList.remove('capture-reward-chomp');
    this.container.classList.remove('capture-reward-dinosaur');
    this.container.classList.remove('capture-reward-frog');
    this.removeDynamicElements();
    if (points.length > 0) {
      this.showChomp(kind, orderedPoints(points), capturedColor);
      return;
    }
    void this.container.offsetWidth;
    this.container.classList.add('capture-reward-show');
    if (kind === 'frog') playTreefrogSound();
    this.timer = window.setTimeout(() => this.hide(), 2000);
  }

  hide(): void {
    this.clearTimers();
    this.container.hidden = true;
    this.container.classList.remove('capture-reward-show');
    this.container.classList.remove('capture-reward-chomp');
    this.container.classList.remove('capture-reward-dinosaur');
    this.container.classList.remove('capture-reward-frog');
    this.image.classList.remove('is-biting');
    this.image.classList.remove('is-mouth-open');
    this.image.classList.remove('is-hopping');
    this.removeDynamicElements();
  }

  private showChomp(kind: CaptureRewardKind, points: CaptureRewardPoint[], capturedColor: Player): void {
    const first = points[0]!;
    const startDelayMs = 40;
    const timings = points.map((_, index) => captureTimingFor(index));
    const mascotSize = Math.max(28, Math.min(72, first.cell * 1.45));
    const mascotWidth = mascotSize * 1.45;
    const mouthOffset = mouthOffsetFor(kind, mascotWidth, mascotSize);
    this.container.classList.add('capture-reward-chomp');
    this.container.classList.add(`capture-reward-${kind}`);
    this.container.style.setProperty('--reward-size', `${mascotSize}px`);
    this.container.style.setProperty('--reward-width', `${mascotWidth}px`);
    this.image.src = chompImageFor(kind);
    this.moveMascotTo(first, mouthOffset, mascotSize);

    const dots = points.map((point, index) => {
      const dot = document.createElement('span');
      dot.className = `captured-stone-dot ${capturedColor}`;
      dot.style.left = `${point.x}px`;
      dot.style.top = `${point.y}px`;
      dot.style.width = `${Math.max(18, point.cell * 0.72)}px`;
      dot.style.height = dot.style.width;
      dot.style.setProperty('--dot-delay', `${index * 170}ms`);
      dot.style.setProperty('--swallow-ms', `${timings[index]!.swallowMs}ms`);
      dot.style.setProperty('--swallow-x', `${mouthOffset.swallowX}px`);
      dot.style.setProperty('--swallow-y', `${mouthOffset.swallowY}px`);
      dot.style.setProperty('--swallow-mid-x', `${mouthOffset.swallowX * 0.48}px`);
      dot.style.setProperty('--swallow-mid-y', `${mouthOffset.swallowY * 0.48 - point.cell * 0.3}px`);
      dot.style.setProperty('--swallow-end-x', `${mouthOffset.swallowX * 1.12}px`);
      dot.style.setProperty('--swallow-end-y', `${mouthOffset.swallowY * 1.12}px`);
      this.container.append(dot);
      return dot;
    });

    void this.container.offsetWidth;
    this.container.classList.add('capture-reward-show');

    let cursorMs = startDelayMs;
    points.forEach((point, index) => {
      const timing = timings[index]!;
      const moveAt = cursorMs;
      const biteAt = moveAt + (index === 0 ? timing.pauseBeforeBiteMs : timing.moveMs + timing.pauseBeforeBiteMs);
      const moveTimer = window.setTimeout(() => {
        this.image.classList.remove('is-biting');
        this.image.classList.remove('is-mouth-open');
        this.image.classList.add('is-hopping');
        this.moveMascotTo(point, mouthOffset, mascotSize);
      }, moveAt);
      const moveCleanupTimer = window.setTimeout(() => {
        this.image.classList.remove('is-hopping');
      }, moveAt + timing.moveMs);
      const openTimer = window.setTimeout(() => {
        this.image.style.setProperty('--mouth-open-ms', `${timing.swallowMs}ms`);
        this.image.classList.remove('is-hopping');
        this.image.classList.remove('is-biting');
        this.image.classList.add('is-mouth-open');
      }, biteAt);
      const swallowTimer = window.setTimeout(() => {
        dots[index]?.classList.add('swallowing');
        playCaptureChompSound(kind);
      }, biteAt + timing.soundDelayMs);
      const biteTimer = window.setTimeout(() => {
        this.image.style.setProperty('--bite-ms', `${timing.biteMs}ms`);
        this.image.classList.remove('is-mouth-open');
        void this.image.offsetWidth;
        this.image.classList.add('is-biting');
        dots[index]?.classList.add('eaten');
      }, biteAt + timing.swallowMs);
      const biteCleanupTimer = window.setTimeout(() => {
        this.image.classList.remove('is-biting');
        this.image.classList.remove('is-mouth-open');
      }, biteAt + timing.swallowMs + timing.biteMs);
      this.cleanupTimers.push(moveTimer, moveCleanupTimer, openTimer, swallowTimer, biteTimer, biteCleanupTimer);
      cursorMs += timing.stepMs;
    });

    const duration = cursorMs + 100;
    this.timer = window.setTimeout(() => this.hide(), duration);
  }

  private moveMascotTo(point: CaptureRewardPoint, mouthOffset: MouthOffset, mascotSize: number): void {
    this.image.style.left = `${point.x - mouthOffset.x}px`;
    this.image.style.top = `${point.y - mouthOffset.y}px`;
    this.text.style.left = `${point.x}px`;
    this.text.style.top = `${Math.max(20, point.y - mascotSize * 0.58)}px`;
  }

  private clearTimers(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    for (const timer of this.cleanupTimers) window.clearTimeout(timer);
    this.cleanupTimers.length = 0;
  }

  private removeDynamicElements(): void {
    for (const element of this.container.querySelectorAll('.captured-stone-dot')) element.remove();
  }
}

function orderedPoints(points: CaptureRewardPoint[]): CaptureRewardPoint[] {
  const remaining = [...points];
  const ordered: CaptureRewardPoint[] = [];
  let current = remaining.shift()!;
  ordered.push(current);
  while (remaining.length > 0) {
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < remaining.length; index += 1) {
      const point = remaining[index]!;
      const distance = Math.abs(point.x - current.x) + Math.abs(point.y - current.y);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    }
    current = remaining.splice(nearestIndex, 1)[0]!;
    ordered.push(current);
  }
  return ordered;
}

interface MouthOffset {
  x: number;
  y: number;
  swallowX: number;
  swallowY: number;
}

interface CaptureTiming {
  moveMs: number;
  pauseBeforeBiteMs: number;
  swallowMs: number;
  biteMs: number;
  soundDelayMs: number;
  stepMs: number;
}

function captureTimingFor(index: number): CaptureTiming {
  const timing = index < 4
    ? { moveMs: 170, pauseBeforeBiteMs: 90, swallowMs: 220, biteMs: 160, soundDelayMs: 55, settleMs: 60 }
    : { moveMs: 90, pauseBeforeBiteMs: 40, swallowMs: 140, biteMs: 100, soundDelayMs: 35, settleMs: 30 };
  return {
    ...timing,
    stepMs: timing.moveMs + timing.pauseBeforeBiteMs + timing.swallowMs + timing.biteMs + timing.settleMs,
  };
}

function mouthOffsetFor(kind: CaptureRewardKind, width: number, height: number): MouthOffset {
  if (kind === 'frog') {
    return {
      x: width * 0.33,
      y: height * -0.18,
      swallowX: width * 0.12,
      swallowY: height * 0.18,
    };
  }
  return {
    x: width * 0.22,
    y: height * -0.08,
    swallowX: width * 0.08,
    swallowY: height * 0.14,
  };
}
