const express = require('express');
const os = require('os');
const path = require('path');
const apiApp = require('./server');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

app.use('/api', apiApp);
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

function getLocalNetworkUrls() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((network) => network && network.family === 'IPv4' && !network.internal)
    .map((network) => `http://${network.address}:${PORT}`);
}

app.listen(PORT, HOST, () => {
  console.log(`Datacom Inventory System running at http://localhost:${PORT}`);
  getLocalNetworkUrls().forEach((url) => {
    console.log(`Office network access: ${url}`);
  });
  console.log('Other users should open http://SERVER_IP:3000 from their browser or desktop shortcut.');
});
async function loadInventoryView() {
  try {
    const response = await fetch(`${API_URL}/api/inventory`);
    const inventory = await response.json();

    console.log('Inventory:', inventory);

  } catch (error) {
    console.error('Failed to load inventory:', error);
  }
}

loadInventoryView();