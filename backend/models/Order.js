const mongoose = require('mongoose');
const orderSchema = new mongoose.Schema({
  client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  articles: [{
    produit:      { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    nomProduit:    { type: String },
    quantite:      { type: Number, required: true, min: 1 },
    prixUnitaire:  { type: Number, required: true },
    prixLivraison: { type: Number, default: 0 }
  }],
  nombreArticles: { type: Number, required: true },
  prixTotal:      { type: Number, required: true },
  modePaiement:   { type: String, enum: ['carte', 'livraison'], required: true },
  paiementStatut: { type: String, enum: ['en_attente', 'paye', 'echec'], default: 'en_attente' },
  statut:         { type: String, enum: ['en_attente', 'confirmee', 'expediee', 'livree', 'annulee'], default: 'en_attente' },
  commentaire:    { type: String, trim: true, default: '' }
}, { timestamps: true });
module.exports = mongoose.model('Order', orderSchema);
