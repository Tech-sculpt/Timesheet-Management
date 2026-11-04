<?php
declare(strict_types=1);

$portalView = 'variance';
$portalPageTitle = 'Booked vs Actual';
require __DIR__ . '/includes/header.php';
?>

<div class="panel" id="variance">
    <div class="vbar">
        <div class="view-title">
            <b>Booked vs Actual</b>
            <span class="vmeta">Recovery and exception review for the selected period</span>
        </div>
        <div class="view-actions">
            <button class="btn pri admin-only" id="tsUploadBtn">Import timesheet</button>
            <button class="btn" id="vExport">Export report</button>
        </div>
    </div>
    <div class="variance-meta">
        <span class="vmeta" id="tsInfo">No timesheet data yet</span>
        <details class="variance-settings manager-only">
            <summary>Comparison settings</summary>
            <div class="variance-controls">
                <div class="fld">
                    <label>Hours per booked day</label>
                    <input type="number" id="vHours" step="0.5" min="0" style="width:70px">
                </div>
                <div class="fld">
                    <label>Tolerance</label>
                    <input type="number" id="vThr" value="10" min="0" max="100" style="width:60px">
                    <span class="vmeta">%</span>
                </div>
                <label class="chk">
                    <input type="checkbox" id="vPot"> Include potential bookings
                </label>
                <button class="btn danger" id="tsClear" style="display:none">Delete imported rows
                </button>
            </div>
        </details>
    </div>
    <div class="vnote" id="vWarn" style="display:none"></div>
    <div class="vnote import-errors" id="vImportErrors" hidden></div>
    <button class="btn" id="vImportErrorsDownload" hidden>Download import errors (.txt)</button>
    <div class="cards compact-cards" id="vCards"></div>
    <div class="section-title">
        <span>Employee recovery</span>
        <small>Negative variance means booked time was not logged</small>
    </div>
    <table class="dtable report-table" id="vTable"></table>
    <details class="context-box variance-exceptions">
        <summary>Day-level exceptions <span id="vExceptionCount"></span>
        </summary>
        <div class="context-content">
            <table class="dtable report-table" id="vDayTable"></table>
        </div>
    </details>
</div>

<?php require __DIR__ . '/includes/footer.php'; ?>
