begin;
create index if not exists conversation_memory_snapshots_last_message_idx on public.conversation_memory_snapshots(last_message_id) where last_message_id is not null;
create index if not exists customer_service_memory_source_message_idx on public.customer_service_memory(source_message_id) where source_message_id is not null;
create index if not exists service_learning_candidates_source_conversation_idx on public.service_learning_candidates(source_conversation_id) where source_conversation_id is not null;
commit;