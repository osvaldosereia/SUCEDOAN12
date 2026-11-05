import test from "node:test";
import assert from "node:assert/strict";
import { createTemplateViaMeta, MetaTemplatesError } from "../supabase/functions/_shared/whatsapp-meta-templates-v1.mjs";

test("Meta template HTTP failures retain safe provider diagnostics", async () => {
  const template = {
    name: "proximaentregadiante0975v2",
    language: "pt_BR",
    category: "UTILITY",
    components: [{
      type: "BODY",
      text: "Pedido {{1}} em {{2}} min, entregador {{3}}, WhatsApp {{4}}, total {{5}}, pagamento {{6}}.",
      example: { body_text: [["DA066", "15", "Carlos", "+5565999999999", "R$ 120,00", "Pix"]] },
    }],
  };
  const fetchImpl = async () => new Response(JSON.stringify({
    error: {
      message: "Invalid parameter; Bearer secret-value token=other-secret",
      type: "OAuthException",
      code: 100,
      error_subcode: 2388093,
    },
  }), { status: 400 });

  await assert.rejects(
    createTemplateViaMeta({
      accessToken: "test-token",
      wabaId: "123456789012345",
      graphVersion: "v23.0",
      template,
      fetchImpl,
    }),
    (error) => {
      assert.ok(error instanceof MetaTemplatesError);
      assert.equal(error.code, "meta_templates_http_error");
      assert.equal(error.httpStatus, 400);
      assert.equal(error.providerCode, 100);
      assert.equal(error.providerSubcode, 2388093);
      assert.equal(error.providerType, "OAuthException");
      assert.equal(error.providerMessage, "Invalid parameter; Bearer [redacted] token=[redacted]");
      assert.equal(error.providerMessage.includes("secret-value"), false);
      assert.equal(error.providerMessage.includes("other-secret"), false);
      return true;
    },
  );
});
