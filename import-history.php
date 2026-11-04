<?php
declare(strict_types=1);

$portalView = 'importhistory';
$portalPageTitle = 'Import History';
require __DIR__ . '/includes/header.php';
?>

<div class="panel timesheet-detail-panel" id="importhistory">
    <?php require __DIR__ . '/includes/timesheet-period.php'; ?>

    <div class="vbar">
        <div class="view-title">
            <b>Import history and undo</b>
            <span class="vmeta">Review workbook imports and reverse an import when needed.</span>
            <span class="vmeta" data-timesheet-context></span>
        </div>
    </div>
    <div class="detail-table-scroll">
        <table class="dtable" id="msImportHistory"></table>
    </div>
</div>

<?php require __DIR__ . '/includes/footer.php'; ?>
