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
    if (!o) return res.status(404).send('<h2 style="font-family:sans-serif;padding:40px">Commande introuvable</h2>');
    const ref  = o._id.toString().slice(-6).toUpperCase();
    const arts = (o.articles || []).map(a =>
      `<div class="art-row"><span>${a.nomProduit} ×${a.quantite}</span><span>${(a.prixUnitaire * a.quantite).toFixed(2)} MAD</span></div>`
    ).join('');
    const alreadyDone = o.statut === 'confirmee' || o.statut === 'annulee';
    const statusBlock = o.statut === 'confirmee'
      ? '<div class="status-ok">✅ تم تأكيد طلبك بنجاح</div>'
      : o.statut === 'annulee'
      ? '<div class="status-cancel">❌ تم إلغاء هذا الطلب</div>'
      : `<div class="btns">
           <a href="/api/orders/${o._id}/confirm" class="btn btn-confirm">✅ تأكيد الطلب</a>
           <a href="/api/orders/${o._id}/cancel"  class="btn btn-cancel">❌ إلغاء الطلب</a>
         </div>`;
    res.send(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>طلب #${ref}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;background:#FAF7F2;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
  .box{background:#fff;border-radius:20px;padding:28px;max-width:440px;width:100%;box-shadow:0 4px 30px rgba(0,0,0,.10)}
  .logo{text-align:center;font-size:1.3rem;font-weight:700;color:#8B6343;margin-bottom:18px}
  .logo span{font-size:2rem;display:block;margin-bottom:4px}
  .ref{text-align:center;background:#F0EAE0;border-radius:10px;padding:10px;margin-bottom:18px;font-size:.85rem;color:#7a6a5a}
  .ref strong{display:block;font-size:1.3rem;color:#2C1A0E;margin-top:2px}
  .section{margin-bottom:14px}
  .section-title{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#C8A882;margin-bottom:8px;padding-bottom:5px;border-bottom:1px solid #F0EAE0}
  .info-row{display:flex;justify-content:space-between;font-size:.88rem;padding:4px 0;color:#2C1A0E}
  .info-row .lbl{color:#9a8a7a}
  .art-row{display:flex;justify-content:space-between;font-size:.85rem;padding:5px 0;border-bottom:1px dashed #F0EAE0}
  .art-row:last-child{border:none}
  .total-row{display:flex;justify-content:space-between;padding:10px 0 0;font-weight:700;font-size:1rem;color:#8B6343;border-top:1px solid #F0EAE0;margin-top:6px}
  .btns{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:20px}
  .btn{padding:14px;border:none;border-radius:12px;font-size:.95rem;font-weight:700;cursor:pointer;text-decoration:none;text-align:center;display:block;transition:all .2s}
  .btn-confirm{background:#4A7C59;color:#fff}
  .btn-confirm:hover{background:#3d6849}
  .btn-cancel{background:#fff;color:#C0392B;border:2px solid #C0392B}
  .btn-cancel:hover{background:#C0392B;color:#fff}
  .status-ok{background:#E8F0EA;color:#4A7C59;padding:14px;border-radius:12px;text-align:center;font-weight:700;margin-top:16px;font-size:1rem}
  .status-cancel{background:#fdf0f0;color:#C0392B;padding:14px;border-radius:12px;text-align:center;font-weight:700;margin-top:16px;font-size:1rem}
  .footer{text-align:center;font-size:.75rem;color:#bbb;margin-top:18px}
</style>
</head>
<body>
<div class="box">
  <div class="logo"><span>🍽️</span>Cartes &amp; Recettes</div>
  <div class="ref">طلبك<strong>#${ref}</strong></div>
  <div class="section">
    <div class="section-title">معلومات العميل</div>
    <div class="info-row"><span class="lbl">الاسم</span><span>${o.client.prenom} ${o.client.nom}</span></div>
    <div class="info-row"><span class="lbl">الهاتف</span><span>${o.client.telephone}</span></div>
    <div class="info-row"><span class="lbl">العنوان</span><span>${o.client.adresse}${o.client.ville ? ', ' + o.client.ville : ''}</span></div>
  </div>
  <div class="section">
    <div class="section-title">المنتجات</div>
    ${arts}
    <div class="total-row"><span>المجموع الإجمالي</span><span>${o.prixTotal.toFixed(2)} MAD</span></div>
  </div>
  <div class="section">
    <div class="section-title">التوصيل</div>
    <div class="info-row"><span class="lbl">طريقة الدفع</span><span>${o.modePaiement === 'livraison' ? '🚚 عند التوصيل' : '💳 بطاقة بنكية'}</span></div>
  </div>
  ${statusBlock}
  <div class="footer">Cartes &amp; Recettes — Wassafati</div>
</div>
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
