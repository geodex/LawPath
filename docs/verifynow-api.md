# VerifyNow SA API — complete reference as we use it

Transcribed from the full published reference at `verifynow.co.za/api-docs`,
read end to end on **2026-07-30**. Written down here because we lost three
deploys to guessing at it.

The authoritative machine-readable copy is `SERVICE_SPECS` in
[`server/verifynow.js`](../server/verifynow.js). This document explains it.
If the two ever disagree, the code wins and this file is stale — but the tests
lock the code to the table below.

## The three things that cost us deploys

1. **There is no endpoint per service.** Most services are ONE path
   distinguished by a `reportType` or `bundle` discriminator in the body. An ID
   verification, a consumer trace, a phone lookup and a marital-status check are
   *all* `POST /verify`. Adding a service usually means adding a discriminator,
   not a path.
2. **Names do not transliterate.** Vehicle lookup is `POST /vehicle` taking
   `registrationNumber`. It is not `/number-plate` taking `licence_number`.
   Guessing the obvious name produced a 400 every time.
3. **Live lookups are slow.** Real-time Home Affairs, eNaTIS, CIPC and bank-rail
   calls routinely exceed 15 seconds. A flat 15s client timeout cut real searches
   off mid-flight and looked like an outage.

## Connection

| | |
|---|---|
| Base URL | `https://www.verifynow.co.za/api/external` |
| Auth | `x-api-key: vn_live_...` header — **not** `Authorization: Bearer` |
| Content type | `application/json` (except document OCR, which also takes multipart) |
| Idempotency | `Idempotency-Key: <uuid-v4>` **required** on production POSTs |
| Health | `GET /health` — public, no key |
| Balance | `GET /my_credits` — free |

`api.verifynow.co.za` **does not exist**. There is no separate API subdomain.

### Idempotency rules

- Keys are valid for 30 days.
- Same key + same payload = the cached response (safe retry, charged once).
- Same key + **different** payload = **409**. Never reuse a key for a new search.
- We generate a fresh UUID per call, so retries are new searches by design.

### Sandbox mode

Set `"mode": "sandbox"` in the body. Same key, same endpoint, same fields, mock
response, **no credits charged**. Some routes apply a short per-IP cooldown and
answer 429.

This is how to validate the integration without spending money:

```bash
node server/scripts/verifynow-selftest.js
```

It walks every entry in `SERVICE_SPECS`, calls it in sandbox through our own
wrapper, and prints pass / bad-path / bad-request per service. Run it after any
change to the wrapper and before relying on a search in front of a client.

## Pricing

Credits are pre-paid. **Standard rate is R2.99 per credit**, so
`cost_in_cents = credits × 299` — which is how `serviceCost()` derives it rather
than carrying two numbers that can drift apart. Volume tiers are negotiated with
their enterprise sales.

Only **successful** calls are charged. Rejected requests (400) and unsuccessful
provider outcomes are not. Note two exceptions the docs call out explicitly: an
**address lookup that finds no address** and a **property search with no
records** are both still charged.

## Services

`fixed` fields are injected server-side by the wrapper, so a caller cannot forget
or contradict them. `timeout` reflects whether the call hits a live registry.

### Identity

| Service key | Path | Discriminator | Input | Credits | Cost |
|---|---|---|---|---|---|
| `verify` | `/verify` | `reportType: said_verification` | `idNumber` | 1 | R2.99 |
| `id-photo` | `/verify` | `reportType: home_affairs_id_photo` | `idNumber` | 10 | R29.90 |
| `alive-status` | `/verify` | `reportType: home_affairs_real_time_idv` | `idNumber` | 10 | R29.90 |
| `marital-status` | `/verify` | `reportType: marital-status-real-time` | `idNumber` | 10 | R29.90 |
| `id-enhanced` | `/id-enhanced` | — | `idNumber` | 8 | R23.92 |
| `verify-document` | `/id-document-verify` | `bundle: id_document_verification` | `front_image`, `back_image` | 3 | R8.97 |
| `face-match` | `/facematch` | `bundle: facematch` | `id_number`, `selfie_image_base64` | 10 | R29.90 |

`alive-status` is the richest identity call: deceased status and date, blocked
status, citizenship, names, DOB, gender, marital status, and the ID photo where
returned.

Face Match has two bundles: `facematch` fetches the Home Affairs photo for you;
`facematch_verified` compares against a reference image you supply and does not
touch Home Affairs.

### Tracing — the insurance-claim workhorses

| Service key | Path | Discriminator | Input | Credits | Cost |
|---|---|---|---|---|---|
| `consumer-trace` | `/verify` | `reportType: consumer_trace` | `idNumber` | 10 | R29.90 |
| `consumer-trace-lite` | `/consumer-trace-lite` | — | `idNumber` | 3 | R8.97 |
| `address-lookup` | `/address-lookup` | — | `idNumber` | 3 | R8.97 |
| `phone-lookup` | `/verify` | `reportType: contact_enquiry` | `contactNumber` | 5 | R14.95 |
| `property-search` | `/property-search` | — | `idNumber` | 10 | R29.90 |

`consumer-trace` returns current and historical addresses, employment history and
contact numbers. The `lite` variant is a flat structure with core identity,
marital and deceased status and essential contact details — a third of the price
and usually enough to confirm you have the right person.

`phone-lookup` is a **reverse** lookup: number in, person out.

### Compliance, company, bank

| Service key | Path | Discriminator | Input | Credits | Cost |
|---|---|---|---|---|---|
| `aml-pep` | `/aml-screening` | `entity: 0`, `country: za`, `dataset: all` | `name` | 5 | R14.95 |
| `cipc/company` | `/cipc` | `reportType: cipc_company_match` | `registration_number` | 10 | R29.90 |
| `cipc/director` | `/cipc` | `reportType: cipc_director_search` | `idNumber` | 10 | R29.90 |
| `bank-account-verification` | `/bank-account-verification` | `type: Individual`, `identityType: IDNumber` | `firstName`, `surname`, `identityNumber`, `bankName`, `bankAccountNumber`, `bankBranchCode`, `bankAccountType` | 6 | R17.94 |

CIPC company search needs a **registration number** (`2020/123456/07`) — not a
company name. Use `vat_number` or `sole_prop_id_number` for those identifier
types. If several identifiers are supplied it prefers `registration_number`, then
`vat_number`, then `sole_prop_id_number`.

Bank verification also does companies: `type: "Company"`,
`identityType: "CompanyRegNumber"`, registration number in `identityNumber`.
Completed-but-negative outcomes still return HTTP 200 — inspect `success` and
`response_code`, not the status code.

### Vehicle

| Service key | Path | Discriminator | Input | Credits | Cost |
|---|---|---|---|---|---|
| `number-plate` | `/vehicle` | `bundle: vehicle_lookup` | `registrationNumber` | 10 | R29.90 |
| `vin-decode` | `/vehicle` | `bundle: vehicle_lookup` | `vin` | 10 | R29.90 |

Returns make, model, year and engine details. **`vin-decode` is unconfirmed**:
the reference says `/vehicle` serves a "supported VIN mode" but publishes no VIN
example, so the `vin` field name is our reading. A wrong field name returns their
own complaint and costs nothing.

## Responses

Successful calls look like:

```json
{
  "success": true,
  "requestId": "the idempotency key you sent",
  "remainingCredits": 993,
  "results": { "<discriminator>": { ... } }
}
```

Three consequences for our code:

- The payload is under **`results`**, and keyed by the discriminator.
- There is **no per-call cost** in the response — only what is left. That is why
  our price table exists.
- `GET /my_credits` is shaped differently from everything else:
  `{ "Status": "Success", "Result": { "credits": "1500", "last_refresh": "..." } }`
  — capitalised, and credits as a **string**.

There was never a `metadata` object. Our original code read
`payload.metadata.credits_spent` and `payload.metadata.request_id`, so every call
logged zero credits and a null request id from the day it was written.

### Errors

Status codes and error shapes **vary by service** — the docs say so outright.
`extractErrorDetail()` therefore tries `error.message`, `message`, `detail`,
`errors[]`, a bare string `error`, and finally the raw body, so a validation
complaint is never swallowed. The full response body is logged to
`pm2 logs lawpath-api --err` on any failure.

There is **no published rate-limit tier** and no reliable `X-RateLimit-*`
headers. A route under cooldown returns 429 with `Retry-After`.

## Timeouts

Per-service, in `SERVICE_SPECS`:

- **60s** for anything hitting a live registry (Home Affairs real-time, vehicle,
  CIPC, bank rails, AML).
- **30s** for cached or "lite" lookups.
- Override globally with `VERIFYNOW_TIMEOUT_MS` if a route turns out slower.

A timeout is reported to the attorney as genuinely ambiguous — the provider may
have completed and charged the search — with advice to check the balance before
retrying, because a retry is a new idempotency key and therefore a second charge.

## Combining checks

The API does not accept an arbitrary array of checks in one request. Use a
`bundle` where one exists (`kyc_bundle`, `employee_bundle`, the facematch
bundles); otherwise orchestrate server-side. Bank verification cannot be folded
into a facematch bundle — it is always its own request with its own idempotency
key.

## Pre-flight we should do ourselves

The docs recommend running the standard SA ID checksum locally before spending a
credit on a typo. Not implemented yet — worth doing on the intake flow ([A]).
