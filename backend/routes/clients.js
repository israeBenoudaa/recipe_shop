const express    = require('express');
const router     = express.Router();
const Client     = require('../models/Client');
const authVendor = require('../middleware/authVendor');

// GET tous — vendor uniquement
router.get('/', authVendor, async (req, res) => {
  try {
    const clients = await Client.find().sort({ createdAt: -1 });
    res.json({ success: true, data: clients });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// DELETE client — vendor uniquement
router.delete('/:id', authVendor, async (req, res) => {
  try {
    const c = await Client.findByIdAndDelete(req.params.id);
    if (!c) return res.status(404).json({ success: false, message: 'Introuvable' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
