import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { privateKeyToAccount } from 'viem/accounts';

const REPO = 'EchoEe247/agent-commerce-hub';
const SECRET = 'HERMES_COMMERCE_EARN_PRIVATE_KEY';

function gh(args, options = {}) {
  const r = spawnSync('gh', args, { encoding: 'utf8', ...options });
  if (r.status !== 0) throw new Error(`gh ${args[0]} failed: ${(r.stderr || r.stdout || '').trim()}`);
  return r.stdout ?? '';
}

gh(['auth', 'status']);

let privateKey;
let account;
for (;;) {
  privateKey = `0x${randomBytes(32).toString('hex')}`;
  try {
    account = privateKeyToAccount(privateKey);
    break;
  } catch {
    privateKey = undefined;
  }
}

const write = spawnSync('gh', ['secret', 'set', SECRET, '--repo', REPO], {
  input: `${privateKey}\n`,
  encoding: 'utf8',
});
privateKey = undefined;
if (write.status !== 0) throw new Error(`GitHub secret write failed: ${(write.stderr || write.stdout || '').trim()}`);

const listed = gh(['secret', 'list', '--repo', REPO, '--json', 'name']);
let names;
try { names = JSON.parse(listed).map((x) => x.name); } catch { names = []; }
if (!names.includes(SECRET)) throw new Error('earning-wallet secret write could not be verified by name');

console.log(`EARNING_WALLET=${account.address}`);
console.log(`SECRET_STORED=${SECRET}`);
console.log('PRIVATE_KEY_EXPOSED=false');
console.log('NETWORK=Base mainnet (8453)');
console.log('ASSET=USDC');
