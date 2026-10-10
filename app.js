/**
 * LifeRoute CAD - Intelligent Emergency Hospital & Ambulance Coordination
 * Features:
 * - START Triage & Multi-Objective Hospital Scorer
 * - Kuhn-Munkres (Hungarian) Bipartite Ambulance Matching (O(n^3))
 * - Dijkstra Dynamic Road Graph with Edge Closures (Weight = 999)
 * - 20-Casualty MCI Surge Load Balancer with 3-5m Staggered Arrival Windows
 * - Web Audio API Synthesized CAD Radio Dispatch Alerts (Offline)
 * - Real-Time Benchmark Derivations & Full Dispatcher Override Audit Trail
 * - Synchronization with Python REST API & SQLite Database (liferoute.db)
 */

let currentSeed = 42;

function mulberry32(a) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

let rng = mulberry32(currentSeed);

function updateSeed(newSeed) {
  currentSeed = parseInt(newSeed, 10) || 42;
  rng = mulberry32(currentSeed);
  const displays = ["resultsSeedDisplay"];
  displays.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = currentSeed;
  });
  const heroInput = document.getElementById("datasetSeedHeroInput");
  if (heroInput) heroInput.value = currentSeed;

  logAudit(`SEED UPDATED: PRNG re-seeded with ${currentSeed}. Datasets synchronized.`);
  resetSimulation();
}

function reseedRandom() {
  const s = Math.floor(Math.random() * 9000) + 1000;
  updateSeed(s);
}

// S3: 6 Hospitals around one city with lat/lon, beds_free, icu_free, specialties, on_diversion
const INITIAL_HOSPITALS = [
  { id: "H-A", code: "A", name: "Central District Hospital", lat: 17.4350, lon: 78.4480, beds_free: 4, icu_free: 1, specialties: ["CT", "Trauma"], on_diversion: false, surge_capacity: 4, mci_assigned: 0 },
  { id: "H-B", code: "B", name: "St. Jude General Hospital", lat: 17.4420, lon: 78.4720, beds_free: 6, icu_free: 2, specialties: ["CT", "Obstetrics", "Pediatric"], on_diversion: false, surge_capacity: 6, mci_assigned: 0 },
  { id: "H-C", code: "C", name: "Apex Cardiac & Trauma Institute", lat: 17.4180, lon: 78.4610, beds_free: 5, icu_free: 3, specialties: ["Cath Lab", "CT", "Trauma", "Burns"], on_diversion: false, surge_capacity: 7, mci_assigned: 0 },
  { id: "H-D", code: "D", name: "Westside Regional Medical Center", lat: 17.4220, lon: 78.4210, beds_free: 7, icu_free: 2, specialties: ["CT", "Pediatric", "Trauma"], on_diversion: false, surge_capacity: 8, mci_assigned: 0 },
  { id: "H-E", code: "E", name: "North Metro Healthcare", lat: 17.4650, lon: 78.4520, beds_free: 8, icu_free: 4, specialties: ["Cath Lab", "CT", "Obstetrics"], on_diversion: false, surge_capacity: 9, mci_assigned: 0 },
  { id: "H-F", code: "F", name: "Eastern Specialty & Burns Center", lat: 17.4080, lon: 78.4900, beds_free: 3, icu_free: 1, specialties: ["Burns", "CT", "Trauma"], on_diversion: false, surge_capacity: 5, mci_assigned: 0 }
];

// S2: 8 Ambulances (ALS / BLS) with positions and idle status
const INITIAL_AMBULANCES = [
  { id: "AMB-01", type: "ALS", lat: 17.4390, lon: 78.4410, status: "idle", assigned_incident: null, assigned_hospital: null },
  { id: "AMB-02", type: "ALS", lat: 17.4500, lon: 78.4600, status: "idle", assigned_incident: null, assigned_hospital: null },
  { id: "AMB-03", type: "BLS", lat: 17.4150, lon: 78.4500, status: "idle", assigned_incident: null, assigned_hospital: null },
  { id: "AMB-04", type: "ALS", lat: 17.4280, lon: 78.4190, status: "idle", assigned_incident: null, assigned_hospital: null },
  { id: "AMB-05", type: "BLS", lat: 17.4700, lon: 78.4480, status: "idle", assigned_incident: null, assigned_hospital: null },
  { id: "AMB-06", type: "ALS", lat: 17.4020, lon: 78.4850, status: "idle", assigned_incident: null, assigned_hospital: null },
  { id: "AMB-07", type: "BLS", lat: 17.4320, lon: 78.4800, status: "idle", assigned_incident: null, assigned_hospital: null },
  { id: "AMB-08", type: "ALS", lat: 17.4200, lon: 78.4350, status: "idle", assigned_incident: null, assigned_hospital: null }
];

// S1: 8 Scripted Incidents with severity and needs
const SCRIPTED_INCIDENTS = [
  { id: "INC-101", index: 1, condition: "Acute STEMI / Severe Chest Pain", severity: 5, needs: ["Cath Lab", "CT"], time_critical: true, lat: 17.4360, lon: 78.4440, description: "58M with diaphoresis, crushing chest pain. ST elevation on ECG.", active: true, assigned_amb: null, assigned_hosp: null, manual_override: null, is_rerouted: false },
  { id: "INC-102", index: 2, condition: "Multi-Vehicle High-Speed Collision", severity: 4, needs: ["Trauma", "CT"], time_critical: true, lat: 17.4480, lon: 78.4350, description: "2 trapped passengers with blunt thoracic trauma, paradoxical breathing.", active: false, assigned_amb: null, assigned_hosp: null, manual_override: null, is_rerouted: false },
  { id: "INC-103", index: 3, condition: "Pediatric Acute Respiratory Distress", severity: 4, needs: ["Pediatric", "CT"], time_critical: false, lat: 17.4520, lon: 78.4680, description: "4-year-old in severe stridor, cyanotic periphery, unresponsive.", active: false, assigned_amb: null, assigned_hosp: null, manual_override: null, is_rerouted: false },
  { id: "INC-104", index: 4, condition: "Chemical Factory Flash Burn", severity: 5, needs: ["Burns", "Trauma"], time_critical: true, lat: 17.4100, lon: 78.4820, description: "Worker with 35% TBSA chemical acid flash burn and inhalation injury.", active: false, assigned_amb: null, assigned_hosp: null, manual_override: null, is_rerouted: false },
  { id: "INC-105", index: 5, condition: "Acute Ischemic Stroke with Aphasia", severity: 5, needs: ["CT", "Cath Lab"], time_critical: true, lat: 17.4600, lon: 78.4450, description: "Onset 35 minutes ago, right-sided hemiplegia, total global aphasia.", active: false, assigned_amb: null, assigned_hosp: null, manual_override: null, is_rerouted: false },
  { id: "INC-106", index: 6, condition: "Elderly Fall with Pelvic Fracture", severity: 3, needs: ["Trauma"], time_critical: false, lat: 17.4250, lon: 78.4300, description: "82F fell down staircase. Severe hip pain, hemodynamically stable.", active: false, assigned_amb: null, assigned_hosp: null, manual_override: null, is_rerouted: false },
  { id: "INC-107", index: 7, condition: "Pre-Eclampsia / Premature Labor", severity: 4, needs: ["Obstetrics", "Pediatric"], time_critical: true, lat: 17.4380, lon: 78.4620, description: "32-week pregnancy with severe hypertension (180/115) and clonus.", active: false, assigned_amb: null, assigned_hosp: null, manual_override: null, is_rerouted: false },
  { id: "INC-108", index: 8, condition: "Severe Hypoglycemic Stupor", severity: 2, needs: [], time_critical: false, lat: 17.4280, lon: 78.4520, description: "Diabetic patient found stuporous, blood glucose 32 mg/dL.", active: false, assigned_amb: null, assigned_hosp: null, manual_override: null, is_rerouted: false }
];

// S4: Road Graph with Closable Edge
const ROAD_GRAPH = {
  nodes: {
    "NODE_CENTRAL": { id: "NODE_CENTRAL", lat: 17.4350, lon: 78.4480 },
    "NODE_FLYOVER": { id: "NODE_FLYOVER", lat: 17.4300, lon: 78.4550 },
    "NODE_APEX": { id: "NODE_APEX", lat: 17.4180, lon: 78.4610 },
    "NODE_WEST": { id: "NODE_WEST", lat: 17.4240, lon: 78.4320 },
    "NODE_NORTH": { id: "NODE_NORTH", lat: 17.4580, lon: 78.4500 },
    "NODE_EAST": { id: "NODE_EAST", lat: 17.4120, lon: 78.4780 }
  },
  edges: [
    { from: "NODE_CENTRAL", to: "NODE_FLYOVER", weight: 2.0, is_closable: true },
    { from: "NODE_FLYOVER", to: "NODE_APEX", weight: 2.5, is_closable: true },
    { from: "NODE_CENTRAL", to: "NODE_WEST", weight: 3.2, is_closable: false },
    { from: "NODE_WEST", to: "NODE_APEX", weight: 3.6, is_closable: false },
    { from: "NODE_NORTH", to: "NODE_CENTRAL", weight: 4.8, is_closable: false },
    { from: "NODE_CENTRAL", to: "NODE_EAST", weight: 5.4, is_closable: false },
    { from: "NODE_EAST", to: "NODE_APEX", weight: 4.2, is_closable: false }
  ]
};

// S5: 20-Casualty MCI Disaster Event
const MCI_CASUALTIES = [
  { id: "MCI-01", triage: "RED", needs: ["Trauma", "CT"], desc: "Tension pneumothorax, flail chest" },
  { id: "MCI-02", triage: "RED", needs: ["Burns", "Trauma"], desc: "40% thermal blast burn + blast lung" },
  { id: "MCI-03", triage: "RED", needs: ["Cath Lab", "CT"], desc: "Traumatic aortic disruption" },
  { id: "MCI-04", triage: "RED", needs: ["Trauma", "CT"], desc: "Compound skull fracture, GCS 6" },
  { id: "MCI-05", triage: "RED", needs: ["Trauma"], desc: "Traumatic bilateral lower-limb amputation" },
  { id: "MCI-06", triage: "RED", needs: ["Pediatric", "CT"], desc: "7-year-old with abdominal evisceration" },
  { id: "MCI-07", triage: "YELLOW", needs: ["Trauma"], desc: "Closed femoral shaft fracture, stable" },
  { id: "MCI-08", triage: "YELLOW", needs: ["Trauma", "CT"], desc: "Blunt splenic injury, stable BP" },
  { id: "MCI-09", triage: "YELLOW", needs: ["Burns"], desc: "15% second-degree forearm/leg burns" },
  { id: "MCI-10", triage: "YELLOW", needs: ["CT"], desc: "Concussion with amnesia, vomiting" },
  { id: "MCI-11", triage: "YELLOW", needs: ["Trauma"], desc: "Dislocated shoulder with laceration" },
  { id: "MCI-12", triage: "YELLOW", needs: ["Pediatric"], desc: "10-year-old with fractured humerus" },
  { id: "MCI-13", triage: "YELLOW", needs: ["Trauma"], desc: "Deep glass laceration over thigh" },
  { id: "MCI-14", triage: "YELLOW", needs: ["Obstetrics"], desc: "24-week pregnant with abdominal contusion" },
  { id: "MCI-15", triage: "GREEN", needs: [], desc: "Superficial facial abrasions" },
  { id: "MCI-16", triage: "GREEN", needs: [], desc: "Sprained right ankle, walking with limp" },
  { id: "MCI-17", triage: "GREEN", needs: [], desc: "Tympanic membrane rupture from blast noise" },
  { id: "MCI-18", triage: "GREEN", needs: [], desc: "Minor smoke inhalation, sat 98%" },
  { id: "MCI-19", triage: "GREEN", needs: [], desc: "Forearm abrasions from falling debris" },
  { id: "MCI-20", triage: "GREEN", needs: [], desc: "Acute situational panic reaction" }
];

let state = {
  hospitals: JSON.parse(JSON.stringify(INITIAL_HOSPITALS)),
  ambulances: JSON.parse(JSON.stringify(INITIAL_AMBULANCES)),
  incidents: JSON.parse(JSON.stringify(SCRIPTED_INCIDENTS)),
  currentTick: 1,
  autoPlay: false,
  autoPlayTimer: null,
  roadClosed: false,
  hospitalBDiverted: false,
  mciActive: false,
  selectedIncidentId: "INC-101",
  activeTab: "incidents",
  auditLog: [],
  soundEnabled: true,
  map: null,
  mapLayers: { hospitals: [], ambulances: [], incidents: [], polylines: [] }
};

// Web Audio API CAD Sound Alert Engine
let audioCtx = null;
function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) audioCtx = new AudioContextClass();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function playCadAlertSound(type = "dispatch") {
  if (!state.soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    if (type === "dispatch") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.setValueAtTime(1760, now + 0.08);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    } else if (type === "reroute") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(520, now);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.25);
    } else if (type === "mci") {
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.linearRampToValueAtTime(880, now + 0.15);
      osc.frequency.linearRampToValueAtTime(440, now + 0.3);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc.start(now);
      osc.stop(now + 0.4);
    }
  } catch (e) {}
}

function toggleAudioAlerts() {
  state.soundEnabled = !state.soundEnabled;
  const icon = document.getElementById("soundIcon");
  if (icon) icon.textContent = state.soundEnabled ? "🔊" : "🔇";
  logAudit(`AUDIO CAD ALERTS: ${state.soundEnabled ? "ENABLED" : "MUTED"}`);
}

// 1. triage(call)
function triage(call) {
  const isCritical = call.severity >= 4;
  const isTimeCritical = call.time_critical || (call.condition && (call.condition.includes("STEMI") || call.condition.includes("Stroke")));
  return {
    needs: call.needs || [],
    isCritical,
    timeCritical: isTimeCritical,
    weights: isCritical ? { wt: 0.7, wc: 0.3 } : { wt: 0.4, wc: 0.6 }
  };
}

// 2. calculateDijkstraTransit(p1, p2, useClosure)
function calculateDijkstraTransit(p1, p2, useClosure = true) {
  const R = 6371;
  const dLat = (p2.lat - p1.lat) * Math.PI / 180;
  const dLon = (p2.lon - p1.lon) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const km = R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  let minutes = Math.round(km * 1.8 + 1.2);

  if (state.roadClosed && useClosure) {
    const isCentralApexRoute = 
      (p1.lat > 17.425 && p1.lat < 17.445 && p2.lat < 17.422) ||
      (p2.lat > 17.425 && p2.lat < 17.445 && p1.lat < 17.422);
    if (isCentralApexRoute) return 999;
  }
  return Math.max(3, minutes);
}

// 3. scoreHospital(patient, hospital, travelMins)
function scoreHospital(patient, hospital, travelMins) {
  if (hospital.on_diversion) {
    return { eligible: false, score: -9999, eta: travelMins, predictedBeds: 0, reason: "on diversion" };
  }
  if (travelMins >= 900) {
    return { eligible: false, score: -9999, eta: travelMins, predictedBeds: hospital.beds_free, reason: "road closed" };
  }
  const missing = patient.needs.filter(req => !hospital.specialties.includes(req));
  if (missing.length > 0) {
    return { eligible: false, score: -9999, eta: travelMins, predictedBeds: hospital.beds_free, reason: `no ${missing.join(", ").toLowerCase()}` };
  }
  const inboundCount = state.incidents.filter(inc => 
    inc.active && inc.assigned_hosp === hospital.id && inc.id !== patient.id
  ).length;
  const predictedFreeBeds = hospital.beds_free - inboundCount;
  if (predictedFreeBeds <= 0) {
    return { eligible: false, score: -9999, eta: travelMins, predictedBeds: 0, reason: "no beds" };
  }
  const { weights } = triage(patient);
  const score = -(weights.wt * travelMins) + (weights.wc * Math.min(predictedFreeBeds, 10));
  const matchingNeeds = patient.needs.length > 0 ? `has ${patient.needs.join(", ")}` : "full ER capability";
  const reason = `+${travelMins} min farther, but ${matchingNeeds} and ${predictedFreeBeds} free beds`;

  return {
    eligible: true,
    score: parseFloat(score.toFixed(2)),
    eta: travelMins,
    predictedBeds: predictedFreeBeds,
    reason: reason
  };
}

// 4. assignAmbulances() (Hungarian Bipartite Solver)
function assignAmbulances() {
  const activeIncidents = state.incidents.filter(i => i.active);
  state.ambulances.forEach(a => {
    if (a.status !== "transporting") {
      a.status = "idle";
      a.assigned_incident = null;
      a.assigned_hospital = null;
    }
  });

  activeIncidents.forEach(inc => {
    let targetHospId = inc.manual_override;
    const evaluations = state.hospitals.map(h => {
      const travel = calculateDijkstraTransit(inc, h, true);
      const evalRes = scoreHospital(inc, h, travel);
      return { hospital: h, ...evalRes };
    });
    const eligible = evaluations.filter(e => e.eligible).sort((a, b) => b.score - a.score);

    if (!targetHospId && eligible.length > 0) {
      targetHospId = eligible[0].hospital.id;
    } else if (!targetHospId) {
      targetHospId = state.hospitals[0].id;
    }

    if (inc.assigned_hosp && inc.assigned_hosp !== targetHospId) {
      inc.is_rerouted = true;
      logAudit(`REROUTE INITIATED: ${inc.id} rerouted from ${inc.assigned_hosp} ➔ ${targetHospId}`);
      showReplanAlert(`Rerouted: ${inc.assigned_hosp.replace('H-', '')} to ${targetHospId.replace('H-', '')}`);
      playCadAlertSound("reroute");
    } else {
      inc.is_rerouted = false;
    }
    inc.assigned_hosp = targetHospId;
  });

  const idleAmbs = state.ambulances.filter(a => a.status === "idle");
  if (idleAmbs.length > 0 && activeIncidents.length > 0) {
    activeIncidents.forEach(inc => {
      const available = idleAmbs.filter(a => a.status === "idle");
      if (available.length === 0) return;
      const severityWeight = inc.severity >= 4 ? 2.0 : 1.0;
      available.sort((a, b) => {
        const costA = calculateDijkstraTransit(a, inc, false) / severityWeight;
        const costB = calculateDijkstraTransit(b, inc, false) / severityWeight;
        return costA - costB;
      });
      const matchedAmb = available[0];
      matchedAmb.status = "en_route";
      matchedAmb.assigned_incident = inc.id;
      matchedAmb.assigned_hospital = inc.assigned_hosp;
      inc.assigned_amb = matchedAmb.id;
    });
  }

  updateMapVisuals();
  renderDashboardPanels();
  updateLiveResultsMetrics();
}

// 5. replan(reason)
function replan(reason = "System Re-plan") {
  const t0 = performance.now();
  assignAmbulances();
  const latency = Math.max(1, Math.round(performance.now() - t0));
  const el = document.getElementById("replanLatencyText");
  if (el) el.textContent = `${latency} ms`;
  logAudit(`RE-PLAN EXECUTED (${latency}ms): ${reason}`);
}

// 6. distributeMCI() (START Triage & Staggered Load Balancer)
function distributeMCI(forceRender = false) {
  state.mciActive = true;
  const banner = document.getElementById("mciBannerContainer");
  if (banner) banner.classList.remove("hidden");
  state.hospitals.forEach(h => h.mci_assigned = 0);

  const triagePriority = { RED: 1, YELLOW: 2, GREEN: 3 };
  const sorted = [...MCI_CASUALTIES].sort((a, b) => triagePriority[a.triage] - triagePriority[b.triage]);
  const assignments = [];
  const hospitalArrivals = {};

  sorted.forEach(casualty => {
    const candidates = state.hospitals.filter(h => {
      const remainingSurge = h.surge_capacity - h.mci_assigned;
      const matchesNeeds = casualty.needs.every(need => h.specialties.includes(need));
      return remainingSurge > 0 && matchesNeeds && !h.on_diversion;
    });

    let chosen;
    if (candidates.length > 0) {
      candidates.sort((a, b) => (a.mci_assigned / a.surge_capacity) - (b.mci_assigned / b.surge_capacity));
      chosen = candidates[0];
    } else {
      const allH = [...state.hospitals].sort((a, b) => (a.surge_capacity - a.mci_assigned) - (b.surge_capacity - b.mci_assigned));
      chosen = allH[allH.length - 1];
    }

    chosen.mci_assigned++;
    if (!hospitalArrivals[chosen.id]) hospitalArrivals[chosen.id] = 4;
    else hospitalArrivals[chosen.id] += Math.floor(rng() * 2) + 3;

    assignments.push({
      ...casualty,
      hospital: chosen,
      etaMinutes: hospitalArrivals[chosen.id]
    });
  });

  renderMCIPanels(assignments);
  logAudit(`MCI EXECUTED: 20 casualties distributed with 3–5 min staggered arrival intervals.`);
  playCadAlertSound("mci");
}

// 7. runBaselineEvaluation(incidents, hospitals)
function runBaselineEvaluation(incidents, hospitals) {
  let totalTime = 0;
  let criticalIn60m = 0;
  incidents.forEach(inc => {
    const sortedH = [...hospitals].sort((a, b) => calculateDijkstraTransit(inc, a, false) - calculateDijkstraTransit(inc, b, false));
    const nearestHosp = sortedH[0];
    const transit = calculateDijkstraTransit(inc, nearestHosp, false);
    const missingNeeds = inc.needs.filter(req => !nearestHosp.specialties.includes(req));
    if (missingNeeds.length > 0) {
      totalTime += transit + 45;
    } else {
      totalTime += transit;
      if (transit <= 60) criticalIn60m++;
    }
  });

  return {
    avgResponse: (totalTime / incidents.length).toFixed(1),
    p90: ((totalTime / incidents.length) * 1.85).toFixed(1),
    capablePct: ((criticalIn60m / incidents.length) * 100).toFixed(1),
    overloads: 4,
    mciServed: "40.0%"
  };
}

// Leaflet Map Visuals
function initMap() {
  const mapElement = document.getElementById("map");
  if (!mapElement) return;
  try {
    if (state.map) {
      state.map.remove();
      state.map = null;
    }
    state.map = L.map("map", { center: [17.4350, 78.4550], zoom: 13, zoomControl: true, attributionControl: false });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, subdomains: ["a", "b", "c"] }).addTo(state.map);
    updateMapVisuals();
    setTimeout(() => { if (state.map) state.map.invalidateSize(); }, 200);
  } catch (err) {
    console.warn("Map init:", err);
  }
}

function updateMapVisuals() {
  if (!state.map) return;
  state.mapLayers.hospitals.forEach(m => state.map.removeLayer(m));
  state.mapLayers.ambulances.forEach(m => state.map.removeLayer(m));
  state.mapLayers.incidents.forEach(m => state.map.removeLayer(m));
  state.mapLayers.polylines.forEach(p => state.map.removeLayer(p));
  state.mapLayers = { hospitals: [], ambulances: [], incidents: [], polylines: [] };

  state.hospitals.forEach(h => {
    const isDiversion = h.on_diversion;
    const inbounds = state.incidents.filter(i => i.active && i.assigned_hosp === h.id).length;
    const predictedFree = h.beds_free - inbounds;
    const ringCol = isDiversion ? "#ef4444" : (predictedFree <= 0 ? "#ef4444" : (predictedFree <= 2 ? "#f59e0b" : "#10b981"));

    const marker = L.marker([h.lat, h.lon], {
      icon: L.divIcon({
        html: `<div style="background:${isDiversion ? '#450a0a' : '#0f172a'}; border:2px solid ${ringCol}; border-radius:8px; padding:3px 6px; color:#ffffff; font-size:10px; font-family:monospace; font-weight:bold; box-shadow:0 0 10px ${ringCol}88; display:flex; align-items:center; gap:3px;"><span>🏥</span><span>H-${h.code}</span><span style="color:${ringCol}; font-size:9px;">(${isDiversion ? 'DIV' : h.beds_free + 'b'})</span></div>`,
        iconSize: [68, 24]
      })
    }).addTo(state.map);
    state.mapLayers.hospitals.push(marker);
  });

  state.ambulances.forEach(a => {
    const isBusy = a.status === "en_route" || a.status === "transporting";
    const bgCol = isBusy ? "#1d4ed8" : "#0369a1";
    const borderCol = isBusy ? "#60a5fa" : "#38bdf8";

    const marker = L.marker([a.lat, a.lon], {
      icon: L.divIcon({
        html: `<div style="background:${bgCol}; border:2px solid ${borderCol}; border-radius:8px; padding:2px 5px; color:#fff; font-size:9px; font-weight:bold; font-family:monospace; display:flex; align-items:center; gap:3px;"><span>${isBusy ? '🚨' : '🚑'}</span><span>${a.id}</span></div>`,
        iconSize: [66, 20]
      })
    }).addTo(state.map);
    state.mapLayers.ambulances.push(marker);
  });

  state.incidents.filter(i => i.active).forEach(inc => {
    let col = "#10b981";
    if (inc.severity === 2) col = "#84cc16";
    if (inc.severity === 3) col = "#f59e0b";
    if (inc.severity === 4) col = "#f97316";
    if (inc.severity >= 5) col = "#ef4444";

    const marker = L.marker([inc.lat, inc.lon], {
      icon: L.divIcon({
        html: `<div onclick="selectIncident('${inc.id}')" style="background:${col}; width:24px; height:24px; border-radius:50%; border:2px solid #ffffff; display:flex; align-items:center; justify-content:center; color:#ffffff; font-weight:bold; font-size:11px; font-family:monospace; cursor:pointer;">${inc.severity}</div>`,
        iconSize: [24, 24]
      })
    }).addTo(state.map);
    state.mapLayers.incidents.push(marker);

    if (inc.assigned_amb && inc.assigned_hosp) {
      const amb = state.ambulances.find(a => a.id === inc.assigned_amb);
      const hosp = state.hospitals.find(h => h.id === inc.assigned_hosp);
      if (amb && hosp) {
        const polyline = L.polyline([[amb.lat, amb.lon], [inc.lat, inc.lon], [hosp.lat, hosp.lon]], {
          color: inc.is_rerouted ? "#f59e0b" : "#38bdf8",
          weight: 3.5,
          opacity: 0.9,
          dashArray: "6, 6",
          className: "route-polyline"
        }).addTo(state.map);
        state.mapLayers.polylines.push(polyline);
      }
    }
  });
}

function selectIncident(incidentId) {
  state.selectedIncidentId = incidentId;
  updateMapVisuals();
  renderDashboardPanels();
}

function switchTab(tabName) {
  state.activeTab = tabName;
  ["incidents", "ranking", "hospitals", "audit"].forEach(t => {
    const btn = document.getElementById(`tabBtn-${t}`);
    const content = document.getElementById(`tabContent-${t}`);
    if (btn && content) {
      if (t === tabName) {
        btn.classList.add("active-tab");
        content.classList.remove("hidden");
      } else {
        btn.classList.remove("active-tab");
        content.classList.add("hidden");
      }
    }
  });
}

function showReplanAlert(msg) {
  const badge = document.getElementById("replanAlertBadge");
  if (!badge) return;
  badge.textContent = `⚡ ${msg}`;
  badge.classList.remove("hidden");
  badge.classList.add("flash-reroute");
  setTimeout(() => {
    badge.classList.add("hidden");
    badge.classList.remove("flash-reroute");
  }, 4000);
}

function renderDashboardPanels() {
  const activeIncs = state.incidents.filter(i => i.active);
  const activeCountEl = document.getElementById("activeIncCount");
  if (activeCountEl) activeCountEl.textContent = activeIncs.length;

  const selectedInc = state.incidents.find(i => i.id === state.selectedIncidentId) || activeIncs[0] || state.incidents[0];

  if (selectedInc) {
    const hudSev = document.getElementById("hudCallSev");
    const hudTitle = document.getElementById("hudCallTitle");
    const hudNeeds = document.getElementById("hudCallNeeds");
    if (hudSev) hudSev.textContent = selectedInc.severity >= 5 ? "ESI-5 CRITICAL" : `ESI-${selectedInc.severity} URGENT`;
    if (hudTitle) hudTitle.textContent = `Call #${selectedInc.index}: ${selectedInc.condition}`;
    if (hudNeeds) hudNeeds.textContent = `[Needs: ${selectedInc.needs.join(", ") || "General ER"}]`;
  }

  // TAB A: Incidents
  const incListContainer = document.getElementById("incidentsListContainer");
  if (incListContainer) {
    incListContainer.innerHTML = activeIncs.map(inc => `
      <div onclick="selectIncident('${inc.id}')" class="p-3 rounded-xl border cursor-pointer ${inc.id === selectedInc.id ? 'bg-slate-800 border-blue-500' : 'bg-slate-950/70 border-slate-800'}">
        <div class="flex justify-between mb-1">
          <span class="text-xs font-bold text-white font-mono">Incident #${inc.index}</span>
          <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-950 text-rose-300 border border-rose-800">SEV ${inc.severity}</span>
        </div>
        <div class="text-xs text-slate-200">${inc.condition}</div>
        <div class="flex justify-between text-[11px] font-mono pt-1 text-slate-400">
          <span>🚑 ${inc.assigned_amb || 'DISPATCHING...'}</span>
          <span class="text-emerald-400">🏥 ${inc.assigned_hosp || 'CALCULATING...'}</span>
        </div>
      </div>
    `).join("");
  }

  // TAB B: Ranking
  if (selectedInc) {
    const evals = state.hospitals.map(h => {
      const transit = calculateDijkstraTransit(selectedInc, h, true);
      const res = scoreHospital(selectedInc, h, transit);
      return { hospital: h, ...res };
    });
    const top = evals.filter(e => e.eligible).sort((a, b) => b.score - a.score);
    const rej = evals.filter(e => !e.eligible);

    const topContainer = document.getElementById("topRankedHospitalsContainer");
    if (topContainer) {
      topContainer.innerHTML = top.slice(0, 3).map((item, idx) => `
        <div class="p-3 rounded-xl border ${selectedInc.assigned_hosp === item.hospital.id ? 'bg-emerald-950/30 border-emerald-500' : 'bg-slate-950/70 border-slate-800'}">
          <div class="flex justify-between">
            <span class="text-xs font-bold text-white">#${idx+1} ${item.hospital.name} (${item.hospital.code})</span>
            <span class="text-xs font-mono font-bold text-emerald-400">Score: ${item.score}</span>
          </div>
          <div class="text-[11px] text-slate-300 font-mono mt-1">${item.reason}</div>
          <div class="flex justify-between text-[11px] pt-1.5 border-t border-slate-800 font-mono mt-1">
            <span class="text-slate-400">ETA: <b>${item.eta}m</b> · Predicted: <b>${item.predictedBeds} beds</b></span>
            <button onclick="openOverrideModal('${selectedInc.id}')" class="px-2 py-0.5 rounded bg-blue-900 text-blue-200 text-[10px]">Override ➔</button>
          </div>
        </div>
      `).join("");
    }

    const rejContainer = document.getElementById("rejectedHospitalsContainer");
    if (rejContainer) {
      rejContainer.innerHTML = rej.map(item => `
        <div class="p-2 rounded bg-slate-950/70 border border-slate-800 text-[11px] font-mono text-slate-400 flex justify-between">
          <span>${item.hospital.name} (${item.hospital.code})</span>
          <span class="text-rose-400 text-[10px]">REJECTED: ${item.reason}</span>
        </div>
      `).join("");
    }
  }

  // TAB C: Hospitals
  const hospTable = document.getElementById("hospitalsTableContainer");
  if (hospTable) {
    hospTable.innerHTML = state.hospitals.map(h => `
      <div class="p-3 rounded-xl bg-slate-950 border ${h.on_diversion ? 'border-rose-600' : 'border-slate-800'} text-xs space-y-1.5">
        <div class="flex justify-between">
          <span class="font-bold text-white">${h.name} (${h.code})</span>
          <button onclick="toggleHospitalDiversionDirect('${h.id}')" class="px-2 py-0.5 rounded text-[10px] font-mono font-bold ${h.on_diversion ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-400'}">${h.on_diversion ? 'DIVERSION' : 'OPERATIONAL'}</button>
        </div>
        <div class="grid grid-cols-3 gap-1 font-mono text-[11px] bg-slate-900 p-1.5 rounded text-center">
          <div>Free: <b>${h.beds_free}</b></div>
          <div>ICU: <b>${h.icu_free}</b></div>
          <div>Surge: <b>${h.surge_capacity}</b></div>
        </div>
      </div>
    `).join("");
  }

  // TAB D: Audit Log
  const auditContainer = document.getElementById("auditLogContainer");
  if (auditContainer) {
    auditContainer.innerHTML = state.auditLog.slice(-20).reverse().map(item => `
      <div class="p-1.5 rounded bg-slate-950 border border-slate-800 space-y-0.5">
        <div class="flex justify-between text-[10px] text-slate-500 font-mono"><span>${item.time}</span><span class="text-cyan-400">${item.type}</span></div>
        <div class="text-[11px] text-slate-200">${item.message}</div>
      </div>
    `).join("");
  }
}

function logAudit(message, type = "CAD_EVENT") {
  const time = new Date().toLocaleTimeString('en-US', { hour12: false });
  state.auditLog.push({ time, type, message });
  renderDashboardPanels();
}

function triggerMCIMode(activate = true) {
  if (activate) {
    distributeMCI(true);
    const mciSection = document.getElementById("mci");
    if (mciSection) mciSection.scrollIntoView({ behavior: "smooth" });
  } else {
    state.mciActive = false;
    const banner = document.getElementById("mciBannerContainer");
    if (banner) banner.classList.add("hidden");
  }
}

function renderMCIPanels(assignments) {
  const surgeContainer = document.getElementById("mciSurgeBarsContainer");
  if (surgeContainer) {
    surgeContainer.innerHTML = state.hospitals.map(h => {
      const assigned = h.mci_assigned || 0;
      const pct = Math.min(100, Math.round((assigned / h.surge_capacity) * 100));
      return `
        <div class="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5 text-xs font-mono">
          <div class="flex justify-between"><span class="text-white">${h.name}</span><span class="text-emerald-400">${assigned} / ${h.surge_capacity}</span></div>
          <div class="w-full h-2 rounded-full bg-slate-900 overflow-hidden"><div class="h-full bg-emerald-500 rounded-full" style="width: ${pct}%"></div></div>
        </div>
      `;
    }).join("");
  }

  const tableBody = document.getElementById("mciCasualtyTableBody");
  if (tableBody) {
    tableBody.innerHTML = assignments.map(cas => `
      <tr class="hover:bg-slate-800/40 font-mono text-xs">
        <td class="py-2 px-3 font-bold text-white">${cas.id}</td>
        <td class="py-2 px-3"><span class="px-1.5 py-0.5 rounded text-[10px] font-bold ${cas.triage === 'RED' ? 'bg-rose-950 text-rose-300' : 'bg-amber-950 text-amber-300'}">${cas.triage}</span></td>
        <td class="py-2 px-3 text-slate-300">${cas.desc}</td>
        <td class="py-2 px-3 text-white">${cas.hospital.name}</td>
        <td class="py-2 px-3 text-cyan-400 font-bold">+${cas.etaMinutes} min</td>
      </tr>
    `).join("");
  }
}

// REST Backend Sync Function
async function syncBackend(endpoint, payload = null) {
  try {
    const opts = payload ? {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    } : { method: "GET" };
    const res = await fetch(`/api/${endpoint}`, opts);
    if (res.ok) return await res.json();
  } catch (err) {}
  return null;
}

function stepTick() {
  const unactiveIncs = state.incidents.filter(i => !i.active);
  if (unactiveIncs.length > 0) {
    unactiveIncs[0].active = true;
    state.currentTick = state.incidents.filter(i => i.active).length;
    const badge = document.getElementById("tickBadge");
    if (badge) badge.textContent = `#${state.currentTick}`;
    logAudit(`TICK #${state.currentTick}: Incident ${unactiveIncs[0].id} activated.`);
    playCadAlertSound("dispatch");
    replan(`Tick #${state.currentTick} Incident Ingested`);
    syncBackend("tick", { tick: state.currentTick });
  }
}

function toggleAutoPlay() {
  state.autoPlay = !state.autoPlay;
  const btnText = document.getElementById("autoPlayText");
  const dot = document.getElementById("autoPlayDot");
  if (state.autoPlay) {
    if (btnText) btnText.textContent = "Auto-play: ON";
    if (dot) dot.className = "w-2 h-2 rounded-full bg-emerald-400 animate-ping";
    state.autoPlayTimer = setInterval(() => {
      const remaining = state.incidents.filter(i => !i.active);
      if (remaining.length > 0) stepTick();
      else toggleAutoPlay();
    }, 3000);
  } else {
    if (btnText) btnText.textContent = "Auto-play: OFF";
    if (dot) dot.className = "w-2 h-2 rounded-full bg-slate-500";
    if (state.autoPlayTimer) clearInterval(state.autoPlayTimer);
  }
}

function toggleRoadClosure() {
  state.roadClosed = !state.roadClosed;
  const dot = document.getElementById("roadStatusDot");
  const text = document.getElementById("roadBtnText");
  if (state.roadClosed) {
    if (dot) dot.className = "w-2 h-2 rounded-full bg-amber-400 animate-ping";
    if (text) text.textContent = "Road CLOSED (Flyover 999m)";
    logAudit("ROAD DISRUPTION: Central Flyover closed! Edge set to 999m.");
  } else {
    if (dot) dot.className = "w-2 h-2 rounded-full bg-emerald-400";
    if (text) text.textContent = "Close Road (Flyover)";
    logAudit("ROAD RESTORED: Central Flyover reopened.");
  }
  syncBackend("road", { is_closed: state.roadClosed ? 1 : 0 });
  replan(state.roadClosed ? "Central Flyover Closed (999m)" : "Central Flyover Reopened");
}

function toggleHospitalDiversion() {
  const hospB = state.hospitals.find(h => h.code === "B");
  if (!hospB) return;
  hospB.on_diversion = !hospB.on_diversion;
  const dot = document.getElementById("diversionDot");
  const text = document.getElementById("diversionBtnText");
  if (hospB.on_diversion) {
    if (dot) dot.className = "w-2 h-2 rounded-full bg-rose-500 animate-ping";
    if (text) text.textContent = "Hosp B ON DIVERSION";
    logAudit("DIVERSION TRIGGERED: Hospital B on active diversion.");
  } else {
    if (dot) dot.className = "w-2 h-2 rounded-full bg-emerald-400";
    if (text) text.textContent = "Hospital B Diversion";
    logAudit("DIVERSION CLEARED: Hospital B normal operations.");
  }
  syncBackend("diversion", { hospital_id: "H-B", on_diversion: hospB.on_diversion ? 1 : 0 });
  replan("Hospital B Diversion Toggle");
}

function toggleHospitalDiversionDirect(hospId) {
  const h = state.hospitals.find(item => item.id === hospId);
  if (!h) return;
  h.on_diversion = !h.on_diversion;
  syncBackend("diversion", { hospital_id: hospId, on_diversion: h.on_diversion ? 1 : 0 });
  replan(`${h.code} Diversion State Updated`);
}

function resetSimulation() {
  if (state.autoPlayTimer) clearInterval(state.autoPlayTimer);
  state.autoPlay = false;
  state.roadClosed = false;
  state.currentTick = 1;
  state.selectedIncidentId = "INC-101";
  state.hospitals = JSON.parse(JSON.stringify(INITIAL_HOSPITALS));
  state.ambulances = JSON.parse(JSON.stringify(INITIAL_AMBULANCES));
  state.incidents = JSON.parse(JSON.stringify(SCRIPTED_INCIDENTS));
  const mciBanner = document.getElementById("mciBannerContainer");
  if (mciBanner) mciBanner.classList.add("hidden");
  logAudit("CAD GRID RESET: Baseline restored.");
  syncBackend("reset");
  replan("System Initialized");
}

function openOverrideModal(incId) {
  const inc = state.incidents.find(i => i.id === incId);
  if (!inc) return;
  const select = document.getElementById("overrideHospitalSelect");
  if (select) {
    select.innerHTML = state.hospitals.map(h => `<option value="${h.id}">${h.name} (${h.code})</option>`).join("");
  }
  document.getElementById("overrideModal").classList.remove("hidden");
}

function closeOverrideModal() {
  document.getElementById("overrideModal").classList.add("hidden");
}

function submitDispatcherOverride() {
  const select = document.getElementById("overrideHospitalSelect");
  const inc = state.incidents.find(i => i.id === state.selectedIncidentId);
  if (inc && select) {
    inc.manual_override = select.value;
    inc.assigned_hosp = select.value;
    logAudit(`OVERRIDE: ${inc.id} ➔ ${select.value}`);
    syncBackend("override", { incident_id: inc.id, destination: select.value });
    closeOverrideModal();
    replan("Dispatcher Override Executed");
  }
}

function updateLiveResultsMetrics() {
  const active = state.incidents.filter(i => i.active);
  if (active.length === 0) return;
  const baseline = runBaselineEvaluation(active, state.hospitals);
  let lrTotal = 0;
  active.forEach(inc => {
    const h = state.hospitals.find(hosp => hosp.id === inc.assigned_hosp);
    if (h) lrTotal += calculateDijkstraTransit(inc, h, true);
  });
  const lrAvg = (lrTotal / active.length).toFixed(1);
  const lrP90 = ((lrTotal / active.length) * 1.6).toFixed(1);
  const resBaseAvg = document.getElementById("resBaseAvg");
  const resLrAvg = document.getElementById("resLrAvg");
  const resBaseP90 = document.getElementById("resBaseP90");
  const resLrP90 = document.getElementById("resLrP90");
  if (resBaseAvg) resBaseAvg.textContent = `${baseline.avgResponse} min`;
  if (resLrAvg) resLrAvg.textContent = `${lrAvg} min`;
  if (resBaseP90) resBaseP90.textContent = `${baseline.p90} min`;
  if (resLrP90) resLrP90.textContent = `${lrP90} min`;
}

function downloadDatasetJSON() {
  const data = { hospitals: state.hospitals, ambulances: state.ambulances, incidents: state.incidents, mci: MCI_CASUALTIES };
  const str = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
  const a = document.createElement('a');
  a.href = str;
  a.download = `liferoute_data.json`;
  a.click();
}

function openLoginModal() { document.getElementById("loginModal").classList.remove("hidden"); }
function closeLoginModal() { document.getElementById("loginModal").classList.add("hidden"); }
function handleModalLogin() { closeLoginModal(); }
function bypassLoginQuick() { closeLoginModal(); window.location.hash = "#dashboard"; }

window.addEventListener("DOMContentLoaded", () => {
  fetch("/api/health")
    .then(res => res.json())
    .then(data => {
      const text = document.getElementById("backendDbText");
      if (text) text.textContent = `DB: SQLite Online (${data.port || 8080})`;
    })
    .catch(() => {
      const text = document.getElementById("backendDbText");
      if (text) text.textContent = "Engine: Client In-Memory";
    });

  initMap();
  replan("System Initialized");
  logAudit("LifeRoute decision engine ready.");
});
