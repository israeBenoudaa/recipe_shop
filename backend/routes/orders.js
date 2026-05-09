const express    = require('express');
const router     = express.Router();
const Order      = require('../models/Order');
const Client     = require('../models/Client');
const Product    = require('../models/Product');
const authVendor = require('../middleware/authVendor');

// POST créer commande (public — clients)
router.post('/', async (req, res) => {
  try {
    const { client: cd, articles, modePaiement, commentaire, fraisLivraison: fraisLivraisonVille } = req.body;

    let client = await Client.findOne({ telephone: cd.telephone });
    if (!client) { client = new Client(cd); }
    else { Object.assign(client, cd); }
    await client.save();

    let prixTotal = 0, nombreArticles = 0, fraisLivraison = 0;
    const articlesDetail = [];

    for (const a of articles) {
      const p = await Product.findById(a.produitId);
      if (!p) return res.status(404).json({ success: false, message: `Produit introuvable` });
      if (p.unitesDispo < a.quantite) return res.status(400).json({ success: false, message: `Stock insuffisant pour "${p.nom}"` });
      articlesDetail.push({ produit: p._id, nomProduit: p.nom, quantite: a.quantite, prixUnitaire: p.prix, prixLivraison: p.prixLivraison || 0 });
      prixTotal += p.prix * a.quantite;
      fraisLivraison = Math.max(fraisLivraison, p.prixLivraison || 0);
      nombreArticles += a.quantite;
      p.unitesDispo -= a.quantite;
      await p.save();
    }
    if (typeof fraisLivraisonVille === 'number' && fraisLivraisonVille >= 0) {
      fraisLivraison = fraisLivraisonVille;
    }
    prixTotal += fraisLivraison;

    const order = new Order({
      client: client._id, articles: articlesDetail,
      nombreArticles, prixTotal: Math.round(prixTotal * 100) / 100,
      modePaiement, commentaire: commentaire || '',
      paiementStatut: 'en_attente'
    });
    await order.save();
    await order.populate('client');
    res.status(201).json({ success: true, data: order });
    require('../services/whatsapp').sendOrderConfirmation(client.telephone, order, client.prenom).catch(e => console.error('❌ WhatsApp order trigger:', e.message));
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// PATCH simuler paiement carte (public — clients)
router.patch('/:id/pay', async (req, res) => {
  try {
    const { numeroCarte, nomCarte, expiry, cvv } = req.body;
    if (!numeroCarte || numeroCarte.replace(/\s/g,'').length !== 16)
      return res.status(400).json({ success: false, message: 'Numéro de carte invalide (16 chiffres requis)' });
    if (!expiry || !/^\d{2}\/\d{2}$/.test(expiry))
      return res.status(400).json({ success: false, message: 'Date d\'expiration invalide (MM/AA)' });
    if (!cvv || cvv.length < 3)
      return res.status(400).json({ success: false, message: 'CVV invalide' });
    if (!nomCarte || nomCarte.trim().length < 2)
      return res.status(400).json({ success: false, message: 'Nom du titulaire requis' });

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { paiementStatut: 'paye', statut: 'confirmee' },
      { new: true }
    ).populate('client');
    if (!order) return res.status(404).json({ success: false, message: 'Commande introuvable' });
    res.json({ success: true, data: order, message: 'Paiement accepté !' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET page détails commande (publique — lien WhatsApp)
router.get('/:id/details', async (req, res) => {
  try {
    const o = await Order.findById(req.params.id).populate('client');
    if (!o) return res.status(404).send('<h2 style="font-family:sans-serif;padding:40px;text-align:center">Commande introuvable</h2>');
    const ref  = o._id.toString().slice(-6).toUpperCase();
    const now  = new Date().toLocaleTimeString('ar-MA', { hour: '2-digit', minute: '2-digit' });
    const arts = (o.articles || []).map(a =>
      `<div class="art-line">
        <span class="art-name">${a.nomProduit} <span class="art-qty">×${a.quantite}</span></span>
        <span class="art-price">${(a.prixUnitaire * a.quantite).toFixed(2)} MAD</span>
      </div>`
    ).join('');
    const isPending  = o.statut === 'en_attente';
    const isConfirmed = o.statut === 'confirmee';
    const actionBlock = isPending
      ? `<div class="action-bar">
           <a href="/api/orders/${o._id}/confirm" class="btn-confirm">✅ تأكيد الطلب</a>
           <a href="/api/orders/${o._id}/cancel"  class="btn-cancel">❌ إلغاء</a>
         </div>`
      : isConfirmed
      ? `<div class="status-banner confirmed">✅ تم تأكيد طلبك بنجاح</div>`
      : `<div class="status-banner cancelled">❌ تم إلغاء هذا الطلب</div>`;

    res.send(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>طلب #${ref}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',system-ui,sans-serif;background:#ECE5DD;min-height:100vh;display:flex;flex-direction:column}

  /* ── Header ── */
  .wa-header{
    background:#075E54;
    padding:12px 16px;
    display:flex;align-items:center;justify-content:center;
    position:sticky;top:0;z-index:10;
    box-shadow:0 1px 4px rgba(0,0,0,.3);
    width:100%;
  }
  .wa-header img{height:44px;width:auto;object-fit:contain;filter:brightness(0) invert(1)}

  /* ── Chat zone ── */
  .chat{
    flex:1;padding:14px 10px 90px;
    max-width:580px;width:100%;margin:0 auto;
  }

  /* Date pill */
  .date-pill{
    text-align:center;margin:8px 0 14px;
  }
  .date-pill span{
    background:rgba(0,0,0,.18);color:#fff;
    padding:3px 14px;border-radius:10px;font-size:.72rem;
  }

  /* ── Bubble (message reçu — côté gauche en RTL = côté droit) ── */
  .bubble{
    background:#fff;
    border-radius:4px 12px 12px 12px;
    padding:12px 14px 8px;
    max-width:88%;
    margin-left:auto;
    box-shadow:0 1px 2px rgba(0,0,0,.15);
    position:relative;
  }
  .bubble::before{
    content:'';position:absolute;
    top:0;right:-7px;
    border-width:7px 7px 0 0;
    border-style:solid;
    border-color:#fff transparent transparent transparent;
  }

  .bubble-ref{
    background:#f0f4f8;border-radius:8px;
    padding:6px 10px;margin-bottom:10px;
    font-size:.78rem;color:#666;text-align:center;
  }
  .bubble-ref strong{display:block;font-size:1rem;color:#1a1a1a;letter-spacing:.05em}

  .section-lbl{font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#aaa;margin:8px 0 4px}

  .info-row{display:flex;justify-content:space-between;font-size:.82rem;padding:3px 0;color:#1a1a1a}
  .info-row .lbl{color:#888}

  .art-line{display:flex;justify-content:space-between;align-items:baseline;font-size:.82rem;padding:4px 0;border-bottom:1px dashed #eee}
  .art-line:last-of-type{border:none}
  .art-name{color:#1a1a1a}
  .art-qty{font-size:.75rem;color:#888}
  .art-price{font-weight:600;color:#075E54;white-space:nowrap;margin-right:6px}

  .total-line{
    display:flex;justify-content:space-between;
    font-weight:700;font-size:.9rem;
    padding-top:8px;margin-top:4px;
    border-top:1.5px solid #ddd;
    color:#075E54;
  }

  .bubble-time{
    text-align:left;font-size:.65rem;color:#aaa;
    margin-top:6px;display:flex;align-items:center;justify-content:flex-end;gap:3px;
  }
  .tick{color:#53bdeb;font-size:.7rem}

  /* ── Barre d'action fixe en bas ── */
  .action-bar{
    position:fixed;bottom:0;left:0;right:0;
    background:#fff;
    padding:10px 16px;
    display:grid;grid-template-columns:1fr 1fr;gap:10px;
    box-shadow:0 -2px 8px rgba(0,0,0,.1);
  }
  .btn-confirm,.btn-cancel{
    padding:14px;border:none;border-radius:10px;
    font-size:1rem;font-weight:700;
    text-align:center;text-decoration:none;
    cursor:pointer;display:block;transition:all .2s;
  }
  .btn-confirm{background:#25D366;color:#fff}
  .btn-confirm:hover{background:#1ebe5d}
  .btn-cancel{background:#fff;color:#E53935;border:2px solid #E53935}
  .btn-cancel:hover{background:#E53935;color:#fff}

  .status-banner{
    position:fixed;bottom:0;left:0;right:0;
    padding:18px;text-align:center;
    font-weight:700;font-size:1.05rem;
  }
  .status-banner.confirmed{background:#DCF8C6;color:#075E54}
  .status-banner.cancelled{background:#fde8e8;color:#E53935}
</style>
</head>
<body>

<div class="wa-header">
  <img src="/images/Fichier 1.png" alt="logo"/>
</div>

<div class="chat">
  <div class="date-pill"><span>اليوم</span></div>

  <div class="bubble">

    <div class="bubble-ref">
      طلبك
      <strong>#${ref}</strong>
    </div>

    <div class="section-lbl">العميل</div>
    <div class="info-row"><span class="lbl">الاسم</span><span>${o.client.prenom} ${o.client.nom}</span></div>
    <div class="info-row"><span class="lbl">الهاتف</span><span>${o.client.telephone}</span></div>
    <div class="info-row"><span class="lbl">العنوان</span><span>${o.client.adresse}${o.client.ville ? '، ' + o.client.ville : ''}</span></div>

    <div class="section-lbl" style="margin-top:10px">المنتجات</div>
    ${arts}
    <div class="total-line"><span>المجموع</span><span>${o.prixTotal.toFixed(2)} MAD</span></div>

    <div class="section-lbl" style="margin-top:10px">الدفع</div>
    <div class="info-row"><span class="lbl">الطريقة</span><span>${o.modePaiement === 'livraison' ? '🚚 عند التوصيل' : '💳 بطاقة'}</span></div>

    <div class="bubble-time">${now} <span class="tick">✓✓</span></div>
  </div>
</div>

${actionBlock}

</body></html>`);
  } catch (e) { res.status(500).send('<h2>Erreur serveur</h2>'); }
});

// GET confirmer commande (client via lien WhatsApp)
router.get('/:id/confirm', async (req, res) => {
  try {
    const o = await Order.findById(req.params.id);
    if (!o) return res.status(404).send('<h2>Commande introuvable</h2>');
    if (o.statut === 'en_attente') {
      await Order.findByIdAndUpdate(req.params.id, { statut: 'confirmee', paiementStatut: 'en_attente' });
    }
    res.redirect(`/api/orders/${req.params.id}/details`);
  } catch (e) { res.status(500).send('<h2>Erreur serveur</h2>'); }
});

// GET annuler commande (client via lien WhatsApp)
router.get('/:id/cancel', async (req, res) => {
  try {
    const o = await Order.findById(req.params.id);
    if (!o) return res.status(404).send('<h2>Commande introuvable</h2>');
    if (o.statut === 'en_attente') {
      await Order.findByIdAndUpdate(req.params.id, { statut: 'annulee' });
    }
    res.redirect(`/api/orders/${req.params.id}/details`);
  } catch (e) { res.status(500).send('<h2>Erreur serveur</h2>'); }
});

// GET toutes — vendor uniquement
router.get('/', authVendor, async (req, res) => {
  try {
    const orders = await Order.find().populate('client').sort({ createdAt: -1 });
    res.json({ success: true, data: orders });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET une commande — vendor uniquement
router.get('/:id', authVendor, async (req, res) => {
  try {
    const o = await Order.findById(req.params.id).populate('client');
    if (!o) return res.status(404).json({ success: false, message: 'Introuvable' });
    res.json({ success: true, data: o });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// DELETE supprimer commande — vendor uniquement
router.delete('/:id', authVendor, async (req, res) => {
  try {
    const o = await Order.findByIdAndDelete(req.params.id);
    if (!o) return res.status(404).json({ success: false, message: 'Introuvable' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// PATCH modifier statut — vendor uniquement
router.patch('/:id/status', authVendor, async (req, res) => {
  try {
    const { statut } = req.body;
    const valid = ['en_attente','confirmee','expediee','livree','annulee'];
    if (!valid.includes(statut)) return res.status(400).json({ success: false, message: 'Statut invalide' });
    const o = await Order.findByIdAndUpdate(req.params.id, { statut }, { new: true }).populate('client');
    if (!o) return res.status(404).json({ success: false, message: 'Introuvable' });
    res.json({ success: true, data: o });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
