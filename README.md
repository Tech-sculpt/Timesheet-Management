# Resource Booking & Timesheet Portal

A PHP and MySQL application for planning team capacity, recording time, and comparing booked work with actual delivery. It combines employee timesheets, manager reporting, and administrator controls in a shared workbook-style interface.

## Core features

- **Resource planning:** bookings, capacity status and timelines, weekly hours, and cross-pod reporting.
- **Time tracking:** personal timesheets, attendance, booked versus actual comparisons, and Excel template imports and exports using ExcelJS.
- **Operational reporting:** employee and client views, billing, KPI calculations, audit checks, and dashboards.
- **Access control:** employee access to personal records, manager access scoped to their pod, and administrator configuration and account management. The API enforces access boundaries.
- **Authentication:** email MFA, password recovery, temporary passwords, session expiry, and CSRF protection for state-changing requests.
- **Import accountability:** recorded import batches with undo support for created and overwritten timesheet rows.
- **Backups:** a CLI job that exports monthly timesheets to SharePoint through Microsoft Graph.

## Technology and structure

The application uses PHP, PDO/MySQL, vanilla JavaScript, CSS, and a locally bundled ExcelJS library. Application code has no Composer or npm install step.

| Path | Responsibility |
| --- | --- |
| `index.php` | Redirects the root URL to the dedicated timesheet page |
| `timesheet.php`, `attendance.php`, and other page files | Own their page markup and select their browser view |
| `includes/bootstrap.php` | Shared configuration and response security headers |
| `includes/header.php`, `includes/footer.php` | Shared navigation, assets, and dialogs |
| `includes/timesheet-period.php` | Reusable employee and period controls |
| `assets/portal.css` | Portal layout, components, and responsive styles |
| `assets/portal.js` | Interactive views, API calls, imports, and exports |
| `assets/workbook-calculations.js` | Reusable reporting and workbook calculations |
| `api.php` | JSON endpoints, authentication, authorization, schema updates, and seed data |
| `config.php` | Configuration loading and reusable PDO connections |
| `mailer.php` | Microsoft Graph email and SharePoint integration |
| `database.sql` | Application database schema |
| `monthly_sharepoint_backup.php` | CLI-only monthly timesheet export |
| `tests/` | Independent page rendering and calculation regression checks |

Each page owns its content and includes the shared header and footer; no page includes `index.php`. Navigation opens dedicated URLs. Import History (`import-history.php`), Booking Context (`booking-context.php`), and Access Management (`access.php`) also have their own pages. Only the selected page panel is rendered. Shared JavaScript binds controls that exist on that page, while the API continues to enforce role and data boundaries.

The backend and shared browser controller remain large files; splitting their domain logic into smaller modules is a useful future refactor.

## Run locally

Requirements: PHP 8.3 or newer with PDO MySQL, a MySQL-compatible database, and Apache with `mod_rewrite` and `.htaccess` overrides enabled. Microsoft Graph delivery and SharePoint uploads also require PHP cURL.

1. Clone the repository into your Apache document root, for example XAMPP's `htdocs/Booking`.
2. Copy the sample configuration:

   ```powershell
   Copy-Item config.local.example.php config.local.php
   ```

   On macOS/Linux, use `cp config.local.example.php config.local.php`.
3. Set the database connection values. Use `APP_ENV=development`, `MAIL_TRANSPORT=log`, and `DB_AUTO_CREATE=true` locally. Set `APP_COOKIE_PATH` to `/Booking/` if installed there. The local database user needs permission to create the database and tables.
4. Start Apache and MySQL, then open `http://localhost/Booking/`. The API initializes the schema and seed accounts. Alternatively, import `database.sql` manually and set `DB_AUTO_CREATE=false`.
5. On a fresh database, use **Forgot password?** for the seeded administrator, `admin@thereckoner.co.uk`. In local log mode, recovery and MFA codes are written to PHP's configured error log. There is no shared default password.
6. Add valid email addresses and activate employee or manager accounts through **Access**. These accounts start inactive.

Environment variables override `config.local.php`. Keep local configuration and logs private: development email logs contain authentication codes.

The current application seeds organization-specific employee names and email addresses in `api.php`. Review and replace that seed data before using the repository as a public demo. The optional, ignored `reference_data.tsv` import supplies organization-specific client lists and dropdowns; it is not included in a fresh clone. Administrators can maintain those values through **Config**.

## Checks

With PHP 8.3+ and Node.js 22 installed:

```sh
php -l index.php
php -l api.php
node --check assets/portal.js
node --check assets/workbook-calculations.js
npm ci --ignore-scripts
npm run format:check
npm test
```

Run `npm run format` to apply consistent formatting to PHP templates and application code. The formatter skips private local configuration, database exports, and the bundled third-party ExcelJS file. PHP, JavaScript, and CSS rules are committed in `.prettierrc.json`; `.jsbeautifyrc` controls readable HTML nesting inside PHP templates.

Node dependencies are development-only. The page tests render real PHP templates in a temporary copy using development defaults, exclude private local configuration, and initialize each view in jsdom with mock API data. They cover signed-out, administrator, manager, and supported employee views, navigation destinations, and shared dialog controls. Set `PHP_BINARY` if PHP is not on your PATH.

GitHub Actions checks application PHP files, JavaScript syntax, independent page initialization, and calculation tests on pushes and pull requests. These checks do not replace database, browser, or Microsoft Graph integration testing. Use the launch checklist in [HOSTINGER_DEPLOYMENT.md](HOSTINGER_DEPLOYMENT.md) for those flows.

To check database connectivity locally, run `php mysql-test.php`. The diagnostic uses your configuration, is CLI-only, and reports no connection details.

## Deployment and data handling

See [HOSTINGER_DEPLOYMENT.md](HOSTINGER_DEPLOYMENT.md) for production setup, email permissions, monthly backups, and launch checks. Production requires HTTPS, Graph email delivery, and an existing database with `DB_AUTO_CREATE=false`.

Keep credentials, database exports, customer data, logs, and deployment archives out of Git. If a credential has already been committed, rotate it; adding an ignore rule or removing its current value does not remove it from Git history.

ExcelJS is distributed under its [MIT license](assets/exceljs.LICENSE).
