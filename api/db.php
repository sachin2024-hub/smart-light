<?php

$host = "localhost";
$username = "root";
$password = "";
$database = "smart_light_db";

function jsonHeaders()
{
    header("Content-Type: application/json");
    header("Access-Control-Allow-Origin: *");
    header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type");
}

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    jsonHeaders();
    exit;
}

$conn = new mysqli($host, $username, $password);

if ($conn->connect_error) {
    jsonHeaders();
    echo json_encode([
        "success" => false,
        "message" => "Database server connection failed."
    ]);
    exit;
}

$conn->query("CREATE DATABASE IF NOT EXISTS `$database` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
$conn->select_db($database);
$conn->set_charset("utf8mb4");

$conn->query("
    CREATE TABLE IF NOT EXISTS command_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        voice_command VARCHAR(255) NOT NULL,
        light_action ENUM('ON', 'OFF') NOT NULL,
        source VARCHAR(50) NOT NULL DEFAULT 'dashboard',
        status VARCHAR(50) NOT NULL DEFAULT 'Successful',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
");

$conn->query("
    CREATE TABLE IF NOT EXISTS device_status (
        id INT PRIMARY KEY,
        light_state ENUM('ON', 'OFF') NOT NULL DEFAULT 'OFF',
        last_seen DATETIME NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
");

$conn->query("INSERT IGNORE INTO device_status (id, light_state) VALUES (1, 'OFF')");

$sourceColumn = $conn->query("SHOW COLUMNS FROM command_history LIKE 'source'");
if ($sourceColumn && $sourceColumn->num_rows === 0) {
    $conn->query("ALTER TABLE command_history ADD COLUMN source VARCHAR(50) NOT NULL DEFAULT 'dashboard' AFTER light_action");
}

$commandColumn = $conn->query("SHOW COLUMNS FROM command_history LIKE 'voice_command'");
if ($commandColumn && $commandColumn->num_rows > 0) {
    $column = $commandColumn->fetch_assoc();
    if (stripos($column["Type"], "varchar(255)") === false) {
        $conn->query("ALTER TABLE command_history MODIFY voice_command VARCHAR(255) NOT NULL");
    }
}

$statusColumn = $conn->query("SHOW COLUMNS FROM command_history LIKE 'status'");
if ($statusColumn && $statusColumn->num_rows > 0) {
    $column = $statusColumn->fetch_assoc();
    if (stripos($column["Type"], "varchar(50)") === false) {
        $conn->query("ALTER TABLE command_history MODIFY status VARCHAR(50) NOT NULL DEFAULT 'Successful'");
    }
}

function isDeviceOnline($conn)
{
    $result = $conn->query("
        SELECT last_seen,
               TIMESTAMPDIFF(SECOND, last_seen, NOW()) AS age_seconds
        FROM device_status
        WHERE id = 1
    ");

    if (!$result || $result->num_rows === 0) {
        return false;
    }

    $row = $result->fetch_assoc();

    if (empty($row["last_seen"]) || $row["age_seconds"] === null) {
        return false;
    }

    $age = intval($row["age_seconds"]);
    return $age >= 0 && $age <= 10;
}

function getLightState($conn)
{
    $result = $conn->query("SELECT light_state, last_seen FROM device_status WHERE id = 1");

    if (!$result || $result->num_rows === 0) {
        return "OFF";
    }

    $row = $result->fetch_assoc();
    return $row["light_state"];
}

function getLastSeen($conn)
{
    $result = $conn->query("SELECT last_seen FROM device_status WHERE id = 1");

    if (!$result || $result->num_rows === 0) {
        return null;
    }

    $row = $result->fetch_assoc();
    return $row["last_seen"];
}

function setLightState($conn, $state)
{
    $stmt = $conn->prepare("UPDATE device_status SET light_state = ? WHERE id = 1");
    $stmt->bind_param("s", $state);
    $stmt->execute();
    $stmt->close();
}

function markDeviceSeen($conn)
{
    $conn->query("UPDATE device_status SET last_seen = NOW() WHERE id = 1");
}

function resolveStalePending($conn)
{
    if (isDeviceOnline($conn)) {
        return;
    }

    $conn->query("
        UPDATE command_history
        SET status = 'Successful (Simulated)'
        WHERE status IN ('Pending', 'Executing')
    ");
}

function parseLightAction($command)
{
    $text = strtolower(trim($command));
    $text = preg_replace("/[^a-z0-9\s]/", " ", $text);
    $text = preg_replace("/\s+/", " ", $text);

    $offPhrases = [
        "light off",
        "lights off",
        "turn off",
        "switch off",
        "suga off",
        "i off",
        "palong",
        "patay",
        "off"
    ];

    $onPhrases = [
        "light on",
        "lights on",
        "turn on",
        "switch on",
        "suga on",
        "i on",
        "bukas",
        "on"
    ];

    foreach ($offPhrases as $phrase) {
        if (preg_match("/\b" . preg_quote($phrase, "/") . "\b/", $text)) {
            return "OFF";
        }
    }

    foreach ($onPhrases as $phrase) {
        if (preg_match("/\b" . preg_quote($phrase, "/") . "\b/", $text)) {
            return "ON";
        }
    }

    return null;
}

function saveCommand($conn, $voiceCommand, $action, $source, $status)
{
    $stmt = $conn->prepare("
        INSERT INTO command_history (voice_command, light_action, source, status)
        VALUES (?, ?, ?, ?)
    ");
    $stmt->bind_param("ssss", $voiceCommand, $action, $source, $status);
    $stmt->execute();
    $id = $stmt->insert_id;
    $stmt->close();

    return $id;
}
