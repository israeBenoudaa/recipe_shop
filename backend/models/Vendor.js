const mongoose = require('mongoose');

const vendorSchema = new mongoose.Schema({
  nomComplet: { type: String, required: true },
  motDePasse: { type: String, required: true },
  token:      { type: String, default: null }
}, { timestamps: true });

module.exports = mongoose.model('Vendor', vendorSchema);
