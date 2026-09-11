const text = v => String(v ?? '').trim();
export const digits = v => String(v ?? '').replace(/\D/g, '');

export function normalizePhoneBR(value) {
  let d = digits(value);
  if (!d) return null;
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) return `+${d}`;
  if (d.length === 10 || d.length === 11) return `+55${d}`;
  return null;
}

function addressSource(contact = {}) {
  const e = contact?.endereco || {};
  return e?.geral || e?.principal || e?.cobranca || e || {};
}

export function mapBlingContactAddress(contact = {}) {
  const a = addressSource(contact);
  return {
    bling_contact_id: Number(contact.id) || null,
    cpf_cnpj: digits(contact.numeroDocumento || contact.cpfCnpj || contact.cpf || contact.cnpj) || null,
    phone_e164: normalizePhoneBR(contact.celular || contact.telefone || contact.fone || contact.whatsapp),
    address: {
      street: text(a.endereco || a.logradouro || a.rua) || null,
      number: text(a.numero) || null,
      complement: text(a.complemento) || null,
      neighborhood: text(a.bairro) || null,
      city: text(a.municipio || a.cidade) || null,
      state: text(a.uf || a.estado).toUpperCase().slice(0, 2) || null,
      postal_code: digits(a.cep) || null,
      reference: text(a.referencia || a.pontoReferencia) || null
    }
  };
}

export function hasAddress(address = {}) {
  return !![address.street, address.number, address.neighborhood, address.city, address.state, address.postal_code].some(Boolean);
}
