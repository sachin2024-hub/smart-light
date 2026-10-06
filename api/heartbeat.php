<?php

require "db.php";
jsonHeaders();

$light = isset($_GET["light"]) ? strtoupper(trim($_GET["light"])) : "";

markDeviceSeen($conn);

if ($light === "ON" || $light === "OFF") {
    setLightState($conn, $light);
}

echo json_encode([
    "success" => true,
    "device_online" => true,
    "light" => getLightState($conn),
    "message" => "Heartbeat received."
]);

$conn->close();
