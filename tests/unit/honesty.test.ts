import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const BANNED = [
  /production-ready/i,
  /enterprise/i,
  /aeroflow/i,
  /upwork/i,
  /respond\.io/i,
  /testimonial/i,
];

function files(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (entry === 'node_modules' || entry === '.next' || entry === '.git') continue;
    const stat = statSync(full);
    if (stat.isDirectory()) found.push(...files(full));
    else if (/\.(md|tsx|ts|yml|yaml)$/.test(entry)) found.push(full);
  }
  return found;
}

describe('public copy', () => {
  it('does not use banned claims', () => {
    const root = path.resolve(__dirname, '../..');
    const targets = files(root).filter((file) => !file.includes(`${path.sep}tests${path.sep}`));
    const hits: string[] = [];
    for (const file of targets) {
      const text = readFileSync(file, 'utf8');
      for (const pattern of BANNED) {
        if (pattern.test(text)) hits.push(`${path.relative(root, file)} ${pattern}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
