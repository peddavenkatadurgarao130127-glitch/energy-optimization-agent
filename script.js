(function(){
'use strict';

var DAYS = 30, KG_PER_TREE = 21;
var nf0 = new Intl.NumberFormat('en-IN',{maximumFractionDigits:0});
var nf1 = new Intl.NumberFormat('en-IN',{minimumFractionDigits:1,maximumFractionDigits:1});
var $ = function(id){ return document.getElementById(id); };
var esc = function(s){ return String(s).replace(/[&<>"']/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };
var rupee = function(v){ return '₹' + nf0.format(v); };
var num = function(v){ var n = parseFloat(v); return (isFinite(n) && n >= 0) ? n : 0; };
var seq = 0;
var uid = function(){ seq++; return 'a' + seq + Math.random().toString(36).slice(2,6); };
var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
var fmtMonth = function(m){ var p = m.split('-'); return MONTHS[+p[1]-1] + ' ' + p[0]; };
var fmtMonthShort = function(m){ var p = m.split('-'); return MONTHS[+p[1]-1] + ' ' + p[0].slice(2); };
var pb = function(m){ return m < 1 ? 'under 1 month' : (m < 24 ? nf0.format(Math.ceil(m)) + ' mo' : nf1.format(m/12) + ' yr'); };

var PRESETS = {
  ac:{label:'Air conditioner (1.5 ton)',watts:1500,hours:6,qty:1},
  fan:{label:'Ceiling fan',watts:75,hours:10,qty:1},
  bulb:{label:'Incandescent bulb',watts:60,hours:4,qty:1},
  cfl:{label:'CFL lamp',watts:15,hours:5,qty:1},
  tube:{label:'Tube light',watts:40,hours:6,qty:1},
  led:{label:'LED bulb',watts:9,hours:5,qty:1},
  fridge:{label:'Refrigerator',watts:150,hours:8,qty:1},
  heater:{label:'Water heater (geyser)',watts:2000,hours:1,qty:1},
  tv:{label:'Television',watts:100,hours:4,qty:1},
  pc:{label:'Desktop computer',watts:150,hours:5,qty:1},
  washer:{label:'Washing machine',watts:500,hours:0.7,qty:1},
  pump:{label:'Water pump',watts:750,hours:1,qty:1},
  standby:{label:'Always-on devices (router, set-top box, chargers)',watts:25,hours:24,qty:1},
  other:{label:'Other appliance',watts:100,hours:2,qty:1}
};

function sampleItems(){
  var mk = function(kind,name,qty,watts,hours){ return {id:uid(),kind:kind,name:name,qty:qty,watts:watts,hours:hours}; };
  return [
    mk('ac','Living room AC (1.5 ton)',1,1500,6),
    mk('fan','Ceiling fan',4,75,10),
    mk('tube','Tube light',3,40,6),
    mk('bulb','Incandescent bulb',2,60,4),
    mk('led','LED bulb',4,9,5),
    mk('fridge','Refrigerator',1,150,8),
    mk('heater','Water heater',1,2000,1),
    mk('tv','Television',1,100,4),
    mk('pc','Desktop computer',1,150,5),
    mk('washer','Washing machine',1,500,0.7),
    mk('pump','Water pump',1,750,1),
    mk('standby','Router, set-top box, chargers',1,25,24)
  ];
}
function sampleLog(){
  return [['2026-05',655],['2026-06',702],['2026-07',648],['2026-08',671],['2026-09',690]].map(function(p){ return {month:p[0],kwh:p[1]}; });
}
function defaults(){
  return {items:sampleItems(),tariff:7,ef:0.71,setpoint:22,bill:690,target:20,sample:true,manual:false,sel:[],log:sampleLog(),logExample:true};
}

var KEY = 'eoa-state-v2';
function load(){
  try{
    var raw = localStorage.getItem(KEY);
    if(raw){ var s = JSON.parse(raw); if(s && Array.isArray(s.items) && Array.isArray(s.log)) return s; }
  }catch(e){}
  return null;
}
function save(){ try{ localStorage.setItem(KEY, JSON.stringify(state)); }catch(e){} }

var state = Object.assign(defaults(), load() || {});
var view = {c:null,recs:[],sel:new Set()};

/* ---------- observe ---------- */
var base = function(a){ return a.qty * a.watts * a.hours * DAYS / 1000; };

function compute(){
  var rows = state.items.map(function(a){ return {a:a,kwh:base(a)}; });
  var total = rows.reduce(function(s,r){ return s + r.kwh; }, 0);
  return {rows:rows,total:total,cost:total*state.tariff,co2:total*state.ef};
}

/* ---------- recommend ---------- */
var nm = function(a){ return a.name + (a.qty > 1 ? ' (×' + a.qty + ')' : ''); };

function buildRecs(items,s){
  var recs = [];
  var add = function(a,key,r){
    if(r.kwh < 0.5) return;
    r.id = a.id + ':' + key;
    r.cost = r.kwh * s.tariff;
    r.co2 = r.kwh * s.ef;
    r.payback = (r.upfront > 0 && r.cost > 0) ? r.upfront / r.cost : 0;
    recs.push(r);
  };
  items.forEach(function(a){
    var b = base(a);
    if(b <= 0) return;
    var k = a.kind;
    if(k === 'ac'){
      var cut = Math.min(0.25, 0.05 * Math.max(0, 25 - s.setpoint));
      var rem = b;
      if(cut > 0){
        add(a,'setpoint',{title:'Set ' + a.name + ' to 25 °C',why:'You run it at ' + s.setpoint + ' °C. Each degree warmer trims about 5% off cooling energy, and a fan keeps 25 °C comfortable.',kwh:b*cut,upfront:0,effort:'free'});
        rem = b * (1 - cut);
      }
      if(a.hours >= 5){
        add(a,'hours',{title:'Run ' + a.name + ' one hour less',why:'It runs ' + a.hours + ' hours a day. Use the sleep timer and let a fan finish the job once the room is cool.',kwh:rem/a.hours,upfront:0,effort:'free'});
        rem = rem * (1 - 1/a.hours);
      }
      if(a.watts >= 1200){
        add(a,'upgrade',{title:'Replace ' + a.name + ' with a 5-star inverter AC',why:'A 5-star inverter model uses roughly 30% less than a fixed-speed unit. The cost shown is the extra spend over a standard model.',kwh:rem*0.3,upfront:15000*a.qty,effort:'invest'});
      }
    } else if(k === 'fan'){
      if(a.watts >= 50) add(a,'bldc',{title:'Swap ' + nm(a) + ' for 28 W BLDC fans',why:'A BLDC fan gives comparable airflow at about 28 W, against ' + a.watts + ' W for your current one.',kwh:a.qty*(a.watts-28)*a.hours*DAYS/1000,upfront:3000*a.qty,effort:'invest'});
    } else if(k === 'bulb' || k === 'cfl'){
      if(a.watts > 12) add(a,'led',{title:'Replace ' + nm(a) + ' with 9 W LEDs',why:'An LED gives similar light at 9 W. Yours draws ' + a.watts + ' W.',kwh:a.qty*(a.watts-9)*a.hours*DAYS/1000,upfront:90*a.qty,effort:'small'});
    } else if(k === 'tube'){
      if(a.watts > 22) add(a,'led',{title:'Replace ' + nm(a) + ' with 18 W LED battens',why:'An 18 W LED batten replaces a ' + a.watts + ' W tube with similar light.',kwh:a.qty*(a.watts-18)*a.hours*DAYS/1000,upfront:350*a.qty,effort:'small'});
    } else if(k === 'fridge'){
      add(a,'tune',{title:'Tune ' + a.name,why:'Set the dial to the middle setting, keep door seals tight, leave space behind the coils, and let food cool before it goes in.',kwh:b*0.08,upfront:0,effort:'free'});
      if(a.watts >= 180) add(a,'replace',{title:'Replace ' + a.name + ' with a 5-star model',why:'A 5-star model uses about 40% less than an older unit drawing ' + a.watts + ' W.',kwh:b*0.4,upfront:30000*a.qty,effort:'invest'});
    } else if(k === 'heater'){
      add(a,'timer',{title:'Put ' + a.name + ' on a timer at 50 °C',why:'Heat water only when it is needed and hold the thermostat near 50 °C. Most geyser waste is standing loss.',kwh:b*0.2,upfront:600,effort:'small'});
      if(b >= 30) add(a,'solar',{title:'Add a solar water heater',why:'A solar water heater covers most hot water in sunny weather. The geyser stays as backup.',kwh:b*0.8*0.7,upfront:25000,effort:'invest'});
    } else if(k === 'tv'){
      add(a,'eco',{title:'Use eco picture mode on ' + a.name,why:'Lower brightness and eco mode trim screen power, and switching it off at the plug removes the standby draw.',kwh:b*0.15,upfront:0,effort:'free'});
    } else if(k === 'pc'){
      add(a,'sleep',{title:'Enable sleep on ' + a.name,why:'Sleep after 10 idle minutes and shut down when you leave the desk.',kwh:b*0.2,upfront:0,effort:'free'});
    } else if(k === 'washer'){
      add(a,'cold',{title:'Wash full loads in cold water',why:'Full loads and cold cycles cut motor and heater time without changing how clean the clothes get.',kwh:b*0.15,upfront:0,effort:'free'});
    } else if(k === 'pump'){
      add(a,'float',{title:'Fit a float switch or timer on ' + a.name,why:'The pump stops when the tank is full, so it never runs on after the water has overflowed.',kwh:b*0.15,upfront:1500,effort:'small'});
    } else if(k === 'standby'){
      if(a.hours >= 20) add(a,'night',{title:'Switch off always-on devices at night',why:'A switched power strip or smart plug removes about 8 hours of idle draw every day.',kwh:a.qty*a.watts*8*DAYS/1000,upfront:400,effort:'small'});
    }
  });
  recs.sort(function(x,y){ return (x.payback - y.payback) || (y.kwh - x.kwh); });
  return recs;
}

function autoSelect(recs,total,target){
  var need = total * target / 100, acc = 0, out = [];
  for(var i = 0; i < recs.length; i++){
    if(acc >= need) break;
    out.push(recs[i].id);
    acc += recs[i].kwh;
  }
  return out;
}

/* ---------- analyze ---------- */
function findings(c){
  var out = [], rows = c.rows, total = c.total;
  if(!total){ out.push({lv:'watch',t:'Add at least one appliance and the agent will start its analysis.'}); return out; }
  var top = rows.slice().sort(function(x,y){ return y.kwh - x.kwh; })[0];
  var share = top.kwh / total * 100;
  if(share >= 35) out.push({lv:'act',t:top.a.name + ' uses ' + nf0.format(share) + '% of your electricity. Fixing it moves the total more than anything else.'});
  var bill = state.bill;
  if(bill > 0){
    var diff = (bill - total) / total * 100;
    if(diff > 15) out.push({lv:'watch',t:'Your latest bill (' + nf0.format(bill) + ' kWh) is ' + nf0.format(bill - total) + ' kWh above what these appliances explain. Check for unlisted loads such as a cooler, iron or induction hob, or longer run times.'});
    else if(diff < -15) out.push({lv:'watch',t:'The appliances add up to ' + nf0.format(total - bill) + ' kWh more than your latest bill. Some run times are probably shorter than entered.'});
    else out.push({lv:'ok',t:'The model is within 15% of your latest bill, so the savings below rest on a realistic baseline.'});
  }
  var always = rows.filter(function(r){ return r.a.hours >= 20; }).reduce(function(s,r){ return s + r.kwh; }, 0);
  if(always / total >= 0.04) out.push({lv:'watch',t:'Devices that run 20 hours or more a day use ' + nf0.format(always) + ' kWh a month (' + nf0.format(always/total*100) + '%), even when nobody is using them.'});
  var old = rows.filter(function(r){ return ['bulb','cfl','tube'].indexOf(r.a.kind) > -1; });
  if(old.length){
    var kk = old.reduce(function(s,r){ return s + r.kwh; }, 0);
    var pts = old.reduce(function(s,r){ return s + r.a.qty; }, 0);
    out.push({lv:'watch',t:pts + ' older light fittings use ' + nf0.format(kk) + ' kWh a month. LED replacements pay back within months.'});
  }
  var ac = rows.filter(function(r){ return r.a.kind === 'ac' && r.a.hours > 8; })[0];
  if(ac) out.push({lv:'watch',t:ac.a.name + ' runs ' + ac.a.hours + ' hours a day. Long cooling hours are the fastest way for a bill to climb.'});
  return out;
}

function renderMeter(total){
  var v = Math.min(999999, Math.round(total * 10));
  var s = String(v); while(s.length < 6) s = '0' + s;
  var html = '';
  for(var i = 0; i < 6; i++){
    var lead = i < 4 && /^0+$/.test(s.slice(0,i+1));
    html += '<span class="d' + (i === 5 ? ' dec' : '') + (lead ? ' lead' : '') + '">' + s[i] + '</span>';
  }
  var m = $('meter');
  m.innerHTML = html;
  m.setAttribute('aria-label', nf1.format(total) + ' kilowatt hours per month');
}

function renderAnalyze(c){
  renderMeter(c.total);
  $('st-cost').textContent = rupee(c.cost);
  $('st-co2').textContent = nf0.format(c.co2);
  $('st-day').textContent = nf1.format(c.total / DAYS);
  var sorted = c.rows.filter(function(r){ return r.kwh > 0; }).sort(function(x,y){ return y.kwh - x.kwh; });
  var max = sorted.length ? sorted[0].kwh : 1;
  $('bars').innerHTML = sorted.length ? sorted.map(function(r){
    var share = c.total ? r.kwh / c.total * 100 : 0;
    return '<li class="bar' + (share >= 35 ? ' big' : '') + '"><div class="bl"><span class="bn">' + esc(nm(r.a)) + '</span><span class="bv">' + nf0.format(r.kwh) + ' kWh · ' + nf0.format(share) + '%</span></div><div class="track"><i style="width:' + (r.kwh / max * 100).toFixed(1) + '%"></i></div></li>';
  }).join('') : '<li class="empty">No load yet. Add an appliance to see the breakdown.</li>';
  var labels = {act:'Act',watch:'Watch',ok:'OK'};
  $('notes').innerHTML = findings(c).map(function(f){
    return '<li><span class="lvl ' + f.lv + '">' + labels[f.lv] + '</span><span>' + esc(f.t) + '</span></li>';
  }).join('');
}

/* ---------- recommend / plan ---------- */
function renderRecs(){
  var recs = view.recs, sel = view.sel;
  $('recs').innerHTML = recs.length ? recs.map(function(r){
    var on = sel.has(r.id);
    return '<li class="rec' + (on ? ' on' : '') + '" data-rid="' + esc(r.id) + '">' +
      '<input type="checkbox" data-rec="' + esc(r.id) + '" aria-label="Adopt: ' + esc(r.title) + '"' + (on ? ' checked' : '') + '>' +
      '<div class="rb"><div class="rt">' + esc(r.title) + '</div><p>' + esc(r.why) + '</p>' +
      '<ul class="chips"><li class="pos">−' + nf0.format(r.kwh) + ' kWh/mo</li><li>' + rupee(r.cost) + '/mo</li><li>' + nf0.format(r.co2) + ' kg CO₂/mo</li><li>' +
      (r.upfront ? rupee(r.upfront) + ' upfront, ' + pb(r.payback) + ' payback' : 'No cost') + '</li></ul></div></li>';
  }).join('') : '<li class="empty">No actions yet. Add appliances with wattage and hours to get recommendations.</li>';
}

function planTotals(){
  var chosen = view.recs.filter(function(r){ return view.sel.has(r.id); });
  var t = {n:chosen.length,kwh:0,cost:0,co2:0,up:0};
  chosen.forEach(function(r){ t.kwh += r.kwh; t.cost += r.cost; t.co2 += r.co2; t.up += r.upfront; });
  return t;
}

function renderPlan(){
  var c = view.c, recs = view.recs, t = planTotals();
  if(!c.total || !recs.length){
    $('plan').innerHTML = '<p class="plan-title">Plan</p><p class="prog-cap">Add appliances to build a plan.</p>';
    return;
  }
  var pct = t.kwh / c.total * 100;
  var need = c.total * state.target / 100;
  var cov = need > 0 ? Math.min(100, t.kwh / need * 100) : 0;
  var msg;
  if(need <= 0) msg = 'Set a reduction goal above to see how far the plan gets you.';
  else if(t.kwh >= need) msg = 'Goal met. A ' + state.target + '% cut means ' + nf0.format(need) + ' kWh a month, and the plan saves ' + nf0.format(t.kwh) + '.';
  else msg = 'Your goal needs ' + nf0.format(need) + ' kWh a month. The plan saves ' + nf0.format(t.kwh) + ', so ' + nf0.format(need - t.kwh) + ' more is needed. ' + (t.n === recs.length ? 'Every available action is adopted, so the rest has to come from how long things run.' : 'Adopt more actions below.');
  $('plan').innerHTML =
    '<div class="plan-top"><div><p class="mini">Your plan</p><p class="plan-title">' + t.n + ' of ' + recs.length + ' actions adopted</p></div>' +
    '<button class="btn ghost" id="autopick" type="button">Auto-pick for my goal</button></div>' +
    '<div class="prog" role="img" aria-label="Plan covers ' + nf0.format(cov) + ' percent of the goal"><i style="width:' + cov.toFixed(1) + '%"></i></div>' +
    '<p class="prog-cap">' + esc(msg) + '</p>' +
    '<dl class="plan-nums">' +
    '<div><dt class="mini">Energy saved</dt><dd class="pos">' + nf0.format(t.kwh) + ' kWh/mo</dd><small>' + nf1.format(pct) + '% of current use</small></div>' +
    '<div><dt class="mini">Bill saved</dt><dd>' + rupee(t.cost) + '/mo</dd><small>' + rupee(t.cost * 12) + ' a year</small></div>' +
    '<div><dt class="mini">CO₂ avoided</dt><dd>' + nf0.format(t.co2 * 12) + ' kg/yr</dd><small>about ' + nf0.format(t.co2 * 12 / KG_PER_TREE) + ' trees’ yearly uptake</small></div>' +
    '<div><dt class="mini">Upfront spend</dt><dd>' + rupee(t.up) + '</dd><small>' + ((t.up && t.cost) ? pb(t.up / t.cost) + ' payback' : 'no spend needed') + '</small></div>' +
    '</dl>';
}

/* ---------- monitor ---------- */
function sortedLog(){ return state.log.slice().sort(function(a,b){ return a.month < b.month ? -1 : (a.month > b.month ? 1 : 0); }); }

function renderChart(L,baseline,planLvl){
  var host = $('chart');
  if(!L.length){ host.innerHTML = '<p class="empty">No readings yet. Log a bill to see it against the model and the plan.</p>'; return; }
  var W = Math.max(280, host.clientWidth || 640), H = 240, pl = 46, pr = 14, pt = 16, pb2 = 30;
  var vmax = Math.max.apply(null, [baseline, planLvl, 1].concat(L.map(function(e){ return e.kwh; }))) * 1.1;
  var steps = [10,20,25,50,100,200,250,500,1000,2000,5000];
  var step = 5000;
  for(var i = 0; i < steps.length; i++){ if(steps[i] * 4 >= vmax){ step = steps[i]; break; } }
  var top = step * 4;
  var y = function(v){ return pt + (1 - v / top) * (H - pt - pb2); };
  var n = L.length, x0 = pl + 22, x1 = W - pr - 22;
  var x = function(k){ return n === 1 ? (pl + W - pr) / 2 : x0 + k * (x1 - x0) / (n - 1); };
  var g = '';
  for(var j = 0; j <= 4; j++){
    var v = step * j;
    g += '<line class="grid" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(v).toFixed(1) + '" y2="' + y(v).toFixed(1) + '"/>' +
         '<text class="ax" x="' + (pl - 8) + '" y="' + (y(v) + 4).toFixed(1) + '" text-anchor="end">' + nf0.format(v) + '</text>';
  }
  g += '<line class="ref base" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(baseline).toFixed(1) + '" y2="' + y(baseline).toFixed(1) + '"/>';
  g += '<line class="ref plan" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(planLvl).toFixed(1) + '" y2="' + y(planLvl).toFixed(1) + '"/>';
  var every = (W / n) < 56 ? 2 : 1;
  L.forEach(function(e,k){
    if((n - 1 - k) % every === 0) g += '<text class="ax" x="' + x(k).toFixed(1) + '" y="' + (H - 9) + '" text-anchor="middle">' + fmtMonthShort(e.month) + '</text>';
  });
  if(n > 1) g += '<polyline class="ln" points="' + L.map(function(e,k){ return x(k).toFixed(1) + ',' + y(e.kwh).toFixed(1); }).join(' ') + '"/>';
  L.forEach(function(e,k){
    var last = k === n - 1;
    g += '<circle class="pt' + (last ? ' last' : '') + '" cx="' + x(k).toFixed(1) + '" cy="' + y(e.kwh).toFixed(1) + '" r="' + (last ? 6 : 4) + '"/>';
    if(n <= 8 || last) g += '<text class="val" x="' + x(k).toFixed(1) + '" y="' + (y(e.kwh) - 11).toFixed(1) + '" text-anchor="middle">' + nf0.format(e.kwh) + '</text>';
  });
  var latest = L[n - 1];
  host.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="Monthly electricity bills in kWh. Latest ' + nf0.format(latest.kwh) + ' in ' + fmtMonth(latest.month) + ', model ' + nf0.format(baseline) + ', plan level ' + nf0.format(planLvl) + '.">' + g + '</svg>';
}

function renderMonitor(){
  var c = view.c, t = planTotals();
  var L = sortedLog();
  var planLvl = Math.max(0, c.total - t.kwh);
  renderChart(L, c.total, planLvl);
  var latest = L[L.length - 1];
  if(latest){
    var diff = latest.kwh - planLvl;
    $('mon-sum').textContent = 'Latest bill: ' + nf0.format(latest.kwh) + ' kWh in ' + fmtMonth(latest.month) + '. The plan level is ' + nf0.format(planLvl) + ' kWh, so you are ' + (diff > 0 ? nf0.format(diff) + ' kWh above it.' : nf0.format(-diff) + ' kWh under it.');
  } else {
    $('mon-sum').textContent = '';
  }
  $('exnote').hidden = !state.logExample;
  $('log-list').innerHTML = L.slice().reverse().map(function(e){
    var d = e.kwh - planLvl;
    return '<li class="lrow"><span class="m">' + fmtMonth(e.month) + '</span><span class="n">' + nf0.format(e.kwh) + ' kWh</span><span class="dl ' + (d > 0 ? 'up' : 'dn') + '" title="Against the plan level">' + (d > 0 ? '+' : '−') + nf0.format(Math.abs(d)) + '</span><button class="del" type="button" data-month="' + esc(e.month) + '" aria-label="Remove ' + fmtMonth(e.month) + ' reading">×</button></li>';
  }).join('');
}

function renderLoop(){
  var c = view.c, recs = view.recs, t = planTotals();
  var top = c.rows.slice().sort(function(x,y){ return y.kwh - x.kwh; })[0];
  var L = sortedLog();
  var steps = [
    ['Observe', state.items.length + ' appliances · ' + nf0.format(c.total) + ' kWh/mo'],
    ['Analyze', (top && c.total) ? top.a.name + ' is ' + nf0.format(top.kwh / c.total * 100) + '% of load' : 'Waiting for appliances'],
    ['Recommend', recs.length + ' actions ranked by payback'],
    ['Plan', t.n + ' adopted · −' + nf1.format(c.total ? t.kwh / c.total * 100 : 0) + '%'],
    ['Monitor', L.length ? L.length + ' bills logged · latest ' + nf0.format(L[L.length - 1].kwh) + ' kWh' : 'No bills logged yet']
  ];
  $('loop').innerHTML = steps.map(function(s){ return '<li><span class="ls">' + s[0] + '</span><span class="lv">' + esc(s[1]) + '</span></li>'; }).join('');
}

/* ---------- rows ---------- */
function renderRows(){
  $('sample-tag').hidden = !state.sample;
  if(!state.items.length){ $('rows').innerHTML = '<p class="empty">No appliances yet. Pick a type below and add it, or load the sample home.</p>'; return; }
  $('rows').innerHTML = state.items.map(function(a){
    var id = esc(a.id);
    return '<div class="row" data-id="' + id + '">' +
      '<div class="c name"><label class="mini" for="n-' + id + '">Appliance</label><input id="n-' + id + '" data-f="name" value="' + esc(a.name) + '"></div>' +
      '<div class="c qty"><label class="mini" for="q-' + id + '">Qty</label><input id="q-' + id + '" data-f="qty" type="number" min="0" step="1" inputmode="numeric" value="' + a.qty + '"></div>' +
      '<div class="c watts"><label class="mini" for="w-' + id + '">Watts</label><input id="w-' + id + '" data-f="watts" type="number" min="0" step="1" inputmode="numeric" value="' + a.watts + '"></div>' +
      '<div class="c hours"><label class="mini" for="h-' + id + '">Hrs/day</label><input id="h-' + id + '" data-f="hours" type="number" min="0" max="24" step="0.1" inputmode="decimal" value="' + a.hours + '"></div>' +
      '<div class="c out"><span class="mini">kWh/mo</span><output>' + nf0.format(base(a)) + '</output></div>' +
      '<button class="del" type="button" data-del="' + id + '" aria-label="Remove ' + esc(a.name) + '">×</button></div>';
  }).join('');
}

/* ---------- update ---------- */
function update(){
  var c = compute();
  var recs = buildRecs(state.items, state);
  var ids = new Set(recs.map(function(r){ return r.id; }));
  var sel = state.manual ? new Set(state.sel.filter(function(id){ return ids.has(id); })) : new Set(autoSelect(recs, c.total, state.target));
  view = {c:c,recs:recs,sel:sel};
  c.rows.forEach(function(r){
    var el = document.querySelector('.row[data-id="' + r.a.id + '"] output');
    if(el) el.textContent = nf0.format(r.kwh);
  });
  renderAnalyze(c);
  renderRecs();
  renderPlan();
  renderMonitor();
  renderLoop();
  save();
}

/* ---------- events ---------- */
[['f-tariff','tariff'],['f-ef','ef'],['f-setpoint','setpoint'],['f-bill','bill'],['f-target','target']].forEach(function(p){
  var el = $(p[0]);
  el.value = state[p[1]];
  el.addEventListener('input', function(){
    var v = num(el.value);
    if(p[1] === 'target') v = Math.min(90, v);
    state[p[1]] = v;
    update();
  });
});

$('rows').addEventListener('input', function(e){
  var t = e.target, row = t.closest('.row');
  if(!row || !t.dataset.f) return;
  var a = state.items.filter(function(x){ return x.id === row.dataset.id; })[0];
  if(!a) return;
  a[t.dataset.f] = t.dataset.f === 'name' ? t.value : num(t.value);
  update();
});
$('rows').addEventListener('click', function(e){
  var b = e.target.closest('[data-del]');
  if(!b) return;
  state.items = state.items.filter(function(x){ return x.id !== b.dataset.del; });
  renderRows();
  update();
});

var addKind = $('add-kind');
addKind.innerHTML = Object.keys(PRESETS).map(function(k){ return '<option value="' + k + '">' + esc(PRESETS[k].label) + '</option>'; }).join('');
$('add').addEventListener('click', function(){
  var k = addKind.value, p = PRESETS[k];
  state.items.push({id:uid(),kind:k,name:p.label,qty:p.qty,watts:p.watts,hours:p.hours});
  renderRows();
  update();
});
$('clear-all').addEventListener('click', function(){
  state.items = []; state.sample = false; state.manual = false; state.sel = [];
  renderRows(); update();
});
$('load-sample').addEventListener('click', function(){
  state.items = sampleItems(); state.sample = true; state.manual = false; state.sel = [];
  renderRows(); update();
});

$('recs').addEventListener('change', function(e){
  var t = e.target;
  if(!t.dataset || !t.dataset.rec) return;
  if(!state.manual){ state.manual = true; state.sel = Array.from(view.sel); }
  var id = t.dataset.rec;
  var set = new Set(state.sel);
  if(t.checked) set.add(id); else set.delete(id);
  state.sel = Array.from(set);
  view.sel = set;
  var li = t.closest('.rec');
  if(li) li.classList.toggle('on', t.checked);
  renderPlan(); renderMonitor(); renderLoop(); save();
});
$('plan').addEventListener('click', function(e){
  if(e.target.id === 'autopick'){ state.manual = false; state.sel = []; update(); }
});

$('log-month').value = new Date().toISOString().slice(0,7);
$('log-form').addEventListener('submit', function(e){
  e.preventDefault();
  var m = $('log-month').value, k = num($('log-kwh').value);
  if(!m || !k){ $('log-msg').textContent = 'Choose a bill month and enter the units on the bill.'; return; }
  $('log-msg').textContent = '';
  if(state.logExample){ state.log = []; state.logExample = false; }
  state.log = state.log.filter(function(x){ return x.month !== m; });
  state.log.push({month:m,kwh:k});
  var L = sortedLog();
  state.bill = L[L.length - 1].kwh;
  $('f-bill').value = state.bill;
  $('log-kwh').value = '';
  update();
});
$('log-list').addEventListener('click', function(e){
  var b = e.target.closest('[data-month]');
  if(!b) return;
  state.log = state.log.filter(function(x){ return x.month !== b.dataset.month; });
  update();
});
$('clear-ex').addEventListener('click', function(){
  state.log = []; state.logExample = false; update();
});

var raf = 0;
window.addEventListener('resize', function(){
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(function(){ if(view.c) renderMonitor(); });
});

renderRows();
update();
})();
