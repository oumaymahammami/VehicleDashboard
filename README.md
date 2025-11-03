# DriveSense — Vehicle Dashboard

> Web interface for the real-time visualization of data from a connected (IoT) vehicle.
> Allows tracking of temperature, humidity, altitude, and GPS position, and displays risk indicators using an ML model (TensorFlow.js).

---

## Hardware (Physical ESP32)

The data collection part of this project runs on a **physical ESP32 microcontroller** (not a simulation).

* **Microcontroller:** ESP32
* **Sensor:** DHT11 (Temperature and Humidity Sensor)
* **Status Indicators:** 3x LEDs (Green, Orange, Red)
* **Note:** The web dashboard is built to also support GPS/Altitude data for future expansion, as described in the project goals. A `diagram.json` file (or wiring diagram image) is included to describe wiring and pin connections.

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
* `app.js` – Application logic (collection, analysis, synchronization)
* `diagram.json` – Wiring/diagram description for the physical ESP32 setup
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

```javascript
const firebaseConfig = {
  apiKey: "your-api-key",
  authDomain: "your-project.firebaseapp.com",
  databaseURL: "https://your-project.firebaseio.com",
  projectId: "your-project-id"
};

```

## 🚀 Run the ESP32 ⚙️

Flash the provided code to your **physical ESP32** (or use your own firmware that matches the dashboard’s expected data format).  
Ensure the ESP32 is powered on and actively sending data — for example via **Serial**, **HTTP**, or **MQTT** — according to the wiring and configuration described in `diagram.json`.

Once the ESP32 is running, it will periodically send sensor readings (temperature, humidity, altitude, GPS, and risk values) that will be displayed on the web dashboard in real time.

---

## 🌐 Running the Dashboard (Web UI)

1. Open the `index.html` file in a **modern web browser**.

2. To avoid **CORS** or **ES Modules** restrictions, it’s recommended to run a simple local **HTTP server** instead of opening the file directly.

   Using **Python 3**, open a terminal in your project folder and run:

   ```bash
   python -m http.server 8000
   ```
