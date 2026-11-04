import { fmt, setStatus } from './shared/api';

// === BWM PRESETS (page-specific UI config, not the thesis benchmark) ===
var PRESETS: Record<string, any>={
  balanced:{best:2,worst:3,bo:[1,1,1,2],ow:[2,2,2,1],desc:'Seimbang; reputasi sedikit lebih rendah'},
  accuracy:{best:2,worst:0,bo:[6,2,1,3],ow:[1,3,6,2],desc:'Actionability dominan; waktu paling rendah'},
  speed:{best:0,worst:3,bo:[1,2,3,6],ow:[6,3,2,1],desc:'Respons cepat kritis; reputasi paling rendah'},
  depth:{best:1,worst:0,bo:[6,1,2,3],ow:[1,6,3,2],desc:'Relevansi/kedalaman diutamakan; waktu paling rendah'},
  reputation:{best:3,worst:0,bo:[6,3,2,1],ow:[1,2,3,6],desc:'Rekam jejak paling penting; waktu paling rendah'}
};

function applyPreset(name: string){
  var p=PRESETS[name];
  (document.getElementById('bwm-best') as HTMLSelectElement).value=p.best;
  (document.getElementById('bwm-worst') as HTMLSelectElement).value=p.worst;
  for(var i=0;i<4;i++){(document.getElementById('bo-'+i) as HTMLInputElement).value=p.bo[i];(document.getElementById('ow-'+i) as HTMLInputElement).value=p.ow[i];}
  document.querySelectorAll('.preset').forEach(function(el){el.classList.remove('active');});
  ((window as any).event.target as HTMLElement).classList.add('active');
}
function updateBWMLabels(){}

// === DATA ===
var paperAbstract="This paper proposes a hybrid blockchain incentive mechanism for academic peer review, combining entropy and CRITIC weighting with a best-worst method, TOPSIS ranking, a sigmoid reward function, and a non-transferable soulbound reputation token with exponential decay. The evaluation uses a small sample of reviewers and reports on-chain gas costs.";
var reviewers: any[]=[
  {name:'Reviewer A',q:[3,0,0,5],text:'The TOPSIS ranking approach is sound and the entropy and CRITIC weighting is appropriate. The authors should clarify the choice of sigmoid threshold.'},
  {name:'Reviewer B',q:[7,0,0,3],text:'This paper is good and well written. I recommend acceptance.'},
  {name:'Reviewer C',q:[5,0,0,4],text:'The soulbound token idea for reputation is interesting. The evaluation could be expanded with more scenarios.'},
  {name:'Reviewer D',q:[2,0,0,6],text:'In Section 3.2 the sample size for the entropy weighting is too small; consider increasing the number of reviewers. Equation 4 defining the sigmoid reward is missing a normalization term and should be corrected. Figure 2 lacks axis labels and the decay rate lambda is not justified.'},
  {name:'Reviewer E',q:[4,0,0,2],text:'The blockchain design is relevant. Please define the decay rate and add a baseline comparison.'},
];
var lastPipelineResult: any=null;

function renderMatrix(){
  var grid=document.getElementById('matrixGrid')!;
  var header='<div class="cell header"></div><div class="cell header">Q1: Time (days)</div><div class="cell header">Q2: Relevance (AI)</div><div class="cell header">Q3: Actionability (AI)</div><div class="cell header">Q4: Reputation</div>';
  var rows='';
  for(var i=0;i<reviewers.length;i++){
    rows+='<div class="cell label"><input type="text" value="'+reviewers[i].name+'" data-r="'+i+'" onchange="updateName(this)"></div>';
    for(var j=0;j<4;j++){
      rows+='<div class="cell"><input type="number" step="any" value="'+reviewers[i].q[j]+'" data-r="'+i+'" data-c="'+j+'" onchange="updateCell(this)"></div>';
    }
  }
  grid.innerHTML=header+rows;
}
function updateCell(el: any){reviewers[parseInt(el.dataset.r)].q[parseInt(el.dataset.c)]=parseFloat(el.value)||0;}
function updateName(el: any){reviewers[parseInt(el.dataset.r)].name=el.value;}
function addReviewer(){reviewers.push({name:'Reviewer '+String.fromCharCode(65+reviewers.length),q:[5,0,0,3],text:''});renderMatrix();renderReviews();}
function removeReviewer(){if(reviewers.length>2){reviewers.pop();renderMatrix();renderReviews();}}

// === AI QoS PRE-PROCESSING (q2 relevance, q3 actionability) ===
function renderReviews(){
  var c=document.getElementById('reviewsContainer')!;
  var html='';
  for(var i=0;i<reviewers.length;i++){
    html+='<div style="margin-bottom:8px"><label style="font-size:.72rem;color:var(--muted)">'+reviewers[i].name+' — review text</label>'+
      '<textarea data-r="'+i+'" oninput="updateReviewText(this)" rows="2" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:4px;font-size:.76rem">'+(reviewers[i].text||'')+'</textarea></div>';
  }
  c.innerHTML=html;
}
function updateReviewText(el: any){reviewers[parseInt(el.dataset.r)].text=el.value;}
function onPaperFile(input: any){
  var f=input.files&&input.files[0];if(!f)return;
  var isPdf=/\.pdf$/i.test(f.name)||f.type==='application/pdf';
  setStatus('Reading paper "'+f.name+'"...','info');
  var reader=new FileReader();
  reader.onload=async function(){
    try{
      var body=isPdf?{pdfBase64:reader.result}:{text:reader.result};
      var resp=await fetch('/api/paper',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      var d=await resp.json();if(!resp.ok)throw new Error(d.error||'Failed');
      (document.getElementById('paperText') as HTMLTextAreaElement).value=d.abstract;
      if(d.title)(document.getElementById('journalTitle') as HTMLInputElement).value=d.title;
      setStatus('Extracted from "'+f.name+'" ('+d.fullTextChars+' chars'+(d.usedPdf?', via PDF':'')+'): title + abstract. Review/edit, then Compute q2/q3.','ok');
    }catch(e: any){setStatus('Paper extract error: '+e.message,'err');}
  };
  if(isPdf)reader.readAsDataURL(f);else reader.readAsText(f);
}
async function computeQoS(){
  setStatus('Computing q2/q3 from text via AI...','info');
  try{
    var submissions=reviewers.map(function(r){return {reviewer:r.name,reviewText:r.text||'',daysToSubmit:r.q[0],sbtBalance:r.q[3]};});
    var body={paperText:(document.getElementById('paperText') as HTMLTextAreaElement).value,submissions:submissions};
    var resp=await fetch('/api/qos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    var d=await resp.json();
    if(!resp.ok)throw new Error(d.error||'Failed');
    for(var i=0;i<d.rows.length;i++){reviewers[i].q[1]=d.rows[i].q2;reviewers[i].q[2]=d.rows[i].q3;}
    renderMatrix();
    document.getElementById('qosProvider')!.textContent='Provider: '+d.provider;
    setStatus('q2/q3 computed from text ('+d.provider+'). You can now run the pipeline.','ok');
  }catch(e: any){setStatus('QoS error: '+e.message+' (is the server running?)','err');}
}
async function loadQ4FromChain(){
  setStatus('Reading q4 (reputation) from blockchain...','info');
  try{
    var resp=await fetch('/api/onchain/reputation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({count:reviewers.length})});
    var d=await resp.json();if(!resp.ok)throw new Error(d.error||'Failed');
    for(var i=0;i<reviewers.length&&i<d.effective.length;i++){reviewers[i].q[3]=d.effective[i];}
    renderMatrix();
    setStatus('q4 loaded from chain (effectiveBalance, decayed) — read side of the reputation loop. Re-load after each on-chain execution to see it update.','ok');
  }catch(e: any){setStatus('Load q4 error: '+e.message+' (deploy contracts on the Monitor page first)','err');}
}

// === SIGMOID GRAPH ===
function drawSigmoid(){
  var canvas=document.getElementById('sigmoidCanvas') as HTMLCanvasElement;
  var ctx=canvas.getContext('2d')!;
  var W=canvas.width,H=canvas.height;
  var k=parseFloat((document.getElementById('p-k') as HTMLInputElement).value);
  var x0=parseFloat((document.getElementById('p-x0') as HTMLInputElement).value);
  ctx.clearRect(0,0,W,H);
  // grid
  ctx.strokeStyle='#eee';ctx.lineWidth=1;
  for(var g=0;g<=4;g++){var gy=H-g*(H/4);ctx.beginPath();ctx.moveTo(0,gy);ctx.lineTo(W,gy);ctx.stroke();}
  // x0 line
  ctx.strokeStyle='#ccc';ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(x0*W,0);ctx.lineTo(x0*W,H);ctx.stroke();ctx.setLineDash([]);
  // curve
  ctx.strokeStyle='#1a1a1a';ctx.lineWidth=2.5;ctx.beginPath();
  for(var px=0;px<=W;px++){
    var s=px/W;
    var y=1/(1+Math.exp(-k*(s-x0)));
    var cy=H-y*H;
    if(px===0)ctx.moveTo(px,cy);else ctx.lineTo(px,cy);
  }
  ctx.stroke();
  // labels
  ctx.fillStyle='#666';ctx.font='10px Consolas';
  ctx.fillText('x0='+x0.toFixed(2),x0*W+4,12);
  ctx.fillText('1.0',2,12);ctx.fillText('0.5',2,H/2+4);ctx.fillText('0.0',2,H-4);
  // mark example points
  ctx.fillStyle='var(--accent)';
  var points=[0.2,0.4,0.6,0.8];
  for(var pi=0;pi<points.length;pi++){
    var s=points[pi];var y=1/(1+Math.exp(-k*(s-x0)));
    var cx=s*W,cy=H-y*H;
    ctx.beginPath();ctx.arc(cx,cy,3,0,2*Math.PI);ctx.fill();
  }
}

// === HELPERS ===
function getBWM(){
  return {bestIndex:parseInt((document.getElementById('bwm-best') as HTMLSelectElement).value),worstIndex:parseInt((document.getElementById('bwm-worst') as HTMLSelectElement).value),bestToOthers:[parseInt((document.getElementById('bo-0') as HTMLInputElement).value),parseInt((document.getElementById('bo-1') as HTMLInputElement).value),parseInt((document.getElementById('bo-2') as HTMLInputElement).value),parseInt((document.getElementById('bo-3') as HTMLInputElement).value)],othersToWorst:[parseInt((document.getElementById('ow-0') as HTMLInputElement).value),parseInt((document.getElementById('ow-1') as HTMLInputElement).value),parseInt((document.getElementById('ow-2') as HTMLInputElement).value),parseInt((document.getElementById('ow-3') as HTMLInputElement).value)]};
}

async function checkDeploy(){
  try{var r=await fetch('/api/onchain/audit');if(r.ok){(document.getElementById('onchainBtn') as HTMLButtonElement).disabled=false;var lb=document.getElementById('loadQ4Btn') as HTMLButtonElement;if(lb)lb.disabled=false;document.getElementById('deployWarning')!.textContent='Contracts deployed. Ready.';(document.getElementById('deployWarning') as HTMLElement).style.color='var(--onchain)';return true;}}catch(e){}return false;
}

// === OFF-CHAIN ===
async function runOffchain(){
  setStatus('Running off-chain pipeline...','info');
  try{
    var matrix=reviewers.map(function(r){return r.q.slice();});
    var body={matrix:matrix,bwm:getBWM(),lambda:parseFloat((document.getElementById('p-lambda') as HTMLInputElement).value),gamma:parseFloat((document.getElementById('p-gamma') as HTMLInputElement).value),sigmoid:{k:parseFloat((document.getElementById('p-k') as HTMLInputElement).value),x0:parseFloat((document.getElementById('p-x0') as HTMLInputElement).value)},pool:parseFloat((document.getElementById('p-pool') as HTMLInputElement).value),journalName:(document.getElementById('journalTitle') as HTMLInputElement).value};
    var resp=await fetch('/api/pipeline',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    var d=await resp.json();
    if(!resp.ok)throw new Error(d.error||'Failed');
    lastPipelineResult=body;
    renderResults(d);
    document.getElementById('results')!.classList.remove('hidden');
    document.getElementById('onchainResult')!.classList.add('hidden');
    setStatus('Off-chain pipeline complete. Review below, then execute on-chain.','ok');
  }catch(e: any){setStatus('Error: '+e.message,'err');}
}

// === ON-CHAIN ===
async function runOnchain(){
  if(!lastPipelineResult){setStatus('Run the off-chain pipeline first.','err');return;}
  setStatus('Executing on-chain distribution...','info');
  try{
    var resp=await fetch('/api/onchain/execute',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(lastPipelineResult)});
    var d=await resp.json();
    if(!resp.ok)throw new Error(d.error||'Failed');
    renderOnchainResult(d);
    document.getElementById('onchainResult')!.classList.remove('hidden');
    var msg='On-chain execution complete. Gas: '+Number(d.gasUsed).toLocaleString();
    if(d.comparison){msg+=' | Ranking match: '+(d.comparison.rankingMatch?'Yes':'No')+' | Spearman: '+fmt(d.comparison.rewardCorrelation,3);}
    setStatus(msg,'ok');
  }catch(e: any){setStatus('Error: '+e.message,'err');}
}

// === RENDER ===
function renderResults(d: any){
  var names=reviewers.map(function(r){return r.name;});
  var n=names.length;
  var criteria=['Q1 (Time)','Q2 (Relevance)','Q3 (Actionability)','Q4 (Reputation)'];
  // Normalized
  var html='<table><thead><tr><th>Reviewer</th>';for(var c=0;c<4;c++){html+='<th>'+criteria[c]+'</th>';}html+='</tr></thead><tbody>';
  for(var i=0;i<n;i++){html+='<tr><td><strong>'+names[i]+'</strong></td>';for(var j=0;j<4;j++){html+='<td>'+fmt(d.normalized[i][j],3)+'</td>';}html+='</tr>';}
  html+='</tbody></table>';document.getElementById('normTable')!.innerHTML=html;
  // Weights
  html='<table><thead><tr><th>Criterion</th><th>BWM (Editor)</th><th>ECWM (Data)</th><th>Fused w*</th></tr></thead><tbody>';
  for(var i=0;i<4;i++){html+='<tr><td>'+criteria[i]+'</td><td>'+fmt(d.bwmWeights[i],4)+'</td><td>'+fmt(d.ecwmWeights[i],4)+'</td><td><strong>'+fmt(d.fusedWeights[i],4)+'</strong></td></tr>';}
  html+='</tbody></table><div style="font-size:.72rem;color:var(--muted);margin-top:6px">BWM CR: '+fmt(d.bwmCR,4)+' | Lambda: '+(document.getElementById('p-lambda') as HTMLInputElement).value+' | Gamma: '+(document.getElementById('p-gamma') as HTMLInputElement).value+'</div>';
  document.getElementById('weightTable')!.innerHTML=html;
  var bars='<div style="margin-top:10px">';var maxW=Math.max.apply(null,d.fusedWeights);
  for(var i=0;i<4;i++){var pct=(d.fusedWeights[i]/maxW*100).toFixed(0);bars+='<div class="weight-bar"><span class="wlabel">'+fmt(d.fusedWeights[i],3)+'</span><div class="bar" style="width:'+pct+'%"></div><span style="font-size:.72rem;color:var(--muted);margin-left:6px">'+criteria[i]+'</span></div>';}
  document.getElementById('weightBars')!.innerHTML=bars+'</div>';
  renderEcwmDetail(d);
  // TOPSIS
  html='<table><thead><tr><th>Rank</th><th>Reviewer</th><th>TOPSIS Score (C*)</th></tr></thead><tbody>';
  for(var rank=0;rank<d.ranking.length;rank++){var idx=d.ranking[rank];html+='<tr><td>#'+(rank+1)+'</td><td><strong>'+names[idx]+'</strong></td><td>'+fmt(d.topsisScores[idx],4)+'</td></tr>';}
  html+='</tbody></table>';document.getElementById('topsisTable')!.innerHTML=html;
  // Distribution
  html='<table><thead><tr><th>Rank</th><th>Reviewer</th><th>Score</th><th>Sigmoid</th><th>Share</th><th>Reward (ETH)</th></tr></thead><tbody>';
  for(var rank=0;rank<d.ranking.length;rank++){var idx=d.ranking[rank];html+='<tr><td>#'+(rank+1)+'</td><td><strong>'+names[idx]+'</strong></td><td>'+fmt(d.topsisScores[idx],4)+'</td><td>'+fmt(d.sigmoidValues[idx],4)+'</td><td>'+(d.shares[idx]*100).toFixed(1)+'%</td><td><strong>'+fmt(d.rewards[idx],4)+'</strong></td></tr>';}
  html+='</tbody></table>';document.getElementById('distTable')!.innerHTML=html;
  var ranking=[];for(var i=0;i<d.ranking.length;i++){ranking.push(names[d.ranking[i]]);}
  // document.getElementById('metricsGrid').innerHTML='<div class="metric"><div class="mv">'+fmt(d.bwmCR,4)+'</div><div class="ml">BWM CR</div></div><div class="metric"><div class="mv" style="font-size:.82rem">'+ranking.join(' &gt; ')+'</div><div class="ml">Ranking</div></div>';
  // document.getElementById('metricsGrid').innerHTML='<div class="metric"><div class="mv">'+fmt(d.metrics.gini,3)+'</div><div class="ml">Gini</div></div><div class="metric"><div class="mv">'+fmt(d.metrics.diffRatio,1)+'x</div><div class="ml">Differentiation</div></div><div class="metric"><div class="mv">'+fmt(d.bwmCR,4)+'</div><div class="ml">BWM CR</div></div><div class="metric"><div class="mv" style="font-size:.82rem">'+ranking.join(' &gt; ')+'</div><div class="ml">Ranking</div></div>';

}

function renderEcwmDetail(d: any){
  var box=document.getElementById('ecwmDetail')!;
  if(!d.ecwmDetail){box.innerHTML='';return;}
  var crit=['Q1 (Time)','Q2 (Relevance)','Q3 (Actionability)','Q4 (Reputation)'];
  var e=d.ecwmDetail.entropy,c=d.ecwmDetail.critic,g=d.ecwmDetail.gamma,b=d.ecwmDetail.beta;
  var h='<details style="margin-top:12px"><summary style="cursor:pointer;font-size:.8rem;font-weight:600">ECWM derivation — where the objective weights come from</summary>';
  h+='<p style="font-size:.74rem;color:var(--muted);margin:8px 0 4px"><strong>1. Entropy</strong>: weight &prop; information divergence d<sub>j</sub> = 1 &minus; e<sub>j</sub>, then normalized (ew<sub>j</sub> = d<sub>j</sub>/&Sigma;d).</p>';
  h+='<table><thead><tr><th>Criterion</th><th>Entropy e<sub>j</sub></th><th>Divergence d<sub>j</sub></th><th>ew<sub>j</sub></th></tr></thead><tbody>';
  for(var j=0;j<4;j++){h+='<tr><td>'+crit[j]+'</td><td>'+fmt(e.entropy[j],4)+'</td><td>'+fmt(e.divergence[j],4)+'</td><td><strong>'+fmt(e.weights[j],4)+'</strong></td></tr>';}
  h+='</tbody></table>';
  h+='<p style="font-size:.74rem;color:var(--muted);margin:10px 0 4px"><strong>2. CRITIC</strong>: C<sub>j</sub> = &sigma;<sub>j</sub> &middot; &Sigma;<sub>k</sub>(1&minus;r<sub>jk</sub>) (contrast &times; conflict), then normalized (cw<sub>j</sub> = C<sub>j</sub>/&Sigma;C).</p>';
  h+='<table><thead><tr><th>Criterion</th><th>&sigma;<sub>j</sub></th><th>&Sigma;(1&minus;r<sub>jk</sub>)</th><th>C<sub>j</sub></th><th>cw<sub>j</sub></th></tr></thead><tbody>';
  for(var j=0;j<4;j++){h+='<tr><td>'+crit[j]+'</td><td>'+fmt(c.sigma[j],4)+'</td><td>'+fmt(c.conflict[j],4)+'</td><td>'+fmt(c.info[j],4)+'</td><td><strong>'+fmt(c.weights[j],4)+'</strong></td></tr>';}
  h+='</tbody></table>';
  h+='<p style="font-size:.74rem;color:var(--muted);margin:10px 0 4px"><strong>Correlation r<sub>jk</sub></strong> (drives CRITIC conflict):</p>';
  h+='<table><thead><tr><th></th>';for(var k=0;k<4;k++){h+='<th>'+crit[k].split(' ')[0]+'</th>';}h+='</tr></thead><tbody>';
  for(var j=0;j<4;j++){h+='<tr><td><strong>'+crit[j].split(' ')[0]+'</strong></td>';for(var k=0;k<4;k++){h+='<td>'+fmt(c.correlation[j][k],3)+'</td>';}h+='</tr>';}
  h+='</tbody></table>';
  h+='<p style="font-size:.74rem;color:var(--muted);margin:10px 0 4px"><strong>3. Fusion</strong>: ECWM<sub>j</sub> = &gamma;&middot;ew<sub>j</sub> + &beta;&middot;cw<sub>j</sub>, with &gamma;='+fmt(g,2)+', &beta;='+fmt(b,2)+'.</p>';
  h+='<table><thead><tr><th>Criterion</th><th>ew<sub>j</sub></th><th>cw<sub>j</sub></th><th>'+fmt(g,2)+'&middot;ew + '+fmt(b,2)+'&middot;cw = ECWM<sub>j</sub></th></tr></thead><tbody>';
  for(var j=0;j<4;j++){h+='<tr><td>'+crit[j]+'</td><td>'+fmt(e.weights[j],4)+'</td><td>'+fmt(c.weights[j],4)+'</td><td><strong>'+fmt(d.ecwmDetail.weights[j],4)+'</strong></td></tr>';}
  h+='</tbody></table></details>';
  box.innerHTML=h;
}
function renderOnchainResult(d: any){
  var names=reviewers.map(function(r){return r.name;});
  var html='<table><thead><tr><th>Reviewer</th><th>Score</th><th>ETH</th><th>SBT Minted</th></tr></thead><tbody>';
  for(var i=0;i<names.length;i++){html+='<tr><td><strong>'+names[i]+'</strong></td><td>'+fmt(d.offChain.scores[i],4)+'</td><td>'+fmt(d.onChain.rewards[i],6)+'</td><td>'+fmt(d.onChain.reputation[i],6)+'</td></tr>';}
  html+='</tbody></table>';document.getElementById('onchainTable')!.innerHTML=html;
  var meta='Batch #'+d.batchId+' | Journal: '+(document.getElementById('journalTitle') as HTMLInputElement).value+' | Gas: '+Number(d.gasUsed).toLocaleString();
  if(d.comparison){meta+=' | Ranking match: '+(d.comparison.rankingMatch?'Yes':'No');}
  document.getElementById('onchainMeta')!.textContent=meta;
}

// Init (runs after DOM is ready; script is loaded with defer).
window.addEventListener('DOMContentLoaded', function(){
  (document.getElementById('paperText') as HTMLTextAreaElement).value=paperAbstract;renderReviews();renderMatrix();drawSigmoid();checkDeploy();computeQoS();
});

// Expose functions referenced by inline on* handlers in pipeline.html.
Object.assign(window as any, {
  applyPreset, updateBWMLabels,
  updateCell, updateName, addReviewer, removeReviewer,
  updateReviewText, onPaperFile, computeQoS, loadQ4FromChain,
  drawSigmoid, runOffchain, runOnchain
});
