const assert = require("assert");
const fs = require("fs");
const path = require("path");
const product = require("./product-support.js");

function run() {
  const index = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const app = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
  const mainOptions = Array.from(index.matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g))
    .slice(0, 5)
    .map(match => ({ value: match[1], label: match[2] }));
  assert.deepStrictEqual(mainOptions, [
    { value: "beginner", label: "🌱 入门" },
    { value: "basic", label: "📘 基础" },
    { value: "advanced", label: "⚔️ 进阶" },
    { value: "adaptive", label: "🤖 自适应陪练" },
    { value: "MAX_STRENGTH_FIXED", label: "👑 职业模式（最高棋力）" }
  ]);
  assert.strictEqual(product.normalizeDifficultyMode("MAX_STRENGTH_FIXED"), "MAX_STRENGTH_FIXED");
  assert.strictEqual(product.normalizeDifficultyMode("advanced"), "advanced");
  assert.strictEqual(product.normalizeDifficultyMode("adaptive"), "adaptive");
  assert.strictEqual(product.normalizeDifficultyMode(980), "advanced");
  assert.strictEqual(product.isMaxStrengthMode("MAX_STRENGTH_FIXED"), true);
  assert.strictEqual(product.isMaxStrengthMode("advanced"), false);
  assert(app.includes('return difficultyPresets.find(preset => preset.value === mode) || difficultyPresets[3];'));
  assert.strictEqual((index.match(/value="MAX_STRENGTH_FIXED"/g) || []).length, 2);
  console.log("test-difficulty-ui-mapping: ok");
}

run();
