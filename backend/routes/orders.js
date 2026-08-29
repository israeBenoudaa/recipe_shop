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
    const sousTotal = (o.articles || []).reduce((sum, a) => sum + (a.prixUnitaire * a.quantite), 0);
    const fraisLivraison = Math.max(0, o.prixTotal - sousTotal);
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
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap" rel="stylesheet"/>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Cairo',sans-serif;background:#F0F4F8;min-height:100vh;display:flex;flex-direction:column}

  .top-header{
    background:linear-gradient(135deg,#0A1628 0%,#0D1F40 100%);
    padding:0 20px;
    height:70px;
    display:flex;align-items:center;justify-content:center;
    position:sticky;top:0;z-index:10;
    box-shadow:0 2px 12px rgba(0,0,0,.3);
    overflow:visible;
  }
  .top-header img{height:95px;width:auto;object-fit:contain;display:block;margin-top:80px}

  .page{flex:1;padding:20px 16px 110px;max-width:520px;width:100%;margin:0 auto}

  .ref-card{
    background:#1A56DB;border-radius:14px;
    padding:14px 20px;margin-bottom:16px;
    text-align:center;color:#fff;
    box-shadow:0 4px 16px rgba(26,86,219,.25);
  }
  .ref-label{font-size:.72rem;opacity:.75;margin-bottom:6px;letter-spacing:.08em;text-transform:uppercase}
  .ref-number{font-size:1.5rem;font-weight:600;letter-spacing:.12em;opacity:.95}

  .card{
    background:#fff;border-radius:16px;
    padding:18px 20px;margin-bottom:14px;
    box-shadow:0 2px 8px rgba(0,0,0,.07);
  }
  .card-title{
    font-size:.7rem;font-weight:700;letter-spacing:.1em;
    color:#94A3B8;text-transform:uppercase;margin-bottom:12px;
  }
  .info-row{
    display:flex;justify-content:space-between;align-items:center;
    padding:7px 0;border-bottom:1px solid #F1F5F9;font-size:.9rem;
  }
  .info-row:last-child{border:none}
  .info-row .lbl{color:#94A3B8;font-weight:600}
  .info-row .val{color:#0F172A;font-weight:700;text-align:left}

  .art-line{
    display:flex;justify-content:space-between;align-items:center;
    padding:8px 0;border-bottom:1px solid #F1F5F9;font-size:.9rem;
  }
  .art-line:last-of-type{border:none}
  .art-name{color:#0F172A;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:60%}
  .art-qty{font-size:.78rem;color:#94A3B8;margin-right:4px}
  .art-price{font-weight:600;color:#1A56DB;white-space:nowrap;font-size:.9rem}

  .total-row{
    display:flex;justify-content:space-between;align-items:center;
    padding-top:12px;margin-top:4px;
    border-top:2px solid #E2E8F0;
    font-size:1.05rem;font-weight:900;color:#0F172A;
  }
  .total-row span:last-child{color:#1A56DB;font-size:1.15rem}

  .action-bar{
    position:fixed;bottom:0;left:0;right:0;
    background:#fff;padding:12px 16px;
    display:grid;grid-template-columns:1fr 1fr;gap:10px;
    box-shadow:0 -2px 16px rgba(0,0,0,.1);
  }
  .btn-confirm,.btn-cancel{
    padding:15px;border:none;border-radius:12px;
    font-family:'Cairo',sans-serif;font-size:1rem;font-weight:700;
    text-align:center;text-decoration:none;cursor:pointer;
    display:block;transition:all .2s;
  }
  .btn-confirm{background:#10B981;color:#fff;box-shadow:0 4px 12px rgba(16,185,129,.3)}
  .btn-confirm:hover{background:#059669}
  .btn-cancel{background:#FEF2F2;color:#EF4444;border:2px solid #EF4444}
  .btn-cancel:hover{background:#EF4444;color:#fff}

  .status-banner{
    position:fixed;bottom:0;left:0;right:0;
    padding:20px;text-align:center;
    font-family:'Cairo',sans-serif;font-weight:800;font-size:1.1rem;
    border-radius:20px 20px 0 0;
  }
  .status-banner.confirmed{background:#ECFDF5;color:#10B981;border-top:3px solid #10B981}
  .status-banner.cancelled{background:#FEF2F2;color:#EF4444;border-top:3px solid #EF4444}
</style>
</head>
<body>

<div class="top-header">
  <img src="/images/Fichier 1.png" alt="Wassafati"/>
</div>

<div class="page">

  <div class="ref-card">
    <div class="ref-label">رقم طلبك</div>
    <div class="ref-number">#${ref}</div>
  </div>

  <div class="card">
    <div class="card-title">معلومات العميل</div>
    <div class="info-row"><span class="lbl">الاسم</span><span class="val">${o.client.prenom} ${o.client.nom}</span></div>
    <div class="info-row"><span class="lbl">الهاتف</span><span class="val">${o.client.telephone}</span></div>
    <div class="info-row"><span class="lbl">العنوان</span><span class="val">${o.client.adresse}${o.client.ville ? '، ' + o.client.ville : ''}</span></div>
  </div>

  <div class="card">
    <div class="card-title">المنتجات</div>
    ${arts}
    <div class="info-row"><span class="lbl">المنتجات</span><span class="val">${sousTotal.toFixed(2)} MAD</span></div>
    <div class="info-row"><span class="lbl">🚚 التوصيل</span><span class="val">${fraisLivraison.toFixed(2)} MAD</span></div>
    <div class="total-row"><span>المجموع</span><span>${o.prixTotal.toFixed(2)} MAD</span></div>
  </div>

  <div class="card">
    <div class="card-title">الدفع</div>
    <div class="info-row"><span class="lbl">الطريقة</span><span class="val">${o.modePaiement === 'livraison' ? '🚚 عند التوصيل' : '💳 بطاقة'}</span></div>
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
