export type PreferredReply = "auto" | "text" | "audio";

export interface CustomerAddressRecord {
  id?: string;
  label: string | null;
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  state: string;
  postalCode: string;
  reference: string | null;
  isDefault: boolean;
  isActive: boolean;
}

export interface CustomerRecord {
  id: string | null;
  name: string;
  cpfCnpj: string | null;
  phoneE164: string;
  preferredReply: PreferredReply;
  isActive: boolean;
  addresses: CustomerAddressRecord[];
}

export interface CustomerListItem extends Omit<CustomerRecord, "addresses"> {
  addresses: [];
}

export function emptyCustomer(): CustomerRecord {
  return {
    id: null,
    name: "",
    cpfCnpj: null,
    phoneE164: "",
    preferredReply: "auto",
    isActive: true,
    addresses: [{
      label: "Principal", street: "", number: "", complement: null,
      neighborhood: "", city: "", state: "", postalCode: "", reference: null,
      isDefault: true, isActive: true,
    }],
  };
}
