// OwlPark space sensor: ESP32 + HC-SR04 ultrasonic, mounted above or in front of one space.
// Reports "occupied" / "open" to the OwlPark server over Wi-Fi.
//
// Wiring (HC-SR04 runs at 5V; put a 1k/2k voltage divider on ECHO -> ESP32):
//   VCC -> 5V, GND -> GND, TRIG -> GPIO 5, ECHO -> GPIO 18 (via divider)

#include <WiFi.h>
#include <HTTPClient.h>

// ---- Configure per sensor ----
const char* WIFI_SSID     = "YOUR_WIFI";
const char* WIFI_PASSWORD = "YOUR_PASSWORD";
const char* SERVER_URL    = "http://192.168.1.50:3000/api/sensor"; // laptop running `npm start`
const char* API_KEY       = "dev-sensor-key";
const char* SENSOR_ID     = "east-deck-A1";   // <lotId>-<row><number>, see data/lots.json

const int   TRIG_PIN = 5;
const int   ECHO_PIN = 18;
const float OCCUPIED_BELOW_CM = 120.0;   // car closer than this = occupied (tune for mounting height)
const int   CONFIRM_READINGS  = 3;       // debounce: need N matching readings before changing state
const unsigned long SAMPLE_MS    = 1000;
const unsigned long HEARTBEAT_MS = 60000; // server marks a sensor offline after 2 min of silence

bool reportedOccupied = false;
bool haveReported = false;
int  streak = 0;
unsigned long lastSent = 0;

float readDistanceCm() {
  digitalWrite(TRIG_PIN, LOW);  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH); delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  long us = pulseIn(ECHO_PIN, HIGH, 30000); // 30 ms timeout ≈ 5 m
  if (us == 0) return 999;                  // no echo = nothing in range
  return us * 0.0343 / 2.0;
}

bool sendStatus(bool occupied) {
  if (WiFi.status() != WL_CONNECTED) return false;
  HTTPClient http;
  http.begin(SERVER_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-api-key", API_KEY);
  String body = String("{\"sensorId\":\"") + SENSOR_ID + "\",\"occupied\":" + (occupied ? "true" : "false") + "}";
  int code = http.POST(body);
  http.end();
  Serial.printf("POST %s -> %d\n", occupied ? "occupied" : "open", code);
  return code == 200;
}

void setup() {
  Serial.begin(115200);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) { delay(400); Serial.print("."); }
  Serial.printf("\nConnected, IP %s\n", WiFi.localIP().toString().c_str());
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) WiFi.reconnect();

  float cm = readDistanceCm();
  bool occupiedNow = cm < OCCUPIED_BELOW_CM;

  if (!haveReported || occupiedNow != reportedOccupied) streak++;
  else streak = 0;

  unsigned long now = millis();
  bool changed = streak >= CONFIRM_READINGS;
  bool heartbeatDue = haveReported && now - lastSent > HEARTBEAT_MS;

  if (changed || heartbeatDue) {
    bool state = changed ? occupiedNow : reportedOccupied;
    if (sendStatus(state)) {
      reportedOccupied = state;
      haveReported = true;
      lastSent = now;
      streak = 0;
    }
  }
  delay(SAMPLE_MS);
}
