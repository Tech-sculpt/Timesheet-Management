<?php
declare(strict_types=1);

$portalView = 'tsdashboard';
$portalPageTitle = 'Employee View';
require __DIR__ . '/includes/header.php';
?>

<div class="panel analyst-only" id="tsdashboard">
    <div class="vbar">
        <div class="view-title">
            <b>Employee View</b>
            <span class="vmeta">Workbook-aligned performance columns · selected period</span>
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
    <div class="cards" id="tsdCards"></div>
    <table class="dtable" id="tsdTable"></table>
</div>

<?php require __DIR__ . '/includes/footer.php'; ?>
