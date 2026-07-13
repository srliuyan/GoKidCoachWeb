# iPad Safari Executable Test Checklist

Build under test:

- productVersion: `1.0.0-rc1`
- engineVersion: `baseline-v3.6-frozen`
- serviceWorkerCache: `gokidcoach-web-v39-rc1`
- test URL:
- iPad model:
- iPadOS version:
- Safari version:
- tester:
- test date:

For every test, fill in Actual / Pass-Fail / Screenshot or Note. Severity if failed: blocker, major, minor, cosmetic.

## A. First Launch

| ID | Steps | Expected Result | Actual | Pass/Fail | Screenshot or Note | Severity |
|---|---|---|---|---|---|---|
| A-01 | Open the test URL in Safari. | App shell loads, board visible, no console-visible fatal error. |  |  |  | blocker |
| A-02 | Open parent view. | Version text shows `1.0.0-rc1 / baseline-v3.6-frozen`. |  |  |  | major |
| A-03 | Wait 10 seconds after first load. | Required runtime assets finish loading; no evaluation JSON is requested. |  |  |  | major |

## B. New-Game Setup

| ID | Steps | Expected Result | Actual | Pass/Fail | Screenshot or Note | Severity |
|---|---|---|---|---|---|---|
| B-01 | Tap New Game. | Board resets to empty 19x19, move count 0, captures 0:0. |  |  |  | blocker |
| B-02 | Select child black, tap New Game. | Child moves first. |  |  |  | major |
| B-03 | Select child white, tap New Game. | AI moves first and child can reply as white. |  |  |  | major |

## C. Difficulty UI

| ID | Steps | Expected Result | Actual | Pass/Fail | Screenshot or Note | Severity |
|---|---|---|---|---|---|---|
| C-01 | Open difficulty selector. | Shows 入门陪练, 基础陪练, 进阶陪练, 自适应陪练. |  |  |  | major |
| C-02 | Select each mode and refresh. | Selected mode persists after refresh. |  |  |  | major |
| C-03 | Confirm child UI. | Numeric internal scores are not shown to child as difficulty controls. |  |  |  | minor |

## D. Child Plays Black

| ID | Steps | Expected Result | Actual | Pass/Fail | Screenshot or Note | Severity |
|---|---|---|---|---|---|---|
| D-01 | Start as child black and play 20 child moves. | AI responds after each child move; turns alternate correctly. |  |  |  | blocker |
| D-02 | Observe AI moves. | No illegal, rejected, arbitrary random, or obviously meaningless move. |  |  |  | major |

## E. Child Plays White

| ID | Steps | Expected Result | Actual | Pass/Fail | Screenshot or Note | Severity |
|---|---|---|---|---|---|---|
| E-01 | Start as child white. | AI places black first. |  |  |  | blocker |
| E-02 | Play 20 child white moves. | Turns alternate correctly; captures and counters match displayed role. |  |  |  | major |

## F. Capture and Legality

| ID | Steps | Expected Result | Actual | Pass/Fail | Screenshot or Note | Severity |
|---|---|---|---|---|---|---|
| F-01 | Create a simple capture. | Captured stones are removed and capture count updates. |  |  |  | blocker |
| F-02 | Tap occupied point. | Move is rejected; board unchanged. |  |  |  | blocker |
| F-03 | Try suicide-like point. | Move is rejected; board unchanged. |  |  |  | blocker |
| F-04 | Create ko/repeat situation where practical. | Immediate illegal repeat is rejected. |  |  |  | major |
| F-05 | Pass once. | Side to move changes and pass state is saved. |  |  |  | major |
| F-06 | Pass twice consecutively. | End confirmation appears. |  |  |  | major |

## G. Save and Restore

| ID | Steps | Expected Result | Actual | Pass/Fail | Screenshot or Note | Severity |
|---|---|---|---|---|---|---|
| G-01 | Play 10 moves, close Safari tab, reopen URL, tap Continue Last Game. | Board, side to move, captures and move count restore exactly. |  |  |  | blocker |
| G-02 | Play 30+ moves, rotate, close installed PWA, reopen. | Game restores without duplicate moves. |  |  |  | blocker |
| G-03 | Pass once, close and restore. | Pass count and side to move are correct. |  |  |  | major |
| G-04 | Save and restore after ko state. | Ko/repetition state remains preserved. |  |  |  | major |
| G-05 | Tap Clear Save. | Current save clears and new empty game starts without old ko/pass state. |  |  |  | major |

## H. SGF Export

| ID | Steps | Expected Result | Actual | Pass/Fail | Screenshot or Note | Severity |
|---|---|---|---|---|---|---|
| H-01 | Export a short game. | Share/download sheet opens; readable filename. |  |  |  | major |
| H-02 | Export game with captures. | SGF imports into compatible viewer with correct sequence. |  |  |  | major |
| H-03 | Export game with pass. | Pass appears as empty move property. |  |  |  | major |
| H-04 | Export restored game. | Move order and colors remain correct. |  |  |  | major |
| H-05 | Inspect metadata. | DT/AP/PB/PW/RE/difficulty/app/engine metadata present; Chinese text not corrupted. |  |  |  | minor |

## I. Portrait Mode

| ID | Steps | Expected Result | Actual | Pass/Fail | Screenshot or Note | Severity |
|---|---|---|---|---|---|---|
| I-01 | Play near all four corners. | Stones land on intended intersections. |  |  |  | blocker |
| I-02 | Play near all four edges and center. | No coordinate drift. |  |  |  | major |
| I-03 | Fast repeated taps. | No duplicate illegal moves or page zoom. |  |  |  | major |

## J. Landscape Mode

| ID | Steps | Expected Result | Actual | Pass/Fail | Screenshot or Note | Severity |
|---|---|---|---|---|---|---|
| J-01 | Rotate to landscape mid-game. | Board remains square and state intact. |  |  |  | major |
| J-02 | Play corners, edges, center. | Touch coordinates remain accurate. |  |  |  | blocker |
| J-03 | Collapse/expand Safari toolbar. | Board input remains aligned. |  |  |  | major |

## K. PWA Installation

| ID | Steps | Expected Result | Actual | Pass/Fail | Screenshot or Note | Severity |
|---|---|---|---|---|---|---|
| K-01 | Open HTTPS test URL, Share -> Add to Home Screen. | App installs with icon and name. |  |  |  | major |
| K-02 | Launch from Home Screen. | Opens standalone app, board visible. |  |  |  | blocker |

## L. Offline Reopening

| ID | Steps | Expected Result | Actual | Pass/Fail | Screenshot or Note | Severity |
|---|---|---|---|---|---|---|
| L-01 | After first online load, enable airplane mode and reopen PWA. | App shell, board and required assets load offline. |  |  |  | blocker |
| L-02 | Restore saved game offline and make moves. | Saved game restores and AI responds. |  |  |  | blocker |
| L-03 | Export SGF offline. | Export works or iOS share sheet opens. |  |  |  | major |

## M. Cache Update

| ID | Steps | Expected Result | Actual | Pass/Fail | Screenshot or Note | Severity |
|---|---|---|---|---|---|---|
| M-01 | Install rc1, then deploy harmless rc2 label change. | App eventually shows rc2 without corrupting active game. |  |  |  | major |
| M-02 | Inspect caches if available. | Old `gokidcoach-web-*` cache is removed after activation. |  |  |  | major |

## N. Full-Game Stability

| ID | Steps | Expected Result | Actual | Pass/Fail | Screenshot or Note | Severity |
|---|---|---|---|---|---|---|
| N-01 | Complete or simulate 150+ move game. | No crash, board remains usable, SGF exports. |  |  |  | blocker |
| N-02 | Preferably complete 200-250 move adaptive game. | AI response remains usable; no unbounded slowdown observed. |  |  |  | major |

## O. Performance

| ID | Steps | Expected Result | Actual | Pass/Fail | Screenshot or Note | Severity |
|---|---|---|---|---|---|---|
| O-01 | Observe AI response over 30 moves. | Average perceived response acceptable for child play. |  |  |  | major |
| O-02 | Inspect network if possible. | Large JSON assets load once; no evaluation JSON requests. |  |  |  | major |
| O-03 | Use app for full game. | No visible memory warning or reload. |  |  |  | major |

## P. Real Child Usability

| ID | Steps | Expected Result | Actual | Pass/Fail | Screenshot or Note | Severity |
|---|---|---|---|---|---|---|
| P-01 | Let child play 15+ minutes. | Child can understand turn, pass/new game controls, and difficulty mode remains parent-facing. |  |  |  | minor |
| P-02 | Parent exports debug summary after game. | Local debug file contains summary and SGF; no candidate score dump. |  |  |  | minor |
