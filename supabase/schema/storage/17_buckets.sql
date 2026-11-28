-- bucket: ame-mais
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('ame-mais', 'ame-mais', t, 10485760, '{image/jpeg,image/png,image/webp,application/json}'::text[]) on conflict (id) do nothing;

-- bucket: attendance-library-v1
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('attendance-library-v1', 'attendance-library-v1', f, 26214400, '{image/jpeg,image/png,video/mp4,video/3gpp,audio/aac,audio/amr,audio/mpeg,audio/mp4,audio/ogg,application/pdf,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation}'::text[]) on conflict (id) do nothing;

-- bucket: attendance-media-v1
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('attendance-media-v1', 'attendance-media-v1', f, 20971520, '{image/jpeg,image/png,image/webp,image/gif,audio/ogg,audio/mpeg,audio/mp4,audio/aac,audio/wav,audio/x-wav,video/mp4,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/zip,application/octet-stream}'::text[]) on conflict (id) do nothing;

-- bucket: basket-images
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('basket-images', 'basket-images', t, 2000000, '{image/webp}'::text[]) on conflict (id) do nothing;

-- bucket: caneca-studio-assets
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('caneca-studio-assets', 'caneca-studio-assets', f, 16777216, '{image/webp,image/png,image/jpeg,application/json}'::text[]) on conflict (id) do nothing;

-- bucket: creative-storyboards
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('creative-storyboards', 'creative-storyboards', t, 5242880, '{image/webp,image/png,image/jpeg}'::text[]) on conflict (id) do nothing;

-- bucket: creative-studio-assets
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('creative-studio-assets', 'creative-studio-assets', f, 26214400, '{image/jpeg,image/png,image/webp,image/svg+xml,audio/mpeg,audio/ogg,audio/wav,audio/mp4,application/json,model/gltf+json,model/gltf-binary}'::text[]) on conflict (id) do nothing;

-- bucket: creative-studio-renders
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('creative-studio-renders', 'creative-studio-renders', f, 157286400, '{video/mp4,image/jpeg,image/png,image/webp,application/json}'::text[]) on conflict (id) do nothing;

-- bucket: daily-offer-status
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('daily-offer-status', 'daily-offer-status', f, 67108864, '{image/jpeg}'::text[]) on conflict (id) do nothing;

-- bucket: delivery-proof-v1
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('delivery-proof-v1', 'delivery-proof-v1', f, 5242880, '{image/jpeg,image/png,image/webp}'::text[]) on conflict (id) do nothing;

-- bucket: ean-capture-unknown-photos
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('ean-capture-unknown-photos', 'ean-capture-unknown-photos', f, 5242880, '{image/jpeg,image/png,image/webp}'::text[]) on conflict (id) do nothing;

-- bucket: inventory-label-photos
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('inventory-label-photos', 'inventory-label-photos', f, 10485760, '{image/jpeg,image/png,image/webp}'::text[]) on conflict (id) do nothing;

-- bucket: marketing-private
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('marketing-private', 'marketing-private', f, 104857600, '{image/webp,image/png,image/jpeg,video/mp4}'::text[]) on conflict (id) do nothing;

-- bucket: papoai-homologation-media
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('papoai-homologation-media', 'papoai-homologation-media', t, 2097152, '{audio/ogg}'::text[]) on conflict (id) do nothing;

-- bucket: product-image-batches
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('product-image-batches', 'product-image-batches', f, 10000000, '{image/webp,image/png}'::text[]) on conflict (id) do nothing;

-- bucket: product-images
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('product-images', 'product-images', t, 500000, '{image/webp,image/jpeg,image/png}'::text[]) on conflict (id) do nothing;

-- bucket: purchase-xml
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('purchase-xml', 'purchase-xml', f, 10485760, '{application/xml,text/xml,application/octet-stream}'::text[]) on conflict (id) do nothing;

-- bucket: shopping-room-media
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('shopping-room-media', 'shopping-room-media', f, 10485760, '{audio/webm,audio/ogg,audio/mpeg,audio/mp4,audio/aac,image/jpeg,image/png,image/webp,image/heic,image/heif}'::text[]) on conflict (id) do nothing;

-- bucket: whatsapp-flow-assets
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('whatsapp-flow-assets', 'whatsapp-flow-assets', t, 100000, '{image/jpeg}'::text[]) on conflict (id) do nothing;
