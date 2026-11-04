<?php
declare(strict_types=1);

$portalView = 'kpiengine';
$portalPageTitle = 'KPI Engine';
require __DIR__ . '/includes/header.php';
?>

<div class="panel" id="kpiengine">
    <div class="vbar">
        <b>KPI Engine</b>
        <div class="fld">
            <label>Employee</label>
            <select id="kpiEmployee"></select>
        </div>
        <div class="fld">
            <label>Entity</label>
            <select id="kpiEntity"></select>
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
    <div class="cards" id="kpiCards"></div>
    <div class="subh">Week-by-week breakdown</div>
    <table class="dtable" id="kpiWeekTable"></table>
</div>

<?php require __DIR__ . '/includes/footer.php'; ?>
