const express     = require('express');
const router      = express.Router();
const path        = require('path');
const multer      = require('multer');
const cloudinary  = require('cloudinary').v2;
const Product     = require('../models/Product');
const authVendor  = require('../middleware/authVendor');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Multer en mémoire — le fichier est envoyé directement à Cloudinary
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    cb(null, /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype));
  }
});

// POST upload image — vendor uniquement
router.post('/upload', authVendor, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'Fichier invalide' });
  try {
    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { folder: 'recipe-shop', resource_type: 'image' },
        (err, r) => err ? reject(err) : resolve(r)
      ).end(req.file.buffer);
    });
    res.json({ success: true, path: result.secure_url });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Upload Cloudinary échoué : ' + e.message });
  }
});

// GET tous (public — client et vendor)
router.get('/', async (req, res) => {
  try {
    const filter = req.query.all === 'true'
      ? {}
      : req.query.inclEpuise === 'true'
        ? { actif: true }
        : { actif: true, unitesDispo: { $gt: 0 } };
    const products = await Product.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, data: products });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// GET un produit (public)
router.get('/:id', async (req, res) => {
  try {
    const p = await Product.findById(req.params.id);
    if (!p) return res.status(404).json({ success: false, message: 'Introuvable' });
    res.json({ success: true, data: p });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// POST créer — vendor uniquement
router.post('/', authVendor, async (req, res) => {
  try {
    const p = new Product(req.body);
    await p.save();
    res.status(201).json({ success: true, data: p });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

// PUT modifier — vendor uniquement
router.put('/:id', authVendor, async (req, res) => {
  try {
    const p = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!p) return res.status(404).json({ success: false, message: 'Introuvable' });
    res.json({ success: true, data: p });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
});

// DELETE supprimer — vendor uniquement
router.delete('/:id', authVendor, async (req, res) => {
  try {
    const p = await Product.findByIdAndDelete(req.params.id);
    if (!p) return res.status(404).json({ success: false, message: 'Introuvable' });
    res.json({ success: true, message: 'Produit supprimé' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
