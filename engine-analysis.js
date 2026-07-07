(function () {
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function liveWinrate({ scoreLead, captureLead, moveCount, boardArea, size }) {
    const progress = clamp(moveCount / Math.max(1, boardArea * 0.42), 0, 1);
    const scale = size === 9 ? 5.5 : size === 13 ? 8.5 : 13;
    const leadSignal = (scoreLead + captureLead * 0.7) / scale;
    const confidence = 0.12 + progress * 0.88;
    return clamp(Math.round(50 + Math.tanh(leadSignal * confidence) * 45), 5, 95);
  }

  function leadKey(winrate) {
    if (winrate >= 68) return "leadAhead";
    if (winrate <= 32) return "leadBehind";
    return "leadClose";
  }

  function earlyEndKey({ winrate, moveCount, boardArea }) {
    const threshold = Math.max(28, Math.round(boardArea * 0.22));
    if (moveCount < threshold) return null;
    if (winrate >= 85) return "endAhead";
    if (winrate <= 15) return "endBehind";
    return null;
  }

  function reviewPointScore(point, size) {
    const center = (size - 1) / 2;
    const corner = size === 9 ? 2 : 3;
    const far = size - 1 - corner;
    const cornerDistance = Math.min(
      Math.abs(point.x - corner) + Math.abs(point.y - corner),
      Math.abs(point.x - far) + Math.abs(point.y - corner),
      Math.abs(point.x - corner) + Math.abs(point.y - far),
      Math.abs(point.x - far) + Math.abs(point.y - far)
    );
    return (point.captures || 0) * 20 - cornerDistance * 1.2 - (Math.abs(point.x - center) + Math.abs(point.y - center)) * 0.15;
  }

  window.GoKidCoachEngine = {
    liveWinrate,
    leadKey,
    earlyEndKey,
    reviewPointScore
  };
}());
