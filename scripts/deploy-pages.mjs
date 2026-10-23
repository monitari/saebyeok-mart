// Publishes web/ to the gh-pages branch, which GitHub Pages serves at https://monitari.github.io/saebyeok-mart/.
// Only committed files are published, and only after the syntax check and all tests pass.
import { execFileSync } from 'node:child_process';
const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit' });
// The folder can be owned by another Windows account; trust it for these commands only.
const git = (...args) => execFileSync('git', ['-c', `safe.directory=${process.cwd().replaceAll('\\', '/')}`, ...args], { encoding: 'utf8' }).trim();

if (git('status', '--porcelain', '--', 'web')) {
  console.error('web/ has uncommitted changes. Commit them first so the published site matches the repository.');
  process.exit(1);
}
run(process.execPath, ['scripts/check.mjs']);
run(process.execPath, ['--test', 'tests/']);
const commit = git('subtree', 'split', '--prefix=web', 'HEAD');
git('push', '--force', 'origin', `${commit}:refs/heads/gh-pages`);
console.log(`Published web/ (${commit.slice(0, 7)}) to gh-pages. GitHub Pages updates within a minute or two.`);
