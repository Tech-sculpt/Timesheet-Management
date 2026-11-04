<?php
declare(strict_types=1);

$portalView = 'leaves';
$portalPageTitle = 'Attendance';
require __DIR__ . '/includes/header.php';
?>

<div class="panel analyst-only" id="leaves">
    <div class="cards" id="leaveCards"></div>
    <div class="subh">Annual attendance summary</div>
    <table class="dtable msgrid" id="attendanceSummaryTable"></table>
    <div class="subh">Public holidays</div>
    <table class="dtable" id="attendanceHolidayTable"></table>
    <div class="subh">Planned leaves <span style="font-weight:500;color:var(--muted)">— click a row
            to edit, or use + Leave to add</span>
    </div>
    <table class="dtable" id="leaveTable"></table>
</div>

<?php require __DIR__ . '/includes/footer.php'; ?>
