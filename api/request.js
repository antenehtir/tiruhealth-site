// Sends website requests (walkthrough, pitch deck, partnership, general)
// to the official inbox through the tiruhealth.com mail server.
// Needs these Environment Variables in Vercel (never commit them):
//   SMTP_HOST=mail.tiruhealth.com  SMTP_PORT=465
//   SMTP_USER=anteneh@tiruhealth.com  SMTP_PASS=<mailbox password>
//   MAIL_TO=anteneh@tiruhealth.com   (optional, defaults to SMTP_USER)
const nodemailer = require("nodemailer");

const TYPES = {
  walkthrough: "Tiru Ops walkthrough request",
  deck: "Request: Tiru Ops pitch deck",
  partnership: "Partnership / investment enquiry — Tiru Health",
  general: "Enquiry — Tiru Health",
};
const clean = (v, max) => String(v == null ? "" : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max);
const oneLine = (v, max) => clean(v, max).replace(/[\r\n]+/g, " ");
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

module.exports = async (req, res) => {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ ok: false, error: "method" }); }
  let b = req.body || {};
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } }

  // Spam guards: hidden field must be empty, and a human takes more than 3 seconds.
  if (clean(b.website, 200) || Number(b.elapsed) < 3000) return res.status(200).json({ ok: true });

  const type = TYPES[b.type] ? b.type : "general";
  const name = oneLine(b.name, 120), email = oneLine(b.email, 160), org = oneLine(b.org, 160);
  const role = oneLine(b.role, 120), phone = oneLine(b.phone, 40), message = clean(b.message, 3000);
  if (name.length < 2 || org.length < 2 || message.length < 5 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return res.status(400).json({ ok: false, error: "invalid" });
  }

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_TO } = process.env;
  const dry = process.env.MAIL_DRY_RUN === "1";
  if (!dry && (!SMTP_HOST || !SMTP_USER || !SMTP_PASS)) return res.status(500).json({ ok: false, error: "not_configured" });

  const subject = `${TYPES[type]} — ${org}`;
  const rows = [["Name", name], ["Organisation", org], ["Role", role], ["Email", email], ["Phone", phone]].filter((r) => r[1]);
  const text = `${message}\n\n—\n${rows.map((r) => `${r[0]}: ${r[1]}`).join("\n")}\n\nSent from tiruhealth.com/request`;
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#0B1F1C">
<p style="margin:0 0 6px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#0F766E"><b>${esc(TYPES[type])}</b></p>
<p style="white-space:pre-wrap;margin:0 0 18px">${esc(message)}</p>
<table style="border-collapse:collapse;font-size:14px">${rows.map((r) => `<tr><td style="padding:4px 14px 4px 0;color:#526663">${r[0]}</td><td style="padding:4px 0">${esc(r[1])}</td></tr>`).join("")}</table>
<p style="margin-top:18px;font-size:12px;color:#8A9794">Sent from tiruhealth.com/request — reply to this email to answer ${esc(name)} directly.</p></div>`;

  try {
    const transport = dry
      ? nodemailer.createTransport({ jsonTransport: true })
      : nodemailer.createTransport({ host: SMTP_HOST, port: Number(SMTP_PORT || 465), secure: Number(SMTP_PORT || 465) === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } });
    await transport.sendMail({
      from: `"Tiru Health website" <${SMTP_USER || "anteneh@tiruhealth.com"}>`,
      to: MAIL_TO || SMTP_USER || "anteneh@tiruhealth.com",
      replyTo: `"${name.replace(/"/g, "")}" <${email}>`,
      subject, text, html,
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("request mail failed:", err && err.message);
    return res.status(502).json({ ok: false, error: "send_failed" });
  }
};
