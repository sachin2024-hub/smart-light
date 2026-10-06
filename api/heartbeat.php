<?php

require "db.php";
jsonHeaders();

$light = isset($_GET["light"]) ? strtoupper(trim($_GET["light"])) : "";

markDeviceSeen($conn);

if ($light === "ON" || $light === "OFF") {
    setLightState($conn, $light);
}

$ip = isset($_GET["ip"]) ? substr(trim($_GET["ip"]), 0, 45) : "";
$ssid = isset($_GET["ssid"]) ? substr(trim($_GET["ssid"]), 0, 64) : "";
$mac = isset($_GET["mac"]) ? substr(trim($_GET["mac"]), 0, 32) : "";
$firmware = isset($_GET["fw"]) ? substr(trim($_GET["fw"]), 0, 20) : "";
$rssi = isset($_GET["rssi"]) && $_GET["rssi"] !== "" ? intval($_GET["rssi"]) : null;
$uptime = isset($_GET["uptime"]) && $_GET["uptime"] !== "" ? intval($_GET["uptime"]) : null;
$heap = isset($_GET["heap"]) && $_GET["heap"] !== "" ? intval($_GET["heap"]) : null;

if ($ip !== "" || $ssid !== "" || $mac !== "") {
    saveDeviceTelemetry($conn, [
        "ip_address" => $ip !== "" ? $ip : null,
        "ssid" => $ssid !== "" ? $ssid : null,
        "rssi" => $rssi,
        "mac_address" => $mac !== "" ? $mac : null,
        "uptime_seconds" => $uptime,
        "free_heap" => $heap,
        "firmware" => $firmware !== "" ? $firmware : "1.0.0"
    ]);
}

echo json_encode([
    "success" => true,
    "device_online" => true,
    "light" => getLightState($conn),
    "message" => "Heartbeat received."
]);

$conn->close();
