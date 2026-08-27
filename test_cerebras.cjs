const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8');
const key = env.split('\n').find(l => l.startsWith('VITE_CEREBRAS_API_KEY=')).split('=')[1].trim();

fetch('https://api.cerebras.ai/v1/models', {
  headers: { 'Authorization': 'Bearer ' + key }
}).then(r=>r.json()).then(data => {
  console.log("Cerebras Models:", data);
}).catch(console.error);
