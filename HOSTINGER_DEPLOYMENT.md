# Hostinger production deployment

## Information required before launch

- Production domain or subdomain
- Hostinger database name, username, password, and host
- A licensed Microsoft 365 sender mailbox and a Microsoft Entra app registration
- Real email addresses for every active user

The current local database still needs email addresses for **RA-119 Zartasha Nadeem**, **RA-120 Isra Munsif**, **RA-121 Shiza**, and **RA-124 Umaar Qasim**. Add these through Config → Employees before launch. Accounts without an email cannot sign in because MFA is mandatory.

## Hostinger setup

1. In hPanel, add a **Custom PHP/HTML** website and select PHP 8.3 or newer.
2. Install the SSL certificate and keep **Force HTTPS** enabled.
3. Create a MySQL database and record its prefixed database name, username, password, and host.
4. Export the local `booking_portal` database from phpMyAdmin. Before importing it on Hostinger, remove any `CREATE DATABASE` and `USE` statements. Import it into the database selected in Hostinger phpMyAdmin.
5. Upload the application files directly into the domain's `public_html` directory. Include `.htaccess`; do not upload development logs or temporary archives.
6. Copy `config.local.example.php` to `config.local.php` on Hostinger and replace every placeholder. Keep `APP_ENV` set to `production`, `DB_AUTO_CREATE` set to `false`, and `APP_COOKIE_PATH` set to `/` when the portal is at the domain root.
7. In Microsoft Entra, register an application, add the Microsoft Graph **Mail.Send** and **Sites.Selected** application permissions, and grant tenant-wide administrator consent. Grant that application write access only to the required SharePoint site. Create a client secret and put its **value** (not its ID), tenant ID, and application/client ID in `config.local.php`. Set `GRAPH_SENDER` to the licensed mailbox that sends portal messages. Restrict Mail.Send to that mailbox with Exchange Online application RBAC or an application access policy.
8. Create the SharePoint document-library folder configured by `GRAPH_SHAREPOINT_BACKUP_FOLDER`. Add its Graph site ID and drive ID to `config.local.php` as `GRAPH_SHAREPOINT_SITE_ID` and `GRAPH_SHAREPOINT_DRIVE_ID`.
9. Restrict `config.local.php` to the lowest file permissions supported by the account while leaving it readable by PHP. `.htaccess` blocks it from web requests.
10. Open the production URL. The application applies non-destructive schema migrations automatically to the selected database.
11. On a fresh database, use **Forgot password?** for `admin@thereckoner.co.uk` to set the first administrator password. Seeded accounts have unique random credentials; there is no bootstrap password.

## Monthly SharePoint timesheet backup

Create a Hostinger cron job for the first day of every month. Use Hostinger's absolute PHP and website paths, for example:

```text
0 2 1 * * /usr/bin/php /home/USERNAME/domains/DOMAIN/public_html/monthly_sharepoint_backup.php
```

The CLI-only job exports every timesheet row from the previous calendar month to an Excel-compatible UTF-8 CSV and uploads it to the configured SharePoint document library. Each attempt is recorded in `sharepoint_backups`; rerunning a month replaces that month's SharePoint file safely. Test a specific month from SSH with:

```text
php monthly_sharepoint_backup.php --month=2026-09
```

## Mandatory launch checks

- Confirm HTTP redirects to HTTPS and the browser shows a valid certificate.
- Sign in as an employee, manager, and administrator: password first, then the emailed six-digit code.
- Confirm employees see only their own records, managers see only their pod, and managers cannot edit pod-member timesheets.
- Reset a test employee password as administrator; verify the generated temporary password and required password-change screen.
- Use **Forgot password?** with a test account; verify the reset email, code expiry, new password, and subsequent MFA login.
- Import a small workbook as administrator containing at least two employees. Confirm identical re-imported rows update and manual rows remain untouched.
- Import a personal template as an employee and manager; confirm each can import only their own rows. Undo each import from Timesheet → Import history and confirm previous rows are restored.
- Run the monthly backup for a test month and confirm the CSV appears in the configured SharePoint folder and `sharepoint_backups` reports `completed`.
- Confirm direct requests for `/config.local.php`, `/database.sql`, and `/booking_portal.sql` return `403`.
- Confirm response headers include CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and HSTS over HTTPS.
- Configure Hostinger automated backups and test one restore before inviting users.

## Security behavior

- MFA is mandatory for every login and cannot be disabled in the portal.
- Every non-administrator account starts inactive. Only an administrator can activate it; deactivation invalidates existing sessions immediately.
- Codes expire after 10 minutes, permit at most five attempts, and resend is rate-limited.
- Password attempts are rate-limited; passwords use Argon2id when PHP provides it.
- Forgot-password requests use a generic response to reduce account discovery, with expiring one-time codes and request/attempt limits.
- Seeded accounts receive unique random, unknown credentials and activate access through **Forgot password?**. Accounts created or reset by an administrator receive unique temporary passwords and must replace them after MFA.
- Password changes and resets invalidate the user's older authenticated sessions.
- Authenticated sessions expire after 30 minutes idle or eight hours total and rotate their IDs every 15 minutes.
- Password resets require a recently MFA-authenticated administrator session.
- State-changing API requests require a CSRF token and role/scope checks.
- Authentication events and administrator imports are recorded in `auth_events`.
- Every workbook import is recorded in `timesheet_import_batches`; undo restores overwritten rows from `timesheet_import_changes` and removes only rows created by that batch.
- Production errors are logged server-side without exposing database or filesystem details to users.

## After launch

- Delete uploaded database export files and deployment archives from `public_html` after importing.
- Never email or commit `config.local.php`.
- Review failed login/MFA events and Hostinger logs regularly.
- Apply supported PHP updates after testing them on a staging copy.
