<?php
declare(strict_types=1);

$portalView = 'auditcheck';
$portalPageTitle = 'Audit Check';
require __DIR__ . '/includes/header.php';
?>

<div class="panel" id="auditcheck">
    <div class="vbar">
        <div class="view-title">
            <b>Audit Check</b>
            <span class="vmeta">Minimum audit-hours threshold monitor</span>
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
    <table class="dtable" id="auditCheckTable"></table>
</div>

<?php require __DIR__ . '/includes/footer.php'; ?>
