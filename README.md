# Investigative Reporter
English 4 · Unit 5 · passive voice (all forms of *be*, no modals).
- `index.html` student app: Detective (passive → active) and Reporter (active → passive), 3 tasks per case.
- `leaderboard.html` teacher board: live scores, timer, podium.
- `data.js` sentence bank · `config.js` backend URL · `apps-script/Code.gs` backend (Script Properties, no Sheet).

## Advanced mode (15 Nov 2026)
Chosen on the sign-in screen (Standard / Advanced). Same three-task cases, 50 new cases in `data-adv.js` built on the E4-U5 Passive Shells deck:
25 Detective (passive → active) and 25 Reporter (active → passive) covering modal + be, modal + have been, will have been, to be, to have been,
preposition / verb + being, having been, is / was being, had been, used to be and be used to being.
Detective Task 1 asks for the form of be after the shell; Reporter Task 2 asks for the whole passive verb group.
Scores go to the same board (no backend change).


## Advanced II mode (23 Nov 2026)
Third button on the sign-in screen. 50 cases in `data-adv2.js` (25 Detective + 25 Reporter) built on the deck
"E4-U5 V2 vs V3, impersonal passives and reduced relatives": Set A V2 vs V3 and headlines, Set B impersonal passives
(It is expected that… / is said to be… / There are thought to be…), Set C reduced relatives (the roads closed last week…).
Same three tasks and scoring; every prompt, the Reporter frame sentence, the Set C "Next sentence" and the feedback come from each case.
Also new for every mode: the key's position is drawn from a balanced deck (each of the 4 positions equally often, never 3 in a row),
and "All cases closed" offers "Keep going" into a mode not played yet (the score keeps adding up on the board; backend cap 5000).

Checks: `node tools/check-adv2.js` (bank rules, longest-key share) · `node tools/e2e.js [shots]` (all modes, mocked backend) ·
`node tools/e2e-board.js [shots]` (teacher board + 3 students in 3 modes against an in-memory copy of Code.gs).

## Passive Lab (`lab/`)

Self-study page for the three passive question types (fill in the blank, error ID, same meaning), added 27 Nov 2026: https://pegasus028.github.io/InvestigativeReporter/lab/

- One file, no backend; progress is kept in the browser (`localStorage` key `passivelab-v1`).
- Six labs: Flip machine (role cards), Brick fit, Socket and count, Error scanner, Same-story check, Mixed practice.
- Uses the same visual language as the deck "E4-U5 Three tools for passive questions": green = does it, blue = gets it; bricks be / been / being / am·is·are·was·were.
