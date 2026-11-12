/* Investigative Reporter backend — Apps Script web app (Execute as: Me, Access: Anyone).
   Class list: a second, private script file Roster.gs defines ROSTER (array of sign-in labels); it is not in the repo.
   No Sheet: scores live in Script Properties, one key per student, so 30 students never queue on a lock. */
var P = PropertiesService.getScriptProperties();
function out(o){ return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function timer_(){ var t = P.getProperty('timer'); return t ? JSON.parse(t) : {expirationMs:0, running:false}; }
function epoch_(){ return P.getProperty('epoch') || '1'; }
function doGet(e){
  if (e && e.parameter && e.parameter.action === 'roster') return out({ok:true, roster:(typeof ROSTER !== 'undefined' && ROSTER) ? ROSTER : []});
  var all = P.getProperties(), teams = [];
  for (var k in all) if (k.indexOf('T:') === 0) { try { teams.push(JSON.parse(all[k])); } catch (err) {} }
  var t = all.timer ? JSON.parse(all.timer) : {expirationMs:0, running:false};
  if (t.running && t.expirationMs && Date.now() > t.expirationMs) t.running = false;
  return out({ok:true, teams:teams, timer:t, epoch:all.epoch || '1', now:Date.now()});
}
function doPost(e){
  var b = {}; try { b = JSON.parse(e.postData.contents); } catch (err) { return out({ok:false, error:'bad json'}); }
  var a = b.action;
  if (a === 'register' || a === 'score') {
    var team = String(b.team || '').trim().slice(0, 24); if (!team) return out({ok:false, error:'no name'});
    var ep = epoch_();
    if (a === 'score' && String(b.epoch) !== ep) return out({ok:true, stale:true, epoch:ep, timer:timer_(), now:Date.now()});
    var key = 'T:' + team.toLowerCase(), cur = P.getProperty(key);
    if (a === 'register' && cur) { var c = JSON.parse(cur); return out({ok:true, epoch:ep, timer:timer_(), now:Date.now(), saved:c}); }
    var asked = Math.max(0, Number(b.asked) || 0), first = Math.max(0, Number(b.first) || 0);
    var rec = {team:team, score:Math.max(0, Math.min(5000, Number(b.score) || 0)), asked:asked, first:first,
               second:Math.max(0, Number(b.second) || 0), firstTry:first, secondTry:Math.max(0, Number(b.second) || 0), bestStreak:Math.max(0, Number(b.bestStreak) || 0),
               cases:Math.max(0, Number(b.cases) || 0), accuracy: asked ? Math.round(first / asked * 100) : 0};
    P.setProperty(key, JSON.stringify(rec));
    return out({ok:true, epoch:ep, timer:timer_(), now:Date.now(), score:rec.score});
  }
  if (a === 'start') { var m = Math.max(1, Math.min(60, Number(b.minutes) || 10));
    P.setProperty('timer', JSON.stringify({expirationMs: Date.now() + m * 60000, running:true})); return out({ok:true}); }
  if (a === 'stop') { var t = timer_(); t.running = false; P.setProperty('timer', JSON.stringify(t)); return out({ok:true}); }
  if (a === 'reset') { var ep2 = String(Number(epoch_()) + 1); P.deleteAllProperties(); P.setProperty('epoch', ep2); return out({ok:true}); }
  return out({ok:false, error:'unknown action'});
}
