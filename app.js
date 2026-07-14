const fixedBoardSize = 19;
let size = fixedBoardSize;
const empty = 0;
const black = 1;
const white = 2;
const legacyStorageKey = "gokidcoach-web-state-v1";
const profileStoreKey = "gokidcoach-web-profile-store-v2";
const currentGameKeyPrefix = "gokidcoach-web-current-game-v2-";
const komi = 7;
const supportedLanguages = ["zh", "yue", "en", "ja", "ko"];
const defaultInitialAiLevel = 980;
const minimumInitialAiLevel = 640;
const detailedMoveDiagnosticCap = 100;
const detailedCandidateDiagnosticCap = 20;
const rawStageTimingCap = 100;
const recoverySnapshotInterval = 20;
const maxStrengthMode = "MAX_STRENGTH_FIXED";
const difficultyPresets = [
  { value: "beginner", level: 720, key: "difficultyBeginner" },
  { value: "basic", level: 840, key: "difficultyIntermediate" },
  { value: "advanced", level: 980, key: "difficultyStrong" },
  { value: "adaptive", level: 880, key: "difficultyChallenge" }
];
const compactLabels = {
  zh: { difficulty: "难度", winrate: "胜率", more: "更多", less: "收起" },
  yue: { difficulty: "難度", winrate: "勝率", more: "更多", less: "收起" },
  en: { difficulty: "Level", winrate: "Win", more: "More", less: "Less" },
  ja: { difficulty: "難度", winrate: "勝率", more: "その他", less: "閉じる" },
  ko: { difficulty: "난이도", winrate: "승률", more: "더보기", less: "접기" }
};

const i18n = {
  zh: {
    appTitle: "围棋陪练", subtitle: "{size} 路儿童自适应对弈网页版", thinking: "AI 思考中...",
    setup: "学习设置", child: "孩子", newChild: "新孩子名字", add: "添加", board: "棋盘", language: "语言", stage: "阶段",
    board9: "9 路入门", board13: "13 路进阶", board19: "19 路完整",
    difficulty: "陪练模式", difficultyBeginner: "入门陪练", difficultyIntermediate: "基础陪练", difficultyStrong: "进阶陪练", difficultyChallenge: "自适应陪练",
    statusStart: "黑棋先行，请孩子落子", statusDone: "本局已结束，可以新开一局", statusBlack: "轮到孩子落子", statusWhite: "轮到 AI 落子",
    moves: "手数", childCaptures: "孩子吃子", aiCaptures: "AI吃子", profile: "能力档案", rating: "总体棋力", opening: "布局", fighting: "战斗", stability: "稳定", played: "已下", winRate: "胜率", aiLevel: "AI强度",
    hint: "提示", explain: "解释局面", pass: "停一手", undo: "悔棋", finish: "结束", newGame: "新局", exportSgf: "导出SGF", parent: "家长查看",
    review: "本局复盘", reviewEmpty: "完成一局后，这里会给 3 条简短反馈。", recent: "最近对局", reset: "重置",
    parentAvgMoves: "平均手数", parentAvgLevel: "平均强度", parentTrend: "最近趋势", reward: "赢棋奖励", remoteAi: "远程AI地址", kataGo: "KataGo分析地址", save: "保存设置", close: "关闭",
    confirmEndTitle: "确认终局？", estimating: "正在估算形势...", confirmEnd: "确认结束", continueGame: "继续下", great: "真棒", continue: "继续",
    enlightenment: "启蒙", beginner: "入门", intermediate: "进阶", battle: "战斗", fullBoard: "完整棋盘", challenge: "挑战",
    goalEnlightenment: "先学会找气、吃子和连接。", goalBeginner: "练习少被吃、能下完整一盘。", goalIntermediate: "练习角、边、中腹的选择。", goalBattle: "练习打吃、救弱棋和切断。", goalFullBoard: "把布局、中盘和收官连起来。", goalChallenge: "接近认真对局，减少随手棋。",
    childWin: "孩子胜", aiWin: "AI胜", suitable: "合适", easy: "偏轻松", hard: "偏困难", none: "暂无",
    undoDone: "已悔棋，可以继续落子。", switchBoardConfirm: "切换棋盘会开始一局新棋。继续吗？", endEstimate: "估算：孩子 {black} 目，AI {white} 目。确认后会记录本局并调整 AI 强度。",
    aiStronger: "下一局 AI 会增强。", aiSofter: "下一局 AI 会降低压力。", aiSame: "下一局 AI 强度基本保持。", resultChild: "结果：孩子胜，综合表现 {score} 分。", resultAi: "结果：AI 胜，综合表现 {score} 分。",
    bestCapture: "最好一手：{move} 吃到 {captures} 子。", bestOpening: "最好一手：开局方向不错，能主动占角和边。", bestFinish: "最好一手：能坚持把棋下完，就是这局最重要的进步。",
    dangerCapture: "最危险点：这局被 AI 吃子较多，下次先保护气少的棋。", dangerShort: "最危险点：手数偏少，容易没进入收官就结束。", dangerCareless: "最危险点：中后盘要继续减少随手棋。",
    nextCountLiberties: "下次目标：每手棋先数一数自己的气。", nextOpening: "下次目标：开局优先占角，再走边。", nextStage: "下次目标：保持 {stage} 阶段节奏，{change}",
    noHint: "现在没有合适的提示，可以停一手或结束评估", hintStatus: "提示：可以考虑 {move}。{reason}", hintPoint: "提示点：{move}",
    reasonFight: "这里靠近白棋，可以练习战斗和连接。", reasonLiberties: "这里气比较多，不容易马上被吃。", reasonCareful: "这里可以下，但要注意后续补气。",
    explainStage: "当前是 {size} 路，学习阶段：{stage}。", weakBlack: "黑棋有 {count} 块棋气偏紧，优先找连接或补气。", blackSafe: "黑棋暂时没有明显危险的弱棋，可以找大场或攻击白棋。", weakWhite: "白棋有 {count} 块棋气少，可以看看有没有打吃或包围。",
    parentNoGames: "完成几局后，这里会显示趋势。", parentWinRate: "最近 {games} 局胜率 {rate}%。", parentLong: "手数足够，说明孩子愿意进入中后盘。", parentShort: "平均手数还偏短，可以鼓励孩子多下到收官。", parentFit: "当前 AI 强度接近合适区间。", parentEasy: "孩子最近赢得多，AI 会继续上调。", parentHard: "孩子最近输得多，AI 会继续下调。", invalidMove: "此处不能落子，可能是禁自杀或劫争", settingsSaved: "家长设置已保存", remoteNotConfigured: "远程 AI 未配置", remoteConnected: "远程 AI 已连接", remoteFailed: "远程 AI 连接失败，已回退本地 AI", historyLine: "{result} {boardSize}路 {moves}手 {stage} 强度{level} 表现{performance}",
    taskTitle: "今日任务", taskMoves: "下满 {target} 手，练习把棋下完整。", taskCaptures: "孩子吃到 {target} 子，练习发现打吃。", taskSafe: "AI 吃子不超过 {target} 子，先保护弱棋。", taskCorners: "前 {limit} 手至少占 {target} 个角。", taskDone: "已完成", taskProgress: "{done}/{target}", aiAnalysis: "AI 分析", childWinrate: "孩子胜率", scoreLead: "目差", bestMove: "推荐", analysisWaiting: "本地实时估算中。", analysisLocal: "本地实时估算，不等同正式数目。", analysisFromRemote: "远程分析已更新。", localSuggestion: "看局面", leadAhead: "孩子明显领先，可以稳定收官。", leadClose: "局面接近，先保护弱棋再找大场。", leadBehind: "AI 领先，优先找打吃和救弱棋。", endAhead: "孩子优势已经很大，可以点“结束并评估”确认胜负。", endBehind: "这局比较困难，可以结束复盘后重开一局。", weakGroupReview: "最需要保护：{move} 附近这块黑棋气少，先补气或连接。", bestMoveReview: "本局亮点：{move} 附近的落子价值最高。", captureReview: "战斗提醒：AI 吃子更多，下局先看自己的气。", backupExport: "导出备份", backupImport: "导入备份", backupDone: "备份已导入", backupFailed: "备份文件无法导入"
  },
  yue: {
    appTitle: "圍棋陪練", subtitle: "{size} 路小朋友自適應對弈網頁版", thinking: "AI 諗緊...",
    setup: "學習設定", child: "小朋友", newChild: "新小朋友名", add: "新增", board: "棋盤", language: "語言", stage: "階段",
    board9: "9 路入門", board13: "13 路進階", board19: "19 路完整",
    difficulty: "初始難度", difficultyBeginner: "入門", difficultyIntermediate: "進階", difficultyStrong: "強手", difficultyChallenge: "挑戰",
    statusStart: "黑棋先行，請小朋友落子", statusDone: "呢局已結束，可以開新局", statusBlack: "輪到小朋友落黑棋", statusWhite: "輪到 AI 落白棋",
    moves: "手數", childCaptures: "小朋友食子", aiCaptures: "AI食子", profile: "能力檔案", rating: "整體棋力", opening: "布局", fighting: "戰鬥", stability: "穩定", played: "已下", winRate: "勝率", aiLevel: "AI強度",
    hint: "提示一手", explain: "講解局面", pass: "停一手", undo: "悔棋", finish: "結束並評估", newGame: "新局", exportSgf: "匯出SGF", parent: "家長查看",
    review: "本局復盤", reviewEmpty: "完成一局後，呢度會畀 3 條簡短回饋。", recent: "最近對局", reset: "重置",
    parentAvgMoves: "平均手數", parentAvgLevel: "平均強度", parentTrend: "最近走勢", reward: "贏棋獎勵", remoteAi: "遠程AI地址", kataGo: "KataGo分析地址", save: "儲存設定", close: "關閉",
    confirmEndTitle: "確認終局？", estimating: "估算緊形勢...", confirmEnd: "確認結束", continueGame: "繼續下", great: "好叻", continue: "繼續",
    enlightenment: "啟蒙", beginner: "入門", intermediate: "進階", battle: "戰鬥", fullBoard: "完整棋盤", challenge: "挑戰",
    goalEnlightenment: "先學識搵氣、食子同連接。", goalBeginner: "練習少啲被食，完整下完一局。", goalIntermediate: "練習角、邊、中腹點揀。", goalBattle: "練習打食、救弱棋同切斷。", goalFullBoard: "將布局、中盤同收官連埋。", goalChallenge: "接近認真對局，減少隨手棋。",
    childWin: "小朋友勝", aiWin: "AI勝", suitable: "合適", easy: "偏輕鬆", hard: "偏難", none: "暫無",
    undoDone: "已悔棋，可以繼續落子。", switchBoardConfirm: "切換棋盤會開一局新棋。繼續嗎？", endEstimate: "估算：小朋友 {black} 目，AI {white} 目。確認後會記錄本局並調整 AI 強度。",
    aiStronger: "下一局 AI 會加強。", aiSofter: "下一局 AI 會減低壓力。", aiSame: "下一局 AI 強度基本保持。", resultChild: "結果：小朋友勝，綜合表現 {score} 分。", resultAi: "結果：AI 勝，綜合表現 {score} 分。",
    bestCapture: "最好一手：{move} 食到 {captures} 子。", bestOpening: "最好一手：開局方向唔錯，識得主動佔角同邊。", bestFinish: "最好一手：肯堅持下完整局，就係今局最重要進步。",
    dangerCapture: "最危險位：今局畀 AI 食子較多，下次先保護氣少嘅棋。", dangerShort: "最危險位：手數偏少，容易未到收官就結束。", dangerCareless: "最危險位：中後盤要繼續減少隨手棋。",
    nextCountLiberties: "下次目標：每手棋先數一數自己嘅氣。", nextOpening: "下次目標：開局優先佔角，再行邊。", nextStage: "下次目標：保持 {stage} 階段節奏，{change}",
    noHint: "而家冇合適提示，可以停一手或者結束評估", hintStatus: "提示：可以考慮 {move}。{reason}", hintPoint: "提示點：{move}",
    reasonFight: "呢度近白棋，可以練戰鬥同連接。", reasonLiberties: "呢度氣比較多，唔容易即刻畀人食。", reasonCareful: "呢度可以落，但之後要留意補氣。",
    explainStage: "而家係 {size} 路，學習階段：{stage}。", weakBlack: "黑棋有 {count} 塊棋氣偏緊，優先搵連接或者補氣。", blackSafe: "黑棋暫時冇明顯危險弱棋，可以搵大場或者攻白棋。", weakWhite: "白棋有 {count} 塊棋氣少，可以睇吓有冇打食或者包圍。",
    parentNoGames: "完成幾局後，呢度會顯示走勢。", parentWinRate: "最近 {games} 局勝率 {rate}%。", parentLong: "手數足夠，表示小朋友願意進入中後盤。", parentShort: "平均手數仲偏短，可以鼓勵下到收官。", parentFit: "當前 AI 強度接近合適區間。", parentEasy: "小朋友最近贏得多，AI 會繼續上調。", parentHard: "小朋友最近輸得多，AI 會繼續下調。", invalidMove: "呢度唔可以落，可能係禁自殺或者劫爭", settingsSaved: "家長設定已儲存", remoteNotConfigured: "遠程 AI 未設定", remoteConnected: "遠程 AI 已連接", remoteFailed: "遠程 AI 連接失敗，已回退本地 AI", childWinrate: "小朋友勝率", analysisLocal: "本地即時估算，唔等同正式數目。", analysisFromRemote: "遠程分析已更新。", localSuggestion: "睇局面", leadAhead: "小朋友明顯領先，可以穩定收官。", leadClose: "局面接近，先保護弱棋再搵大場。", leadBehind: "AI 領先，優先搵打食同救弱棋。", endAhead: "小朋友優勢好大，可以撳「結束並評估」確認勝負。", endBehind: "呢局比較難，可以結束復盤再開新局。", weakGroupReview: "最需要保護：{move} 附近呢塊黑棋氣少，先補氣或者連接。", bestMoveReview: "本局亮點：{move} 附近嘅落子價值最高。", historyLine: "{result} {boardSize}路 {moves}手 {stage} 強度{level} 表現{performance}"
  },
  en: {
    appTitle: "Go Coach", subtitle: "{size}x{size} adaptive Go for kids", thinking: "AI thinking...",
    setup: "Learning", child: "Child", newChild: "New child name", add: "Add", board: "Board", language: "Language", stage: "Stage",
    board9: "9x9 Beginner", board13: "13x13 Next", board19: "19x19 Full",
    difficulty: "Initial level", difficultyBeginner: "Beginner", difficultyIntermediate: "Intermediate", difficultyStrong: "Strong", difficultyChallenge: "Challenge",
    statusStart: "Black plays first. Place a stone.", statusDone: "Game finished. Start a new game.", statusBlack: "Child to play black", statusWhite: "AI to play white",
    moves: "Moves", childCaptures: "Child captures", aiCaptures: "AI captures", profile: "Skill Profile", rating: "Rating", opening: "Opening", fighting: "Fighting", stability: "Stability", played: "Games", winRate: "Win rate", aiLevel: "AI level",
    hint: "Hint", explain: "Explain", pass: "Pass", undo: "Undo", finish: "Finish", newGame: "New Game", exportSgf: "Export SGF", parent: "Parent View",
    review: "Review", reviewEmpty: "Finish a game to get 3 short notes.", recent: "Recent Games", reset: "Reset",
    parentAvgMoves: "Avg moves", parentAvgLevel: "Avg level", parentTrend: "Trend", reward: "Win reward", remoteAi: "Remote AI URL", kataGo: "KataGo URL", save: "Save", close: "Close",
    confirmEndTitle: "End game?", estimating: "Estimating...", confirmEnd: "End", continueGame: "Continue", great: "Great", continue: "Continue",
    enlightenment: "Starter", beginner: "Beginner", intermediate: "Intermediate", battle: "Fighting", fullBoard: "Full board", challenge: "Challenge",
    goalEnlightenment: "First learn liberties, captures, and connection.", goalBeginner: "Avoid being captured and finish full games.", goalIntermediate: "Practice choosing corner, side, and center moves.", goalBattle: "Practice atari, saving weak groups, and cutting.", goalFullBoard: "Connect opening, middle game, and endgame.", goalChallenge: "Play serious games and reduce careless moves.",
    childWin: "Child wins", aiWin: "AI wins", suitable: "Good fit", easy: "Too easy", hard: "Too hard", none: "None",
    undoDone: "Undone. You can keep playing.", switchBoardConfirm: "Changing board size starts a new game. Continue?", endEstimate: "Estimate: Child {black}, AI {white}. Ending will save this game and adjust AI level.",
    aiStronger: "AI will get stronger next game.", aiSofter: "AI will lower the pressure next game.", aiSame: "AI level will stay about the same.", resultChild: "Result: child wins, performance {score}.", resultAi: "Result: AI wins, performance {score}.",
    bestCapture: "Best move: {move} captured {captures} stones.", bestOpening: "Best move: the opening direction was good.", bestFinish: "Best move: finishing the game was the most important progress.",
    dangerCapture: "Danger point: AI captured many stones. Protect low-liberty groups first.", dangerShort: "Danger point: the game ended early before endgame practice.", dangerCareless: "Danger point: reduce careless moves in the middle and endgame.",
    nextCountLiberties: "Next goal: count your liberties before each move.", nextOpening: "Next goal: take corners first, then sides.", nextStage: "Next goal: keep the {stage} rhythm. {change}",
    noHint: "No good hint now. You can pass or finish.", hintStatus: "Hint: consider {move}. {reason}", hintPoint: "Hint point: {move}",
    reasonFight: "This is near white stones, good for fighting and connecting.", reasonLiberties: "This point has many liberties and is hard to capture right away.", reasonCareful: "This move is playable, but watch the liberties next.",
    explainStage: "Current board: {size}x{size}. Stage: {stage}.", weakBlack: "Black has {count} weak groups. Connect or add liberties first.", blackSafe: "Black has no obvious weak group. Look for big points or attack white.", weakWhite: "White has {count} low-liberty groups. Look for atari or surrounding moves.",
    parentNoGames: "Finish a few games to see trends.", parentWinRate: "Recent {games} game win rate: {rate}%.", parentLong: "Move count is good; the child is reaching middle/endgame.", parentShort: "Average game length is short; encourage playing to endgame.", parentFit: "Current AI level is close to a good fit.", parentEasy: "The child is winning often, so AI will rise.", parentHard: "The child is losing often, so AI will drop.", invalidMove: "Illegal move: suicide or ko may apply.", settingsSaved: "Parent settings saved", remoteNotConfigured: "Remote AI not configured", remoteConnected: "Remote AI connected", remoteFailed: "Remote AI failed; using local AI", childWinrate: "Child win rate", analysisLocal: "Local live estimate, not official scoring.", analysisFromRemote: "Remote analysis updated.", localSuggestion: "Review board", leadAhead: "The child is clearly ahead. Play steady endgame.", leadClose: "The game is close. Protect weak groups before big points.", leadBehind: "AI is ahead. Look for atari and save weak groups.", endAhead: "The child is far ahead. You can tap Finish to confirm the result.", endBehind: "This game is difficult. You can finish, review, and start again.", weakGroupReview: "Most urgent: the black group near {move} has few liberties. Add liberties or connect first.", bestMoveReview: "Highlight: the move near {move} had the best value.", historyLine: "{result} {boardSize}x{boardSize} {moves} moves {stage} level {level} score {performance}"
  },
  ja: {
    appTitle: "囲碁コーチ", subtitle: "{size} 路 子ども向け自動調整対局", thinking: "AI 思考中...",
    setup: "学習設定", child: "子ども", newChild: "新しい名前", add: "追加", board: "盤", language: "言語", stage: "段階",
    board9: "9 路 入門", board13: "13 路 中級", board19: "19 路 完整",
    difficulty: "初期難度", difficultyBeginner: "入門", difficultyIntermediate: "中級", difficultyStrong: "強め", difficultyChallenge: "挑戦",
    statusStart: "黒番です。石を置いてください", statusDone: "対局終了。新しい対局を始められます", statusBlack: "子どもの黒番", statusWhite: "AI の白番",
    moves: "手数", childCaptures: "子どもの取り", aiCaptures: "AIの取り", profile: "能力プロフィール", rating: "総合棋力", opening: "序盤", fighting: "戦い", stability: "安定", played: "対局数", winRate: "勝率", aiLevel: "AI強度",
    hint: "一手ヒント", explain: "局面説明", pass: "パス", undo: "待った", finish: "終了して評価", newGame: "新局", exportSgf: "SGF出力", parent: "保護者",
    review: "本局レビュー", reviewEmpty: "一局終えると、ここに短い助言が出ます。", recent: "最近の対局", reset: "リセット",
    parentAvgMoves: "平均手数", parentAvgLevel: "平均強度", parentTrend: "最近傾向", reward: "勝利報酬", remoteAi: "リモートAI URL", kataGo: "KataGo分析URL", save: "保存", close: "閉じる",
    confirmEndTitle: "終局しますか？", estimating: "形勢を推定中...", confirmEnd: "終了", continueGame: "続ける", great: "すごい", continue: "続ける",
    enlightenment: "はじめて", beginner: "入門", intermediate: "中級", battle: "戦い", fullBoard: "全盤", challenge: "挑戦",
    goalEnlightenment: "まずは呼吸点、取り、つながりを覚えます。", goalBeginner: "取られにくく、一局を最後まで打つ練習。", goalIntermediate: "隅・辺・中央の選び方を練習。", goalBattle: "アタリ、弱い石の救出、切断を練習。", goalFullBoard: "序盤・中盤・終盤をつなげます。", goalChallenge: "本格対局に近づけ、軽い手を減らします。",
    childWin: "子ども勝ち", aiWin: "AI勝ち", suitable: "適切", easy: "やや易しい", hard: "やや難しい", none: "なし",
    undoDone: "待ったしました。続けて打てます。", switchBoardConfirm: "盤サイズを変えると新しい対局になります。続けますか？", endEstimate: "推定：子ども {black} 目、AI {white} 目。確定すると記録し、AI強度を調整します。",
    aiStronger: "次の対局で AI は強くなります。", aiSofter: "次の対局で AI は少しやさしくなります。", aiSame: "次の対局の AI 強度はほぼ同じです。", resultChild: "結果：子ども勝ち、総合評価 {score} 点。", resultAi: "結果：AI 勝ち、総合評価 {score} 点。",
    bestCapture: "良い一手：{move} で {captures} 子取りました。", bestOpening: "良い一手：序盤の方向が良く、隅と辺を意識できました。", bestFinish: "良い一手：最後まで打てたことが一番大きな進歩です。",
    dangerCapture: "危険点：AI に取られた石が多めでした。次は呼吸点の少ない石を守りましょう。", dangerShort: "危険点：手数が少なく、終盤練習に入る前に終わりました。", dangerCareless: "危険点：中盤以降の軽い手を減らしましょう。",
    nextCountLiberties: "次の目標：毎手、自分の呼吸点を数える。", nextOpening: "次の目標：序盤は隅を優先し、次に辺へ。", nextStage: "次の目標：{stage} 段階のリズムを保つ。{change}",
    noHint: "今は良いヒントがありません。パスか終了評価ができます。", hintStatus: "ヒント：{move} を考えてみましょう。{reason}", hintPoint: "ヒントの点：{move}",
    reasonFight: "白石に近く、戦いとつながりの練習になります。", reasonLiberties: "呼吸点が多く、すぐには取られにくい場所です。", reasonCareful: "打てる場所ですが、次に呼吸点を補う意識が必要です。",
    explainStage: "現在は {size} 路、学習段階：{stage}。", weakBlack: "黒に呼吸点の少ない石が {count} 個あります。まずつなぐか呼吸点を増やしましょう。", blackSafe: "黒に明らかな弱い石はありません。大場か白への攻めを探しましょう。", weakWhite: "白に呼吸点の少ない石が {count} 個あります。アタリや包囲を探しましょう。",
    parentNoGames: "数局終えると、ここに傾向が表示されます。", parentWinRate: "最近 {games} 局の勝率は {rate}%。", parentLong: "手数は十分で、中盤・終盤まで進めています。", parentShort: "平均手数はまだ短めです。終盤まで打つよう促しましょう。", parentFit: "現在の AI 強度は適切に近いです。", parentEasy: "最近よく勝っているので、AI は上がります。", parentHard: "最近負けが多いので、AI は下がります。", invalidMove: "ここには打てません。自殺手またはコウの可能性があります。", settingsSaved: "保護者設定を保存しました", remoteNotConfigured: "リモートAI未設定", remoteConnected: "リモートAI接続済み", remoteFailed: "リモートAI接続失敗。ローカルAIを使用", childWinrate: "子ども勝率", analysisLocal: "ローカル即時推定で、正式な数目ではありません。", analysisFromRemote: "リモート分析を更新しました。", localSuggestion: "局面確認", leadAhead: "子どもが大きくリードしています。落ち着いて終盤へ進みましょう。", leadClose: "局面は接近しています。大場より先に弱い石を守りましょう。", leadBehind: "AI がリードしています。アタリと弱い石の救出を探しましょう。", endAhead: "子どもの優勢が大きいです。「終了して評価」で確認できます。", endBehind: "この対局は難しめです。終了して復習し、新しい対局に進めます。", weakGroupReview: "最優先：{move} 付近の黒石は呼吸点が少ないです。まず補強か連絡をしましょう。", bestMoveReview: "本局の良い点：{move} 付近の一手は価値が高い手でした。", historyLine: "{result} {boardSize}路 {moves}手 {stage} 強度{level} 評価{performance}"
  },
  ko: {
    appTitle: "바둑 코치", subtitle: "{size}줄 어린이 맞춤 대국", thinking: "AI 생각 중...",
    setup: "학습 설정", child: "아이", newChild: "새 아이 이름", add: "추가", board: "바둑판", language: "언어", stage: "단계",
    board9: "9줄 입문", board13: "13줄 중급", board19: "19줄 전체",
    difficulty: "초기 난이도", difficultyBeginner: "입문", difficultyIntermediate: "중급", difficultyStrong: "강함", difficultyChallenge: "도전",
    statusStart: "흑이 먼저 둡니다. 돌을 놓으세요", statusDone: "대국이 끝났습니다. 새 판을 시작하세요", statusBlack: "아이의 흑 차례", statusWhite: "AI의 백 차례",
    moves: "수순", childCaptures: "아이 잡은 돌", aiCaptures: "AI 잡은 돌", profile: "실력 기록", rating: "종합 실력", opening: "포석", fighting: "전투", stability: "안정", played: "대국", winRate: "승률", aiLevel: "AI 강도",
    hint: "힌트", explain: "국면 설명", pass: "한 수 쉼", undo: "무르기", finish: "끝내고 평가", newGame: "새 판", exportSgf: "SGF 내보내기", parent: "부모 보기",
    review: "이번 판 복기", reviewEmpty: "한 판을 끝내면 짧은 피드백 3개가 나옵니다.", recent: "최근 대국", reset: "초기화",
    parentAvgMoves: "평균 수", parentAvgLevel: "평균 강도", parentTrend: "최근 흐름", reward: "승리 보상", remoteAi: "원격 AI 주소", kataGo: "KataGo 분석 주소", save: "저장", close: "닫기",
    confirmEndTitle: "종국할까요?", estimating: "형세 계산 중...", confirmEnd: "종료", continueGame: "계속", great: "잘했어", continue: "계속",
    enlightenment: "첫걸음", beginner: "입문", intermediate: "중급", battle: "전투", fullBoard: "전체판", challenge: "도전",
    goalEnlightenment: "먼저 활로, 잡기, 연결을 배웁니다.", goalBeginner: "덜 잡히고 한 판을 끝까지 둡니다.", goalIntermediate: "귀, 변, 중앙 선택을 연습합니다.", goalBattle: "단수, 약한 돌 살리기, 끊기를 연습합니다.", goalFullBoard: "포석, 중반, 끝내기를 연결합니다.", goalChallenge: "진지한 대국에 가깝게 두고 실수를 줄입니다.",
    childWin: "아이 승", aiWin: "AI 승", suitable: "적절", easy: "쉬움", hard: "어려움", none: "없음",
    undoDone: "무르기 완료. 계속 둘 수 있습니다.", switchBoardConfirm: "바둑판을 바꾸면 새 판을 시작합니다. 계속할까요?", endEstimate: "예상: 아이 {black}집, AI {white}집. 확인하면 기록하고 AI 강도를 조정합니다.",
    aiStronger: "다음 판에는 AI가 더 강해집니다.", aiSofter: "다음 판에는 AI가 부담을 낮춥니다.", aiSame: "다음 판 AI 강도는 거의 그대로입니다.", resultChild: "결과: 아이 승, 종합 점수 {score}점.", resultAi: "결과: AI 승, 종합 점수 {score}점.",
    bestCapture: "좋은 한 수: {move}에서 {captures}점을 잡았습니다.", bestOpening: "좋은 한 수: 초반 방향이 좋고 귀와 변을 잘 보았습니다.", bestFinish: "좋은 한 수: 끝까지 둔 것이 가장 큰 발전입니다.",
    dangerCapture: "위험한 점: AI에게 잡힌 돌이 많았습니다. 다음엔 활로가 적은 돌을 먼저 지키세요.", dangerShort: "위험한 점: 수순이 짧아 끝내기 연습 전에 끝났습니다.", dangerCareless: "위험한 점: 중후반의 무심한 수를 줄이세요.",
    nextCountLiberties: "다음 목표: 매 수마다 내 돌의 활로를 세기.", nextOpening: "다음 목표: 초반에는 귀를 먼저, 그다음 변으로.", nextStage: "다음 목표: {stage} 단계의 리듬 유지. {change}",
    noHint: "지금은 좋은 힌트가 없습니다. 한 수 쉬거나 평가를 끝낼 수 있습니다.", hintStatus: "힌트: {move}를 생각해 보세요. {reason}", hintPoint: "힌트 지점: {move}",
    reasonFight: "백돌과 가까워 전투와 연결을 연습하기 좋습니다.", reasonLiberties: "활로가 많아 바로 잡히기 어렵습니다.", reasonCareful: "둘 수 있는 자리지만 다음 활로 보강을 조심하세요.",
    explainStage: "현재 {size}줄, 학습 단계: {stage}.", weakBlack: "흑에 활로가 적은 무리가 {count}개 있습니다. 먼저 연결하거나 활로를 늘리세요.", blackSafe: "흑에는 뚜렷한 약한 돌이 없습니다. 큰 자리나 백 공격을 찾아보세요.", weakWhite: "백에 활로가 적은 무리가 {count}개 있습니다. 단수나 포위할 수 있는지 보세요.",
    parentNoGames: "몇 판을 끝내면 여기에 흐름이 표시됩니다.", parentWinRate: "최근 {games}판 승률 {rate}%.", parentLong: "수순이 충분해 중후반까지 잘 가고 있습니다.", parentShort: "평균 수순이 아직 짧습니다. 끝내기까지 두도록 격려하세요.", parentFit: "현재 AI 강도는 적절한 편입니다.", parentEasy: "최근 아이가 자주 이겨 AI가 올라갑니다.", parentHard: "최근 아이가 자주 져 AI가 내려갑니다.", invalidMove: "여기에는 둘 수 없습니다. 자충수 또는 패일 수 있습니다.", settingsSaved: "부모 설정을 저장했습니다", remoteNotConfigured: "원격 AI 미설정", remoteConnected: "원격 AI 연결됨", remoteFailed: "원격 AI 실패, 로컬 AI 사용", childWinrate: "아이 승률", analysisLocal: "로컬 실시간 추정이며 공식 계가는 아닙니다.", analysisFromRemote: "원격 분석이 업데이트되었습니다.", localSuggestion: "국면 보기", leadAhead: "아이가 크게 앞서고 있습니다. 안정적으로 끝내기를 하세요.", leadClose: "국면이 비슷합니다. 큰 자리보다 약한 돌을 먼저 지키세요.", leadBehind: "AI가 앞서고 있습니다. 단수와 약한 돌 살리기를 찾아보세요.", endAhead: "아이의 우세가 큽니다. '끝내고 평가'로 결과를 확인할 수 있습니다.", endBehind: "이번 판은 어렵습니다. 끝내고 복기한 뒤 새 판을 시작할 수 있습니다.", weakGroupReview: "가장 급한 곳: {move} 근처 흑돌은 활로가 적습니다. 먼저 활로를 늘리거나 연결하세요.", bestMoveReview: "이번 판의 좋은 점: {move} 근처의 수가 가장 가치 있었습니다.", historyLine: "{result} {boardSize}줄 {moves}수 {stage} 강도{level} 점수{performance}"
  }
};

const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");
const thinking = document.getElementById("thinking");

let profileStore = loadProfileStore();
let profile = getActiveProfile();
let studentProfile = loadStudentProfileForChild(profileStore.activeChildId);
let companionState = createCompanionStateForChild();
let currentCompanionPlan = null;
let currentMoveQualityPlan = null;
let lastAdaptiveSummary = null;
let lastSelectedCandidateFinalRank = 0;
let lastSelectedCandidateTier = "";
let previousPositionEval = null;
size = fixedBoardSize;
let board = freshBoard();
let turn = black;
let lastMove = null;
let blackCaptures = 0;
let whiteCaptures = 0;
let moveHistory = [];
let undoStack = [];
let positionHashes = [boardHash(board)];
let finished = false;
let consecutivePasses = 0;
let aiTimer = null;
let passHoldTimer = null;
let passHoldTriggered = false;
let remoteAiState = "notConfigured";
let lastAiAnalysis = null;
let restoreCount = 0;
let childIllegalAttemptCount = 0;
let aiRejectedCandidateCount = 0;
let aiThinkTimes = [];
let gameStartTimestamp = Date.now();
let currentGameId = `game-${Date.now()}`;
let latestExportSnapshot = null;
let buildBlocked = false;
let pendingProductSave = null;
const performanceDiagnostics = {
  moveStages: [],
  candidateDiagnostics: [],
  aggregate: {
    aiMoves: 0,
    boardCopyCount: 0,
    simulateMoveCount: 0,
    groupAtCallCount: 0,
    libertyPointsCallCount: 0,
    fullBoardScanCount: 0,
    JSONSerializeCount: 0,
    persistencePayloadBytes: 0
  },
  lastMove: null
};
currentCompanionPlan = createCompanionPlanForCurrentChild();
currentMoveQualityPlan = null;

function childStoneColor() {
  return profile?.childColor === "white" ? white : black;
}

function aiStoneColor() {
  return opponent(childStoneColor());
}
function freshBoard() {
  return Array.from({ length: size }, () => Array(size).fill(empty));
}

function createProfile(name = "孩子", initialAiLevel = defaultInitialAiLevel) {
  const aiLevel = clamp(Number(initialAiLevel) || defaultInitialAiLevel, minimumInitialAiLevel, 980);
  return {
    name,
    language: "zh",
    rating: 520,
    opening: 52,
    fighting: 58,
    stability: 48,
    aiLevel,
    initialAiLevel: aiLevel,
    difficultyMode: "adaptive",
    childColor: "black",
    stage: "入门",
    boardSize: fixedBoardSize,
    gamesPlayed: 0,
    wins: 0,
    history: [],
    trend: [],
    rewardEnabled: true,
    remoteAIUrl: "",
    kataGoUrl: ""
  };
}

function normalizeProfile(profile, name = "孩子") {
  const fallback = createProfile(name);
  const merged = { ...fallback, ...profile };
  const product = productSupportApi();
  merged.name = String(merged.name || name).slice(0, 16);
  merged.language = supportedLanguages.includes(merged.language) ? merged.language : "zh";
  merged.boardSize = fixedBoardSize;
  merged.difficultyMode = product && typeof product.normalizeDifficultyMode === "function"
    ? product.normalizeDifficultyMode(merged.difficultyMode || merged.initialAiLevel || merged.aiLevel)
    : (merged.difficultyMode || "adaptive");
  merged.childColor = merged.childColor === "white" ? "white" : "black";
  merged.aiLevel = clamp(Number(merged.aiLevel) || fallback.aiLevel, minimumInitialAiLevel, 980);
  merged.initialAiLevel = clamp(Number(merged.initialAiLevel) || merged.aiLevel || fallback.initialAiLevel, minimumInitialAiLevel, 980);
  merged.history = Array.isArray(merged.history) ? merged.history : [];
  merged.trend = Array.isArray(merged.trend) ? merged.trend : [];
  return merged;
}

function loadProfileStore() {
  const fallback = {
    activeChildId: "child-1",
    profiles: { "child-1": createProfile("孩子") }
  };
  try {
    const stored = JSON.parse(localStorage.getItem(profileStoreKey) || "null");
    if (stored && stored.profiles && stored.activeChildId) {
      for (const [id, value] of Object.entries(stored.profiles)) {
        stored.profiles[id] = normalizeProfile(value, value.name || "孩子");
      }
      return stored;
    }

    const legacy = JSON.parse(localStorage.getItem(legacyStorageKey) || "null");
    if (legacy) {
      fallback.profiles["child-1"] = normalizeProfile(legacy, "孩子");
      fallback.profiles["child-1"].boardSize = fixedBoardSize;
    }
  } catch {
    return fallback;
  }
  return fallback;
}

function getActiveProfile() {
  if (!profileStore.profiles[profileStore.activeChildId]) {
    profileStore.activeChildId = Object.keys(profileStore.profiles)[0] || "child-1";
    profileStore.profiles[profileStore.activeChildId] = profileStore.profiles[profileStore.activeChildId] || createProfile("孩子");
  }
  return profileStore.profiles[profileStore.activeChildId];
}

function saveProfile() {
  profile.stage = learningStage().key;
  profileStore.profiles[profileStore.activeChildId] = profile;
  try {
    localStorage.setItem(profileStoreKey, JSON.stringify(profileStore));
  } catch {
    // Keep the current session usable even if Safari storage is unavailable.
  }
}

function studentModelApi() {
  return window.GoKidCoachStudentModel;
}

function difficultyControllerApi() {
  return window.GoKidCoachDifficultyController;
}

function companionEngineApi() {
  return window.GoKidCoachCompanionEngine;
}

function moveQualityControllerApi() {
  return window.GoKidCoachMoveQualityController;
}

function contextFusionApi() {
  return window.GoKidCoachContextFusion;
}

function productSupportApi() {
  return window.GoKidCoachProductSupport;
}

function isMaxStrengthMode(value = profile?.difficultyMode) {
  const product = productSupportApi();
  return product && typeof product.isMaxStrengthMode === "function"
    ? product.isMaxStrengthMode(value)
    : value === maxStrengthMode || value === "advanced";
}

function candidateStrengthValue(candidate) {
  return Number(candidate?.adjustedScore ?? candidate?.combinedScore ?? -Infinity);
}

function deterministicCandidateCompare(a, b) {
  const pointA = a?.point || {};
  const pointB = b?.point || {};
  return candidateStrengthValue(b) - candidateStrengthValue(a)
    || Number(b?.combinedScore || 0) - Number(a?.combinedScore || 0)
    || Number(pointA.y ?? 99) - Number(pointB.y ?? 99)
    || Number(pointA.x ?? 99) - Number(pointB.x ?? 99);
}

function selectedCandidateTier(candidate) {
  return candidate?.moveQualityBucket || candidate?.tier || candidate?.qualityTier || candidate?.coherentClass || "";
}

function buildInfo() {
  const info = window.GoKidCoachBuildInfo || productSupportApi()?.buildInfo;
  if (!info) throw new Error("GoKidCoachBuildInfo must be loaded before app.js");
  return info;
}

function checkBuildConsistency() {
  const info = buildInfo();
  const script = document.querySelector("script[src='build-info.js']");
  const scriptBuildId = script?.dataset?.buildId || info.buildId;
  buildBlocked = Boolean(scriptBuildId && info.buildId && scriptBuildId !== info.buildId);
  document.documentElement.dataset.buildId = info.buildId || "";
  if (buildBlocked) updateStatus("检测到应用版本混合，请刷新页面完成更新。");
  return !buildBlocked;
}

function policyPatternApi() {
  return window.GoKidCoachPolicyPattern;
}

function shapeLibraryApi() {
  return window.GoKidCoachShapeLibrary;
}

function fusekiLibraryApi() {
  return window.GoKidCoachFusekiLibrary;
}

function tacticalLibraryApi() {
  return window.GoKidCoachTacticalLibrary;
}

function josekiLibraryApi() {
  return window.GoKidCoachJosekiLibrary;
}

function endgameLibraryApi() {
  return window.GoKidCoachEndgameLibrary;
}

function positionEvaluatorApi() {
  return window.GoKidCoachPositionEvaluator;
}

function midgameStabilityApi() {
  return window.GoKidCoachMidgameStability;
}

function loadStudentProfileForChild(childId = profileStore.activeChildId) {
  const api = studentModelApi();
  if (!api || typeof api.loadStudentProfile !== "function") return null;
  return api.loadStudentProfile(childId);
}

function saveStudentProfileForChild(nextProfile, childId = profileStore.activeChildId) {
  const api = studentModelApi();
  if (!api || typeof api.saveStudentProfile !== "function") return nextProfile || null;
  studentProfile = api.saveStudentProfile(nextProfile || studentProfile || {}, childId);
  return studentProfile;
}

function createCompanionStateForChild() {
  const api = companionEngineApi();
  if (!api || typeof api.createCompanionState !== "function") return null;
  return api.createCompanionState();
}

function recentChildResults(limit = 8) {
  if (studentProfile?.recentResults?.length) return studentProfile.recentResults.slice(0, limit).map(Boolean);
  return (profile.history || [])
    .slice(0, limit)
    .map(item => item.result === "childWin" || item.result === "孩子胜");
}

function recentGamesForAdaptive(limit = 8) {
  return (profile.history || []).slice(0, limit).map(item => ({
    result: item.result,
    childWon: item.result === "childWin" || item.result === "孩子胜",
    adaptiveBand: item.adaptiveBand || null,
    moves: item.moves || 0
  }));
}

function createAdaptiveGameState() {
  const result = estimateWinner();
  const earlyMoves = moveHistory.filter(item => !item.pass && item.color === black).slice(0, 20);
  const cornerMoves = earlyMoves.filter(item => {
    const edge = Math.min(item.x, item.y, size - 1 - item.x, size - 1 - item.y);
    return edge <= 3;
  }).length;
  return {
    moveCount: moveHistory.length,
    blackCaptures,
    whiteCaptures,
    scoreLead: result.blackScore - result.whiteScore,
    weakBlackGroups: collectGroups(black).filter(group => group.liberties.size <= 2).length,
    pressuredWhiteGroups: collectGroups(white).filter(group => group.liberties.size <= 2).length,
    openingDiscipline: earlyMoves.length ? clamp(40 + cornerMoves * 8, 20, 90) : 50,
    completion: clamp(Math.round(moveHistory.length / 150 * 100), 0, 100)
  };
}

function createCompanionPlanForCurrentChild() {
  const api = companionEngineApi();
  if (!api || typeof api.createCompanionPlan !== "function") return null;
  if (isMaxStrengthMode()) return null;
  return api.createCompanionPlan(
    studentProfile || loadStudentProfileForChild(),
    recentGamesForAdaptive(),
    createAdaptiveGameState(),
    companionState
  );
}

function createMoveQualityPlanForCurrentChild(companionPlan = currentCompanionPlan || createCompanionPlanForCurrentChild()) {
  void companionPlan;
  return null;
}

function applyReleaseDifficultyMode(settings) {
  const mode = productSupportApi()?.normalizeDifficultyMode?.(profile.difficultyMode) || profile.difficultyMode || "adaptive";
  const adjusted = { ...settings, releaseDifficultyMode: mode };
  if (mode === "beginner") {
    adjusted.candidateTopK = Math.max(2, Math.min(3, Number(adjusted.candidateTopK) || 3));
    adjusted.mistakeTolerance = Math.min(Number(adjusted.mistakeTolerance) || 18, 18);
    adjusted.randomness = Math.min(Number(adjusted.randomness) || 0.04, 0.035);
    adjusted.policyTemperature = Math.min(Number(adjusted.policyTemperature) || 0.25, 0.28);
    adjusted.ruleEngineWeight = Math.max(Number(adjusted.ruleEngineWeight) || 1.1, 1.16);
    adjusted.tacticalStrictness = Math.max(Number(adjusted.tacticalStrictness) || 1, 1.05);
  } else if (mode === "basic") {
    adjusted.candidateTopK = Math.max(1, Math.min(2, Number(adjusted.candidateTopK) || 2));
    adjusted.mistakeTolerance = Math.min(Number(adjusted.mistakeTolerance) || 14, 12);
    adjusted.randomness = Math.min(Number(adjusted.randomness) || 0.025, 0.02);
    adjusted.policyTemperature = Math.min(Number(adjusted.policyTemperature) || 0.24, 0.24);
    adjusted.ruleEngineWeight = Math.max(Number(adjusted.ruleEngineWeight) || 1.15, 1.22);
    adjusted.tacticalStrictness = Math.max(Number(adjusted.tacticalStrictness) || 1.08, 1.14);
    adjusted.endgamePrecision = Math.max(Number(adjusted.endgamePrecision) || 1, 1.02);
  } else if (mode === maxStrengthMode || mode === "advanced") {
    adjusted.candidateTopK = 1;
    adjusted.mistakeTolerance = 0;
    adjusted.randomness = 0;
    adjusted.policyTemperature = 0;
    adjusted.ruleEngineWeight = 1;
    adjusted.tacticalStrictness = 1;
    adjusted.openingBookWeight = 1;
    adjusted.endgamePrecision = 1;
    adjusted.suggestedAiStrength = 100;
    adjusted.focusArea = "max";
    adjusted.weakAreas = [];
    adjusted.adaptiveWeakeningEnabled = false;
    adjusted.randomSofteningEnabled = false;
    adjusted.maxStrengthFixed = true;
  } else {
    adjusted.randomness = Math.min(Number(adjusted.randomness) || 0.04, 0.04);
    adjusted.mistakeTolerance = Math.min(Number(adjusted.mistakeTolerance) || 16, 16);
  }
  return adjusted;
}

function phaseScaleForSource(source, moveNumber, point) {
  const edge = point ? Math.min(point.x, point.y, size - 1 - point.x, size - 1 - point.y) : 9;
  const smooth = (start, end, high, low) => {
    if (moveNumber <= start) return high;
    if (moveNumber >= end) return low;
    const t = (moveNumber - start) / Math.max(1, end - start);
    const eased = t * t * (3 - 2 * t);
    return high + (low - high) * eased;
  };
  if (source === "fuseki") {
    if (moveNumber <= 16) return 1;
    if (moveNumber <= 35) return smooth(16, 35, 1, 0.52);
    if (moveNumber <= 60) return smooth(35, 60, 0.52, 0.18);
    if (moveNumber <= 90) return smooth(60, 90, 0.18, 0);
    return 0;
  }
  if (source === "joseki") {
    const cornerScale = edge <= 4 ? 1 : 0.35;
    if (moveNumber <= 16) return cornerScale;
    if (moveNumber <= 35) return smooth(16, 35, cornerScale, edge <= 4 ? 0.45 : 0.08);
    if (moveNumber <= 70) return smooth(35, 70, edge <= 4 ? 0.45 : 0.08, edge <= 4 ? 0.18 : 0);
    return edge <= 4 ? 0.08 : 0;
  }
  if (source === "shape") {
    if (moveNumber >= 140) return 0.55;
    if (moveNumber >= 100) return 0.75;
    return 1;
  }
  return 1;
}

function classifyCoherentCandidate(candidate) {
  if (!candidate || candidate.legal === false || candidate.ruleLegal === false) return "rejected";
  if (candidate.immediatelyRefuted) return "immediatelyRefuted";
  if (candidate.verifiedUrgent || candidate.verifiedCapture || candidate.verifiedRescue || candidate.verifiedNecessaryConnection) return "protectedUrgent";
  if (candidate.lowValueCandidate || candidate.dameCandidate || candidate.redundantReinforcement || candidate.isMeaninglessFirstLine || candidate.isRandomFlyaway) return "lowValue";
  if (Number(candidate.captures || 0) > 0 || Number(candidate.tacticalPressure || 0) > 0 || Number(candidate.rescueValue || 0) > 0 || Number(candidate.connectionValue || 0) > 0) return "coherentTactical";
  if (Number(candidate.openingBookScore || 0) > 0 || Number(candidate.positionScore || 0) > 10 || Number(candidate.endgameScore || 0) > 8 || Number(candidate.territoryValue || 0) > 0) return "coherentStrategic";
  return "meaningfulAlternative";
}

function candidateKey(candidate) {
  const point = candidate?.point || candidate;
  return point && Number.isInteger(point.x) && Number.isInteger(point.y) ? `${point.x},${point.y}` : "";
}

function highConfidenceLocalOutcome(candidate, outcomes) {
  const reading = candidate?.localReading;
  if (!candidate || !reading || reading.confidenceLevel !== "high" || reading.unresolved || reading.koResult?.created) return false;
  return outcomes.includes(reading.hardOutcome);
}

function concreteTacticalGain(candidate) {
  if (!candidate) return 0;
  const reading = candidate.localReading || {};
  let gain = 0;
  gain += Math.max(0, Number(candidate.captures || reading.opponentStonesCaptured || 0)) * 2;
  gain += Math.max(0, Number(candidate.rescueValue || 0)) * 3;
  if (candidate.verifiedCapture || reading.hardOutcome === "verified_capture") gain += 4;
  if (candidate.verifiedRescue || reading.hardOutcome === "verified_rescue") gain += 6;
  if (candidate.verifiedUrgent || candidate.coherentClass === "protectedUrgent") gain += 3;
  if (candidate.immediatelyRefuted || reading.refuted || ["failed_rescue", "uncompensated_self_atari", "immediately_refuted"].includes(reading.hardOutcome)) gain -= 20;
  return gain;
}

function equivalentOrBetterTacticalSelection(selected, challenger) {
  if (!selected || !challenger) return false;
  if (candidateKey(selected) === candidateKey(challenger)) return true;
  if (highConfidenceLocalOutcome(selected, ["verified_capture", "verified_rescue"])) {
    return concreteTacticalGain(selected) >= concreteTacticalGain(challenger);
  }
  if (selected.verifiedUrgent && concreteTacticalGain(selected) >= concreteTacticalGain(challenger)) return true;
  return false;
}

function highConfidenceOwnTerritoryFill(candidate, color) {
  const point = candidate?.point;
  if (!point || moveHistory.length < 120) return false;
  if (candidate.verifiedUrgent || candidate.verifiedCapture || candidate.verifiedRescue) return false;
  if (Number(candidate.captures || 0) > 0 || Number(candidate.rescueValue || 0) > 0 || Number(candidate.connectionValue || 0) > 0) return false;
  if (Number(candidate.tacticalPressure || 0) > 0 || Number(candidate.endgameValue || 0) > 2) return false;
  let ownAdjacent = 0;
  let opponentAdjacent = 0;
  let emptyAdjacent = 0;
  for (const next of neighbors(point)) {
    const value = board[next.y][next.x];
    if (value === color) ownAdjacent += 1;
    else if (value === opponent(color)) opponentAdjacent += 1;
    else emptyAdjacent += 1;
  }
  return ownAdjacent >= 3 && opponentAdjacent === 0 && emptyAdjacent <= 1;
}

function highConfidenceLowValueSecondLine(candidate, color) {
  const point = candidate?.point;
  if (!point || moveHistory.length < 120) return false;
  const edge = Math.min(point.x, point.y, size - 1 - point.x, size - 1 - point.y);
  if (edge !== 1) return false;
  if (candidate.verifiedUrgent || candidate.verifiedCapture || candidate.verifiedRescue || candidate.verifiedNecessaryConnection) return false;
  if (Number(candidate.captures || 0) > 0 || Number(candidate.rescueValue || 0) > 0 || Number(candidate.connectionValue || 0) > 0 || Number(candidate.cutOpportunity || 0) > 0) return false;
  if (Number(candidate.tacticalPressure || 0) > 0 || Number(candidate.endgameValue || 0) > 2) return false;
  if (candidate.localReading && candidate.localReading.confidenceLevel !== "high" && candidate.localReading.hardOutcome !== "unresolved") return false;
  let ownAdjacent = 0;
  let opponentAdjacent = 0;
  let emptyAdjacent = 0;
  for (const next of neighbors(point)) {
    const value = board[next.y][next.x];
    if (value === color) ownAdjacent += 1;
    else if (value === opponent(color)) opponentAdjacent += 1;
    else emptyAdjacent += 1;
  }
  return opponentAdjacent === 0 && emptyAdjacent >= 2 && ownAdjacent <= 1;
}

function verifiedLargeYoseCandidate(candidate) {
  if (!candidate) return false;
  if (candidate.verifiedUrgent || candidate.verifiedCapture || candidate.verifiedRescue) return false;
  if (candidate.immediatelyRefuted || candidate.localReading?.refuted || candidate.localReading?.unresolved) return false;
  const endgameScore = Number(candidate.endgameScore || 0);
  const endgameValue = Number(candidate.endgameValue || 0);
  const territoryValue = Number(candidate.territoryValue || 0);
  const sourceTags = Array.isArray(candidate.sourceTags) ? candidate.sourceTags.join(" ") : String(candidate.candidateSource || "");
  return moveHistory.length >= 120
    && (endgameScore >= 8 || endgameValue >= 4 || territoryValue >= 3 || /large_yose|meaningful_yose|boundary|endgame/.test(sourceTags))
    && !highConfidenceLowValueSecondLine(candidate, candidate.color || aiStoneColor());
}

function equivalentOrBetterEndgameSelection(selected, challenger) {
  if (!selected || !challenger) return false;
  if (candidateKey(selected) === candidateKey(challenger)) return true;
  const selectedValue = Number(selected.endgameScore || 0) + Number(selected.endgameValue || 0) * 2 + Number(selected.territoryValue || 0);
  const challengerValue = Number(challenger.endgameScore || 0) + Number(challenger.endgameValue || 0) * 2 + Number(challenger.territoryValue || 0);
  return selectedValue >= challengerValue - 1.5 && !highConfidenceLowValueSecondLine(selected, selected.color || aiStoneColor());
}

function finalSelectorGuard(selected, rankedCandidates, color) {
  if (!selected || !Array.isArray(rankedCandidates) || !rankedCandidates.length) return selected;
  const candidates = rankedCandidates.filter(candidate => {
    if (!candidate || candidate.legal === false || candidate.ruleLegal === false) return false;
    if (candidate.coherentClass === "rejected" || candidate.moveQualityBucket === "rejectedMoves") return false;
    return candidateKey(candidate);
  });
  if (!candidates.length) return selected;

  const urgent = candidates
    .filter(candidate => highConfidenceLocalOutcome(candidate, ["verified_rescue", "verified_capture"]) || (candidate.verifiedUrgent && highConfidenceLocalOutcome(candidate, ["verified_rescue", "verified_capture"])))
    .sort((a, b) => concreteTacticalGain(b) - concreteTacticalGain(a) || Number(b.moveQualityScore || b.adjustedScore || 0) - Number(a.moveQualityScore || a.adjustedScore || 0));
  if (urgent.length && !equivalentOrBetterTacticalSelection(selected, urgent[0])) return urgent[0];

  const profitableCapture = candidates
    .filter(candidate => highConfidenceLocalOutcome(candidate, ["verified_capture"]))
    .filter(candidate => Number(candidate.captures || candidate.localReading?.opponentStonesCaptured || 0) > 0)
    .filter(candidate => concreteTacticalGain(candidate) - concreteTacticalGain(selected) >= 2)
    .sort((a, b) => concreteTacticalGain(b) - concreteTacticalGain(a) || Number(b.moveQualityScore || b.adjustedScore || 0) - Number(a.moveQualityScore || a.adjustedScore || 0));
  if (profitableCapture.length && !equivalentOrBetterTacticalSelection(selected, profitableCapture[0])) return profitableCapture[0];

  const largeYose = candidates
    .filter(verifiedLargeYoseCandidate)
    .sort((a, b) => (Number(b.endgameScore || 0) + Number(b.endgameValue || 0) * 2 + Number(b.territoryValue || 0))
      - (Number(a.endgameScore || 0) + Number(a.endgameValue || 0) * 2 + Number(a.territoryValue || 0)));
  if (largeYose.length && !equivalentOrBetterEndgameSelection(selected, largeYose[0]) && !concreteTacticalGain(selected)) return largeYose[0];

  if (highConfidenceLowValueSecondLine(selected, color)) {
    const alternative = candidates.find(candidate => candidateKey(candidate) !== candidateKey(selected)
      && !highConfidenceLowValueSecondLine(candidate, color)
      && !highConfidenceOwnTerritoryFill(candidate, color));
    if (alternative) return alternative;
  }

  if (highConfidenceOwnTerritoryFill(selected, color)) {
    const alternative = candidates.find(candidate => candidateKey(candidate) !== candidateKey(selected) && !highConfidenceOwnTerritoryFill(candidate, color));
    if (alternative) return alternative;
  }
  return selected;
}

function observeChildMove(point, candidates) {
  const api = companionEngineApi();
  if (!api || typeof api.observeStudentMove !== "function") return;
  const observation = api.observeStudentMove({
    move: point,
    candidates,
    studentProfile: studentProfile || loadStudentProfileForChild(),
    companionState: companionState || createCompanionStateForChild(),
    gameState: createAdaptiveGameState()
  });
  companionState = observation.companionState;
  studentProfile = saveStudentProfileForChild(observation.updatedProfile);
  currentCompanionPlan = createCompanionPlanForCurrentChild();
  currentMoveQualityPlan = null;
  const quality = observation.assessment?.quality || "acceptable";
  lastAdaptiveSummary = {
    summary: `Companion observed a ${quality} child move.`,
    confidence: 0,
    precisionBand: currentCompanionPlan?.precisionBand || "balanced"
  };
}

function currentGameKey() {
  return `${currentGameKeyPrefix}${profileStore.activeChildId}`;
}

function currentLanguage() {
  return supportedLanguages.includes(profile?.language) ? profile.language : "zh";
}

function t(key, params = {}) {
  const dictionary = i18n[currentLanguage()] || i18n.zh;
  const template = dictionary[key] || i18n.zh[key] || key;
  return Object.entries(params).reduce((text, [name, value]) => text.split(`{${name}}`).join(String(value)), template);
}

function replaceList(element, items) {
  element.replaceChildren(...items.map(item => {
    const li = document.createElement("li");
    li.textContent = item;
    return li;
  }));
}

function setText(selector, text) {
  const element = document.querySelector(selector);
  if (element) element.textContent = text;
}

function applyLanguage() {
  document.documentElement.lang = currentLanguage() === "yue" ? "zh-HK" : currentLanguage();
  document.title = t("appTitle");
  setText(".header h1", t("appTitle"));
  setText("#thinking", t("thinking"));
  setText(".setup-card h2", t("setup"));
  setText("#childLabel", t("child"));
  setText("#newChildName", "");
  document.getElementById("newChildName").placeholder = t("newChild");
  setText("#addChildBtn", t("add"));
  setText("#languageLabel", t("language"));
  setText("#stageLabel", t("stage"));
  setText("#difficultyLabel", t("difficulty"));
  setText("#mainDifficultyLabel", compactLabels[currentLanguage()]?.difficulty || t("difficulty"));
  difficultyPresets.forEach(preset => {
    document.querySelectorAll(`#difficultySelect option[value='${preset.value}'], #mainDifficultySelect option[value='${preset.value}']`).forEach(option => {
      option.textContent = t(preset.key);
    });
  });
  setText(".skill-card h2", t("profile"));
  setText("#ratingLabel", t("rating"));
  setText("#openingLabel", t("opening"));
  setText("#fightingLabel", t("fighting"));
  setText("#stabilityLabel", t("stability"));
  setText("#playedLabel", t("played"));
  setText("#winRateLabel", t("winRate"));
  setText("#aiLevelLabel", t("aiLevel"));
  document.querySelectorAll(".status-card .metrics span")[0].textContent = t("moves");
  document.querySelectorAll(".status-card .metrics span")[1].textContent = t("childCaptures");
  document.querySelectorAll(".status-card .metrics span")[2].textContent = t("aiCaptures");
  setText("#hintBtn", t("hint"));
  setText("#explainBtn", t("explain"));
  setText("#passBtn", t("pass"));
  setText("#undoBtn", t("undo"));
  setText("#finishBtn", t("finish"));
  setText("#newBtn", t("newGame"));
  updateMoreButtonLabel();
  setText("#sgfBtn", t("exportSgf"));
  setText("#parentBtn", t("parent"));
  setText("#reviewTitle", t("review"));
  setText("#recentTitle", t("recent"));
  setText("#resetBtn", t("reset"));
  setText("#parentPanel .card-title h2", t("parent"));
  setText("#closeParentBtn", t("close"));
  setText("#taskTitle", t("taskTitle"));
  setText("#aiAnalysisTitle", t("aiAnalysis"));
  setText("#analysisWinrateLabel", compactLabels[currentLanguage()]?.winrate || t("childWinrate"));
  setText("#analysisScoreLeadLabel", t("scoreLead"));
  setText("#analysisBestMoveLabel", t("bestMove"));
  setText("#parentAvgMovesLabel", t("parentAvgMoves"));
  setText("#parentAvgLevelLabel", t("parentAvgLevel"));
  setText("#parentTrendLabel", t("parentTrend"));
  setText("#rewardLabel", t("reward"));
  setText("#remoteAiLabel", t("remoteAi"));
  setText("#kataGoLabel", t("kataGo"));
  updateRemoteAiStatus();
  setText("#saveParentSettingsBtn", t("save"));
  setText("#exportBackupBtn", t("backupExport"));
  setText("#importBackupBtn", t("backupImport"));
  setText("#parentFinishBtn", t("finish"));
  setText("#parentSgfBtn", t("exportSgf"));
  setText("#debugExportBtn", "导出调试摘要");
  const info = buildInfo();
  setText("#versionText", `版本 ${info.appVersion} / 引擎 ${info.engineVersion}`);
  setText(".end-card h2", t("confirmEndTitle"));
  setText("#confirmEndBtn", t("confirmEnd"));
  setText("#continueGameBtn", t("continueGame"));
  setText(".speech", t("great"));
  setText("#closeVictoryBtn", t("continue"));
}

function updateMoreButtonLabel() {
  const moreBtn = document.getElementById("moreBtn");
  if (!moreBtn) return;
  const labels = compactLabels[currentLanguage()] || compactLabels.zh;
  const expanded = document.body.classList.contains("show-more");
  moreBtn.textContent = expanded ? labels.less : labels.more;
  moreBtn.setAttribute("aria-expanded", expanded ? "true" : "false");
}

function toggleMorePanel() {
  document.body.classList.toggle("show-more");
  updateMoreButtonLabel();
}

function updateRemoteAiStatus() {
  const element = document.getElementById("remoteAiStatus");
  if (!element) return;
  const configured = Boolean(profile.remoteAIUrl || profile.kataGoUrl);
  const key = !configured ? "remoteNotConfigured" : remoteAiState === "connected" ? "remoteConnected" : remoteAiState === "failed" ? "remoteFailed" : "remoteNotConfigured";
  element.textContent = t(key);
  element.dataset.state = configured ? remoteAiState : "notConfigured";
}

function nowMs() {
  return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
}

function measureStage(record, key, fn) {
  const started = nowMs();
  try {
    return fn();
  } finally {
    record[key] = (record[key] || 0) + Math.max(0, nowMs() - started);
  }
}

function estimateBytes(value) {
  try {
    return JSON.stringify(value).length;
  } catch {
    return 0;
  }
}

function trimDiagnosticArray(list, cap) {
  if (!Array.isArray(list) || list.length <= cap) return list;
  list.splice(0, list.length - cap);
  return list;
}

function recordMovePerformance(record) {
  if (!record) return;
  performanceDiagnostics.lastMove = record;
  performanceDiagnostics.moveStages.push(record);
  trimDiagnosticArray(performanceDiagnostics.moveStages, rawStageTimingCap);
  performanceDiagnostics.aggregate.aiMoves += 1;
  for (const key of ["boardCopyCount", "simulateMoveCount", "groupAtCallCount", "libertyPointsCallCount", "fullBoardScanCount", "JSONSerializeCount", "persistencePayloadBytes"]) {
    performanceDiagnostics.aggregate[key] += Number(record[key] || 0);
  }
}

function scheduleProductCurrentGameSave(snapshotPayload) {
  const product = productSupportApi();
  if (!product || typeof product.saveCurrentGame !== "function") return;
  const payload = snapshotPayload;
  if (pendingProductSave && typeof window !== "undefined" && window.clearTimeout) {
    window.clearTimeout(pendingProductSave);
  }
  const run = () => {
    pendingProductSave = null;
    product.saveCurrentGame(payload).catch(() => {});
  };
  if (typeof window !== "undefined" && window.setTimeout) {
    pendingProductSave = window.setTimeout(run, 0);
  } else {
    run();
  }
}

function saveCurrentGame() {
  const exportSnapshot = latestExportSnapshot && Array.isArray(latestExportSnapshot.moveHistory)
    ? latestExportSnapshot
    : createExportSnapshot("active");
  const info = buildInfo();
  const snapshotPayload = {
    id: currentGameKey(),
    gameId: currentGameId,
    size,
    board: cloneBoard(),
    turn,
    lastMove: lastMove ? { ...lastMove } : null,
    blackCaptures,
    whiteCaptures,
    moveHistory: exportSnapshot.moveHistory.map(item => ({ ...item })),
    exportSnapshot: exportSnapshot.moveHistory.length % recoverySnapshotInterval === 0 || finished
      ? exportSnapshot
      : null,
    actualMoveCount: exportSnapshot.actualMoveCount,
    finalBoardHash: exportSnapshot.finalBoardHash,
    undoStack: undoStack.slice(-20).map(item => ({
      ...item,
      board: item.board.map(row => row.slice()),
      moveHistory: item.moveHistory.map(move => ({ ...move })),
      positionHashes: item.positionHashes.slice(),
      lastMove: item.lastMove ? { ...item.lastMove } : null
    })),
    positionHashes: positionHashes.slice(),
    finished,
    consecutivePasses,
    childColor: profile.childColor || "black",
    difficultyMode: profile.difficultyMode || "adaptive",
    adaptiveWeakeningEnabled: !isMaxStrengthMode(profile.difficultyMode),
    randomSofteningEnabled: !isMaxStrengthMode(profile.difficultyMode),
    selectedCandidateFinalRank: lastSelectedCandidateFinalRank,
    selectedCandidateTier: lastSelectedCandidateTier,
    adaptiveDifficultyState: {
      companionState,
      currentCompanionPlan,
      currentMoveQualityPlan
    },
    studentModelSummary: studentProfile || null,
    gameStartTimestamp,
    appVersion: info.appVersion,
    engineVersion: info.engineVersion,
    productVersion: info.productVersion,
    buildId: info.buildId,
    schemaVersion: info.schemaVersion,
    diagnostics: {
      restoreCount,
      childIllegalAttemptCount,
      aiRejectedCandidateCount,
      aiThinkTimes: aiThinkTimes.slice(-250)
    },
    lastAiAnalysis,
    companionState,
    currentCompanionPlan,
    currentMoveQualityPlan,
    savedAt: Date.now()
  };
  try {
    performanceDiagnostics.aggregate.JSONSerializeCount += 1;
    performanceDiagnostics.aggregate.persistencePayloadBytes += estimateBytes(snapshotPayload);
    localStorage.setItem(currentGameKey(), JSON.stringify(snapshotPayload));
  } catch {
    // Safari private mode or full storage can reject writes; the game still works.
  }
  scheduleProductCurrentGameSave(snapshotPayload);
}

function isValidBoard(value) {
  return Array.isArray(value)
    && value.length === size
    && value.every(row => Array.isArray(row)
      && row.length === size
      && row.every(cell => cell === empty || cell === black || cell === white));
}

function loadCurrentGame() {
  try {
    const saved = JSON.parse(localStorage.getItem(currentGameKey()) || "null");
    if (saved && Number(saved.size) !== fixedBoardSize) {
      return false;
    }
    if (!saved || !isValidBoard(saved.board)) return false;
    restore({
      board: saved.board,
      turn: saved.turn === white ? white : black,
      lastMove: saved.lastMove || null,
      blackCaptures: Number(saved.blackCaptures) || 0,
      whiteCaptures: Number(saved.whiteCaptures) || 0,
      moveHistory: Array.isArray(saved.moveHistory) ? saved.moveHistory : [],
      positionHashes: Array.isArray(saved.positionHashes) && saved.positionHashes.length
        ? saved.positionHashes
        : [boardHash(saved.board)],
      finished: Boolean(saved.finished),
      consecutivePasses: Number(saved.consecutivePasses) || 0
    });
    undoStack = Array.isArray(saved.undoStack) ? saved.undoStack.filter(item => item && isValidBoard(item.board)) : [];
    lastAiAnalysis = saved.lastAiAnalysis || null;
    companionState = saved.companionState && typeof saved.companionState === "object" ? saved.companionState : createCompanionStateForChild();
    currentCompanionPlan = saved.currentCompanionPlan && typeof saved.currentCompanionPlan === "object" ? saved.currentCompanionPlan : createCompanionPlanForCurrentChild();
    currentMoveQualityPlan = saved.currentMoveQualityPlan && typeof saved.currentMoveQualityPlan === "object"
      ? saved.currentMoveQualityPlan
      : null;
    profile.childColor = saved.childColor === "white" ? "white" : profile.childColor || "black";
    profile.difficultyMode = productSupportApi()?.normalizeDifficultyMode?.(saved.difficultyMode || profile.difficultyMode) || profile.difficultyMode || "adaptive";
    if (isMaxStrengthMode(profile.difficultyMode)) {
      currentCompanionPlan = null;
      currentMoveQualityPlan = null;
    }
    currentGameId = saved.gameId || currentGameId;
    gameStartTimestamp = Number(saved.gameStartTimestamp) || Date.now();
    restoreCount = Number(saved.diagnostics?.restoreCount || saved.restoreCount || 0) + 1;
    childIllegalAttemptCount = Number(saved.diagnostics?.childIllegalAttemptCount) || 0;
    aiRejectedCandidateCount = Number(saved.diagnostics?.aiRejectedCandidateCount) || 0;
    aiThinkTimes = Array.isArray(saved.diagnostics?.aiThinkTimes) ? saved.diagnostics.aiThinkTimes.slice(-250) : [];
    latestExportSnapshot = saved.exportSnapshot && Array.isArray(saved.exportSnapshot.moveHistory)
      ? saved.exportSnapshot
      : createExportSnapshot("restored");
    return true;
  } catch {
    return false;
  }
}

function opponent(color) {
  return color === black ? white : black;
}

function learningStage() {
  if (profile.rating < 820) return { key: "fullBoard", name: t("fullBoard"), pool: 2, goal: t("goalFullBoard") };
  return { key: "challenge", name: t("challenge"), pool: 1, goal: t("goalChallenge") };
}

function adaptiveStatus() {
  const plan = currentMoveQualityPlan || currentCompanionPlan;
  if (!plan) {
    return { title: "Adaptive Engine", status: "--", text: "In-game adaptive strength is waiting for the first evaluation." };
  }
  const confidence = Math.round((plan.confidenceBase || 0.7) * 100);
  return {
    title: "Adaptive Engine",
    status: `${confidence}%`,
    text: `Current strength ${plan.currentStrength}, AI target ${plan.targetAiStrength}, precision ${plan.precisionBand}, focus ${plan.focus}.`
  };
}

function normalizeRemoteAnalysis(data) {
  const source = data.analysis && typeof data.analysis === "object" ? data.analysis : data;
  const best = Array.isArray(source.bestMoves) ? source.bestMoves[0] : Array.isArray(source.moves) ? source.moves[0] : null;
  const bestMove = best?.move || best?.moveText || best?.point || data.move || null;
  return {
    winrate: Number.isFinite(Number(source.winrate)) ? Number(source.winrate) : Number.isFinite(Number(source.winRate)) ? Number(source.winRate) : null,
    scoreLead: Number.isFinite(Number(source.scoreLead)) ? Number(source.scoreLead) : Number.isFinite(Number(source.score)) ? Number(source.score) : null,
    bestMove: typeof bestMove === "string" ? bestMove : bestMove && typeof bestMove.x === "number" ? coordinateName(bestMove) : null,
    note: source.note || source.comment || ""
  };
}

function neighbors(point) {
  return [
    { x: point.x - 1, y: point.y },
    { x: point.x + 1, y: point.y },
    { x: point.x, y: point.y - 1 },
    { x: point.x, y: point.y + 1 }
  ].filter(p => p.x >= 0 && p.x < size && p.y >= 0 && p.y < size);
}

function groupAt(start, grid = board) {
  performanceDiagnostics.aggregate.groupAtCallCount += 1;
  const color = grid[start.y][start.x];
  if (color === empty) return { stones: [], liberties: new Set() };

  const seen = new Set();
  const stones = [];
  const liberties = new Set();
  const stack = [start];

  while (stack.length) {
    const point = stack.pop();
    const key = `${point.x},${point.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    stones.push(point);

    for (const next of neighbors(point)) {
      const value = grid[next.y][next.x];
      if (value === empty) liberties.add(`${next.x},${next.y}`);
      if (value === color) stack.push(next);
    }
  }

  return { stones, liberties };
}

function cloneBoard() {
  performanceDiagnostics.aggregate.boardCopyCount += 1;
  return board.map(row => row.slice());
}

function cloneGrid(grid) {
  performanceDiagnostics.aggregate.boardCopyCount += 1;
  return (Array.isArray(grid) ? grid : board).map(row => row.slice());
}

function boardHash(grid = board) {
  return grid.map(row => row.join("")).join("|");
}

function createExportSnapshot(source = "active") {
  const info = buildInfo();
  return {
    id: currentGameKey(),
    gameId: currentGameId,
    size,
    board: cloneBoard(),
    finalBoardHash: boardHash(),
    turn,
    lastMove: lastMove ? { ...lastMove } : null,
    blackCaptures,
    whiteCaptures,
    moveHistory: moveHistory.map(item => ({ ...item })),
    actualMoveCount: moveHistory.length,
    aiMoveCount: moveHistory.filter(item => item.color === aiStoneColor()).length,
    childMoveCount: moveHistory.filter(item => item.color === childStoneColor()).length,
    positionHashes: positionHashes.slice(),
    finished,
    consecutivePasses,
    childColor: profile.childColor || "black",
    difficultyMode: profile.difficultyMode || "adaptive",
    difficultyStart: profile.initialAiLevel,
    difficultyEnd: profile.aiLevel,
    adaptiveWeakeningEnabled: !isMaxStrengthMode(profile.difficultyMode),
    randomSofteningEnabled: !isMaxStrengthMode(profile.difficultyMode),
    selectedCandidateFinalRank: lastSelectedCandidateFinalRank,
    selectedCandidateTier: lastSelectedCandidateTier,
    diagnostics: {
      restoreCount,
      childIllegalAttemptCount,
      aiRejectedCandidateCount,
      aiThinkTimes: aiThinkTimes.slice(-250)
    },
    gameStartTimestamp,
    appVersion: info.appVersion,
    engineVersion: info.engineVersion,
    productVersion: info.productVersion,
    buildId: info.buildId,
    schemaVersion: info.schemaVersion,
    exportSnapshotSource: source,
    savedAt: Date.now()
  };
}

function updateExportSnapshot(source = "active", options = {}) {
  latestExportSnapshot = createExportSnapshot(source);
  const shouldPersist = Boolean(options.persist)
    || source !== "active"
    || finished
    || latestExportSnapshot.moveHistory.length % recoverySnapshotInterval === 0;
  if (shouldPersist) {
    try {
      performanceDiagnostics.aggregate.JSONSerializeCount += 1;
      performanceDiagnostics.aggregate.persistencePayloadBytes += estimateBytes(latestExportSnapshot);
      localStorage.setItem(`${currentGameKey()}-export-snapshot`, JSON.stringify(latestExportSnapshot));
      if (latestExportSnapshot.moveHistory.length > 0) {
        localStorage.setItem("gokidcoach-web-latest-export-snapshot", JSON.stringify(latestExportSnapshot));
      }
    } catch {
      // Export snapshot is best effort; active memory copy remains available.
    }
  }
  return latestExportSnapshot;
}

function preserveExportSnapshot(source = "abandoned") {
  if (moveHistory.length || !latestExportSnapshot) updateExportSnapshot(source, { persist: true });
  else latestExportSnapshot = { ...latestExportSnapshot, exportSnapshotSource: source };
  return latestExportSnapshot;
}

function loadLatestExportSnapshot() {
  if (latestExportSnapshot && Array.isArray(latestExportSnapshot.moveHistory)) return latestExportSnapshot;
  try {
    const saved = JSON.parse(localStorage.getItem(`${currentGameKey()}-export-snapshot`) || "null");
    if (saved && Array.isArray(saved.moveHistory)) {
      latestExportSnapshot = saved;
      return saved;
    }
    const latest = JSON.parse(localStorage.getItem("gokidcoach-web-latest-export-snapshot") || "null");
    if (latest && Array.isArray(latest.moveHistory)) {
      latestExportSnapshot = latest;
      return latest;
    }
  } catch {
    return null;
  }
  return null;
}

function exportSnapshotForCurrentAction() {
  if (moveHistory.length || finished) return updateExportSnapshot("active", { persist: true });
  return loadLatestExportSnapshot() || updateExportSnapshot("active_empty");
}

function snapshot() {
  return {
    board: cloneBoard(),
    turn,
    lastMove: lastMove ? { ...lastMove } : null,
    blackCaptures,
    whiteCaptures,
    moveHistory: moveHistory.map(item => ({ ...item })),
    positionHashes: positionHashes.slice(),
    finished,
    consecutivePasses
  };
}

function restore(state) {
  board = state.board.map(row => row.slice());
  turn = state.turn;
  lastMove = state.lastMove ? { ...state.lastMove } : null;
  blackCaptures = state.blackCaptures;
  whiteCaptures = state.whiteCaptures;
  moveHistory = state.moveHistory.map(item => ({ ...item }));
  positionHashes = state.positionHashes.slice();
  finished = state.finished;
  consecutivePasses = state.consecutivePasses;
}

function playMove(point, color) {
  performanceDiagnostics.aggregate.simulateMoveCount += 1;
  if (finished || board[point.y][point.x] !== empty) return false;

  const boardSnapshot = cloneBoard();
  board[point.y][point.x] = color;
  let captures = 0;

  for (const next of neighbors(point)) {
    if (board[next.y][next.x] !== opponent(color)) continue;
    const group = groupAt(next);
    if (group.liberties.size === 0) {
      captures += group.stones.length;
      for (const stone of group.stones) board[stone.y][stone.x] = empty;
    }
  }

  const ownGroup = groupAt(point);
  if (ownGroup.liberties.size === 0) {
    board = boardSnapshot;
    return false;
  }

  const nextHash = boardHash();
  if (positionHashes.includes(nextHash)) {
    board = boardSnapshot;
    return false;
  }

  if (color === black) blackCaptures += captures;
  if (color === white) whiteCaptures += captures;
  moveHistory.push({ ...point, color, captures, pass: false });
  positionHashes.push(nextHash);
  lastMove = point;
  consecutivePasses = 0;
  turn = opponent(color);
  return true;
}

function legalMoves(color) {
  performanceDiagnostics.aggregate.fullBoardScanCount += 1;
  const moves = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (board[y][x] !== empty) continue;
      const state = snapshot();
      if (playMove({ x, y }, color)) moves.push({ x, y });
      restore(state);
    }
  }
  return moves;
}

function groupKey(group) {
  const anchor = groupAnchor(group);
  return anchor ? `${anchor.x},${anchor.y}` : "";
}

function analyzeGroupsForMove(color) {
  const own = collectGroups(color).map(group => {
    const anchor = groupAnchor(group);
    const ruleEvidence = window.GoKidCoachRuleEngine?.groupSafetyEvidence
      ? window.GoKidCoachRuleEngine.groupSafetyEvidence(board, group, color)
      : null;
    const liberties = Array.from(group.liberties).map(value => {
      const [x, y] = value.split(",").map(Number);
      return { x, y };
    });
    const nearbySupport = group.stones.reduce((sum, stone) => sum + neighbors(stone).filter(next => board[next.y][next.x] === color).length, 0);
    const nearbyPressure = group.stones.reduce((sum, stone) => sum + neighbors(stone).filter(next => board[next.y][next.x] === opponent(color)).length, 0);
    const strategicSize = group.stones.length + liberties.length * 0.7 + nearbySupport * 0.4;
    const tacticalRisk = Math.max(0, 4 - liberties.length) * group.stones.length + nearbyPressure;
    const eyePotential = liberties.filter(liberty => neighbors(liberty).filter(next => board[next.y][next.x] === color).length >= 2).length;
    const boardRegionName = anchor ? (Math.min(anchor.x, anchor.y, size - 1 - anchor.x, size - 1 - anchor.y) <= 3 ? "edge" : "center") : "unknown";
    let classification = ruleEvidence?.classification || "stable";
    if (!ruleEvidence) {
      if (liberties.length <= 1 && group.stones.length >= 2) classification = "critical";
      else if (liberties.length <= 2 && strategicSize >= 4) classification = "weak";
      else if (liberties.length <= 3) classification = "unsettled";
      else if (group.stones.length <= 2 && liberties.length <= 2) classification = "disposable_small_group";
    }
    return {
      anchor,
      stones: group.stones.map(stone => ({ ...stone })),
      stoneCount: group.stones.length,
      liberties: liberties.length,
      libertyQuality: ruleEvidence?.libertyQuality ?? Number(liberties.length.toFixed(3)),
      libertyPoints: liberties,
      eyePotential: ruleEvidence?.eyePotential ?? eyePotential,
      falseEyeRisk: ruleEvidence?.falseEyeRisk ?? 0,
      connectionOptions: ruleEvidence?.connectionOptions ?? liberties.length,
      cutRisk: ruleEvidence?.cutRisk ?? 0,
      escapeOptions: ruleEvidence?.escapeRoutes ?? liberties.length,
      nearbySupport,
      nearbyPressure,
      nearbyFriendlySupport: ruleEvidence?.nearbyFriendlySupport ?? nearbySupport,
      nearbyOpponentPressure: ruleEvidence?.nearbyOpponentPressure ?? nearbyPressure,
      surroundingEnemyStrength: ruleEvidence?.surroundingEnemyStrength ?? 0,
      strategicSize: ruleEvidence?.strategicSize ?? Number(strategicSize.toFixed(3)),
      tacticalRisk: ruleEvidence?.tacticalCaptureRisk ?? Number(tacticalRisk.toFixed(3)),
      tacticalCaptureRisk: ruleEvidence?.tacticalCaptureRisk ?? Number(tacticalRisk.toFixed(3)),
      distanceToEdge: ruleEvidence?.distanceToEdge ?? (anchor ? Math.min(anchor.x, anchor.y, size - 1 - anchor.x, size - 1 - anchor.y) : 0),
      externalLiberties: ruleEvidence?.externalLiberties ?? liberties.length,
      groupExtent: ruleEvidence?.groupExtent ?? group.stones.length,
      boardRegion: boardRegionName,
      classification
    };
  });
  return own;
}

function addCandidatePoint(map, point, reason, priority, color, metadata = {}) {
  if (!point || point.x < 0 || point.y < 0 || point.x >= size || point.y >= size || board[point.y][point.x] !== empty) return;
  const rule = window.GoKidCoachRuleEngine?.evaluateMove?.({ board, point, color, moveHistory, positionHashes });
  if (rule && !rule.legal) return;
  const key = `${point.x},${point.y}`;
  const previous = map.get(key);
  const sourceTags = new Set([...(previous?.sourceTags || []), ...(metadata.sourceTags || []), reason]);
  const purposeLabels = new Set([...(previous?.purposeLabels || []), ...(metadata.purposeLabels || [])]);
  const affectedGroups = new Set([...(previous?.affectedGroups || []), ...(metadata.affectedGroups || [])]);
  const urgent = /capture|rescue|critical|necessary|urgent/.test(reason) || Boolean(previous?.urgent);
  const weakGroup = /weak_group|escape|connection_toward_support|defense/.test(reason) || Boolean(previous?.weakGroup);
  const global = /whole_board|invasion|reduction|policy_probe|position_probe/.test(reason) || Boolean(previous?.global);
  if (!previous || priority > previous.priority) {
    map.set(key, {
      point: { x: point.x, y: point.y },
      reason,
      priority,
      source: reason,
      sourceTags: Array.from(sourceTags),
      purposeLabels: Array.from(purposeLabels),
      generationReason: metadata.generationReason || reason,
      confidence: metadata.confidence || previous?.confidence || "",
      primaryRegion: metadata.primaryRegion || previous?.primaryRegion || "",
      affectedGroups: Array.from(affectedGroups),
      tacticalSafety: metadata.tacticalSafety || previous?.tacticalSafety || null,
      urgent,
      weakGroup,
      global
    });
  } else {
    previous.sourceTags = Array.from(sourceTags);
    previous.purposeLabels = Array.from(purposeLabels);
    previous.affectedGroups = Array.from(affectedGroups);
    previous.generationReason = [previous.generationReason, metadata.generationReason].filter(Boolean).join("; ");
    previous.confidence = previous.confidence || metadata.confidence || "";
    previous.primaryRegion = previous.primaryRegion || metadata.primaryRegion || "";
    previous.tacticalSafety = previous.tacticalSafety || metadata.tacticalSafety || null;
    previous.urgent = urgent;
    previous.weakGroup = weakGroup;
    previous.global = global;
  }
}

function maxStrengthUrgentCandidateExists(candidateMap) {
  return Array.from(candidateMap.values()).some(item => item.urgent && item.priority >= 780);
}

function wholeBoardStrategyPhaseAllowed() {
  const moveNumber = moveHistory.length + 1;
  return moveNumber >= 21 && moveNumber <= 120;
}

function regionForStrategicPoint(point) {
  if (point.x <= 4 && point.y <= 4) return "upper_left_corner";
  if (point.x >= 14 && point.y <= 4) return "upper_right_corner";
  if (point.x <= 4 && point.y >= 14) return "lower_left_corner";
  if (point.x >= 14 && point.y >= 14) return "lower_right_corner";
  if (point.y <= 3) return "top_side";
  if (point.y >= 15) return "bottom_side";
  if (point.x <= 3) return "left_side";
  if (point.x >= 15) return "right_side";
  return "center";
}

function hasEquivalentStrategicCandidate(candidateMap, point, region) {
  return Array.from(candidateMap.values()).some(item => {
    const existingRegion = item.primaryRegion || regionForStrategicPoint(item.point);
    const sameRegion = existingRegion === region;
    const nearby = pointDistance(item.point, point) <= 2;
    const globalLike = item.global || /whole_board|invasion|reduction|large_whole_board|policy_probe|position_probe/.test(item.source || "");
    return globalLike && (sameRegion || nearby);
  });
}

function addMaxStrengthWholeBoardStrategyCandidates(candidateMap, color, ownGroups) {
  if (!isMaxStrengthMode() || maxStrengthUrgentCandidateExists(candidateMap) || !wholeBoardStrategyPhaseAllowed()) return;
  const strategicPoints = [
    { point: { x: 10, y: 14 }, purpose: "develop_influence", reason: "thickness_direction_global_value", priority: 535 },
    { point: { x: 10, y: 3 }, purpose: "global_large_point", reason: "largest_open_region_global_value", priority: 526 },
    { point: { x: 4, y: 15 }, purpose: "global_large_point", reason: "large_extension_global_value", priority: 518 },
    { point: { x: 14, y: 4 }, purpose: "approach", reason: "major_approach_enclosure_value", priority: 512 }
  ];
  const usedRegions = new Set();
  let added = 0;
  for (const item of strategicPoints) {
    if (added >= 2) break;
    const region = regionForStrategicPoint(item.point);
    if (usedRegions.has(region)) continue;
    if (hasEquivalentStrategicCandidate(candidateMap, item.point, region)) continue;
    const near = nearestStoneDistance(item.point);
    const stableOwnGroups = ownGroups.filter(group => group.classification !== "critical" && group.classification !== "weak").length;
    addCandidatePoint(candidateMap, item.point, "whole_board_strategy", item.priority + Math.max(0, 6 - Math.min(6, near)), color, {
      sourceTags: ["whole_board_strategy"],
      purposeLabels: [item.purpose],
      generationReason: item.reason,
      confidence: "high",
      primaryRegion: region,
      affectedGroups: [],
      tacticalSafety: {
        urgentFight: false,
        legal: true,
        immediateSelfAtari: false,
        stableOwnGroupCount: stableOwnGroups
      }
    });
    if (candidateMap.has(`${item.point.x},${item.point.y}`)) {
      usedRegions.add(region);
      added += 1;
    }
  }
}

function prioritizedCandidateList(candidates, maxCount = 12) {
  const sorted = Array.from(candidates.values())
    .sort((a, b) => b.priority - a.priority || a.point.y - b.point.y || a.point.x - b.point.x);
  const selected = [];
  const used = new Set();
  function take(predicate) {
    const item = sorted.find(candidate => predicate(candidate) && !used.has(`${candidate.point.x},${candidate.point.y}`));
    if (!item) return;
    used.add(`${item.point.x},${item.point.y}`);
    selected.push(item);
  }
  take(item => /capture|rescue|critical|necessary/.test(item.source));
  take(item => /weak_group|escape|connection_toward_support|defense/.test(item.source));
  take(item => /whole_board|invasion|reduction|policy_probe|position_probe/.test(item.source));
  for (const item of sorted) {
    if (selected.length >= maxCount) break;
    const key = `${item.point.x},${item.point.y}`;
    if (used.has(key)) continue;
    used.add(key);
    selected.push(item);
  }
  return selected.slice(0, maxCount).map(item => ({
    ...item.point,
    sourceTags: item.sourceTags || [item.source],
    purposeLabels: item.purposeLabels || [],
    generationReason: item.generationReason || item.source,
    confidence: item.confidence || "",
    primaryRegion: item.primaryRegion || "",
    affectedGroups: item.affectedGroups || [],
    tacticalSafety: item.tacticalSafety || null,
    candidateSource: item.source,
    urgentCandidate: Boolean(item.urgent),
    weakGroupCandidate: Boolean(item.weakGroup),
    globalCandidate: Boolean(item.global)
  }));
}

function generateMiddlegameCandidateMoves(color) {
  if (moveHistory.length <= 16) return legalMoves(color);
  performanceDiagnostics.aggregate.fullBoardScanCount += 1;
  const candidates = new Map();
  const opponentColor = opponent(color);
  const ownGroups = analyzeGroupsForMove(color);
  const enemyGroups = collectGroups(opponentColor);
  for (const group of enemyGroups) {
    const liberties = Array.from(group.liberties).map(value => {
      const [x, y] = value.split(",").map(Number);
      return { x, y };
    });
    if (liberties.length === 1) addCandidatePoint(candidates, liberties[0], "immediate_profitable_capture", 1200, color);
    else if (liberties.length === 2 && group.stones.length >= 2) liberties.forEach(point => addCandidatePoint(candidates, point, "attack_critical_opponent_group", 620, color));
  }
  for (const group of ownGroups) {
    if (group.classification === "critical" || group.classification === "weak" || group.classification === "unsettled") {
      const basePriority = group.classification === "critical"
        ? 1180 + Math.min(180, group.stoneCount * 18)
        : group.classification === "weak"
          ? 790 + Math.min(120, group.stoneCount * 12)
          : 520;
      group.libertyPoints.forEach(point => addCandidatePoint(candidates, point, group.classification === "critical" ? "critical_own_group_defense" : "weak_group_escape_extension", basePriority, color));
      for (const stone of group.stones) {
        for (const next of neighbors(stone)) {
          if (board[next.y][next.x] === empty) addCandidatePoint(candidates, next, "extension_escape_from_weak_group", Math.max(560, basePriority - 170), color);
          if (board[next.y][next.x] === color) {
            const support = groupAt(next);
            for (const liberty of group.libertyPoints) addCandidatePoint(candidates, liberty, "connection_toward_support", support.liberties.size <= 3 ? Math.max(760, basePriority - 100) : 560, color);
          }
        }
      }
    }
  }
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const point = { x, y };
      if (board[y][x] !== empty) continue;
      const ownNear = uniqueGroupsNear(point, color);
      const oppNear = uniqueGroupsNear(point, opponentColor);
      if (ownNear.length >= 2 && ownNear.some(group => group.liberties.size <= 3)) addCandidatePoint(candidates, point, "strict_necessary_connection", 780, color);
      if (oppNear.length >= 2) addCandidatePoint(candidates, point, "cut", 680, color);
    }
  }
  const globalPoints = [
    { x: 3, y: 3 }, { x: 15, y: 3 }, { x: 3, y: 15 }, { x: 15, y: 15 },
    { x: 9, y: 3 }, { x: 9, y: 15 }, { x: 3, y: 9 }, { x: 15, y: 9 },
    { x: 9, y: 9 }, { x: 6, y: 6 }, { x: 12, y: 12 }, { x: 6, y: 12 }, { x: 12, y: 6 }
  ];
  for (const point of globalPoints) {
    const near = nearestStoneDistance(point);
    addCandidatePoint(candidates, point, near <= 4 ? "invasion_reduction_with_support" : "large_whole_board_move", near <= 4 ? 430 : 520, color);
  }
  if (lastMove) {
    for (let y = Math.max(0, lastMove.y - 3); y <= Math.min(size - 1, lastMove.y + 3); y += 1) {
      for (let x = Math.max(0, lastMove.x - 3); x <= Math.min(size - 1, lastMove.x + 3); x += 1) {
        if ((Math.abs(x - lastMove.x) + Math.abs(y - lastMove.y)) <= 3) {
          addCandidatePoint(candidates, { x, y }, "policy_probe_local", 360, color);
        }
      }
    }
  }
  addMaxStrengthWholeBoardStrategyCandidates(candidates, color, ownGroups);
  return prioritizedCandidateList(candidates, 12);
}

function groupLibertyPoints(group) {
  performanceDiagnostics.aggregate.libertyPointsCallCount += 1;
  return Array.from(group.liberties).map(value => {
    const [x, y] = value.split(",").map(Number);
    return { x, y };
  });
}

function pointDistance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function uniqueGroupsNear(point, color, grid = board) {
  const groups = new Map();
  for (const next of neighbors(point)) {
    if (grid[next.y][next.x] !== color) continue;
    const group = groupAt(next, grid);
    groups.set(groupKey(group), group);
  }
  return Array.from(groups.values());
}

function openingShapeScore(point) {
  const edge = Math.min(point.x, point.y, size - 1 - point.x, size - 1 - point.y);
  const star = 3;
  const farStar = size - 1 - star;
  const cornerStars = [
    { x: star, y: star },
    { x: farStar, y: star },
    { x: star, y: farStar },
    { x: farStar, y: farStar }
  ];
  const sideStars = [
    { x: 9, y: star },
    { x: star, y: 9 },
    { x: farStar, y: 9 },
    { x: 9, y: farStar }
  ];
  const cornerDistance = Math.min(...cornerStars.map(starPoint => pointDistance(point, starPoint)));
  const sideDistance = Math.min(...sideStars.map(starPoint => pointDistance(point, starPoint)));
  const early = moveHistory.length < 50;
  let score = 0;

  if (edge === 0) score -= early ? 48 : 18;
  if (edge === 1) score -= early ? 18 : 4;
  if (edge === 2) score += early ? 7 : 2;
  if (edge === 3) score += early ? 13 : 4;
  if (early) {
    score += Math.max(0, 20 - cornerDistance * 5);
    score += Math.max(0, 10 - sideDistance * 2.2);
  } else if (moveHistory.length < 120) {
    score += Math.max(0, 8 - sideDistance);
  }

  return score;
}

function extractPolicyFeatures(point, color, grid = board) {
  const opponentColor = opponent(color);
  const adjacent = neighbors(point);
  const edge = Math.min(point.x, point.y, size - 1 - point.x, size - 1 - point.y);
  const friendlyGroups = uniqueGroupsNear(point, color, grid);
  const opponentGroups = uniqueGroupsNear(point, opponentColor, grid);
  return {
    edge,
    emptyNeighbors: adjacent.filter(next => grid[next.y][next.x] === empty).length,
    friendlyNeighbors: adjacent.filter(next => grid[next.y][next.x] === color).length,
    opponentNeighbors: adjacent.filter(next => grid[next.y][next.x] === opponentColor).length,
    friendlyGroups: friendlyGroups.length,
    opponentGroups: opponentGroups.length,
    friendlyAtariGroups: friendlyGroups.filter(group => group.liberties.size <= 1).length,
    opponentAtariGroups: opponentGroups.filter(group => group.liberties.size <= 1).length,
    lastMoveDistance: lastMove ? pointDistance(point, lastMove) : null
  };
}

function localPolicyPrior(point, color, grid = board) {
  let score = openingShapeScore(point);
  const features = extractPolicyFeatures(point, color, grid);

  score += features.emptyNeighbors * 2.5;
  score += features.friendlyNeighbors * 3;
  score += features.opponentNeighbors * 2;
  score += features.friendlyGroups >= 2 ? 8 : 0;
  score += features.opponentGroups >= 2 ? 7 : 0;
  score += features.friendlyAtariGroups * 18;
  score += features.opponentAtariGroups * 22;

  if (lastMove && grid[lastMove.y][lastMove.x] === opponent(color)) {
    if (features.lastMoveDistance <= 2) score += 9;
    else if (features.lastMoveDistance <= 4) score += 4;
  }

  for (let y = Math.max(0, point.y - 4); y <= Math.min(size - 1, point.y + 4); y++) {
    for (let x = Math.max(0, point.x - 4); x <= Math.min(size - 1, point.x + 4); x++) {
      const value = grid[y][x];
      if (value === empty) continue;
      const distance = Math.abs(point.x - x) + Math.abs(point.y - y);
      if (distance === 0 || distance > 4) continue;
      const influence = 4.5 / distance;
      score += value === color ? influence : influence * 0.65;
    }
  }

  const learnedModel = window.GoKidCoachPolicyModel;
  if (learnedModel && typeof learnedModel.scoreMove === "function") {
    const modelScore = Number(learnedModel.scoreMove({
      board: grid,
      point,
      color,
      size,
      moveHistory,
      lastMove,
      features
    }));
    if (Number.isFinite(modelScore)) score += modelScore * policyModelWeight();
  }

  return score;
}

function policyModelWeight() {
  return 1.0;
}

function openingBookScore(point, color) {
  const openingBook = window.GoKidCoachOpeningBook;
  if (!openingBook || typeof openingBook.openingMoveScore !== "function") return 0;
  const score = Number(openingBook.openingMoveScore({
    point,
    color,
    size,
    moveHistory
  }));
  return Number.isFinite(score) ? score : 0;
}

function nearestStoneDistance(point, grid = board) {
  performanceDiagnostics.aggregate.fullBoardScanCount += 1;
  let best = Infinity;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (grid[y][x] === empty) continue;
      const distance = Math.abs(point.x - x) + Math.abs(point.y - y);
      if (distance < best) best = distance;
    }
  }
  return best;
}

function evaluateMoveCandidate(point, color) {
  const before = snapshot();
  const opponentColor = opponent(color);
  const friendlyBefore = uniqueGroupsNear(point, color);
  const opponentBefore = uniqueGroupsNear(point, opponentColor);
  const savesFriendly = friendlyBefore.filter(group => group.liberties.has(`${point.x},${point.y}`));
  const attacksOpponent = opponentBefore.filter(group => group.liberties.has(`${point.x},${point.y}`));
  const policyPrior = localPolicyPrior(point, color);
  const bookScore = openingBookScore(point, color);
  const patternPolicy = policyPatternApi();
  const shapePolicy = shapeLibraryApi();
  const fusekiPolicy = fusekiLibraryApi();
  const tacticalPolicy = tacticalLibraryApi();
  const josekiPolicy = josekiLibraryApi();
  const endgamePolicy = endgameLibraryApi();
  const positionEvaluator = positionEvaluatorApi();
  const ruleEngine = window.GoKidCoachRuleEngine;
  const ruleEval = ruleEngine && typeof ruleEngine.evaluateMove === "function"
    ? ruleEngine.evaluateMove({
      board,
      point,
      color,
      moveHistory,
      lastMove,
      positionHashes
    })
    : { legal: true, ruleScore: 0 };

  if (!ruleEval.legal || !playMove(point, color)) {
    restore(before);
    return null;
  }

  let policyScore = 0;
  const move = moveHistory[moveHistory.length - 1];
  const captures = move?.captures || 0;
  const ownGroup = groupAt(point);
  const ownLiberties = ownGroup.liberties.size;
  const connectedFriendlyGroups = friendlyBefore.length;
  const cutOpponentGroups = opponentBefore.length;
  const edge = Math.min(point.x, point.y, size - 1 - point.x, size - 1 - point.y);

  policyScore += policyPrior * 0.75;
  policyScore += captures * 58;
  policyScore += Math.min(ownLiberties, 6) * 5.2;
  if (ownLiberties <= 1) policyScore -= captures > 0 ? 18 : 150;
  if (ownLiberties === 2) policyScore -= captures > 0 ? 2 : 22;

  for (const group of savesFriendly) {
    const liberties = group.liberties.size;
    if (liberties <= 1) policyScore += 82;
    else if (liberties === 2) policyScore += 38;
    else if (liberties === 3) policyScore += 12;
  }

  for (const group of attacksOpponent) {
    const liberties = group.liberties.size;
    if (liberties <= 1) policyScore += 90;
    else if (liberties === 2) policyScore += 42;
    else if (liberties === 3) policyScore += 14;
  }

  if (connectedFriendlyGroups >= 2) policyScore += 28 + connectedFriendlyGroups * 6;
  if (cutOpponentGroups >= 2) policyScore += 22 + cutOpponentGroups * 8;

  for (const next of neighbors(point)) {
    const value = board[next.y][next.x];
    if (value === color) policyScore += 7;
    if (value === opponentColor) policyScore += 4;
    if (value === opponentColor && groupAt(next).liberties.size <= 1) policyScore += 56;
    if (value === opponentColor && groupAt(next).liberties.size === 2) policyScore += 28;
    if (value === color && groupAt(next).liberties.size <= 1) policyScore -= 24;
    if (value === color && groupAt(next).liberties.size === 2) policyScore += 12;
  }

  if (ownLiberties <= 2) {
    const escapeOptions = groupLibertyPoints(ownGroup).filter(liberty => {
      const state = snapshot();
      const legal = playMove(liberty, opponentColor);
      const captured = legal && board[point.y][point.x] !== color;
      restore(state);
      return captured;
    }).length;
    if (escapeOptions > 0) policyScore -= escapeOptions * 38;
  }

  const nearestDistance = nearestStoneDistance(point, before.board);
  const moveNumber = before.moveHistory.length;
  const territoryValue = Math.max(0, bookScore * 0.18 + Math.max(0, ownLiberties - 2) * 4);
  const baseCandidate = {
    point: { ...point },
    color,
    legal: true,
    ruleLegal: true,
    moveNumber,
    openingBookScore: bookScore,
    ruleScore: ruleEval.ruleScore || 0,
    policyScore,
    captures,
    ownLiberties,
    reasons: Array.isArray(ruleEval.reasons) ? ruleEval.reasons.slice() : [],
    tacticalPressure: attacksOpponent.filter(group => group.liberties.size <= 2).length + (captures > 0 ? 1 : 0),
    rescueValue: savesFriendly.filter(group => group.liberties.size <= 2).length,
    connectionValue: connectedFriendlyGroups >= 2 ? connectedFriendlyGroups : 0,
    cutOpportunity: cutOpponentGroups >= 2 ? cutOpponentGroups : 0,
    lifeDeathValue: Math.max(0, captures * 2 + attacksOpponent.filter(group => group.liberties.size <= 1).length + savesFriendly.filter(group => group.liberties.size <= 1).length),
    ladderValue: Math.max(0, attacksOpponent.length >= 1 && nearestDistance <= 4 ? attacksOpponent.length : 0),
    territoryValue,
    endgameValue: moveNumber >= 120 ? Math.max(1, captures + connectedFriendlyGroups + ownLiberties) : 0,
    sourceTags: Array.isArray(point.sourceTags) ? point.sourceTags.slice() : (point.candidateSource ? [point.candidateSource] : []),
    candidateSource: point.candidateSource || "",
    urgentCandidate: Boolean(point.urgentCandidate),
    weakGroupCandidate: Boolean(point.weakGroupCandidate),
    globalCandidate: Boolean(point.globalCandidate),
    obviousGiveaway: ruleEval.reasons?.includes("obvious_giveaway") || (ownLiberties <= 1 && captures === 0),
    isSuicide: false,
    isMeaninglessFirstLine: before.moveHistory.length < 30 && edge === 0 && captures === 0 && bookScore <= 0,
    isRandomFlyaway: before.moveHistory.length < 30 && Number.isFinite(nearestDistance) && nearestDistance > 7
  };
  const positionScore = positionEvaluator && typeof positionEvaluator.scoreMoveByPosition === "function"
    ? Number(positionEvaluator.scoreMoveByPosition(baseCandidate, before.board, color))
    : 0;
  const patternLookup = patternPolicy && typeof patternPolicy.lookupPatternScore === "function"
    ? patternPolicy.lookupPatternScore(before.board, point, color, { moveNumber })
    : { patternScore: 0, confidence: 0 };
  const shapeLookup = shapePolicy && typeof shapePolicy.scoreShape === "function"
    ? shapePolicy.scoreShape(point, before.board, color, { moveNumber })
    : { shapeScore: 0, confidence: 0 };
  const fusekiLookup = fusekiPolicy && typeof fusekiPolicy.scoreFusekiMove === "function"
    ? fusekiPolicy.scoreFusekiMove(point, before.board, color, { moveNumber, openingBookScore: bookScore, moveHistory: before.moveHistory })
    : { fusekiScore: 0, confidence: 0 };
  const tacticalLookup = tacticalPolicy && typeof tacticalPolicy.scoreTacticalMove === "function"
    ? tacticalPolicy.scoreTacticalMove(point, before.board, color, { moveNumber, moveHistory: before.moveHistory })
    : { tacticalScore: 0, confidence: 0 };
  const josekiLookup = josekiPolicy && typeof josekiPolicy.scoreJosekiMove === "function"
    ? josekiPolicy.scoreJosekiMove(point, before.board, color, { moveNumber, moveHistory: before.moveHistory })
    : { josekiScore: 0, confidence: 0 };
  const endgameLookup = endgamePolicy && typeof endgamePolicy.scoreEndgameMove === "function"
    ? endgamePolicy.scoreEndgameMove(point, before.board, color, { moveNumber })
    : { endgameScore: 0, confidence: 0 };
  const patternScore = Number(patternLookup?.patternScore || 0);
  const confidence = Number(patternLookup?.confidence || 0);
  const shapeScore = Number(shapeLookup?.shapeScore || 0);
  const shapeConfidence = Number(shapeLookup?.confidence || 0);
  const fusekiScore = Number(fusekiLookup?.fusekiScore || 0) * phaseScaleForSource("fuseki", moveNumber, point);
  const fusekiConfidence = Number(fusekiLookup?.confidence || 0);
  const tacticalScore = Number(tacticalLookup?.tacticalScore || 0);
  const tacticalConfidence = Number(tacticalLookup?.confidence || 0);
  const josekiScore = Number(josekiLookup?.josekiScore || 0) * phaseScaleForSource("joseki", moveNumber, point);
  const josekiConfidence = Number(josekiLookup?.confidence || 0);
  const endgameScore = Number(endgameLookup?.endgameScore || 0);
  const endgameConfidence = Number(endgameLookup?.confidence || 0);
  const safePositionScore = Number.isFinite(positionScore) ? positionScore : 0;
  const safePatternScore = Number.isFinite(patternScore) ? patternScore : 0;
  const safeShapeScore = Number.isFinite(shapeScore) ? shapeScore * phaseScaleForSource("shape", moveNumber, point) : 0;
  const safeFusekiScore = Number.isFinite(fusekiScore) ? fusekiScore : 0;
  const safeTacticalScore = Number.isFinite(tacticalScore) ? tacticalScore : 0;
  const safeJosekiScore = Number.isFinite(josekiScore) ? josekiScore : 0;
  const safeEndgameScore = Number.isFinite(endgameScore) ? endgameScore : 0;
  const safeConfidence = Number.isFinite(confidence) ? confidence : 0;
  const safeShapeConfidence = Number.isFinite(shapeConfidence) ? shapeConfidence : 0;
  const safeFusekiConfidence = Number.isFinite(fusekiConfidence) ? fusekiConfidence : 0;
  const safeTacticalConfidence = Number.isFinite(tacticalConfidence) ? tacticalConfidence : 0;
  const safeJosekiConfidence = Number.isFinite(josekiConfidence) ? josekiConfidence : 0;
  const safeEndgameConfidence = Number.isFinite(endgameConfidence) ? endgameConfidence : 0;
  const detectedEndgame = endgameLookup?.detectedPattern || {};
  const endgameClassification = positionEvaluator && typeof positionEvaluator.classifyEndgameMove === "function"
    ? positionEvaluator.classifyEndgameMove(baseCandidate, before.board, color)
    : {};
  const lowValueEvidence = positionEvaluator && typeof positionEvaluator.lowValueEndgameEvidence === "function"
    ? positionEvaluator.lowValueEndgameEvidence(before.board, baseCandidate, color, { moveNumber })
    : {};
  const combinedScore = bookScore + (ruleEval.ruleScore || 0) + policyScore + safePatternScore + safeShapeScore + safeFusekiScore + safeTacticalScore + safeJosekiScore + safeEndgameScore + safePositionScore;
  const rawCandidate = {
    ...baseCandidate,
    policyScore,
    patternScore: safePatternScore,
    shapeScore: safeShapeScore,
    fusekiScore: safeFusekiScore,
    tacticalScore: safeTacticalScore,
    josekiScore: safeJosekiScore,
    endgameScore: safeEndgameScore,
    endgameConfidence: safeEndgameConfidence,
    endgamePattern: detectedEndgame,
    endgameCategory: endgameClassification.category || detectedEndgame.category || "",
    dameCandidate: Boolean(endgameClassification.dame || detectedEndgame.dame),
    redundantReinforcement: Boolean(endgameClassification.redundantReinforcement),
    lowValueCandidate: Boolean(lowValueEvidence.eligible),
    lowValueEvidence,
    confidence: Math.max(safeConfidence, safeShapeConfidence, safeFusekiConfidence, safeTacticalConfidence, safeJosekiConfidence, safeEndgameConfidence),
    positionScore: safePositionScore,
    combinedScore,
    positionSummary: positionEvaluator && typeof positionEvaluator.explainPositionSummary === "function"
      ? positionEvaluator.explainPositionSummary(positionEvaluator.evaluatePosition(before.board, color))
      : ""
  };
  const fusion = contextFusionApi();
  const fusedCandidate = fusion && typeof fusion.fuseCandidate === "function"
    ? fusion.fuseCandidate(rawCandidate, { moveNumber })
    : rawCandidate;
  const candidate = {
    ...fusedCandidate,
    coherentClass: classifyCoherentCandidate(fusedCandidate)
  };
  restore(before);
  return candidate;
}

function scoreMove(point, color) {
  const candidate = evaluateMoveCandidate(point, color);
  return candidate ? candidate.combinedScore : -Infinity;
}

function chooseLocalAIMove(moves, color = aiStoneColor(), perfRecord = null) {
  const evaluated = measureStage(perfRecord || {}, "positionEvaluationMs", () => moves
    .map(point => evaluateMoveCandidate(point, color))
    .filter(Boolean));
  if (!evaluated.length) return null;

  const difficulty = difficultyControllerApi();
  if (!difficulty || typeof difficulty.getDifficultySettings !== "function") {
    return evaluated.sort((a, b) => b.combinedScore - a.combinedScore)[0]?.point || null;
  }

  const moveQuality = moveQualityControllerApi();
  const positionEvaluator = positionEvaluatorApi();
  const midgameStability = midgameStabilityApi();
  const maxMode = isMaxStrengthMode();
  const companionPlan = maxMode ? null : createCompanionPlanForCurrentChild();
  const settings = applyReleaseDifficultyMode(
    difficulty.getDifficultySettings(studentProfile || loadStudentProfileForChild(), recentChildResults(), companionPlan)
  );
  const currentPositionEval = measureStage(perfRecord || {}, "boardAnalysisMs", () => (
    positionEvaluator && typeof positionEvaluator.evaluatePosition === "function"
      ? positionEvaluator.evaluatePosition(board, color)
      : null
  ));
  const smoothedPositionEval = measureStage(perfRecord || {}, "weakGroupAnalysisMs", () => (
    midgameStability && typeof midgameStability.smoothPositionEvaluation === "function"
      ? midgameStability.smoothPositionEvaluation(currentPositionEval, previousPositionEval)
      : currentPositionEval
  ));
  const fusion = contextFusionApi();
  const stabilized = measureStage(perfRecord || {}, "contextFusionMs", () => evaluated.map(candidate => {
    const midgameScore = midgameStability && typeof midgameStability.scoreMidgameMove === "function"
      ? Number(midgameStability.scoreMidgameMove(candidate, board, { positionEval: smoothedPositionEval }))
      : 0;
    const safeMidgameScore = Number.isFinite(midgameScore) ? midgameScore : 0;
    const prepared = {
      ...candidate,
      midgameScore: safeMidgameScore,
      combinedScore: candidate.combinedScore + safeMidgameScore,
      midgameExplanation: midgameStability && typeof midgameStability.explainMidgameDecision === "function"
        ? midgameStability.explainMidgameDecision({ ...candidate, midgameScore: safeMidgameScore }, { positionEval: smoothedPositionEval })
        : ""
    };
    return fusion && typeof fusion.fuseCandidate === "function"
      ? fusion.fuseCandidate(prepared, {
        moveNumber: moveHistory.length,
        companionPlan: maxMode ? null : companionPlan,
        difficultySettings: settings,
        childStrengthEstimate: maxMode ? 100 : companionPlan?.currentStrength,
        aiCalibrationLevel: maxMode ? 100 : settings?.suggestedAiStrength
      })
      : prepared;
  }));
  const ruleEngine = window.GoKidCoachRuleEngine;
  const verificationResult = measureStage(perfRecord || {}, "localReadingMs", () => (
    ruleEngine && typeof ruleEngine.applyShallowTacticalVerification === "function"
      ? ruleEngine.applyShallowTacticalVerification(stabilized, board, color, {
      positionHashes,
      moveNumber: moveHistory.length,
      normalMaxCandidates: 12,
      absoluteMaxCandidates: 16,
      maxReplies: 5,
      timeBudgetMs: 80
      })
      : { candidates: stabilized, diagnostics: null }
  ));
  const shallowCandidates = verificationResult.candidates || stabilized;
  const localReadingResult = measureStage(perfRecord || {}, "localReadingMs", () => (
    ruleEngine && typeof ruleEngine.applyLocalReading === "function"
      ? ruleEngine.applyLocalReading(shallowCandidates, board, color, {
        positionHashes,
        moveNumber: moveHistory.length,
        maxDepth: 3,
        maxCandidates: maxMode ? 10 : 8,
        maxOpponentReplies: 4,
        allowConditionalReply5: maxMode,
        difficultyMode: maxMode ? maxStrengthMode : mode,
        maxAiContinuations: 3,
        localRadius: 4,
        regionCap: 48,
        timeBudgetMs: 120
      })
      : { candidates: shallowCandidates, diagnostics: null }
  ));
  if (perfRecord && localReadingResult?.diagnostics) perfRecord.candidatesRead = localReadingResult.diagnostics.candidatesRead || perfRecord.candidatesRead || 0;
  const verifiedCandidates = (localReadingResult.candidates || shallowCandidates).map(candidate => ({
    ...candidate,
    coherentClass: classifyCoherentCandidate(candidate)
  }));
  const adjusted = measureStage(perfRecord || {}, "candidateSortingMs", () => difficulty.adjustMoveCandidates(verifiedCandidates, settings));
  const moveQualityContext = {
    companionState,
    recentMoveAssessments: companionState?.moveAssessments || [],
    companionPlan,
    difficultySettings: settings,
    positionEval: smoothedPositionEval,
    moveNumber: moveHistory.length
  };
  const ranked = measureStage(perfRecord || {}, "candidateSortingMs", () => (
    moveQuality && typeof moveQuality.rankCandidates === "function"
      ? moveQuality.rankCandidates(adjusted, moveQualityContext)
      : { ranked: adjusted, groups: {}, context: moveQualityContext }
  ));
  const preferred = measureStage(perfRecord || {}, "finalSelectionMs", () => (
    maxMode
      ? (ranked.ranked || adjusted).slice().sort(deterministicCandidateCompare)[0]
      : moveQuality && typeof moveQuality.chooseMoveByQuality === "function"
        ? moveQuality.chooseMoveByQuality(ranked, moveQualityContext)
        : difficulty.chooseAdaptiveMove(ranked.ranked || adjusted, settings)
  ));
  const choice = preferred
    || ranked.ranked?.[0]
    || adjusted[0]
    || evaluated.sort((a, b) => b.combinedScore - a.combinedScore)[0];
  const guardedChoice = finalSelectorGuard(choice, ranked.ranked || adjusted, color);
  if (guardedChoice) {
    currentCompanionPlan = companionPlan;
    currentMoveQualityPlan = ranked.context || moveQualityContext;
    previousPositionEval = smoothedPositionEval;
    lastAdaptiveSummary = {
      summary: moveQuality && typeof moveQuality.explainMoveQuality === "function"
        ? moveQuality.explainMoveQuality(guardedChoice)
        : "",
      confidence: guardedChoice.confidence || 0,
      precisionBand: (ranked.context || moveQualityContext)?.precisionBand || "balanced"
    };
    const finalRank = (ranked.ranked || adjusted).findIndex(candidate => candidateKey(candidate) === candidateKey(guardedChoice));
    lastSelectedCandidateFinalRank = finalRank >= 0 ? finalRank + 1 : 0;
    lastSelectedCandidateTier = selectedCandidateTier(guardedChoice);
  }
  return guardedChoice?.point || null;
}

async function requestRemoteAIMove() {
  const endpoint = profile.kataGoUrl || profile.remoteAIUrl;
  if (!endpoint) {
    remoteAiState = "notConfigured";
    updateRemoteAiStatus();
    return null;
  }

  const payload = {
    boardSize: size,
    aiLevel: profile.aiLevel,
    stage: learningStage().name,
    board: board.map(row => row.slice()),
    toPlay: colorName(aiStoneColor()),
    komi,
    moves: moveHistory.map(item => ({
      color: colorName(item.color),
      x: item.pass ? null : item.x,
      y: item.pass ? null : item.y,
      pass: Boolean(item.pass)
    }))
  };

  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 2500);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    window.clearTimeout(timer);
    if (!response.ok) {
      remoteAiState = "failed";
      updateRemoteAiStatus();
      return null;
    }
    const data = await response.json();
    lastAiAnalysis = { ...normalizeRemoteAnalysis(data), boardHash: boardHash() };
    const move = typeof data.move === "string"
      ? parseMoveText(data.move)
      : data.move && typeof data.move.x === "number" && typeof data.move.y === "number"
        ? data.move
        : typeof data.x === "number" && typeof data.y === "number"
          ? { x: data.x, y: data.y }
          : null;
    remoteAiState = move ? "connected" : "failed";
    updateRemoteAiStatus();
    if (!move) return null;
    return move;
  } catch {
    remoteAiState = "failed";
    updateRemoteAiStatus();
    return null;
  }
}

function parseMoveText(text) {
  const value = text.trim().toUpperCase();
  if (!value || value === "PASS") return null;
  const letters = "ABCDEFGHJKLMNOPQRST";
  const x = letters.indexOf(value[0]);
  const yNumber = Number(value.slice(1));
  if (x < 0 || !Number.isFinite(yNumber)) return null;
  const y = size - yNumber;
  if (x < 0 || x >= size || y < 0 || y >= size) return null;
  return { x, y };
}

function aiMove() {
  if (finished || !checkBuildConsistency()) return;
  const aiColor = aiStoneColor();
  thinking.classList.remove("hidden");
  updateStatus(t("thinking"));
  const started = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();

  aiTimer = window.setTimeout(async () => {
    aiTimer = null;
    const counterStart = { ...performanceDiagnostics.aggregate };
    const perfRecord = {
      moveNumber: moveHistory.length + 1,
      phase: moveHistory.length <= 16 ? "opening" : moveHistory.length <= 35 ? "transition" : moveHistory.length < 200 ? "middlegame" : "late_game",
      legalPointCount: board.flat().filter(value => value === empty).length,
      rawCandidateCount: 0,
      deduplicatedCandidateCount: 0,
      candidatesRead: 0,
      boardCopyCount: 0,
      simulateMoveCount: 0,
      groupAtCallCount: 0,
      libertyPointsCallCount: 0,
      fullBoardScanCount: 0,
      JSONSerializeCount: 0,
      persistencePayloadBytes: 0,
      diagnosticEntryCount: performanceDiagnostics.moveStages.length,
      estimatedMemoryBytes: 0
    };
    const moves = measureStage(perfRecord, "candidateGenerationMs", () => generateMiddlegameCandidateMoves(aiColor));
    perfRecord.rawCandidateCount = moves.length;
    perfRecord.deduplicatedCandidateCount = new Set(moves.map(point => `${point.x},${point.y}`)).size;
    if (!moves.length) {
      thinking.classList.add("hidden");
      pass();
      return;
    }

    const remoteMove = await measureStage(perfRecord, "diagnosticsMs", () => requestRemoteAIMove());
    const remoteLegal = remoteMove && window.GoKidCoachRuleEngine?.evaluateMove?.({ board, point: remoteMove, color: aiColor, moveHistory, positionHashes })?.legal;
    if (remoteMove && remoteLegal) {
      undoStack.push(snapshot());
      playMove(remoteMove, aiColor);
      aiThinkTimes.push((typeof performance !== "undefined" && performance.now ? performance.now() : Date.now()) - started);
      updateExportSnapshot("active");
      measureStage(perfRecord, "persistenceMs", () => saveCurrentGame());
      thinking.classList.add("hidden");
      measureStage(perfRecord, "renderingMs", () => update());
      perfRecord.totalAiThinkTimeMs = Math.max(0, nowMs() - started);
      for (const key of ["boardCopyCount", "simulateMoveCount", "groupAtCallCount", "libertyPointsCallCount", "fullBoardScanCount", "JSONSerializeCount", "persistencePayloadBytes"]) {
        perfRecord[key] = Math.max(0, Number(performanceDiagnostics.aggregate[key] || 0) - Number(counterStart[key] || 0));
      }
      perfRecord.estimatedMemoryBytes = estimateBytes({ moveHistory, undoStack, diagnostics: performanceDiagnostics.moveStages });
      recordMovePerformance(perfRecord);
      return;
    }

    const choice = chooseLocalAIMove(moves, aiColor, perfRecord) || moves[0];
    undoStack.push(snapshot());
    playMove(choice, aiColor);
    aiThinkTimes.push((typeof performance !== "undefined" && performance.now ? performance.now() : Date.now()) - started);
    updateExportSnapshot("active");
    measureStage(perfRecord, "persistenceMs", () => saveCurrentGame());
    thinking.classList.add("hidden");
    measureStage(perfRecord, "renderingMs", () => update());
    perfRecord.totalAiThinkTimeMs = Math.max(0, nowMs() - started);
    for (const key of ["boardCopyCount", "simulateMoveCount", "groupAtCallCount", "libertyPointsCallCount", "fullBoardScanCount", "JSONSerializeCount", "persistencePayloadBytes"]) {
      perfRecord[key] = Math.max(0, Number(performanceDiagnostics.aggregate[key] || 0) - Number(counterStart[key] || 0));
    }
    perfRecord.estimatedMemoryBytes = estimateBytes({ moveHistory, undoStack, diagnostics: performanceDiagnostics.moveStages });
    recordMovePerformance(perfRecord);
  }, 350);
}

function estimateWinner() {
  let blackStones = 0;
  let whiteStones = 0;
  for (const row of board) {
    for (const value of row) {
      if (value === black) blackStones++;
      if (value === white) whiteStones++;
    }
  }
  const territory = estimateTerritory();
  const blackScore = blackStones + territory.black;
  const whiteScore = whiteStones + territory.white + komi;
  const childWon = childStoneColor() === black ? blackScore >= whiteScore : whiteScore > blackScore;
  return { childWon, blackScore, whiteScore, territory };
}

function estimateTerritory() {
  const visited = new Set();
  const territory = { black: 0, white: 0, neutral: 0 };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (board[y][x] !== empty) continue;
      const key = `${x},${y}`;
      if (visited.has(key)) continue;

      const stack = [{ x, y }];
      const region = [];
      const borders = new Set();

      while (stack.length) {
        const point = stack.pop();
        const pointKey = `${point.x},${point.y}`;
        if (visited.has(pointKey)) continue;
        visited.add(pointKey);
        region.push(point);

        for (const next of neighbors(point)) {
          const value = board[next.y][next.x];
          if (value === empty) stack.push(next);
          if (value === black) borders.add(black);
          if (value === white) borders.add(white);
        }
      }

      if (borders.size === 1 && borders.has(black)) territory.black += region.length;
      else if (borders.size === 1 && borders.has(white)) territory.white += region.length;
      else territory.neutral += region.length;
    }
  }

  return territory;
}

function analyzeGame(result) {
  const early = moveHistory.filter(item => !item.pass && item.color === black).slice(0, 20);
  const center = (size - 1) / 2;
  const maxDistance = Math.max(1, size - 1);
  const earlyCenterBias = early.length
    ? early.reduce((sum, item) => sum + (maxDistance - Math.abs(item.x - center) - Math.abs(item.y - center)), 0) / early.length
    : 0;
  const openingScore = clamp(Math.round(earlyCenterBias * (58 / maxDistance)), 10, 100);
  const captureBalance = blackCaptures - whiteCaptures;
  const fightingScore = clamp(50 + captureBalance * 8, 10, 100);
  const completionTarget = size === 9 ? 55 : size === 13 ? 95 : 150;
  const completionScore = clamp(Math.round(moveHistory.length / completionTarget * 100), 10, 100);
  const resultScore = result.childWon ? 60 : 40;
  const performance = Math.round(resultScore * 0.35 + openingScore * 0.2 + fightingScore * 0.25 + completionScore * 0.2);

  return {
    performance,
    openingScore,
    fightingScore,
    completionScore,
    captureBalance
  };
}

function collectStudentSignals(analysis, result) {
  const blackGroups = collectGroups(black);
  const whiteGroups = collectGroups(white);
  const weakBlackGroups = blackGroups.filter(group => group.liberties.size <= 2).length;
  const pressuredWhiteGroups = whiteGroups.filter(group => group.liberties.size <= 2).length;
  const earlyMoves = moveHistory.filter(item => !item.pass && item.color === black).slice(0, 30);
  const cornerCount = new Set(earlyMoves
    .filter(item => {
      const edge = Math.min(item.x, item.y, size - 1 - item.x, size - 1 - item.y);
      return edge <= 3;
    })
    .map(item => {
      const left = item.x < size / 2 ? "L" : "R";
      const top = item.y < size / 2 ? "T" : "B";
      return `${left}${top}`;
    })).size;
  const lateBlackMoves = moveHistory.filter(item => !item.pass && item.color === black).slice(-40);
  const territoryGap = (result.territory.black || 0) - (result.territory.white || 0);

  return {
    opening: clamp(Math.round(analysis.openingScore * 0.65 + cornerCount * 9), 0, 100),
    capture: clamp(50 + blackCaptures * 7 - whiteCaptures * 4 + pressuredWhiteGroups * 3, 0, 100),
    atari: clamp(Math.round(analysis.fightingScore * 0.7 + pressuredWhiteGroups * 7 - weakBlackGroups * 10), 0, 100),
    connection: clamp(62 - weakBlackGroups * 12 + Math.min(18, earlyMoves.length / 2), 0, 100),
    lifeDeath: clamp(Math.round(analysis.fightingScore * 0.55 + analysis.completionScore * 0.15 + (pressuredWhiteGroups - weakBlackGroups) * 8), 0, 100),
    ladder: clamp(Math.round((analysis.fightingScore + analysis.performance) / 2), 0, 100),
    territory: clamp(50 + territoryGap * 2 + lateBlackMoves.length / 3, 0, 100),
    endgame: clamp(Math.round(analysis.completionScore * 0.72 + lateBlackMoves.length * 0.5), 0, 100),
    blunderRate: clamp(50 + whiteCaptures * 5 + weakBlackGroups * 8 - blackCaptures * 2, 0, 100),
    readingDepth: clamp(Math.round(analysis.performance * 0.45 + analysis.fightingScore * 0.35 + moveHistory.length / 4), 0, 100)
  };
}

function updateStudentModelFromGame(result, analysis) {
  const api = studentModelApi();
  if (!api || typeof api.updateProfileFromGame !== "function") return;
  studentProfile = api.updateProfileFromGame({
    childId: profileStore.activeChildId,
    childWon: result.childWon,
    moveCount: moveHistory.length,
    blackCaptures,
    whiteCaptures,
    territoryBlack: result.territory.black || 0,
    territoryWhite: result.territory.white || 0,
    analysis,
    studentSignals: collectStudentSignals(analysis, result)
  }, studentProfile || api.loadStudentProfile(profileStore.activeChildId));
}

function finishGame() {
  if (finished) return;
  finished = true;
  hideEndConfirm();
  const result = estimateWinner();
  const analysis = analyzeGame(result);
  const childWon = result.childWon;
  profile.gamesPlayed += 1;
  if (childWon) profile.wins += 1;
  const rawAdjustment = Math.round((analysis.performance - 50) * 1.4);
  const adjustment = productSupportApi()?.boundedAdaptiveAdjustment?.(profile.history, rawAdjustment) ?? clamp(rawAdjustment, -18, 18);
  profile.rating = clamp(profile.rating + adjustment, 100, 1000);
  profile.aiLevel = clamp(profile.aiLevel + adjustment + (childWon ? 14 : -2), minimumInitialAiLevel, 980);
  profile.fighting = clamp(profile.fighting * 0.72 + analysis.fightingScore * 0.28, 10, 100);
  profile.opening = clamp(profile.opening * 0.75 + analysis.openingScore * 0.25, 10, 100);
  profile.stability = clamp(profile.stability * 0.75 + analysis.completionScore * 0.25, 10, 100);
  profile.stage = learningStage().name;
  profile.history.unshift({
    result: childWon ? "childWin" : "aiWin",
    childWon,
    completed: true,
    moves: moveHistory.length,
    boardSize: size,
    stage: profile.stage,
    level: Math.round(profile.aiLevel),
    performance: analysis.performance,
    captures: `${blackCaptures}:${whiteCaptures}`,
    adaptiveFocus: currentCompanionPlan?.focus || null,
    adaptiveBand: currentMoveQualityPlan?.precisionBand || null,
    time: new Date().toLocaleDateString("zh-CN")
  });
  profile.history = profile.history.slice(0, 8);
  profile.trend = profile.history.slice(0, 10);
  updateStudentModelFromGame(result, analysis);
  updateCompanionResultFromGame(result, analysis);
  saveGameDiagnostic("completed", result);
  saveProfile();
  saveCurrentGame();
  renderReview(result, analysis);
  update();
  if (childWon && profile.rewardEnabled && moveHistory.length >= 40) showVictoryPopup();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function pass() {
  if (finished || !checkBuildConsistency()) return;
  undoStack.push(snapshot());
  moveHistory.push({ pass: true, color: turn, captures: 0 });
  positionHashes.push(boardHash());
  consecutivePasses += 1;
  turn = opponent(turn);
  updateExportSnapshot("active");
  saveCurrentGame();
  if (consecutivePasses >= 2) {
    showEndConfirm();
    return;
  }
  if (turn === aiStoneColor()) aiMove();
  update();
}

function undoMove() {
  if (aiTimer) {
    window.clearTimeout(aiTimer);
    aiTimer = null;
    thinking.classList.add("hidden");
  }
  if (!undoStack.length) return;
  let state = undoStack.pop();
  while (state && state.turn !== black && undoStack.length) {
    state = undoStack.pop();
  }
  restore(state);
  replaceList(document.getElementById("review"), [t("undoDone")]);
  update();
}

function newGame() {
  if (!checkBuildConsistency()) return;
  if (!finished && moveHistory.length > 0) {
    preserveExportSnapshot("abandoned");
    saveGameDiagnostic("abandoned", null);
  }
  size = fixedBoardSize;
  profile.boardSize = fixedBoardSize;
  board = freshBoard();
  turn = black;
  lastMove = null;
  blackCaptures = 0;
  whiteCaptures = 0;
  moveHistory = [];
  undoStack = [];
  positionHashes = [boardHash(board)];
  finished = false;
  consecutivePasses = 0;
  restoreCount = 0;
  childIllegalAttemptCount = 0;
  aiRejectedCandidateCount = 0;
  aiThinkTimes = [];
  gameStartTimestamp = Date.now();
  currentGameId = `game-${Date.now()}`;
  lastAiAnalysis = null;
  companionState = createCompanionStateForChild();
  currentCompanionPlan = createCompanionPlanForCurrentChild();
  currentMoveQualityPlan = null;
  latestExportSnapshot = null;
  previousPositionEval = null;
  lastAdaptiveSummary = null;
  if (aiTimer) {
    window.clearTimeout(aiTimer);
    aiTimer = null;
  }
  replaceList(document.getElementById("review"), [t("reviewEmpty")]);
  thinking.classList.add("hidden");
  hideVictoryPopup();
  hideEndConfirm();
  saveCurrentGame();
  update();
  if (turn === aiStoneColor()) aiMove();
}

function continueLastGame() {
  if (loadCurrentGame()) {
    saveProfile();
    saveCurrentGame();
    update();
    if (!finished && turn === aiStoneColor()) aiMove();
  } else {
    updateStatus("没有可恢复的对局");
  }
}

function clearSavedGame() {
  try {
    localStorage.removeItem(currentGameKey());
  } catch {
    // Storage may be blocked.
  }
  productSupportApi()?.clearCurrentGame?.(currentGameKey()).catch(() => {});
  resetGameState();
  saveCurrentGame();
  update();
}

function changeChildColor(value) {
  profile.childColor = value === "white" ? "white" : "black";
  saveProfile();
  newGame();
}

function resetGameState() {
  size = fixedBoardSize;
  profile.boardSize = fixedBoardSize;
  board = freshBoard();
  turn = black;
  lastMove = null;
  blackCaptures = 0;
  whiteCaptures = 0;
  moveHistory = [];
  undoStack = [];
  positionHashes = [boardHash(board)];
  finished = false;
  consecutivePasses = 0;
  restoreCount = 0;
  childIllegalAttemptCount = 0;
  aiRejectedCandidateCount = 0;
  aiThinkTimes = [];
  gameStartTimestamp = Date.now();
  currentGameId = `game-${Date.now()}`;
  if (aiTimer) {
    window.clearTimeout(aiTimer);
    aiTimer = null;
  }
  thinking.classList.add("hidden");
  hideVictoryPopup();
  hideEndConfirm();
}

function switchChild(childId) {
  saveProfile();
  saveCurrentGame();
  profileStore.activeChildId = childId;
  profile = getActiveProfile();
  studentProfile = loadStudentProfileForChild(childId);
  companionState = createCompanionStateForChild();
  currentCompanionPlan = createCompanionPlanForCurrentChild();
  currentMoveQualityPlan = null;
  previousPositionEval = null;
  lastAdaptiveSummary = null;
  size = fixedBoardSize;
  if (!loadCurrentGame()) resetGameState();
  saveProfile();
  update();
}

function addChild() {
  const input = document.getElementById("newChildName");
  const name = input.value.trim() || `${t("child")}${Object.keys(profileStore.profiles).length + 1}`;
  const id = `child-${Date.now()}`;
  saveProfile();
  saveCurrentGame();
  profileStore.profiles[id] = createProfile(name, profile.initialAiLevel || profile.aiLevel);
  profileStore.activeChildId = id;
  profile = getActiveProfile();
  studentProfile = saveStudentProfileForChild({ childId: id });
  companionState = createCompanionStateForChild();
  currentCompanionPlan = createCompanionPlanForCurrentChild();
  currentMoveQualityPlan = null;
  previousPositionEval = null;
  lastAdaptiveSummary = null;
  input.value = "";
  resetGameState();
  saveProfile();
  saveCurrentGame();
  update();
}

function changeBoardSize(value) {
  void value;
  profile.boardSize = fixedBoardSize;
  size = fixedBoardSize;
}

function nearestDifficultyPreset(level) {
  const mode = productSupportApi()?.normalizeDifficultyMode?.(profile.difficultyMode || level) || profile.difficultyMode || "adaptive";
  const uiMode = mode === maxStrengthMode ? "advanced" : mode;
  return difficultyPresets.find(preset => preset.value === uiMode) || difficultyPresets[3];
}

function changeInitialDifficulty(value) {
  const product = productSupportApi();
  const mode = product?.normalizeDifficultyMode?.(value) || "adaptive";
  const nextLevel = product?.difficultyModeConfig?.(mode)?.level || defaultInitialAiLevel;
  profile.difficultyMode = mode;
  profile.initialAiLevel = nextLevel;
  profile.aiLevel = nextLevel;
  saveProfile();
  saveCurrentGame();
  update();
}

function setupDemoPosition() {
  size = fixedBoardSize;
  profile.boardSize = fixedBoardSize;
  board = freshBoard();
  const stones = [
    [black, 2, 3], [black, 3, 3], [black, 3, 4], [black, 4, 4], [black, 9, 3],
    [white, 1, 4], [white, 2, 4], [white, 4, 3], [white, 5, 4],
    [black, 15, 3], [black, 15, 4], [black, 16, 5], [white, 14, 3], [white, 16, 4],
    [black, 2, 14], [black, 3, 14], [black, 4, 15], [black, 4, 16],
    [white, 2, 15], [white, 3, 15], [white, 4, 13],
    [black, 14, 14], [black, 15, 14], [black, 16, 15], [black, 15, 16],
    [white, 13, 15], [white, 14, 15], [white, 16, 14], [white, 17, 15],
    [black, 9, 9], [white, 12, 16], [black, 13, 16], [white, 16, 17]
  ];

  for (const [stone, x, y] of stones) {
    board[y][x] = stone;
  }

  turn = black;
  lastMove = { x: 16, y: 17 };
  blackCaptures = 2;
  whiteCaptures = 1;
  moveHistory = stones.map(([stone, x, y], index) => ({ color: stone, x, y, captures: 0, pass: false, demo: index }));
  undoStack = [];
  positionHashes = [boardHash(board)];
  finished = false;
  consecutivePasses = 0;
}

function showEndConfirm() {
  const result = estimateWinner();
  document.getElementById("endEstimate").textContent = t("endEstimate", { black: result.blackScore.toFixed(1), white: result.whiteScore.toFixed(1) });
  document.getElementById("endConfirmPopup").classList.remove("hidden");
  update();
}

function hideEndConfirm() {
  document.getElementById("endConfirmPopup").classList.add("hidden");
}

function continueGameAfterEndConfirm() {
  consecutivePasses = 0;
  hideEndConfirm();
  update();
}

function renderReview(result, analysis) {
  const list = document.getElementById("review");
  const aiChange = analysis.performance >= 55 ? t("aiStronger") : analysis.performance <= 45 ? t("aiSofter") : t("aiSame");
  const weakBlack = weakestGroup(black);
  const bestMove = moveHistory
    .filter(item => !item.pass && item.color === black)
    .sort((a, b) => {
      const captureDiff = (b.captures || 0) - (a.captures || 0);
      if (captureDiff) return captureDiff;
      return GoKidCoachEngine.reviewPointScore(b, size) - GoKidCoachEngine.reviewPointScore(a, size);
    })[0];
  const bestText = bestMove && bestMove.captures > 0
    ? t("bestCapture", { move: coordinateName(bestMove), captures: bestMove.captures })
    : bestMove
      ? t("bestMoveReview", { move: coordinateName(bestMove) })
      : analysis.openingScore >= 60
        ? t("bestOpening")
        : t("bestFinish");
  const dangerText = weakBlack && weakBlack.liberties <= 2 && weakBlack.anchor
    ? t("weakGroupReview", { move: coordinateName(weakBlack.anchor) })
    : analysis.captureBalance < 0
    ? t("dangerCapture")
    : analysis.completionScore < 65
      ? t("dangerShort")
      : t("dangerCareless");
  const nextGoal = analysis.fightingScore < 50
    ? t("nextCountLiberties")
    : analysis.openingScore < 55
      ? t("nextOpening")
      : t("nextStage", { stage: learningStage().name, change: aiChange });
  const points = [
    result.childWon ? t("resultChild", { score: analysis.performance }) : t("resultAi", { score: analysis.performance }),
    bestText,
    dangerText,
    nextGoal
  ];
  if (lastAdaptiveSummary?.summary) points.splice(2, 0, lastAdaptiveSummary.summary);
  replaceList(list, points);
}

function updateCompanionResultFromGame(result, analysis) {
  const api = companionEngineApi();
  if (!api || typeof api.summarizeCompanionResult !== "function") {
    lastAdaptiveSummary = null;
    return;
  }
  lastAdaptiveSummary = api.summarizeCompanionResult({
    childWon: result.childWon,
    analysis,
    recentGames: recentGamesForAdaptive(),
    gameState: createAdaptiveGameState(),
    board
  }, studentProfile || loadStudentProfileForChild(), companionState);
  currentCompanionPlan = createCompanionPlanForCurrentChild();
  currentMoveQualityPlan = null;
}

function saveGameDiagnostic(status, result = null) {
  const product = productSupportApi();
  if (!product || typeof product.diagnosticSummary !== "function") return null;
  const exportSnapshot = status === "abandoned" || status === "completed"
    ? preserveExportSnapshot(status)
    : exportSnapshotForCurrentAction();
  const sgf = buildSGF(exportSnapshot);
  const integrity = product.exportIntegrity && window.GoKidCoachRuleEngine
    ? product.exportIntegrity(exportSnapshot, sgf, window.GoKidCoachRuleEngine.simulateMove)
    : {};
  const summary = product.diagnosticSummary({
    gameId: currentGameId,
    childColor: profile.childColor || "black",
    result: result ? (result.childWon ? "childWin" : "aiWin") : status,
    completed: status === "completed",
    abandoned: status === "abandoned",
    moveCount: exportSnapshot.actualMoveCount,
    ...integrity,
    difficultyMode: profile.difficultyMode || "adaptive",
    difficultyStart: profile.initialAiLevel,
    difficultyEnd: profile.aiLevel,
    adaptiveWeakeningEnabled: !isMaxStrengthMode(profile.difficultyMode),
    randomSofteningEnabled: !isMaxStrengthMode(profile.difficultyMode),
    selectedCandidateFinalRank: lastSelectedCandidateFinalRank,
    selectedCandidateTier: lastSelectedCandidateTier,
    aiThinkTimes,
    restoreCount,
    childIllegalAttemptCount,
    aiRejectedCandidateCount,
    appCrashRecoveryFlag: restoreCount > 0 && !finished
  });
  if (typeof product.saveDiagnostic === "function") product.saveDiagnostic(summary).catch(() => {});
  return summary;
}

function exportDebugSummary() {
  const snapshot = exportSnapshotForCurrentAction();
  const sgf = buildSGF(snapshot);
  const product = productSupportApi();
  const integrity = product?.exportIntegrity && window.GoKidCoachRuleEngine
    ? product.exportIntegrity(snapshot, sgf, window.GoKidCoachRuleEngine.simulateMove)
    : {};
  const summary = saveGameDiagnostic(finished ? "completed" : "abandoned", finished ? estimateWinner() : null);
  const info = buildInfo();
  const payload = {
    app: "GoKidCoachWeb",
    appVersion: info.appVersion,
    engineVersion: info.engineVersion,
    productVersion: info.productVersion,
    buildId: info.buildId,
    difficultyMode: profile.difficultyMode || "adaptive",
    adaptiveWeakeningEnabled: !isMaxStrengthMode(profile.difficultyMode),
    randomSofteningEnabled: !isMaxStrengthMode(profile.difficultyMode),
    selectedCandidateFinalRank: lastSelectedCandidateFinalRank,
    selectedCandidateTier: lastSelectedCandidateTier,
    summary: { ...summary, ...integrity },
    sgf,
    ...integrity,
    moveDiagnostics: snapshot.moveHistory.map((move, index) => ({
      index: index + 1,
      color: colorName(move.color),
      pass: Boolean(move.pass),
      move: move.pass ? "pass" : coordinateName(move),
      captures: move.captures || 0
    })),
    shallowTacticalVerifierActive: true
  };
  productSupportApi()?.saveDebugExport?.({ gameId: currentGameId, payload }).catch(() => {});
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `GoKidCoach-debug-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function showVictoryPopup() {
  document.getElementById("victoryPopup").classList.remove("hidden");
}

function hideVictoryPopup() {
  document.getElementById("victoryPopup").classList.add("hidden");
}

function colorName(color) {
  return color === black ? "B" : "W";
}

function coordinateName(point) {
  const letters = "ABCDEFGHJKLMNOPQRST";
  return `${letters[point.x]}${size - point.y}`;
}

function bestHintMove() {
  const childColor = childStoneColor();
  if (finished || turn !== childColor) return null;
  const moves = legalMoves(childColor);
  if (!moves.length) return null;
  moves.sort((a, b) => scoreMove(b, childColor) - scoreMove(a, childColor));
  return moves[0];
}

function hintMove() {
  const hint = bestHintMove();
  if (!hint) {
    updateStatus(t("noHint"));
    return;
  }
  const before = snapshot();
  playMove(hint, childStoneColor());
  const group = groupAt(hint);
  const nearbyOpponent = neighbors(hint).some(point => board[point.y][point.x] === aiStoneColor());
  restore(before);
  const reason = nearbyOpponent
    ? t("reasonFight")
    : group.liberties.size >= 3
      ? t("reasonLiberties")
      : t("reasonCareful");
  updateStatus(t("hintStatus", { move: coordinateName(hint), reason }));
  replaceList(document.getElementById("review"), [t("hintPoint", { move: coordinateName(hint) }), reason, learningStage().goal]);
}

function explainPosition() {
  const blackGroups = collectGroups(black);
  const whiteGroups = collectGroups(white);
  const weakBlack = blackGroups.filter(group => group.liberties.size <= 2).length;
  const weakWhite = whiteGroups.filter(group => group.liberties.size <= 2).length;
  const stage = learningStage();
  const notes = [];
  notes.push(t("explainStage", { size, stage: stage.name }));
  if (weakBlack > 0) notes.push(t("weakBlack", { count: weakBlack }));
  else notes.push(t("blackSafe"));
  if (weakWhite > 0) notes.push(t("weakWhite", { count: weakWhite }));
  else notes.push(stage.goal);
  replaceList(document.getElementById("review"), notes);
  updateStatus(notes[1]);
}

function collectGroups(color) {
  performanceDiagnostics.aggregate.fullBoardScanCount += 1;
  const groups = [];
  const seen = new Set();
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (board[y][x] !== color) continue;
      const key = `${x},${y}`;
      if (seen.has(key)) continue;
      const group = groupAt({ x, y });
      for (const stone of group.stones) seen.add(`${stone.x},${stone.y}`);
      groups.push(group);
    }
  }
  return groups;
}

function groupAnchor(group) {
  const stones = group.stones || Array.from(group);
  return stones.slice().sort((a, b) => a.y - b.y || a.x - b.x)[0] || null;
}

function weakestGroup(color) {
  const groups = collectGroups(color);
  if (!groups.length) return null;
  return groups
    .map(group => ({ group, anchor: groupAnchor(group), liberties: group.liberties.size }))
    .sort((a, b) => a.liberties - b.liberties || b.group.stones.length - a.group.stones.length)[0];
}

function sgfCoord(value) {
  return "abcdefghijklmnopqrstuvwxyz"[value];
}

function buildSGF(snapshot = null) {
  const exportSnapshot = snapshot && Array.isArray(snapshot.moveHistory) ? snapshot : exportSnapshotForCurrentAction();
  const result = finished ? estimateWinner() : null;
  const resultText = result
    ? result.childWon
      ? (childStoneColor() === black ? "B+" : "W+")
      : (aiStoneColor() === black ? "B+" : "W+")
    : "?";
  const product = productSupportApi();
  if (product && typeof product.buildSGF === "function") {
    return product.buildSGF({
      size,
      komi,
      moveHistory: exportSnapshot.moveHistory,
      childName: profile.name || t("child"),
      childColor: childStoneColor(),
      resultText,
      difficultyMode: profile.difficultyMode || "adaptive",
      difficultyStart: profile.initialAiLevel,
      difficultyEnd: profile.aiLevel,
      buildId: exportSnapshot.buildId || buildInfo().buildId
    });
  }
  const moves = exportSnapshot.moveHistory.map(item => item.pass ? `;${colorName(item.color)}[]` : `;${colorName(item.color)}[${sgfCoord(item.x)}${sgfCoord(item.y)}]`).join("");
  return `(;GM[1]FF[4]CA[UTF-8]AP[GoKidCoachWeb]SZ[${size}]KM[${komi}]PB[${profile.name || t("child")}]PW[AI]RE[${resultText}]${moves})`;
}

function exportSGF() {
  const snapshot = exportSnapshotForCurrentAction();
  const blob = new Blob([buildSGF(snapshot)], { type: "application/x-go-sgf;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `GoKidCoach-${date}.sgf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportBackup() {
  saveProfile();
  saveCurrentGame();
  const games = {};
  const studentProfiles = {};
  const studentApi = studentModelApi();
  for (const childId of Object.keys(profileStore.profiles)) {
    try {
      const saved = localStorage.getItem(`${currentGameKeyPrefix}${childId}`);
      if (saved) games[childId] = JSON.parse(saved);
    } catch {
      // Ignore unavailable or malformed per-child game snapshots.
    }
    if (studentApi && typeof studentApi.loadStudentProfile === "function") {
      studentProfiles[childId] = studentApi.loadStudentProfile(childId);
    }
  }
  const payload = {
    app: "GoKidCoachWeb",
    version: 2,
    exportedAt: new Date().toISOString(),
    profileStore,
    currentGames: games,
    studentProfiles
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `GoKidCoach-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function importBackupFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result || "{}"));
      if (!data.profileStore || !data.profileStore.profiles) throw new Error("Invalid backup");
      profileStore = {
        activeChildId: data.profileStore.activeChildId || Object.keys(data.profileStore.profiles)[0] || "child-1",
        profiles: {}
      };
      for (const [id, item] of Object.entries(data.profileStore.profiles)) {
        profileStore.profiles[id] = normalizeProfile(item, item.name || t("child"));
      }
      profile = getActiveProfile();
      size = fixedBoardSize;
      saveProfile();
      if (data.currentGames && typeof data.currentGames === "object") {
        for (const [childId, game] of Object.entries(data.currentGames)) {
          try {
            localStorage.setItem(`${currentGameKeyPrefix}${childId}`, JSON.stringify(game));
          } catch {
            // Continue importing profile data if game snapshots cannot be stored.
          }
        }
      }
      const studentApi = studentModelApi();
      if (studentApi && data.studentProfiles && typeof data.studentProfiles === "object") {
        for (const [childId, item] of Object.entries(data.studentProfiles)) {
          studentApi.saveStudentProfile(item, childId);
        }
      }
      studentProfile = loadStudentProfileForChild(profileStore.activeChildId);
      companionState = createCompanionStateForChild();
      currentCompanionPlan = createCompanionPlanForCurrentChild();
      currentMoveQualityPlan = null;
      lastAdaptiveSummary = null;
      if (!loadCurrentGame()) {
        resetGameState();
      }
      updateStatus(t("backupDone"));
      update();
    } catch {
      updateStatus(t("backupFailed"));
    }
  };
  reader.readAsText(file);
}

function updateParentPanel() {
  const games = profile.history || [];
  const avgMoves = games.length ? Math.round(games.reduce((sum, item) => sum + item.moves, 0) / games.length) : 0;
  const avgLevel = games.length ? Math.round(games.reduce((sum, item) => sum + item.level, 0) / games.length) : 0;
  const recentWins = games.slice(0, 5).filter(item => item.result === "childWin" || item.result === "孩子胜").length;
  const trend = games.length < 3 ? "暂无" : recentWins >= 4 ? "偏轻松" : recentWins <= 1 ? "偏困难" : "合适";
  document.getElementById("parentAvgMoves").textContent = avgMoves;
  document.getElementById("parentAvgLevel").textContent = avgLevel;
  document.getElementById("parentTrend").textContent = trend === "合适" ? t("suitable") : trend === "偏轻松" ? t("easy") : trend === "偏困难" ? t("hard") : t("none");

  const notes = [];
  if (!games.length) {
    notes.push(t("parentNoGames"));
  } else {
    const wins = games.filter(item => item.result === "childWin" || item.result === "孩子胜").length;
    notes.push(t("parentWinRate", { games: games.length, rate: Math.round(wins / games.length * 100) }));
    notes.push(avgMoves >= 120 ? t("parentLong") : t("parentShort"));
    notes.push(trend === "合适" ? t("parentFit") : trend === "偏轻松" ? t("parentEasy") : t("parentHard"));
  }
  replaceList(document.getElementById("parentNotes"), notes);
  document.getElementById("rewardToggle").checked = profile.rewardEnabled !== false;
  document.getElementById("remoteAiUrl").value = profile.remoteAIUrl || "";
  document.getElementById("kataGoUrl").value = profile.kataGoUrl || "";
}

function updateTaskCard() {
  const status = adaptiveStatus();
  document.getElementById("taskTitle").textContent = status.title;
  document.getElementById("taskStatus").textContent = status.status;
  document.getElementById("taskDescription").textContent = status.text;
}

function localLiveAnalysis() {
  const result = estimateWinner();
  const scoreLead = result.blackScore - result.whiteScore;
  const captureLead = blackCaptures - whiteCaptures;
  const boardArea = size * size;
  const currentHash = boardHash();
  const remoteAnalysis = lastAiAnalysis && lastAiAnalysis.boardHash === currentHash ? lastAiAnalysis : null;
  const winrate = GoKidCoachEngine.liveWinrate({ scoreLead, captureLead, moveCount: moveHistory.length, boardArea, size });
  const leadKey = GoKidCoachEngine.leadKey(winrate);
  const endKey = GoKidCoachEngine.earlyEndKey({ winrate, moveCount: moveHistory.length, boardArea });
  return {
    winrate,
    scoreLead,
    bestMove: remoteAnalysis?.bestMove || t("localSuggestion"),
    note: endKey ? t(endKey) : `${t(leadKey)} ${remoteAnalysis ? t("analysisFromRemote") : t("analysisLocal")}`
  };
}

function updateAnalysisCard() {
  const analysis = localLiveAnalysis();
  document.getElementById("analysisWinrate").textContent = `${analysis.winrate}%`;
  document.getElementById("analysisScoreLead").textContent = `${analysis.scoreLead >= 0 ? "+" : ""}${analysis.scoreLead.toFixed(1)}`;
  document.getElementById("analysisBestMove").textContent = analysis.bestMove;
  updateActiveAiSource();
  document.getElementById("analysisNote").textContent = analysis.note;
}

function updateActiveAiSource() {
  const source = document.getElementById("activeAiSource");
  if (source) source.textContent = activeAiSourceText();
}

function activeAiSourceText() {
  const remoteConfigured = Boolean(profile.remoteAIUrl || profile.kataGoUrl);
  if (remoteConfigured && remoteAiState === "connected") return "当前AI：远程 KataGo / AI";

  const policy = window.GoKidCoachPolicyModel;
  const policyState = policy?.state;
  const model = policyState?.model;
  const openingBook = window.GoKidCoachOpeningBook;
  const openingState = openingBook?.state;
  const adaptiveText = studentProfile ? " + 自适应难度" : "";
  const companionText = companionEngineApi() ? " + CompanionEngine" : "";
  const qualityText = companionEngineApi() ? " + Move Quality Controller" : "";
  if (policyState?.loaded && model) {
    const version = model.version ? ` v${model.version}` : "";
    const training = model.training?.sourceCounts
      ? `，样本 ${Object.entries(model.training.sourceCounts).map(([key, value]) => `${key}:${value}`).join(" ")}`
      : "";
    const fallback = remoteConfigured && remoteAiState === "failed" ? "（远程失败，已回退）" : "";
    const openingText = openingState?.loaded ? " + 开局库" : "";
    return `当前AI：训练离线模型${version}${openingText}${adaptiveText}${companionText}${qualityText}${training}${fallback}`;
  }
  if (openingState?.loaded) return `当前AI：内置增强启发式 + 开局库${adaptiveText}${companionText}${qualityText}`;
  if (policyState?.failed) return "当前AI：内置增强启发式（离线模型未加载）";
  return `当前AI：内置增强启发式${adaptiveText}${companionText}${qualityText}（等待离线模型/开局库）`;
}

function updateStatus(text) {
  document.getElementById("status").textContent = text;
}

function setInterfaceMode(mode) {
  const parentMode = mode === "parent";
  document.body.classList.toggle("parent-mode", parentMode);
  document.body.classList.toggle("child-mode", !parentMode);
  document.getElementById("parentPanel").classList.toggle("hidden", !parentMode);
}

function update() {
  const stage = learningStage();
  profile.stage = stage.key;
  applyLanguage();
  if (finished) {
    updateStatus(t("statusDone"));
  } else {
    updateStatus(turn === childStoneColor() ? t("statusBlack") : t("statusWhite"));
  }
  document.getElementById("moveCount").textContent = moveHistory.length;
  document.getElementById("blackCaptures").textContent = childStoneColor() === black ? blackCaptures : whiteCaptures;
  document.getElementById("whiteCaptures").textContent = aiStoneColor() === black ? blackCaptures : whiteCaptures;
  document.getElementById("rating").value = profile.rating;
  document.getElementById("ratingText").textContent = Math.round(profile.rating);
  document.getElementById("opening").value = profile.opening;
  document.getElementById("openingText").textContent = Math.round(profile.opening);
  document.getElementById("fighting").value = profile.fighting;
  document.getElementById("fightingText").textContent = Math.round(profile.fighting);
  document.getElementById("stability").value = profile.stability;
  document.getElementById("stabilityText").textContent = Math.round(profile.stability);
  document.getElementById("gamesPlayed").textContent = profile.gamesPlayed;
  document.getElementById("winRate").textContent = `${profile.gamesPlayed ? Math.round(profile.wins / profile.gamesPlayed * 100) : 0}%`;
  document.getElementById("aiLevel").textContent = Math.round(profile.aiLevel);
  document.getElementById("subtitle").textContent = t("subtitle", { size });
  document.getElementById("stageText").textContent = stage.name;
  const selectedDifficulty = String(nearestDifficultyPreset(profile.initialAiLevel || profile.aiLevel).value);
  document.getElementById("difficultySelect").value = selectedDifficulty;
  document.getElementById("mainDifficultySelect").value = selectedDifficulty;
  const colorSelect = document.getElementById("childColorSelect");
  if (colorSelect) colorSelect.value = profile.childColor === "white" ? "white" : "black";
  document.getElementById("languageSelect").value = currentLanguage();
  renderChildSelect();

  const history = document.getElementById("history");
  if (profile.history.length) {
    history.replaceChildren(...profile.history.map(item => {
      const result = item.result === "childWin" || item.result === "孩子胜" ? t("childWin") : t("aiWin");
      const stageName = item.stage && i18n.zh[item.stage] ? t(item.stage) : item.stage || "";
      const line = t("historyLine", {
        result,
        boardSize: item.boardSize || size,
        moves: item.moves,
        stage: stageName,
        level: item.level,
        performance: item.performance ?? "-"
      });
      const li = document.createElement("li");
      const strong = document.createElement("strong");
      const time = document.createElement("span");
      strong.textContent = line;
      time.textContent = item.time || "";
      li.append(strong, " ", time);
      return li;
    }));
  } else {
    replaceList(history, [t("parentNoGames")]);
  }

  updateParentPanel();
  updateTaskCard();
  updateAnalysisCard();
  drawBoard();
}

function renderChildSelect() {
  const select = document.getElementById("childSelect");
  const active = profileStore.activeChildId;
  const entries = Object.entries(profileStore.profiles);
  if (select.options.length !== entries.length || entries.some(([id], index) => select.options[index]?.value !== id)) {
    select.replaceChildren(...entries.map(([id, item]) => {
      const option = document.createElement("option");
      option.value = id;
      option.textContent = item.name || t("child");
      return option;
    }));
  } else {
    entries.forEach(([id, item], index) => {
      select.options[index].value = id;
      select.options[index].textContent = item.name || t("child");
    });
  }
  select.value = active;
}

function drawBoard() {
  const scale = canvas.width / 1000;
  const pad = 58 * scale;
  const grid = canvas.width - pad * 2;
  const cell = grid / (size - 1);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBoardSurface(scale);

  ctx.fillStyle = "rgba(22, 16, 10, 0.86)";
  ctx.font = `${16 * scale}px -apple-system, BlinkMacSystemFont, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const labels = "ABCDEFGHJKLMNOPQRST".split("");
  for (let i = 0; i < size; i++) {
    const p = pad + i * cell;
    ctx.fillText(labels[i], p, pad * 0.45);
    ctx.fillText(labels[i], p, canvas.height - pad * 0.45);
    ctx.fillText(String(size - i), pad * 0.42, p);
    ctx.fillText(String(size - i), canvas.width - pad * 0.42, p);
  }

  ctx.strokeStyle = "rgba(22, 16, 10, 0.74)";
  ctx.lineWidth = 1.4 * scale;
  for (let i = 0; i < size; i++) {
    const p = pad + i * cell;
    ctx.beginPath();
    ctx.moveTo(pad, p);
    ctx.lineTo(canvas.width - pad, p);
    ctx.moveTo(p, pad);
    ctx.lineTo(p, canvas.height - pad);
    ctx.stroke();
  }

  const starPoints = size === 9 ? [2, 4, 6] : size === 13 ? [3, 6, 9] : [3, 9, 15];
  for (const x of starPoints) {
    for (const y of starPoints) {
      drawCircle(pad + x * cell, pad + y * cell, 5.4 * scale, "#22170f");
    }
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const value = board[y][x];
      if (value === empty) continue;
      const cx = pad + x * cell;
      const cy = pad + y * cell;
      drawStone(cx, cy, cell * 0.46, value);
    }
  }

  if (lastMove) {
    const cx = pad + lastMove.x * cell;
    const cy = pad + lastMove.y * cell;
    const lastStone = board[lastMove.y][lastMove.x];
    const marker = cell * 0.16;
    ctx.fillStyle = lastStone === black ? "rgba(255,255,255,0.92)" : "rgba(34,28,22,0.76)";
    ctx.strokeStyle = lastStone === black ? "rgba(0,0,0,0.22)" : "rgba(255,255,255,0.55)";
    ctx.lineWidth = 1.1 * scale;
    ctx.beginPath();
    ctx.moveTo(cx, cy - marker * 0.72);
    ctx.lineTo(cx - marker * 0.68, cy + marker * 0.5);
    ctx.lineTo(cx + marker * 0.68, cy + marker * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

function drawBoardSurface(scale) {
  const width = canvas.width;
  const height = canvas.height;
  const base = ctx.createLinearGradient(0, 0, width, height);
  base.addColorStop(0, "#f1c073");
  base.addColorStop(0.45, "#d99d4e");
  base.addColorStop(1, "#c98a3f");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalAlpha = 0.18;
  for (let y = 18 * scale; y < height; y += 19 * scale) {
    const wave = Math.sin(y * 0.025) * 9 * scale;
    const grain = ctx.createLinearGradient(0, y, width, y + 5 * scale);
    grain.addColorStop(0, "rgba(255,255,255,0)");
    grain.addColorStop(0.5, "rgba(255,244,205,0.55)");
    grain.addColorStop(1, "rgba(93,45,9,0)");
    ctx.fillStyle = grain;
    ctx.fillRect(22 * scale + wave, y, width - 44 * scale, 2.2 * scale);
  }
  ctx.globalAlpha = 0.1;
  for (let x = 34 * scale; x < width; x += 76 * scale) {
    ctx.fillStyle = x % 2 ? "rgba(255,255,255,0.5)" : "rgba(89,43,10,0.45)";
    ctx.fillRect(x, 0, 1.4 * scale, height);
  }
  ctx.restore();

  const bevel = 26 * scale;
  const edge = ctx.createLinearGradient(0, 0, 0, height);
  edge.addColorStop(0, "rgba(255,240,190,0.55)");
  edge.addColorStop(0.08, "rgba(255,240,190,0)");
  edge.addColorStop(0.9, "rgba(70,34,8,0)");
  edge.addColorStop(1, "rgba(70,34,8,0.38)");
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, width, height);

  const side = ctx.createLinearGradient(0, 0, width, 0);
  side.addColorStop(0, "rgba(255,238,190,0.38)");
  side.addColorStop(0.04, "rgba(255,238,190,0)");
  side.addColorStop(0.96, "rgba(55,27,8,0)");
  side.addColorStop(1, "rgba(55,27,8,0.28)");
  ctx.fillStyle = side;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(91, 48, 15, 0.42)";
  ctx.lineWidth = bevel * 0.26;
  ctx.strokeRect(bevel * 0.22, bevel * 0.22, width - bevel * 0.44, height - bevel * 0.44);
}

function drawCircle(x, y, radius, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawStone(x, y, radius, color) {
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";

  ctx.beginPath();
  ctx.ellipse(x + radius * 0.08, y + radius * 0.18, radius * 0.92, radius * 0.78, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.filter = `blur(${radius * 0.13}px)`;
  ctx.fill();
  ctx.filter = "none";

  // Fully cover the board intersections before adding lighting. This prevents
  // grid lines from showing through light stones after antialiasing.
  ctx.beginPath();
  ctx.arc(x, y, radius * 1.01, 0, Math.PI * 2);
  ctx.fillStyle = color === black ? "#050505" : "#f2ece1";
  ctx.fill();

  const gradient = ctx.createRadialGradient(
    x - radius * 0.28,
    y - radius * 0.34,
    radius * 0.12,
    x + radius * 0.1,
    y + radius * 0.12,
    radius * 1.12
  );
  if (color === black) {
    gradient.addColorStop(0, "#5a544d");
    gradient.addColorStop(0.2, "#252321");
    gradient.addColorStop(0.72, "#060606");
    gradient.addColorStop(1, "#000000");
  } else {
    gradient.addColorStop(0, "#fffdfa");
    gradient.addColorStop(0.36, "#f5f0e7");
    gradient.addColorStop(0.76, "#e5dccd");
    gradient.addColorStop(1, "#c8bca9");
  }
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  const shine = ctx.createRadialGradient(
    x - radius * 0.34,
    y - radius * 0.38,
    0,
    x - radius * 0.34,
    y - radius * 0.38,
    radius * 0.3
  );
  shine.addColorStop(0, color === black ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.34)");
  shine.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = shine;
  ctx.beginPath();
  ctx.arc(x - radius * 0.24, y - radius * 0.28, radius * 0.42, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = color === black ? "rgba(255,255,255,0.1)" : "rgba(78,62,42,0.2)";
  ctx.lineWidth = Math.max(1, radius * 0.05);
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.98, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

canvas.addEventListener("pointerdown", event => {
  const childColor = childStoneColor();
  if (turn !== childColor || finished || !checkBuildConsistency()) return;
  const rect = canvas.getBoundingClientRect();
  const px = (event.clientX - rect.left) / rect.width * canvas.width;
  const py = (event.clientY - rect.top) / rect.height * canvas.height;
  const pad = 58 / 1000 * canvas.width;
  const cell = (canvas.width - pad * 2) / (size - 1);
  const x = Math.round((px - pad) / cell);
  const y = Math.round((py - pad) / cell);
  if (x < 0 || x >= size || y < 0 || y >= size) return;
  const childCandidates = legalMoves(childColor)
    .map(point => evaluateMoveCandidate(point, childColor))
    .filter(Boolean);
  undoStack.push(snapshot());
  if (playMove({ x, y }, childColor)) {
    observeChildMove({ x, y }, childCandidates);
    updateExportSnapshot("active");
    saveCurrentGame();
    update();
    aiMove();
  } else {
    undoStack.pop();
    childIllegalAttemptCount += 1;
    updateStatus(t("invalidMove"));
    saveCurrentGame();
  }
});

const passBtn = document.getElementById("passBtn");
passBtn.addEventListener("pointerdown", () => {
  passHoldTriggered = false;
  passHoldTimer = window.setTimeout(() => {
    passHoldTriggered = true;
    showEndConfirm();
  }, 850);
});
passBtn.addEventListener("pointerup", () => {
  if (passHoldTimer) {
    window.clearTimeout(passHoldTimer);
    passHoldTimer = null;
  }
});
passBtn.addEventListener("pointerleave", () => {
  if (passHoldTimer) {
    window.clearTimeout(passHoldTimer);
    passHoldTimer = null;
  }
});
passBtn.addEventListener("click", () => {
  if (passHoldTriggered) return;
  pass();
});
document.getElementById("hintBtn").addEventListener("click", hintMove);
document.getElementById("explainBtn").addEventListener("click", explainPosition);
document.getElementById("childSelect").addEventListener("change", event => switchChild(event.target.value));
document.getElementById("addChildBtn").addEventListener("click", addChild);
document.getElementById("difficultySelect").addEventListener("change", event => changeInitialDifficulty(event.target.value));
document.getElementById("mainDifficultySelect").addEventListener("change", event => changeInitialDifficulty(event.target.value));
document.getElementById("childColorSelect").addEventListener("change", event => changeChildColor(event.target.value));
document.getElementById("languageSelect").addEventListener("change", event => {
  profile.language = event.target.value;
  saveProfile();
  update();
});
document.getElementById("undoBtn").addEventListener("click", undoMove);
document.getElementById("continueBtn").addEventListener("click", continueLastGame);
document.getElementById("finishBtn").addEventListener("click", finishGame);
document.getElementById("newBtn").addEventListener("click", newGame);
document.getElementById("clearSaveBtn").addEventListener("click", clearSavedGame);
document.getElementById("moreBtn").addEventListener("click", toggleMorePanel);
document.getElementById("sgfBtn").addEventListener("click", exportSGF);
document.getElementById("parentBtn").addEventListener("click", () => {
  setInterfaceMode("parent");
  updateParentPanel();
});
document.getElementById("closeParentBtn").addEventListener("click", () => {
  setInterfaceMode("child");
});
document.getElementById("saveParentSettingsBtn").addEventListener("click", () => {
  profile.rewardEnabled = document.getElementById("rewardToggle").checked;
  profile.remoteAIUrl = document.getElementById("remoteAiUrl").value.trim();
  profile.kataGoUrl = document.getElementById("kataGoUrl").value.trim();
  lastAiAnalysis = null;
  saveProfile();
  updateStatus(t("settingsSaved"));
});
document.getElementById("exportBackupBtn").addEventListener("click", exportBackup);
document.getElementById("importBackupBtn").addEventListener("click", () => {
  document.getElementById("backupFileInput").click();
});
document.getElementById("backupFileInput").addEventListener("change", event => {
  importBackupFile(event.target.files && event.target.files[0]);
  event.target.value = "";
});
document.getElementById("parentFinishBtn").addEventListener("click", showEndConfirm);
document.getElementById("parentSgfBtn").addEventListener("click", exportSGF);
document.getElementById("debugExportBtn").addEventListener("click", exportDebugSummary);
document.getElementById("confirmEndBtn").addEventListener("click", finishGame);
document.getElementById("continueGameBtn").addEventListener("click", continueGameAfterEndConfirm);
document.getElementById("closeVictoryBtn").addEventListener("click", hideVictoryPopup);
window.addEventListener("gokidcoach-policy-ready", updateActiveAiSource);
window.addEventListener("gokidcoach-opening-book-ready", updateActiveAiSource);
document.getElementById("resetBtn").addEventListener("click", () => {
  try {
    localStorage.removeItem(profileStoreKey);
    localStorage.removeItem(legacyStorageKey);
    localStorage.removeItem(currentGameKey());
  } catch {
    // Storage may be blocked by browser privacy settings.
  }
  profileStore = loadProfileStore();
  profile = getActiveProfile();
  size = fixedBoardSize;
  newGame();
});
window.addEventListener("resize", drawBoard);

window.GoKidCoachPerformanceDiagnostics = {
  caps: {
    detailedMoveDiagnostics: detailedMoveDiagnosticCap,
    detailedCandidateDiagnostics: detailedCandidateDiagnosticCap,
    rawStageTimings: rawStageTimingCap
  },
  snapshot() {
    return {
      lastMove: performanceDiagnostics.lastMove ? { ...performanceDiagnostics.lastMove } : null,
      aggregate: { ...performanceDiagnostics.aggregate },
      moveStages: performanceDiagnostics.moveStages.map(item => ({ ...item })),
      candidateDiagnostics: performanceDiagnostics.candidateDiagnostics.map(item => ({ ...item }))
    };
  }
};

if (new URLSearchParams(window.location.search).get("demo") === "1") {
  setupDemoPosition();
} else {
  loadCurrentGame();
}

update();
updateActiveAiSource();
if (!finished && !moveHistory.length && turn === aiStoneColor()) aiMove();
