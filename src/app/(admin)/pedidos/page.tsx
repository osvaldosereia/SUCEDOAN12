import {
	getAdminOrderBoard,
	type OrderLane,
} from "@/lib/supabase/admin-orders";
import type { OrderBoardActionState } from "./actions";
import { OrdersBoard } from "./orders-board";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined): string {
	return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function lane(value: string): OrderLane {
	if (value === "separate" || value === "ready" || value === "delivered") {
		return value;
	}
	return "new";
}

export default async function PedidosPage({
	searchParams,
}: {
	searchParams: SearchParams;
}) {
	const params = await searchParams;
	const selectedLane = lane(one(params.tab));
	const result = await getAdminOrderBoard({
		lane: selectedLane,
		query: "",
		offset: 0,
	});
	const initialState: OrderBoardActionState = {
		lane: selectedLane,
		query: "",
		offset: 0,
		result,
	};

	return <OrdersBoard initialState={initialState} />;
}
