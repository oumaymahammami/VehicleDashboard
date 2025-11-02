/* eslint-disable import/no-unresolved, no-undef */
/* global tf, L */

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getDatabase, ref, onValue, set, push, onChildAdded, onChildChanged, get } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyDvJLO80aEtjbRgeojvpahIBMyFw90Qm1U",
  authDomain: "iot-vehicles-d72ac.firebaseapp.com",
  databaseURL: "https://iot-vehicles-d72ac-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "iot-vehicles-d72ac",
  storageBucket: "iot-vehicles-d72ac.appspot.com",
  messagingSenderId: "855471451987",
  appId: "1:855471451987:web:bfb4a34f72efe291083ba6"
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
  console.log('[MAP] initMap:', lat, lon);
  if (!leafletMap) {
    leafletMap = L.map('map').setView([lat, lon], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(leafletMap);
    leafletMarker = L.marker([lat, lon]).addTo(leafletMap).bindPopup('Vehicle Position');
  }
}
function updateMapPosition(lat, lon) {
  console.log('[MAP] updateMapPosition:', lat, lon);
  if (lat == null || lon == null) return;
  if (!leafletMap) initMap(lat, lon);
  if (leafletMarker) leafletMarker.setLatLng([lat, lon]);
  else leafletMarker = L.marker([lat, lon]).addTo(leafletMap).bindPopup('Vehicle Position');
  try { leafletMap.panTo([lat, lon], { animate: true, duration: 0.5 }); } catch (e) { leafletMap.setView([lat, lon], 14); }
}

// Runtime state
const history = [];
let historyLoaded = false; // flag to avoid duplicate onChildAdded during initial load
const externalLed = { green: null, orange: null, red: null };
let showLedDb = false;
let lastVehicleData = null;
let isLocalLedUpdate = false;
let prevLedState = { g: 0, o: 0, r: 0 };

// Helpers
function formatLedVal(v) { if (v === null) return '-'; return v ? '1' : '0'; }
function parseLedValue(v) { if (v === null || v === undefined) return null; if (typeof v === 'number') return v === 1 ? 1 : 0; if (typeof v === 'boolean') return v ? 1 : 0; if (typeof v === 'string') { const s = v.trim().toLowerCase(); if (s === '1' || s === 'true') return 1; if (s === '0' || s === 'false') return 0; const n = Number(s); if (!Number.isNaN(n)) return n === 1 ? 1 : 0; } return 0; }

// Formatting utilities for table cells (mirror KPI formatting)
function fmtLat(v){ return v == null ? '--' : Number(v).toFixed(6); }
function fmtLon(v){ return v == null ? '--' : Number(v).toFixed(6); }
function fmtAlt(v){ return v == null ? '-- m' : Number(v).toFixed(1) + ' m'; }
function fmtTemp(v){ return v == null ? '-- °C' : Number(v).toFixed(1) + ' °C'; }
function fmtHum(v){ return v == null ? '-- %' : Number(v).toFixed(1) + ' %'; }
function fmtTsShort(ts){ return ts ? new Date(ts).toLocaleTimeString() : '--'; }
// Value-only helpers (no unit) for dynamic spans
function fmtAltVal(v){ return v == null ? '--' : Number(v).toFixed(1); }
function fmtTempVal(v){ return v == null ? '--' : Number(v).toFixed(1); }
function fmtHumVal(v){ return v == null ? '--' : Number(v).toFixed(1); }

// Écriture des LEDs en DB en marquant que c'est une mise à jour locale pour éviter de la retraiter
async function writeLedsToDb(g, o, r) {
  console.log('[LED WRITE] writeLedsToDb ->', { g, o, r });
  if (!database) { console.warn('[LED WRITE] no database'); return; }
  isLocalLedUpdate = true;
  try {
    await set(ref(database,'Led_Green'), g);
    await set(ref(database,'Led_Orange'), o);
    await set(ref(database,'Led_Red'), r);
    console.log('[LED WRITE] write successful');
  } catch (e) {
    console.error('[FB] write leds failed', e);
  } finally {
    // Le flag reste vrai pendant un court instant pour couvrir latence des events
    setTimeout(() => { isLocalLedUpdate = false; console.log('[LED WRITE] cleared isLocalLedUpdate'); }, 200);
  }
}

function renderLeds(g, o, r) {
  console.log('[RENDER LEDS] renderLeds:', { g, o, r });
  if (!ledContainer) return;
  const cls = g ? 'green' : o ? 'orange' : r ? 'red' : 'gray';
  ledContainer.innerHTML = `<div class="led ${cls} pulse"></div>`;
}

function computeLedRisk(data) {
  console.log('[RISK] computeLedRisk input:', data);
  let Led_Green = 0, Led_Orange = 0, Led_Red = 0, risk = 'Inconnu';
  if (data.temperature < 35) { Led_Green = 1; risk = 'Faible'; }
  else if (data.temperature < 60) { Led_Orange = 1; risk = 'Moyen'; }
  else { Led_Red = 1; risk = 'Élevé'; }
  console.log('[RISK] computed:', { Led_Green, Led_Orange, Led_Red, risk });
  return { Led_Green, Led_Orange, Led_Red, risk };
}

function mapRiskToLeds(riskLabel) {
  const label = (riskLabel||'').toString().toLowerCase();
  if (label==='faible') return { g:1,o:0,r:0,color:'green',text:'Faible' };
  if (label==='moyen') return { g:0,o:1,r:0,color:'orange',text:'Moyen' };
  if (label==='élevé'||label==='eleve'||label==='éleve') return { g:0,o:0,r:1,color:'red',text:'Élevé' };
  return { g:0,o:0,r:0,color:'var(--muted)',text:'Inconnu' };
}

function pushHistoryPoint(d) { if (!d) return; console.log('[HISTORY] pushHistoryPoint', d); history.unshift({ ...d }); if (history.length > 500) history.pop(); }

// Affichage résumé LEDs DB (display-only)
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
  } catch (e) {
    console.warn('[LED DISPLAY] update failed', e);
  }
}

// Stats
function updateStats() {
  console.log('[STATS] updateStats start');
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
  const highRiskCount = history.filter(h => h.risk === 'Élevé').length; if (highRiskEl) highRiskEl.textContent = highRiskCount || '--';
  const zones = {}; for (const h of history) { if (h.risk !== 'Élevé') continue; const key = `${Number(h.latitude).toFixed(4)},${Number(h.longitude).toFixed(4)}`; zones[key] = (zones[key] || 0) + 1; }
  const zoneEntries = Object.entries(zones).sort((a,b)=> b[1]-a[1]);
  if (zonesTextEl) zonesTextEl.textContent = zoneEntries.slice(0,3).map(z=> `${z[0]} (${z[1]})`).join(', ') || '--';
  if (zonesTableBody) { zonesTableBody.innerHTML = ''; for (const [zone, count] of zoneEntries.slice(0,5)) { const tr = document.createElement('tr'); tr.innerHTML = `<td>${zone}</td><td>${count}</td>`; zonesTableBody.appendChild(tr); } }
  if (lastRefreshedEl) lastRefreshedEl.textContent = new Date().toLocaleTimeString();
  console.log('[STATS] updateStats done');
}

function renderHistoryFromMemory(limit = 10) {
  console.log('[HISTORY] renderHistoryFromMemory limit=', limit);
  if (!tableBody) return;
  tableBody.innerHTML = '';
  const rows = history.slice(0, limit);
  for (const entry of rows) {
    const row = document.createElement('tr');
    row.dataset.timestamp = entry.timestamp || '';
    const tsText = entry.timestamp ? fmtTsShort(entry.timestamp) : '--';
    row.innerHTML = `
    <td><span class="lat">${fmtLat(entry.latitude)}</span></td>
    <td><span class="lon">${fmtLon(entry.longitude)}</span></td>
    <td><span class="alt-val">${fmtAltVal(entry.altitude)}</span><span class="alt-unit"> m</span></td>
    <td><span class="temp-val">${fmtTempVal(entry.temperature)}</span><span class="temp-unit"> °C</span></td>
    <td><span class="hum-val">${fmtHumVal(entry.humidity)}</span><span class="hum-unit"> %</span></td>
    <td class="ts-cell">${tsText}</td>
  `;
    tableBody.appendChild(row);
  }
}

// Insert a single history row at the top of the table (immediate UI update)
function insertHistoryRow(entry) {
  if (!tableBody || !entry) return;
  try {
    const row = document.createElement('tr');
    row.dataset.timestamp = entry.timestamp || '';
    row.innerHTML = `
      <td><span class="lat">${fmtLat(entry.latitude)}</span></td>
      <td><span class="lon">${fmtLon(entry.longitude)}</span></td>
      <td><span class="alt-val">${fmtAltVal(entry.altitude)}</span><span class="alt-unit"> m</span></td>
      <td><span class="temp-val">${fmtTempVal(entry.temperature)}</span><span class="temp-unit"> °C</span></td>
      <td><span class="hum-val">${fmtHumVal(entry.humidity)}</span><span class="hum-unit"> %</span></td>
      <td class="ts-cell">${entry.timestamp ? fmtTsShort(entry.timestamp) : '--'}</td>
    `;
    // Insert at top
    if (tableBody.firstChild) tableBody.insertBefore(row, tableBody.firstChild);
    else tableBody.appendChild(row);
    // Keep max 10 rows
    while (tableBody.rows.length > 10) tableBody.deleteRow(tableBody.rows.length - 1);
  } catch (e) {
    console.warn('[HISTORY] insertHistoryRow failed', e);
  }
}

// Update only the first history row with latest data (dynamic)
function updateFirstHistoryRow(entry) {
  if (!tableBody || !entry) return;
  try {
    const first = tableBody.firstElementChild;
    // If there's an existing first row and it's different, push it down to become the second row
    if (first) {
      const oldTs = first.dataset.timestamp || '';
      const newTs = entry.timestamp || '';
      if (oldTs !== newTs) {
        // Clone the existing first row
        const clone = first.cloneNode(true);
        // Insert clone as second row (after first). If no second row, append.
        if (first.nextSibling) tableBody.insertBefore(clone, first.nextSibling);
        else tableBody.appendChild(clone);
        // Ensure we don't exceed 10 rows
        while (tableBody.rows.length > 10) tableBody.deleteRow(tableBody.rows.length - 1);
      }
    }

    // Now update the first row (or create it if missing)
    const target = tableBody.firstElementChild || document.createElement('tr');
    if (!tableBody.firstElementChild) tableBody.insertBefore(target, tableBody.firstChild);
    target.dataset.timestamp = entry.timestamp || '';
    // Ensure cells exist (create with spans if not)
    if (target.querySelectorAll('td').length < 6) {
      target.innerHTML = `
        <td><span class="lat">${fmtLat(entry.latitude)}</span></td>
        <td><span class="lon">${fmtLon(entry.longitude)}</span></td>
        <td><span class="alt-val">${fmtAltVal(entry.altitude)}</span><span class="alt-unit"> m</span></td>
        <td><span class="temp-val">${fmtTempVal(entry.temperature)}</span><span class="temp-unit"> °C</span></td>
        <td><span class="hum-val">${fmtHumVal(entry.humidity)}</span><span class="hum-unit"> %</span></td>
        <td class="ts-cell">${entry.timestamp ? fmtTsShort(entry.timestamp) : '--'}</td>
      `;
    } else {
      // Update span values for dynamic behaviour
      const latSpan = target.querySelector('.lat'); if (latSpan) latSpan.textContent = fmtLat(entry.latitude);
      const lonSpan = target.querySelector('.lon'); if (lonSpan) lonSpan.textContent = fmtLon(entry.longitude);
      const altVal = target.querySelector('.alt-val'); if (altVal) altVal.textContent = fmtAltVal(entry.altitude);
      const tempVal = target.querySelector('.temp-val'); if (tempVal) tempVal.textContent = fmtTempVal(entry.temperature);
      const humVal = target.querySelector('.hum-val'); if (humVal) humVal.textContent = fmtHumVal(entry.humidity);
      const tsCell = target.querySelector('.ts-cell'); if (tsCell) tsCell.textContent = entry.timestamp ? fmtTsShort(entry.timestamp) : '--';
    }
  } catch (e) { console.warn('[HISTORY] updateFirstHistoryRow failed', e); }
}

// Met à jour toutes les cellules Timestamp toutes les secondes pour afficher l'heure en temps réel
function refreshTableTimestamps() {
  try {
    if (!tableBody) return;
    const rows = tableBody.querySelectorAll('tr');
    rows.forEach(r => {
      const ts = r.dataset.timestamp;
      const cell = r.querySelector('.ts-cell');
      if (!cell) return;
      if (!ts) { cell.textContent = '--'; return; }
      const d = new Date(ts);
      if (isNaN(d.getTime())) { cell.textContent = '--'; return; }
      // afficher HH:MM:SS pour suivi temps réel
      cell.textContent = d.toLocaleTimeString();
    });
  } catch (e) { console.warn('[HISTORY] refreshTableTimestamps failed', e); }
}

// démarrer le rafraîchissement des timestamps toutes les secondes
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

// Model handling
let riskModel=null;
async function loadRiskModel() { if (modelStatusEl) modelStatusEl.textContent = 'Model status: loading...'; try { console.log('[MODEL] loading model'); riskModel = await tf.loadLayersModel('risk_model_tfjs/model.json'); if (modelStatusEl) modelStatusEl.textContent = 'Model loaded'; console.log('[MODEL] model loaded'); } catch (e) { if (modelStatusEl) modelStatusEl.textContent = 'Model status: load failed'; console.error('[MODEL] load failed', e); } }

async function runRiskModel(data){
  if(!riskModel) throw new Error('Model not loaded');
  const input=tf.tensor2d([[Number(data.temperature||0),Number(data.humidity||0),Number(data.altitude||0),Number(data.latitude||0),Number(data.longitude||0)]]);
  const out=riskModel.predict(input);
  const arr=Array.from(await out.data());
  tf.dispose([input,out]);
  return arr;
}

// Simulation
let simLat=36.802495, simLon=10.181157, simTemp=20, simHum=50, simAlt=50, simStep=0;
function generateSimulatedData(){
  simStep++;
  const seasonal=Math.sin(simStep/30)*18;
  const noiseTemp=(Math.random()-0.5)*6;
  const spike=Math.random()<0.2?(20+Math.random()*30):0;
  simTemp=20+seasonal+noiseTemp+spike;

  const driftHum=Math.sin(simStep/50)*8;
  const noiseHum=(Math.random()-0.5)*10;
  simHum=50+driftHum+noiseHum;

  simAlt+=(Math.random()-0.5)*10;
  simLat+=(Math.random()-0.5)*0.0005;
  simLon+=(Math.random()-0.5)*0.0005;

  simTemp=Math.max(-20,Math.min(120,simTemp));
  simHum=Math.max(0,Math.min(100,simHum));
  simAlt=Math.max(0,Math.min(2000,simAlt));

  return { latitude:Number(simLat.toFixed(6)), longitude:Number(simLon.toFixed(6)), temperature:Number(simTemp.toFixed(1)), humidity:Number(simHum.toFixed(1)), altitude:Number(simAlt.toFixed(1)), timestamp:new Date().toISOString() };
}

async function simulateVehicle(interval=2000){
  console.log('[SIM] simulateVehicle start, interval=', interval);
  setInterval(async ()=>{
    const data = generateSimulatedData();
    lastVehicleData = data; // store last
    console.log('[SIM] generated data', data);

    // Update dashboard immediately (local UI) for instant feedback
    try { updateDashboard(data); } catch (e) { console.error('[SIM] updateDashboard failed', e); }

    // Sync vehicle data to Firebase
    if (syncEnabled && database) {
      try {
        console.log('[SIM] writing vehicle_1 to DB');
        // Construire explicitement le payload dans l'ordre souhaité
        const payload = {
          latitude: Number(data.latitude),
          longitude: Number(data.longitude),
          altitude: Number(data.altitude),
          temperature: Number(data.temperature),
          humidity: Number(data.humidity),
          timestamp: data.timestamp || new Date().toISOString()
        };
        await set(ref(database, 'vehicle_1'), payload);
        console.log('[SIM] vehicle_1 write OK');
      } catch (e) {
        console.error('[SIM] set vehicle_1 failed', e);
      }

      try {
        console.log('[SIM] pushing history point');
        const historyRef = ref(database, 'vehicle_history/vehicle_1');
        // Push the same ordered payload to history
        await push(historyRef, {
          latitude: payload.latitude,
          longitude: payload.longitude,
          altitude: payload.altitude,
          temperature: payload.temperature,
          humidity: payload.humidity,
          timestamp: payload.timestamp
        });
        console.log('[SIM] history push OK');
      } catch (e) {
        console.error('[SIM] push history failed', e);
      }
    }
  }, interval);
}

// Firebase listeners
try {
  const connRef = ref(database, '.info/connected');
  onValue(connRef, snap => { const connected = snap && snap.val() === true; if (fbStatusEl) { fbStatusEl.textContent = connected ? 'Firebase: Connected' : 'Firebase: Disconnected'; fbStatusEl.style.color = connected ? 'lightgreen' : 'var(--muted)'; } console.log('[FB] connection state:', connected); });
} catch(e){ console.warn('[FB] .info/connected listen failed', e); }

// Charger l'historique initial une seule fois (depuis la DB) puis activer les handlers incrémentaux
(async function loadInitialHistory(){
  try {
    const snap = await get(ref(database,'vehicle_history/vehicle_1'));
    const data = snap && snap.val();
    if (!data) {
      historyLoaded = true;
      return;
    }
    const keys = Object.keys(data).sort((a,b)=> new Date(data[b].timestamp) - new Date(data[a].timestamp));
    history.length = 0;
    for (const k of keys) {
      const e = data[k];
      history.push({ latitude: e.latitude, longitude: e.longitude, altitude: e.altitude, temperature: e.temperature, humidity: e.humidity, timestamp: e.timestamp });
    }
    // Render first 10
    renderHistoryFromMemory(10);
    historyLoaded = true;
    console.log('[FB] initial history loaded, entries=', history.length);
  } catch (e) { console.warn('[FB] loadInitialHistory failed', e); historyLoaded = true; }
})();

// child listeners (only handle new/changed after initial load)
onChildAdded(ref(database,'vehicle_history/vehicle_1'), (snapshot) => {
  if (!historyLoaded) return; // ignore initial batch
  console.log('[FB] vehicle_history child added');
  const data = snapshot.val();
  if (!data) return;

  // Avoid duplicate by timestamp; if exists, update instead
  const existsIndex = history.findIndex(h => h.timestamp === data.timestamp);
  if (existsIndex !== -1) {
    history[existsIndex] = { ...data };
    // update UI row if present
    const rows = tableBody.querySelectorAll('tr');
    for (const row of rows) {
      if (row.dataset.timestamp === data.timestamp) {
        const latSpan = row.querySelector('.lat'); if (latSpan) latSpan.textContent = fmtLat(data.latitude);
        const lonSpan = row.querySelector('.lon'); if (lonSpan) lonSpan.textContent = fmtLon(data.longitude);
        const altVal = row.querySelector('.alt-val'); if (altVal) altVal.textContent = fmtAltVal(data.altitude);
        const tempVal = row.querySelector('.temp-val'); if (tempVal) tempVal.textContent = fmtTempVal(data.temperature);
        const humVal = row.querySelector('.hum-val'); if (humVal) humVal.textContent = fmtHumVal(data.humidity);
        const tsCell = row.querySelector('.ts-cell'); if (tsCell) tsCell.textContent = data.timestamp ? fmtTsShort(data.timestamp) : '--';
        return;
      }
    }
  }
  // Insert new entry at top of history and UI
  history.unshift({ ...data });
  const row = document.createElement('tr');
  row.dataset.timestamp = data.timestamp || '';
  row.innerHTML = `
    <td><span class="lat">${fmtLat(data.latitude)}</span></td>
    <td><span class="lon">${fmtLon(data.longitude)}</span></td>
    <td><span class="alt-val">${fmtAltVal(data.altitude)}</span><span class="alt-unit"> m</span></td>
    <td><span class="temp-val">${fmtTempVal(data.temperature)}</span><span class="temp-unit"> °C</span></td>
    <td><span class="hum-val">${fmtHumVal(data.humidity)}</span><span class="hum-unit"> %</span></td>
    <td class="ts-cell">${data.timestamp ? fmtTsShort(data.timestamp) : '--'}</td>
  `;
  if (tableBody.firstChild) tableBody.insertBefore(row, tableBody.firstChild);
  else tableBody.appendChild(row);
  // Garder max 10 lignes
  while (tableBody.rows.length > 10) tableBody.deleteRow(tableBody.rows.length - 1);
});

onChildChanged(ref(database,'vehicle_history/vehicle_1'), (snapshot) => {
  if (!historyLoaded) return; // ignore initial batch
  console.log('[FB] vehicle_history child changed');
  const data = snapshot.val();
  if (!data) return;

  // Mettre à jour l'entrée existante dans l'historique
  const existsIndex = history.findIndex(h => h.timestamp === data.timestamp);
  if (existsIndex !== -1) {
    history[existsIndex] = { ...data };
    // Mettre à jour la ligne correspondante du tableau si elle existe
    const rows = tableBody.querySelectorAll('tr');
    for (const row of rows) {
      if (row.dataset.timestamp === data.timestamp) {
        const latSpan = row.querySelector('.lat'); if (latSpan) latSpan.textContent = fmtLat(data.latitude);
        const lonSpan = row.querySelector('.lon'); if (lonSpan) lonSpan.textContent = fmtLon(data.longitude);
        const altVal = row.querySelector('.alt-val'); if (altVal) altVal.textContent = fmtAltVal(data.altitude);
        const tempVal = row.querySelector('.temp-val'); if (tempVal) tempVal.textContent = fmtTempVal(data.temperature);
        const humVal = row.querySelector('.hum-val'); if (humVal) humVal.textContent = fmtHumVal(data.humidity);
        const tsCell = row.querySelector('.ts-cell'); if (tsCell) tsCell.textContent = data.timestamp ? fmtTsShort(data.timestamp) : '--';
        break;
      }
    }
  }
});

// Synchronisation manuelle des données du véhicule (bouton dans l'UI)
document.getElementById('sync-vehicle-data')?.addEventListener('click', async () => {
  if (!database) return;
  console.log('[UI] sync-vehicle-data clicked');
  try {
    const snap = await get(ref(database, 'vehicle_1'));
    const data = snap.val();
    if (!data) { console.warn('[UI] no data found for vehicle_1'); return; }
    console.log('[UI] fetched vehicle data', data);
    // Mettre à jour le tableau de bord avec les données récupérées
    updateDashboard(data);
  } catch (e) {
    console.error('[UI] sync failed', e);
  }
});

// Fonction de mise à jour du tableau de bord (appelée par la simulation et la synchronisation)
async function updateDashboard(data) {
  if (!data) return;
  lastVehicleData = data;
  console.log('[UI] updateDashboard start', data);

  // Show KPIs
  if (kpiTemp) kpiTemp.textContent = data.temperature != null ? data.temperature + ' °C' : '-- °C';
  if (kpiHum) kpiHum.textContent = data.humidity != null ? data.humidity + ' %' : '-- %';
  if (kpiAlt) kpiAlt.textContent = data.altitude != null ? data.altitude + ' m' : '-- m';

  // Last updated timestamp
  if (lastUpdatedEl) lastUpdatedEl.textContent = new Date().toLocaleTimeString();

  // Update map
  if (data.latitude && data.longitude) updateMapPosition(data.latitude, data.longitude);

  // Compute local risk (fallback if model not loaded)
  const computed = computeLedRisk(data);
  const localMap = mapRiskToLeds(computed.risk);
  if (riskLevelEl) {
    riskLevelEl.textContent = localMap.text;
    riskLevelEl.style.color = localMap.color;
  }
  renderLeds(localMap.g, localMap.o, localMap.r);

  // Run AI model if loaded
  if (typeof tf !== 'undefined' && riskModel) {
    try {
      console.log('[MODEL] running prediction');
      const pred = await runRiskModel(data);
      console.log('[MODEL] prediction result', pred);
      if (!pred) return;

      const labels = ['Faible','Moyen','Élevé'];
      if (modelPredEl) modelPredEl.textContent = 'Model: ' + pred.map((p,i)=> `${labels[i]}:${(p*100).toFixed(0)}%`).join(' ');

      // Pick max probability
      let maxIdx = 0;
      for (let i = 1; i < pred.length; i++) if (pred[i] > pred[maxIdx]) maxIdx = i;
      const modelRisk = labels[maxIdx];

      // Map model label to LED & color
      const mapped = mapRiskToLeds(modelRisk);
      if (riskLevelEl) {
        riskLevelEl.textContent = mapped.text;
        riskLevelEl.style.color = mapped.color;
      }
      renderLeds(mapped.g, mapped.o, mapped.r);

      // ✅ Write LEDs to Firebase (single source)
      if (autoUpdateLeds && syncEnabled && database) {
        try {
          console.log('[MODEL] writing leds to DB', mapped);
          await writeLedsToDb(mapped.g, mapped.o, mapped.r);
        } catch (e) {
          console.error('[MODEL] sync leds failed', e);
        }
      }
    } catch (e) {
      console.error('[MODEL] predict failed', e);
    }
  } else if (modelPredEl) {
    modelPredEl.textContent = 'Model: --';
  }

  // History + stats
  pushHistoryPoint({ ...data, risk: computed.risk });
  updateStats();
  // Mettre à jour la première ligne du tableau dynamiquement pour refléter les KPI
  try { updateFirstHistoryRow(data); } catch (e) { console.warn('[UI] updateFirstHistoryRow failed', e); }
  console.log('[UI] updateDashboard done');
}

// Charger le modèle au démarrage
loadRiskModel();

// Démarrer la simulation des données du véhicule
simulateVehicle(5000);
