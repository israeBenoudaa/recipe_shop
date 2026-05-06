const mongoose = require('mongoose');
const productSchema = new mongoose.Schema({
  nom:         { type: String, required: true, trim: true },
  description: { type: String, trim: true, default: '' },
  prix:        { type: Number, required: true, min: 0 },
  prixOriginal:{ type: Number, min: 0, default: null },
  prixRevient:  { type: Number, min: 0, default: null },
  prixLivraison:{ type: Number, min: 0, default: 0 },
  unitesDispo: { type: Number, required: true, min: 0, default: 0 },
  image:       { type: String, default: '' },
  images:      [{ type: String }],
  categorie:   { type: String, trim: true, default: 'Général' },
  actif:       { type: Boolean, default: true }
}, { timestamps: true });
module.exports = mongoose.model('Product', productSchema);
