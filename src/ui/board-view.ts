import { GAME_RULES } from '../config/game';
import type { Board, PlayedMove } from '../game/types';

type Point = { x: number; y: number };

export class BoardView {
  private readonly context: CanvasRenderingContext2D;
  private board: Board;
  private lastMove: PlayedMove | null = null;
  private hintPoint: Point | null = null;
  private locked = false;
  private keyboardPoint: Point = { x: 9, y: 9 };
  private keyboardCursorVisible = false;
  private readonly resizeObserver: ResizeObserver;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly onMove: (x: number, y: number) => void) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('浏览器无法创建棋盘画布');
    this.context = context;
    this.board = Array.from({ length: GAME_RULES.boardSize }, () => Array.from({ length: GAME_RULES.boardSize }, () => null));
    this.canvas.addEventListener('pointerup', this.handlePointer);
    this.canvas.addEventListener('keydown', this.handleKeyboard);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.resize();
  }

  update(board: Board, lastMove: PlayedMove | null, locked: boolean, hintPoint: Point | null = null): void {
    this.board = board;
    this.lastMove = lastMove;
    this.hintPoint = hintPoint;
    this.locked = locked;
    this.canvas.setAttribute('aria-disabled', String(locked));
    this.canvas.style.cursor = locked ? 'not-allowed' : 'pointer';
    this.draw();
  }

  destroy(): void {
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener('pointerup', this.handlePointer);
    this.canvas.removeEventListener('keydown', this.handleKeyboard);
  }

  refresh(): void {
    this.resize();
  }

  pointPosition(point: Point): { x: number; y: number; cell: number } {
    const { padding, cell } = this.geometry();
    return {
      x: padding + point.x * cell,
      y: padding + point.y * cell,
      cell,
    };
  }

  private readonly handlePointer = (event: PointerEvent): void => {
    if (this.locked) return;
    event.preventDefault();
    this.keyboardCursorVisible = false;
    const point = this.eventToPoint(event.clientX, event.clientY);
    if (point) this.onMove(point.x, point.y);
  };

  private readonly handleKeyboard = (event: KeyboardEvent): void => {
    if (this.locked) return;
    const maximum = GAME_RULES.boardSize - 1;
    if (event.key === 'ArrowLeft') this.keyboardPoint.x = Math.max(0, this.keyboardPoint.x - 1);
    else if (event.key === 'ArrowRight') this.keyboardPoint.x = Math.min(maximum, this.keyboardPoint.x + 1);
    else if (event.key === 'ArrowUp') this.keyboardPoint.y = Math.max(0, this.keyboardPoint.y - 1);
    else if (event.key === 'ArrowDown') this.keyboardPoint.y = Math.min(maximum, this.keyboardPoint.y + 1);
    else if (event.key === 'Enter' || event.key === ' ') this.onMove(this.keyboardPoint.x, this.keyboardPoint.y);
    else return;
    this.keyboardCursorVisible = true;
    event.preventDefault();
    this.draw();
  };

  private resize(): void {
    const parentWidth = this.canvas.parentElement?.clientWidth ?? 640;
    const cssSize = Math.max(280, parentWidth);
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.style.width = `${cssSize}px`;
    this.canvas.style.height = `${cssSize}px`;
    this.canvas.width = Math.round(cssSize * ratio);
    this.canvas.height = Math.round(cssSize * ratio);
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.draw();
  }

  private geometry(): { size: number; padding: number; cell: number } {
    const size = this.canvas.clientWidth;
    const padding = size * 0.055;
    return { size, padding, cell: (size - padding * 2) / (GAME_RULES.boardSize - 1) };
  }

  private eventToPoint(clientX: number, clientY: number): Point | null {
    const rect = this.canvas.getBoundingClientRect();
    const { padding, cell } = this.geometry();
    const xFloat = (clientX - rect.left - padding) / cell;
    const yFloat = (clientY - rect.top - padding) / cell;
    const x = Math.round(xFloat);
    const y = Math.round(yFloat);
    if (x < 0 || y < 0 || x >= GAME_RULES.boardSize || y >= GAME_RULES.boardSize) return null;
    if (Math.abs(xFloat - x) > 0.48 || Math.abs(yFloat - y) > 0.48) return null;
    return { x, y };
  }

  private draw(): void {
    const { size, padding, cell } = this.geometry();
    if (size <= 0) return;
    const context = this.context;
    context.clearRect(0, 0, size, size);
    const styles = getComputedStyle(document.body);
    const wood = context.createLinearGradient(0, 0, size, size);
    wood.addColorStop(0, cssColor(styles, '--board-bg-start', '#f3cc79'));
    wood.addColorStop(0.55, cssColor(styles, '--board-bg-mid', '#e6b45a'));
    wood.addColorStop(1, cssColor(styles, '--board-bg-end', '#d99c3f'));
    context.fillStyle = wood;
    context.fillRect(0, 0, size, size);

    context.strokeStyle = cssColor(styles, '--board-line-color', 'rgba(63, 39, 15, 0.82)');
    context.lineWidth = Math.max(0.8, size / 720);
    context.beginPath();
    for (let index = 0; index < GAME_RULES.boardSize; index += 1) {
      const offset = padding + index * cell;
      context.moveTo(padding, offset);
      context.lineTo(size - padding, offset);
      context.moveTo(offset, padding);
      context.lineTo(offset, size - padding);
    }
    context.stroke();

    context.fillStyle = cssColor(styles, '--board-star-color', '#3d260f');
    for (const x of [3, 9, 15]) {
      for (const y of [3, 9, 15]) {
        context.beginPath();
        context.arc(padding + x * cell, padding + y * cell, Math.max(2.1, cell * 0.10), 0, Math.PI * 2);
        context.fill();
      }
    }

    const radius = cell * 0.46;
    for (let y = 0; y < GAME_RULES.boardSize; y += 1) {
      for (let x = 0; x < GAME_RULES.boardSize; x += 1) {
        const stone = this.board[y]![x];
        if (!stone) continue;
        this.drawStone(padding + x * cell, padding + y * cell, radius, stone);
      }
    }

    if (this.lastMove && !this.lastMove.pass) {
      const centerX = padding + this.lastMove.x * cell;
      const centerY = padding + this.lastMove.y * cell;
      context.beginPath();
      context.fillStyle = this.lastMove.player === 'black' ? '#ffd46b' : '#e7573e';
      context.arc(centerX, centerY, Math.max(2.4, radius * 0.23), 0, Math.PI * 2);
      context.fill();
    }

    if (this.hintPoint) {
      const centerX = padding + this.hintPoint.x * cell;
      const centerY = padding + this.hintPoint.y * cell;
      context.save();

      context.strokeStyle = 'rgba(15, 111, 75, 0.48)';
      context.lineWidth = Math.max(2, cell * 0.06);
      context.setLineDash([Math.max(4, cell * 0.18), Math.max(4, cell * 0.16)]);
      context.beginPath();
      context.moveTo(centerX, padding);
      context.lineTo(centerX, size - padding);
      context.moveTo(padding, centerY);
      context.lineTo(size - padding, centerY);
      context.stroke();
      context.setLineDash([]);

      context.fillStyle = 'rgba(24, 149, 92, 0.25)';
      context.beginPath();
      context.arc(centerX, centerY, radius * 0.92, 0, Math.PI * 2);
      context.fill();

      context.strokeStyle = '#0b7f52';
      context.lineWidth = Math.max(4, cell * 0.12);
      context.beginPath();
      context.arc(centerX, centerY, radius * 1.08, 0, Math.PI * 2);
      context.stroke();

      context.strokeStyle = '#fff7cf';
      context.lineWidth = Math.max(2, cell * 0.055);
      context.beginPath();
      context.arc(centerX, centerY, radius * 1.32, 0, Math.PI * 2);
      context.stroke();

      context.fillStyle = '#0b7f52';
      context.beginPath();
      context.arc(centerX, centerY, Math.max(3, radius * 0.18), 0, Math.PI * 2);
      context.fill();

      const label = '下这里';
      const fontSize = Math.max(13, cell * 0.34);
      context.font = `900 ${fontSize}px sans-serif`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      const labelWidth = context.measureText(label).width + 18;
      const labelHeight = fontSize + 10;
      const labelX = Math.max(6, Math.min(size - labelWidth - 6, centerX - labelWidth / 2));
      const labelY = centerY < padding + cell * 2.2 ? centerY + radius * 1.7 : centerY - radius * 2.35;
      context.fillStyle = '#0b7f52';
      context.fillRect(labelX, labelY, labelWidth, labelHeight);
      context.fillStyle = '#fff8df';
      context.fillText(label, labelX + labelWidth / 2, labelY + labelHeight / 2);
      context.restore();
    }

    if (this.keyboardCursorVisible && this.canvas === document.activeElement && !this.locked) {
      context.strokeStyle = '#2f7755';
      context.lineWidth = 2;
      context.strokeRect(
        padding + this.keyboardPoint.x * cell - radius,
        padding + this.keyboardPoint.y * cell - radius,
        radius * 2,
        radius * 2,
      );
    }
  }

  private drawStone(x: number, y: number, radius: number, color: 'black' | 'white'): void {
    const context = this.context;
    context.save();
    context.shadowColor = 'rgba(48, 28, 9, 0.36)';
    context.shadowBlur = radius * 0.28;
    context.shadowOffsetY = radius * 0.13;
    const gradient = context.createRadialGradient(x - radius * 0.34, y - radius * 0.38, radius * 0.08, x, y, radius);
    if (color === 'black') {
      gradient.addColorStop(0, '#62676a');
      gradient.addColorStop(0.34, '#25292b');
      gradient.addColorStop(1, '#090b0c');
    } else {
      gradient.addColorStop(0, '#ffffff');
      gradient.addColorStop(0.58, '#f2eee4');
      gradient.addColorStop(1, '#c9c2b4');
    }
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }
}

function cssColor(styles: CSSStyleDeclaration, name: string, fallback: string): string {
  return styles.getPropertyValue(name).trim() || fallback;
}
