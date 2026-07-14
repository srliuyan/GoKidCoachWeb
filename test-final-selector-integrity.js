const assert = require("assert");
const fs = require("fs");
const path = require("path");

function run() {
  const app = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
  const matches = app.match(/function finalSelectorGuard\(/g) || [];
  assert.strictEqual(matches.length, 1);
  assert(app.includes("const guardedChoice = finalSelectorGuard(choice, ranked.ranked || adjusted, color);"));
  assert(!app.includes("finalSelectorGuard(finalSelectorGuard("));
  assert(app.includes("lastSelectedCandidateFinalRank"));
  console.log("test-final-selector-integrity: ok");
}

run();
