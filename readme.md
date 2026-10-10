# LifeRoute: Intelligent Emergency Hospital & Ambulance Coordination

> **"Not the nearest hospital. The right one."**

A decision-support system that dispatches ambulances and selects destination hospitals using clinical severity, specialist capabilities, predicted bed capacity at arrival, and live transit constraints.

---

## 🚑 Key Features
- **Multi-Objective Hospital Scorer:** Scores destination hospitals dynamically:  
  Score = -(w_t * ETA) + w_c * min(Beds_free - Ambulances_inbound, 10)
- **Hungarian Optimal Fleet Matching (O(n^3)):** Bipartite matching that minimizes global travel times weighted by case severity.
- **START Triage & Mass-Casualty (MCI) Balancer:** Automatically balances 20 disaster casualties across the regional network with 3–5 min staggered arrival intervals.
- **Dynamic Road Closures & Diversions:** Instant re-planning (<10 ms) when road segments close or hospitals divert.
- **Human Dispatcher Override:** Full operator authority with recorded clinical justification and audit logging.
- **Python REST & SQLite Demo Backend:** Live synchronization with persistent SQLite storage (`liferoute.db`).

---

## 🚀 Quickstart
```bash
# Launch with Python backend and SQLite
python server.py
