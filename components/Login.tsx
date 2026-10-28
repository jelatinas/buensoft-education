import React, { useState, useEffect, useRef } from 'react';
import { User } from '../types';
import { 
  authenticateUser, 
  registerStudent, 
  loginOrRegisterWithGoogle, 
  findUserByEmail, 
  resetUserPassword 
} from '../storage2';
import pkg from '../package.json';

interface LoginProps {
  onLogin: (user: User) => void;
}

const GOOGLE_CLIENT_ID = "824392318898-gufjs4r3bcm3obb2nvieg99sgcn83kti.apps.googleusercontent.com";

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  // Modos de visualización: 'login' | 'register' | 'forgot'
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'forgot'>('login');
  
  // Pasos para registro y recuperación
  const [registerStep, setRegisterStep] = useState<'form' | 'verify_pin'>('form');
  const [forgotStep, setForgotStep] = useState<'email' | 'code'>('email');

  // Campos de formulario Login
  const [loginIdentifier, setLoginIdentifier] = useState(''); // Puede ser usuario o correo
  const [loginPassword, setLoginPassword] = useState('');

  // Campos de formulario Registro
  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');

  // Campos de Recuperación
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotUsername, setForgotUsername] = useState('');
  const [forgotCode, setForgotCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  // Verificación PIN Resend
  const [pinCode, setPinCode] = useState('');
  const [sentPin, setSentPin] = useState<string | null>(null);
  const [pinExpiresAt, setPinExpiresAt] = useState<number | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Estados de feedback y carga
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const googleBtnRef = useRef<HTMLDivElement>(null);

  const clearMessages = () => {
    setError('');
    setInfoMessage('');
  };

  // Inicializar Google Sign-In
  useEffect(() => {
    if (authMode === 'forgot' || registerStep === 'verify_pin') return;

    const handleGoogleResponse = async (response: any) => {
      setIsLoading(true);
      clearMessages();
      try {
        if (!response.credential) {
          throw new Error("No se recibió credencial de Google.");
        }

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

        const authenticatedUser = await loginOrRegisterWithGoogle(googleEmail, payload.name, payload.sub);

        // Guardar sesión SSO en cookie .buensoft.com
        const ssoData = {
          email: googleEmail,
          name: payload.name || authenticatedUser.username,
          sub: payload.sub,
          picture: payload.picture,
          linked_username: authenticatedUser.username
        };
        const expires = new Date();
        expires.setDate(expires.getDate() + 30);
        document.cookie = `buensoft_user=${encodeURIComponent(JSON.stringify(ssoData))}; domain=.buensoft.com; path=/; expires=${expires.toUTCString()}; SameSite=Lax; Secure`;

        onLogin(authenticatedUser);
      } catch (err: any) {
        console.error("Error en Google Sign-In:", err);
        setError(err?.message || "Error al autenticar con Google. Intenta de nuevo.");
      } finally {
        setIsLoading(false);
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
              theme: 'outline', 
              size: 'large', 
              shape: 'rectangular',
              text: authMode === 'register' ? 'signup_with' : 'signin_with',
              width: 320,
              logo_alignment: 'left'
            }
          );
        }
      }
    };

    const timer = setTimeout(initGoogle, 200);
    return () => clearTimeout(timer);
  }, [authMode, registerStep, onLogin]);

  // Temporizador de reenvío de código Resend
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown(prev => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

  // -------------------------------------------------------------------------
  // INICIO DE SESIÓN CON CORREO O USUARIO
  // -------------------------------------------------------------------------
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    setIsLoading(true);

    try {
      const authenticatedUser = await authenticateUser(loginIdentifier, loginPassword);
      if (authenticatedUser) {
        onLogin(authenticatedUser);
      } else {
        setError('El correo/usuario o la contraseña son incorrectos.');
      }
    } catch (err: any) {
      setError(err?.message || 'Error al conectar con la base de datos.');
    } finally {
      setIsLoading(false);
    }
  };

  // -------------------------------------------------------------------------
  // REGISTRO: ENVÍO DE CÓDIGO RESEND
  // -------------------------------------------------------------------------
  const handleSendRegisterPin = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();

    if (regUsername.trim().length < 3) {
      setError('El nombre de usuario debe tener al menos 3 caracteres.');
      return;
    }

    if (!regEmail.trim() || !regEmail.includes('@') || !regEmail.includes('.')) {
      setError('Ingresa un correo electrónico válido.');
      return;
    }

    if (regPassword.length < 4) {
      setError('La contraseña debe tener al menos 4 caracteres.');
      return;
    }

    if (regPassword !== regConfirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setIsLoading(true);
    const generated = Math.floor(100000 + Math.random() * 900000).toString();

    try {
      const response = await fetch('/api/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: regEmail.trim().toLowerCase(),
          username: regUsername.trim(),
          code: generated,
          type: 'verification'
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Error al enviar código de verificación.');

      setSentPin(generated);
      setPinExpiresAt(Date.now() + 15 * 60 * 1000);
      setResendCooldown(60);
      setRegisterStep('verify_pin');

      if (data.simulated && data.devCode) {
        setPinCode(data.devCode);
        setInfoMessage(`🔔 Código para pruebas: ${data.devCode}`);
      } else {
        setInfoMessage(`✅ Código enviado a ${regEmail.trim()}. Revisa tu buzón.`);
      }
    } catch (err: any) {
      setError(err?.message || 'Error al conectar con el servidor de correo.');
    } finally {
      setIsLoading(false);
    }
  };

  // REGISTRO: CONFIRMAR CÓDIGO
  const handleConfirmRegisterPin = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();

    if (!sentPin) {
      setError('Primero solicita un código de verificación.');
      return;
    }

    if (pinExpiresAt && Date.now() > pinExpiresAt) {
      setError('El código ha expirado. Por favor solicita uno nuevo.');
      return;
    }

    if (pinCode.trim() !== sentPin) {
      setError('El código ingresado es incorrecto.');
      return;
    }

    setIsLoading(true);
    try {
      const registeredUser = await registerStudent(regUsername, regPassword, regEmail);
      if (registeredUser) {
        onLogin(registeredUser);
      }
    } catch (err: any) {
      setError(err?.message || 'Error al registrar usuario en la base de datos.');
    } finally {
      setIsLoading(false);
    }
  };

  // -------------------------------------------------------------------------
  // RECUPERACIÓN: BUSCAR USUARIO Y ENVIAR CÓDIGO
  // -------------------------------------------------------------------------
  const handleSendRecoveryCode = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();

    const cleanEmail = forgotEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      setError('Ingresa un correo electrónico válido.');
      return;
    }

    setIsLoading(true);
    try {
      const foundUser = await findUserByEmail(cleanEmail);
      if (!foundUser) {
        setError('No encontramos ninguna cuenta registrada con este correo.');
        return;
      }

      setForgotUsername(foundUser.username);
      const generated = Math.floor(100000 + Math.random() * 900000).toString();

      const response = await fetch('/api/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          username: foundUser.username,
          code: generated,
          type: 'recovery'
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Error al enviar código provisional.');

      setSentPin(generated);
      setPinExpiresAt(Date.now() + 15 * 60 * 1000);
      setResendCooldown(60);
      setForgotStep('code');

      if (data.simulated && data.devCode) {
        setForgotCode(data.devCode);
        setInfoMessage(`🔔 Código provisional para pruebas: ${data.devCode}`);
      } else {
        setInfoMessage(`✅ Código provisional enviado a ${cleanEmail}.`);
      }
    } catch (err: any) {
      setError(err?.message || 'Error al procesar la recuperación de cuenta.');
    } finally {
      setIsLoading(false);
    }
  };

  // RECUPERACIÓN: ACTUALIZAR CONTRASEÑA
  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();

    if (!sentPin) {
      setError('Primero debes solicitar un código.');
      return;
    }

    if (pinExpiresAt && Date.now() > pinExpiresAt) {
      setError('El código ha expirado. Solicita uno nuevo.');
      return;
    }

    if (forgotCode.trim() !== sentPin) {
      setError('El código ingresado es incorrecto.');
      return;
    }

    if (!newPassword || newPassword.length < 4) {
      setError('La nueva contraseña debe tener al menos 4 caracteres.');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setIsLoading(true);
    try {
      await resetUserPassword(forgotUsername, newPassword);
      const authenticatedUser = await authenticateUser(forgotUsername, newPassword);
      if (authenticatedUser) {
        onLogin(authenticatedUser);
      } else {
        setAuthMode('login');
        setLoginIdentifier(forgotUsername);
        setLoginPassword('');
        setInfoMessage('¡Contraseña restablecida! Ya puedes iniciar sesión.');
      }
    } catch (err: any) {
      setError(err?.message || 'Error al guardar la nueva contraseña.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-slate-50 dark:bg-slate-950 p-4 transition-colors">
      <div className="w-full max-w-[420px] bg-white dark:bg-slate-900 rounded-3xl shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-200/80 dark:border-slate-800 p-8 md:p-10">
        
        {/* ENCABEZADO PROFESIONAL */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 p-2 bg-indigo-50 dark:bg-indigo-950/60 rounded-2xl flex items-center justify-center border border-indigo-100 dark:border-indigo-900/50">
            <img src="/icon.png" alt="Buensoft Education" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            {authMode === 'login' && 'Iniciar Sesión'}
            {authMode === 'register' && (registerStep === 'verify_pin' ? 'Confirmar Código' : 'Crear Cuenta')}
            {authMode === 'forgot' && 'Recuperar Cuenta'}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5">
            {authMode === 'login' && 'Accede a tu aula en Buensoft Education'}
            {authMode === 'register' && (registerStep === 'verify_pin' ? 'Ingresa el PIN enviado a tu correo' : 'Comienza con 3 clases demo gratis')}
            {authMode === 'forgot' && 'Restablece tu acceso fácilmente'}
          </p>
        </div>

        {/* BOTÓN GOOGLE SIGN-IN */}
        {(authMode === 'login' || (authMode === 'register' && registerStep === 'form')) && (
          <div className="mb-6">
            <div className="flex justify-center">
              <div ref={googleBtnRef} className="min-h-[44px] flex justify-center w-full"></div>
            </div>

            {/* Divisor "o con tu correo" */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200 dark:border-slate-800" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-white dark:bg-slate-900 px-3 text-slate-400 dark:text-slate-500 font-medium">
                  o con tu cuenta
                </span>
              </div>
            </div>
          </div>
        )}

        {/* AVISOS DE ERROR O ÉXITO */}
        {error && (
          <div className="mb-5 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 text-xs font-semibold text-center animate-in fade-in">
            {error}
          </div>
        )}

        {infoMessage && (
          <div className="mb-5 p-3.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900 text-indigo-700 dark:text-indigo-300 text-xs font-medium text-center animate-in fade-in">
            {infoMessage}
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* VISTA 1: INICIAR SESIÓN */}
        {/* ------------------------------------------------------------- */}
        {authMode === 'login' && (
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Correo o Usuario
              </label>
              <input
                type="text"
                value={loginIdentifier}
                onChange={(e) => setLoginIdentifier(e.target.value)}
                placeholder="tu@correo.com o tu usuario"
                required
                disabled={isLoading}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 outline-none transition-all placeholder:text-slate-400"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Contraseña
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('forgot');
                    setForgotStep('email');
                    clearMessages();
                  }}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 hover:underline font-medium transition-colors"
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="••••••••"
                required
                disabled={isLoading}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 outline-none transition-all placeholder:text-slate-400"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-4 rounded-xl shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 text-sm flex items-center justify-center space-x-2 disabled:opacity-60"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Iniciando sesión...</span>
                </>
              ) : (
                <span>Iniciar Sesión</span>
              )}
            </button>

            <div className="mt-6 text-center text-xs text-slate-500 dark:text-slate-400 pt-2">
              ¿No tienes una cuenta?{' '}
              <button
                type="button"
                onClick={() => {
                  setAuthMode('register');
                  setRegisterStep('form');
                  clearMessages();
                }}
                className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold"
              >
                Regístrate gratis
              </button>
            </div>
          </form>
        )}

        {/* ------------------------------------------------------------- */}
        {/* VISTA 2: REGISTRO PASO 1 (FORMULARIO) */}
        {/* ------------------------------------------------------------- */}
        {authMode === 'register' && registerStep === 'form' && (
          <form onSubmit={handleSendRegisterPin} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Nombre de Usuario
              </label>
              <input
                type="text"
                value={regUsername}
                onChange={(e) => setRegUsername(e.target.value)}
                placeholder="Elige tu nombre de usuario"
                required
                disabled={isLoading}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 outline-none transition-all placeholder:text-slate-400"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Correo Electrónico
              </label>
              <input
                type="email"
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                placeholder="tu@correo.com"
                required
                disabled={isLoading}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 outline-none transition-all placeholder:text-slate-400"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Contraseña
                </label>
                <input
                  type="password"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  disabled={isLoading}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 outline-none transition-all placeholder:text-slate-400"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Confirmar
                </label>
                <input
                  type="password"
                  value={regConfirmPassword}
                  onChange={(e) => setRegConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  disabled={isLoading}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 outline-none transition-all placeholder:text-slate-400"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-4 rounded-xl shadow-sm transition-all text-sm flex items-center justify-center space-x-2 disabled:opacity-60"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Enviando código...</span>
                </>
              ) : (
                <span>Continuar con mi correo</span>
              )}
            </button>

            <div className="mt-5 text-center text-xs text-slate-500 dark:text-slate-400">
              ¿Ya tienes una cuenta?{' '}
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  clearMessages();
                }}
                className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold"
              >
                Inicia sesión
              </button>
            </div>
          </form>
        )}

        {/* ------------------------------------------------------------- */}
        {/* VISTA 2.1: REGISTRO PASO 2 (CONFIRMAR PIN) */}
        {/* ------------------------------------------------------------- */}
        {authMode === 'register' && registerStep === 'verify_pin' && (
          <form onSubmit={handleConfirmRegisterPin} className="space-y-4">
            <div className="text-center p-3.5 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
              Código enviado a <strong className="text-slate-900 dark:text-white">{regEmail}</strong>
            </div>

            <div>
              <input
                type="text"
                maxLength={6}
                value={pinCode}
                onChange={(e) => setPinCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                autoFocus
                required
                className="w-full tracking-[8px] text-center text-2xl font-bold py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:border-indigo-600 outline-none transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || pinCode.length < 6}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 px-4 rounded-xl shadow-sm transition-all text-sm disabled:opacity-50"
            >
              {isLoading ? 'Verificando...' : 'Crear Cuenta'}
            </button>

            <div className="flex justify-between items-center text-xs pt-1">
              <button
                type="button"
                onClick={() => {
                  setRegisterStep('form');
                  clearMessages();
                }}
                className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              >
                ← Corregir datos
              </button>
              <button
                type="button"
                onClick={handleSendRegisterPin}
                disabled={resendCooldown > 0 || isLoading}
                className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium disabled:opacity-50"
              >
                {resendCooldown > 0 ? `Reenviar en ${resendCooldown}s` : 'Reenviar código'}
              </button>
            </div>
          </form>
        )}

        {/* ------------------------------------------------------------- */}
        {/* VISTA 3: RECUPERACIÓN DE CONTRASEÑA O USUARIO */}
        {/* ------------------------------------------------------------- */}
        {authMode === 'forgot' && forgotStep === 'email' && (
          <form onSubmit={handleSendRecoveryCode} className="space-y-4">
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Ingresa el correo electrónico asociado a tu cuenta. Te enviaremos un código provisional para restablecer tu contraseña y recordarte tu usuario.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Correo Electrónico
              </label>
              <input
                type="email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder="tu@correo.com"
                required
                disabled={isLoading}
                autoFocus
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 outline-none transition-all placeholder:text-slate-400"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-4 rounded-xl shadow-sm transition-all text-sm flex items-center justify-center space-x-2 disabled:opacity-60"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Buscando cuenta...</span>
                </>
              ) : (
                <span>Enviar Código</span>
              )}
            </button>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  clearMessages();
                }}
                className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 font-medium"
              >
                ← Volver a Iniciar Sesión
              </button>
            </div>
          </form>
        )}

        {/* ------------------------------------------------------------- */}
        {/* VISTA 3.1: RECUPERACIÓN PASO 2 (CÓDIGO + NUEVA CONTRASEÑA) */}
        {/* ------------------------------------------------------------- */}
        {authMode === 'forgot' && forgotStep === 'code' && (
          <form onSubmit={handleResetPasswordSubmit} className="space-y-3.5">
            {/* Recordatorio amigable del nombre de usuario */}
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-800 text-center">
              <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 uppercase tracking-wider block">
                Tu usuario registrado es
              </span>
              <span className="text-base font-bold text-emerald-950 dark:text-white">
                @{forgotUsername}
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Código Provisional (6 dígitos)
              </label>
              <input
                type="text"
                maxLength={6}
                value={forgotCode}
                onChange={(e) => setForgotCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                autoFocus
                required
                className="w-full tracking-[8px] text-center text-xl font-bold py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:border-indigo-600 outline-none transition-all"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nueva Contraseña
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  disabled={isLoading}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm focus:border-indigo-600 outline-none transition-all placeholder:text-slate-400"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Confirmar
                </label>
                <input
                  type="password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  disabled={isLoading}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm focus:border-indigo-600 outline-none transition-all placeholder:text-slate-400"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || forgotCode.length < 6}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 px-4 rounded-xl shadow-sm transition-all text-sm disabled:opacity-50"
            >
              {isLoading ? 'Actualizando...' : 'Guardar y Entrar'}
            </button>

            <div className="flex justify-between items-center text-xs pt-1">
              <button
                type="button"
                onClick={() => {
                  setForgotStep('email');
                  clearMessages();
                }}
                className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              >
                ← Cambiar correo
              </button>
              <button
                type="button"
                onClick={handleSendRecoveryCode}
                disabled={resendCooldown > 0 || isLoading}
                className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium disabled:opacity-50"
              >
                {resendCooldown > 0 ? `Reenviar en ${resendCooldown}s` : 'Reenviar código'}
              </button>
            </div>
          </form>
        )}

      </div>

      {/* PIE DE PÁGINA DISCRETO CON LA VERSIÓN (No ocupa espacio en la ventana) */}
      <div className="mt-8 text-center text-xs text-slate-400 dark:text-slate-500">
        Buensoft Education v{pkg.version} • La educación del futuro hoy
      </div>
    </div>
  );
};

export default Login;
