/* node tools/e2e.js [shotsDir] — plays every mode of the student app end to end against a mocked backend.
   Standard 63 tasks → 735 · Advanced 150 → 1750 · Advanced II 150 → 1750, then "Keep going" into Standard (+735),
   a wrong-answer pass (5 and 0 points), key-position balance, banned wording in Advanced II, and page errors.
   Needs Playwright (npm i -g playwright). Exit code 1 on any failure. */
const {chromium} = require('playwright');
const path = require('path'), fs = require('fs');
const root = path.join(__dirname, '..');
const shots = process.argv[2] || null; if (shots) fs.mkdirSync(shots, {recursive: true});
const fails = []; const fail = m => { fails.push(m); console.log('FAIL ' + m); };

async function newPage(browser, vp) {
  const ctx = await browser.newContext({viewport: vp || {width: 1024, height: 768}});
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const posts = [];
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await page.route(/script\.google\.com/, async r => {
    const req = r.request(); const now = Date.now();
    const base = {ok: true, epoch: '7', now, timer: {running: true, expirationMs: now + 3600e3}};
    if (req.method() === 'POST') { const b = JSON.parse(req.postData() || '{}'); posts.push(b); }
    if (/action=roster/.test(req.url())) return r.fulfill({contentType: 'application/json', body: JSON.stringify({roster: []})});
    return r.fulfill({contentType: 'application/json', body: JSON.stringify(Object.assign(base, {teams: []}))});
  });
  await page.goto('file://' + path.join(root, 'index.html'));
  return {page, errors, posts, ctx};
}
const st = page => page.evaluate(() => { const it = ALL[S.queue[S.qi]]; return {id: it.id, it, step: S.step, qi: S.qi, n: S.queue.length, score: S.score, mode: S.mode}; });

async function clickText(page, sel, text) {
  const ok = await page.evaluate(([sel, text]) => { const b = [...document.querySelectorAll(sel)].find(x => x.textContent === text && !x.disabled); if (!b) return false; b.click(); return true; }, [sel, text]);
  if (!ok) throw new Error('no button "' + text + '" in ' + sel);
}
async function answer(page, s, opts) {
  const it = s.it, k = s.step; opts = opts || {};
  const q = await page.textContent('#q'); const src = await page.textContent('#src');
  let key, kind;
  if (it.role === 'D') { if (k === 0) { key = it.be; kind = 'mc'; } else if (k === 1) { key = it.doer; kind = 'mc'; } else { key = it.active; kind = 'ord'; } }
  else { if (k === 0) { key = it.parts[it.obj].replace(/[.]$/, ''); kind = 'tap'; } else if (k === 1) { key = (it.adv || it.adv2) ? it.vg : it.v3; kind = 'mc'; } else { key = it.passive; kind = 'ord'; } }
  let pos = null;
  if (kind === 'mc') {
    pos = await page.evaluate(key => [...document.querySelectorAll('#area .opt')].findIndex(b => b.textContent === key), key);
    if (opts.wrong) { const w = await page.evaluate(key => [...document.querySelectorAll('#area .opt')].map(b => b.textContent).filter(t => t !== key), key);
      await clickText(page, '#area .opt', w[0]); if (opts.wrong === 2) await clickText(page, '#area .opt', w[1]); }
    if (opts.wrong !== 2) await clickText(page, '#area .opt', key);
  } else if (kind === 'tap') {
    if (opts.wrong) { const other = it.parts.map(p => p.replace(/[.]$/, '')).find((p, i) => i !== it.obj && !(it.objAlt || []).includes(i)); await clickText(page, '#area .blk', other);
      if (opts.wrong === 2) { const other2 = it.parts.map(p => p.replace(/[.]$/, '')).filter((p, i) => i !== it.obj && !(it.objAlt || []).includes(i))[1]; await clickText(page, '#area .blk', other2); } }
    if (opts.wrong !== 2) await clickText(page, '#area .blk', key);
  } else {
    const order = async arr => { for (const t of arr) await clickText(page, '#pool .blk', t); await page.click('#checkBtn'); };
    if (opts.wrong) { await order(key.slice().reverse()); await page.click('#resetBtn'); if (opts.wrong === 2) { await order(key.slice().reverse()); } }
    if (opts.wrong !== 2) await order(key);
  }
  const fb = await page.innerHTML('#fb');
  if (opts.shot) await page.screenshot({path: opts.shot, fullPage: true});
  await page.click('#nextBtn');
  return {q, fb, pos, kind, src};
}
async function playAll(page, label, expectTasks, expectScore, log) {
  let tasks = 0;
  for (let guard = 0; guard < 2000; guard++) {
    if (await page.isVisible('#vDone')) break;
    const s = await st(page);
    const r = await answer(page, s); tasks++;
    if (log) log(s, r);
  }
  const score = await page.evaluate(() => S.score);
  console.log(label + ': ' + tasks + ' tasks, score ' + score);
  if (tasks !== expectTasks) fail(label + ' tasks ' + tasks + ' ≠ ' + expectTasks);
  if (score !== expectScore) fail(label + ' score ' + score + ' ≠ ' + expectScore);
  return score;
}
async function join(page, mode, name, solo) {
  await page.click('#modes .mode[data-mode=' + mode + ']');
  await page.fill('#name', name);
  await page.click(solo ? '#soloBtn' : '#joinBtn');
  await page.waitForSelector('#vPlay:not(.hide)');
}

(async () => {
  const browser = await chromium.launch();
  // 1) Standard and Advanced (regression)
  for (const [mode, tasks, score] of [['std', 63, 735], ['adv', 150, 1750]]) {
    const {page, errors, ctx} = await newPage(browser);
    await join(page, mode, 'Guest#1', false);
    await playAll(page, mode, tasks, score);
    if (errors.length) fail(mode + ' page errors: ' + errors.join(' | '));
    await ctx.close();
  }
  // 2) Advanced II, live (mock board), with checks on wording and key positions
  {
    const {page, errors, posts, ctx} = await newPage(browser);
    if (shots) await page.screenshot({path: path.join(shots, '01-signin-1024.png')});
    await join(page, 'adv2', 'Guest#2', false);
    const header = await page.textContent('#who'); if (!/Advanced II/.test(header)) fail('header does not say Advanced II: ' + header);
    const posCount = [0, 0, 0, 0], posSeq = []; const banned = [/Which form of be/, /keep the tense/i, /not a fact from the report/];
    let shotDone = {};
    await playAll(page, 'adv2', 150, 1750, (s, r) => {
      if (r.pos !== null) { posCount[r.pos]++; posSeq.push(r.pos); }
      if (/Which form of be is missing|\(the shell\)/.test(r.q) || /keep the tense/i.test(r.q)) fail(s.id + ' T' + (s.step + 1) + ' shows old wording: ' + r.q);
      if (/not a fact from the report/.test(r.fb) && s.it.fb2) fail(s.id + ' T2 shows the default doer line instead of fb2');
      if (s.it.role === 'R' && s.step === 1 && r.src && r.src.indexOf(s.it.shell) >= 0) fail(s.id + ' T2 shows the rule in the source line before the answer');
      if (/\.\./.test(r.fb)) fail(s.id + ' feedback has ".."');
      if (!/Correct\./.test(r.fb)) fail(s.id + ' T' + (s.step + 1) + ' feedback not Correct: ' + r.fb.slice(0, 80));
    });
    console.log('adv2 key positions (A B C D): ' + posCount.join(' ') + ' · longest run ' + Math.max(...posSeq.map((p, i) => { let n = 1; while (i - n >= 0 && posSeq[i - n] === p) n++; return n; })));
    if (Math.max(...posCount) - Math.min(...posCount) > 2) fail('key positions not balanced: ' + posCount.join(' '));
    // done screen: keep going
    const more = await page.$$eval('#more button', bs => bs.map(b => b.textContent));
    console.log('keep-going buttons: ' + more.join(' | '));
    if (more.length !== 2) fail('expected 2 keep-going buttons, got ' + more.length);
    if (shots) await page.screenshot({path: path.join(shots, '05-done-keepgoing.png')});
    await page.click('#more button >> text=Standard');
    const s0 = await st(page); if (s0.mode !== 'std' || s0.n !== 71) fail('keep going did not extend the queue to 71: ' + s0.n + ' ' + s0.mode);
    await playAll(page, 'adv2 → keep going std', 63, 2485);
    const more2 = await page.$$eval('#more button', bs => bs.map(b => b.textContent));
    if (more2.length !== 1 || !/Advanced \(50/.test(more2[0])) fail('after Standard, expected only the Advanced button: ' + more2.join('|'));
    const last = posts.filter(p => p.action === 'score').pop();
    if (!last || last.score !== 2485 || last.cases !== 71) fail('last score POST wrong: ' + JSON.stringify(last));
    else console.log('last POST to board: score ' + last.score + ', cases ' + last.cases + ', asked ' + last.asked);
    if (errors.length) fail('adv2 page errors: ' + errors.join(' | '));
    await ctx.close();
  }
  // 3) Advanced II, wrong answers: second try = 5, wrong twice = 0, hints shown
  {
    const {page, errors, ctx} = await newPage(browser);
    await join(page, 'adv2', 'Guest#3', true);
    let s = await st(page); const before = s.score;
    // task 1 wrong once (5), task 2 wrong twice (0), task 3 right (10), no bonus
    const r1 = await answer(page, await st(page), {wrong: 1});
    const r2 = await answer(page, await st(page), {wrong: 2});
    await answer(page, await st(page));
    s = await st(page);
    if (s.score - before !== 15) fail('wrong-answer scoring: got +' + (s.score - before) + ', expected +15');
    else console.log('wrong-answer pass: +15 (5 + 0 + 10, no bonus) on ' + s.id);
    if (!/5 pts/.test(r1.fb)) fail('second try did not show 5 pts: ' + r1.fb.slice(0, 60));
    if (!/0 pts/.test(r2.fb)) fail('wrong twice did not show 0 pts');
    if (errors.length) fail('wrong-answer page errors: ' + errors.join(' | '));
    await ctx.close();
  }

  // 5) Reload after answering must not score the task again; a first wrong try survives a reload
  {
    const {page, errors, ctx} = await newPage(browser);
    await join(page, 'adv2', 'Guest#1', true);
    let s = await st(page);
    await clickText(page, '#area .opt', s.it.role === 'D' ? s.it.be : null).catch(async () => {});
    if (s.it.role === 'R') await clickText(page, '#area .blk', s.it.parts[s.it.obj].replace(/[.]$/, ''));
    const sc1 = await page.evaluate(() => S.score);
    await page.reload(); await page.waitForSelector('#vPlay:not(.hide)');
    await page.evaluate(() => document.querySelectorAll('#area button').forEach(b => b.click()));
    const sc2 = await page.evaluate(() => S.score);
    if (sc2 !== sc1) fail('reload re-scored the task: ' + sc1 + ' → ' + sc2); else console.log('reload after answering: score stays ' + sc2);
    await page.click('#nextBtn');
    // first wrong try, then reload: the next right answer is worth 5, not 10
    s = await st(page);
    const before = s.score;
    if (s.step === 1 || s.it.role === 'D') {
      const key = s.it.role === 'D' ? (s.step === 0 ? s.it.be : s.it.doer) : s.it.vg;
      const w = await page.evaluate(key => [...document.querySelectorAll('#area .opt')].map(b => b.textContent).find(t => t !== key), key);
      await clickText(page, '#area .opt', w);
      await page.reload(); await page.waitForSelector('#vPlay:not(.hide)');
      await clickText(page, '#area .opt', key);
      const gain = (await page.evaluate(() => S.score)) - before;
      if (gain !== 5) fail('wrong try + reload: gained ' + gain + ', expected 5'); else console.log('wrong try + reload: right answer worth 5');
    }
    if (errors.length) fail('reload page errors: ' + errors.join(' | '));
    await ctx.close();
  }
  // 6) Teacher Reset after "Keep going" restarts the student in the mode she signed in with
  {
    const {page, errors, ctx} = await newPage(browser);
    await join(page, 'adv2', 'Guest#2', false);
    await page.evaluate(() => { S.qi = S.queue.length; save(); route(); });
    await page.click('#more button >> text=Advanced (50');
    await page.evaluate(() => applyTimer({epoch: '8', timer: {running: true, expirationMs: Date.now() + 3600e3}, now: Date.now()}));
    const r = await page.evaluate(() => ({mode: S.mode, n: S.queue.length, score: S.score, adv2: S.queue.every(id => ALL[id].adv2)}));
    if (r.mode !== 'adv2' || r.n !== 50 || !r.adv2 || r.score !== 0) fail('Reset after keep going: ' + JSON.stringify(r)); else console.log('Reset after keep going: back to Advanced II, 50 cases, 0');
    if (errors.length) fail('reset page errors: ' + errors.join(' | '));
    await ctx.close();
  }
  // 4) Screenshots of Advanced II screens on phone and iPad sizes
  if (shots) {
    for (const vp of [{width: 390, height: 844, n: 'phone'}, {width: 1024, height: 768, n: 'ipad'}]) {
      const {page, ctx} = await newPage(browser, vp);
      await page.screenshot({path: path.join(shots, '02-signin-' + vp.n + '.png'), fullPage: true});
      await join(page, 'adv2', 'Guest#1', true);
      const want = {RR6: [0, 1, 2], IR4: [1], VD8: [0, 2], ID2: [1]}; let taken = 0;
      for (let g = 0; g < 400 && taken < 7; g++) {
        if (await page.isVisible('#vDone')) break;
        const s = await st(page);
        if (want[s.id] && want[s.id].includes(s.step)) { await page.screenshot({path: path.join(shots, '03-' + vp.n + '-' + s.id + '-t' + (s.step + 1) + '.png'), fullPage: true}); taken++; }
        await answer(page, s, want[s.id] && want[s.id].includes(s.step) ? {shot: path.join(shots, '04-' + vp.n + '-' + s.id + '-t' + (s.step + 1) + '-fb.png')} : {});
      }
      await ctx.close();
    }
  }
  await browser.close();
  console.log(fails.length ? fails.length + ' failure(s)' : 'ALL PASSED');
  process.exit(fails.length ? 1 : 0);
})();
