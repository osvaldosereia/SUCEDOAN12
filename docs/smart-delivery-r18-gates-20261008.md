# Smart Delivery R18 — release gates

- Deploy is blocked until the Google service account and depot coordinates are configured.
- The Google worker must use the same internal secret-key resolution as the admin gateway.
- The route fingerprint must include stop status and custody state.
- Driver must not confirm physical return to stock; Expedition confirms custody.
- Do not merge or deploy without passing CI and a controlled operational route.
