# Vehicle Dashboard — Visualisation en Temps Réel

**Description :**  
Interface web légère pour la **visualisation en temps réel** d’un véhicule simulé.  
Permet de suivre les données environnementales, la position GPS, et d’afficher des indicateurs de risque.

## Fonctionnalités principales
- **KPI en temps réel** : Température, Humidité, Altitude (m / mi)  
- **Carte interactive** (Leaflet) affichant la position simulée du véhicule  
- **Historique sommaire** sous forme de tableau et statistiques : moyenne température/humidité, zones à risque  
- **LED d’indication de risque** et prédiction ML simulée (TensorFlow.js)  
- **Bouton "⟳ Rafraîchir"** pour recalculer les statistiques instantanément  

## Fichiers principaux
- `index.html` – Interface utilisateur et mise en page  
- `app.js` – Logique de l’application (génération de données simulées, mise à jour DOM, analyse historique, modèle ML)  

## Prérequis
- Navigateurs modernes  
- Bibliothèques externes (via CDN) :  
  - **Leaflet** – Carte interactive  
  - **TensorFlow.js** – Machine Learning  
  - **Firebase** (optionnel) – Stockage et historique des données  

## Installation / Exécution
1. Ouvrir `index.html` dans un navigateur moderne  
2. Pour éviter les restrictions **CORS / ES Modules**, il est recommandé d’exécuter un serveur HTTP simple :  
   - **Python 3** :  
     ```bash
     python -m http.server 8000
     ```  
     puis ouvrir [http://localhost:8000](http://localhost:8000)  
3. Les données sont simulées toutes les **2 secondes** (configurable via `INTERVAL_MS` dans `app.js`)  
4. Le panneau **Statistiques historiques** se met à jour automatiquement  
5. Le bouton **⟳ Rafraîchir** force le recalcul et affiche l’heure de la dernière mise à jour  

## Personnalisation rapide
- **Firebase réel** : configurer `firebaseConfig` dans `app.js` et autoriser l’import dynamique des SDK  
- **Intervalle de simulation** : modifier `INTERVAL_MS` dans `app.js`  
- **Seuils de risque** : modifier la fonction `getRiskLevel(temp, hum)` dans `app.js`  

## Dépannage
- Carte Leaflet non visible → vérifier la connexion CDN ou exécuter via un **serveur local**  
- Avertissements de l’analyseur (lint) → recommandations, **pas des erreurs d’exécution**  

## Licence
Code fourni **tel quel**, libre d’utilisation et de modification.  

## Contact / Améliorations possibles
- Export CSV des données  
- Compteurs animés  
- Détection de trajectoire et zones à risque avancées  
- Propositions d’amélioration ou questions  

## Liens utiles pour datasets
- [Kaggle - US Accidents (2016-2023)](https://www.kaggle.com/datasets/sobhanmoosavi/us-accidents)  
- [UCI Machine Learning Repository - Bike Sharing Dataset](https://archive.ics.uci.edu/dataset/275/bike+sharing+dataset)  
- [City of Chicago Data Portal - Traffic Crashes](https://data.cityofchicago.org/Transportation/Traffic-Crashes-Crashes/85ca-t3if)
