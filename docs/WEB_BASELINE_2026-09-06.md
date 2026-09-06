# Production-verified V11 web baseline — 2026-09-06

This record captures the exact web release evidence that closes the roadmap's Phase 0 software gate.

## Accepted software-side baseline

- Repository: `azmusgb/filamentinventory`
- Branch: `main`
- Exact source SHA: `0e2a79cc80be1c0bd9f16956d007aaa8111bf916`
- Application version: `10.2.0`
- Change: PR #103 — Restore native V11 workflow styles on mobile Sync
- Merge result: merged to `main`

## Validation evidence

### Pull-request head

PR #103 head `85f2974761814f51e313b60dfcdac4a438a1dcd6` passed the CI validation job, including:

- static validation;
- Node tests;
- production build;
- deploy-output verification;
- browser interaction and visual regression;
- artifact upload.

The Netlify deploy preview for that exact head also reported success.

### Post-merge `main`

GitHub Actions CI run `34052123332` / run number `757` completed successfully for exact SHA `0e2a79cc80be1c0bd9f16956d007aaa8111bf916`.

Its `Validate` job passed:

- static validation;
- tests;
- production build;
- deploy-output verification;
- browser interaction and visual regression;
- browser/deploy artifact upload.

### Production smoke

Production Smoke run `34052305740` / run number `624` completed successfully for the same exact SHA.

The production smoke contract verifies, among other things:

- production exposes the exact expected Git SHA and application version;
- critical public assets are reachable;
- deployment/security response headers are present;
- sync endpoints fail closed without valid credentials/profile scope;
- Assistant health reports configured server-side transport without exposing credentials;
- the QR endpoint preserves its public read-only security contract.

## Gate decision

**Roadmap Phase 0 software exit gate: PASSED for the exact SHA above.**

This is a software/production acceptance statement only. It does not prove:

- real private workspace sync on a user's active browser/iPhone;
- Grounded model behavioral acceptance;
- Bill/Aimee end-to-end model isolation against linked private data;
- WS350 physical acceptance;
- firmware migration/recovery acceptance.

Those remain separate gates and must not be inferred from this baseline.
