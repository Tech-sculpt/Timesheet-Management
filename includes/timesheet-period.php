<div class="vbar">
    <div class="view-title">
        <b id="msTitle"><?= htmlspecialchars($portalPageTitle, ENT_QUOTES, 'UTF-8') ?></b>
        <span class="vmeta">Period <b id="msPeriod"></b> · <?= $portalView === 'mysheet'
            ? 'changes save automatically or with Save timesheet'
            : 'selected employee and period' ?></span>
    </div>
    <select id="msWho"
        style="padding:7px 9px;border:1px solid var(--line);border-radius:8px;font-size:13px">
    </select>
    <div class="sheet-period">
        <label>From
            <input type="date" id="msFrom">
        </label>
        <label>To
            <input type="date" id="msTo">
        </label>
    </div>
</div>
