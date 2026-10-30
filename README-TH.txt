Bunchie's Secret Diary — Cloudflare Pages + D1

Cloudflare D1 database already created and initialized: bunchie-secret-diary

1. Put all files from this ZIP into a GitHub repository, keeping the folders public/ and functions/.
2. Cloudflare > Workers & Pages > Create Pages > Connect to Git; choose repository. No build command; output directory public.
3. In Pages Settings > Bindings add D1 database binding named DB; select bunchie-secret-diary. Redeploy.
4. In Pages Settings > Variables and Secrets add a strong random ADMIN_SETUP_CODE secret. Redeploy.
5. Visit site, register owner account. To claim admin, while logged in use browser devtools console:
fetch('/api/admin-claim',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:'YOUR_ADMIN_SETUP_CODE'})}).then(r=>r.json()).then(console.log)
6. Reload site; Admin tab appears. Remove ADMIN_SETUP_CODE after successful claim.

IMPORTANT: D1 stores structured records, not uploaded image files. Image URL support is implemented; R2 uploads are NOT included yet. Custom email/password login lacks email verification, password reset, rate limiting, and Turnstile; do not launch for broad public registrations until these are added. Admin claim requires developer console/API client; phone-friendly claim UI not yet included.
