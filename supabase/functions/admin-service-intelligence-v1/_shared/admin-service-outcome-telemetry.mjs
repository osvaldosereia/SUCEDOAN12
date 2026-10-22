const ACTION_NAMES = Object.freeze([
  "dashboard",
  "list",
  "preview_bundle",
  "product_search",
  "purchase_xml",
  "r8_customer_detail",
  "r8_customer_memory_save",
  "r8_customers",
  "r8_eval_chunk_internal",
  "r8_eval_dashboard",
  "r8_eval_scenarios",
  "r8_eval_start",
  "r8_handoff_claim",
  "r8_handoff_complete",
  "r8_handoff_queue",
  "r8_health",
  "r8_intelligence",
  "r8_knowledge_save",
  "r8_orders",
  "r8_overview",
  "r8_product_knowledge_save",
  "r8_products",
  "r8_restore_version",
  "r8_rollback_config",
  "r8_save_config",
  "r8_save_model_price",
  "r8_simulator",
  "r8_simulator_history",
  "r8_versions",
  "runtime",
  "save",
  "set_status",
  "vitrine_bling_hub_internal",
  "vitrine_customer_delete",
  "vitrine_customer_get",
  "vitrine_customer_history",
  "vitrine_customer_lookup_phone",
  "vitrine_customer_order_detail",
  "vitrine_customer_save",
  "vitrine_customers_list",
  "vitrine_product_extra"
]);
const ACTION_SET = new Set(ACTION_NAMES);

export const ADMIN_SERVICE_OUTCOME_ACTIONS = ACTION_NAMES;

export function classifyAdminServiceOutcomeStatus(status) {
  const normalized = Number.isInteger(status) && status >= 100 && status <= 599 ? status : 500;
  if (normalized < 400) return "none";
  if (normalized === 409) return "conflict";
  if (normalized === 401 || normalized === 403) return "authorization";
  if (normalized === 429) return "rate_limited";
  if (normalized === 502 || normalized === 503 || normalized === 504) return "upstream";
  if (normalized >= 500) return "server";
  return "request";
}

export function buildAdminServiceOutcomeEvent(action, status) {
  const normalizedStatus = Number.isInteger(status) && status >= 100 && status <= 599 ? status : 500;
  const safeAction = typeof action === "string" && ACTION_SET.has(action) ? action : "unknown";
  return Object.freeze({
    event: "admin_service_action_result",
    action: safeAction,
    status: normalizedStatus,
    error_class: classifyAdminServiceOutcomeStatus(normalizedStatus),
  });
}

export function formatAdminServiceOutcomeEvent(action, status) {
  return JSON.stringify(buildAdminServiceOutcomeEvent(action, status));
}

export async function withAdminServiceOutcomeTelemetry(action, run, logger) {
  const emit = (status) => {
    try {
      const line = formatAdminServiceOutcomeEvent(action, status);
      if (typeof logger === "function") logger(line);
      else console.log(line);
    } catch {
      // Observability must not change the dispatcher response.
    }
  };

  try {
    const response = await run();
    emit(Number.isInteger(response?.status) ? response.status : 500);
    return response;
  } catch (error) {
    emit(500);
    throw error;
  }
}
