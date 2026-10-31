/*
  Voice-Controlled IoT Lighting System
  ESP32 firmware for Arduino IDE

  WITH HARDWARE:
  1. Install "esp32" by Espressif in Arduino IDE Boards Manager.
  2. Select board: ESP32 Dev Module
  3. Edit WIFI_SSID, WIFI_PASSWORD, and SERVER_HOST below.
  4. SERVER_HOST must be the IP of the PC running XAMPP, example: 192.168.1.10
  5. Upload this sketch, then open Serial Monitor at 115200 baud.

  WIRING
  ------
  VC-02 TX1 -> ESP32 GPIO 16 (RX2)
  VC-02 RX1 -> ESP32 GPIO 17 (TX2)
  VC-02 GND -> ESP32 GND (must share ground)
  VC-02 VCC -> per the VC-02-Kit power spec (3.3V logic on UART)

  Relay module IN  -> ESP32 GPIO 26   (optional, not needed for testing)
  Relay module VCC -> ESP32 5V (or 3.3V if your relay is 3.3V)
  Relay module GND -> ESP32 GND
  Relay COM / NO   -> bulb live wire (AC mains). Ask a technician if unsure.
  Status LED       -> ESP32 GPIO 2 (built-in LED on many DevKit boards)

  VOICE
  -----
  Dashboard microphone, Serial Monitor (LIGHT ON / LIGHT OFF) and the VC-02
  all work at the same time.

  VC-02 SETUP
  -----------
  The VC-02 UART output is set in its firmware (AI-Thinker platform), so the
  exact bytes are not known to this sketch. Every received byte and every
  complete frame is printed in Serial Monitor as "VC02 HEX". Speak each
  command, then:
    - If the module sends text (e.g. "LIGHT ON"), it works as is.
    - If it sends binary frames, copy the HEX of the ON and OFF frames into
      VC02_ON_FRAME / VC02_OFF_FRAME below and set the lengths.
  If you see garbage or nothing, change VC02_BAUD (try 9600 and 115200).
*/

#include <WiFi.h>
#include <HTTPClient.h>
#include <stdio.h>
#include <Preferences.h>

Preferences prefs;

const char* WIFI_SSID = "Sachin";
const char* WIFI_PASSWORD = "12345678";

// IP address of the computer running XAMPP. Do not use localhost on the ESP32.
// IP of the PC as seen by the ESP32. Run "ipconfig" on the PC:
//  - ESP32 joined the PC's Mobile Hotspot -> "Local Area Connection*" IP (192.168.137.1)
//  - ESP32 joined the router (MERCUSYS)    -> the PC's "Wi-Fi" IP (192.168.1.17)
const char* SERVER_HOST = "192.168.137.1";
const int SERVER_PORT = 80;
const char* PROJECT_PATH = "/smart-light";

const int RELAY_PIN = 26;
const int STATUS_LED_PIN = 2;

// Many cheap relay modules are active LOW (LOW = light ON).
const bool RELAY_ACTIVE_LOW = true;

// VC-02 UART on Serial2 (GPIO 16 RX, GPIO 17 TX)
const int VC02_RX_PIN = 16;
const int VC02_TX_PIN = 17;
const unsigned long VC02_BAUD = 115200;   // must match the VC-02 firmware setting

// Binary frames from the VC-02. Fill these from the "VC02 HEX" lines in
// Serial Monitor, then set the length. A length of 0 disables the match.
// Learned automatically (see LEARN ON / LEARN OFF in Serial Monitor) and saved
// in flash, so they survive reboot.
const size_t VC02_BUF_MAX = 64;
uint8_t VC02_ON_FRAME[VC02_BUF_MAX];
size_t VC02_ON_LEN = 0;
uint8_t VC02_OFF_FRAME[VC02_BUF_MAX];
size_t VC02_OFF_LEN = 0;
int learnTarget = 0;   // 0 = off, 1 = learning ON frame, 2 = learning OFF frame
const unsigned long VC02_FRAME_GAP_MS = 25;   // silence that ends a frame

const unsigned long HEARTBEAT_MS = 2000;
const unsigned long POLL_MS = 300;

bool lightOn = false;
unsigned long lastHeartbeat = 0;
unsigned long lastPoll = 0;

uint8_t vc02Buf[VC02_BUF_MAX];
size_t vc02Len = 0;
unsigned long vc02LastByte = 0;

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

// One shared client with keep-alive, so each request reuses the open
// connection instead of doing a new TCP handshake (much faster).
HTTPClient http;

String httpGet(const String& url) {
  if (WiFi.status() != WL_CONNECTED) {
    return "";
  }

  http.setReuse(true);
  http.setConnectTimeout(2000);
  http.setTimeout(2000);

  if (!http.begin(url)) {
    return "";
  }

  int code = http.GET();
  String body = "";

  if (code > 0) {
    body = http.getString();
  }

  // Debug log: every request except the quiet once-per-second pending poll.
  if (code != 200 || url.indexOf("get_pending") < 0) {
    Serial.print("[HTTP] ");
    Serial.print(code);
    Serial.print(" ");
    Serial.print(code > 0 ? String("") : http.errorToString(code) + " ");
    Serial.println(url);
  }

  if (code <= 0) {
    Serial.println("[HTTP] Server not reachable. Check SERVER_HOST, Apache, and Windows Firewall (port 80).");
  } else if (code != 200) {
    Serial.println("[HTTP] Server answered with an error. Check Apache error.log / PHP.");
  }

  http.end();
  return body;
}

// Plain TCP test to the XAMPP PC so a firewall/IP problem is obvious.
void testServerConnection() {
  WiFiClient client;
  Serial.print("Testing TCP ");
  Serial.print(SERVER_HOST);
  Serial.print(":");
  Serial.print(SERVER_PORT);
  Serial.print(" ... ");

  if (client.connect(SERVER_HOST, SERVER_PORT, 3000)) {
    Serial.println("OK (Apache reachable)");
    client.stop();
  } else {
    Serial.println("FAILED");
    Serial.println("  - SERVER_HOST must equal the PC's Wi-Fi IP (ipconfig).");
    Serial.println("  - PC and ESP32 must be on the same router/Wi-Fi network.");
    Serial.println("  - Allow Apache (httpd.exe) through Windows Firewall on port 80.");
    Serial.println("  - Router 'AP/client isolation' must be off.");
  }
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

String encodeParam(const String& value) {
  String out = "";
  for (unsigned int i = 0; i < value.length(); i++) {
    char c = value[i];
    if (isalnum(c) || c == '-' || c == '_' || c == '.' || c == ':') {
      out += c;
    } else if (c == ' ') {
      out += "%20";
    } else {
      char buf[8];
      sprintf(buf, "%%%02X", (unsigned char)c);
      out += buf;
    }
  }
  return out;
}

void sendHeartbeat() {
  String url = serverUrl("/api/heartbeat.php");
  url += "?light=" + String(lightOn ? "ON" : "OFF");
  url += "&ip=" + encodeParam(WiFi.localIP().toString());
  url += "&ssid=" + encodeParam(WiFi.SSID());
  url += "&rssi=" + String(WiFi.RSSI());
  url += "&mac=" + encodeParam(WiFi.macAddress());
  url += "&uptime=" + String(millis() / 1000);
  url += "&heap=" + String(ESP.getFreeHeap());
  url += "&fw=1.1.0";
  httpGet(url);
}

void reportLight(const String& command, const String& id, const char* source) {
  String url = serverUrl("/api/update_light.php");
  url += "?status=" + String(lightOn ? "ON" : "OFF");
  url += "&command=" + encodeParam(command);
  url += "&source=" + String(source);

  if (id.length() > 0) {
    url += "&id=" + encodeParam(id);
  }

  httpGet(url);
}

void setLight(bool on, const String& command, const String& id, const char* source) {
  lightOn = on;
  applyRelay();
  reportLight(command, id, source);

  Serial.print("Light is now ");
  Serial.println(lightOn ? "ON" : "OFF");
}

// Returns 1 = ON, 0 = OFF, -1 = not recognized. Whole-word match, same
// phrases as parseLightAction() in api/db.php.
int commandAction(String command) {
  command.toLowerCase();

  for (unsigned int i = 0; i < command.length(); i++) {
    if (!isalnum((unsigned char)command[i])) {
      command[i] = ' ';
    }
  }

  command = " " + command + " ";

  if (command.indexOf(" off ") >= 0 ||
      command.indexOf(" palong ") >= 0 ||
      command.indexOf(" patay ") >= 0) {
    return 0;
  }

  if (command.indexOf(" on ") >= 0 ||
      command.indexOf(" bukas ") >= 0) {
    return 1;
  }

  return -1;
}

void handleCommand(String command, const String& id, const char* source) {
  command.trim();

  if (command.length() == 0) {
    return;
  }

  Serial.print("Command: ");
  Serial.println(command);

  int action = commandAction(command);

  if (action < 0) {
    Serial.println("Not recognized. Light unchanged.");
    return;
  }

  setLight(action == 1, command, id, source);
}

void pollDashboardCommands() {
  String body = httpGet(serverUrl("/api/get_pending.php"));

  if (body.length() == 0 || body.indexOf("\"pending\":null") >= 0) {
    return;
  }

  String action = jsonValue(body, "light_action");
  String command = jsonValue(body, "voice_command");
  String id = jsonValue(body, "id");

  if (id.length() == 0 || (action != "ON" && action != "OFF")) {
    return;
  }

  if (command.length() == 0) {
    command = "LIGHT " + action;
  }

  // The server already decided ON/OFF, so use light_action directly.
  Serial.print("Dashboard command: ");
  Serial.println(command);
  setLight(action == "ON", command, id, "esp32");
}

void readSerialVoice() {
  if (!Serial.available()) {
    return;
  }

  String command = Serial.readStringUntil('\n');
  command.trim();

  if (command.length() == 0) {
    return;
  }

  String upper = command;
  upper.toUpperCase();

  if (upper == "LEARN ON") {
    learnTarget = 1;
    Serial.println(">> Now say the ON command to the VC-02 (e.g. 'turn on the light')...");
    return;
  }

  if (upper == "LEARN OFF") {
    learnTarget = 2;
    Serial.println(">> Now say the OFF command to the VC-02 (e.g. 'turn off the light')...");
    return;
  }

  if (upper == "CLEAR") {
    VC02_ON_LEN = 0;
    VC02_OFF_LEN = 0;
    prefs.putUInt("onLen", 0);
    prefs.putUInt("offLen", 0);
    Serial.println(">> Learned VC-02 frames cleared.");
    return;
  }

  handleCommand(command, "", "serial");
}

void saveFrames() {
  prefs.putUInt("onLen", VC02_ON_LEN);
  prefs.putUInt("offLen", VC02_OFF_LEN);
  prefs.putBytes("onFrame", VC02_ON_FRAME, VC02_ON_LEN);
  prefs.putBytes("offFrame", VC02_OFF_FRAME, VC02_OFF_LEN);
}

void loadFrames() {
  VC02_ON_LEN = min((size_t)prefs.getUInt("onLen", 0), VC02_BUF_MAX);
  VC02_OFF_LEN = min((size_t)prefs.getUInt("offLen", 0), VC02_BUF_MAX);

  if (VC02_ON_LEN > 0) {
    prefs.getBytes("onFrame", VC02_ON_FRAME, VC02_ON_LEN);
  }
  if (VC02_OFF_LEN > 0) {
    prefs.getBytes("offFrame", VC02_OFF_FRAME, VC02_OFF_LEN);
  }

  Serial.print("Learned frames: ON=");
  Serial.print(VC02_ON_LEN);
  Serial.print(" bytes, OFF=");
  Serial.print(VC02_OFF_LEN);
  Serial.println(" bytes");
}

bool frameMatches(const uint8_t* frame, size_t frameLen) {
  if (frameLen == 0 || vc02Len != frameLen) {
    return false;
  }

  return memcmp(vc02Buf, frame, frameLen) == 0;
}

void processVc02Frame() {
  Serial.print("VC02 HEX frame:");
  for (size_t i = 0; i < vc02Len; i++) {
    Serial.print(" ");
    if (vc02Buf[i] < 16) Serial.print("0");
    Serial.print(vc02Buf[i], HEX);
  }
  Serial.println();

  if (learnTarget == 1) {
    memcpy(VC02_ON_FRAME, vc02Buf, vc02Len);
    VC02_ON_LEN = vc02Len;
    learnTarget = 0;
    saveFrames();
    Serial.println(">> ON frame learned and saved.");
    return;
  }

  if (learnTarget == 2) {
    memcpy(VC02_OFF_FRAME, vc02Buf, vc02Len);
    VC02_OFF_LEN = vc02Len;
    learnTarget = 0;
    saveFrames();
    Serial.println(">> OFF frame learned and saved.");
    return;
  }

  if (frameMatches(VC02_ON_FRAME, VC02_ON_LEN)) {
    setLight(true, "LIGHT ON", "", "voice");
    return;
  }

  if (frameMatches(VC02_OFF_FRAME, VC02_OFF_LEN)) {
    setLight(false, "LIGHT OFF", "", "voice");
    return;
  }

  // Otherwise accept it only if the whole frame is printable text.
  String text = "";
  for (size_t i = 0; i < vc02Len; i++) {
    uint8_t b = vc02Buf[i];
    if (b == '\r' || b == '\n') {
      continue;
    }
    if (b < 32 || b > 126) {
      Serial.println("VC02 frame is binary and not mapped. Ignored.");
      return;
    }
    text += (char)b;
  }

  handleCommand(text, "", "voice");
}

void readVoiceModule() {
  while (Serial2.available()) {
    uint8_t data = Serial2.read();
    vc02LastByte = millis();

    if (vc02Len < VC02_BUF_MAX) {
      vc02Buf[vc02Len++] = data;
    }
  }

  // A frame ends after a short silence on the UART.
  if (vc02Len > 0 && millis() - vc02LastByte >= VC02_FRAME_GAP_MS) {
    processVc02Frame();
    vc02Len = 0;
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
    testServerConnection();
  } else {
    Serial.print("Wi-Fi failed. Status code ");
    Serial.print(WiFi.status());
    Serial.println(" (1 = SSID not found / 2.4 GHz only, 4 = wrong password, 6 = disconnected).");
    Serial.println("Check WIFI_SSID / WIFI_PASSWORD. ESP32 supports 2.4 GHz only.");
  }
}

void setup() {
  pinMode(RELAY_PIN, OUTPUT);
  pinMode(STATUS_LED_PIN, OUTPUT);
  lightOn = false;
  applyRelay();

  Serial.begin(115200);
  delay(500);

  Serial2.begin(VC02_BAUD, SERIAL_8N1, VC02_RX_PIN, VC02_TX_PIN);

  Serial.println();
  Serial.println("Smart Light ESP32 + VC-02");
  Serial.print("VC-02 UART: ");
  Serial.print(VC02_BAUD);
  Serial.println(" baud (GPIO16 RX, GPIO17 TX)");
  Serial.println("Type LIGHT ON or LIGHT OFF here to test.");
  Serial.println("Type LEARN ON / LEARN OFF, then speak to the VC-02 to teach it.");

  prefs.begin("vc02", false);
  loadFrames();

  connectWiFi();
  sendHeartbeat();
}

void loop() {
  static unsigned long lastWiFiAttempt = 0;

  if (WiFi.status() != WL_CONNECTED && millis() - lastWiFiAttempt >= 10000) {
    lastWiFiAttempt = millis();
    connectWiFi();
  }

  readVoiceModule();
  readSerialVoice();

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
