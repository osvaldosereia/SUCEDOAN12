import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(new URL('..', import.meta.url).pathname);

function trackedFiles() {
  try {
    const out = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' });
    return out.split('\0').filter(Boolean);
  } catch {
    const files = [];
    const skipDirs = new Set(['.git', 'node_modules', '.worktrees', '.superpowers']);
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          if (!skipDirs.has(entry.name)) walk(path.join(dir, entry.name));
          continue;
        }
        if (entry.isFile()) files.push(path.relative(root, path.join(dir, entry.name)));
      }
    };
    walk(root);
    return files;
  }
}

const binaryExtensions = new Set(['.png','.jpg','.jpeg','.gif','.webp','.pdf','.zip','.gz','.ico','.woff','.woff2','.ttf']);
const findings = [];
const tokenPattern = /\bEAA[A-Za-z0-9_-]{80,}\b/g;
const assignmentPattern = /\b(?:META|WHATSAPP|GRAPH)_[A-Z0-9_]*(?:TOKEN|SECRET)[A-Z0-9_]*\s*[:=]\s*["'`]([^"'`\r\n]{20,})["'`]/g;

for (const rel of trackedFiles()) {
  if (binaryExtensions.has(path.extname(rel).toLowerCase())) continue;
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) continue;
  let text;
  try { text = fs.readFileSync(full, 'utf8'); } catch { continue; }

  for (const match of text.matchAll(tokenPattern)) {
    findings.push(`${rel}: possível token Meta literal`);
  }
  for (const match of text.matchAll(assignmentPattern)) {
    const value = String(match[1] || '').trim();
    if (/^(?:REDACTED|CHANGEME|EXAMPLE|PLACEHOLDER|\$\{|process\.env|Deno\.env)/i.test(value)) continue;
    findings.push(`${rel}: possível segredo Meta/WhatsApp literal`);
  }
}

assert.deepEqual(findings, [], `Segredos Meta não podem ser versionados:\n${findings.join('\n')}`);
console.log('OK · nenhum token/segredo Meta literal detectado em arquivos versionados.');
