import './style.css';
import { DIFFICULTY_LEVELS, type DifficultyLevel } from './config/difficulty';
import { DEFAULT_THEME_ID, THEMES, THEME_STORAGE_KEY, isThemeId, type ThemeId } from './config/theme';
import { B10Engine, type EngineProgress } from './engine/b10-engine';
import { recordGameResult, recordMoveQuality } from './game/adaptive';
import { chooseAiCandidate, chooseHintCandidate, expandBeginnerPolicyCandidates, explainAiCandidate, type CandidateDifficultyExplanation, type EngineCandidate } from './game/difficulty';
import { createGame, isLegalMove, passTurn, playMove, resignGame, scoreChineseArea } from './game/rules';
import { loadAdaptiveProfile, loadGame, saveAdaptiveProfile, saveGame } from './game/storage';
import type { GameState, PlayedMove, Player } from './game/types';
import { BoardView } from './ui/board-view';
import { CaptureRewardController } from './ui/capture-reward';
import { captureRewardFor } from './ui/reward';
import { playStoneSound } from './ui/sound';
import type { KataGoAnalysisPayload } from '../vendor/web-katrain/src/engine/katago/types';

const elements = {
  canvas: required<HTMLCanvasElement>('go-board'),
  turnBanner: required<HTMLElement>('turn-banner'),
  turnStone: required<HTMLElement>('turn-stone'),
  turnKicker: required<HTMLElement>('turn-kicker'),
  turnLabel: required<HTMLElement>('turn-label'),
  saveState: required<HTMLElement>('save-state'),
  boardMessage: required<HTMLElement>('board-message'),
  thinkingMask: required<HTMLElement>('thinking-mask'),
  coachSticker: required<HTMLElement>('coach-sticker'),
  coachStickerText: required<HTMLElement>('coach-sticker-text'),
  captureReward: required<HTMLElement>('capture-reward'),
  rewardImage: required<HTMLImageElement>('reward-image'),
  rewardText: required<HTMLElement>('reward-text'),
  boardShell: required<HTMLElement>('board-shell'),
  thinkingDetail: required<HTMLElement>('thinking-detail'),
  boardCard: required<HTMLElement>('board-card'),
  fullscreenButton: required<HTMLButtonElement>('fullscreen-button'),
  blackName: required<HTMLElement>('black-name'),
  whiteName: required<HTMLElement>('white-name'),
  blackCaptures: required<HTMLElement>('black-captures'),
  whiteCaptures: required<HTMLElement>('white-captures'),
  hintButton: required<HTMLButtonElement>('hint-button'),
  passButton: required<HTMLButtonElement>('pass-button'),
  resignButton: required<HTMLButtonElement>('resign-button'),
  fsNewGameButton: required<HTMLButtonElement>('fs-new-game-button'),
  fsHintButton: required<HTMLButtonElement>('fs-hint-button'),
  fsHintCard: required<HTMLElement>('fs-hint-card'),
  fsHintPoint: required<HTMLElement>('fs-hint-point'),
  fsHintTitle: required<HTMLElement>('fs-hint-title'),
  fsHintText: required<HTMLElement>('fs-hint-text'),
  fsTeachingCard: required<HTMLElement>('fs-teaching-card'),
  fsTeachingTitle: required<HTMLElement>('fs-teaching-title'),
  fsTeachingText: required<HTMLElement>('fs-teaching-text'),
  fsPassButton: required<HTMLButtonElement>('fs-pass-button'),
  fsResignButton: required<HTMLButtonElement>('fs-resign-button'),
  newGameTop: required<HTMLButtonElement>('new-game-top'),
  levelSelect: required<HTMLSelectElement>('level-select'),
  themeSelect: required<HTMLSelectElement>('theme-select'),
  themePreviewImage: required<HTMLImageElement>('theme-preview-image'),
  difficultyDetail: required<HTMLElement>('difficulty-detail'),
  teachingCard: required<HTMLElement>('teaching-card'),
  teachingTitle: required<HTMLElement>('teaching-title'),
  teachingText: required<HTMLElement>('teaching-text'),
  positionStatus: required<HTMLElement>('position-status'),
  childWinrate: required<HTMLElement>('child-winrate'),
  scoreLead: required<HTMLElement>('score-lead'),
  winrateFill: required<HTMLElement>('winrate-fill'),
  moveCount: required<HTMLElement>('move-count'),
  visitCount: required<HTMLElement>('visit-count'),
  fsPositionStatus: required<HTMLElement>('fs-position-status'),
  fsChildWinrate: required<HTMLElement>('fs-child-winrate'),
  fsScoreLead: required<HTMLElement>('fs-score-lead'),
  fsWinrateFill: required<HTMLElement>('fs-winrate-fill'),
  fsMoveCount: required<HTMLElement>('fs-move-count'),
  fsVisitCount: required<HTMLElement>('fs-visit-count'),
  fsBlackName: required<HTMLElement>('fs-black-name'),
  fsWhiteName: required<HTMLElement>('fs-white-name'),
  fsBlackCount: required<HTMLElement>('fs-black-count'),
  fsWhiteCount: required<HTMLElement>('fs-white-count'),
  engineDot: required<HTMLElement>('engine-dot'),
  engineStatus: required<HTMLElement>('engine-status'),
  engineDetail: required<HTMLElement>('engine-detail'),
  modelProgress: required<HTMLProgressElement>('model-progress'),
  newGameDialog: required<HTMLElement>('new-game-dialog'),
  closeDialog: required<HTMLButtonElement>('close-dialog'),
  confirmNewGame: required<HTMLButtonElement>('confirm-new-game'),
  confirmDialog: required<HTMLElement>('confirm-dialog'),
  confirmTitle: required<HTMLElement>('confirm-title'),
  confirmMessage: required<HTMLElement>('confirm-message'),
  confirmCancel: required<HTMLButtonElement>('confirm-cancel'),
  confirmOk: required<HTMLButtonElement>('confirm-ok'),
  resultDialog: required<HTMLElement>('result-dialog'),
  resultEmoji: required<HTMLElement>('result-emoji'),
  resultTitle: required<HTMLElement>('result-title'),
  resultMessage: required<HTMLElement>('result-message'),
  resultNewGame: required<HTMLButtonElement>('result-new-game'),
  resultClose: required<HTMLButtonElement>('result-close'),
  toast: required<HTMLElement>('toast'),
};

let game = loadGame() ?? createGame();
let adaptiveProfile = loadAdaptiveProfile();
let aiBusy = false;
let hintBusy = false;
let runSerial = 0;
let engineFailed = false;
let confirmAction: (() => void) | null = null;
let toastTimer: number | null = null;
let engineWarmupStarted = false;
let engineLoading = false;
let lastEngineProgressAt = 0;
let pageWasHidden = false;
let positionInsight: PositionInsight | null = null;
let teachingTip: TeachingTip = { title: '慢慢想，不着急。', text: '先找角和边上的大地方。' };
let fullscreenHint: HintTip | null = null;
let boardHintPoint: { x: number; y: number } | null = null;
let boardHintSource: 'explicit' | 'sticker' | null = null;
let boardImmersiveActive = false;
let stickerTimer: number | null = null;
let lastStickerMove = -8;
let nextStickerGap = 5;
let lastStickerKind: StickerKind | null = null;
let theme: ThemeId = loadTheme();
const debugEnabled = new URLSearchParams(location.search).has('debug');
const HINT_DIFFICULTY_LEVEL: DifficultyLevel = 5;
let assessmentCache: { key: string; analysis: KataGoAnalysisPayload | null; complete: boolean } | null = null;
const engine = new B10Engine();
const boardView = new BoardView(elements.canvas, (x, y) => {
  void handleChildMove(x, y);
});
const captureReward = new CaptureRewardController(elements.captureReward, elements.rewardImage, elements.rewardText);

populateLevelSelect();
populateThemeSelect();
applyTheme(theme);
bindEvents();
render();
startEngineWarmup();
if (game.status === 'active' && game.currentPlayer !== game.childColor) void runAiTurn();
if (game.status === 'finished') showResult(false);

async function handleChildMove(x: number, y: number): Promise<void> {
  if (!canChildAct()) {
    showToast(aiBusy ? '等小伙伴下完这一手哦' : '现在还不能落子');
    return;
  }
  const beforeMove = game;
  const result = playMove(game, x, y, game.childColor);
  if (!result.ok) {
    showToast(failureMessage(result.reason));
    return;
  }
  game = result.state;
  playStoneSound(result.move.captured);
  clearHint();
  commitGame();
  render();
  const reward = captureRewardFor(result.move.captured, theme);
  if (reward) {
    const capturedPoints = (result.move.capturedStones ?? []).map((point) => boardView.pointPosition(point));
    const capturedColor: Player = result.move.player === 'black' ? 'white' : 'black';
    captureReward.show(reward, capturedPoints, capturedColor);
  }
  elements.boardMessage.textContent = result.move.captured > 0 ? `你提掉了 ${result.move.captured} 颗棋子！` : '下得好，小伙伴来想一想。';
  await runAiTurn({ beforeMove, childMove: result.move });
}

async function runAiTurn(context?: { beforeMove: GameState; childMove: PlayedMove }): Promise<void> {
  if (game.status !== 'active' || game.currentPlayer === game.childColor || aiBusy) return;
  const serial = ++runSerial;
  const gameId = game.id;
  aiBusy = true;
  engineFailed = false;
  elements.thinkingDetail.textContent = engine.activeBackend ? 'B10 已准备好' : '准备 B10 引擎';
  render();

  try {
    await engine.initialize(updateEngineProgress);
    assertCurrentRun(serial, gameId);

    if (context && currentDifficultyLevel() <= 2) {
      consumeChildAssessment(context.beforeMove, context.childMove);
    }

    const level = currentDifficultyLevel();
    const config = DIFFICULTY_LEVELS[level];
    elements.thinkingDetail.textContent = `第 ${level} 级 · 最多 ${config.maxTimeMs} ms`;
    let analysis;
    let lastError: unknown;
    const searchStartedAt = performance.now();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        analysis = await engine.analyze(game, config, {
          parentMoveCount: context?.beforeMove.moves.length,
        });
        break;
      } catch (error) {
        lastError = error;
        if (attempt === 0) {
          engine.dispose();
          elements.thinkingDetail.textContent = '重新连接本地 AI';
          await engine.initialize(updateEngineProgress);
          assertCurrentRun(serial, gameId);
        }
      }
    }
    if (!analysis) throw lastError instanceof Error ? lastError : new Error('AI 没有返回结果');
    assertCurrentRun(serial, gameId);
    positionInsight = createPositionInsight(analysis, game.childColor);
    renderPosition();

    const isLegalCandidate = (candidate: EngineCandidate): boolean =>
      isPassCandidate(candidate) || isLegalMove(game, candidate.x, candidate.y, game.currentPlayer);
    const difficultyContext = {
      board: game.board,
      currentPlayer: game.currentPlayer,
      moveNumber: game.moves.length,
      lastMove: game.moves.at(-1) ?? null,
      recentMoves: game.moves,
    };
    const aiCandidates = expandBeginnerPolicyCandidates(analysis.moves, level, isLegalCandidate, analysis.policy, difficultyContext);
    const chosen = chooseAiCandidate(aiCandidates, level, isLegalCandidate, Math.random, difficultyContext);
    recordDebugSearch({
      level,
      requestedVisits: config.visits,
      maxTimeMs: config.maxTimeMs,
      searchMs: performance.now() - searchStartedAt,
      rootVisits: analysis.rootVisits,
      backend: engine.activeBackend,
      candidateCount: aiCandidates.length,
      searchedCandidateCount: analysis.moves.length,
      chosen: chosen ? {
        x: chosen.x,
        y: chosen.y,
        order: chosen.order,
        prior: chosen.prior,
        policyOnly: chosen.policyOnly,
        winRateLost: chosen.winRateLost,
        scoreLoss: chosen.relativePointsLost ?? chosen.pointsLost,
        difficulty: explainAiCandidate(chosen, level, difficultyContext),
      } : null,
    });
    const result = !chosen || isPassCandidate(chosen)
      ? passTurn(game, game.currentPlayer)
      : playMove(game, chosen.x, chosen.y, game.currentPlayer);
    if (!result.ok) throw new Error(`AI 返回了不合法落子：${result.reason}`);
    if (!result.move.pass) playStoneSound(result.move.captured);
    game = result.state;
    aiBusy = false;
    clearHint();
    commitGame();
    setTeachingTip(createAiTeachingTip(result.move, chosen));
    render();
    elements.boardMessage.textContent = result.move.pass
      ? '小伙伴停了一手。'
      : result.move.captured > 0
        ? `小伙伴提了 ${result.move.captured} 颗棋子。轮到你啦。`
        : '轮到你啦，慢慢想。';
    if (game.status === 'finished') finishGame();
    else queueChildAssessment();
  } catch (error) {
    if (serial !== runSerial || game.id !== gameId) return;
    aiBusy = false;
    engineFailed = true;
    engineLoading = false;
    engine.dispose();
    elements.engineDot.className = 'engine-dot error';
    elements.engineStatus.textContent = 'B10 暂时没准备好';
    elements.engineDetail.textContent = error instanceof Error ? error.message : String(error);
    elements.boardMessage.textContent = '小伙伴刚才走神了，点状态卡片再试一次。';
    render();
  }
}

function consumeChildAssessment(beforeMove: GameState, childMove: PlayedMove): void {
  const key = assessmentKey(beforeMove);
  const cached = assessmentCache;
  assessmentCache = null;
  if (!cached || cached.key !== key || !cached.complete || !cached.analysis) return;
  const config = DIFFICULTY_LEVELS[currentDifficultyLevel()];
  const matching = cached.analysis.moves.find((candidate) =>
    childMove.pass ? isPassCandidate(candidate) : candidate.x === childMove.x && candidate.y === childMove.y,
  );
  const winRateLoss = Math.max(0, matching?.winRateLost ?? config.maxWinRateLoss * 1.15);
  const scoreLoss = Math.max(0, matching?.relativePointsLost ?? matching?.pointsLost ?? config.obviousBlunderScoreLoss);
  adaptiveProfile = recordMoveQuality(adaptiveProfile, {
    winRateLoss,
    scoreLoss,
    moveNumber: beforeMove.moves.length + 1,
  });
  safeSaveAdaptive();
  if (scoreLoss >= config.obviousBlunderScoreLoss * 0.72) {
    maybeShowAutoSticker(cached.analysis);
  }
}

function queueChildAssessment(): void {
  if (game.status !== 'active' || game.currentPlayer !== game.childColor || !engine.activeBackend) return;
  if (currentDifficultyLevel() > 2) return;
  const snapshot = game;
  const cache = { key: assessmentKey(snapshot), analysis: null as KataGoAnalysisPayload | null, complete: false };
  assessmentCache = cache;
  const config = DIFFICULTY_LEVELS[currentDifficultyLevel()];
  void engine.analyze(snapshot, config, { assessment: true }).then((analysis) => {
    if (assessmentCache !== cache) return;
    cache.analysis = analysis;
    cache.complete = true;
    maybeShowAutoSticker(analysis);
  }).catch(() => {
    if (assessmentCache === cache) assessmentCache = null;
  });
}

async function handleHint(): Promise<void> {
  if (hintBusy || aiBusy || game.status !== 'active' || game.currentPlayer !== game.childColor) return;
  hintBusy = true;
  elements.fsHintCard.hidden = false;
  elements.fsHintPoint.textContent = '正在看棋';
  elements.fsHintTitle.textContent = '小伙伴在找最强提示。';
  elements.fsHintText.textContent = '先等一下，B10 会认真找当前最想下的位置。';
  render();

  try {
    const analysis = await currentHintAnalysis();
    positionInsight = createPositionInsight(analysis, game.childColor);
    const isLegalHint = (candidate: EngineCandidate): boolean =>
      isPassCandidate(candidate) || isLegalMove(game, candidate.x, candidate.y, game.currentPlayer);
    const suggested = chooseHintCandidate(analysis.moves, isLegalHint);
    const hint = suggested ? createBestMoveHint(suggested) : {
      point: '停一手',
      title: '先看大地方。',
      text: '没有急着要补的棋，就找角和边。',
      audioKey: 'hint-pass',
    };
    fullscreenHint = hint;
    boardHintPoint = suggested && !isPassCandidate(suggested) ? { x: suggested.x, y: suggested.y } : null;
    boardHintSource = boardHintPoint ? 'explicit' : null;
    teachingTip = { title: hint.title, text: hint.text };
    elements.boardMessage.textContent = `${hint.point}：${hint.text}`;
    renderPosition();
    renderTeaching();
    renderFullscreenHint();
  } catch {
    fullscreenHint = {
      point: '稍后再试',
      title: '现在还看不清。',
      text: '等小伙伴准备好以后，再点一次提示。',
    };
    boardHintPoint = null;
    boardHintSource = null;
    hideSticker();
    renderFullscreenHint();
  } finally {
    hintBusy = false;
    render();
    if (fullscreenHint) elements.boardMessage.textContent = `${fullscreenHint.point}：${fullscreenHint.text}`;
  }
}

async function currentHintAnalysis(): Promise<KataGoAnalysisPayload> {
  await engine.initialize(updateEngineProgress);
  const config = DIFFICULTY_LEVELS[HINT_DIFFICULTY_LEVEL];
  return engine.analyze(game, config, { assessment: true });
}

function finishGame(): void {
  if (!game.result) return;
  adaptiveProfile = recordGameResult(adaptiveProfile, game.result.winner, game.childColor, game.id);
  safeSaveAdaptive();
  commitGame();
  render();
  showResult(true);
}

function startNewGame(childColor: Player): void {
  runSerial += 1;
  aiBusy = false;
  engineFailed = false;
  assessmentCache = null;
  positionInsight = null;
  fullscreenHint = null;
  boardHintPoint = null;
  boardHintSource = null;
  hideSticker();
  captureReward.hide();
  game = createGame(childColor, game.difficulty);
  hide(elements.newGameDialog);
  hide(elements.resultDialog);
  commitGame();
  render();
  elements.boardMessage.textContent = childColor === 'black' ? '你先下黑棋，点一个交叉点吧。' : '你下白棋，小伙伴先来。';
  if (childColor === 'white') void runAiTurn();
}

function commitGame(): void {
  try {
    saveGame(game);
    elements.saveState.textContent = '已保存';
    elements.saveState.classList.remove('warning');
  } catch {
    elements.saveState.textContent = '仅本次有效';
    elements.saveState.classList.add('warning');
  }
}

function render(): void {
  const childTurn = game.status === 'active' && game.currentPlayer === game.childColor;
  const blackIsChild = game.childColor === 'black';
  const lastMove = game.moves.at(-1) ?? null;
  const locked = aiBusy || !childTurn || game.status !== 'active';
  boardView.update(game.board, lastMove, locked, boardHintPoint);
  elements.thinkingMask.hidden = !aiBusy;
  elements.turnStone.className = `mini-stone ${game.currentPlayer}`;
  elements.turnBanner.classList.toggle('ai-turn', !childTurn && game.status === 'active');
  elements.turnKicker.textContent = game.status === 'finished' ? '对局' : '轮到';
  elements.turnLabel.textContent = game.status === 'finished'
    ? '这盘棋结束了'
    : childTurn
      ? `你下${playerName(game.childColor)}棋`
      : `小伙伴下${playerName(game.currentPlayer)}棋`;
  elements.blackName.textContent = blackIsChild ? '你 · 黑棋' : 'AI · 黑棋';
  elements.whiteName.textContent = blackIsChild ? 'AI · 白棋' : '你 · 白棋';
  elements.blackCaptures.textContent = `提子 ${game.captures.black}`;
  elements.whiteCaptures.textContent = `提子 ${game.captures.white}`;
  elements.hintButton.disabled = hintBusy || aiBusy || game.status !== 'active' || game.currentPlayer !== game.childColor;
  elements.hintButton.textContent = hintBusy ? '想棋' : '提示';
  elements.passButton.disabled = aiBusy || game.status !== 'active' || game.currentPlayer !== game.childColor;
  elements.resignButton.disabled = game.status !== 'active' || aiBusy;
  elements.fsNewGameButton.disabled = aiBusy;
  elements.fsHintButton.disabled = hintBusy || aiBusy || game.status !== 'active' || game.currentPlayer !== game.childColor;
  elements.fsHintButton.textContent = hintBusy ? '想棋' : '提示';
  elements.fsPassButton.disabled = aiBusy || game.status !== 'active' || game.currentPlayer !== game.childColor;
  elements.fsResignButton.disabled = game.status !== 'active' || aiBusy;
  renderFullscreenStoneCounts();
  if (game.status === 'finished') {
    elements.boardMessage.textContent = '这盘棋已经结束，可以看看棋盘或再下一盘。';
  } else if (aiBusy) {
    elements.boardMessage.textContent = '小伙伴正在认真想棋。';
  } else if (childTurn) {
    elements.boardMessage.textContent = game.moves.length === 0 ? '点一个交叉点，开始下棋吧。' : '轮到你啦，慢慢想。';
  } else {
    elements.boardMessage.textContent = '小伙伴准备下这一手。';
  }
  renderDifficulty();
  renderPosition();
  renderTeaching();
  renderFullscreenHint();
}

function renderDifficulty(): void {
  const level = game.difficulty.manualLevel;
  const config = DIFFICULTY_LEVELS[level];
  elements.levelSelect.value = String(level);
  elements.difficultyDetail.textContent = `第 ${level} 级 · ${config.name} · ${config.description}`;
  elements.difficultyDetail.textContent += ` · 小伙伴：${companionName(level)}`;
  elements.difficultyDetail.classList.toggle('twist', config.beginnerStyle === 'twist');
  elements.themeSelect.value = theme;
  elements.themeSelect.title = `${THEMES[theme].name} · ${THEMES[theme].description}`;
}

function renderPosition(): void {
  elements.moveCount.textContent = `第 ${game.moves.length} 手`;
  elements.fsMoveCount.textContent = `第 ${game.moves.length} 手`;
  const exactStats = debugEnabled;
  const realtimeScore = realtimeScoreText();
  elements.winrateFill.parentElement!.hidden = !exactStats;
  elements.fsWinrateFill.parentElement!.hidden = !exactStats;
  if (game.status === 'finished' && game.result) {
    const childWon = game.result.winner === game.childColor;
    elements.positionStatus.textContent = childWon ? '你赢了' : '已结束';
    elements.childWinrate.textContent = realtimeScore;
    elements.scoreLead.textContent = childWon ? '再来一盘' : '休息一下';
    elements.winrateFill.style.width = childWon ? '100%' : '0%';
    elements.visitCount.textContent = game.result.reason === 'resign' ? '认输结束' : '数子结束';
    elements.fsPositionStatus.textContent = elements.positionStatus.textContent;
    elements.fsChildWinrate.textContent = elements.childWinrate.textContent;
    elements.fsScoreLead.textContent = elements.scoreLead.textContent;
    elements.fsWinrateFill.style.width = elements.winrateFill.style.width;
    elements.fsVisitCount.textContent = elements.visitCount.textContent;
    return;
  }

  if (!positionInsight) {
    elements.positionStatus.textContent = game.moves.length === 0 ? '刚开始' : '等待判断';
    elements.childWinrate.textContent = realtimeScore;
    elements.scoreLead.textContent = game.moves.length < 20 ? '找角边' : '找大场';
    elements.winrateFill.style.width = '50%';
    elements.visitCount.textContent = engine.activeBackend ? '等待 AI' : '准备中';
    elements.fsPositionStatus.textContent = elements.positionStatus.textContent;
    elements.fsChildWinrate.textContent = elements.childWinrate.textContent;
    elements.fsScoreLead.textContent = elements.scoreLead.textContent;
    elements.fsWinrateFill.style.width = elements.winrateFill.style.width;
    elements.fsVisitCount.textContent = elements.visitCount.textContent;
    return;
  }

  elements.positionStatus.textContent = positionInsight.status;
  elements.childWinrate.textContent = realtimeScore;
  elements.scoreLead.textContent = exactStats ? formatScoreLead(positionInsight.childScoreLead) : childNextStep(positionInsight);
  elements.winrateFill.style.width = `${Math.round(positionInsight.childWinRate * 100)}%`;
  elements.visitCount.textContent = exactStats ? `${positionInsight.visits} 次读取` : `第 ${game.moves.length} 手`;
  elements.fsPositionStatus.textContent = elements.positionStatus.textContent;
  elements.fsChildWinrate.textContent = elements.childWinrate.textContent;
  elements.fsScoreLead.textContent = elements.scoreLead.textContent;
  elements.fsWinrateFill.style.width = elements.winrateFill.style.width;
  elements.fsVisitCount.textContent = elements.visitCount.textContent;
}

function renderFullscreenStoneCounts(): void {
  const blackIsChild = game.childColor === 'black';
  const counts = boardStoneCounts();
  elements.fsBlackName.textContent = blackIsChild ? '你 · 黑棋' : 'AI · 黑棋';
  elements.fsWhiteName.textContent = blackIsChild ? 'AI · 白棋' : '你 · 白棋';
  elements.fsBlackCount.textContent = `棋盘 ${counts.black} · 提子 ${game.captures.black}`;
  elements.fsWhiteCount.textContent = `棋盘 ${counts.white} · 提子 ${game.captures.white}`;
}

function updateEngineProgress(progress: EngineProgress): void {
  lastEngineProgressAt = Date.now();
  engineLoading = progress.stage !== 'ready';
  elements.modelProgress.value = progress.percent;
  elements.engineDetail.textContent = progress.detail;
  if (progress.stage === 'ready') {
    elements.engineDot.className = 'engine-dot ready';
    elements.engineStatus.textContent = 'B10 已在本机运行';
  } else {
    elements.engineDot.className = 'engine-dot loading';
    elements.engineStatus.textContent = progress.stage === 'download' ? '正在加载 B10' : '正在启动 B10';
  }
}

function startEngineWarmup(): void {
  if (engineWarmupStarted || engine.activeBackend) return;
  engineWarmupStarted = true;
  engineLoading = true;
  engineFailed = false;
  lastEngineProgressAt = Date.now();
  const warmupState = game.status === 'active' ? game : createGame('black', game.difficulty);
  const warmupGameId = warmupState.id;
  const warmupMoveCount = warmupState.moves.length;
  window.setTimeout(() => {
    if (engine.activeBackend) return;
    elements.engineDot.className = 'engine-dot loading';
    elements.engineStatus.textContent = '正在准备 B10';
    elements.engineDetail.textContent = '第一次打开会加载模型，之后会走缓存';
    void engine.prewarm(warmupState, updateEngineProgress, () => (
      !aiBusy
      && (
        game.status !== 'active'
        || (
          game.id === warmupGameId
          && game.moves.length === warmupMoveCount
          && game.currentPlayer === game.childColor
        )
      )
    )).then(() => {
      if (engineFailed) return;
      engineLoading = false;
      elements.engineDot.className = 'engine-dot ready';
      elements.engineStatus.textContent = 'B10 已在本机运行';
      elements.engineDetail.textContent = 'B10 已预热，轮到 AI 会更快';
      elements.modelProgress.value = 100;
    }).catch((error) => {
      if (aiBusy) return;
      engineLoading = false;
      engineFailed = true;
      elements.engineDot.className = 'engine-dot error';
      elements.engineStatus.textContent = 'B10 暂时没准备好';
      elements.engineDetail.textContent = error instanceof Error ? error.message : String(error);
    });
  }, 200);
}

function restartEngineWarmup(reason: 'resume' | 'manual'): void {
  if (engine.activeBackend) return;
  runSerial += 1;
  if (aiBusy) aiBusy = false;
  engine.dispose();
  engineWarmupStarted = false;
  engineLoading = false;
  engineFailed = false;
  assessmentCache = null;
  elements.engineDot.className = 'engine-dot loading';
  elements.engineStatus.textContent = '正在重新准备 B10';
  elements.engineDetail.textContent = reason === 'resume' ? '页面刚回到前台，正在恢复加载' : '正在重新加载 B10';
  startEngineWarmup();
  render();
  if (game.status === 'active' && game.currentPlayer !== game.childColor) {
    window.setTimeout(() => void runAiTurn(), 250);
  }
}

function recoverEngineAfterForeground(): void {
  pageWasHidden = false;
  if (engine.activeBackend) return;
  const stalledMs = Date.now() - lastEngineProgressAt;
  if (engineFailed || engineLoading || stalledMs > 1500) {
    restartEngineWarmup('resume');
  } else {
    startEngineWarmup();
  }
}

function showResult(announce: boolean): void {
  if (!game.result) return;
  const childWon = game.result.winner === game.childColor;
  elements.resultEmoji.textContent = childWon ? '🌟' : '🌱';
  elements.resultTitle.textContent = childWon ? '你赢啦！' : '这盘下得很认真';
  elements.resultNewGame.textContent = '再下一盘';
  if (game.result.reason === 'resign') {
    elements.resultMessage.textContent = childWon ? '小伙伴认输了。' : '先休息一下，下一盘再来。';
  } else {
    const margin = game.result.margin?.toFixed(1) ?? '0';
    elements.resultMessage.textContent = `${playerName(game.result.winner)}棋胜 ${margin} 目。`;
  }
  show(elements.resultDialog);
  if (announce) elements.resultTitle.focus?.();
}

function showRestartResult(): void {
  const result = scoreChineseArea(game.board);
  const childWon = result.winner === game.childColor;
  const margin = result.margin?.toFixed(1) ?? '0';
  elements.resultEmoji.textContent = childWon ? '🌟' : '🌱';
  elements.resultTitle.textContent = '这盘现在的结果';
  elements.resultMessage.textContent = `按当前棋盘估算：${playerName(result.winner)}棋胜 ${margin} 目。`;
  elements.resultNewGame.textContent = '开始新局';
  show(elements.resultDialog);
  elements.resultNewGame.focus();
}

function showNewGameDialog(): void {
  if (isFullscreenActive()) {
    exitFullscreen();
    showNewGameDialog();
    return;
  }
  show(elements.newGameDialog);
  elements.confirmNewGame.focus();
}

function askForConfirmation(title: string, message: string, action: () => void): void {
  if (isFullscreenActive()) {
    exitFullscreen();
    askForConfirmation(title, message, action);
    return;
  }
  confirmAction = action;
  elements.confirmTitle.textContent = title;
  elements.confirmMessage.textContent = message;
  show(elements.confirmDialog);
  elements.confirmCancel.focus();
}

function bindEvents(): void {
  elements.fullscreenButton.addEventListener('click', () => void toggleBoardFullscreen());
  elements.hintButton.addEventListener('click', () => {
    void handleHint();
  });
  elements.fsNewGameButton.addEventListener('click', () => {
    askRestart('要开始新对局吗？');
  });
  elements.fsHintButton.addEventListener('click', () => {
    void handleHint();
  });
  elements.passButton.addEventListener('click', handlePass);
  elements.fsPassButton.addEventListener('click', handlePass);
  elements.resignButton.addEventListener('click', () => {
    askResign();
  });
  elements.fsResignButton.addEventListener('click', askResign);
  elements.newGameTop.addEventListener('click', () => {
    askRestart('要开始新对局吗？');
  });
  elements.closeDialog.addEventListener('click', () => hide(elements.newGameDialog));
  elements.confirmNewGame.addEventListener('click', () => {
    const selected = document.querySelector<HTMLInputElement>('input[name="child-color"]:checked');
    startNewGame(selected?.value === 'white' ? 'white' : 'black');
  });
  for (const input of document.querySelectorAll<HTMLInputElement>('input[name="child-color"]')) {
    input.addEventListener('change', () => {
      for (const choice of document.querySelectorAll('.color-choice')) choice.classList.remove('selected');
      input.closest('.color-choice')?.classList.add('selected');
    });
  }
  elements.confirmCancel.addEventListener('click', () => {
    confirmAction = null;
    hide(elements.confirmDialog);
  });
  elements.confirmOk.addEventListener('click', () => {
    const action = confirmAction;
    confirmAction = null;
    hide(elements.confirmDialog);
    action?.();
  });
  elements.resultNewGame.addEventListener('click', () => {
    hide(elements.resultDialog);
    showNewGameDialog();
  });
  elements.resultClose.addEventListener('click', () => hide(elements.resultDialog));
  elements.levelSelect.addEventListener('change', () => {
    const level = Number(elements.levelSelect.value) as DifficultyLevel;
    game = { ...game, difficulty: { mode: 'manual', manualLevel: level }, updatedAt: Date.now() };
    commitGame();
    render();
  });
  elements.themeSelect.addEventListener('change', () => {
    const selected = elements.themeSelect.value;
    if (!isThemeId(selected)) return;
    theme = selected;
    applyTheme(theme);
    saveTheme(theme);
    populateLevelSelect();
    render();
  });
  required<HTMLElement>('engine-status').closest('.engine-card')?.addEventListener('click', () => {
    if (engineFailed || !engine.activeBackend) restartEngineWarmup('manual');
    else if (game.status === 'active' && game.currentPlayer !== game.childColor) void runAiTurn();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      render();
      recoverEngineAfterForeground();
      if (!aiBusy && game.status === 'active' && game.currentPlayer !== game.childColor) void runAiTurn();
    } else {
      pageWasHidden = true;
    }
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted || pageWasHidden) recoverEngineAfterForeground();
  });
  window.addEventListener('focus', () => {
    if (pageWasHidden) recoverEngineAfterForeground();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isFullscreenActive()) exitFullscreen();
  });
  window.addEventListener('pagehide', () => {
    try { saveGame(game); } catch { /* Safari may deny storage in private mode. */ }
  });
}

function askResign(): void {
  if (game.status !== 'active' || aiBusy) return;
  askForConfirmation('确定要认输吗？', '这盘棋会结束，但随时可以再下一盘。', () => {
    game = resignGame(game, game.childColor);
    finishGame();
  });
}

function handlePass(): void {
  if (aiBusy || game.status !== 'active' || game.currentPlayer !== game.childColor) return;
  const result = passTurn(game, game.childColor);
  if (!result.ok) return;
  game = result.state;
  clearHint();
  commitGame();
  render();
  elements.boardMessage.textContent = '你停了一手。';
  if (game.status === 'finished') {
    finishGame();
    return;
  }
  void runAiTurn();
}

function askRestart(title = '要开始新对局吗？'): void {
  if (aiBusy) return;
  if (game.status === 'active' && game.moves.length > 0) {
    askForConfirmation(title, '先看一下这盘棋现在的结果，再开始新局。', showRestartResult);
  } else showNewGameDialog();
}

async function toggleBoardFullscreen(): Promise<void> {
  if (isFullscreenActive()) exitFullscreen();
  else enterFullscreen();
}

function enterFullscreen(): void {
  boardImmersiveActive = true;
  elements.boardCard.classList.add('is-immersive');
  document.body.classList.add('board-immersive');
  renderFullscreenButton();
}

function exitFullscreen(): void {
  boardImmersiveActive = false;
  elements.boardCard.classList.remove('is-immersive');
  document.body.classList.remove('board-immersive');
  renderFullscreenButton();
}

function isFullscreenActive(): boolean {
  return boardImmersiveActive;
}

function renderFullscreenButton(): void {
  const active = isFullscreenActive();
  elements.fullscreenButton.setAttribute('aria-label', active ? '退出棋盘全屏' : '棋盘全屏');
  elements.fullscreenButton.title = active ? '退出棋盘全屏' : '棋盘全屏';
  elements.fullscreenButton.firstElementChild!.textContent = active ? '×' : '⛶';
  window.setTimeout(() => boardView.refresh(), 80);
  window.setTimeout(() => boardView.refresh(), 260);
}

function populateLevelSelect(): void {
  elements.levelSelect.replaceChildren();
  for (const typedLevel of Object.keys(DIFFICULTY_LEVELS).map(Number) as DifficultyLevel[]) {
    const option = document.createElement('option');
    const difficulty = DIFFICULTY_LEVELS[typedLevel];
    option.value = String(typedLevel);
    option.textContent = `第 ${typedLevel} 级 · ${companionName(typedLevel)} · ${difficulty.name}`;
    elements.levelSelect.append(option);
  }
}

function populateThemeSelect(): void {
  for (const typedTheme of Object.keys(THEMES) as ThemeId[]) {
    const option = document.createElement('option');
    const themeConfig = THEMES[typedTheme];
    option.value = typedTheme;
    option.textContent = `${themeConfig.name} · ${themeConfig.description}`;
    elements.themeSelect.append(option);
  }
}

function applyTheme(nextTheme: ThemeId): void {
  document.body.dataset.theme = nextTheme;
  elements.rewardImage.src = THEMES[nextTheme].rewardImage;
  elements.rewardText.textContent = THEMES[nextTheme].rewardText;
  elements.themePreviewImage.src = THEMES[nextTheme].rewardImage;
  boardView.refresh();
}

function loadTheme(): ThemeId {
  const requested = new URLSearchParams(location.search).get('theme');
  if (isThemeId(requested)) return requested;
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeId(saved) ? saved : DEFAULT_THEME_ID;
  } catch {
    return DEFAULT_THEME_ID;
  }
}

function saveTheme(nextTheme: ThemeId): void {
  try { localStorage.setItem(THEME_STORAGE_KEY, nextTheme); } catch { /* Theme is cosmetic only. */ }
}

function companionName(level: DifficultyLevel): string {
  if (level === 1) return theme === 'dinosaur' ? '慢慢小龙' : '荷叶呱呱';
  if (level === 2) return theme === 'dinosaur' ? '扭断霸王龙' : '跳跳断点蛙';
  if (level === 3) return theme === 'dinosaur' ? '陪练小角龙' : '陪练青蛙';
  if (level === 4) return theme === 'dinosaur' ? '认真迅猛龙' : '认真树蛙';
  return theme === 'dinosaur' ? '最强暴龙' : '最强蛙王';
}

function currentDifficultyLevel(): DifficultyLevel {
  return game.difficulty.manualLevel;
}

function canChildAct(): boolean {
  return game.status === 'active' && !aiBusy && game.currentPlayer === game.childColor;
}

function safeSaveAdaptive(): void {
  try { saveAdaptiveProfile(adaptiveProfile); } catch { /* Keep the in-memory profile. */ }
}

type DebugSearch = {
  level: DifficultyLevel;
  requestedVisits: number;
  maxTimeMs: number;
  searchMs: number;
  rootVisits: number;
  backend: string | null;
  candidateCount: number;
  searchedCandidateCount?: number;
  chosen: {
    x: number;
    y: number;
    order: number;
    prior?: number;
    policyOnly?: boolean;
    winRateLost?: number;
    scoreLoss?: number;
    difficulty?: CandidateDifficultyExplanation | null;
  } | null;
};

type PositionInsight = {
  childWinRate: number;
  childScoreLead: number;
  visits: number;
  status: string;
};

type TeachingTip = {
  title: string;
  text: string;
  audioKey?: string;
};

type HintTip = TeachingTip & {
  point: string;
};

type StickerKind = 'capture' | 'escape' | 'connect' | 'corner' | 'edge';

type CoachSticker = {
  kind: StickerKind;
  text: string;
  point: { x: number; y: number };
};

function createPositionInsight(analysis: KataGoAnalysisPayload, childColor: Player): PositionInsight {
  const childWinRate = childColor === 'black' ? analysis.rootWinRate : 1 - analysis.rootWinRate;
  const childScoreLead = childColor === 'black' ? analysis.rootScoreLead : -analysis.rootScoreLead;
  return {
    childWinRate: Math.max(0, Math.min(1, childWinRate)),
    childScoreLead,
    visits: analysis.rootVisits,
    status: positionStatus(childWinRate, childScoreLead),
  };
}

function createAiTeachingTip(move: PlayedMove, candidate: EngineCandidate | null): TeachingTip {
  if (move.pass) return { title: '小伙伴停一手。', text: '它觉得现在没有很急的地方。', audioKey: 'ai-pass' };
  if (move.captured > 0) return { title: '小伙伴提子了。', text: '被围住没有气的棋，就会被提走。', audioKey: 'ai-capture' };
  if (candidate?.order === 0) return { title: '这是一手好棋。', text: 'AI 选择了最想下的点，通常是在抢大地方或照顾弱棋。', audioKey: 'ai-strong' };
  if (candidate && candidate.order <= 2) return { title: '这手很正常。', text: '它不是最强的一手，但还是在下大地方。', audioKey: 'ai-normal' };
  return { title: '小伙伴放慢了。', text: '这手给你留了机会，先找它旁边有没有弱点。', audioKey: 'ai-gentle' };
}

function createBestMoveHint(candidate: EngineCandidate): HintTip {
  if (isPassCandidate(candidate)) {
    return { point: '停一手', title: '最强提示是停一手。', text: 'B10 判断现在不用补棋，停一手更稳。', audioKey: 'hint-pass' };
  }
  const point = formatBoardPoint(candidate.x, candidate.y);
  const localShape = localShapeReason(candidate);
  const preview = playMove(game, candidate.x, candidate.y, game.currentPlayer);
  const title = preview.ok && preview.move.captured > 0 ? '下这里，可以提子。' : '下这里，胜率最好。';
  return {
    point,
    title,
    text: `${point}。${localShape.text}`,
    audioKey: localShape.audioKey,
  };
}

function localShapeReason(candidate: EngineCandidate): { text: string; audioKey: string } {
  const x = candidate.x;
  const y = candidate.y;
  const ownNeighbors = adjacentStoneCount(x, y, game.currentPlayer);
  const opponentNeighbors = adjacentStoneCount(x, y, game.currentPlayer === 'black' ? 'white' : 'black');
  if (ownNeighbors > 0) return { text: '连住自己的棋，更安全。', audioKey: 'hint-connect' };
  if (opponentNeighbors > 0) return { text: '靠近对方的棋，可以压住它。', audioKey: 'hint-pressure' };
  if ((x <= 3 || x >= 15) && (y <= 3 || y >= 15)) return { text: '角上容易围空，先占这里。', audioKey: 'hint-corner' };
  if (x <= 3 || x >= 15 || y <= 3 || y >= 15) return { text: '边上容易围空，也容易发展。', audioKey: 'hint-edge' };
  return { text: '这里能照顾中间，方便下一步连接。', audioKey: 'hint-center' };
}

function adjacentStoneCount(x: number, y: number, player: Player): number {
  const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
  let count = 0;
  for (const [dx, dy] of neighbors) {
    if (game.board[y + dy]?.[x + dx] === player) count += 1;
  }
  return count;
}

function formatBoardPoint(x: number, y: number): string {
  return `第 ${y + 1} 行，第 ${x + 1} 列`;
}

function setTeachingTip(tip: TeachingTip): void {
  if (!teachingEnabled()) return;
  teachingTip = tip;
  renderTeaching();
}

function renderTeaching(): void {
  elements.teachingCard.hidden = true;
  elements.fsTeachingCard.hidden = true;
  elements.teachingTitle.textContent = teachingTip.title;
  elements.teachingText.textContent = teachingTip.text;
  elements.fsTeachingTitle.textContent = teachingTip.title;
  elements.fsTeachingText.textContent = teachingTip.text;
}

function renderFullscreenHint(): void {
  elements.fsHintCard.hidden = !fullscreenHint;
  if (!fullscreenHint) return;
  elements.fsHintPoint.textContent = fullscreenHint.point;
  elements.fsHintTitle.textContent = fullscreenHint.title;
  elements.fsHintText.textContent = fullscreenHint.text;
}

function clearHint(): void {
  fullscreenHint = null;
  boardHintPoint = null;
  boardHintSource = null;
  hideSticker();
}

function teachingEnabled(): boolean {
  const level = currentDifficultyLevel();
  return level >= 1 && level <= 2;
}

function maybeShowAutoSticker(analysis: KataGoAnalysisPayload): void {
  if (!teachingEnabled() || aiBusy || game.status !== 'active' || game.currentPlayer !== game.childColor) return;
  if (fullscreenHint || game.moves.length - lastStickerMove < nextStickerGap) return;
  const sticker = chooseAutoSticker(analysis);
  if (!sticker || sticker.kind === lastStickerKind) return;
  showSticker(sticker);
}

function chooseAutoSticker(analysis: KataGoAnalysisPayload): CoachSticker | null {
  const isLegalHint = (candidate: EngineCandidate): boolean =>
    isPassCandidate(candidate) || isLegalMove(game, candidate.x, candidate.y, game.currentPlayer);
  const suggested = chooseHintCandidate(analysis.moves, isLegalHint);
  return suggested && !isPassCandidate(suggested) ? stickerForCandidate(suggested, '试试') : null;
}

function stickerForCandidate(candidate: EngineCandidate, fallback: string): CoachSticker {
  const point = { x: candidate.x, y: candidate.y };
  const capture = playMove(game, candidate.x, candidate.y, game.childColor);
  if (capture.ok && capture.move.captured > 0) return { kind: 'capture', text: '拿掉', point };
  if (adjacentStoneCount(candidate.x, candidate.y, game.childColor) >= 2) return { kind: 'connect', text: '牵手', point };
  if ((candidate.x <= 3 || candidate.x >= 15) && (candidate.y <= 3 || candidate.y >= 15)) return { kind: 'corner', text: '去角上', point };
  if (candidate.x <= 3 || candidate.x >= 15 || candidate.y <= 3 || candidate.y >= 15) return { kind: 'edge', text: '去边上', point };
  return { kind: 'connect', text: fallback.length <= 4 ? fallback : '试试', point };
}

function showSticker(sticker: CoachSticker, options: { force?: boolean } = {}): void {
  const position = boardView.pointPosition(sticker.point);
  const shellSize = elements.canvas.clientWidth;
  const offsetX = sticker.point.x >= 16 ? -position.cell * 2.3 : position.cell * 1.05;
  const offsetY = sticker.point.y <= 2 ? position.cell * 1.05 : -position.cell * 1.45;
  const x = Math.max(8, Math.min(shellSize - 78, position.x + offsetX));
  const y = Math.max(8, Math.min(shellSize - 42, position.y + offsetY));

  elements.coachStickerText.textContent = sticker.text;
  elements.coachSticker.className = `coach-sticker sticker-${sticker.kind}`;
  elements.coachSticker.style.left = `${x}px`;
  elements.coachSticker.style.top = `${y}px`;
  elements.coachSticker.hidden = false;
  void elements.coachSticker.offsetWidth;
  elements.coachSticker.classList.add('sticker-show');
  boardHintPoint = sticker.point;
  boardHintSource = 'sticker';
  refreshBoardHintMarker();

  if (stickerTimer !== null) window.clearTimeout(stickerTimer);
  stickerTimer = window.setTimeout(hideSticker, options.force ? 2400 : 2000);
  lastStickerMove = game.moves.length;
  nextStickerGap = 4 + ((game.moves.length + sticker.point.x + sticker.point.y) % 3);
  lastStickerKind = sticker.kind;
}

function hideSticker(): void {
  if (stickerTimer !== null) window.clearTimeout(stickerTimer);
  stickerTimer = null;
  elements.coachSticker.hidden = true;
  elements.coachSticker.classList.remove('sticker-show');
  if (boardHintSource === 'sticker') {
    boardHintPoint = null;
    boardHintSource = null;
    refreshBoardHintMarker();
  }
}

function refreshBoardHintMarker(): void {
  const childTurn = game.status === 'active' && game.currentPlayer === game.childColor;
  const locked = aiBusy || !childTurn || game.status !== 'active';
  boardView.update(game.board, game.moves.at(-1) ?? null, locked, boardHintPoint);
}

function positionStatus(winRate: number, scoreLead: number): string {
  if (winRate >= 0.62 || scoreLead >= 6) return '你稍好';
  if (winRate <= 0.38 || scoreLead <= -6) return 'AI 稍好';
  if (winRate >= 0.54 || scoreLead >= 2) return '你有机会';
  if (winRate <= 0.46 || scoreLead <= -2) return '需要小心';
  return '很接近';
}

function childNextStep(insight: PositionInsight): string {
  if (game.moves.length <= 20) return openingGuideTip().title;
  if (insight.childScoreLead <= -6) return '先补弱棋';
  if (insight.childScoreLead >= 6) return '稳稳连住';
  return '找大地方';
}

function openingGuideTip(): TeachingTip {
  const moveCount = game.moves.length;
  if (moveCount < 6) return { title: '先占角', text: '角上最容易围空，先找空的角。', audioKey: 'hint-corner' };
  if (moveCount < 12) return { title: '走到边', text: '角下完以后，看边上有没有大地方。', audioKey: 'hint-edge' };
  if (moveCount < 18) return { title: '连住棋', text: '自己的棋靠近时，可以先连起来。', audioKey: 'hint-connect' };
  return { title: '看弱棋', text: '找一找哪块棋气少，先照顾它。', audioKey: 'child-watch' };
}

function formatScoreLead(scoreLead: number): string {
  if (Math.abs(scoreLead) < 0.5) return '接近';
  const prefix = scoreLead > 0 ? '+' : '';
  return `${prefix}${scoreLead.toFixed(1)}目`;
}

function realtimeScoreText(): string {
  const result = game.status === 'finished' && game.result ? game.result : scoreChineseArea(game.board);
  if (game.status === 'finished') return result.winner === game.childColor ? '你赢了' : '小伙伴赢了';
  const childScore = game.childColor === 'black' ? result.blackScore ?? 0 : result.whiteScore ?? 0;
  const aiScore = game.childColor === 'black' ? result.whiteScore ?? 0 : result.blackScore ?? 0;
  const childLead = childScore - aiScore;
  if (Math.abs(childLead) < 6.5) return '很接近';
  return childLead > 0 ? `估算你领先 ${formatScoreLead(childLead)}` : `估算小伙伴领先 ${formatScoreLead(-childLead)}`;
}

function boardStoneCounts(): Record<Player, number> {
  const counts: Record<Player, number> = { black: 0, white: 0 };
  for (const row of game.board) {
    for (const point of row) {
      if (point) counts[point] += 1;
    }
  }
  return counts;
}

function recordDebugSearch(entry: DebugSearch): void {
  if (!debugEnabled) return;
  const target = globalThis as typeof globalThis & { __GOKIDB10_DEBUG__?: { searches: DebugSearch[] } };
  const diagnostics = target.__GOKIDB10_DEBUG__ ?? { searches: [] };
  diagnostics.searches.push(entry);
  target.__GOKIDB10_DEBUG__ = diagnostics;
}

function isPassCandidate(candidate: { x: number; y: number }): boolean {
  return candidate.x < 0 && candidate.y < 0;
}

function assessmentKey(state: GameState): string {
  return `${state.id}:${state.moves.length}`;
}

function assertCurrentRun(serial: number, gameId: string): void {
  if (serial !== runSerial || game.id !== gameId) throw new DOMException('对局已经改变', 'AbortError');
}

function playerName(player: Player): string {
  return player === 'black' ? '黑' : '白';
}

function failureMessage(reason: string): string {
  if (reason === 'occupied') return '这里已经有棋子啦';
  if (reason === 'suicide') return '这手棋会没有气，换个地方吧';
  if (reason === 'ko') return '劫争不能马上提回来';
  return '这里现在不能下';
}

function showToast(message: string): void {
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { elements.toast.hidden = true; }, 1800);
}

function show(element: HTMLElement): void {
  element.hidden = false;
}

function hide(element: HTMLElement): void {
  element.hidden = true;
}

function required<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`缺少页面元素 #${id}`);
  return element as T;
}
