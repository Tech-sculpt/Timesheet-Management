<?php
declare(strict_types=1);

$portalView = 'masterdata';
$portalPageTitle = 'Master Data';
require __DIR__ . '/includes/header.php';
?>

<div class="panel admin-only" id="masterdata">
    <div class="vbar">
        <div class="view-title">
            <b>Master Data</b>
            <span class="vmeta">Live consolidated entries with derived week, month and quarter
                columns</span>
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
    <table class="dtable msgrid" id="masterDataTable"></table>
</div>

<?php require __DIR__ . '/includes/footer.php'; ?>
