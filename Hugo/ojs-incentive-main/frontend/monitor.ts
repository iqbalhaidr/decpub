import { post, fmt, setStatus } from './shared/api';

var autoTimer: any=null;
function shortAddr(a: string){return a?a.slice(0,6)+'...'+a.slice(-4):'--';}

async function get(url: string){var r=await fetch(url);if(!r.ok){var d=await r.json();throw new Error(d.error||'Failed');}return await r.json();}

async function deploy(){
  (document.getElementById('deployBtn') as HTMLButtonElement).disabled=true;
  setStatus('deployStatus','Deploying...','info');
  try{
    var d=await post('/api/onchain/deploy');
    setStatus('deployStatus','Contracts deployed successfully.','ok');
    renderContracts(d.addresses);
    showSections();refresh();startAuto();
  }catch(e: any){setStatus('deployStatus','Error: '+e.message,'err');}
  finally{(document.getElementById('deployBtn') as HTMLButtonElement).disabled=false;}
}

function renderContracts(addr: any){
  document.getElementById('contractInfo')!.innerHTML='<div class="card-grid"><div class="card"><h3>IncentiveEngine</h3><dl class="kv"><dt>Address</dt><dd>'+addr.incentiveEngine+'</dd><dt>Role</dt><dd>Orchestrator</dd></dl></div><div class="card"><h3>ReputationSBT</h3><dl class="kv"><dt>Address</dt><dd>'+addr.reputationSBT+'</dd><dt>Type</dt><dd>Soulbound</dd></dl></div></div>';
}
function showSections(){['liveSection','journalSection','reviewerSection'].forEach(function(id){document.getElementById(id)!.classList.remove('hidden');});}

async function refresh(){
  try{
    var d=await get('/api/onchain/audit');
    renderOverview(d);renderJournals(d.batches);renderReviewers(d.reviewers);
    document.getElementById('lastRefresh')!.textContent='Updated: '+new Date().toLocaleTimeString();
    if(!document.getElementById('contractInfo')!.innerHTML){renderContracts(d.contracts);}
  }catch(e){}
}

function renderOverview(d: any){
  var p=d.params||{};var totalEth=0,totalSBT=0;
  if(d.reviewers){for(var i=0;i<d.reviewers.length;i++){totalEth+=d.reviewers[i].totalEthReward||0;totalSBT+=d.reviewers[i].reputationBalance||0;}}
  document.getElementById('statsGrid')!.innerHTML='<div class="stat"><div class="sv">'+(p.nextBatchId||0)+'</div><div class="sl">Journals</div></div><div class="stat"><div class="sv">'+(d.reviewers?d.reviewers.length:0)+'</div><div class="sl">Reviewers</div></div><div class="stat"><div class="sv">'+fmt(totalEth,3)+'</div><div class="sl">ETH Distributed</div></div><div class="stat"><div class="sv">'+fmt(totalSBT,2)+'</div><div class="sl">SBT Minted</div></div><div class="stat"><div class="sv">'+(d.network?d.network.blockNumber:'--')+'</div><div class="sl">Block #</div></div><div class="stat"><div class="sv">'+(d.network?d.network.chainId:'--')+'</div><div class="sl">Chain ID</div></div>';
}

function renderJournals(batches: any){
  if(!batches||!batches.length){document.getElementById('journalList')!.innerHTML='<div class="empty">No journal distributions yet. Use the Pipeline page to execute.</div>';return;}
  var html='<div class="card"><table><thead><tr><th>Journal</th><th>Escrow</th><th>Reviewers</th><th>Status</th><th>Per-Reviewer</th></tr></thead><tbody>';
  for(var b=0;b<batches.length;b++){
    var batch=batches[b];
    var status=batch.distributed?'<span class="badge ok">Distributed</span>':'Pending';
    var title=batch.journalName||('Batch #'+batch.batchId);
    html+='<tr><td><strong>'+title+'</strong><br><span style="font-size:.68rem;color:var(--muted)">#'+batch.batchId+'</span></td><td>'+fmt(batch.escrowAmount,4)+' ETH</td><td>'+batch.reviewerCount+'</td><td>'+status+'</td>';
    html+='<td style="font-size:.72rem">';
    if(batch.rewards&&batch.rewards.length){for(var r=0;r<batch.rewards.length;r++){html+=shortAddr(batch.rewards[r].reviewer)+': '+fmt(batch.rewards[r].ethReward,4)+' ETH, '+fmt(batch.rewards[r].reputationAmount,4)+' SBT<br>';}}
    html+='</td></tr>';
  }
  html+='</tbody></table></div>';
  document.getElementById('journalList')!.innerHTML=html;
}

function renderReviewers(reviewers: any){
  if(!reviewers||!reviewers.length){document.getElementById('reviewerTable')!.innerHTML='<div class="empty">No reviewer data yet.</div>';return;}
  var html='<div class="card"><table><thead><tr><th>Address</th><th>ETH Earned</th><th>SBT (raw)</th><th>SBT (effective)</th><th>Distributions</th></tr></thead><tbody>';
  for(var i=0;i<reviewers.length;i++){var r=reviewers[i];html+='<tr><td class="mono">'+shortAddr(r.address)+'</td><td>'+fmt(r.totalEthReward,4)+'</td><td>'+fmt(r.reputationBalance,4)+'</td><td>'+fmt(r.effectiveReputation,4)+'</td><td>'+(r.history?r.history.length:0)+'</td></tr>';}
  html+='</tbody></table></div>';
  document.getElementById('reviewerTable')!.innerHTML=html;
}

function toggleAuto(){if((document.getElementById('autoRefresh') as HTMLInputElement).checked){startAuto();}else{stopAuto();}}
function startAuto(){stopAuto();autoTimer=setInterval(refresh,5000);}
function stopAuto(){if(autoTimer){clearInterval(autoTimer);autoTimer=null;}}

window.addEventListener('load',function(){refresh().then(function(){showSections();startAuto();}).catch(function(){});});

// Expose functions referenced by inline on* handlers in monitor.html.
Object.assign(window as any, { deploy, refresh, toggleAuto });
