const Vendor = require('../models/Vendor');

module.exports = async (req, res, next) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, message: 'Non autorisé' });
    const vendor = await Vendor.findOne({ token });
    if (!vendor) return res.status(401).json({ success: false, message: 'Session expirée' });
    req.vendor = vendor;
    next();
  } catch {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
};
