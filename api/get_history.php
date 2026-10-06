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

$totalResult = $conn->query("SELECT COUNT(*) AS total FROM command_history");
$totalRow = $totalResult ? $totalResult->fetch_assoc() : ["total" => 0];
$total = intval($totalRow["total"]);
$pages = $total > 0 ? (int) ceil($total / $perPage) : 1;

if ($page > $pages) {
    $page = $pages;
}

$offset = ($page - 1) * $perPage;

$historyQuery = "
    SELECT *
    FROM command_history
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
