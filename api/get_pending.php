<?php

require "db.php";
jsonHeaders();

markDeviceSeen($conn);

$pending = null;

$conn->begin_transaction();

$result = $conn->query("
    SELECT *
    FROM command_history
    WHERE status = 'Pending'
      AND light_action IN ('ON', 'OFF')
    ORDER BY id ASC
    LIMIT 1
    FOR UPDATE
");

if ($result && $result->num_rows > 0) {
    $pending = $result->fetch_assoc();
    $id = intval($pending["id"]);
    $conn->query("UPDATE command_history SET status = 'Executing' WHERE id = $id");
}

$conn->commit();

echo json_encode([
    "success" => true,
    "pending" => $pending
]);

$conn->close();
