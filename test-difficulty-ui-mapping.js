const assert = require("assert");
const fs = require("fs");
const path = require("path");
const product = require("./product-support.js");

function run() {
  const index = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const app = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
  assert(index.includes('<option value="advanced">进阶陪练</option>'));
  assert.strictEqual(product.normalizeDifficultyMode("advanced"), "MAX_STRENGTH_FIXED");
  assert.strictEqual(product.normalizeDifficultyMode(980), "MAX_STRENGTH_FIXED");
  assert(app.includes('const uiMode = mode === maxStrengthMode ? "advanced" : mode;'));
  console.log("test-difficulty-ui-mapping: ok");
}

run();
