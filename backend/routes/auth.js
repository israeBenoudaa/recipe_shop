const express = require('express');
const crypto  = require('crypto');
const router  = express.Router();
const Vendor  = require('../models/Vendor');

function hashPwd(p) {
  return crypto.createHash('sha256').update(p).digest('hex');
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { nomComplet, motDePasse } = req.body;
    if (!nomComplet || !motDePasse)
      return res.status(400).json({ success: false, message: 'Champs requis manquants' });

    const vendor = await Vendor.findOne({
      nomComplet: { $regex: new RegExp('^' + nomComplet.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') },
      motDePasse: hashPwd(motDePasse)
    });

    if (!vendor)
      return res.status(401).json({ success: false, message: 'Nom complet ou mot de passe incorrect' });

    const token = crypto.randomBytes(32).toString('hex');
    vendor.token = token;
    await vendor.save();

    res.json({ success: true, token, nom: vendor.nomComplet });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (token) await Vendor.findOneAndUpdate({ token }, { token: null });
    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false });
  }
});

// GET /api/auth/check
router.get('/check', async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false });
    const vendor = await Vendor.findOne({ token });
    if (!vendor) return res.status(401).json({ success: false });
    res.json({ success: true, nom: vendor.nomComplet });
  } catch {
    res.status(500).json({ success: false });
  }
});

module.exports = router;
