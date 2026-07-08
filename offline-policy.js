(function () {
  const modelUrl = "assets/offline-policy-model.json";
  const state = {
    loaded: false,
    failed: false,
    model: null
  };

  function asNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function featureScore(weights, features) {
    if (!weights || !features) return 0;
    let score = 0;
    for (const [key, weight] of Object.entries(weights)) {
      score += asNumber(features[key]) * asNumber(weight);
    }
    return score;
  }

  function pointBiasScore(model, point, size) {
    const pointBias = model.pointBias;
    if (!pointBias || !point) return 0;

    if (Array.isArray(pointBias) && Array.isArray(pointBias[point.y])) {
      return asNumber(pointBias[point.y][point.x]);
    }

    const key = `${point.x},${point.y}`;
    const mirroredKey = [
      `${size - 1 - point.x},${point.y}`,
      `${point.x},${size - 1 - point.y}`,
      `${size - 1 - point.x},${size - 1 - point.y}`,
      `${point.y},${point.x}`,
      `${size - 1 - point.y},${point.x}`,
      `${point.y},${size - 1 - point.x}`,
      `${size - 1 - point.y},${size - 1 - point.x}`
    ].find(candidate => Object.prototype.hasOwnProperty.call(pointBias, candidate));

    return asNumber(pointBias[key] ?? pointBias[mirroredKey]);
  }

  function scoreMove(input) {
    const model = state.model;
    if (!model || input.size !== asNumber(model.boardSize, 19)) return 0;

    const weights = model.weights || {};
    const openingWeight = input.moveHistory.length < 50
      ? asNumber(model.openingMultiplier, 1)
      : asNumber(model.middleGameMultiplier, 0.65);

    return asNumber(model.bias)
      + featureScore(weights, input.features)
      + pointBiasScore(model, input.point, input.size) * openingWeight;
  }

  window.GoKidCoachPolicyModel = {
    name: "offline-policy",
    state,
    scoreMove
  };

  fetch(modelUrl, { cache: "no-cache" })
    .then(response => {
      if (!response.ok) throw new Error(`Offline policy model ${response.status}`);
      return response.json();
    })
    .then(model => {
      state.model = model;
      state.loaded = true;
      window.dispatchEvent(new CustomEvent("gokidcoach-policy-ready", { detail: model }));
    })
    .catch(error => {
      state.failed = true;
      state.error = error.message;
    });
}());
