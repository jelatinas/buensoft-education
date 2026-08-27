import fs from 'fs';
import dotenv from 'dotenv';
const envConfig = dotenv.parse(fs.readFileSync('.env'));
const key = envConfig.VITE_CEREBRAS_API_KEY;

fetch('https://api.cerebras.ai/v1/models', {
  headers: { 'Authorization': 'Bearer ' + key }
}).then(r=>r.json()).then(data => {
  console.log("Cerebras Models:", data);
}).catch(console.error);
