import { post, fmt } from './shared/api';
import { EVAL, EVAL_L, FR, FR_L, SYB, SYB_L, PRESETS, Preset } from './config/eval-datasets';

// Data uji tetap now live in ./config/eval-datasets (thesis benchmark values).
var R: any = {}; // hasil untuk export

var f = fmt;
function setStatus(m: string, t?: string){ var el=document.getElementById('status'); if(el) el.innerHTML='<span class="status '+(t||'info')+'">'+m+'</span>'; }
function bwmOf(p: Preset){return {bestIndex:p.best,worstIndex:p.worst,bestToOthers:p.bo,othersToWorst:p.ow};}

// ===== IV.3.1 CR per preset =====
async function runCR(){
  var rows: any[]=[];
  for(var name in PRESETS){
    var d=await post('/api/pipeline',{matrix:EVAL,bwm:bwmOf(PRESETS[name])});
    rows.push({preset:name,cr:d.bwmCR});
  }
  R.cr=rows;
  var h='<table><thead><tr><th class="l">Preset</th><th>CR</th><th>Status</th></tr></thead><tbody>';
  rows.forEach(function(x){var ok=x.cr<0.1;h+='<tr><td class="l">'+x.preset+'</td><td>'+f(x.cr)+'</td><td class="'+(ok?'good':'bad')+'">'+(ok?'konsisten (&lt;0.1)':'perlu revisi')+'</td></tr>';});
  h+='</tbody></table>';
  document.getElementById('crTable')!.innerHTML=h;
}

// ===== IV.3.2 Spearman (baselines) =====
async function runSpearman(){
  var d=await post('/api/baselines',{matrix:EVAL});
  R.spearman={hybrid:d.hybrid,baselines:d.baselines};
  var h='<table><thead><tr><th class="l">Metode</th><th>&rho; vs Hybrid</th></tr></thead><tbody>';
  h+='<tr><td class="l"><strong>Hybrid (ECWM+TOPSIS)</strong></td><td>1.000 (acuan)</td></tr>';
  d.baselines.forEach(function(b: any){h+='<tr><td class="l">'+b.method+'</td><td>'+f(b.spearman,3)+'</td></tr>';});
  h+='</tbody></table>';
  document.getElementById('spearmanTable')!.innerHTML=h;
}

// ===== IV.3.3 Sensitivitas lambda =====
async function runLambda(){
  var lams=[0,0.3,0.5,0.6,0.7,1.0],rows: any[]=[];
  for(var i=0;i<lams.length;i++){
    var d=await post('/api/pipeline',{matrix:EVAL,lambda:lams[i]});
    rows.push({lam:lams[i],scores:d.topsisScores,winner:EVAL_L[d.ranking[0]]});
  }
  R.lambda=rows;
  var h='<table><thead><tr><th>&lambda;</th>';EVAL_L.forEach(function(l){h+='<th>'+l+'</th>';});h+='<th>Pemenang</th></tr></thead><tbody>';
  rows.forEach(function(x){var mk=(x.lam===0.6)?' style="background:#eef"':'';h+='<tr'+mk+'><td>'+x.lam.toFixed(1)+'</td>';x.scores.forEach(function(s: number){h+='<td>'+f(s,3)+'</td>';});h+='<td><strong>'+x.winner+'</strong></td></tr>';});
  h+='</tbody></table>';
  document.getElementById('lambdaTable')!.innerHTML=h;
}

// ===== IV.4.1 Free-riding (sigmoid vs linear via baselines) =====
async function runFreeride(){
  var d=await post('/api/baselines',{matrix:FR});
  var sig=d.hybrid.rewards, lin=(d.baselines.filter(function(b: any){return /Linear/.test(b.method);})[0]||{}).rewards||[];
  R.freeride={labels:FR_L,sigmoid:sig,linear:lin};
  var h='<table><thead><tr><th class="l">Profil</th><th>Imbalan Sigmoid (ETH)</th><th>Imbalan Linear (ETH)</th></tr></thead><tbody>';
  for(var i=0;i<FR_L.length;i++){var fr=/Free/.test(FR_L[i]);h+='<tr'+(fr?' style="background:#fde8e6"':'')+'><td class="l">'+FR_L[i]+'</td><td>'+f(sig[i],4)+'</td><td>'+f(lin[i],4)+'</td></tr>';}
  h+='</tbody></table>';
  document.getElementById('frTable')!.innerHTML=h;
  var fi=FR_L.findIndex(function(l){return /Free/.test(l);});
  var honestSig=sig.filter(function(_: number,i: number){return i!==fi;}).reduce(function(a: number,b: number){return a+b;},0)/(FR_L.length-1);
  var gapSig=honestSig/(sig[fi]||1e-9), gapLin=(lin.filter(function(_: number,i: number){return i!==fi;}).reduce(function(a: number,b: number){return a+b;},0)/(FR_L.length-1))/(lin[fi]||1e-9);
  document.getElementById('frNote')!.innerHTML='<div class="note">Free-rider menerima imbalan terkecil. Rasio (rata-rata honest : free-rider): <strong>sigmoid &asymp; '+f(gapSig,1)+'&times;</strong> vs <strong>linear &asymp; '+f(gapLin,1)+'&times;</strong> &rarr; sigmoid menekan free-rider jauh lebih tegas (M1, M3).</div>';
}

// ===== IV.4.2 Sybil =====
async function runSybil(){
  var d=await post('/api/pipeline',{matrix:SYB});
  R.sybil={labels:SYB_L,rewards:d.rewards};
  var h='<table><thead><tr><th class="l">Identitas</th><th>Imbalan (ETH)</th></tr></thead><tbody>';
  for(var i=0;i<SYB_L.length;i++){var sy=/Sybil/.test(SYB_L[i]);h+='<tr'+(sy?' style="background:#fde8e6"':'')+'><td class="l">'+SYB_L[i]+'</td><td>'+f(d.rewards[i],4)+'</td></tr>';}
  h+='</tbody></table>';
  document.getElementById('sybilTable')!.innerHTML=h;
  var sIdx: number[]=[],hIdx: number[]=[];SYB_L.forEach(function(l,i){(/Sybil/.test(l)?sIdx:hIdx).push(i);});
  var sybilSum=sIdx.reduce(function(a: number,i: number){return a+d.rewards[i];},0);
  var honestAvg=hIdx.reduce(function(a: number,i: number){return a+d.rewards[i];},0)/hIdx.length;
  var roi=sybilSum/(honestAvg||1e-9);
  document.getElementById('sybilNote')!.innerHTML='<div class="note">Total imbalan '+sIdx.length+' identitas Sybil = <strong>'+f(sybilSum,4)+' ETH</strong>, vs rata-rata 1 penelaah honest = <strong>'+f(honestAvg,4)+' ETH</strong>. ROI Sybil &asymp; <strong class="'+(roi<1?'good':'bad')+'">'+f(roi,2)+'&times;</strong> '+(roi<1?'(&lt;1 &rarr; memecah identitas TIDAK menguntungkan; q4=0 + non-transferable menahan serangan, M4)':'(&ge;1 &rarr; perlu ditinjau)')+'.</div>';
}

// ===== IV.4.3 Decay (multicycle) =====
async function runDecay(){
  var d=await post('/api/multicycle',{numCycles:10});
  R.decay={names:d.reviewerNames,cycles:d.cycles};
  var eveIdx=d.reviewerNames.length-1; // Eve = terakhir (inaktif siklus 3,6,9)
  var h='<table><thead><tr><th>Siklus</th><th>'+d.reviewerNames[eveIdx]+' (saldo SBT)</th><th>Status</th></tr></thead><tbody>';
  d.cycles.forEach(function(c: any){h+='<tr><td>'+c.cycle+'</td><td>'+f(c.sbtBalances[eveIdx],3)+'</td><td>'+(c.eveInactive?'<span class="bad">inaktif</span>':'aktif')+'</td></tr>';});
  h+='</tbody></table>';
  document.getElementById('decayTable')!.innerHTML=h;
  document.getElementById('decayNote')!.innerHTML='<div class="note">Saldo reputasi '+d.reviewerNames[eveIdx]+' turun pada siklus inaktif (peluruhan), lalu pulih saat aktif kembali &rarr; reputasi merepresentasikan kontribusi aktual (M4).</div>';
}

async function runAll(){
  setStatus('Menjalankan seluruh pengujian...','info');
  (document.getElementById('exportBtn') as HTMLButtonElement).disabled=true;
  try{
    await runCR(); await runSpearman(); await runLambda();
    await runFreeride(); await runSybil(); await runDecay();
    R.generatedNote="Data uji tetap; sistem = ECWM+TOPSIS+Sigmoid; default lambda=0.6,k=10,x0=0.5.";
    (document.getElementById('exportBtn') as HTMLButtonElement).disabled=false;
    setStatus('Selesai. Semua section terisi. Klik Export untuk menyimpan hasil.','ok');
  }catch(e: any){setStatus('Error: '+e.message+' (pastikan server jalan: npm run server)','err');}
}

function renderDS(id: string,M: number[][],L: string[]){
  var crit=["q1 (hari)","q2 relevansi","q3 action.","q4 reputasi"];
  var h='<table><thead><tr><th class="l">Penelaah</th>';crit.forEach(function(c){h+='<th>'+c+'</th>';});h+='</tr></thead><tbody>';
  for(var i=0;i<M.length;i++){h+='<tr><td class="l">'+L[i]+'</td>';M[i].forEach(function(v){h+='<td>'+v+'</td>';});h+='</tr>';}
  h+='</tbody></table>';document.getElementById(id)!.innerHTML=h;
}
function renderDatasets(){renderDS('dsEval',EVAL,EVAL_L);renderDS('dsFr',FR,FR_L);renderDS('dsSyb',SYB,SYB_L);}

function exportJSON(){
  var blob=new Blob([JSON.stringify(R,null,2)],{type:'application/json'});
  var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='evaluation-results.json';a.click();
}

// Load-time init (runs after DOM is ready; script is loaded with defer).
window.addEventListener('DOMContentLoaded', function(){ renderDatasets(); });

// Expose functions referenced by inline on* handlers in evaluation.html.
Object.assign(window as any, { runAll, exportJSON });
