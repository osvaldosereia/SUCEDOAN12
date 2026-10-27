// Generated from the selected Supabase project on 2026-10-26. Regenerate after schema migrations.
export type Json =
	| string
	| number
	| boolean
	| null
	| { [key: string]: Json | undefined }
	| Json[];

export type Database = {
	// Allows to automatically instantiate createClient with right options
	// instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
	__InternalSupabase: {
		PostgrestVersion: "14.18";
	};
	public: {
		Tables: {
			audit_events: {
				Row: {
					action: string;
					actor_id: string | null;
					created_at: string;
					details_redacted: Json;
					entity_id: string | null;
					entity_type: string;
					id: number;
				};
				Insert: {
					action: string;
					actor_id?: string | null;
					created_at?: string;
					details_redacted?: Json;
					entity_id?: string | null;
					entity_type: string;
					id?: never;
				};
				Update: {
					action?: string;
					actor_id?: string | null;
					created_at?: string;
					details_redacted?: Json;
					entity_id?: string | null;
					entity_type?: string;
					id?: never;
				};
				Relationships: [];
			};
			basket_items: {
				Row: {
					basket_id: string;
					id: string;
					product_id: string;
					quantity: number;
				};
				Insert: {
					basket_id: string;
					id?: string;
					product_id: string;
					quantity: number;
				};
				Update: {
					basket_id?: string;
					id?: string;
					product_id?: string;
					quantity?: number;
				};
				Relationships: [
					{
						foreignKeyName: "basket_items_basket_id_fkey";
						columns: ["basket_id"];
						isOneToOne: false;
						referencedRelation: "basket_templates";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "basket_items_product_id_fkey";
						columns: ["product_id"];
						isOneToOne: false;
						referencedRelation: "products";
						referencedColumns: ["id"];
					},
				];
			};
			basket_templates: {
				Row: {
					active: boolean;
					code: string;
					created_at: string;
					id: string;
					name: string;
					price_cents: number | null;
					published_at: string | null;
				};
				Insert: {
					active?: boolean;
					code: string;
					created_at?: string;
					id?: string;
					name: string;
					price_cents?: number | null;
					published_at?: string | null;
				};
				Update: {
					active?: boolean;
					code?: string;
					created_at?: string;
					id?: string;
					name?: string;
					price_cents?: number | null;
					published_at?: string | null;
				};
				Relationships: [];
			};
			customer_addresses: {
				Row: {
					active: boolean;
					city: string | null;
					complement: string | null;
					created_at: string;
					customer_id: string;
					house_number: string | null;
					id: string;
					is_default: boolean;
					label: string | null;
					neighborhood: string | null;
					postal_code: string | null;
					reference: string | null;
					state: string | null;
					street: string | null;
					updated_at: string;
				};
				Insert: {
					active?: boolean;
					city?: string | null;
					complement?: string | null;
					created_at?: string;
					customer_id: string;
					house_number?: string | null;
					id?: string;
					is_default?: boolean;
					label?: string | null;
					neighborhood?: string | null;
					postal_code?: string | null;
					reference?: string | null;
					state?: string | null;
					street?: string | null;
					updated_at?: string;
				};
				Update: {
					active?: boolean;
					city?: string | null;
					complement?: string | null;
					created_at?: string;
					customer_id?: string;
					house_number?: string | null;
					id?: string;
					is_default?: boolean;
					label?: string | null;
					neighborhood?: string | null;
					postal_code?: string | null;
					reference?: string | null;
					state?: string | null;
					street?: string | null;
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: "customer_addresses_customer_id_fkey";
						columns: ["customer_id"];
						isOneToOne: false;
						referencedRelation: "customers";
						referencedColumns: ["id"];
					},
				];
			};
			customer_contacts: {
				Row: {
					created_at: string;
					customer_id: string;
					id: string;
					is_primary: boolean;
					kind: string;
					value_normalized: string;
					verified_at: string | null;
				};
				Insert: {
					created_at?: string;
					customer_id: string;
					id?: string;
					is_primary?: boolean;
					kind: string;
					value_normalized: string;
					verified_at?: string | null;
				};
				Update: {
					created_at?: string;
					customer_id?: string;
					id?: string;
					is_primary?: boolean;
					kind?: string;
					value_normalized?: string;
					verified_at?: string | null;
				};
				Relationships: [
					{
						foreignKeyName: "customer_contacts_customer_id_fkey";
						columns: ["customer_id"];
						isOneToOne: false;
						referencedRelation: "customers";
						referencedColumns: ["id"];
					},
				];
			};
			customers: {
				Row: {
					active: boolean;
					bling_contact_id: number | null;
					created_at: string;
					full_name: string;
					id: string;
					marketing_consent_updated_at: string | null;
					marketing_consent_verified: boolean;
					marketing_opt_in: boolean | null;
					tax_id: string | null;
					updated_at: string;
				};
				Insert: {
					active?: boolean;
					bling_contact_id?: number | null;
					created_at?: string;
					full_name: string;
					id?: string;
					marketing_consent_updated_at?: string | null;
					marketing_consent_verified?: boolean;
					marketing_opt_in?: boolean | null;
					tax_id?: string | null;
					updated_at?: string;
				};
				Update: {
					active?: boolean;
					bling_contact_id?: number | null;
					created_at?: string;
					full_name?: string;
					id?: string;
					marketing_consent_updated_at?: string | null;
					marketing_consent_verified?: boolean;
					marketing_opt_in?: boolean | null;
					tax_id?: string | null;
					updated_at?: string;
				};
				Relationships: [];
			};
			external_entity_links: {
				Row: {
					created_at: string;
					entity_type: string;
					external_id: string;
					id: string;
					local_entity_id: string;
					provider: string;
					verified_at: string | null;
				};
				Insert: {
					created_at?: string;
					entity_type: string;
					external_id: string;
					id?: string;
					local_entity_id: string;
					provider: string;
					verified_at?: string | null;
				};
				Update: {
					created_at?: string;
					entity_type?: string;
					external_id?: string;
					id?: string;
					local_entity_id?: string;
					provider?: string;
					verified_at?: string | null;
				};
				Relationships: [];
			};
			inventory_reservations: {
				Row: {
					created_at: string;
					id: string;
					order_id: string;
					product_id: string;
					quantity: number;
					state: string;
				};
				Insert: {
					created_at?: string;
					id?: string;
					order_id: string;
					product_id: string;
					quantity: number;
					state?: string;
				};
				Update: {
					created_at?: string;
					id?: string;
					order_id?: string;
					product_id?: string;
					quantity?: number;
					state?: string;
				};
				Relationships: [
					{
						foreignKeyName: "inventory_reservations_order_id_fkey";
						columns: ["order_id"];
						isOneToOne: false;
						referencedRelation: "orders";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "inventory_reservations_product_id_fkey";
						columns: ["product_id"];
						isOneToOne: false;
						referencedRelation: "products";
						referencedColumns: ["id"];
					},
				];
			};
			order_items: {
				Row: {
					created_at: string;
					id: string;
					name_snapshot: string;
					order_id: string;
					price_cents: number;
					product_id: string;
					quantity: number;
					sku_snapshot: string | null;
					total_cents: number;
				};
				Insert: {
					created_at?: string;
					id?: string;
					name_snapshot: string;
					order_id: string;
					price_cents: number;
					product_id: string;
					quantity: number;
					sku_snapshot?: string | null;
					total_cents: number;
				};
				Update: {
					created_at?: string;
					id?: string;
					name_snapshot?: string;
					order_id?: string;
					price_cents?: number;
					product_id?: string;
					quantity?: number;
					sku_snapshot?: string | null;
					total_cents?: number;
				};
				Relationships: [
					{
						foreignKeyName: "order_items_order_id_fkey";
						columns: ["order_id"];
						isOneToOne: false;
						referencedRelation: "orders";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "order_items_product_id_fkey";
						columns: ["product_id"];
						isOneToOne: false;
						referencedRelation: "products";
						referencedColumns: ["id"];
					},
				];
			};
			orders: {
				Row: {
					created_at: string;
					customer_id: string | null;
					delivery_cents: number;
					id: string;
					idempotency_key: string;
					order_number: number;
					payment_method: string | null;
					status: string;
					subtotal_cents: number;
					total_cents: number;
					updated_at: string;
				};
				Insert: {
					created_at?: string;
					customer_id?: string | null;
					delivery_cents?: number;
					id?: string;
					idempotency_key: string;
					order_number?: never;
					payment_method?: string | null;
					status?: string;
					subtotal_cents?: number;
					total_cents?: number;
					updated_at?: string;
				};
				Update: {
					created_at?: string;
					customer_id?: string | null;
					delivery_cents?: number;
					id?: string;
					idempotency_key?: string;
					order_number?: never;
					payment_method?: string | null;
					status?: string;
					subtotal_cents?: number;
					total_cents?: number;
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: "orders_customer_id_fkey";
						columns: ["customer_id"];
						isOneToOne: false;
						referencedRelation: "customers";
						referencedColumns: ["id"];
					},
				];
			};
			product_identifiers: {
				Row: {
					conversion_factor: number | null;
					created_at: string;
					id: string;
					kind: string;
					packaging_unit: string | null;
					product_id: string;
					value: string;
				};
				Insert: {
					conversion_factor?: number | null;
					created_at?: string;
					id?: string;
					kind: string;
					packaging_unit?: string | null;
					product_id: string;
					value: string;
				};
				Update: {
					conversion_factor?: number | null;
					created_at?: string;
					id?: string;
					kind?: string;
					packaging_unit?: string | null;
					product_id?: string;
					value?: string;
				};
				Relationships: [
					{
						foreignKeyName: "product_identifiers_product_id_fkey";
						columns: ["product_id"];
						isOneToOne: false;
						referencedRelation: "products";
						referencedColumns: ["id"];
					},
				];
			};
			product_images: {
				Row: {
					alt_text: string | null;
					created_at: string;
					id: string;
					position: number;
					product_id: string;
					storage_path: string;
					verified: boolean;
				};
				Insert: {
					alt_text?: string | null;
					created_at?: string;
					id?: string;
					position?: number;
					product_id: string;
					storage_path: string;
					verified?: boolean;
				};
				Update: {
					alt_text?: string | null;
					created_at?: string;
					id?: string;
					position?: number;
					product_id?: string;
					storage_path?: string;
					verified?: boolean;
				};
				Relationships: [
					{
						foreignKeyName: "product_images_product_id_fkey";
						columns: ["product_id"];
						isOneToOne: false;
						referencedRelation: "products";
						referencedColumns: ["id"];
					},
				];
			};
			products: {
				Row: {
					active: boolean;
					bling_product_id: number | null;
					brand: string | null;
					category: string | null;
					cost_cents: number | null;
					created_at: string;
					description_short: string | null;
					gtin: string | null;
					id: string;
					name: string;
					price_cents: number | null;
					published_at: string | null;
					review_status: string;
					sku: string | null;
					stock_units: number;
					subcategory: string | null;
					unit: string | null;
					updated_at: string;
				};
				Insert: {
					active?: boolean;
					bling_product_id?: number | null;
					brand?: string | null;
					category?: string | null;
					cost_cents?: number | null;
					created_at?: string;
					description_short?: string | null;
					gtin?: string | null;
					id?: string;
					name: string;
					price_cents?: number | null;
					published_at?: string | null;
					review_status?: string;
					sku?: string | null;
					stock_units?: number;
					subcategory?: string | null;
					unit?: string | null;
					updated_at?: string;
				};
				Update: {
					active?: boolean;
					bling_product_id?: number | null;
					brand?: string | null;
					category?: string | null;
					cost_cents?: number | null;
					created_at?: string;
					description_short?: string | null;
					gtin?: string | null;
					id?: string;
					name?: string;
					price_cents?: number | null;
					published_at?: string | null;
					review_status?: string;
					sku?: string | null;
					stock_units?: number;
					subcategory?: string | null;
					unit?: string | null;
					updated_at?: string;
				};
				Relationships: [];
			};
			staff_profiles: {
				Row: {
					created_at: string;
					enabled: boolean;
					role: string;
					user_id: string;
				};
				Insert: {
					created_at?: string;
					enabled?: boolean;
					role: string;
					user_id: string;
				};
				Update: {
					created_at?: string;
					enabled?: boolean;
					role?: string;
					user_id?: string;
				};
				Relationships: [];
			};
		};
		Views: {
			[_ in never]: never;
		};
		Functions: {
			[_ in never]: never;
		};
		Enums: {
			[_ in never]: never;
		};
		CompositeTypes: {
			[_ in never]: never;
		};
	};
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
	keyof Database,
	"public"
>];

export type Tables<
	DefaultSchemaTableNameOrOptions extends
		| keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
		| { schema: keyof DatabaseWithoutInternals },
	TableName extends DefaultSchemaTableNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
				DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
		: never = never,
> = DefaultSchemaTableNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
			DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
			Row: infer R;
		}
		? R
		: never
	: DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
				DefaultSchema["Views"])
		? (DefaultSchema["Tables"] &
				DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
				Row: infer R;
			}
			? R
			: never
		: never;

export type TablesInsert<
	DefaultSchemaTableNameOrOptions extends
		| keyof DefaultSchema["Tables"]
		| { schema: keyof DatabaseWithoutInternals },
	TableName extends DefaultSchemaTableNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
		: never = never,
> = DefaultSchemaTableNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
			Insert: infer I;
		}
		? I
		: never
	: DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
		? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
				Insert: infer I;
			}
			? I
			: never
		: never;

export type TablesUpdate<
	DefaultSchemaTableNameOrOptions extends
		| keyof DefaultSchema["Tables"]
		| { schema: keyof DatabaseWithoutInternals },
	TableName extends DefaultSchemaTableNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
		: never = never,
> = DefaultSchemaTableNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
			Update: infer U;
		}
		? U
		: never
	: DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
		? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
				Update: infer U;
			}
			? U
			: never
		: never;

export type Enums<
	DefaultSchemaEnumNameOrOptions extends
		| keyof DefaultSchema["Enums"]
		| { schema: keyof DatabaseWithoutInternals },
	EnumName extends DefaultSchemaEnumNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
		: never = never,
> = DefaultSchemaEnumNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
	: DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
		? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
		: never;

export type CompositeTypes<
	PublicCompositeTypeNameOrOptions extends
		| keyof DefaultSchema["CompositeTypes"]
		| { schema: keyof DatabaseWithoutInternals },
	CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
		: never = never,
> = PublicCompositeTypeNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
	: PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
		? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
		: never;

export const Constants = {
	public: {
		Enums: {},
	},
} as const;
