const assert = require("assert");
const endgame = require("./evaluation/endgame-value-detectors.js");

const empty = 0;
const black = 1;
const white = 2;

function board() {
  return Array.from({ length: 19 }, () => Array(19).fill(empty));
}

function set(b, x, y, color) {
  b[y][x] = color;
}

function run() {
  const secure = board();
  set(secure, 2, 2, black); set(secure, 2, 3, black); set(secure, 3, 2, black); set(secure, 4, 3, black); set(secure, 3, 4, black); set(secure, 4, 4, black);
  const secureEvidence = endgame.territoryConfidence(secure, black, { x: 3, y: 3 });
  assert.strictEqual(secureEvidence.whetherPointIsInsideOwnSecureTerritory, true);
  assert(secureEvidence.ownershipConfidence >= 0.72);

  const falseSecure = board();
  set(falseSecure, 2, 2, black); set(falseSecure, 2, 3, black); set(falseSecure, 3, 2, black); set(falseSecure, 4, 3, white);
  const falseEvidence = endgame.territoryConfidence(falseSecure, black, { x: 3, y: 3 });
  assert.strictEqual(falseEvidence.whetherPointIsInsideOwnSecureTerritory, false);
  assert(falseEvidence.adjacentOpponentAccess > 0);

  const unsettled = board();
  set(unsettled, 7, 7, black); set(unsettled, 8, 7, white); set(unsettled, 7, 8, black); set(unsettled, 9, 7, white);
  const unsettledEvidence = endgame.territoryConfidence(unsettled, black, { x: 8, y: 8 });
  assert.strictEqual(unsettledEvidence.whetherPointIsInsideOwnSecureTerritory, false);
  assert(unsettledEvidence.unsettledBoundaryPoints > 0);

  console.log("test-territory-confidence: ok");
}

run();
