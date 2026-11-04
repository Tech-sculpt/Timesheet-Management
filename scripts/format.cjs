const fs = require('node:fs/promises');
const path = require('node:path');
const prettier = require('prettier');
const { html: formatHtml } = require('js-beautify');

const root = path.resolve(__dirname, '..');
const write = process.argv.includes('--write');

async function filesIn(directory, pattern) {
  const names = await fs.readdir(path.join(root, directory));
  return names.filter((name) => pattern.test(name)).map((name) => path.join(directory, name));
}

async function main() {
  const htmlOptions = JSON.parse(await fs.readFile(path.join(root, '.jsbeautifyrc'), 'utf8'));
  const files = [
    ...(await filesIn('.', /\.(php|json)$/)),
    ...(await filesIn('includes', /\.php$/)),
    ...(await filesIn('tests', /\.cjs$/)),
    ...(await filesIn('scripts', /\.cjs$/)),
    ...(await filesIn('.github/workflows', /\.yml$/)),
    'assets/portal.js',
    'assets/workbook-calculations.js',
    'assets/portal.css',
  ].filter((file) => path.basename(file) !== 'config.local.php');

  let changed = 0;
  for (const file of files.sort()) {
    const absolute = path.join(root, file);
    const source = await fs.readFile(absolute, 'utf8');
    const options = await prettier.resolveConfig(absolute);
    let formatted = await prettier.format(source, { ...options, filepath: absolute });
    // The PHP plugin formats PHP blocks. Format their surrounding HTML separately
    // so page templates also get one nested element per line.
    if (file.endsWith('.php') && formatted.includes('?>')) {
      formatted = formatHtml(formatted, htmlOptions);
    }
    if (formatted === source) continue;
    changed++;
    if (write) await fs.writeFile(absolute, formatted);
    else console.error(`Needs formatting: ${file}`);
  }
  if (write) console.log(`Formatted ${changed} file(s).`);
  else if (changed) process.exitCode = 1;
  else console.log('All source files match the formatting rules.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
