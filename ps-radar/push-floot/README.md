# PS Radar 2.3.4 notification backend

Provider: Floot. Project: 772c91df-39e0-42ab-9556-5502724d0665.
Database and managed VAPID push are provisioned. Render is not used.

Verified in sandbox: config, current catalog price check, registration, subscription JSON-object storage, token ownership denial, CORS and disable. Existing five-condition policy tests pass. Physical-device delivery has not been verified.

Production published at https://ps-radar-alerts.floot.app on 2026-10-04. GET /_api/radar and POST /_api/price-check return HTTP 200. preview-v2/push-config.json points at this production origin. The publish form was unusable on the user's device; the provider's documented direct-publish fallback completed successfully. Phone permission and physical-device notification delivery still require a device test.

GitHub .github/workflows/ps-radar-push-price-check.yml runs at minutes 7,27,47; it skips explicitly while apiBase is null. Floot paid scheduled jobs are not used. Backend price-check claims a database lease, at most once every 19 minutes, reads only the trusted safe catalog, rejects stale/unverified/upcoming prices, persists samples/outbox and de-duplicates notification IDs. Push subscriptions and rule changes require a per-device secret hashed in storage. Browser calls use text/plain SuperJSON to avoid cross-origin preflight. Server allows the existing GitHub Pages origin.

Frontend: preview-v2/push-client.mjs, push-sw.js, push-config.json and index.html. Keep wish/history keys unchanged. No APK build.

Floot routes: GET /_api/radar (public config), POST /_api/radar (save/disable/test with device ID and token), POST /_api/price-check (trusted catalog only, database-throttled). Hosted helpers use Kysely db and @floot/push. The provider-managed service worker is untouched; GitHub Pages owns its independent service worker.
