const assert = require("assert");
const audit = require("./evaluation/run-v172-candidate-breadth-audit.js");

function testLocalCandidateFloodDetected() {
  const position = {
    positionId: "flood",
    moveNumber: 80,
    phase: "middlegame",
    candidates: Array.from({ length: 18 }, (_, index) => ({
      point: { x: 6 + (index % 7), y: 7 + Math.floor(index / 7) },
      score: 300 - index,
      sourceTags: ["shape_pattern"]
    }))
  };
  const row = audit.auditPosition(position, 1);
  assert(row.flags.includes("source_concentration") || row.flags.includes("local_candidate_flood"));
}

function testDuplicateCountsRecorded() {
  const position = {
    positionId: "duplicates",
    moveNumber: 80,
    phase: "middlegame",
    candidates: Array.from({ length: 8 }, (_, index) => ({
      point: { x: 9 + (index % 2), y: 9 + Math.floor(index / 2) % 2 },
      score: 300 - index,
      sourceTags: ["rule_engine"]
    }))
  };
  const row = audit.auditPosition(position, 5);
  assert(row.localDuplicateCount > 0);
  assert(row.totalCandidatesAfterDeduplication < row.totalCandidatesBeforeDeduplication);
}

function testUrgentConcentrationNotFalselyFlagged() {
  const position = {
    positionId: "urgent",
    moveNumber: 80,
    phase: "middlegame",
    candidates: Array.from({ length: 12 }, (_, index) => ({
      point: { x: index, y: 4 },
      score: 400 - index,
      sourceTags: ["capture"]
    }))
  };
  const row = audit.auditPosition(position, 2);
  assert(!row.flags.includes("source_concentration"));
}

function run() {
  testLocalCandidateFloodDetected();
  testDuplicateCountsRecorded();
  testUrgentConcentrationNotFalselyFlagged();
  console.log("test-candidate-deduplication: ok");
}

run();
