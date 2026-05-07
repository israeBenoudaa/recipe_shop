require('dotenv').config();
const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');
const path     = require('path');
const crypto   = require('crypto');

const app  = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/recipe-shop-v2';

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Afficher la page de connexion sur /vendor
app.get('/vendor', (req, res) => res.sendFile(path.join(__dirname, '../vendor/login.html')));

// Servir les deux environnements séparément
app.use('/client',  express.static(path.join(__dirname, '../client')));
app.use('/vendor',  express.static(path.join(__dirname, '../vendor')));
app.use('/images',  express.static(path.join(__dirname, '../images')));

// API auth (public)
app.use('/api/auth', require('./routes/auth'));

// API métier
app.use('/api/products',  require('./routes/products'));
app.use('/api/orders',    require('./routes/orders'));
app.use('/api/clients',   require('./routes/clients'));
app.use('/api/whatsapp',  require('./routes/whatsapp'));

// Routes racines
app.get('/',       (req, res) => res.redirect('/client'));
app.get('/client', (req, res) => res.sendFile(path.join(__dirname, '../client/index.html')));

// Seed produits
const seedProducts = async () => {
  const Product = require('./models/Product');
  if (await Product.countDocuments() === 0) {
    await Product.insertMany([
      { nom: 'Pack Recettes Méditerranéennes', description: '50 cartes recettes illustrées — entrées, plats et desserts du bassin méditerranéen.', prix: 24.90, unitesDispo: 80, image: '/images/product1.jpg', categorie: 'Méditerranéen' },
      { nom: 'Collection Pâtisserie Française', description: '40 cartes de pâtisserie française classique avec fiches techniques détaillées.', prix: 19.90, unitesDispo: 60, image: '/images/product2.jpg', categorie: 'Pâtisserie' },
      { nom: 'Coffret Cuisine du Monde', description: '60 cartes recettes issues de 20 pays pour un voyage culinaire garanti.', prix: 34.90, unitesDispo: 45, image: '/images/product3.jpg', categorie: 'Monde' }
    ]);
    console.log('✅ Produits insérés');
  }
};

// Seed vendeur
const seedVendor = async () => {
  const Vendor = require('./models/Vendor');
  const exists = await Vendor.findOne();
  if (!exists) {
    const nom = process.env.VENDOR_USER || 'admin';
    const pwd = process.env.VENDOR_PASS || 'changeme';
    await Vendor.create({
      nomComplet: nom,
      motDePasse: crypto.createHash('sha256').update(pwd).digest('hex')
    });
    console.log('✅ Vendeur créé');
  }
};

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('✅ MongoDB connecté');
    await seedProducts();
    await seedVendor();
    app.listen(PORT, () => {
      console.log(`🚀 Serveur lancé sur http://localhost:${PORT}`);
      console.log(`   🛒 Boutique  → http://localhost:${PORT}/client`);
      console.log(`   🏪 Vendeur   → http://localhost:${PORT}/vendor`);
    });
  })
  .catch(err => { console.error('❌ MongoDB :', err.message); process.exit(1); });
