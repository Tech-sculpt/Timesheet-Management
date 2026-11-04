<?php
declare(strict_types=1);

$portalView = 'mysheet';
$portalPageTitle = 'Timesheet';
require __DIR__ . '/includes/header.php';
?>

<div class="panel" id="mysheet">
    <?php require __DIR__ . '/includes/timesheet-period.php'; ?>
    <div class="vnote import-errors" id="msImportErrors" hidden></div>
    <button class="btn" id="msImportErrorsDownload" hidden>Download import errors (.txt)</button>
    <div class="cards compact-cards" id="msCards"></div>
    <div class="section-title timesheet-entries-head">
        <div>
            <span id="msEntriesTitle">Timesheet entries</span>
            <small>Same columns as the Excel workbook</small>
        </div>
        <div class="view-actions">
            <button class="btn pri" id="msSave" type="button">Save timesheet</button>
            <span class="vmeta" id="msSaveStatus" role="status" aria-live="polite"></span>
            <button class="btn" id="msImportBtn">Import my timesheet</button>
            <button class="btn" id="msTemplate">Download template</button>
            <button class="btn" id="msUndo" title="Undo last timesheet change (Ctrl+Z)" disabled>↶
                Undo</button>
            <button class="btn" id="msRedo" title="Redo last undone timesheet change (Ctrl+Y)"
                disabled>↷ Redo</button>
            <button class="btn" id="msFill">Fill booked days</button>
            <button class="btn" id="msDownload">Download</button>
            <button class="btn manager-only" id="msDownloadAll">Visible timesheets</button>
        </div>
    </div>
    <div class="msgrid">
        <table class="dtable msgrid" id="msSheet"></table>
    </div>
    <datalist id="msEntities"></datalist>
    <datalist id="msTypes"></datalist>
    <datalist id="msBillingPeople"></datalist>
    <datalist id="msClients"></datalist>
    <datalist id="msAsg"></datalist>
    <datalist id="msArea"></datalist>
    <div class="entry-help">
        <p class="hint" id="msEntryHint">Enter your actual work below. Start and end times calculate
            hours automatically.</p>
        <span class="sheet-shortcuts" id="msShortcuts"></span>
    </div>

</div>

<?php require __DIR__ . '/includes/footer.php'; ?>
