/* node tools/e2e-board.js [shotsDir] — teacher board + students together against an in-memory copy of apps-script/Code.gs.
   Board starts a round; one student plays Advanced II, one Advanced, one Standard (a few cases each, live);
   the board must list all three with their scores; Stop & Show Podium; Reset must send every student back to 0
   in the mode she was playing. Exit code 1 on any failure. */
const {chromium} = require('playwright');
const path = require('path'), fs = require('fs');
const root = path.join(__dirname, '..');
const shots = process.argv[2] || null; if (shots) fs.mkdirSync(shots, {recursive: true});
const fails = []; const fail = m => { fails.push(m); console.log('FAIL ' + m); };

/* in-memory port of Code.gs (same contract) */
const P = {epoch: '1'};
function getAll() { const teams = Object.keys(P).filter(k => k.indexOf('T:') === 0).map(k => JSON.parse(P[k]));
  const t = P.timer ? JSON.parse(P.timer) : {expirationMs: 0, running: false}; if (t.running && Date.now() > t.expirationMs) t.running = false;
  return {ok: true, teams, timer: t, epoch: P.epoch || '1', now: Date.now()}; }
const timer_ = () => P.timer ? JSON.parse(P.timer) : {expirationMs: 0, running: false};
function post(b) {
  const a = b.action;
  if (a === 'register' || a === 'score') {
    const team = String(b.team || '').trim().slice(0, 24); const ep = P.epoch || '1';
    if (a === 'score' && String(b.epoch) !== ep) return {ok: true, stale: true, epoch: ep, timer: timer_(), now: Date.now()};
    const key = 'T:' + team.toLowerCase(), cur = P[key];
    const mode = ['std', 'adv', 'adv2'].indexOf(b.mode) >= 0 ? b.mode : '';
    if (a === 'register' && cur) { const c = JSON.parse(cur); if (mode && c.mode !== mode) { c.mode = mode; P[key] = JSON.stringify(c); } return {ok: true, epoch: ep, timer: timer_(), now: Date.now(), saved: c}; }
    const asked = Math.max(0, +b.asked || 0), first = Math.max(0, +b.first || 0);
    const rec = {team, score: Math.max(0, Math.min(5000, +b.score || 0)), asked, first, second: +b.second || 0, firstTry: first, secondTry: +b.second || 0,
      bestStreak: +b.bestStreak || 0, cases: +b.cases || 0, accuracy: asked ? Math.round(first / asked * 100) : 0, mode: mode || (cur ? (JSON.parse(cur).mode || '') : '')};
    P[key] = JSON.stringify(rec); return {ok: true, epoch: ep, timer: timer_(), now: Date.now(), score: rec.score};
  }
  if (a === 'start') { const m = Math.max(1, Math.min(60, +b.minutes || 10)); P.timer = JSON.stringify({expirationMs: Date.now() + m * 60000, running: true}); return {ok: true}; }
  if (a === 'stop') { const t = timer_(); t.running = false; P.timer = JSON.stringify(t); return {ok: true}; }
  if (a === 'reset') { const ep2 = String(+P.epoch + 1); Object.keys(P).forEach(k => delete P[k]); P.epoch = ep2; return {ok: true}; }
  return {ok: false};
}
async function wire(page, errors) {
  page.on('pageerror', e => errors.push(e.message));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await page.route(/script\.google\.com/, async r => {
    const req = r.request(); let body;
    if (/action=roster/.test(req.url())) body = {roster: []};
    else if (req.method() === 'POST') body = post(JSON.parse(req.postData() || '{}'));
    else body = getAll();
    return r.fulfill({contentType: 'application/json', body: JSON.stringify(body)});
  });
}
async function clickText(page, sel, text) {
  const ok = await page.evaluate(([sel, text]) => { const b = [...document.querySelectorAll(sel)].find(x => x.textContent === text && !x.disabled); if (!b) return false; b.click(); return true; }, [sel, text]);
  if (!ok) throw new Error('no "' + text + '"');
}
async function playTasks(page, n) {
  for (let i = 0; i < n; i++) {
    const s = await page.evaluate(() => ({it: ALL[S.queue[S.qi]], step: S.step}));
    const it = s.it, k = s.step;
    if (it.role === 'D') { if (k < 2) await clickText(page, '#area .opt', k ? it.doer : it.be); else { for (const t of it.active) await clickText(page, '#pool .blk', t); await page.click('#checkBtn'); } }
    else { if (k === 0) await clickText(page, '#area .blk', it.parts[it.obj].replace(/[.]$/, ''));
      else if (k === 1) await clickText(page, '#area .opt', (it.adv || it.adv2) ? it.vg : it.v3);
      else { for (const t of it.passive) await clickText(page, '#pool .blk', t); await page.click('#checkBtn'); } }
    await page.click('#nextBtn');
  }
}
(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const bctx = await browser.newContext({viewport: {width: 1366, height: 768}}); const board = await bctx.newPage(); await wire(board, errors);
  await board.goto('file://' + path.join(root, 'leaderboard.html'));
  await board.evaluate(() => { window.confirm = () => true; });
  const students = [];
  for (const [mode, name] of [['adv2', 'Guest#1'], ['adv', 'Guest#2'], ['std', 'Guest#3']]) {
    const ctx = await browser.newContext({viewport: {width: 1024, height: 768}}); const p = await ctx.newPage(); await wire(p, errors);
    await p.goto('file://' + path.join(root, 'index.html'));
    await p.click('#modes .mode[data-mode=' + mode + ']'); await p.fill('#name', name); await p.click('#joinBtn');
    await p.waitForSelector('#vWait:not(.hide)'); students.push({p, mode, name});
  }
  await board.fill('#mins', '5'); await board.click('#startBtn');
  for (const s of students) await s.p.waitForSelector('#vPlay:not(.hide)', {timeout: 15000});
  for (const s of students) await playTasks(s.p, 9); // 3 perfect cases = 105
  await board.waitForTimeout(4500);
  const txt = await board.textContent('body');
  for (const s of students) { if (txt.indexOf(s.name) < 0) fail('board does not show ' + s.name); }
  const scores = getAll().teams.map(t => t.team + ' ' + t.score + ' (' + t.cases + ' cases)');
  console.log('backend: ' + scores.join(' · '));
  if (getAll().teams.some(t => t.score !== 105)) fail('expected 105 each');
  const dots = await board.evaluate(() => [...document.querySelectorAll('#podStrip .nm, #feedList .t')].map(e => { const d = e.querySelector('.md'); return e.textContent.replace(/^\D*\d+\.\s*/, '').trim() + ':' + (d ? d.className.replace('md ', '') : 'none'); }));
  console.log('board dots: ' + dots.join(' '));
  for (const s of students) { if (dots.filter(d => d === s.name + ':' + s.mode).length !== 2) fail(s.name + ' dot should be ' + s.mode + ' on card and standings'); }
  // more students so the chasing pack (chart / bars) shows dots too
  for (const [n, m] of [['Guest#4', 'adv2'], ['Guest#5', 'std']]) post({action: 'register', team: n, mode: m});
  post({action: 'score', team: 'Guest#4', mode: 'adv2', epoch: '1', score: 40, asked: 4, first: 4}); post({action: 'score', team: 'Guest#5', mode: 'std', epoch: '1', score: 20, asked: 2, first: 2});
  await board.waitForTimeout(4000);
  const pack = await board.evaluate(() => (window.chart && chart.data ? chart.data.labels : [...document.querySelectorAll('.fbname')].map(e => e.innerHTML)));
  console.log('chasing pack labels: ' + JSON.stringify(pack));
  if (!pack.length || !pack.every(l => /🟠|🟢|md (adv2|std)/.test(l))) fail('chasing pack has no mode dots');
  // keep going changes the dot: Guest#3 (Standard) jumps to her done screen and keeps going into Advanced II
  const g3 = students[2].p;
  await g3.evaluate(() => { S.qi = S.queue.length; save(); route(); });
  await g3.click('#more button >> text=Advanced II');
  await board.waitForTimeout(4000);
  const g3dot = await board.evaluate(() => { const e = [...document.querySelectorAll('#feedList .t')].find(x => /Guest#3/.test(x.textContent)); return e && e.querySelector('.md') ? e.querySelector('.md').className : 'none'; });
  console.log('Guest#3 after Keep going into Advanced II: ' + g3dot);
  if (!/adv2/.test(g3dot)) fail('dot did not change after Keep going');
  if (shots) await board.screenshot({path: path.join(shots, '10-board-live.png')});
  await board.click('#stopBtn'); await board.waitForTimeout(2500);
  const podiumOpen = await board.isVisible('#podium');
  console.log('podium open after Stop: ' + podiumOpen);
  if (!podiumOpen) fail('podium did not open');
  if (shots) await board.screenshot({path: path.join(shots, '11-board-podium.png')});
  for (const s of students) { await s.p.waitForSelector('#vWait:not(.hide)', {timeout: 15000}); }
  console.log('students on "Time’s up" screen: yes');
  if (await board.isVisible('#closePodium')) await board.click('#closePodium');
  await board.click('#resetBtn'); await board.waitForTimeout(1000);
  for (const s of students) {
    await s.p.waitForFunction(() => S && S.score === 0 && S.epoch === '2', null, {timeout: 20000}).catch(() => fail(s.name + ' not reset'));
    const st = await s.p.evaluate(() => ({mode: S.mode, n: S.queue.length, who: document.getElementById('who').textContent}));
    console.log(s.name + ' after Reset: mode ' + st.mode + ', ' + st.n + ' cases, header "' + st.who + '"');
    if (st.mode !== s.mode) fail(s.name + ' mode changed on Reset');
  }
  if (getAll().teams.length !== 3 || getAll().teams.some(t => t.score)) fail('backend not at 0 for 3 students after Reset: ' + JSON.stringify(getAll().teams));
  if (errors.length) fail('page errors: ' + errors.join(' | '));
  await browser.close();
  console.log(fails.length ? fails.length + ' failure(s)' : 'BOARD TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})();
