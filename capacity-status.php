<?php
declare(strict_types=1);

$portalView = 'dash';
$portalPageTitle = 'Capacity Status';
require __DIR__ . '/includes/header.php';
?>

<div class="panel analyst-only" id="dash">
    <div class="cards" id="dashCards"></div>
    <div class="subh">All staff — status on as-of date</div>
    <table class="dtable" id="statusTable"></table>
    <div class="subh">By client / assignment</div>
    <table class="dtable" id="clientTable"></table>
</div>

<?php require __DIR__ . '/includes/footer.php'; ?>
