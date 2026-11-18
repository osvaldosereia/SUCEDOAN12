export const staffRoles = [
	"owner",
	"admin",
	"catalog_manager",
	"fulfillment",
] as const;

export type StaffRole = (typeof staffRoles)[number];

export type StaffContext = {
	userId: string;
	role: StaffRole;
};

export const staffRoleLabels: Record<StaffRole, string> = {
	owner: "Proprietário",
	admin: "Administrador",
	catalog_manager: "Catálogo",
	fulfillment: "Expedição",
};

export function isStaffRole(role: string): role is StaffRole {
	return staffRoles.some((staffRole) => staffRole === role);
}
