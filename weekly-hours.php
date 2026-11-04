<?php
declare(strict_types=1);

$portalView = 'weeklyhours';
$portalPageTitle = 'Weekly Hours & Overtime';
require __DIR__ . '/includes/header.php';
?>

<div class="panel timesheet-detail-panel" id="weeklyhours">
    <div class="vbar">
        <div class="view-title">
            <b>Weekly Hours &amp; Overtime</b>
            <span class="vmeta" id="weeklyPeriod"></span>
        </div>
        <select id="weeklyPerson" aria-label="Employee"></select>
        <div class="sheet-period">
            <label>From
                <input type="date" id="weeklyFrom" required>
            </label>
            <label>To
                <input type="date" id="weeklyTo" required>
            </label>
        </div>
    </div>
    <p class="vmeta">
        <b>Expected hours = working days logged × 8</b>, less recorded leave on those days. For
        example, 17 full days = 136 hours. Working days with no logged work are shown separately as
        missing days and missing hours. Weekends, public holidays and full-day leave are excluded
        from missing time.
    </p>
    <p class="vmeta">Weekend days worked counts each Saturday or Sunday with logged work once per
        employee. Weekend hours are already included in actual hours and overtime. Weekday public
        holidays are excluded from these weekend figures.</p>
    <div class="cards compact-cards" id="weeklyCards"></div>
    <div class="subh">Comparison for selected dates and employee</div>
    <div style="overflow-x:auto">
        <table class="dtable report-table" id="weeklyTable"></table>
    </div>
    <div class="subh">Daily breakdown</div>
    <p class="vmeta">Overtime is extra work above the daily target, including weekend and public
        holiday work. Short hours means hours below target on days with logged work. Missing time
        counts only past working days; today and future days are not marked missing.</p>
    <div style="overflow-x:auto">
        <table class="dtable report-table" id="weeklyDays"></table>
    </div>
</div>

<?php require __DIR__ . '/includes/footer.php'; ?>
