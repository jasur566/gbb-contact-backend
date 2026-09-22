const nodemailer = require('nodemailer');

const requestLog = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const max = 5;

  const entry = requestLog.get(ip) || { count: 0, start: now };
  if (now - entry.start > windowMs) {
    entry.count = 0;
    entry.start = now;
  }
  entry.count += 1;
  requestLog.set(ip, entry);

  return entry.count > max;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function validateContactInput({ name, email, message }) {
  const errors = [];
  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    errors.push("Ism kamida 2 ta belgidan iborat bo'lishi kerak.");
  }
  if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push("Email manzili noto'g'ri.");
  }
  if (!message || typeof message !== 'string' || message.trim().length < 5) {
    errors.push("Xabar kamida 5 ta belgidan iborat bo'lishi kerak.");
  }
  if (name && name.length > 200) errors.push('Ism juda uzun.');
  if (message && message.length > 5000) errors.push('Xabar juda uzun.');
  return errors;
}

module.exports = async function handler(req, res) {
  const allowedOrigin = process.env.FRONTEND_URL || '*';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: "Faqat POST so'rovlar qabul qilinadi." });
  }

  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  if (isRateLimited(ip)) {
    return res.status(429).json({ success: false, error: "Juda ko'p so'rov yuborildi. Keyinroq urinib ko'ring." });
  }

  try {
    const { name, email, phone, message } = req.body || {};

    const errors = validateContactInput({ name, email, message });
    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: `"GBB Website" <${process.env.SMTP_USER}>`,
      to: process.env.CONTACT_RECEIVER_EMAIL,
      replyTo: email,
      subject: `Yangi xabar: ${escapeHtml(name)}`,
      html: `
        <h3>Kontakt formasidan yangi xabar</h3>
        <p><b>Ism:</b> ${escapeHtml(name)}</p>
        <p><b>Email:</b> ${escapeHtml(email)}</p>
        <p><b>Telefon:</b> ${escapeHtml(phone || '-')}</p>
        <p><b>Xabar:</b></p>
        <p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>
      `,
    });

    return res.status(200).json({ success: true, message: 'Xabaringiz yuborildi!' });
  } catch (err) {
    console.error('Email yuborishda xatolik:', err.message);
    return res.status(500).json({ success: false, error: 'Server xatoligi. Keyinroq urinib ko\'ring.' });
  }
};
