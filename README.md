# Vehicle Dashboard — Visualisation en Temps Réel

**Description :**
Interface web pour la **visualisation en temps réel** des données d'un véhicule connecté (IoT).
Permet de suivre la température, l'humidité, l'altitude, la position GPS, et d'afficher des indicateurs de risque avec un modèle ML (TensorFlow.js).

## Fonctionnalités principales

- **KPI en temps réel** : Température, Humidité, Altitude (m / ft)
- **Carte interactive (Leaflet)** affichant la position GPS du véhicule
- **Évaluation du risque** : prédiction AI avec LED tricolore (vert / orange / rouge)
- **Historique des mesures** : 10 dernières valeurs avec horodatage
- **Statistiques instantanées** : moyenne température/humidité, zones à risque
- **Synchronisation Firebase** (optionnelle) pour stockage et lecture en temps réel
- **Bouton "⟳ Rafraîchir"** pour recalculer les statistiques instantanément

## Fichiers principaux

- `index.html` – Interface utilisateur et mise en page
- `app.js` – Logique de l'application (simulation, collecte, analyse, synchronisation)
- `diagram.json` – Configuration Wokwi (simulation ESP32)
- `risk_model_tfjs/` – Modèle TensorFlow.js pour prédiction des risques

## Prérequis

- Navigateur moderne
- Bibliothèques externes (via CDN) :
  - **Leaflet** – Carte interactive
  - **TensorFlow.js** – Machine Learning
  - **Firebase** (optionnel) – Stockage et historique des données

## Installation / Exécution
### Configuration
#### Firebase Setup
```bash
const firebaseConfig = {
  apiKey: "your-api-key",
  authDomain: "your-project.firebaseapp.com",
  databaseURL: "https://your-project.firebaseio.com",
  projectId: "your-project-id"
};
 ```
1. Ouvrir `index.html` dans un navigateur moderne
2. Pour éviter les restrictions **CORS / ES Modules**, exécuter un serveur HTTP simple :
   - **Python 3** :
     ```bash
     python -m http.server 8000
     ```
     puis ouvrir [http://localhost:8000](http://localhost:8000)
3. Les données sont simulées toutes les **2 secondes** (configurable via `INTERVAL_MS` dans `app.js`)
4. Le panneau **Historique et Statistiques** se met à jour automatiquement
5. Le bouton **⟳ Rafraîchir** force le recalcul et met à jour l'heure de la dernière mesure

## Usage Guide
### Dashboard Navigation
- Real-Time Panel: Current sensors and vehicle position

- Historical Data: Last 10 sensor readings with timestamps

- Statistics: Averages and risk zone analysis

- Controls: Manual refresh and synchronization options

#### Risk Interpretation
- Green LED: Low risk (Normal conditions)

- Orange LED: Medium risk (Elevated temperature/humidity)

- Red LED: High risk (Critical conditions requiring attention)

## Modèle ML

- Dataset utilisé : **Kaggle - US Accidents (2016–2023)**
- Entrées : Température, Humidité, Latitude, Longitude, Altitude
- Sorties : Niveau de risque (Faible / Moyen / Élevé)
- Modèle : Réseau neuronal simple avec 2 couches cachées (ReLU) + sortie Softmax
- Format pour le web : TensorFlow.js (`risk_model_tfjs/`)

## Dépannage

- Carte Leaflet non visible → vérifier la connexion CDN ou serveur local
- Firebase inactif → vérifier configuration et règles de sécurité
- Données figées → vérifier `INTERVAL_MS` et console du navigateur
- LED inactive → vérifier fonction `computeLedRisk()` et données du modèle

## Licence

Code fourni **tel quel**, libre d'utilisation et de modification

## Contact / Améliorations possibles

- Export CSV des données
- Compteurs animés
- Détection de trajectoire et zones à risque avancées
- Propositions d'amélioration ou questions

## Liens utiles pour datasets

- [Kaggle - US Accidents (2016–2023)](https://www.kaggle.com/datasets/sobhanmoosavi/us-accidents)
