// server/whatsapp-attribution.js
// Work out which client an inbound WhatsApp message came from.
//
// Lives on its own because BOTH inbound paths need it and must agree: the Meta
// Cloud API webhook in index.js and the QR-session listener in
// whatsapp-session.js. Two copies of "whose message is this" would eventually
// disagree, and the answer decides which client gets billed.
//
// The number normalisation itself is a database function (lawpath_msisdn_tail,
// migration 046) so the stored side and the incoming side cannot drift apart.

require("dotenv").config();
const { pool } = require("./db");

/** Returns { clientId, matterId, clientName } — nulls when nothing matches.
 *
 *  Prefers the client's WhatsApp number over their mobile: they are separate
 *  fields precisely because a client's WhatsApp is often not the number on the
 *  file. An unattributed message is honest; a wrongly attributed one bills the
 *  wrong client, so this never guesses. */
async function resolveWhatsappClient(tenantId, phoneNumber) {
  const empty = { clientId: null, matterId: null, clientName: null };
  if (!tenantId || !phoneNumber) return empty;

  const r = await pool.query(
    `select id, full_name,
            case when lawpath_msisdn_tail(whatsapp_number) = lawpath_msisdn_tail($2) then 0 else 1 end as rank
       from clients
      where tenant_id = $1
        and lawpath_msisdn_tail($2) <> ''
        and (lawpath_msisdn_tail(whatsapp_number) = lawpath_msisdn_tail($2)
          or lawpath_msisdn_tail(mobile)          = lawpath_msisdn_tail($2))
      order by rank
      limit 1`,
    [tenantId, String(phoneNumber)]
  ).catch(() => ({ rows: [] }));

  const client = r.rows[0];
  if (!client) return empty;

  // Their most recently touched matter. With several open, the attorney can
  // move the entry — the client is the part worth being certain about.
  const m = await pool.query(
    `select id from matters
      where tenant_id = $1 and client_name = $2
      order by updated_at desc limit 1`,
    [tenantId, client.full_name]
  ).catch(() => ({ rows: [] }));

  return { clientId: client.id, matterId: m.rows[0]?.id || null, clientName: client.full_name };
}

module.exports = { resolveWhatsappClient };
