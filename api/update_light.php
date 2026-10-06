<?php

require "db.php";
jsonHeaders();

$status = isset($_GET["status"]) ? strtoupper(trim($_GET["status"])) : "";
$command = isset($_GET["command"]) ? trim($_GET["command"]) : "";
$source = isset($_GET["source"]) ? trim($_GET["source"]) : "esp32";
$id = isset($_GET["id"]) ? intval($_GET["id"]) : 0;

if ($status !== "ON" && $status !== "OFF") {
    echo json_encode([
        "success" => false,
        "message" => "Invalid status. Use ON or OFF."
    ]);
    exit;
}

if ($command === "") {
    $command = $status === "ON" ? "LIGHT ON" : "LIGHT OFF";
}

markDeviceSeen($conn);
setLightState($conn, $status);

if ($id <= 0) {
    $existing = $conn->query("
        SELECT id
        FROM command_history
        WHERE status IN ('Pending', 'Executing')
        ORDER BY id ASC
        LIMIT 1
    ");

    if ($existing && $existing->num_rows > 0) {
        $row = $existing->fetch_assoc();
        $id = intval($row["id"]);
    }
}

if ($id > 0) {
    $stmt = $conn->prepare("
        UPDATE command_history
        SET status = 'Successful', light_action = ?, voice_command = ?
        WHERE id = ?
    ");
    $stmt->bind_param("ssi", $status, $command, $id);
    $stmt->execute();
    $stmt->close();
} else {
    $id = saveCommand($conn, $command, $status, $source, "Successful");
}

echo json_encode([
    "success" => true,
    "id" => $id,
    "voice_command" => $command,
    "light_action" => $status,
    "source" => $source,
    "message" => "Light status updated."
]);

$conn->close();
