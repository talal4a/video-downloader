// One command to publish a new version for Windows users:
//   npm run release                 (publishes the current version, or the next one if it is already out)
//   npm run release -- --notes "What changed"
//   npm run release -- --dry-run    (only shows what would happen)
//
// It builds the Windows installer, creates the GitHub release with the 3 files installed apps
// need to update themselves (.exe, .exe.blockmap, latest.yml), and saves the new version in git.
// One-time setup on the Mac:  brew install gh   and   gh auth login
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const notesArg = args.includes('--notes') ? args[args.indexOf('--notes') + 1] : null;
const isWin = process.platform === 'win32';

function check(cmd, cmdArgs) {
  return spawnSync(cmd, cmdArgs, { encoding: 'utf8', shell: isWin });
}

function step(title, cmd, cmdArgs) {
  console.log(`\n▶ ${title}`);
  if (dryRun) {
    console.log(`  (dry run) ${cmd} ${cmdArgs.join(' ')}`);
    return;
  }
  const r = spawnSync(cmd, cmdArgs, { stdio: 'inherit', shell: isWin });
  if (r.status !== 0) {
    console.error(`\n✖ Failed: ${cmd} ${cmdArgs.join(' ')}\nNothing was published. Fix the error above and run "npm run release" again.`);
    process.exit(1);
  }
}

function stop(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

const readVersion = () => JSON.parse(fs.readFileSync('package.json', 'utf8')).version;

// 1. GitHub CLI ready?
if (check('gh', ['--version']).status !== 0) {
  stop('One-time setup needed (free):\n  brew install gh\n  gh auth login      (choose GitHub.com → HTTPS → Login with a web browser)\nThen run "npm run release" again.');
}
if (!dryRun && check('gh', ['auth', 'status']).status !== 0) {
  stop('Please log in to GitHub once:\n  gh auth login      (choose GitHub.com → HTTPS → Login with a web browser)\nThen run "npm run release" again.');
}

// 2. Pick the version: publish the current one, or move to the next if it is already released.
let version = readVersion();
const alreadyOut = !dryRun && check('gh', ['release', 'view', `v${version}`]).status === 0;
let bumped = false;
if (alreadyOut) {
  console.log(`v${version} is already released, so this will be the next version.`);
  step('Raising the version number', 'npm', ['version', 'patch', '--no-git-tag-version']);
  version = readVersion();
  bumped = true;
}
console.log(`\nReleasing Video Downloader ${version}`);

// 3. Build the Windows installer.
step('Building the Windows installer (a few minutes)', 'npm', ['run', 'dist:win']);

// 4. Publish the release with the 3 files.
const files = [
  `Video-Downloader-Setup-${version}.exe`,
  `Video-Downloader-Setup-${version}.exe.blockmap`,
  'latest.yml',
].map((f) => path.join('release', f));
if (!dryRun) {
  const missing = files.filter((f) => !fs.existsSync(f));
  if (missing.length) stop(`These files were not built: ${missing.join(', ')}`);
}
const notes =
  notesArg ??
  `**Windows:** download \`Video-Downloader-Setup-${version}.exe\` below and double-click it.\nAlready installed? The app updates itself (Settings → About → Check now).`;
step('Publishing the GitHub release', 'gh', ['release', 'create', `v${version}`, ...files, '--title', `Video Downloader ${version}`, '--notes', notes]);

// 5. Save the new version number in git so the next release counts up from it.
if (bumped) {
  step('Saving the new version number', 'git', ['add', 'package.json', 'package-lock.json']);
  step('Committing', 'git', ['commit', '-m', `Release v${version}`]);
  step('Pushing to GitHub', 'git', ['push']);
}

console.log(`\n✔ Done! Video Downloader ${version} is published.
  Download link: https://github.com/talal4a/video-downloader/releases/latest
  Installed apps update themselves within a few minutes of starting (or Settings → About → Check now).\n`);
