import test from 'node:test';
import assert from 'node:assert/strict';

import { inspectText } from '../../scripts/verify-isolation.mjs';

test('isolation guard rejects modern backend secret material', () => {
  for (const text of [
    'const secret = "sb_secret_example";',
    'const secret = process.env.SUPABASE_SECRET_KEY;',
    'const secret = process.env.OPENAI_API_KEY;',
    'const secret = process.env.META_APP_SECRET;',
    'const secret = process.env.BLING_CLIENT_SECRET;',
  ]) {
    const findings = inspectText(text, 'src/bad.ts');
    assert.ok(findings.some((finding) => finding.label === 'secret material'), text);
  }
});
