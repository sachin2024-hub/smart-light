/*
  Voice-Controlled IoT Lighting System
  ESP32 firmware for Arduino IDE

  WITHOUT HARDWARE:
  - You can already test the web dashboard + PHP + MySQL.
  - This sketch is used later, when you have the ESP32, relay, and bulb.

  WITH HARDWARE:
  1. Install "esp32" by Espressif in Arduino IDE Boards Manager.
  2. Select board: ESP32 Dev Module
  3. Edit WIFI_SSID, WIFI_PASSWORD, and SERVER_HOST below.
  4. SERVER_HOST must be the IP of the PC running XAMPP, example: 192.168.1.10
  5. Upload this sketch, then wire the relay as shown below.

  WIRING
  ------
  Relay module IN  -> ESP32 GPIO 26
  Relay module VCC -> ESP32 5V (or 3.3V if your relay is 3.3V)
  Relay module GND -> ESP32 GND
  Relay COM / NO   -> bulb live wire (AC mains). Ask a technician if unsure.
  Status LED       -> ESP32 GPIO 2 (built-in LED on many DevKit boards)

  VOICE
  -----
  Option A (works now): speak from the web dashboard microphone.
  Option B (on device): type LIGHT ON / LIGHT OFF in Serial Monitor.
  Option C (later): connect a voice-recognition module to RX2/TX2 and
                    set VOICE_SOURCE to 1.
*/

#include <WiFi.h>
#include <HTTPClient.h>

const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// IP address of the computer running XAMPP. Do not use localhost on the ESP32.
const char* SERVER_HOST = "192.168.1.10";
const int SERVER_PORT = 80;
const char* PROJECT_PATH = "/smart-light";

const int RELAY_PIN = 26;
const int STATUS_LED_PIN = 2;

// Many cheap relay modules are active LOW (LOW = light ON).
const bool RELAY_ACTIVE_LOW = true;

// 0 = Serial Monitor commands
// 1 = UART voice-recognition module on Serial2 (GPIO 16 RX, GPIO 17 TX)
const int VOICE_SOURCE = 0;

const unsigned long HEARTBEAT_MS = 2000;
const unsigned long POLL_MS = 1000;

bool lightOn = false;
unsigned long lastHeartbeat = 0;
unsigned long lastPoll = 0;

String serverUrl(const String& endpoint) {
  return String("http://") + SERVER_HOST + ":" + String(SERVER_PORT) + PROJECT_PATH + endpoint;
}

void applyRelay() {
  if (RELAY_ACTIVE_LOW) {
    digitalWrite(RELAY_PIN, lightOn ? LOW : HIGH);
  } else {
    digitalWrite(RELAY_PIN, lightOn ? HIGH : LOW);
  }

  digitalWrite(STATUS_LED_PIN, lightOn ? HIGH : LOW);
}

String httpGet(const String& url) {
  if (WiFi.status() != WL_CONNECTED) {
    return "";
  }

  HTTPClient http;
  http.setTimeout(4000);
  http.begin(url);
  int code = http.GET();
  String body = "";

  if (code > 0) {
    body = http.getString();
  }

  http.end();
  return body;
}

String jsonValue(const String& body, const String& key) {
  String search = "\"" + key + "\":";
  int start = body.indexOf(search);

  if (start < 0) {
    return "";
  }

  start += search.length();

  while (start < body.length() && (body[start] == ' ')) {
    start++;
  }

  if (start < body.length() && body[start] == '"') {
    int end = body.indexOf("\"", start + 1);
    if (end < 0) {
      return "";
    }
    return body.substring(start + 1, end);
  }

  int end = start;
  while (end < body.length() && body[end] != ',' && body[end] != '}' && body[end] != ' ') {
    end++;
  }

  return body.substring(start, end);
}

void sendHeartbeat() {
  String url = serverUrl("/api/heartbeat.php?light=") + (lightOn ? "ON" : "OFF");
  httpGet(url);
}

void reportLight(const String& command, const String& id) {
  String url = serverUrl("/api/update_light.php");
  url += "?status=" + String(lightOn ? "ON" : "OFF");
  url += "&command=" + command;
  url += "&source=esp32";

  if (id.length() > 0) {
    url += "&id=" + id;
  }

  url.replace(" ", "%20");
  httpGet(url);
}

void setLight(bool on, const String& command, const String& id) {
  lightOn = on;
  applyRelay();
  reportLight(command, id);

  Serial.print("Light is now ");
  Serial.println(lightOn ? "ON" : "OFF");
}

bool commandIsOn(String command) {
  command.toUpperCase();
  command.trim();

  if (command.indexOf("OFF") >= 0) {
    return false;
  }

  if (command.indexOf("PALONG") >= 0 || command.indexOf("PATAY") >= 0) {
    return false;
  }

  return command.indexOf("ON") >= 0 || command.indexOf("BUKAS") >= 0;
}

void handleCommand(String command, const String& id) {
  command.trim();

  if (command.length() == 0) {
    return;
  }

  Serial.print("Command: ");
  Serial.println(command);

  if (commandIsOn(command)) {
    setLight(true, command, id);
  } else {
    setLight(false, command, id);
  }
}

void pollDashboardCommands() {
  String body = httpGet(serverUrl("/api/get_pending.php"));

  if (body.length() == 0 || body.indexOf("\"pending\":null") >= 0) {
    return;
  }

  String action = jsonValue(body, "light_action");
  String command = jsonValue(body, "voice_command");
  String id = jsonValue(body, "id");

  if (command.length() == 0) {
    command = action.length() > 0 ? ("LIGHT " + action) : "LIGHT ON";
  }

  handleCommand(command, id);
}

void readSerialVoice() {
  if (!Serial.available()) {
    return;
  }

  String command = Serial.readStringUntil('\n');
  command.trim();

  if (command.length() > 0) {
    handleCommand(command, "");
  }
}

void readVoiceModule() {
  if (!Serial2.available()) {
    return;
  }

  String command = Serial2.readStringUntil('\n');
  command.trim();

  if (command.length() > 0) {
    handleCommand(command, "");
  }
}

void connectWiFi() {
  Serial.print("Connecting to Wi-Fi");
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 20000) {
    delay(400);
    Serial.print(".");
  }

  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("Wi-Fi OK. ESP32 IP: ");
    Serial.println(WiFi.localIP());
    Serial.print("Server: ");
    Serial.println(serverUrl(""));
  } else {
    Serial.println("Wi-Fi failed. Check SSID/password.");
  }
}

void setup() {
  pinMode(RELAY_PIN, OUTPUT);
  pinMode(STATUS_LED_PIN, OUTPUT);
  lightOn = false;
  applyRelay();

  Serial.begin(115200);
  delay(500);

  if (VOICE_SOURCE == 1) {
    Serial2.begin(9600, SERIAL_8N1, 16, 17);
  }

  Serial.println();
  Serial.println("Smart Light ESP32");
  Serial.println("Type LIGHT ON or LIGHT OFF here to test.");

  connectWiFi();
  sendHeartbeat();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  if (VOICE_SOURCE == 1) {
    readVoiceModule();
  } else {
    readSerialVoice();
  }

  unsigned long now = millis();

  if (now - lastPoll >= POLL_MS) {
    lastPoll = now;
    pollDashboardCommands();
  }

  if (now - lastHeartbeat >= HEARTBEAT_MS) {
    lastHeartbeat = now;
    sendHeartbeat();
  }
}
