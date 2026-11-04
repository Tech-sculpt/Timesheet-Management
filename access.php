<?php
declare(strict_types=1);

$portalView = 'access';
$portalPageTitle = 'Access Management';
require __DIR__ . '/includes/header.php';
?>

<div class="panel admin-only" id="access">
    <div class="vbar">
        <div class="view-title">
            <b>Access management</b>
            <span class="vmeta">Administrator accounts, employee access and manager permissions
            </span>
        </div>
    </div>
    <button class="btn" id="manageAccessBtn" type="button">Manage employee access and passwords
    </button>
    <section class="config-page show" data-config-section="permissions">
        <div class="section-title">
            <span>Administrator accounts</span>
        </div>
        <div class="config-form">
            <p class="hint">Create a second administrator with a separate email and MFA sign-in. The
                new account receives a temporary password.</p>
            <div class="vbar">
                <input id="cfgAdminName" type="text" placeholder="Full name" autocomplete="off">
                <input id="cfgAdminEmail" type="email" placeholder="Work email" autocomplete="off">
                <button class="btn pri" id="cfgAddAdmin">Create administrator</button>
            </div>
            <table class="dtable" id="cfgAdminsTable"></table>
        </div>
        <div class="section-title">
            <span>Manager Config access</span>
        </div>
        <table class="dtable" id="cfgPermissionsTable"></table>
    </section>
</div>

<?php require __DIR__ . '/includes/footer.php'; ?>
