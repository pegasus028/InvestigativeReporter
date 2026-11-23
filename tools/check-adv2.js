/* node tools/check-adv2.js — checks the Advanced II bank (data-adv2.js) before release.
   Counts, 4 distinct options with one key, prompts present, gap/frame markers, block rules,
   and the share of tasks where the key is the longest option (target ≈ 25%). Exit code 1 on any error. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const win = {};
vm.runInNewContext(['data.js', 'data-adv.js', 'data-adv2.js'].map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n'), {window: win});
const D = win.ADV2_DETECTIVE, R = win.ADV2_REPORTER, errs = [], warn = [];
const err = (id, m) => errs.push(id + ': ' + m);
const ids = new Set();
[...win.DETECTIVE, ...win.REPORTER, ...win.ADV_DETECTIVE, ...win.ADV_REPORTER].forEach(c => ids.add(c.id));
let mcN = 0, longN = 0, tieN = 0; const longList = [], bySet = {};
function mc(id, task, key, wrongs) {
  mcN++;
  if (!Array.isArray(wrongs) || wrongs.length !== 3) err(id, task + ' needs exactly 3 wrong options');
  const all = [key, ...wrongs];
  if (new Set(all.map(s => s.trim().toLowerCase())).size !== 4) err(id, task + ' options are not distinct');
  const max = Math.max(...wrongs.map(w => w.length));
  if (key.length > max) { longN++; longList.push(id + ' ' + task); }
  else if (key.length === max) { tieN++; warn.push(id + ' ' + task + ': key ties for longest'); }
}
function blocks(id, arr, headline) {
  if (!arr || arr.length < 3) return err(id, 'Task 3 needs at least 3 blocks');
  if (!/^[A-Z0-9]/.test(arr[0])) err(id, 'first block has no capital: ' + arr[0]);
  const caps = arr.filter(b => /^[A-Z]/.test(b)).length;
  if (caps > 1) warn.push(id + ': ' + caps + ' blocks start with a capital (check the order is still unique)');
  if (!headline && !/\.$/.test(arr[arr.length - 1])) err(id, 'last block has no full stop');
  if (new Set(arr).size !== arr.length) err(id, 'repeated block');
}
D.forEach(c => {
  if (ids.has(c.id)) err(c.id, 'duplicate id'); ids.add(c.id);
  ['set', 'src', 'shell', 'why', 'q1', 'q2', 'gap', 'be', 'doer'].forEach(k => { if (!c[k]) err(c.id, 'missing ' + k); });
  if ((c.gap.match(/____/g) || []).length !== 1) err(c.id, 'gap must have exactly one ____');
  mc(c.id, 'T1', c.be, c.beWrong); mc(c.id, 'T2', c.doer, c.doerWrong);
  blocks(c.id, c.active, false);
  bySet[c.set] = bySet[c.set] || {D: 0, R: 0}; bySet[c.set].D++;
});
R.forEach(c => {
  if (ids.has(c.id)) err(c.id, 'duplicate id'); ids.add(c.id);
  ['set', 'src', 'shell', 'why', 'q1', 'q2', 'vg'].forEach(k => { if (!c[k]) err(c.id, 'missing ' + k); });
  if (!(c.obj >= 0 && c.obj < c.parts.length)) err(c.id, 'obj index out of range');
  if (c.frame && (c.frame.match(/____/g) || []).length !== 1) err(c.id, 'frame must have exactly one ____');
  if (c.frame === undefined) err(c.id, 'missing frame (use "" when the options are whole sentences)');
  if (c.set === 'C' && (!c.then || !c.t3)) err(c.id, 'Set C Reporter needs then and t3');
  mc(c.id, 'T2', c.vg, c.vgWrong);
  const headline = !!c.frame && !/\.$/.test(c.frame);
  blocks(c.id, c.passive, headline);
  (c.alt || []).forEach(a => { if (a.slice().sort().join('|') !== c.passive.slice().sort().join('|')) err(c.id, 'alt uses different blocks'); });
  if (c.frame) { const filled = c.frame.replace('____', c.vg).replace(/[.]/g, '').replace(/,/g, ''); const built = c.passive.join(' ').replace(/[.]/g, '').replace(/,/g, '');
    if (filled.toLowerCase() !== built.toLowerCase() && c.dropAgent) warn.push(c.id + ': frame + key ≠ Task 3 answer ("' + filled + '" vs "' + built + '")'); }
  bySet[c.set] = bySet[c.set] || {D: 0, R: 0}; bySet[c.set].R++;
});
console.log('Detective ' + D.length + ' · Reporter ' + R.length + ' · total ' + (D.length + R.length) + ' (Advanced: ' + (win.ADV_DETECTIVE.length + win.ADV_REPORTER.length) + ')');
console.log('By set: ' + JSON.stringify(bySet));
console.log('Multiple-choice tasks ' + mcN + ' · key strictly longest ' + longN + ' (' + Math.round(100 * longN / mcN) + '%) · key tied for longest ' + tieN);
console.log('Longest-key tasks: ' + longList.join(', '));
if (D.length !== 25 || R.length !== 25) err('bank', 'expected 25 + 25 cases');
const share = longN / mcN; if (share < 0.2 || share > 0.3) err('bank', 'longest-key share ' + Math.round(100 * share) + '% is outside 20–30%');
warn.forEach(w => console.log('WARN ' + w));
errs.forEach(e => console.log('ERROR ' + e));
console.log(errs.length ? errs.length + ' error(s)' : 'OK');
process.exit(errs.length ? 1 : 0);
