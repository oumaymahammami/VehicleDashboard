import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getDatabase, ref, onValue, set, push, onChildAdded, onChildChanged, get, query, limitToLast } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

// Firebase config
const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  databaseURL: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
  measurementId: ""
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

// Config
let syncEnabled = true;
let autoUpdateLeds = true;

// DOM elements
const fbStatusEl = document.getElementById('firebase-status');
const tableBody = document.getElementById('table-body');
const ledContainer = document.getElementById('led-container');
const lastUpdatedEl = document.getElementById('last-updated');
const riskLevelEl = document.getElementById('risk-level');
const kpiTemp = document.getElementById('kpi-temp');
const kpiHum = document.getElementById('kpi-hum');
const kpiAlt = document.getElementById('kpi-alt');
const ledDbDisplayEl = document.getElementById('led-db-display');
const toggleAutoLedsBtn = document.getElementById('toggle-auto-leds');
const refreshStatsBtn = document.getElementById('refresh-stats');
const modelPredEl = document.getElementById('model-pred');
const modelStatusEl = document.getElementById('model-status');

// Map state
let leafletMap = null;
let leafletMarker = null;
function initMap(lat, lon) {
  if (!leafletMap) {
    leafletMap = L.map('map').setView([lat, lon], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(leafletMap);
    leafletMarker = L.marker([lat, lon]).addTo(leafletMap).bindPopup('Vehicle Position');
  }
}
function updateMapPosition(lat, lon) {
  if (lat == null || lon == null) return;
  if (!leafletMap) initMap(lat, lon);
  if (leafletMarker) leafletMarker.setLatLng([lat, lon]);
  else leafletMarker = L.marker([lat, lon]).addTo(leafletMap).bindPopup('Vehicle Position');
  try { leafletMap.panTo([lat, lon], { animate: true, duration: 0.5 }); } catch (e) { leafletMap.setView([lat, lon], 14); }
}

// Runtime state
const history = [];
let historyLoaded = false;
const externalLed = { green: null, orange: null, red: null };
let lastVehicleData = null;
let isLocalLedUpdate = false;

// NOUVEAU: Coordonnées de base pour ENSI Manouba + simulation
let simLat = 36.8188; // Latitude ENSI
let simLon = 10.0669; // Longitude ENSI
let simAlt = 60;     // Altitude de base (m)

// Helpers
function formatLedVal(v) { if (v === null) return '-'; return v ? '1' : '0'; }
function fmtLat(v){ return v == null ? '--' : Number(v).toFixed(6); }
function fmtLon(v){ return v == null ? '--' : Number(v).toFixed(6); }
function fmtAlt(v){ return v == null ? '-- m' : Number(v).toFixed(1) + ' m'; }
function fmtTemp(v){ return v == null ? '-- °C' : Number(v).toFixed(1) + ' °C'; }
function fmtHum(v){ return v == null ? '-- %' : Number(v).toFixed(1) + ' %'; }
function fmtTsShort(ts){ return ts ? new Date(ts).toLocaleTimeString() : '--'; }
function fmtAltVal(v){ return v == null ? '--' : Number(v).toFixed(1); }
function fmtTempVal(v){ return v == null ? '--' : Number(v).toFixed(1); }
function fmtHumVal(v){ return v == null ? '--' : Number(v).toFixed(1); }

async function writeLedsToDb(g, o, r) {
  if (!database) { return; }
  isLocalLedUpdate = true;
  const payload = {
    Led_Green: g,
    Led_Orange: o,
    Led_Red: r
  };
  try {
    await set(ref(database,'etat_leds'), payload); 
  } catch (e) {
    console.error('[FB] write leds failed', e);
  } finally {
    setTimeout(() => { isLocalLedUpdate = false; }, 200);
  }
}

function renderLeds(g, o, r) {
  if (!ledContainer) return;
  const cls = g ? 'green' : o ? 'orange' : r ? 'red' : 'gray';
  ledContainer.innerHTML = `<div class="led ${cls} pulse"></div>`;
}

function computeLedRisk(data) {
  let Led_Green = 0, Led_Orange = 0, Led_Red = 0, risk = 'Inconnu';
  if (data.temperature < 35) { Led_Green = 1; risk = 'Faible'; }
  else if (data.temperature < 60) { Led_Orange = 1; risk = 'Moyen'; }
  else { Led_Red = 1; risk = 'Élevé'; }
  return { Led_Green, Led_Orange, Led_Red, risk };
}

function mapRiskToLeds(riskLabel) {
  const label = (riskLabel||'').toString().toLowerCase();
  if (label==='faible') return { g:1,o:0,r:0,color:'green',text:'Faible' };
  if (label==='moyen') return { g:0,o:1,r:0,color:'orange',text:'Moyen' };
  if (label==='élevé'||label==='eleve'||label==='éleve') return { g:0,o:0,r:1,color:'red',text:'Élevé' };
  return { g:0,o:0,r:0,color:'var(--muted)',text:'Inconnu' };
}

function pushHistoryPoint(d) { if (!d) return; history.unshift({ ...d }); if (history.length > 500) history.pop(); }

function updateLedDbDisplay() {
  if (!ledDbDisplayEl) return;
  const g = externalLed.green;
  const o = externalLed.orange;
  const r = externalLed.red;
  if (g === null && o === null && r === null) {
    ledDbDisplayEl.textContent = 'DB: --';
    return;
  }
  try {
    ledDbDisplayEl.textContent = `DB LEDs — Green:${formatLedVal(g)} Orange:${formatLedVal(o)} Red:${formatLedVal(r)}`;
  } catch (e) { console.warn('[LED DISPLAY] update failed', e); }
}

function updateStats() {
  const avgElem = document.getElementById('avg-temp');
  const avgHumElem = document.getElementById('avg-hum');
  const highRiskEl = document.getElementById('high-risk-count');
  const zonesTextEl = document.getElementById('stats-zones');
  const zonesTableBody = document.querySelector('#zones-table tbody');
  const lastRefreshedEl = document.getElementById('stats-last-refreshed');

  const temps = history.filter(h => h.temperature != null).map(h => Number(h.temperature));
  const hums = history.filter(h => h.humidity != null).map(h => Number(h.humidity));
  const avg = arr => arr.length ? (arr.reduce((a,b)=>a+b,0)/arr.length).toFixed(1) : '--';
  const avgTemp = temps.length ? avg(temps) + ' °C' : '-- °C';
  const avgHumVal = hums.length ? avg(hums) + ' %' : '-- %';
  if (avgElem) avgElem.textContent = avgTemp; if (avgHumElem) avgHumElem.textContent = avgHumVal;
  
  const highRiskCount = history.filter(h => h.risk === 'Élevé').length; 
  if (highRiskEl) highRiskEl.textContent = highRiskCount || '--';
  
  const zones = {}; 
  for (const h of history) { 
      if (h.risk !== 'Élevé' || h.latitude == null || h.longitude == null) continue; 
      const key = `${Number(h.latitude).toFixed(4)},${Number(h.longitude).toFixed(4)}`; 
      zones[key] = (zones[key] || 0) + 1; 
  }
  const zoneEntries = Object.entries(zones).sort((a,b)=> b[1]-a[1]);
  if (zonesTextEl) zonesTextEl.textContent = zoneEntries.slice(0,3).map(z=> `${z[0]} (${z[1]})`).join(', ') || '--';
  if (zonesTableBody) { zonesTableBody.innerHTML = ''; for (const [zone, count] of zoneEntries.slice(0,5)) { const tr = document.createElement('tr'); tr.innerHTML = `<td>${zone}</td><td>${count}</td>`; zonesTableBody.appendChild(tr); } }
  if (lastRefreshedEl) lastRefreshedEl.textContent = new Date().toLocaleTimeString();
}

function renderHistoryFromMemory(limit = 10) {
  if (!tableBody) return;
  tableBody.innerHTML = '';
  const rows = history.slice(0, limit);
  for (const entry of rows) {
    const row = document.createElement('tr');
    row.dataset.timestamp = entry.timestamp || '';
    row.dataset.key = entry.key || '';
    const tsText = entry.timestamp ? fmtTsShort(entry.timestamp) : '--';
    const riskMap = mapRiskToLeds(entry.risk);
    
    row.innerHTML = `
    <td><span class="lat">${fmtLat(entry.latitude)}</span></td>
    <td><span class="lon">${fmtLon(entry.longitude)}</span></td>
    <td><span class="alt-val">${fmtAltVal(entry.altitude)}</span><span class="alt-unit"> m</span></td>
    <td><span class="temp-val">${fmtTempVal(entry.temperature)}</span><span class="temp-unit"> °C</span></td>
    <td><span class="hum-val">${fmtHumVal(entry.humidity)}</span><span class="hum-unit"> %</span></td>
    <td style="color:${riskMap.color}; font-weight: 500;">${riskMap.text}</td>
    <td class="ts-cell">${tsText}</td>
    <td><button class="delete-btn" data-key="${entry.key || ''}" style="color: red; background: transparent; border: 1px solid red; border-radius: 4px; cursor: pointer; padding: 2px 6px;">X</button></td>
  `;
    tableBody.appendChild(row);
  }
}

function insertHistoryRow(entry) {
  if (!tableBody || !entry) return;
  try {
    const row = document.createElement('tr');
    row.dataset.timestamp = entry.timestamp || '';
    row.dataset.key = entry.key || '';
    const riskMap = mapRiskToLeds(entry.risk);

    row.innerHTML = `
      <td><span class="lat">${fmtLat(entry.latitude)}</span></td>
      <td><span class="lon">${fmtLon(entry.longitude)}</span></td>
      <td><span class="alt-val">${fmtAltVal(entry.altitude)}</span><span class="alt-unit"> m</span></td>
      <td><span class="temp-val">${fmtTempVal(entry.temperature)}</span><span class="temp-unit"> °C</span></td>
      <td><span class="hum-val">${fmtHumVal(entry.humidity)}</span><span class="hum-unit"> %</span></td>
      <td style="color:${riskMap.color}; font-weight: 500;">${riskMap.text}</td>
      <td class="ts-cell">${entry.timestamp ? fmtTsShort(entry.timestamp) : '--'}</td>
      <td><button class="delete-btn" data-key="${entry.key || ''}" style="color: red; background: transparent; border: 1px solid red; border-radius: 4px; cursor: pointer; padding: 2px 6px;">X</button></td>
    `;
    if (tableBody.firstChild) tableBody.insertBefore(row, tableBody.firstChild);
    else tableBody.appendChild(row);
    while (tableBody.rows.length > 10) tableBody.deleteRow(tableBody.rows.length - 1);
  } catch (e) {
    console.warn('[HISTORY] insertHistoryRow failed', e);
  }
}

function updateFirstHistoryRow(entry) {
  if (!tableBody || !entry) return;
  try {
    const first = tableBody.firstElementChild;
    if (first) {
      const oldTs = first.dataset.timestamp || '';
      const newTs = entry.timestamp || '';
      if (oldTs !== newTs) {
        const clone = first.cloneNode(true);
        if (first.nextSibling) tableBody.insertBefore(clone, first.nextSibling);
        else tableBody.appendChild(clone);
        while (tableBody.rows.length > 10) tableBody.deleteRow(tableBody.rows.length - 1);
      }
    }

    const target = tableBody.firstElementChild || document.createElement('tr');
    if (!tableBody.firstElementChild) tableBody.insertBefore(target, tableBody.firstChild);
    target.dataset.timestamp = entry.timestamp || '';
    target.dataset.key = entry.key || '';
    const riskMap = mapRiskToLeds(entry.risk);

    if (target.querySelectorAll('td').length < 8) {
      target.innerHTML = `
        <td><span class="lat">${fmtLat(entry.latitude)}</span></td>
        <td><span class="lon">${fmtLon(entry.longitude)}</span></td>
        <td><span class="alt-val">${fmtAltVal(entry.altitude)}</span><span class="alt-unit"> m</span></td>
        <td><span class="temp-val">${fmtTempVal(entry.temperature)}</span><span class="temp-unit"> °C</span></td>
        <td><span class="hum-val">${fmtHumVal(entry.humidity)}</span><span class="hum-unit"> %</span></td>
        <td style="color:${riskMap.color}; font-weight: 500;">${riskMap.text}</td>
        <td class="ts-cell">${entry.timestamp ? fmtTsShort(entry.timestamp) : '--'}</td>
        <td><button class="delete-btn" data-key="${entry.key || ''}" style="color: red; background: transparent; border: 1px solid red; border-radius: 4px; cursor: pointer; padding: 2px 6px;">X</button></td>
      `;
    } else {
      const latSpan = target.querySelector('.lat'); if (latSpan) latSpan.textContent = fmtLat(entry.latitude);
      const lonSpan = target.querySelector('.lon'); if (lonSpan) lonSpan.textContent = fmtLon(entry.longitude);
      const altVal = target.querySelector('.alt-val'); if (altVal) altVal.textContent = fmtAltVal(entry.altitude);
      const tempVal = target.querySelector('.temp-val'); if (tempVal) tempVal.textContent = fmtTempVal(entry.temperature);
      const humVal = target.querySelector('.hum-val'); if (humVal) humVal.textContent = fmtHumVal(entry.humidity);
      
      const riskCell = target.querySelectorAll('td')[5]; 
      if(riskCell) {
          riskCell.textContent = riskMap.text;
          riskCell.style.color = riskMap.color;
      }

      const btnCell = target.querySelectorAll('td')[7];
      if (btnCell) {
          const btn = btnCell.querySelector('.delete-btn');
          if (btn) btn.dataset.key = entry.key || '';
          else btnCell.innerHTML = `<button class="delete-btn" data-key="${entry.key || ''}" style="color: red; background: transparent; border: 1px solid red; border-radius: 4px; cursor: pointer; padding: 2px 6px;">X</button>`;
      }
      const tsCell = target.querySelector('.ts-cell'); if (tsCell) tsCell.textContent = entry.timestamp ? fmtTsShort(entry.timestamp) : '--';
    }
  } catch (e) { console.warn('[HISTORY] updateFirstHistoryRow failed', e); }
}

function refreshTableTimestamps() {
  try {
    if (!tableBody) return;
    const rows = tableBody.querySelectorAll('tr');
    rows.forEach(r => {
      const ts = r.dataset.timestamp;
      const cell = r.querySelector('.ts-cell');
      if (!cell || !ts) return;
      const d = new Date(ts);
      if (isNaN(d.getTime())) { cell.textContent = '--'; return; }
      cell.textContent = d.toLocaleTimeString();
    });
  } catch (e) { console.warn('[HISTORY] refreshTableTimestamps failed', e); }
}

setInterval(refreshTableTimestamps, 1000);

// UI bindings
if (toggleAutoLedsBtn){
  toggleAutoLedsBtn.textContent=autoUpdateLeds?'Auto LEDs: On':'Auto LEDs: Off';
  toggleAutoLedsBtn.addEventListener('click', ()=>{
    autoUpdateLeds=!autoUpdateLeds;
    toggleAutoLedsBtn.textContent=autoUpdateLeds?'Auto LEDs: On':'Auto LEDs: Off';
  });
}
if (refreshStatsBtn) refreshStatsBtn.addEventListener('click',()=>{ updateStats(); renderHistoryFromMemory(10); });

if (tableBody) {
    tableBody.addEventListener('click', async (e) => {
        if (e.target && e.target.classList.contains('delete-btn')) {
            const key = e.target.dataset.key;
            if (!key) return;
            
            try {
                const historyEntryRef = ref(database, `histroy_vehicule/${key}`);
                await set(historyEntryRef, null);
                e.target.closest('tr').remove();
                const index = history.findIndex(h => h.key === key);
                if (index > -1) history.splice(index, 1);
                updateStats(); 
            } catch (err) {
                console.error("[DELETE] Échec de la suppression:", err);
            }
        }
    });
}

// Model handling
let riskModel=null;
async function loadRiskModel() { 
    if (modelStatusEl) modelStatusEl.textContent = 'Model status: loading...'; 
    try { 
        riskModel = await tf.loadLayersModel('risk_model_tfjs/model.json'); 
        if (modelStatusEl) modelStatusEl.textContent = 'Model loaded'; 
    } catch (e) { 
        if (modelStatusEl) modelStatusEl.textContent = 'Model status: load failed'; 
        console.error('[MODEL] load failed', e); 
    } 
}

async function runRiskModel(data){
  if(!riskModel) throw new Error('Model not loaded');
  const input=tf.tensor2d([[
      Number(data.temperature||0),
      Number(data.humidity||0),
      Number(data.altitude||0),
      Number(data.latitude||0),
      Number(data.longitude||0)
  ]]);
  const out=riskModel.predict(input);
  const arr=Array.from(await out.data());
  tf.dispose([input,out]);
  return arr;
}

async function saveToFirebaseHistory(data, riskLabel) {
    const payload = {
        temperature: data.temperature != null ? data.temperature : null,
        humidity: data.humidity != null ? data.humidity : null,
        altitude: data.altitude != null ? data.altitude : null,
        latitude: data.latitude != null ? data.latitude : null,
        longitude: data.longitude != null ? data.longitude : null,
        timestamp: data.timestamp || new Date().toISOString(),
        risk: riskLabel 
    };
    
    if (syncEnabled && database) {
        try {
            const historyRef = ref(database, 'histroy_vehicule'); 
            await push(historyRef, payload);
        } catch (e) {
            console.error('[FB] Sauvegarde histroy_vehicule échouée', e);
        }
    }
}

async function deleteHistoryOnStart() {
    try {
        const historyRef = ref(database, 'histroy_vehicule');
        await set(historyRef, null);
        console.log("[FB] Nœud 'histroy_vehicule' supprimé au démarrage.");
    } catch (e) {
        console.error("[FB] Échec de la suppression de l'historique:", e);
    }
}

// Firebase listeners
try {
  const connRef = ref(database, '.info/connected');
  onValue(connRef, snap => { 
      const connected = snap && snap.val() === true; 
      if (fbStatusEl) { 
          fbStatusEl.textContent = connected ? 'Firebase: Connected' : 'Firebase: Disconnected'; 
          fbStatusEl.style.color = connected ? 'lightgreen' : 'var(--muted)'; 
      } 
  });
} catch(e){ console.warn('[FB] .info/connected listen failed', e); }


// CORRIGÉ (2): Écoute le DERNIER AJOUT à la LISTE /historique
try {
    // Crée une requête pour n'écouter que le dernier enfant ajouté
    const liveDataRef = query(ref(database, 'historique'), limitToLast(1));
    
    // MODIFIÉ: Utilise onChildAdded pour réagir aux nouveaux éléments de la liste
    onChildAdded(liveDataRef, (snapshot) => {
        if (!snapshot.exists()) {
            console.warn("[FB] Le nœud 'historique' est vide.");
            return;
        }
        // data est maintenant le NOUVEL objet: {humidity: 15.1, temperature: 26.1, ...}
        const data = snapshot.val(); 
        
        // NOUVEAU: Appliquer une petite variation aux coordonnées simulées
        simLat += (Math.random() - 0.5) * 0.0005;
        simLon += (Math.random() - 0.5) * 0.0005;
        simAlt += (Math.random() - 0.5) * 2;
        if (simAlt < 50) simAlt = 50; // Garder au-dessus du sol
        if (simAlt > 70) simAlt = 70;

        // MODIFIÉ (3): Gère correctement les 0 (zéro) et FUSIONNE les données
        const cleanData = {
            // CORRIGÉ: Recherche data.humidity/temp (de la capture d'écran) OU data.hum/temp
            temperature: data.temperature != null ? data.temperature : (data.temp != null ? data.temp : null),
            humidity: data.humidity != null ? data.humidity : (data.hum != null ? data.hum : null),
            
            // NOUVEAU: Ajout des données simulées
            altitude: Number(simAlt.toFixed(1)),
            latitude: Number(simLat.toFixed(6)),
            longitude: Number(simLon.toFixed(6)),
            
            // Utilise le timestamp de l'appareil s'il existe
            timestamp: data.timestamp ? (new Date(data.timestamp * 1000).toISOString()) : new Date().toISOString()
        };

        updateDashboard(cleanData); 
    });
    console.log("[FB] Écouteur 'historique' (onChildAdded) activé.");
} catch(e) {
    console.error("[FB] Échec de l'écouteur 'historique'", e);
}


(async function loadInitialHistory(){
  
  await deleteHistoryOnStart();
    
  try {
    // CORRIGÉ: Charge l'historique depuis `histroy_vehicule` (pas de changement ici, c'était correct)
    const snap = await get(ref(database,'histroy_vehicule'));
    const data = snap && snap.val();
    if (!data) {
      historyLoaded = true;
      return;
    }
    const keys = Object.keys(data).sort((a,b)=> new Date(data[b].timestamp) - new Date(data[a].timestamp));
    history.length = 0;
    for (const k of keys) {
      const e = data[k];
      history.push({ 
          key: k,
          latitude: e.latitude, 
          longitude: e.longitude, 
          altitude: e.altitude, 
          temperature: e.temperature, 
          humidity: e.humidity, 
          timestamp: e.timestamp,
          risk: e.risk
      });
    }
    renderHistoryFromMemory(10);
    historyLoaded = true;
  } catch (e) { console.warn('[FB] loadInitialHistory failed', e); historyLoaded = true; }
})();

onChildAdded(ref(database,'histroy_vehicule'), (snapshot) => {
  if (!historyLoaded) return; // Ignore le lot initial (déjà chargé par loadInitialHistory)
  const data = snapshot.val();
  if (!data) return;
  const key = snapshot.key;

  // Empêche les doublons si l'écouteur se déclenche avant que 'historyLoaded' ne soit vrai
  const existsIndex = history.findIndex(h => h.key === key);
  if (existsIndex !== -1) return; 

  const entry = { ...data, key: key };
  history.unshift(entry);
  insertHistoryRow(entry);
});

onChildChanged(ref(database,'histroy_vehicule'), (snapshot) => {
  if (!historyLoaded) return;
  const data = snapshot.val();
  if (!data) return;
  const key = snapshot.key;

  const existsIndex = history.findIndex(h => h.key === key);
  const entry = { ...data, key: key };

  if (existsIndex !== -1) {
    history[existsIndex] = entry;
    const rows = tableBody.querySelectorAll('tr');
    for (const row of rows) {
      if (row.dataset.key === key) {
        row.dataset.key = key;
        const latSpan = row.querySelector('.lat'); if (latSpan) latSpan.textContent = fmtLat(data.latitude);
        const lonSpan = row.querySelector('.lon'); if (lonSpan) lonSpan.textContent = fmtLon(data.longitude);
        const altVal = row.querySelector('.alt-val'); if (altVal) altVal.textContent = fmtAltVal(data.altitude);
        const tempVal = row.querySelector('.temp-val'); if (tempVal) tempVal.textContent = fmtTempVal(data.temperature);
        const humVal = row.querySelector('.hum-val'); if (humVal) humVal.textContent = fmtHumVal(data.humidity);

        const riskMap = mapRiskToLeds(data.risk);
        const riskCell = row.querySelectorAll('td')[5]; 
        if(riskCell) {
            riskCell.textContent = riskMap.text;
            riskCell.style.color = riskMap.color;
        }
        const btn = row.querySelector('.delete-btn');
        if (btn) btn.dataset.key = key;
        const tsCell = row.querySelector('.ts-cell'); if (tsCell) tsCell.textContent = data.timestamp ? fmtTsShort(data.timestamp) : '--';
        break;
      }
    }
  }
});

// CORRIGÉ: Le bouton Sync doit aussi lire le DERNIER enfant de la LISTE
document.getElementById('sync-vehicle-data')?.addEventListener('click', async () => {
  if (!database) return;
  try {
    // CORRIGÉ: Utilise query() et limitToLast(1)
    const snap = await get(query(ref(database, 'historique'), limitToLast(1))); 
    if (!snap.exists()) {
        console.warn('[UI] no data found for historique'); return;
    }
    
    // CORRIGÉ: Extrait la donnée de l'enfant
    const listData = snap.val(); // Ceci est un objet ex: { "-Od5x...": { humidity: ... } }
    const firstKey = Object.keys(listData)[0]; // Prend la première (et unique) clé
    const data = listData[firstKey]; // data est {humidity: ..., temperature: ...}

    // MODIFIÉ (3): Gère correctement les 0 (zéro) et FUSIONNE les données
    const cleanData = {
        // CORRIGÉ: Recherche data.humidity/temp (de la capture d'écran) OU data.hum/temp
        temperature: data.temperature != null ? data.temperature : (data.temp != null ? data.temp : null),
        humidity: data.humidity != null ? data.humidity : (data.hum != null ? data.hum : null),

        // NOUVEAU: Ajout des données simulées (valeur actuelle, sans variation)
        altitude: Number(simAlt.toFixed(1)),
        latitude: Number(simLat.toFixed(6)),
        longitude: Number(simLon.toFixed(6)),
        
        // Utilise le timestamp de l'appareil s'il existe
        timestamp: data.timestamp ? (new Date(data.timestamp * 1000).toISOString()) : new Date().toISOString()
    };
    updateDashboard(cleanData);
  } catch (e) {
    console.error('[UI] sync failed', e);
  }
});

async function updateDashboard(data) {
  if (!data) return;
  lastVehicleData = data;

  if (kpiTemp) kpiTemp.textContent = data.temperature != null ? data.temperature + ' °C' : '-- °C';
  if (kpiHum) kpiHum.textContent = data.humidity != null ? data.humidity + ' %' : '-- %';
  if (kpiAlt) kpiAlt.textContent = data.altitude != null ? data.altitude + ' m' : '-- m';
  if (lastUpdatedEl) lastUpdatedEl.textContent = new Date().toLocaleTimeString();
  if (data.latitude && data.longitude) updateMapPosition(data.latitude, data.longitude);

  // Utilise une logique simple si le modèle IA n'est pas chargé
  const computed = computeLedRisk(data);
  const localMap = mapRiskToLeds(computed.risk);
  let riskToSave = localMap.text; // Risque par défaut (simple)

  // Utilise le modèle IA s'il est chargé
  if (typeof tf !== 'undefined' && riskModel) {
    try {
      const pred = await runRiskModel(data);
      if (!pred) return;
      const labels = ['Faible','Moyen','Élevé'];
      if (modelPredEl) modelPredEl.textContent = 'Model: ' + pred.map((p,i)=> `${labels[i]}:${(p*100).toFixed(0)}%`).join(' ');

      let maxIdx = 0;
      for (let i = 1; i < pred.length; i++) if (pred[i] > pred[maxIdx]) maxIdx = i;
      const modelRisk = labels[maxIdx];
      riskToSave = modelRisk; // Met à jour le risque avec la prédiction IA

      const mapped = mapRiskToLeds(modelRisk);
      if (riskLevelEl) {
        riskLevelEl.textContent = mapped.text;
        riskLevelEl.style.color = mapped.color;
      }
      renderLeds(mapped.g, mapped.o, mapped.r);

      // Écrit les LEDs du modèle IA dans Firebase
      if (autoUpdateLeds && syncEnabled && database) {
        try {
          await writeLedsToDb(mapped.g, mapped.o, mapped.r);
        } catch (e) {
          console.error('[MODEL] sync leds failed', e);
        }
      }
    } catch (e) {
      console.error('[MODEL] predict failed', e);
      // Si l'IA échoue, utilise la logique simple
      if (riskLevelEl) {
        riskLevelEl.textContent = localMap.text;
        riskLevelEl.style.color = localMap.color;
      }
      renderLeds(localMap.g, localMap.o, localMap.r);
    }
  } else {
      // Si l'IA n'est pas (encore) chargée, utilise la logique simple
      if (riskLevelEl) {
        riskLevelEl.textContent = localMap.text;
        riskLevelEl.style.color = localMap.color;
      }
      renderLeds(localMap.g, localMap.o, localMap.r);
      if (modelPredEl) modelPredEl.textContent = 'Model: --';
  }

  const dataWithRisk = { ...data, risk: riskToSave };
  pushHistoryPoint(dataWithRisk);
  
  // Sauvegarde dans Firebase
  // Modifié: Ne sauvegarde qu'une fois (l'écouteur onChildAdded s'en occupe)
  // await saveToFirebaseHistory(dataWithRisk, riskToSave); // Optionnel si onChildAdded est rapide
  
  updateStats();
  // Corrigé: Appelle saveToFirebaseHistory ICI, APRÈS que le risque soit déterminé (par IA ou simple)
  // et AVANT que l'UI ne soit mise à jour, pour que l'écouteur onChildAdded ait la priorité
  await saveToFirebaseHistory(dataWithRisk, riskToSave); 
  
  // try { updateFirstHistoryRow(dataWithRisk); } catch (e) { console.warn('[UI] updateFirstHistoryRow failed', e); }
  // Note: updateFirstHistoryRow est désactivé pour laisser onChildAdded gérer l'UI
}

// Init
loadRiskModel();

