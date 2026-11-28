import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const digestSql = (sql) => createHash("sha256")
  .update(sql.replace(/\r\n/g, "\n").replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, ""))
  .digest("hex");
const normalizedName = (name) => String(name || "").toLowerCase().replace(/^(?:\d{14}_)+/, "");

export function compareHistory(github, supabase) {
  const byVersion = new Map(supabase.map((row) => [row.version, row]));
  const matches = [], githubOnly = [], ambiguous = [], used = new Set();
  const record = (file, applied, via) => {
    used.add(applied.version);
    const content = !file.digest || !applied.digest ? "unknown"
      : file.digest === applied.digest ? "identical" : "different";
    matches.push({ github: file, supabase: applied, via, content });
  };
  for (const file of github) {
    if (byVersion.has(file.version)) record(file, byVersion.get(file.version), "version");
  }
  // Select candidates against a fixed set so the file order cannot resolve ambiguous aliases.
  const pending = github.filter((row) => !byVersion.has(row.version));
  const remaining = supabase.filter((row) => !used.has(row.version));
  const candidates = pending.map((file) => {
    const identical = remaining.filter((row) => file.digest && row.digest === file.digest);
    const named = remaining.filter((row) => normalizedName(file.name) && normalizedName(row.name) === normalizedName(file.name));
    return { file, choices: identical.length ? identical : named, via: identical.length ? "content" : "name" };
  });
  const claims = new Map();
  for (const { choices } of candidates) {
    for (const row of choices) claims.set(row.version, (claims.get(row.version) || 0) + 1);
  }
  for (const { file, choices, via } of candidates) {
    if (choices.length === 1 && claims.get(choices[0].version) === 1) record(file, choices[0], via);
    else if (choices.length) ambiguous.push({ github: file, supabase: choices });
    else githubOnly.push(file);
  }
  const supabaseOnly = supabase.filter((row) => !used.has(row.version));
  return { matches, githubOnly, supabaseOnly, ambiguous };
}

function readMigrations(directory) {
  return readdirSync(directory).sort().flatMap((path) => {
    const match = path.match(/^(\d{14})_(.+)\.sql$/);
    if (!match) return [];
    return [{ version: match[1], name: match[2], digest: digestSql(readFileSync(resolve(directory, path), "utf8")) }];
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [inventory, directory = "supabase/migrations"] = process.argv.slice(2);
  if (!inventory) {
    console.error("Uso: node scripts/migration-inventory.mjs <inventário-supabase.json> [pasta-de-migrações]");
    process.exitCode = 2;
  } else {
    const history = JSON.parse(readFileSync(inventory, "utf8"));
    const valid = Array.isArray(history) && history.length > 0 && history.every((row) =>
      row && /^\d{14}$/.test(row.version) && typeof row.name === "string" &&
      (row.digest === null || /^[a-f0-9]{64}$/.test(row.digest)));
    if (!valid || new Set(history.map((row) => row.version)).size !== history.length) {
      throw new Error("Inventário inválido: espere uma lista não vazia de versões únicas, nomes e hashes SHA-256.");
    }
    const migrations = readMigrations(directory);
    if (!migrations.length) throw new Error("Nenhuma migração versionada encontrada.");
    const result = compareHistory(migrations, history);
    const summary = {
      github: migrations.length, supabase: history.length,
      matches: result.matches.length,
      identical: result.matches.filter((row) => row.content === "identical").length,
      different: result.matches.filter((row) => row.content === "different").length,
      unknown: result.matches.filter((row) => row.content === "unknown").length,
      githubOnly: result.githubOnly.length, supabaseOnly: result.supabaseOnly.length,
      ambiguous: result.ambiguous.length,
    };
    const replayVerified = result.matches.every((row) => row.via === "version" && row.content === "identical") &&
      !summary.githubOnly && !summary.supabaseOnly && !summary.ambiguous;
    console.log(JSON.stringify({ summary, historyMatches: replayVerified, ...result }, null, 2));
  }
}
