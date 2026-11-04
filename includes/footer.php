</div>

<input type="file" id="tsFile" accept=".xlsx,.xlsm" multiple hidden>

<div class="modal" id="bModal">
    <div class="sheet">
        <h3 id="bTitle">Add booking</h3>
        <div class="frm">
            <div class="row2">
                <div>
                    <label>Person on the booking (billed as)</label>
                    <select id="bPerson"></select>
                </div>
                <div>
                    <label>Firm / channel</label>
                    <input type="text" id="bFirm" list="firmList" placeholder="Reckoner">
                    <datalist id="firmList"></datalist>
                </div>
            </div>
            <label>Client / assignment</label>
            <input type="text" id="bClient" list="clientList"
                placeholder="e.g. Acme Ltd – FY25 Audit">
            <datalist id="clientList"></datalist>
            <div class="row2">
                <div>
                    <label>Booking type</label>
                    <select id="bStatus">
                        <option value="confirmed">Confirmed</option>
                        <option value="potential">Potential</option>
                    </select>
                </div>
                <div>
                    <label>Stage / probability</label>
                    <input type="text" id="bStage" placeholder="e.g. 60%, proposal">
                </div>
            </div>
            <div class="row2">
                <div>
                    <label>Start</label>
                    <input type="date" id="bStart">
                </div>
                <div>
                    <label>End</label>
                    <input type="date" id="bEnd">
                </div>
            </div>
            <label>Note (optional)</label>
            <input type="text" id="bNote" placeholder="phase, location, partner…">
            <label>Colour</label>
            <div class="swatches" id="bSwatches"></div>
            <div class="warn" id="bWarn"></div>
        </div>
        <div class="modact">
            <button class="btn danger" id="bDelete" style="margin-right:auto;display:none">Delete
            </button>
            <button class="btn" id="bCancel">Cancel</button>
            <button class="btn pri" id="bSave">Save</button>
        </div>
    </div>
</div>

<div class="modal" id="pModal">
    <div class="sheet">
        <h3 id="pTitle">Add person</h3>
        <div class="frm">
            <label>Employee number</label>
            <input type="text" id="pEmpNo" placeholder="e.g. RA-125">
            <label>Name</label>
            <input type="text" id="pName" placeholder="Full name">
            <label>Email address</label>
            <input type="email" id="pEmail" placeholder="name@reckoner.local">
            <div class="row2">
                <div>
                    <label>Pod / team</label>
                    <input type="text" id="pPod" list="podList" placeholder="Team">
                    <datalist id="podList"></datalist>
                </div>
                <div>
                    <label>Designation</label>
                    <input type="text" id="pRole" list="designationList"
                        placeholder="e.g. Audit Associate">
                </div>
            </div>
            <label>Portal access role</label>
            <select id="pAccess">
                <option value="employee">Employee — self only</option>
                <option value="manager">Manager — own pod</option>
            </select>
            <label class="chk admin-only">
                <input type="checkbox" id="pActive"> Account active — user may sign in
            </label>
            <div class="row2">
                <div>
                    <label>Entity</label>
                    <input id="pEntity" list="cfgEntityList" placeholder="Reckoner">
                    <datalist id="cfgEntityList"></datalist>
                </div>
                <div>
                    <label>Monthly target hours</label>
                    <input type="number" id="pTarget" min="0" step="0.5">
                </div>
            </div>
            <label>Billing rate (£/hour)</label>
            <input type="number" id="pRate" min="0" step="0.01" placeholder="Optional">
            <label>Login password <span style="text-transform:none;font-weight:500">(leave blank to
                    keep current; new users receive a generated temporary password)</span>
            </label>
            <input type="password" id="pPwd" placeholder="minimum 8 characters"
                autocomplete="new-password">
            <div class="warn" id="pWarn"></div>
        </div>
        <div class="modact">
            <button class="btn danger" id="pDelete" style="margin-right:auto;display:none">Delete
                person</button>
            <button class="btn" id="pCancel">Cancel</button>
            <button class="btn pri" id="pSave">Save</button>
        </div>
    </div>
</div>

<div class="modal" id="lModal">
    <div class="sheet">
        <h3 id="lTitle">Add leave</h3>
        <div class="frm">
            <label>Person</label>
            <select id="lPerson"></select>
            <label>Leave type</label>
            <select id="lType">
                <option value="Annual">Annual</option>
                <option value="Sick">Sick</option>
                <option value="Casual">Casual</option>
                <option value="Study / exam">Study / exam</option>
                <option value="Other">Other</option>
            </select>
            <div class="row2">
                <div>
                    <label>From</label>
                    <input type="date" id="lStart">
                </div>
                <div>
                    <label>To</label>
                    <input type="date" id="lEnd">
                </div>
            </div>
            <label>Note (optional)</label>
            <input type="text" id="lNote" placeholder="e.g. approved by HR, half-days…">
            <div class="warn" id="lWarn"></div>
        </div>
        <div class="modact">
            <button class="btn danger" id="lDelete" style="margin-right:auto;display:none">Delete
            </button>
            <button class="btn" id="lCancel">Cancel</button>
            <button class="btn pri" id="lSave">Save</button>
        </div>
    </div>
</div>

<div class="modal" id="loginModal">
    <div class="sheet">
        <img class="login-brand-logo" src="reckoner-logo.png" alt="Reckoner Audit">
        <h3>Welcome back</h3>
        <p class="auth-intro">Sign in to access the Resource &amp; Timesheet Portal.</p>
        <div class="frm">
            <label>Email Address</label>
            <input type="email" id="lgWho" autocomplete="email" placeholder="name@company.com">
            <label>Password</label>
            <input type="password" id="lgPass" autocomplete="current-password"
                placeholder="Enter your password">
            <button type="button" class="forgot-link" id="forgotOpen">Forgot password?</button>
            <div class="warn" id="lgWarn"></div>
        </div>
        <div class="modact">
            <button class="btn pri" id="lgGo">Sign in</button>
        </div>
    </div>
</div>

<div class="modal" id="forgotModal">
    <div class="sheet">
        <img class="login-brand-logo" src="reckoner-logo.png" alt="Reckoner Audit">
        <h3>Reset your password</h3>
        <div class="frm" id="forgotRequestStep">
            <p class="auth-intro">Enter your work email. If it matches an active account, we will
                send a six-digit reset code.</p>
            <label>Email address</label>
            <input type="email" id="forgotEmail" autocomplete="email"
                placeholder="name@company.com">
        </div>
        <div class="frm" id="forgotVerifyStep" style="display:none">
            <p class="auth-intro" id="forgotIntro">Enter the code from your email and choose a new
                password.</p>
            <label>Reset code</label>
            <input type="text" id="forgotCode" inputmode="numeric" autocomplete="one-time-code"
                maxlength="6" placeholder="000000">
            <label>New password</label>
            <input type="password" id="forgotPassword" minlength="8" maxlength="256"
                autocomplete="new-password" placeholder="At least 8 characters">
            <label>Confirm new password</label>
            <input type="password" id="forgotPasswordConfirm" minlength="8" maxlength="256"
                autocomplete="new-password" placeholder="Repeat the password">
        </div>
        <div class="warn" id="forgotWarn"></div>
        <div class="modact">
            <button class="btn" id="forgotBack">Back</button>
            <button class="btn pri" id="forgotSend">Send reset code</button>
            <button class="btn pri" id="forgotReset" style="display:none">Set new password</button>
        </div>
    </div>
</div>

<div class="modal" id="mfaModal">
    <div class="sheet">
        <img class="login-brand-logo" src="reckoner-logo.png" alt="Reckoner Audit">
        <h3>Check your email</h3>
        <p class="auth-intro" id="mfaIntro">Enter the six-digit verification code sent to your
            email.</p>
        <div class="frm">
            <label>Verification code</label>
            <input type="text" id="mfaCode" inputmode="numeric" autocomplete="one-time-code"
                maxlength="6" placeholder="000000">
            <label class="remember-device">
                <input type="checkbox" id="mfaRememberDevice"> Trust this device for 30 days
            </label>
            <div class="warn" id="mfaWarn"></div>
            <p class="hint">The code expires after 10 minutes. Never share it with anyone.</p>
        </div>
        <div class="modact">
            <button class="btn" id="mfaCancel">Back</button>
            <button class="btn" id="mfaResend">Resend code</button>
            <button class="btn pri" id="mfaVerify">Verify &amp; sign in</button>
        </div>
    </div>
</div>

<div class="modal" id="forcePasswordModal">
    <div class="sheet">
        <h3>Create your private password</h3>
        <p class="auth-intro">Your temporary password must be replaced before continuing.</p>
        <div class="frm">
            <label>New password</label>
            <input type="password" id="forcePassword" minlength="8" autocomplete="new-password"
                placeholder="At least 8 characters">
            <label>Confirm new password</label>
            <input type="password" id="forcePasswordConfirm" minlength="8"
                autocomplete="new-password" placeholder="Repeat the password">
            <div class="warn" id="forcePasswordWarn"></div>
        </div>
        <div class="modact">
            <button class="btn pri" id="forcePasswordSave">Save password</button>
        </div>
    </div>
</div>

<div class="modal" id="acModal">
    <div class="sheet" style="max-width:1050px">
        <h3>Access control</h3>
        <div class="frm">
            <label>Change admin password</label>
            <div class="row2">
                <input type="password" id="acCurrent" placeholder="current password"
                    autocomplete="current-password">
                <input type="password" id="acNew" placeholder="new password"
                    autocomplete="new-password">
                <button class="btn pri" id="acSave">Update</button>
            </div>
            <label style="margin-top:16px">Timesheet rules</label>
            <label class="chk" style="font-weight:600">
                <input type="checkbox" id="acCap"> Block timesheet rows once a job's booked hours
                are fully recorded (otherwise warn and flag)
            </label>
            <label style="margin-top:16px">Employee passwords</label>
            <table class="dtable" id="acTable"></table>
            <p class="hint">New accounts remain inactive until an administrator activates them.
                Deactivation immediately closes existing sessions. Reset generates a unique
                temporary password and requires replacement after MFA.</p>
        </div>
        <div class="modact">
            <button class="btn" id="acClose">Close</button>
        </div>
    </div>
</div>

<script nonce="<?= htmlspecialchars($cspNonce, ENT_QUOTES, 'UTF-8') ?>">
const INITIAL_VIEW = <?= json_encode($portalView, JSON_UNESCAPED_SLASHES) ?>;
const INITIAL_CONFIG_PAGE = <?= json_encode($portalConfigPage, JSON_UNESCAPED_SLASHES) ?>;
</script>
<script nonce="<?= htmlspecialchars(
    $cspNonce,
    ENT_QUOTES,
    'UTF-8',
) ?>" src="assets/portal.js?v=<?= substr(
    hash_file('sha256', dirname(__DIR__) . '/assets/portal.js'),
    0,
    16,
) ?>"></script>
</body>
</html>
