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
  if (!process.env.TWILIO_ACCOUNT_SID) {
    console.warn('⚠️  WhatsApp désactivé — TWILIO_ACCOUNT_SID absent des variables d\'environnement');
    return;
  }
  const to  = toWA(telephone);
  const ref = order._id.toString().slice(-6).toUpperCase();
  const base = (process.env.BASE_URL || 'https://wassafati.com').replace(/\/$/, '');
  const link = `${base}/api/orders/${order._id}/details`;
  const sousTotal = (order.articles || []).reduce((sum, a) => sum + (a.prixUnitaire * a.quantite), 0);
  const fraisLivraison = Math.max(0, order.prixTotal - sousTotal);
  const body =
    `🛍️ مرحباً ${prenom}!\n\n` +
    `تم استلام طلبك بنجاح ✅\n` +
    `رقم المرجع: *#${ref}*\n\n` +
    `📦 المنتجات: ${sousTotal.toFixed(2)} MAD\n` +
    `🚚 التوصيل: ${fraisLivraison.toFixed(2)} MAD\n` +
    `💰 المجموع: *${order.prixTotal.toFixed(2)} MAD*\n\n` +
    `👇 اضغط على الرابط لتأكيد أو إلغاء طلبك:\n` +
    `${link}\n\n` +
    `شكراً لثقتك بنا 🌟`;
  try {
    await getClient().messages.create({ from: FROM(), to, body });
    console.log(`✅ WhatsApp envoyé → ${to}`);
  } catch (e) {
    console.error(`❌ WhatsApp (${to}):`, e.message);
  }
}

async function sendTrackingNotification(telephone, atlasCode, trackLink, prenom) {
  if (!process.env.TWILIO_ACCOUNT_SID) return;
  const to = toWA(telephone);
  const body =
    `🚚 مرحباً ${prenom}!\n\n` +
    `طلبك في الطريق إليك 📦\n\n` +
    `رقم التتبع: *${atlasCode}*\n` +
    `👇 تتبع طلبك من هنا:\n` +
    `${trackLink}\n\n` +
    `شكراً لثقتك بنا 🌟`;
  try {
    await getClient().messages.create({ from: FROM(), to, body });
    console.log(`✅ WhatsApp tracking envoyé → ${to}`);
  } catch (e) {
    console.error(`❌ WhatsApp tracking (${to}):`, e.message);
  }
}

module.exports = { sendOrderConfirmation, sendTrackingNotification, toWA };
