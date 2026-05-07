const express = require('express');
const router  = express.Router();
const Order   = require('../models/Order');
const Client  = require('../models/Client');

// Normalise n'importe quel format vers les 9 derniers chiffres
function last9(raw) {
  return raw.replace(/^whatsapp:/i, '').replace(/\D/g, '').slice(-9);
}

function twiml(msg) {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${msg ? `<Message>${msg}</Message>` : ''}</Response>`;
}

// POST /api/whatsapp/webhook — appelé par Twilio à chaque message entrant
router.post('/webhook', express.urlencoded({ extended: false }), async (req, res) => {
  try {
    const from = req.body.From || '';
    const body = (req.body.Body || '').trim().toUpperCase();

    if (body !== 'CONFIRMER') {
      return res.type('text/xml').send(twiml(
        '⚠️ Pour confirmer votre commande, répondez exactement : CONFIRMER'
      ));
    }

    // Retrouver le client par les 9 derniers chiffres du numéro
    const digits = last9(from);
    const client = await Client.findOne({ telephone: { $regex: digits + '$' } });

    if (!client) {
      return res.type('text/xml').send(twiml(
        '⚠️ Numéro introuvable. Contactez-nous directement.'
      ));
    }

    // Commande la plus récente en attente
    const order = await Order.findOne({ client: client._id, statut: 'en_attente' })
      .sort({ createdAt: -1 });

    if (!order) {
      return res.type('text/xml').send(twiml(
        '⚠️ لا توجد لديك طلبات في انتظار التأكيد.'
      ));
    }

    order.statut = 'confirmee';
    await order.save();
    console.log(`✅ Commande ${order._id.toString().slice(-6).toUpperCase()} confirmée via WhatsApp`);

    res.type('text/xml').send(twiml(
      `✅ تم تأكيد طلبك #${order._id.toString().slice(-6).toUpperCase()} بنجاح!\n` +
      `سيتم التواصل معك قريباً 🚀`
    ));
  } catch (e) {
    console.error('❌ Webhook WhatsApp :', e.message);
    res.type('text/xml').send(twiml());
  }
});

module.exports = router;
