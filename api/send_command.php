<?php

require "db.php";
jsonHeaders();

resolveStalePending($conn);

$input = [];

if ($_SERVER["REQUEST_METHOD"] === "POST") {
    $raw = file_get_contents("php://input");
    $decoded = json_decode($raw, true);

    if (is_array($decoded)) {
        $input = $decoded;
    } else {
        $input = $_POST;
    }
} else {
    $input = $_GET;
}

$command = isset($input["command"]) ? trim($input["command"]) : "";
$source = isset($input["source"]) ? trim($input["source"]) : "dashboard";

if ($command === "") {
    echo json_encode([
        "success" => false,
        "message" => "Missing command. Say LIGHT ON or LIGHT OFF."
    ]);
    exit;
}

$allowedSources = ["voice", "button", "dashboard", "esp32", "serial"];
if (!in_array($source, $allowedSources, true)) {
    $source = "dashboard";
}

$action = parseLightAction($command);

if ($action === null) {
    $id = saveCommand($conn, $command, "NONE", $source, "Unknown command");

    echo json_encode([
        "success" => false,
        "saved" => true,
        "id" => $id,
        "voice_command" => $command,
        "light_action" => "NONE",
        "source" => $source,
        "status" => "Unknown command",
        "message" => "Unknown command. Try LIGHT ON or LIGHT OFF."
    ]);
    $conn->close();
    exit;
}

$online = isDeviceOnline($conn);

if ($online) {
    $status = "Pending";
    $message = "Command sent to ESP32.";
} else {
    $status = "Successful (Simulated)";
    $message = "No ESP32 connected. Command simulated on dashboard.";
    setLightState($conn, $action);
}

$id = saveCommand($conn, $command, $action, $source, $status);

echo json_encode([
    "success" => true,
    "id" => $id,
    "voice_command" => $command,
    "light_action" => $action,
    "source" => $source,
    "status" => $status,
    "mode" => $online ? "hardware" : "simulation",
    "message" => $message
]);

$conn->close();
