<?php

require "db.php";
jsonHeaders();

resolveStalePending($conn);

$allowed = [5, 10, 15, 20, 25, 50, 75, 100];
$perPage = isset($_GET["per_page"]) ? intval($_GET["per_page"]) : 10;
$page = isset($_GET["page"]) ? intval($_GET["page"]) : 1;

if (!in_array($perPage, $allowed, true)) {
    $perPage = 10;
}

if ($page < 1) {
    $page = 1;
}

$source = isset($_GET["source"]) ? strtolower(trim($_GET["source"])) : "";
$allowedSources = ["voice", "button", "dashboard", "esp32", "serial"];
$sourceFilter = in_array($source, $allowedSources, true) ? $source : "";

$action = isset($_GET["action"]) ? strtoupper(trim($_GET["action"])) : "";
$actionFilter = ($action === "ON" || $action === "OFF") ? $action : "";

$date = isset($_GET["date"]) ? trim($_GET["date"]) : "";
$dateFilter = preg_match("/^\d{4}-\d{2}-\d{2}$/", $date) ? $date : "";

$search = isset($_GET["q"]) ? trim($_GET["q"]) : "";
if (strlen($search) > 80) {
    $search = substr($search, 0, 80);
}

$clauses = [];

if ($sourceFilter !== "") {
    $clauses[] = "source = '" . $conn->real_escape_string($sourceFilter) . "'";
}

if ($actionFilter !== "") {
    $clauses[] = "light_action = '" . $conn->real_escape_string($actionFilter) . "'";
}

if ($dateFilter !== "") {
    $clauses[] = "DATE(created_at) = '" . $conn->real_escape_string($dateFilter) . "'";
}

if ($search !== "") {
    $clauses[] = "voice_command LIKE '%" . $conn->real_escape_string($search) . "%'";
}

$whereSql = count($clauses) > 0 ? ("WHERE " . implode(" AND ", $clauses)) : "";

$totalResult = $conn->query("SELECT COUNT(*) AS total FROM command_history $whereSql");
$totalRow = $totalResult ? $totalResult->fetch_assoc() : ["total" => 0];
$total = intval($totalRow["total"]);
$pages = $total > 0 ? (int) ceil($total / $perPage) : 1;

if ($page > $pages) {
    $page = $pages;
}

$offset = ($page - 1) * $perPage;

$historyQuery = "
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
    $whereSql
    ORDER BY id DESC
    LIMIT $perPage OFFSET $offset
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
    "history" => $history,
    "total" => $total,
    "page" => $page,
    "per_page" => $perPage,
    "pages" => $pages
]);

$conn->close();
