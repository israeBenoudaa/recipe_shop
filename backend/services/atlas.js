const https = require('https');

const BASE_HOST = 'api.atlaslivraison.com';
const KEY = () => process.env.ATLAS_API_KEY;

let _cities = null;

function apiRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: BASE_HOST,
      path,
      method,
      headers: {
        'x-api-key': KEY(),
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Invalid JSON response')); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function getCities() {
  if (_cities) return _cities;
  const res = await apiRequest('GET', '/api/external/cities');
  if (res.success) _cities = res.data;
  return _cities || [];
}

async function findCityId(cityName) {
  if (!cityName) return null;
  const cities = await getCities();
  const q = cityName.toLowerCase().trim();
  const match = cities.find(c =>
    c.name.toLowerCase().includes(q) || q.includes(c.name.toLowerCase())
  );
  return match?.id || null;
}

async function createColis(order) {
  if (!KEY()) throw new Error('ATLAS_API_KEY manquante');
  const client = order.client;
  const cityId = await findCityId(client.ville);
  if (!cityId) throw new Error(`Ville Atlas introuvable: "${client.ville}"`);

  const product = (order.articles || []).map(a => a.nomProduit).join(', ');

  const res = await apiRequest('POST', '/api/external/colis', {
    fullname: `${client.prenom} ${client.nom}`,
    phone: client.telephone,
    address: client.adresse,
    cityId,
    price: order.prixTotal,
    product,
    quantity: order.nombreArticles,
    importRef: order._id.toString()
  });

  if (!res.success) throw new Error(res.message || 'Erreur Atlas');
  return res.data; // { code: 'ATL...', cfees, ... }
}

module.exports = { createColis };
