<?php
declare(strict_types=1);

$portalView = 'gantt';
$portalPageTitle = 'Capacity Timeline';
require __DIR__ . '/includes/header.php';
?>

<div class="panel show analyst-only" id="gantt">
    <div class="cards" id="topCards"></div>
    <div class="gantt" id="ganttBox"></div>
    <div class="legend">
        <span>
            <span class="statusdot busy"></span> Booked
        </span>
        <span>
            <span class="statusdot soon"></span> Free within window
        </span>
        <span>
            <span class="statusdot free"></span> Free now
        </span>
        <span>
            <span class="statusdot potential"></span> Potential client / provisional booking
        </span>
        <span>
            <span class="statusdot leave"></span> On leave (striped bar)
        </span>
        <span>
            <span class="sw" style="background:var(--today)"></span> As-of date
        </span>
        <span>
            <span class="sw" style="background:var(--wknd)"></span> Weekend
        </span>
        <span>Red outline = double-booked or booked over a leave</span>
    </div>
</div>

<?php require __DIR__ . '/includes/footer.php'; ?>
