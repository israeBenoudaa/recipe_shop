const mongoose = require('mongoose');
const clientSchema = new mongoose.Schema({
  prenom:    { type: String, required: true, trim: true },
  nom:       { type: String, required: true, trim: true },
  telephone: { type: String, required: true, trim: true },
  adresse:   { type: String, required: true, trim: true },
  ville:     { type: String, trim: true, default: '' },
  email:     { type: String, trim: true, lowercase: true, default: '' }
}, { timestamps: true });
module.exports = mongoose.model('Client', clientSchema);
