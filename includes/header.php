<?php require __DIR__ . '/bootstrap.php'; ?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?= htmlspecialchars($portalPageTitle, ENT_QUOTES, 'UTF-8') ?> | Reckoner Portal</title>
    <script nonce="<?= htmlspecialchars(
        $cspNonce,
        ENT_QUOTES,
        'UTF-8',
    ) ?>" src="assets/exceljs.min.js?v=4.4.0"
        integrity="sha512-dlPw+ytv/6JyepmelABrgeYgHI0O+frEwgfnPdXDTOIZz+eDgfW07QXG02/O8COfivBdGNINy+Vex+lYmJ5rxw=="></script>
    <script nonce="<?= htmlspecialchars(
        $cspNonce,
        ENT_QUOTES,
        'UTF-8',
    ) ?>" src="assets/workbook-calculations.js?v=<?= substr(
    hash_file('sha256', dirname(__DIR__) . '/assets/workbook-calculations.js'),
    0,
    16,
) ?>"></script>
    <link rel="stylesheet" href="assets/portal.css?v=<?= substr(
        hash_file('sha256', dirname(__DIR__) . '/assets/portal.css'),
        0,
        16,
    ) ?>">
</head>
<body class="gated sidebar-collapsed">
    <header>
        <div class="header-left">
            <button class="sidebar-toggle" id="sidebarToggle" type="button"
                aria-controls="portalNav" aria-expanded="false" aria-label="Expand side menu"
                title="Expand side menu">
                <span aria-hidden="true">☰</span>
            </button>
            <div class="header-brand">
                <img src="reckoner-logo.png" alt="Reckoner Audit">
                <div>
                    <h1>Resource &amp; Timesheet Portal</h1>
                    <p>Plan team capacity, record time and review performance in one place.</p>
                </div>
            </div>
        </div>
        <div class="sessbar">
            <time class="uk-clock" id="ukClock" aria-label="Current UK time">UK time</time>
            <span class="who" id="whoami">Not signed in</span>
            <button class="btn" id="signOutBtn">Sign out</button>
        </div>
    </header>

    <div class="wrap">
        <section class="portal-welcome" aria-label="Welcome">
            <div>
                <h2 id="portalGreeting">Welcome back!</h2>
                <p>Plan team capacity, record time and review performance in one place.</p>
            </div>
            <div class="toolbar-actions">
                <button class="btn pri manager-only" id="addBookingBtn">+ Booking</button>
                <button class="btn admin-only" id="addPersonBtn">+ Person</button>
                <button class="btn manager-only" id="addLeaveBtn">+ Leave</button>
                <button class="btn admin-only" id="excelBtn">Export</button>
                <button class="btn admin-only" id="analysisBtn">Analysis</button>
                <button class="btn admin-only" id="exportBtn">Backup</button>
            </div>
        </section>
        <div class="bar portal-bar">
            <div class="toolbar-row">
                <div class="toolbar-filters">
                    <div class="fld admin-only">
                        <label>From</label>
                        <input type="date" id="rangeStart">
                    </div>
                    <div class="fld admin-only">
                        <label>To</label>
                        <input type="date" id="rangeEnd">
                    </div>
                    <div class="fld admin-only"
                        title="Capacity status is calculated on this date; KPI reports use their own From and To dates.">
                        <label>Capacity date</label>
                        <input type="date" id="asOf" aria-label="Capacity status date">
                    </div>
                    <div class="fld admin-only">
                        <label>Free within</label>
                        <input type="number" id="soonDays" value="3" min="0" max="60"
                            style="width:58px">
                        <label>days</label>
                    </div>
                </div>
            </div>
            <div class="tabs workbook-tabs" id="portalNav" aria-label="Main navigation">
                <a class="tab active" href="timesheet.php" data-tab="mysheet">Timesheet</a>
                <a class="tab" href="import-history.php" data-tab="importhistory">Import history
                    &amp; undo</a>
                <a class="tab" href="booking-context.php" data-tab="bookingcontext">Booking &amp;
                    leave context</a>
                <a class="tab" href="booked-vs-actual.php" data-tab="variance">Booked vs Actual</a>
                <a class="tab" href="weekly-hours.php" data-tab="weeklyhours">Weekly Hours &amp;
                    Overtime</a>
                <a class="tab manager-only" href="cross-pod.php" data-tab="crosspod">Cross Pod</a>
                <div class="menu-group analyst-only">
                    <button class="menu-trigger" type="button">Planning</button>
                    <div class="menu-pop">
                        <a class="tab" href="attendance.php" data-tab="leaves">Attendance</a>
                        <a class="tab" href="capacity-timeline.php" data-tab="gantt">Capacity
                            Timeline</a>
                        <a class="tab" href="capacity-status.php" data-tab="dash">Capacity Status
                        </a>
                    </div>
                </div>
                <div class="menu-group analyst-only">
                    <button class="menu-trigger" type="button">Performance</button>
                    <div class="menu-pop">
                        <a class="tab" href="kpi.php" data-tab="kpiengine">KPI Engine</a>
                        <a class="tab" href="employee-view.php" data-tab="tsdashboard">Employee View
                        </a>
                        <a class="tab" href="client-view.php" data-tab="clientview">Client View</a>
                        <a class="tab" href="audit-check.php" data-tab="auditcheck">Audit Check</a>
                        <a class="tab" href="dashboard.php" data-tab="workbookdashboard">Dashboard
                        </a>
                        <a class="tab admin-only" href="master-data.php" data-tab="masterdata">
                            Master Data</a>
                    </div>
                </div>
                <a class="tab manager-only" href="billing.php" data-tab="firms">Firms &amp; Billing
                </a>
                <button class="tab theme-toggle" id="themeToggle" type="button"
                    aria-pressed="false">☾ Dark mode</button>
                <a class="tab admin-only" href="access.php" data-tab="access">Access</a>
                <a class="tab config-tab" href="configuration.php" data-tab="config">Config</a>
            </div>
        </div>
