# DriveSense — Vehicle Dashboard

> Web interface for the real-time visualization of data from a connected (IoT) vehicle.
> Allows tracking of temperature, humidity, altitude, and GPS position, and displays risk indicators using an ML model (TensorFlow.js).

---

## Hardware (Wokwi Simulation)

The data collection part of this project runs on an ESP32 microcontroller:

* **Microcontroller:** ESP32
* **Sensor:** DHT11 (Temperature and Humidity Sensor)
* **Status Indicators:** 3x LEDs (Green, Orange, Red)
* **(Note:** The web dashboard is built to also support GPS/Altitude data for future expansion, as described in the project goals.)

---

## Main Features

* **Real-time KPIs:** Temperature, Humidity, Altitude (m / ft)
* **Interactive Map (Leaflet)** displaying the vehicle's GPS position
* **Risk Assessment:** AI prediction with a tri-color LED (green / orange / red)
* **Measurement History:** Last 10 values with timestamps
* **Instant Statistics:** Average temperature/humidity, risk zones
* **Firebase Synchronization (optional)** for real-time storage and reading
* **"⟳ Refresh" Button** to instantly recalculate statistics

---

## Main Files

* `index.html` – User interface and layout
* `app.js` – Application logic (simulation, collection, analysis, synchronization)
* `diagram.json` – Wokwi Configuration (ESP32 simulation)
* `risk_model_tfjs/` – TensorFlow.js model for risk prediction

---

## Prerequisites

* Modern browser
* External libraries (via CDN):
    * Leaflet – Interactive map
    * TensorFlow.js – Machine Learning
    * Firebase (optional) – Data storage and history

---

## Installation / Running

### 1. Configuration (Optional)

If using Firebase, update `app.js` with your project credentials:

``javascript
const firebaseConfig = {
  apiKey: "your-api-key",
  authDomain: "your-project.firebaseapp.com",
  databaseURL: "[https://your-project.firebaseio.com](https://your-project.firebaseio.com)",
  projectId: "your-project-id"
};``


## Run the ESP32  ⚙️
Open the Wokwi simulation environment (if running hardware remotely) or compile and upload the code to your physical ESP32.

Ensure the ESP32 is powered on and actively sending data (simulated or real) according to the diagram.json and code configuration.

## Running the Dashboard (Web UI)
Open index.html in a modern browser.

To avoid CORS / ES Modules restrictions, it's recommended to run a simple HTTP server.

Using Python 3:

Bash
``
 python -m http.server 8000 
 ``
Open http://localhost:8000 in your browser.

Data is simulated every 2 seconds (configurable via INTERVAL_MS in app.js).

The History and Statistics panel updates automatically.