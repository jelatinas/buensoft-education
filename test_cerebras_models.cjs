const key = "csk-rnjpxfrnk896ne2tfxd5hkee4pdvn5ny8njnmpf39mfdh4fp";
fetch('https://api.cerebras.ai/v1/models', {
  headers: { 'Authorization': 'Bearer ' + key }
}).then(r=>r.json()).then(data => console.log('MODELS:', JSON.stringify(data))).catch(console.error);
