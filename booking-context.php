<?php
declare(strict_types=1);

$portalView = 'bookingcontext';
$portalPageTitle = 'Booking & Leave Context';
require __DIR__ . '/includes/header.php';
?>

<div class="panel timesheet-detail-panel" id="bookingcontext">
    <?php require __DIR__ . '/includes/timesheet-period.php'; ?>

    <div class="vbar">
        <div class="view-title">
            <b>Booking and leave context</b>
            <span class="vmeta">Bookings and approved leave for the timesheet employee and period.
            </span>
            <span class="vmeta" data-timesheet-context></span>
        </div>
    </div>
    <div class="subh">Where you are booked</div>
    <div class="detail-table-scroll">
        <table class="dtable" id="msBookings"></table>
    </div>
    <div id="msLeave" class="msnote" style="margin-top:14px"></div>
</div>

<?php require __DIR__ . '/includes/footer.php'; ?>
