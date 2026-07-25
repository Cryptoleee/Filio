// Laadt .env (indien aanwezig) voor de losse node-scripts.
// Next.js leest .env zelf al; `node scripts/*.mjs` niet — dit trekt dat gelijk.
// Bestaande omgevingsvariabelen winnen altijd van .env.
import { readFileSync } from 'node:fs';

try {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !(m[1] in process.env)) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
} catch {
  /* geen .env — prima, dan gelden alleen echte env-vars */
}
