#!/usr/bin/env python3
"""Offline KataGo batch analysis for GoKidCoach V2.0.0-dev.

This script is development-only. It does not import or change browser runtime code.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import pathlib
import queue
import select
import subprocess
import sys
import tempfile
import threading
import time
from typing import Any, Dict, Iterable, List, Optional


HERE = pathlib.Path(__file__).resolve().parent
WEB_ROOT = HERE.parent
PROJECT_ROOT = WEB_ROOT.parent
DEFAULT_POSITIONS = HERE / "v200-positions.json"
DEFAULT_JSONL = HERE / "v200-katago-analysis.jsonl"
DEFAULT_OUTPUT = HERE / "v200-katago-analysis.json"
DEFAULT_ENV = HERE / "v200-katago-environment.json"

PROFILES = {
    "quick": {"maxVisits": 16, "numAnalysisThreads": 8, "numSearchThreadsPerAnalysisThread": 1, "timeoutSeconds": 180},
    "standard": {"maxVisits": 96, "numAnalysisThreads": 4, "numSearchThreadsPerAnalysisThread": 1, "timeoutSeconds": 300},
    "deep_sample": {"maxVisits": 320, "numAnalysisThreads": 2, "numSearchThreadsPerAnalysisThread": 1, "timeoutSeconds": 600},
}

LETTERS = "ABCDEFGHJKLMNOPQRST"


def load_json(path: pathlib.Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def sha256(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def resolve_repo_path(value: str) -> pathlib.Path:
    candidate = pathlib.Path(value)
    if candidate.is_absolute():
        return candidate
    return (WEB_ROOT / candidate).resolve()


def point_to_gtp(point: Optional[Dict[str, Any]], board_size: int = 19) -> str:
    if not point:
        return "pass"
    x = int(point["x"])
    y = int(point["y"])
    if x < 0 or y < 0:
        return "pass"
    return f"{LETTERS[x]}{board_size - y}"


def history_to_katago(position: Dict[str, Any]) -> List[List[str]]:
    board_size = len(position.get("board") or []) or 19
    moves = []
    for item in position.get("moveHistory") or []:
        color_value = item.get("color")
        color = "B" if color_value in ("B", 1, "black", "BLACK") else "W"
        move = "pass" if item.get("pass") else point_to_gtp(item, board_size)
        moves.append([color, move])
    return moves


def initial_stones_from_board(position: Dict[str, Any]) -> List[List[str]]:
    stones: List[List[str]] = []
    board = position.get("board") or []
    board_size = len(board) or 19
    for y, row in enumerate(board):
        for x, value in enumerate(row):
            if value == 1:
                stones.append(["B", point_to_gtp({"x": x, "y": y}, board_size)])
            elif value == 2:
                stones.append(["W", point_to_gtp({"x": x, "y": y}, board_size)])
    return stones


def query_for(position: Dict[str, Any], profile: str, analysis_kind: str = "root") -> Dict[str, Any]:
    board_size = len(position.get("board") or []) or 19
    budget = PROFILES[profile]["maxVisits"]
    to_play = position.get("sideToMove") or "W"
    moves: List[List[str]] = []
    analyze_turn = 0
    query_id = position["positionId"]
    if analysis_kind == "played":
        engine_point = position.get("currentEngineSelectedMove")
        if not engine_point:
            raise RuntimeError(f"Cannot run played-move analysis without engine move: {position['positionId']}")
        moves = [[to_play, point_to_gtp(engine_point, board_size)]]
        analyze_turn = 1
        query_id = f"{position['positionId']}::played"
    return {
        "id": query_id,
        "initialStones": initial_stones_from_board(position),
        "moves": moves,
        "initialPlayer": to_play,
        "rules": "chinese",
        "komi": float(position.get("komi", 7.5)),
        "boardXSize": board_size,
        "boardYSize": board_size,
        "analyzeTurns": [analyze_turn],
        "overrideSettings": {"rootNumSymmetriesToSample": 1},
        "maxVisits": budget,
        "includePolicy": True,
        "includeOwnership": True,
        "priority": 1,
    }


def read_existing(jsonl_path: pathlib.Path) -> Dict[str, Dict[str, Any]]:
    results: Dict[str, Dict[str, Any]] = {}
    if not jsonl_path.exists():
        return results
    with jsonl_path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            try:
                item = json.loads(line)
            except json.JSONDecodeError:
                continue
            if item.get("positionId") and item.get("profile"):
                results[f"{item['positionId']}::{item['profile']}::{item.get('analysisKind', 'root')}"] = item
    return results


def write_config(path: pathlib.Path, profile: str) -> None:
    p = PROFILES[profile]
    path.write_text(
        "\n".join(
            [
                f"logDir = {HERE / 'katago-analysis-logs'}",
                "logToStderr = false",
                "logAllRequests = false",
                "logAllResponses = false",
                "logErrorsAndWarnings = true",
                "reportAnalysisWinratesAs = BLACK",
                f"maxVisits = {p['maxVisits']}",
                f"numAnalysisThreads = {p['numAnalysisThreads']}",
                f"numSearchThreadsPerAnalysisThread = {p['numSearchThreadsPerAnalysisThread']}",
                "nnMaxBatchSize = 8",
                "nnCacheSizePowerOfTwo = 20",
                "nnMutexPoolSizePowerOfTwo = 16",
                "nnRandomize = false",
                "",
            ]
        ),
        encoding="utf-8",
    )


def enqueue_output(pipe: Any, output_queue: "queue.Queue[str]") -> None:
    for line in iter(pipe.readline, ""):
        output_queue.put(line)


def run_katago(
    positions: List[Dict[str, Any]],
    profile: str,
    env_record: Dict[str, Any],
    jsonl_path: pathlib.Path,
    limit: Optional[int],
    resume: bool,
    analysis_kind: str,
    allowed_ids: Optional[set[str]] = None,
) -> List[Dict[str, Any]]:
    binary = resolve_repo_path(env_record["katago"]["binary"])
    model = resolve_repo_path(env_record["model"]["path"])
    if not binary.exists():
        raise RuntimeError(f"KataGo binary not found: {binary}")
    if not model.exists():
        raise RuntimeError(f"KataGo model not found: {model}")

    existing = read_existing(jsonl_path) if resume else {}
    todo = []
    for position in positions:
        if allowed_ids is not None and position["positionId"] not in allowed_ids:
            continue
        result_position_id = position["positionId"] if analysis_kind == "root" else f"{position['positionId']}::played"
        key = f"{result_position_id}::{profile}::{analysis_kind}"
        if key not in existing:
            todo.append(position)
        if limit is not None and len(todo) >= limit:
            break
    if not todo:
        return list(existing.values())

    config_path = HERE / "v200-katago-analysis.cfg"
    write_config(config_path, profile)
    env = os.environ.copy()
    env["HOME"] = str(PROJECT_ROOT / ".katago-home")
    lib_path = env_record["katago"].get("requiresLibraryPath", "")
    library_parts = [str(resolve_repo_path(part)) for part in lib_path.split(":") if part]
    if env.get("LD_LIBRARY_PATH"):
        library_parts.extend(part for part in env["LD_LIBRARY_PATH"].split(":") if part)
    for cuda_path in ("/usr/local/cuda-12.4/lib64", "/usr/local/cuda-12.2/lib64", "/usr/local/cuda/lib64"):
        if pathlib.Path(cuda_path).exists() and cuda_path not in library_parts:
            library_parts.append(cuda_path)
    env["LD_LIBRARY_PATH"] = ":".join(library_parts)

    cmd = [
        str(binary),
        "analysis",
        "-config",
        str(config_path),
        "-model",
        str(model),
    ]
    proc = subprocess.Popen(
        cmd,
        cwd=str(PROJECT_ROOT),
        env=env,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
    )
    assert proc.stdin is not None
    assert proc.stdout is not None
    assert proc.stderr is not None
    out_queue: "queue.Queue[str]" = queue.Queue()
    err_queue: "queue.Queue[str]" = queue.Queue()
    threading.Thread(target=enqueue_output, args=(proc.stdout, out_queue), daemon=True).start()
    threading.Thread(target=enqueue_output, args=(proc.stderr, err_queue), daemon=True).start()

    results = list(existing.values())
    jsonl_path.parent.mkdir(parents=True, exist_ok=True)
    with jsonl_path.open("a", encoding="utf-8") as jsonl:
        next_index = 0
        completed = 0
        pending: Dict[str, Dict[str, Any]] = {}

        def send_next() -> None:
            nonlocal next_index
            if next_index >= len(todo):
                return
            position = todo[next_index]
            next_index += 1
            request = query_for(position, profile, analysis_kind)
            proc.stdin.write(json.dumps(request, separators=(",", ":")) + "\n")
            proc.stdin.flush()
            pending[request["id"]] = {
                "position": position,
                "deadline": time.time() + PROFILES[profile]["timeoutSeconds"],
            }

        window = max(1, int(PROFILES[profile]["numAnalysisThreads"]))
        for _ in range(min(window, len(todo))):
            send_next()

        stderr_tail: List[str] = []
        while completed < len(todo):
            while not err_queue.empty():
                stderr_tail.append(err_queue.get().rstrip())
                stderr_tail = stderr_tail[-20:]
            now = time.time()
            expired = [request_id for request_id, item in pending.items() if item["deadline"] < now]
            if expired:
                proc.kill()
                raise TimeoutError(f"KataGo timed out for {expired[0]} profile {profile}")
            try:
                line = out_queue.get(timeout=0.2)
            except queue.Empty:
                if proc.poll() is not None:
                    raise RuntimeError(f"KataGo exited early with code {proc.returncode}: {' | '.join(stderr_tail[-5:])}")
                continue
            line = line.strip()
            if not line:
                continue
            try:
                parsed = json.loads(line)
            except json.JSONDecodeError:
                stderr_tail.append(line)
                continue
            request_id = parsed.get("id")
            if request_id not in pending or (parsed.get("moveInfos") is None and parsed.get("rootInfo") is None):
                continue
            position = pending.pop(request_id)["position"]
            normalized = normalize_response(position, profile, parsed, analysis_kind)
            jsonl.write(json.dumps(normalized, separators=(",", ":")) + "\n")
            jsonl.flush()
            results.append(normalized)
            completed += 1
            if completed % 25 == 0 or completed == len(todo):
                print(json.dumps({"profile": profile, "completed": completed, "remaining": len(todo) - completed}), flush=True)
            send_next()

    proc.stdin.close()
    try:
        proc.wait(timeout=15)
    except subprocess.TimeoutExpired:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=10)
    if proc.returncode not in (0, -15, None):
        raise RuntimeError(f"KataGo exited with code {proc.returncode}")
    return results


def normalize_response(position: Dict[str, Any], profile: str, response: Dict[str, Any], analysis_kind: str) -> Dict[str, Any]:
    move_infos = response.get("moveInfos") or []
    root = response.get("rootInfo") or {}
    result_position_id = position["positionId"] if analysis_kind == "root" else f"{position['positionId']}::played"
    return {
        "positionId": result_position_id,
        "parentPositionId": position["positionId"],
        "profile": profile,
        "analysisKind": analysis_kind,
        "moveNumber": position.get("moveNumber"),
        "phase": position.get("phase"),
        "difficultyMode": position.get("difficultyMode"),
        "sideToMove": position.get("sideToMove"),
        "engineMove": position.get("currentEngineSelectedMoveKey"),
        "katagoBestMove": move_infos[0].get("move") if move_infos else None,
        "rootInfo": root,
        "moveInfos": move_infos[:10],
        "policy": response.get("policy"),
        "ownership": response.get("ownership"),
        "visits": root.get("visits"),
        "scoreLead": root.get("scoreLead"),
        "winrate": root.get("winrate"),
        "analysisReceivedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


def final_output(results: Iterable[Dict[str, Any]], output_path: pathlib.Path, profile: str) -> Dict[str, Any]:
    rows = [row for row in results if row.get("profile") == profile]
    payload = {
        "evaluationVersion": "2.0.0-dev",
        "profile": profile,
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "positionsAnalyzed": len(rows),
        "results": rows,
    }
    output_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return payload


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--positions", default=str(DEFAULT_POSITIONS))
    parser.add_argument("--jsonl", default=str(DEFAULT_JSONL))
    parser.add_argument("--out", default=str(DEFAULT_OUTPUT))
    parser.add_argument("--profile", choices=sorted(PROFILES), default="quick")
    parser.add_argument("--limit", type=int)
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--analysis-kind", choices=["root", "played"], default="root")
    parser.add_argument("--ids")
    args = parser.parse_args(argv)

    env_record = load_json(DEFAULT_ENV)
    positions_path = pathlib.Path(args.positions)
    if args.check:
        binary = resolve_repo_path(env_record["katago"]["binary"])
        model = resolve_repo_path(env_record["model"]["path"])
        status = {
            "evaluationVersion": "2.0.0-dev",
            "binaryExists": binary.exists(),
            "modelExists": model.exists(),
            "binarySha256Matches": binary.exists() and sha256(binary) == env_record["katago"]["binarySha256"],
            "modelSha256Matches": model.exists() and sha256(model) == env_record["model"]["sha256"],
            "positionsFileExists": positions_path.exists(),
            "profiles": PROFILES,
        }
        print(json.dumps(status, indent=2))
        return 0 if all([status["binaryExists"], status["modelExists"], status["binarySha256Matches"], status["modelSha256Matches"]]) else 1

    if not positions_path.exists():
        raise FileNotFoundError(f"Positions file not found: {positions_path}")
    positions_payload = load_json(positions_path)
    positions = positions_payload.get("positions") or []
    allowed_ids = None
    if args.ids:
        raw_ids = load_json(pathlib.Path(args.ids))
        if isinstance(raw_ids, dict):
            raw_ids = raw_ids.get("positionIds") or raw_ids.get("ids") or []
        allowed_ids = set(str(item) for item in raw_ids)
    if not positions:
        raise RuntimeError("No positions to analyze")
    results = run_katago(positions, args.profile, env_record, pathlib.Path(args.jsonl), args.limit, args.resume, args.analysis_kind, allowed_ids)
    payload = final_output(results, pathlib.Path(args.out), args.profile)
    print(json.dumps({"profile": args.profile, "positionsAnalyzed": payload["positionsAnalyzed"], "output": args.out}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
