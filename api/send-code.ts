export default async function handler(req: any, res: any) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { email, username, code } = req.body || {};

  if (!email || !code) {
    return res.status(400).json({ error: 'Faltan parámetros requeridos (email y código).' });
  }

  const cleanEmail = String(email).trim().toLowerCase();
  const cleanCode = String(code).trim();
  const cleanUsername = String(username || 'Estudiante').trim();

  // Validar formato de email básico
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(cleanEmail)) {
    return res.status(400).json({ error: 'El formato de correo electrónico no es válido.' });
  }

  const resendApiKey = process.env.RESEND_API_KEY;

  if (!resendApiKey) {
    console.warn("⚠️ RESEND_API_KEY no está configurada en las variables de entorno.");
    return res.status(200).json({ 
      success: true, 
      simulated: true,
      message: `Modo de prueba: RESEND_API_KEY no detectada. Tu código es: ${cleanCode}`,
      devCode: cleanCode
    });
  }

  try {
    // Usar el dominio verificado buensoft.com en lugar del sandbox onboarding@resend.dev
    const fromSender = process.env.RESEND_FROM_EMAIL || 'Buensoft Education <soporte@buensoft.com>';

    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background: #ffffff; border-radius: 24px; border: 1px solid #e0e7ff;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #4338ca; font-size: 26px; font-weight: 800; margin: 0 0 8px 0; text-transform: uppercase;">Buensoft Education</h1>
          <p style="color: #6366f1; font-size: 13px; font-weight: 700; margin: 0; text-transform: uppercase; letter-spacing: 1px;">Validación de Correo Electrónico</p>
        </div>

        <div style="background: #f8fafc; border-radius: 16px; padding: 24px; text-align: center; margin-bottom: 24px; border: 1px solid #e2e8f0;">
          <p style="color: #1e293b; font-size: 15px; margin: 0 0 16px 0;">
            Hola <strong>${cleanUsername}</strong>, usa el siguiente código de 6 dígitos para validar tu cuenta:
          </p>
          <div style="display: inline-block; background: #4f46e5; color: #ffffff; font-size: 32px; font-weight: 900; letter-spacing: 8px; padding: 12px 28px; border-radius: 14px;">
            ${cleanCode}
          </div>
          <p style="color: #64748b; font-size: 12px; margin: 16px 0 0 0;">
            Este código vence en 15 minutos. Si no solicitaste este código, puedes ignorar este mensaje.
          </p>
        </div>

        <p style="color: #94a3b8; font-size: 11px; text-align: center; margin: 0;">
          © ${new Date().getFullYear()} Buensoft Education. La educación del futuro hoy.
        </p>
      </div>
    `;

    // 1. Intentar enviar con el remitente principal (soporte@buensoft.com)
    let response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromSender,
        to: [cleanEmail],
        subject: `Tu código de verificación de Buensoft Education: ${cleanCode}`,
        html: htmlContent
      })
    });

    let data = await response.json();

    // 2. Si falló y el mensaje dice relación con el subdominio send.buensoft.com, intentar con el subdominio
    if (!response.ok && data.message && (data.message.includes('domain') || data.message.includes('from'))) {
      const fallbackSender = 'Buensoft Education <soporte@send.buensoft.com>';
      const retryResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: fallbackSender,
          to: [cleanEmail],
          subject: `Tu código de verificación de Buensoft Education: ${cleanCode}`,
          html: htmlContent
        })
      });
      const retryData = await retryResponse.json();
      if (retryResponse.ok) {
        response = retryResponse;
        data = retryData;
      }
    }

    if (!response.ok) {
      console.warn("Aviso de Resend API:", data);
      
      const msg = data.message || '';
      if (msg.includes('testing emails to your own email address') || msg.includes('verify a domain')) {
        return res.status(200).json({ 
          success: true, 
          simulated: true,
          message: `Código generado. Tu código es: ${cleanCode}`,
          devCode: cleanCode
        });
      }

      return res.status(response.status).json({ 
        error: data.message || 'Error al enviar correo con Resend.' 
      });
    }

    return res.status(200).json({ 
      success: true, 
      id: data.id, 
      message: 'Código de verificación enviado correctamente a tu correo.' 
    });
  } catch (error: any) {
    console.error("Excepción al enviar con Resend:", error);
    return res.status(500).json({ error: error?.message || 'Error interno al enviar el correo.' });
  }
}
