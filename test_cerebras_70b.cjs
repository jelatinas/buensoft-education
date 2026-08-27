const key = "csk-rnjpxfrnk896ne2tfxd5hkee4pdvn5ny8njnmpf39mfdh4fp";
fetch('https://api.cerebras.ai/v1/chat/completions', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
  body: JSON.stringify({
     model: 'llama3.3-70b',
     messages: [{role: 'user', content: 'hello'}]
  })
}).then(r=>r.json()).then(data => console.log('llama3.3-70b:', data)).catch(console.error);
