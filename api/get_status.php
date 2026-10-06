<?php

require "db.php";
jsonHeaders();

resolveStalePending($conn);

$online = isDeviceOnline($conn);
$light = getLightState($conn);

$latestQuery = "
    SELECT
        id,
        voice_command,
        light_action,
        source,
        status,
        created_at,
        DATE_FORMAT(created_at, '%Y-%m-%d') AS command_date,
        DATE_FORMAT(created_at, '%h:%i:%s %p') AS command_time
    FROM command_history
    ORDER BY id DESC
    LIMIT 1
";
$latestResult = $conn->query($latestQuery);
$latest = ($latestResult && $latestResult->num_rows > 0)
    ? $latestResult->fetch_assoc()
    : null;

$historyQuery = "
    SELECT *
    FROM command_history
    ORDER BY id DESC
    LIMIT 50
";
$historyResult = $conn->query($historyQuery);
$history = [];

if ($historyResult) {
    while ($row = $historyResult->fetch_assoc()) {
        $history[] = $row;
    }
}

echo json_encode([
    "success" => true,
    "light" => $light,
    "mode" => $online ? "hardware" : "simulation",
    "device_online" => $online,
    "last_seen" => getLastSeen($conn),
    "device" => getDeviceInfo($conn),
    "latest" => $latest,
    "history" => $history
]);

$conn->close();
