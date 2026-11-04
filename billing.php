<?php
declare(strict_types=1);

$portalView = 'firms';
$portalPageTitle = 'Firms & Billing';
require __DIR__ . '/includes/header.php';
?>

<div class="panel manager-only" id="firms">
    <div class="vbar">
        <span class="vmeta">Billing comes from <b>every worked timesheet row</b>. A booking link is
            optional; rates come from Entity Pricing using the Billing As employee’s designation.
        </span>
        <button class="btn pri" id="fExport" style="margin-left:auto">📤 Export billing</button>
    </div>
    <div class="cards" id="fCards"></div>
    <div class="subh">Billing by entity</div>
    <table class="dtable" id="fTable"></table>
    <div class="subh">Timesheet billing detail <span style="font-weight:500;color:var(--muted)">—
            includes entries without a booking</span>
    </div>
    <table class="dtable" id="fJobs"></table>
    <div class="subh">Flags</div>
    <table class="dtable" id="fFlags"></table>
</div>

<?php require __DIR__ . '/includes/footer.php'; ?>
