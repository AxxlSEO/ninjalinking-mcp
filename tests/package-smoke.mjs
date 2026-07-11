import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const root = new URL('..', import.meta.url);
const temp = await mkdtemp(join(tmpdir(), 'ninjalinking-mcp-pack-'));

try {
  const pack = await command('npm', ['pack', '--json', '--pack-destination', temp], { cwd: root });
  const filename = JSON.parse(pack.stdout)[0].filename;
  const tarball = join(temp, filename);
  await command('npm', ['init', '-y'], { cwd: temp });
  await command('npm', ['install', tarball, '--ignore-scripts'], { cwd: temp });

  const manifest = JSON.parse(await readFile(join(temp, 'node_modules', 'ninjalinking-mcp', 'package.json'), 'utf8'));
  assert.equal(manifest.version, '2.1.0');
  assert.equal(manifest.bin['ninjalinking-mcp'], 'dist/index.js');

  const child = spawn(process.execPath, [join(temp, 'node_modules', 'ninjalinking-mcp', 'dist', 'index.js')], {
    env: { ...process.env, NINJALINKING_API_TOKEN: 'smoke-test-token' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const exited = new Promise(resolve => child.once('exit', code => resolve(code)));
  const early = await Promise.race([exited, new Promise(resolve => setTimeout(() => resolve('running'), 300))]);
  assert.equal(early, 'running', `packaged binary exited early with ${early}`);
  child.kill();
  await exited;
} finally {
  await rm(temp, { recursive: true, force: true });
}

function command(binary, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { ...options, shell: false });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`${binary} ${args.join(' ')} failed (${code}): ${stderr}`)));
  });
}
