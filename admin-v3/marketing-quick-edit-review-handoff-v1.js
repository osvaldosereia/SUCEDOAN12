(() => {
  'use strict';

  const HANDOFF_SCHEMA = 'marketing-quick-edit-review-handoff-v1';
  const COMPARISON_SCHEMA = 'marketing-quick-edit-revision-comparison-v1';
  const MAX_HISTORY = 2;
  const state = { history: [], comparison: null };

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function isSha256(value) {
    return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
  }

  function assertSafePacket(packet) {
    const validator = window.DAMarketingQuickEditReviewReadonlyV1;
    if (!validator || typeof validator.validatePacket !== 'function') {
      throw new Error('unsafe_review_packet:validator_unavailable');
    }

    let validated;
    try {
      validated = validator.validatePacket(packet);
    } catch (error) {
      throw new Error(`unsafe_review_packet:${error?.message || 'invalid_package'}`);
    }

    const safe = packet
      && packet.schema_version === 'marketing-quick-edit-review-package-v1'
      && packet.preview_only === true
      && packet.mutations_allowed === false
      && packet.external_side_effect === false
      && packet.network_allowed === false
      && packet.provider_call_allowed === false
      && packet.storage_write_allowed === false
      && packet.filesystem_write_allowed === false
      && validated;

    if (!safe) throw new Error('unsafe_review_packet');
    return validated;
  }

  function sanitizeDiff(diff) {
    if (!Array.isArray(diff)) return [];
    return diff.map((row) => {
      if (!row || typeof row.path !== 'string' || !row.path.startsWith('/')) {
        throw new Error('unsafe_review_packet:invalid_diff_path');
      }
      if (!isSha256(row.before_sha256) || !isSha256(row.after_sha256)) {
        throw new Error('unsafe_review_packet:invalid_diff_hash');
      }
      return Object.freeze({
        path: row.path,
        before_type: typeof row.before_type === 'string' ? row.before_type : 'unknown',
        after_type: typeof row.after_type === 'string' ? row.after_type : 'unknown',
        before_sha256: row.before_sha256,
        after_sha256: row.after_sha256,
      });
    });
  }

  function sanitizePacket(packet) {
    assertSafePacket(packet);

    const edit = packet.quick_edit;
    const integrity = packet.render_integrity;
    const approval = packet.approval_preview;
    if (!edit || !integrity || !approval) throw new Error('unsafe_review_packet:missing_links');

    if (
      edit.asset_id !== packet.asset_id
      || integrity.asset_id !== packet.asset_id
      || edit.revision !== packet.revision
      || integrity.revision !== packet.revision
      || edit.spec_sha256 !== integrity.spec_sha256
      || packet.render_profile !== integrity.render_profile
      || approval.preview_only !== true
      || approval.ready_for_real_publish !== false
      || approval.external_side_effect !== false
      || approval.network_allowed !== false
      || approval.mutations_allowed !== false
    ) {
      throw new Error('unsafe_review_packet:link_mismatch');
    }

    const safeSnapshot = {
      schema_version: HANDOFF_SCHEMA,
      asset_id: String(packet.asset_id),
      from_revision: Number(packet.from_revision),
      revision: Number(packet.revision),
      render_profile: String(packet.render_profile),
      generation_mode: String(packet.generation_mode),
      package_sha256: String(packet.package_sha256 || ''),
      spec_sha256: String(edit.spec_sha256 || ''),
      svg_sha256: String(integrity.svg_sha256 || ''),
      png_sha256: String(integrity.png_sha256 || ''),
      diff: sanitizeDiff(edit.diff),
      blockers: Array.isArray(packet.blockers) ? packet.blockers.map(String) : [],
      review_status: String(packet.review_status || 'blocked'),
      preview_only: true,
      mutations_allowed: false,
      external_side_effect: false,
      network_allowed: false,
      provider_call_allowed: false,
      storage_write_allowed: false,
      filesystem_write_allowed: false,
      idempotency_key: String(packet.idempotency_key || ''),
    };

    if (!Number.isInteger(safeSnapshot.from_revision) || !Number.isInteger(safeSnapshot.revision) || safeSnapshot.revision <= safeSnapshot.from_revision) {
      throw new Error('unsafe_review_packet:invalid_revision');
    }
    if (!safeSnapshot.idempotency_key) throw new Error('unsafe_review_packet:missing_idempotency_key');
    for (const hash of [safeSnapshot.package_sha256, safeSnapshot.spec_sha256, safeSnapshot.svg_sha256, safeSnapshot.png_sha256]) {
      if (!isSha256(hash)) throw new Error('unsafe_review_packet:invalid_hash');
    }

    return Object.freeze(safeSnapshot);
  }

  function compareSanitized(previous, current) {
    if (!previous || !current || previous.asset_id !== current.asset_id) {
      throw new Error('non_contiguous_revisions:asset_mismatch');
    }
    if (previous.revision !== current.from_revision) {
      throw new Error('non_contiguous_revisions');
    }

    const prevMap = new Map(previous.diff.map((row) => [row.path, row]));
    const currMap = new Map(current.diff.map((row) => [row.path, row]));
    const allPaths = [...new Set([...prevMap.keys(), ...currMap.keys()])].sort();

    const paths = allPaths.map((path) => {
      const prev = prevMap.get(path);
      const curr = currMap.get(path);
      const beforeSha = prev?.after_sha256 || curr?.before_sha256 || null;
      const afterSha = curr?.after_sha256 || prev?.after_sha256 || null;
      let status = 'unchanged';
      if (!prev && curr) status = 'added';
      else if (prev && !curr) status = 'removed';
      else if (beforeSha !== afterSha) status = 'changed';
      return Object.freeze({
        path,
        before_sha256: beforeSha,
        after_sha256: afterSha,
        status,
      });
    });

    return Object.freeze({
      schema_version: COMPARISON_SCHEMA,
      asset_id: current.asset_id,
      from_revision: previous.revision,
      to_revision: current.revision,
      status: 'contiguous',
      paths,
      preview_only: true,
      mutations_allowed: false,
      network_allowed: false,
      external_side_effect: false,
    });
  }

  function compareRevisions(previousPacket, currentPacket) {
    return compareSanitized(sanitizePacket(previousPacket), sanitizePacket(currentPacket));
  }

  function sameDelivery(previous, current) {
    return previous.asset_id === current.asset_id
      && previous.from_revision === current.from_revision
      && previous.revision === current.revision
      && previous.idempotency_key === current.idempotency_key
      && previous.package_sha256 === current.package_sha256
      && previous.spec_sha256 === current.spec_sha256
      && previous.svg_sha256 === current.svg_sha256
      && previous.png_sha256 === current.png_sha256;
  }

  function handoff(packet) {
    const current = sanitizePacket(packet);
    const sameKey = state.history.find((item) => item.idempotency_key === current.idempotency_key);
    if (sameKey) {
      if (sameDelivery(sameKey, current)) return getSnapshot();
      throw new Error('idempotency_conflict');
    }

    const sameRevision = state.history.find((item) => item.asset_id === current.asset_id && item.revision === current.revision);
    if (sameRevision) {
      if (sameDelivery(sameRevision, current)) return getSnapshot();
      throw new Error('revision_conflict');
    }

    const previous = state.history.at(-1) || null;
    state.comparison = previous ? compareSanitized(previous, current) : null;
    state.history.push(current);
    if (state.history.length > MAX_HISTORY) state.history.splice(0, state.history.length - MAX_HISTORY);
    return getSnapshot();
  }

  function getSnapshot() {
    return clone({
      latest: state.history.at(-1) || null,
      history: state.history,
      comparison: state.comparison,
    });
  }

  window.DAMarketingQuickEditReviewHandoffV1 = Object.freeze({
    schema_version: HANDOFF_SCHEMA,
    comparison_schema_version: COMPARISON_SCHEMA,
    sanitizePacket,
    compareRevisions,
    handoff,
    getSnapshot,
  });
})();
