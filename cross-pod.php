<?php
declare(strict_types=1);

$portalView = 'crosspod';
$portalPageTitle = 'Cross Pod';
require __DIR__ . '/includes/header.php';
?>

<div class="panel manager-only" id="crosspod">
    <div class="vbar">
        <div class="view-title">
            <b>Cross Pod</b>
            <span class="vmeta" id="cpSubtitle">My pod employees working for another pod</span>
        </div>
        <div class="fld admin-only" id="cpPodWrap">
            <label>Pod</label>
            <select id="cpPod"></select>
        </div>
        <div class="sheet-period">
            <label>From
                <input type="date" id="cpFrom">
            </label>
            <label>To
                <input type="date" id="cpTo">
            </label>
        </div>
    </div>
    <div class="vbar" id="cpModeTabs">
        <button class="btn pri" data-cp-mode="outgoing">My pod working out</button>
        <button class="btn" data-cp-mode="incoming">Other pods working in</button>
    </div>
    <div class="cards compact-cards" id="cpCards"></div>
    <div class="section-title">
        <span id="cpTableTitle">My pod working for another pod</span>
        <small>Based on the Billing As employee selected in each row</small>
    </div>
    <table class="dtable report-table" id="cpTable"></table>
</div>

<?php require __DIR__ . '/includes/footer.php'; ?>
