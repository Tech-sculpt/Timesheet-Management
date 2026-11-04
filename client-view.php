<?php
declare(strict_types=1);

$portalView = 'clientview';
$portalPageTitle = 'Client View';
require __DIR__ . '/includes/header.php';
?>

<div class="panel" id="clientview">
    <div class="vbar">
        <div class="view-title">
            <b>Client View</b>
            <span class="vmeta">Hours and billing analysis per client</span>
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
    <div class="cards" id="clientViewCards"></div>
    <table class="dtable" id="clientViewTable"></table>
</div>

<?php require __DIR__ . '/includes/footer.php'; ?>
