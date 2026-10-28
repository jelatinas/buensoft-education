import React, { useState, useEffect, useRef } from 'react';
import { User } from '../types';
import { updateUserEmail } from '../storage2';

interface EmailVerificationModalProps {
  user: User;
  onVerified: (email: string) => void;
  onLogout: () => void;
}

const GOOGLE_CLIENT_ID = "824392318898-gufjs4r3bcm3obb2nvieg99sgcn83kti.apps.googleusercontent.com";

export const EmailVerificationModal: React.FC<EmailVerificationModalProps> = ({ 
  user, 
  onVerified,
  onLogout 
}) => {
  const [activeTab, setActiveTab] = useState<'google' | 'resend'>('google');
  
  // Estados para opción Resend (Código PIN)
  const [emailInput, setEmailInput] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [sentCode, setSentCode] = useState<string | null>(null);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [codeExpiresAt, setCodeExpiresAt] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'info' | 'success' | 'error' } | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  const googleBtnRef = useRef<HTMLDivElement>(null);

  // Inicializar Google Sign-In
  useEffect(() => {
    const handleGoogleResponse = async (response: any) => {
      try {
        if (!response.credential) {
          throw new Error("No se recibió credencial de Google.");
        }

        // Decodificar JWT de Google
        const base64Url = response.credential.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map((c) => {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));

        const payload = JSON.parse(jsonPayload);
        const googleEmail = payload.email?.toLowerCase().trim();

        if (!googleEmail) {
          throw new Error("Google no devolvió un correo válido.");
        }

        setStatusMessage({ text: `Vinculando con ${googleEmail}...`, type: 'info' });

        // Guardar correo en Supabase asociado al usuario existente
        await updateUserEmail(user.username, googleEmail);

        // Guardar sesión compartida en cookie .buensoft.com para unificar el ecosistema
        const ssoData = {
          email: googleEmail,
          name: payload.name || user.username,
          sub: payload.sub,
          picture: payload.picture,
          linked_username: user.username
        };
        const expires = new Date();
        expires.setDate(expires.getDate() + 30);
        document.cookie = `buensoft_user=${encodeURIComponent(JSON.stringify(ssoData))}; domain=.buensoft.com; path=/; expires=${expires.toUTCString()}; SameSite=Lax; Secure`;

        setStatusMessage({ text: `¡Cuenta vinculada exitosamente con ${googleEmail}!`, type: 'success' });
        setTimeout(() => {
          onVerified(googleEmail);
        }, 1200);

      } catch (err: any) {
        console.error("Error al procesar Google Sign-In:", err);
        setStatusMessage({ text: err?.message || "Error al vincular con Google.", type: 'error' });
      }
    };

    const initGoogle = () => {
      if ((window as any).google?.accounts?.id) {
        (window as any).google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleGoogleResponse
        });

        if (googleBtnRef.current) {
          googleBtnRef.current.innerHTML = '';
          (window as any).google.accounts.id.renderButton(
            googleBtnRef.current,
            { 
              theme: 'filled_blue', 
              size: 'large', 
              shape: 'pill',
              text: 'continue_with',
              width: 280
            }
          );
        }
      }
    };

    const timer = setTimeout(initGoogle, 300);
    return () => clearTimeout(timer);
  }, [user.username, onVerified, activeTab]);

  // Temporizador para reenvío
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown(prev => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

  // Generar y enviar código PIN con Resend
  const handleSendCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanEmail = emailInput.trim().toLowerCase();
    
    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      setStatusMessage({ text: 'Por favor ingresa un correo electrónico válido.', type: 'error' });
      return;
    }

    setIsSendingCode(true);
    setStatusMessage(null);

    // Generar código de 6 dígitos aleatorio
    const generated = Math.floor(100000 + Math.random() * 900000).toString();

    try {
      const response = await fetch('/api/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          username: user.username,
          code: generated
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al enviar el código.');
      }

      setSentCode(generated);
      setCodeExpiresAt(Date.now() + 15 * 60 * 1000); // 15 minutos
      setResendCooldown(60); // 60 segundos para reenviar

      if (data.simulated && data.devCode) {
        setStatusMessage({ 
          text: `🔔 Aviso: ${data.message}`, 
          type: 'info' 
        });
      } else {
        setStatusMessage({ 
          text: `✅ Código enviado a ${cleanEmail}. Revisa tu bandeja de entrada o spam.`, 
          type: 'success' 
        });
      }
    } catch (err: any) {
      console.error(err);
      setStatusMessage({ text: err.message || 'Error al conectar con el servidor de correo.', type: 'error' });
    } finally {
      setIsSendingCode(false);
    }
  };

  // Verificar código PIN ingresado por el usuario
  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sentCode) {
      setStatusMessage({ text: 'Primero solicita un código de verificación.', type: 'error' });
      return;
    }

    if (codeExpiresAt && Date.now() > codeExpiresAt) {
      setStatusMessage({ text: 'El código ha expirado. Por favor solicita uno nuevo.', type: 'error' });
      return;
    }

    const cleanInput = codeInput.trim();
    if (cleanInput !== sentCode) {
      setStatusMessage({ text: 'El código ingresado es incorrecto. Verifica e intenta de nuevo.', type: 'error' });
      return;
    }

    setIsVerifyingCode(true);
    setStatusMessage(null);

    try {
      const cleanEmail = emailInput.trim().toLowerCase();
      await updateUserEmail(user.username, cleanEmail);

      setStatusMessage({ text: '¡Correo verificado exitosamente!', type: 'success' });
      setTimeout(() => {
        onVerified(cleanEmail);
      }, 1000);
    } catch (err: any) {
      console.error(err);
      setStatusMessage({ text: err.message || 'Error al guardar el correo en la base de datos.', type: 'error' });
    } finally {
      setIsVerifyingCode(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-indigo-950/90 backdrop-blur-md z-[999] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-indigo-900 w-full max-w-lg rounded-[3rem] p-8 md:p-10 shadow-2xl border-8 border-indigo-100 dark:border-indigo-800 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Cabecera */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/40 rounded-3xl flex items-center justify-center mx-auto mb-3 shadow-inner">
            <span className="text-3xl">📧</span>
          </div>
          <h2 className="text-2xl md:text-3xl font-black text-indigo-950 dark:text-white uppercase tracking-tight">
            Valida tu Correo
          </h2>
          <p className="text-xs md:text-sm font-bold text-indigo-500 dark:text-indigo-300 mt-2">
            Hola <span className="text-indigo-700 dark:text-indigo-100 uppercase">{user.username}</span>, para proteger tu cuenta y avances escolares es obligatorio asociar un correo electrónico válido.
          </p>
        </div>

        {/* Pestañas de Métodos */}
        <div className="flex bg-indigo-50 dark:bg-indigo-950 p-1.5 rounded-2xl mb-6 border-2 border-indigo-100 dark:border-indigo-800">
          <button
            type="button"
            onClick={() => { setActiveTab('google'); setStatusMessage(null); }}
            className={`flex-1 py-3 rounded-xl text-xs font-black uppercase transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'google'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-indigo-400 dark:text-indigo-300 hover:text-indigo-700'
            }`}
          >
            <span>Google / Gmail 🌐</span>
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab('resend'); setStatusMessage(null); }}
            className={`flex-1 py-3 rounded-xl text-xs font-black uppercase transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'resend'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-indigo-400 dark:text-indigo-300 hover:text-indigo-700'
            }`}
          >
            <span>Código PIN (Resend) ✉️</span>
          </button>
        </div>

        {/* MENSAJES DE ESTADO */}
        {statusMessage && (
          <div className={`p-4 rounded-2xl mb-5 text-xs font-black text-center border-2 ${
            statusMessage.type === 'success'
              ? 'bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 border-green-200'
              : statusMessage.type === 'error'
              ? 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200'
              : 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200'
          }`}>
            {statusMessage.text}
          </div>
        )}

        {/* CONTENIDO SEGÚN LA PESTAÑA */}
        {activeTab === 'google' ? (
          <div className="text-center space-y-5 py-2">
            <div className="bg-indigo-50/70 dark:bg-indigo-950/50 p-5 rounded-3xl border border-indigo-100 dark:border-indigo-800">
              <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-200 leading-relaxed mb-4">
                Haz clic en el botón para vincular tu cuenta actual con tu correo de Google de forma automática, segura y sin escribir códigos:
              </p>
              
              <div className="flex justify-center my-2">
                <div ref={googleBtnRef} className="min-h-[44px]"></div>
              </div>

              <p className="text-[10px] text-indigo-400 dark:text-indigo-400 font-bold uppercase tracking-wider mt-3">
                🔒 Conservarás todas tus clases, notas y balance intactos.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-indigo-50/50 dark:bg-indigo-950/50 p-4 rounded-2xl border border-indigo-100 dark:border-indigo-800">
              <p className="text-xs font-bold text-indigo-600 dark:text-indigo-300 mb-2">
                Ingresa cualquier correo (Hotmail, Outlook, Yahoo o personalizado) para recibir un código de 6 dígitos:
              </p>

              <div className="flex gap-2">
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="tu@correo.com"
                  disabled={isSendingCode || !!sentCode}
                  className="flex-1 px-4 py-3 bg-white dark:bg-indigo-900 border-2 border-indigo-100 dark:border-indigo-800 rounded-xl text-xs font-bold text-indigo-900 dark:text-white outline-none focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={handleSendCode}
                  disabled={isSendingCode || resendCooldown > 0}
                  className={`px-4 py-3 rounded-xl font-black text-xs uppercase shadow-md transition-all ${
                    isSendingCode || resendCooldown > 0
                      ? 'bg-indigo-300 text-white cursor-not-allowed'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                  }`}
                >
                  {isSendingCode 
                    ? 'Enviando...' 
                    : resendCooldown > 0 
                    ? `${resendCooldown}s` 
                    : sentCode ? 'Reenviar' : 'Enviar PIN'}
                </button>
              </div>
            </div>

            {sentCode && (
              <form onSubmit={handleVerifyCode} className="space-y-3 animate-in fade-in">
                <label className="block text-[11px] font-black uppercase text-indigo-400 tracking-wider">
                  Ingresa el código de 6 dígitos:
                </label>
                <input
                  type="text"
                  maxLength={6}
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  className="w-full text-center tracking-[8px] text-2xl font-black px-4 py-3 bg-white dark:bg-indigo-900 border-4 border-indigo-200 dark:border-indigo-800 rounded-2xl text-indigo-900 dark:text-white outline-none focus:border-indigo-500"
                  required
                />
                <button
                  type="submit"
                  disabled={isVerifyingCode || codeInput.length < 6}
                  className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg transition-all ${
                    isVerifyingCode || codeInput.length < 6
                      ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                      : 'bg-green-600 hover:bg-green-700 text-white'
                  }`}
                >
                  {isVerifyingCode ? 'Verificando...' : 'Verificar y Desbloquear Aula ✅'}
                </button>
              </form>
            )}
          </div>
        )}

        {/* Opción de Salir / Cerrar Sesión */}
        <div className="mt-8 pt-4 border-t-2 border-indigo-50 dark:border-indigo-800/80 text-center">
          <button
            type="button"
            onClick={onLogout}
            className="text-xs font-black uppercase text-indigo-400 dark:text-indigo-500 hover:text-red-500 transition-colors"
          >
            ← Cerrar sesión o cambiar de cuenta
          </button>
        </div>

      </div>
    </div>
  );
};

export default EmailVerificationModal;
