# Resource Booking & Timesheet Portal

Database-backed employee, manager, and administrator portal for local XAMPP development and Hostinger production hosting.

Production authentication uses mandatory email MFA for every account. New and administrator-reset accounts receive a unique temporary password and must replace it after their first verified login. Users can securely recover forgotten passwords through an expiring email code. See `HOSTINGER_DEPLOYMENT.md` and copy `config.local.example.php` to `config.local.php` when configuring production.

Workbook tabs are live: **TIMESHEET**, **ATTENDANCE**, **MASTER DATA**, **KPI ENGINE**,
**EMPLOYEE VIEW**, **CLIENT VIEW**, **AUDIT CHECK**, and **DASHBOARD**. Administrators
also have **CONFIG** for the employee register, firm targets, public holidays, audit
thresholds, and dropdown reference lists. Employees see only their Timesheet, personal
Dashboard, and Booked vs Actual views; managers see analytical data for their own pod.

Open `http://localhost/Booking/` after Apache and MySQL are running. The API creates the
`booking_portal` database/tables and seeds the concept roster automatically if needed.

Seeded accounts have unique random credentials rather than shared bootstrap passwords. Activate the initial administrator and other seeded accounts through **Forgot password?** after Microsoft Graph mail is configured. People without a confirmed email are shown in Access control for the administrator to complete and cannot sign in until an email is added.

All employee and manager accounts start inactive and cannot sign in, request a password reset, or receive MFA codes until an administrator activates them from **Access**. Deactivation invalidates the user's existing sessions.

The supplied configuration import contains 15 dated public holidays, 7 entities, 6 time
types, 28 assignment types, 133 work areas, and 2,222 client names. Additional employee
register rows are placed in the **Unassigned** pod for the administrator to organise.

Change the administrator password from **Access** after signing in. Administrators can
reset individual user passwords there. Managers are scoped to their own pod; employees
are scoped to themselves. The API enforces those boundaries for reads and writes.

`database.sql` contains the complete schema for manual installation if preferred.

Employees and managers can download the Excel-style timesheet template and import only their own completed rows. Administrators can import rows for everyone. Every import is permanently logged and can be undone as a batch; a missing **Billing To** column or value means the employee is billing to themselves.

`monthly_sharepoint_backup.php` is a CLI-only monthly job that exports the previous month's complete timesheet to SharePoint through Microsoft Graph. Configure the SharePoint site, drive, and folder in `config.local.php`, then schedule it monthly in Hostinger cron.
