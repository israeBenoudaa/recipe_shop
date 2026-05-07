const twilio = require('twilio');

let _client = null;
function getClient() {
  if (!_client) _client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  return _client;
}

const FROM = () => process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';

// Convertit un numéro marocain "06XXXXXXXX" en "whatsapp:+21206XXXXXXXX"
function toWA(phone) {
  const n = phone.replace(/\s/g, '');
  if (n.startsWith('whatsapp:')) return n;
  if (n.startsWith('+'))  return 'whatsapp:' + n;
  if (n.startsWith('00')) return 'whatsapp:+' + n.slice(2);
  if (n.startsWith('0'))  return 'whatsapp:+212' + n.slice(1);
  return 'whatsapp:+' + n;
}

async function sendOrderConfirmation(telephone, order, prenom) {
  if (!process.env.TWILIO_ACCOUNT_SID) return;
  const to  = toWA(telephone);
  const ref = order._id.toString().slice(-6).toUpperCase();
  const body =
    `🛍️ مرحباً ${prenom}!\n\n` +
    `تم استلام طلبك بنجاح ✅\n` +
    `رقم المرجع: #${ref}\n\n` +
    `📦 ${order.nombreArticles} منتج\n` +
    `💰 ${order.prixTotal.toFixed(2)} MAD\n` +
    `🚚 الدفع عند التوصيل\n\n` +
    `للتأكيد، أرسل:\n` +
    `*CONFIRMER*\n\n` +
    `شكراً لثقتك بنا 🌟`;
  try {
    await getClient().messages.create({ from: FROM(), to, body });
    console.log(`✅ WhatsApp envoyé → ${to}`);
  } catch (e) {
    console.error(`❌ WhatsApp (${to}):`, e.message);
  }
}

module.exports = { sendOrderConfirmation, toWA };
