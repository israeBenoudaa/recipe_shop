const express    = require('express');
const router     = express.Router();
const Order      = require('../models/Order');
const Client     = require('../models/Client');
const Product    = require('../models/Product');
const authVendor = require('../middleware/authVendor');

// POST créer commande (public — clients)
router.post('/', async (req, res) => {
  try {
    const { client: cd, articles, modePaiement, commentaire } = req.body;

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
