<?php
declare(strict_types=1);

$portalView = 'workbookdashboard';
$portalPageTitle = 'Dashboard';
require __DIR__ . '/includes/header.php';
?>

<div class="panel" id="workbookdashboard">
    <div class="vbar">
        <div class="view-title">
            <b>Workforce Performance Dashboard</b>
            <span class="vmeta">Executive summary for the selected period</span>
        </div>
        <div class="performance-filter">
            <label>From
                <input type="date" data-performance-from>
            </label>
            <label>To
                <input type="date" data-performance-to>
            </label>
        </div>
    </div>
    <div class="cards" id="workbookDashCards"></div>
    <div class="row2">
        <div>
            <div class="subh">Hours split</div>
            <table class="dtable" id="dashHoursSplit"></table>
        </div>
        <div>
            <div class="subh">Top clients by hours</div>
            <table class="dtable" id="dashTopClients"></table>
        </div>
    </div>
    <div class="subh">Overall status</div>
    <div class="vnote" id="dashRag"></div>
</div>

<?php require __DIR__ . '/includes/footer.php'; ?>
