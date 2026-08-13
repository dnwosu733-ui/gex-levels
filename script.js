// Full-feature static dashboard script

const apiKeyEl = document.getElementById('apiKey');
const symbolEl = document.getElementById('symbol');
const intervalEl = document.getElementById('interval');
const mnqScaleEl = document.getElementById('mnqScale');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusEl = document.getElementById('status');
const gammaFlipEl = document.getElementById('gammaFlip');
const gammaFlipMNQEl = document.getElementById('gammaFlipMNQ');
const callWallsEl = document.getElementById('callWalls');
const putWallsEl = document.getElementById('putWalls');
const allTableBody = document.querySelector('#allTable tbody');
const exportBtn = document.getElementById('exportBtn');
const testAlertBtn = document.getElementById('testAlert');
const underlyingPriceEl = document.getElementById('underlyingPrice');
const topNEl = document.getElementById('topN');

let timer = null;
let lastSnapshot = null;

// Default MNQ mapping
if (!mnqScaleEl.value) mnqScaleEl.value = "0.1";

// Chart.js setup
const gexChart = new Chart(document.getElementById('gexChart'), {
  type:'line',
  data:{ labels:[], datasets:[{ label:'GEX', data:[], borderColor:'#4dd0ff', backgroundColor:'rgba(77,208,255,0.06)' }]},
  options:{ responsive:true, maintainAspectRatio:false }
});

const oiBar = new Chart(document.getElementById('oiBar'), {
  type:'bar',
  data:{ labels:[], datasets:[
    { label:'Call OI', data:[], backgroundColor:'#7ef0a6' },
    { label:'Put OI', data:[], backgroundColor:'#ff9aa2' }
  ]},
  options:{ responsive:true, maintainAspectRatio:false }
});

// Utility
function setStatus(s){ statusEl.textContent = s; }
function formatNum(n){
  if (Math.abs(n)>=1e6) return (n/1e6).toFixed(2)+'M';
  if (Math.abs(n)>=1e3) return (n/1e3).toFixed(1)+'k';
  return n;
}

function safeParseScale(input){
  const t = input.trim();
  if (!isNaN(Number(t))) return strike => strike * Number(t);
  try { return new Function('strike', `return (${t});`); }
  catch { return strike => strike * 0.1; }
}

async function fetchJson(url){
  const res = await fetch(url);
  return res.json();
}

async function getUnderlying(symbol, apiKey){
  const url = `https://api.polygon.io/v1/last/stocks/${symbol}?apiKey=${apiKey}`;
  const j = await fetchJson(url);
  return j?.last?.price ?? null;
}

async function fetchContracts(symbol, apiKey){
  const url = `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${symbol}&limit=1500&apiKey=${apiKey}`;
  const j = await fetchJson(url);
  return j.results ?? [];
}

async function fetchQuote(ticker, apiKey){
  const url = `https://api.polygon.io/v3/quotes/${ticker}?apiKey=${apiKey}`;
  const j = await fetchJson(url);
  return j.results?.[0] ?? null;
}

function computeGammaFlip(gex){
  let cum = 0;
  for (let i=0;i<gex.length;i++){
    const prev = cum;
    cum += gex[i].gex;
    if (Math.sign(prev) !== Math.sign(cum)) return gex[i].strike;
  }
  return gex.reduce((a,b)=>Math.abs(a.gex)<Math.abs(b.gex)?a:b).strike;
}

async function updateOnce(){
  const apiKey = apiKeyEl.value.trim();
  const symbol = symbolEl.value.trim();
  const topN = Number(topNEl.value);

  if (!apiKey){ setStatus('Enter API key'); return; }

  setStatus('Fetching contracts...');
  const contracts = await fetchContracts(symbol, apiKey);
  const expirations = [...new Set(contracts.map(c=>c.expiration_date))].sort();
  const nearest = expirations[0];
  const filtered = contracts.filter(c=>c.expiration_date===nearest);

  setStatus('Fetching quotes...');
  const rows = [];
  for (const c of filtered){
    const q = await fetchQuote(c.ticker, apiKey);
    const strike = Number(c.strike_price);
    const type = c.contract_type;
    const oi = q?.open_interest ?? 0;
    const gamma = q?.greeks?.gamma ?? 0;
    rows.push({ strike, type, oi, gamma, gex: oi * gamma });
  }

  const byStrike = {};
  for (const r of rows){
    if (!byStrike[r.strike]) byStrike[r.strike] = { strike:r.strike, callOI:0, putOI:0, gex:0 };
    if (r.type==='call') byStrike[r.strike].callOI += r.oi;
    else byStrike[r.strike].putOI += r.oi;
    byStrike[r.strike].gex += r.gex;
  }

  const strikes = Object.values(byStrike).sort((a,b)=>a.strike-b.strike);
  const gexArr = strikes.map(s=>({ strike:s.strike, gex:s.gex }));
  const gammaFlip = computeGammaFlip(gexArr);

  const callWalls = strikes.slice().sort((a,b)=>b.callOI-a.callOI).slice(0,topN);
  const putWalls = strikes.slice().sort((a,b)=>b.putOI-a.putOI).slice(0,topN);

  const underlying = await getUnderlying(symbol, apiKey);
  const scale = safeParseScale(mnqScaleEl.value);

  gammaFlipEl.textContent = gammaFlip;
  gammaFlipMNQEl.textContent = scale(gammaFlip).toFixed(4);
  underlyingPriceEl.textContent = underlying?.toFixed(2) ?? '—';

  callWallsEl.innerHTML = callWalls.map(c=>`Strike ${c.strike} → OI ${formatNum(c.callOI)} (MNQ ${scale(c.strike).toFixed(4)})`).join('<br>');
  putWallsEl.innerHTML = putWalls.map(p=>`Strike ${p.strike} → OI ${formatNum(p.putOI)} (MNQ ${scale(p.strike).toFixed(4)})`).join('<br>');

  allTableBody.innerHTML = strikes.map(s=>`
    <tr>
      <td>${s.strike}</td>
      <td>${formatNum(s.callOI)}</td>
      <td>${formatNum(s.putOI)}</td>
      <td>${s.gex.toFixed(4)}</td>
      <td>${scale(s.strike).toFixed(4)}</td>
    </tr>
  `).join('');

  // Charts
  gexChart.data.labels = gexArr.map(s=>s.strike);
  gexChart.data.datasets[0].data = gexArr.map(s=>s.gex);
  gexChart.update();

  const oiSample = strikes.slice().sort((a,b)=>(b.callOI+b.putOI)-(a.callOI+a.putOI)).slice(0,20);
  oiBar.data.labels = oiSample.map(s=>s.strike);
  oiBar.data.datasets[0].data = oiSample.map(s=>s.callOI);
  oiBar.data.datasets[1].data = oiSample.map(s=>s.putOI);
  oiBar.update();

  setStatus(`Updated ${new Date().toLocaleTimeString()}`);
}

function startLoop(){
  const sec = Number(intervalEl.value);
  updateOnce();
  timer = setInterval(updateOnce, sec*1000);
  startBtn.disabled = true;
  stopBtn.disabled = false;
}

function stopLoop(){
  clearInterval(timer);
  timer = null;
  startBtn.disabled = false;
  stopBtn.disabled = true;
}

startBtn.addEventListener('click', startLoop);
stopBtn.addEventListener('click', stopLoop);

exportBtn.addEventListener('click', ()=>{
  if (!lastSnapshot) return;
});

testAlertBtn.addEventListener('click', ()=>{
  new Notification("Test Alert", { body:"Gamma Dashboard alert test" });
});
