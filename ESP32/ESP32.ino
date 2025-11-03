
#include <WiFi.h>
#include <HTTPClient.h> // Seule bibliothèque HTTP nécessaire
#include <ArduinoJson.h> // Pour analyser les réponses JSON de Firebase
#include "DHT.h"

// ===========================================
//          1. CONFIGURATION WIFI
// ===========================================
#define WIFI_SSID "*******"        // ✅ MIS A JOUR
#define WIFI_PASSWORD "*********"  // ✅ MIS A JOUR

// ===========================================
//          2. CONFIGURATION FIREBASE (HTTPClient)
// ===========================================

#define databaseURL "****" // ✅ MIS A JOUR
// Remplacer par votre clé API Firebase
#define apiKey "*******" // ✅ MIS A JOUR

// ===========================================
//          3. CONFIGURATION MATERIELLE
// ===========================================
#define DHTPIN 4     
#define DHTTYPE DHT11 
DHT dht(DHTPIN, DHTTYPE);

// Broches des LEDs (CORRIGEES: Vert, Orange, Rouge)
#define LED_GREEN 18  
#define LED_ORANGE 21 
#define LED_RED 23    

// ===========================================
//          4. FONCTIONS FIREBASE (HTTPClient)
// ===========================================


void initializeLedNode() {
  // MODIFIE: Cible le nouveau noeud "/etat_leds"
  String url = String("https://") + databaseURL + "/etat_leds.json?auth=" + apiKey;
  
  StaticJsonDocument<200> doc;
  doc["Led_Red"] = 0;
  doc["Led_Orange"] = 0;
  doc["Led_Green"] = 0;
  String jsonPayload;
  serializeJson(doc, jsonPayload);

  HTTPClient http;
  http.setConnectTimeout(5000); 
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  
  int httpResponseCode = http.PATCH(jsonPayload); 
  
  if (httpResponseCode == 200) {
    Serial.println("[Firebase INIT] Noeud /etat_leds initialise a 0.");
  } else {
    Serial.print("[Firebase INIT] Echec initialisation! Code: "); Serial.println(httpResponseCode);
  }
  http.end();
}


void sendDataToFirebase(float temp, float hum) {
  String url = String("https://") + databaseURL + "/historique.json?auth=" + apiKey;
  
  StaticJsonDocument<200> doc;
  doc["temperature"] = temp;
  doc["humidity"] = hum;
  doc["timestamp"][".sv"] = "timestamp"; 
  
  String jsonPayload;
  serializeJson(doc, jsonPayload);

  HTTPClient http;
  http.setConnectTimeout(5000); 
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  
  int httpResponseCode = http.POST(jsonPayload); 
  
  if (httpResponseCode > 0) {
    Serial.print("[Firebase POST] Code HTTP: "); Serial.println(httpResponseCode);
    Serial.print("[Firebase POST] Donnees envoyees: "); Serial.println(jsonPayload);
  } else {
    Serial.print("[Firebase POST] Echec requete! Code: "); Serial.println(httpResponseCode);
  }
  http.end();
}

void getLEDStateFromFirebase() {
  String url = String("https://") + databaseURL + "/etat_leds.json?auth=" + apiKey;

  HTTPClient http;
  http.setConnectTimeout(5000); 
  http.begin(url); 
  
  int httpResponseCode = http.GET();
  
  if (httpResponseCode > 0) {
    Serial.print("[Firebase GET] Code HTTP: "); Serial.println(httpResponseCode);
    String payload = http.getString(); 
    
    if (payload.length() == 0 || payload == "null") {
      Serial.println("[JSON] Payload vide (Noeud /etat_leds non trouve). Ignorer cette lecture.");
      http.end();
      return;
    }

    StaticJsonDocument<200> doc;
    DeserializationError error = deserializeJson(doc, payload);

    if (error) {
      Serial.print("[JSON] Echec de la deserialisation: ");
      Serial.println(error.f_str());
      http.end();
      return;
    }
    
    int r = doc["Led_Red"] | 0;    
    int o = doc["Led_Orange"] | 0;
    int g = doc["Led_Green"] | 0;

    Serial.print("[DEBUG LED] R: "); Serial.print(r);
    Serial.print(", O: "); Serial.print(o);
    Serial.print(", G: "); Serial.println(g);

    // --- Mise a jour des LEDs physiques ---
    digitalWrite(LED_RED, LOW);
    digitalWrite(LED_ORANGE, LOW);
    digitalWrite(LED_GREEN, LOW);
    
    bool led_allumee = false;

    if (r == 1) { 
      digitalWrite(LED_RED, HIGH);
      Serial.println("[LED] LED ROUGE allumee par Firebase.");
      led_allumee = true;
    } 
    
    if (o == 1) {
      digitalWrite(LED_ORANGE, HIGH);
      Serial.println("[LED] LED ORANGE allumee par Firebase.");
      led_allumee = true;
    } 
    
    if (g == 1) {
      digitalWrite(LED_GREEN, HIGH);
      Serial.println("[LED] LED VERTE allumee par Firebase.");
      led_allumee = true;
    } 
    
    if (!led_allumee) {
      Serial.println("[LED] Aucune LED allumee selon Firebase.");
    }

  } else {
    Serial.print("[Firebase GET] Echec requete! Code: "); 
    Serial.println(httpResponseCode);
  }
  http.end();
}

/**
 * @brief Supprime le nœud "/historique" et toutes les données qu'il contient.
 */
void clearHistory() {
  String url = String("https://") + databaseURL + "/historique.json?auth=" + apiKey;

  HTTPClient http;
  http.setConnectTimeout(5000);
  http.begin(url);
  
  int httpResponseCode = http.sendRequest("DELETE"); 

  if (httpResponseCode == 200) {
    Serial.println("[Firebase DELETE] Historique supprime avec succes (Code 200).");
  } else {
    Serial.print("[Firebase DELETE] Echec suppression historique! Code: "); 
    Serial.println(httpResponseCode);
    Serial.println(http.getString()); 
  }
  http.end();
}


/**
 * @brief Initialise la connexion WiFi.
 */
void initWiFi() {
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connexion a ");
  Serial.print(WIFI_SSID);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("WiFi connecte. Adresse IP : ");
  Serial.println(WiFi.localIP());
}

// ===========================================
//          5. SETUP ET LOOP
// ===========================================

void setup() {
  Serial.begin(115200); 
  while (!Serial);

  Serial.println(F("--- Initialisation du systeme IoT : DHT11 + Firebase (HTTP) ---"));
  
  pinMode(LED_GREEN, OUTPUT);
  pinMode(LED_ORANGE, OUTPUT);
  pinMode(LED_RED, OUTPUT);

  digitalWrite(LED_GREEN, LOW);
  digitalWrite(LED_ORANGE, LOW);
  digitalWrite(LED_RED, LOW);
  
  dht.begin();
  
  initWiFi();
  
  // MODIFIE: Cible le nouveau noeud /etat_leds
  initializeLedNode(); 
  
  /*
  // DÉCOMMENTEZ CETTE LIGNE SI VOUS VOULEZ EFFACER TOUT L'HISTORIQUE 
  // A CHAQUE DÉMARRAGE DE L'ESP32.
  clearHistory(); 
  */

  Serial.println(F("Systeme pret. Debut du cycle de mesure et communication..."));
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi deconnecte. Reconnexion...");
    initWiFi(); 
    delay(5000); 
    return;
  }
  
  // ✅ MODIFIE: Délai total réglé sur 5 secondes (4500 + 500)
  delay(4500); 

  float temperature_C = dht.readTemperature(); 
  float humidite_PCT = dht.readHumidity();   

  if (isnan(humidite_PCT) || isnan(temperature_C)) {
    Serial.println(F("ERREUR: Echec de la lecture du capteur DHT. Verifiez le cablage et la resistance Pull-Up!"));
  } else {
    // ✅ MODIFIE: Ajout de +25 à la température envoyée
    sendDataToFirebase(temperature_C + 25, humidite_PCT);
  }
  
  delay(500); // Garder un court délai entre POST et GET

  getLEDStateFromFirebase();

  Serial.println("------------------------------------------");
}

