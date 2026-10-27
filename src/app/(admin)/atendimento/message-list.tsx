"use client";

import { type ReactNode, useEffect, useRef } from "react";

export function MessageList({ children }: { children: ReactNode }) {
	const bottom = useRef<HTMLDivElement>(null);

	useEffect(() => {
		bottom.current?.scrollIntoView({ block: "end" });
	}, []);

	return (
		<div aria-live="polite" className="inbox-message-list">
			{children}
			<div aria-hidden="true" ref={bottom} />
		</div>
	);
}
