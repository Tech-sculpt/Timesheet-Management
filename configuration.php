<?php
declare(strict_types=1);

$portalView = 'config';
$portalPageTitle = 'Configuration';
require __DIR__ . '/includes/header.php';
?>

<div class="panel" id="config">
    <div class="vbar">
        <div class="view-title">
            <b>Configuration</b>
            <span class="vmeta">Choose one area to manage</span>
        </div>
    </div>
    <div class="config-nav" id="configNav">
        <button class="config-link" data-config-perm="employees" data-config-page="employees">
            Employees<small>Users, pods and designations</small>
        </button>
        <button class="config-link" data-config-perm="holidays" data-config-page="holidays">Public
            holidays<small>Calendar configuration</small>
        </button>
        <button class="config-link" data-config-perm="references" data-config-page="references">
            Reference lists<small>Timesheet dropdown values</small>
        </button>
        <button class="config-link" data-config-perm="pricing" data-config-page="pricing">Entity
            pricing<small>Rates by designation</small>
        </button>
        <a class="config-link admin-only" href="access.php">Access management<small>Accounts and
                permissions</small>
        </a>
    </div>
    <section class="config-page" data-config-section="employees">
        <div class="section-title">
            <span>Employee register</span>
            <button class="btn pri" id="cfgAddEmployee">+ Add employee</button>
        </div>
        <table class="dtable" id="cfgEmployees"></table>
        <div class="admin-only">
            <div class="section-title">
                <span>Pods / teams</span>
            </div>
            <div class="vbar">
                <input id="cfgPodName" type="text" maxlength="120" placeholder="New pod name"
                    aria-label="New pod name">
                <button class="btn pri" id="cfgAddPod" type="button">+ Create pod</button>
            </div>
            <table class="dtable" id="cfgPods"></table>
            <p class="hint">Create a pod here, then assign employees to it from the employee
                register.</p>
        </div>
    </section>
    <section class="config-page" data-config-section="holidays">
        <div class="section-title">
            <span>Public holidays</span>
        </div>
        <div class="vbar">
            <input id="cfgHolidayName" placeholder="Holiday name">
            <input type="date" id="cfgHolidayDate">
            <button class="btn pri" id="cfgAddHoliday">Add holiday</button>
        </div>
        <table class="dtable" id="cfgHolidayTable"></table>
    </section>
    <section class="config-page" data-config-section="references">
        <div class="section-title">
            <span>Dropdown reference lists</span>
        </div>
        <div class="vbar">
            <select id="cfgRefCategory">
                <option value="entity">Entity</option>
                <option value="type">Type</option>
                <option value="assignment">Assignment Type</option>
                <option value="work_area">Work Area</option>
                <option value="client">Client Name</option>
            </select>
            <input id="cfgRefValue" placeholder="Add a value">
            <button class="btn pri" id="cfgAddReference">Add value</button>
            <input id="cfgRefSearch" placeholder="Search current list">
        </div>
        <div class="vmeta" id="cfgRefCount"></div>
        <table class="dtable" id="cfgRefTable"></table>
    </section>
    <section class="config-page entity-rate-shell" data-config-section="pricing">
        <div class="section-title">
            <span>Entity pricing by designation</span>
            <small>Select an entity, complete its rate card, then save the whole block</small>
        </div>
        <div class="vbar entity-rate-toolbar">
            <div class="fld">
                <label>Rate-card entity</label>
                <select id="cfgPriceEntity"></select>
            </div>
            <div class="view-actions">
                <span class="vmeta" id="cfgPriceStatus"></span>
                <button class="btn pri" id="cfgSavePrice">Save all rates</button>
            </div>
        </div>
        <datalist id="designationList"></datalist>
        <div class="entity-rate-block">
            <div class="section-title">
                <span id="cfgPriceBlockTitle">Entity rate card</span>
                <small id="cfgPriceBlockCount"></small>
            </div>
            <table class="dtable" id="cfgPricingTable"></table>
            <p class="rate-grid-help">Type or paste rates from Excel. Use <b>Enter</b>, <b>
                    Shift+Enter</b>, or arrow keys to move between designation rows. Blank rates are
                removed when saved.</p>
        </div>
    </section>

</div>

<?php require __DIR__ . '/includes/footer.php'; ?>
