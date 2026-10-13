/**
 * DA6: atestado de QA vinculado à versão EXATA do software.
 *
 * Este parser valida apenas metadados, não comprova que hardware/ambiente foi
 * homologado de fato. Aprovação humana, evidências privadas e revisão do PR
 * continuam obrigatórias antes de qualquer deploy.
 */
export function verifyDa6EvidenceHeader(content, gate, sourceFingerprint) {
  if (typeof content !== 'string' || typeof gate !== 'string' ||
      !/^[a-f0-9]{64}$/.test(String(sourceFingerprint))) {
    return {ok: false, reason: 'attestation_invalid_input'};
  }
  // Metadados estritos no PRIMEIRO bloco: não aceitar linhas duplicadas, notas
  // informais sobre aprovação ou a menção do hash em outro lugar do documento.
  const header = /^<!-- DA6_ATTESTATION_V1\r?\ngate: ([a-z0-9_]+)\r?\nsource_fingerprint: ([a-f0-9]{64})\r?\nresult: PASS\r?\n-->(?:\r?\n|$)/.exec(content);
  if (!header) return {ok: false, reason: 'attestation_header_missing_or_invalid'};
  if (header[1] !== gate) return {ok: false, reason: 'attestation_gate_mismatch'};
  if (header[2] !== sourceFingerprint) {
    return {ok: false, reason: 'attestation_source_fingerprint_mismatch'};
  }
  return {ok: true};
}
