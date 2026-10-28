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
  // Modos principales: Iniciar Sesión, Registro, o Recuperación de contraseña/usuario
  const [isRegistering, setIsRegistering] = useState(false);
  const [registerStep, setRegisterStep] = useState<'form' | 'verify_pin'>('form');

  // Modo de Recuperación ("Olvidé mi usuario o contraseña")
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [forgotStep, setForgotStep] = useState<'email' | 'code'>('email');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotUsername, setForgotUsername] = useState('');
  const [forgotCode, setForgotCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  // Campos de formulario Login / Registro
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [email, setEmail] = useState('');

  // Verificación PIN Resend (Compartido para registro y recuperación)
  const [pinCode, setPinCode] = useState('');
  const [sentPin, setSentPin] = useState<string | null>(null);
  const [pinExpiresAt, setPinExpiresAt] = useState<number | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Estados de feedback y carga
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const googleBtnRef = useRef<HTMLDivElement>(null);

  const resetAllFeedback = () => {
    setError('');
    setInfoMessage('');
    setSentPin(null);
    setPinCode('');
    setForgotCode('');
    setNewPassword('');
    setConfirmNewPassword('');
  };

  // Inicializar Google Sign-In con Google Identity Services
  useEffect(() => {
    if (isForgotPassword) return;

    const handleGoogleResponse = async (response: any) => {
      setIsLoading(true);
      setError('');
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

        const authenticatedUser = await loginOrRegisterWithGoogle(googleEmail, payload.name, payload.sub);

        // Guardar sesión compartida en cookie .buensoft.com para unificar el ecosistema
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
              theme: 'filled_blue', 
              size: 'large', 
              shape: 'pill',
              text: isRegistering ? 'signup_with' : 'signin_with',
              width: 320,
              logo_alignment: 'left'
            }
          );
        }
      }
    };

    const timer = setTimeout(initGoogle, 200);
    return () => clearTimeout(timer);
  }, [isRegistering, isForgotPassword, onLogin]);

  // Temporizador de reenvío de código Resend
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown(prev => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

  // Enviar PIN de verificación con Resend para Registro
  const handleSendPin = async (e: React.FormEvent) => {
    e.preventDefault();
    resetAllFeedback();

    if (username.trim().length < 3) {
      setError('El nombre de usuario debe tener al menos 3 caracteres.');
      return;
    }

    if (!email.trim() || !email.includes('@') || !email.includes('.')) {
      setError('Ingresa un correo electrónico válido para confirmar tu cuenta.');
      return;
    }

    if (password.length < 4) {
      setError('La contraseña debe tener al menos 4 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
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
          email: email.trim().toLowerCase(),
          username: username.trim(),
          code: generated,
          type: 'verification'
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al enviar código de verificación.');
      }

      setSentPin(generated);
      setPinExpiresAt(Date.now() + 15 * 60 * 1000); // 15 minutos
      setResendCooldown(60);
      setRegisterStep('verify_pin');

      if (data.simulated && data.devCode) {
        setPinCode(data.devCode);
        setInfoMessage(`🔔 Modo pruebas: Tu código es ${data.devCode}`);
      } else {
        setInfoMessage(`✅ Código enviado a ${email.trim()}. Revisa tu buzón de entrada o spam.`);
      }
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Error al conectar con el servidor de correo.');
    } finally {
      setIsLoading(false);
    }
  };

  // Reenviar código PIN de Registro
  const handleResendPin = async () => {
    if (resendCooldown > 0 || !email.trim()) return;
    setIsLoading(true);
    setError('');
    const generated = Math.floor(100000 + Math.random() * 900000).toString();

    try {
      const response = await fetch('/api/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          username: username.trim(),
          code: generated,
          type: 'verification'
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Error al reenviar código.');

      setSentPin(generated);
      setPinExpiresAt(Date.now() + 15 * 60 * 1000);
      setResendCooldown(60);
      setInfoMessage(`✅ Nuevo código enviado a ${email.trim()}.`);
    } catch (err: any) {
      setError(err?.message || 'Error al reenviar el código.');
    } finally {
      setIsLoading(false);
    }
  };

  // Verificar PIN y registrar estudiante en Supabase
  const handleConfirmPinAndRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoMessage('');

    if (!sentPin) {
      setError('Primero debes solicitar un código de verificación.');
      return;
    }

    if (pinExpiresAt && Date.now() > pinExpiresAt) {
      setError('El código ha expirado. Por favor solicita uno nuevo.');
      return;
    }

    if (pinCode.trim() !== sentPin) {
      setError('El código de 6 dígitos es incorrecto.');
      return;
    }

    setIsLoading(true);
    try {
      const registeredUser = await registerStudent(username, password, email);
      if (registeredUser) {
        onLogin(registeredUser);
      }
    } catch (err: any) {
      setError(err?.message || 'Error al registrar usuario en la base de datos.');
    } finally {
      setIsLoading(false);
    }
  };

  // -------------------------------------------------------------
  // RECUPERACIÓN DE USUARIO Y CONTRASEÑA
  // -------------------------------------------------------------

  // Paso 1: Buscar cuenta por correo y enviar código provisional
  const handleSendRecoveryCode = async (e: React.FormEvent) => {
    e.preventDefault();
    resetAllFeedback();

    const cleanEmail = forgotEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      setError('Por favor ingresa un correo electrónico válido.');
      return;
    }

    setIsLoading(true);
    try {
      // 1. Verificar si existe un usuario con este correo
      const foundUser = await findUserByEmail(cleanEmail);
      if (!foundUser) {
        setError('No encontramos ninguna cuenta registrada con este correo electrónico.');
        return;
      }

      setForgotUsername(foundUser.username);

      // 2. Generar código provisional de 6 dígitos
      const generated = Math.floor(100000 + Math.random() * 900000).toString();

      // 3. Enviar código por Resend con plantilla de recuperación
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
      if (!response.ok) {
        throw new Error(data.error || 'Error al enviar código de recuperación.');
      }

      setSentPin(generated);
      setPinExpiresAt(Date.now() + 15 * 60 * 1000);
      setResendCooldown(60);
      setForgotStep('code');

      if (data.simulated && data.devCode) {
        setForgotCode(data.devCode);
        setInfoMessage(`🔔 Modo pruebas: Tu código provisional es ${data.devCode}`);
      } else {
        setInfoMessage(`✅ Hemos enviado un código provisional a ${cleanEmail}. Revisa tu bandeja de entrada o spam.`);
      }
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Error al procesar la solicitud de recuperación.');
    } finally {
      setIsLoading(false);
    }
  };

  // Reenviar código de recuperación
  const handleResendRecoveryCode = async () => {
    if (resendCooldown > 0 || !forgotEmail.trim() || !forgotUsername) return;
    setIsLoading(true);
    setError('');
    const generated = Math.floor(100000 + Math.random() * 900000).toString();

    try {
      const response = await fetch('/api/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: forgotEmail.trim().toLowerCase(),
          username: forgotUsername,
          code: generated,
          type: 'recovery'
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Error al reenviar el código.');

      setSentPin(generated);
      setPinExpiresAt(Date.now() + 15 * 60 * 1000);
      setResendCooldown(60);
      setInfoMessage(`✅ Nuevo código provisional enviado a ${forgotEmail.trim()}.`);
    } catch (err: any) {
      setError(err?.message || 'Error al reenviar el código.');
    } finally {
      setIsLoading(false);
    }
  };

  // Paso 2: Validar código y actualizar contraseña en Supabase
  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoMessage('');

    if (!sentPin) {
      setError('Debes solicitar un código primero.');
      return;
    }

    if (pinExpiresAt && Date.now() > pinExpiresAt) {
      setError('El código provisional ha expirado. Por favor solicita uno nuevo.');
      return;
    }

    if (forgotCode.trim() !== sentPin) {
      setError('El código provisional de 6 dígitos es incorrecto.');
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
      // Guardar la nueva contraseña cifrada en la base de datos
      await resetUserPassword(forgotUsername, newPassword);

      // Autenticar al usuario de inmediato con las nuevas credenciales
      const authenticatedUser = await authenticateUser(forgotUsername, newPassword);
      if (authenticatedUser) {
        onLogin(authenticatedUser);
      } else {
        // Redirigir al inicio de sesión con el usuario ya rellenado
        setIsForgotPassword(false);
        setUsername(forgotUsername);
        setPassword('');
        resetAllFeedback();
        setInfoMessage('¡Contraseña actualizada con éxito! Ya puedes iniciar sesión.');
      }
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Error al actualizar la contraseña en la base de datos.');
    } finally {
      setIsLoading(false);
    }
  };

  // -------------------------------------------------------------
  // INICIO DE SESIÓN TRADICIONAL
  // -------------------------------------------------------------
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setInfoMessage('');

    try {
      const authenticatedUser = await authenticateUser(username, password);
      if (authenticatedUser) {
        onLogin(authenticatedUser);
      } else {
        setError('Credenciales incorrectas. Intenta de nuevo.');
      }
    } catch (err: any) {
      setError(err?.message || 'Error al conectar con la base de datos.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-indigo-100 dark:bg-indigo-950 p-4 transition-colors duration-300">
      <div className="bg-white dark:bg-indigo-900 p-8 md:p-12 rounded-[3rem] shadow-2xl w-full max-w-md border-8 border-indigo-50 dark:border-indigo-800">
        
        {/* Logo y Encabezado */}
        <div className="text-center mb-6">
          <div className="w-24 h-24 md:w-28 md:h-28 mx-auto mb-2 transform hover:rotate-3 transition-transform">
            <img src="/icon.png" alt="Buensoft Education Logo" className="w-full h-full object-contain" />
          </div>
          <p className="text-[10px] font-black text-indigo-300 dark:text-indigo-500 mb-2 uppercase tracking-widest">v{pkg.version}</p>
          <h2 className="text-3xl font-black text-indigo-900 dark:text-white uppercase tracking-tight mb-1">
            {isForgotPassword 
              ? 'Recuperar Cuenta' 
              : isRegistering 
                ? (registerStep === 'verify_pin' ? 'Confirmar PIN' : 'Crear Cuenta') 
                : 'Bienvenido'}
          </h2>
          <p className="text-indigo-500 dark:text-indigo-300 font-bold uppercase text-xs tracking-widest">
            {isForgotPassword
              ? 'Restablece tu acceso fácilmente'
              : isRegistering 
                ? '🎁 ¡3 clases demo gratis incluidas!' 
                : '¡La educación del futuro hoy!'}
          </p>
        </div>

        {/* Pestañas de Iniciar Sesión / Registro (Ocultas durante recuperación) */}
        {!isForgotPassword && (
          <div className="flex bg-indigo-50 dark:bg-indigo-950 p-1.5 rounded-2xl mb-6 border-2 border-indigo-100 dark:border-indigo-800">
            <button
              type="button"
              onClick={() => { 
                setIsRegistering(false); 
                setRegisterStep('form'); 
                resetAllFeedback(); 
              }}
              className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase transition-all ${
                !isRegistering
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-indigo-400 dark:text-indigo-300 hover:text-indigo-700'
              }`}
            >
              Iniciar Sesión
            </button>
            <button
              type="button"
              onClick={() => { 
                setIsRegistering(true); 
                setRegisterStep('form'); 
                resetAllFeedback(); 
              }}
              className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase transition-all ${
                isRegistering
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-indigo-400 dark:text-indigo-300 hover:text-indigo-700'
              }`}
            >
              Registrarse ✨
            </button>
          </div>
        )}

        {/* BOTÓN GOOGLE SIGN-IN DIRECTO (Solo si no está en recuperación) */}
        {!isForgotPassword && registerStep === 'form' && (
          <div className="mb-6">
            <div className="flex justify-center">
              <div ref={googleBtnRef} className="min-h-[44px] flex justify-center"></div>
            </div>

            {/* Divisor */}
            <div className="relative flex py-4 items-center">
              <div className="flex-grow border-t border-indigo-100 dark:border-indigo-800"></div>
              <span className="flex-shrink mx-4 text-[10px] font-black uppercase text-indigo-300 dark:text-indigo-600 tracking-wider">
                O con tu cuenta
              </span>
              <div className="flex-grow border-t border-indigo-100 dark:border-indigo-800"></div>
            </div>
          </div>
        )}

        {/* MENSAJES DE ERROR E INFO */}
        {error && (
          <p className="text-red-500 text-xs font-black text-center bg-red-50 dark:bg-red-900/30 p-3 rounded-2xl border-2 border-red-100 dark:border-red-900/50 uppercase tracking-tight mb-4 animate-in fade-in">
            {error}
          </p>
        )}

        {infoMessage && (
          <p className="text-indigo-700 dark:text-indigo-300 text-xs font-bold text-center bg-indigo-50 dark:bg-indigo-950/60 p-3 rounded-2xl border-2 border-indigo-100 dark:border-indigo-800 mb-4 animate-in fade-in">
            {infoMessage}
          </p>
        )}

        {/* ------------------------------------------------------------- */}
        {/* SECCIÓN 1: MODO RECUPERACIÓN ("Olvidé mi usuario o contraseña") */}
        {/* ------------------------------------------------------------- */}
        {isForgotPassword ? (
          forgotStep === 'email' ? (
            /* PASO 1 RECUPERACIÓN: INGRESAR CORREO */
            <form onSubmit={handleSendRecoveryCode} className="space-y-4 animate-in fade-in">
              <div className="bg-indigo-50 dark:bg-indigo-950/60 p-4 rounded-2xl border-2 border-indigo-100 dark:border-indigo-800 text-left">
                <p className="text-xs font-bold text-indigo-800 dark:text-indigo-200 leading-relaxed">
                  Ingresa tu correo electrónico registrado. Te enviaremos un código provisional para comprobar tu identidad, recordarte tu nombre de usuario y permitirte restablecer tu contraseña.
                </p>
              </div>

              <div>
                <label className="block text-[10px] font-black text-indigo-400 dark:text-indigo-500 uppercase tracking-widest mb-1.5 ml-2">
                  Correo Electrónico Registrado
                </label>
                <input 
                  type="email" 
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  className="w-full px-5 py-3.5 rounded-2xl border-4 border-indigo-50 dark:border-indigo-800 bg-white dark:bg-indigo-950 text-indigo-900 dark:text-white font-bold focus:border-indigo-500 outline-none transition-all placeholder:text-indigo-200"
                  placeholder="tu@correo.com"
                  required
                  disabled={isLoading}
                  autoFocus
                />
              </div>

              <button 
                type="submit"
                disabled={isLoading}
                className={`w-full bg-indigo-600 text-white font-black py-4 rounded-2xl shadow-xl transition-all transform active:scale-95 flex items-center justify-center space-x-2 text-sm md:text-base uppercase tracking-wider ${
                  isLoading ? 'opacity-70' : 'hover:bg-indigo-700 hover:shadow-indigo-200 dark:hover:shadow-none'
                }`}
              >
                {isLoading ? (
                  <>
                    <div className="w-5 h-5 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Buscando cuenta...</span>
                  </>
                ) : (
                  <span>ENVIAR CÓDIGO PROVISIONAL ✉️</span>
                )}
              </button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsForgotPassword(false);
                    resetAllFeedback();
                  }}
                  className="text-xs font-black text-indigo-500 hover:underline uppercase"
                >
                  ← Volver a Iniciar Sesión
                </button>
              </div>
            </form>
          ) : (
            /* PASO 2 RECUPERACIÓN: CÓDIGO + NUEVA CONTRASEÑA */
            <form onSubmit={handleResetPasswordSubmit} className="space-y-3.5 animate-in fade-in">
              {/* Tarjeta recordando el nombre de usuario detectado */}
              <div className="bg-emerald-50 dark:bg-emerald-950/40 p-4 rounded-2xl border-2 border-emerald-200 dark:border-emerald-800 text-center">
                <p className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-0.5">
                  Tu Nombre de Usuario es:
                </p>
                <p className="text-xl font-black text-emerald-950 dark:text-white">
                  @{forgotUsername}
                </p>
                <p className="text-[10px] text-emerald-700 dark:text-emerald-300 font-medium mt-1">
                  Usa este usuario para entrar al aula una vez actualizada tu contraseña.
                </p>
              </div>

              <div>
                <label className="block text-[10px] font-black text-indigo-400 dark:text-indigo-500 uppercase tracking-widest mb-1 ml-2">
                  Código Provisional (6 dígitos)
                </label>
                <input 
                  type="text" 
                  maxLength={6}
                  value={forgotCode}
                  onChange={(e) => setForgotCode(e.target.value.replace(/\D/g, ''))}
                  className="w-full tracking-[8px] text-center text-2xl font-black py-2.5 rounded-2xl border-4 border-indigo-200 dark:border-indigo-700 bg-white dark:bg-indigo-950 text-indigo-950 dark:text-white focus:border-indigo-600 outline-none transition-all"
                  placeholder="123456"
                  required
                  disabled={isLoading}
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-black text-indigo-400 dark:text-indigo-500 uppercase tracking-widest mb-1 ml-2">
                    Nueva Contraseña
                  </label>
                  <input 
                    type="password" 
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-2xl border-4 border-indigo-50 dark:border-indigo-800 bg-white dark:bg-indigo-950 text-indigo-900 dark:text-white font-bold focus:border-indigo-500 outline-none transition-all placeholder:text-indigo-200 text-sm"
                    placeholder="••••••••"
                    required
                    disabled={isLoading}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-indigo-400 dark:text-indigo-500 uppercase tracking-widest mb-1 ml-2">
                    Confirmar
                  </label>
                  <input 
                    type="password" 
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-2xl border-4 border-indigo-50 dark:border-indigo-800 bg-white dark:bg-indigo-950 text-indigo-900 dark:text-white font-bold focus:border-indigo-500 outline-none transition-all placeholder:text-indigo-200 text-sm"
                    placeholder="••••••••"
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>

              <button 
                type="submit"
                disabled={isLoading || forgotCode.length < 6}
                className={`w-full bg-emerald-600 text-white font-black py-3.5 rounded-2xl shadow-xl transition-all transform active:scale-95 flex items-center justify-center space-x-2 text-sm uppercase tracking-wider ${
                  isLoading || forgotCode.length < 6 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-emerald-700'
                }`}
              >
                {isLoading ? (
                  <>
                    <div className="w-5 h-5 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Actualizando...</span>
                  </>
                ) : (
                  <span>GUARDAR CONTRASEÑA Y ENTRAR 🔑</span>
                )}
              </button>

              <div className="flex justify-between items-center text-[11px] pt-2 font-black">
                <button
                  type="button"
                  onClick={() => { setForgotStep('email'); resetAllFeedback(); }}
                  className="text-indigo-400 hover:underline uppercase"
                >
                  ← Cambiar correo
                </button>
                <button
                  type="button"
                  onClick={handleResendRecoveryCode}
                  disabled={resendCooldown > 0 || isLoading}
                  className="text-indigo-600 dark:text-indigo-300 hover:underline uppercase disabled:opacity-50"
                >
                  {resendCooldown > 0 ? `Reenviar en ${resendCooldown}s` : 'Reenviar código 🔄'}
                </button>
              </div>
            </form>
          )
        ) : !isRegistering ? (
          /* ------------------------------------------------------------- */
          /* SECCIÓN 2: INICIO DE SESIÓN REGULAR */
          /* ------------------------------------------------------------- */
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label className="block text-[10px] font-black text-indigo-400 dark:text-indigo-500 uppercase tracking-widest mb-1.5 ml-2">
                Usuario
              </label>
              <input 
                type="text" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-5 py-3.5 rounded-2xl border-4 border-indigo-50 dark:border-indigo-800 bg-white dark:bg-indigo-950 text-indigo-900 dark:text-white font-bold focus:border-indigo-500 outline-none transition-all placeholder:text-indigo-200"
                placeholder="Tu usuario..."
                required
                disabled={isLoading}
              />
            </div>

            <div>
              <label className="block text-[10px] font-black text-indigo-400 dark:text-indigo-500 uppercase tracking-widest mb-1.5 ml-2">
                Contraseña
              </label>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-5 py-3.5 rounded-2xl border-4 border-indigo-50 dark:border-indigo-800 bg-white dark:bg-indigo-950 text-indigo-900 dark:text-white font-bold focus:border-indigo-500 outline-none transition-all placeholder:text-indigo-200"
                placeholder="••••••••"
                required
                disabled={isLoading}
              />
              {/* ENLACE ¿OLVIDASTE TU USUARIO O CONTRASEÑA? */}
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsForgotPassword(true);
                    setForgotStep('email');
                    resetAllFeedback();
                  }}
                  className="text-xs font-bold text-indigo-500 hover:text-indigo-700 dark:text-indigo-300 dark:hover:text-white transition-colors underline"
                >
                  ¿Olvidaste tu usuario o contraseña?
                </button>
              </div>
            </div>

            <button 
              type="submit"
              disabled={isLoading}
              className={`w-full bg-indigo-600 text-white font-black py-4 rounded-2xl shadow-xl transition-all transform active:scale-95 flex items-center justify-center space-x-2 text-base md:text-lg uppercase tracking-widest ${
                isLoading ? 'opacity-70' : 'hover:bg-indigo-700 hover:shadow-indigo-200 dark:hover:shadow-none'
              }`}
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Entrando...</span>
                </>
              ) : (
                <span>ENTRAR AL AULA 🚀</span>
              )}
            </button>
          </form>
        ) : registerStep === 'form' ? (
          /* ------------------------------------------------------------- */
          /* SECCIÓN 3: REGISTRO PASO 1 (DATOS + ENVÍO CÓDIGO RESEND) */
          /* ------------------------------------------------------------- */
          <form onSubmit={handleSendPin} className="space-y-3.5">
            <div>
              <label className="block text-[10px] font-black text-indigo-400 dark:text-indigo-500 uppercase tracking-widest mb-1 ml-2">
                Nombre de Usuario
              </label>
              <input 
                type="text" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-5 py-3 rounded-2xl border-4 border-indigo-50 dark:border-indigo-800 bg-white dark:bg-indigo-950 text-indigo-900 dark:text-white font-bold focus:border-indigo-500 outline-none transition-all placeholder:text-indigo-200"
                placeholder="Elige tu usuario..."
                required
                disabled={isLoading}
              />
            </div>

            <div>
              <label className="block text-[10px] font-black text-indigo-400 dark:text-indigo-500 uppercase tracking-widest mb-1 ml-2">
                Correo Electrónico (Para enviar tu PIN)
              </label>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-5 py-3 rounded-2xl border-4 border-indigo-50 dark:border-indigo-800 bg-white dark:bg-indigo-950 text-indigo-900 dark:text-white font-bold focus:border-indigo-500 outline-none transition-all placeholder:text-indigo-200"
                placeholder="tu@correo.com"
                required
                disabled={isLoading}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-black text-indigo-400 dark:text-indigo-500 uppercase tracking-widest mb-1 ml-2">
                  Contraseña
                </label>
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl border-4 border-indigo-50 dark:border-indigo-800 bg-white dark:bg-indigo-950 text-indigo-900 dark:text-white font-bold focus:border-indigo-500 outline-none transition-all placeholder:text-indigo-200 text-sm"
                  placeholder="••••••••"
                  required
                  disabled={isLoading}
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-indigo-400 dark:text-indigo-500 uppercase tracking-widest mb-1 ml-2">
                  Confirmar
                </label>
                <input 
                  type="password" 
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl border-4 border-indigo-50 dark:border-indigo-800 bg-white dark:bg-indigo-950 text-indigo-900 dark:text-white font-bold focus:border-indigo-500 outline-none transition-all placeholder:text-indigo-200 text-sm"
                  placeholder="••••••••"
                  required
                  disabled={isLoading}
                />
              </div>
            </div>

            <button 
              type="submit"
              disabled={isLoading}
              className={`w-full bg-indigo-600 text-white font-black py-4 rounded-2xl shadow-xl transition-all transform active:scale-95 flex items-center justify-center space-x-2 text-sm md:text-base uppercase tracking-wider ${
                isLoading ? 'opacity-70' : 'hover:bg-indigo-700 hover:shadow-indigo-200 dark:hover:shadow-none'
              }`}
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Enviando código...</span>
                </>
              ) : (
                <span>ENVIAR CÓDIGO POR CORREO ✉️</span>
              )}
            </button>
          </form>
        ) : (
          /* ------------------------------------------------------------- */
          /* SECCIÓN 4: REGISTRO PASO 2 (CONFIRMAR PIN RESEND) */
          /* ------------------------------------------------------------- */
          <form onSubmit={handleConfirmPinAndRegister} className="space-y-4 animate-in fade-in">
            <div className="bg-indigo-50 dark:bg-indigo-950/60 p-4 rounded-2xl border-2 border-indigo-100 dark:border-indigo-800 text-center">
              <p className="text-xs font-bold text-indigo-700 dark:text-indigo-200 mb-1">
                Ingresa el código de 6 dígitos enviado a:
              </p>
              <p className="text-xs font-black text-indigo-950 dark:text-white">
                {email}
              </p>
            </div>

            <div>
              <input 
                type="text" 
                maxLength={6}
                value={pinCode}
                onChange={(e) => setPinCode(e.target.value.replace(/\D/g, ''))}
                className="w-full tracking-[10px] text-center text-3xl font-black py-3 rounded-2xl border-4 border-indigo-200 dark:border-indigo-700 bg-white dark:bg-indigo-950 text-indigo-950 dark:text-white focus:border-indigo-600 outline-none transition-all"
                placeholder="123456"
                required
                disabled={isLoading}
                autoFocus
              />
            </div>

            <button 
              type="submit"
              disabled={isLoading || pinCode.length < 6}
              className={`w-full bg-green-600 text-white font-black py-4 rounded-2xl shadow-xl transition-all transform active:scale-95 flex items-center justify-center space-x-2 text-sm md:text-base uppercase tracking-wider ${
                isLoading || pinCode.length < 6 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-green-700'
              }`}
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Creando cuenta...</span>
                </>
              ) : (
                <span>CONFIRMAR Y CREAR CUENTA 🎓</span>
              )}
            </button>

            <div className="flex justify-between items-center text-[11px] pt-2 font-black">
              <button
                type="button"
                onClick={() => { setRegisterStep('form'); resetAllFeedback(); }}
                className="text-indigo-400 hover:underline uppercase"
              >
                ← Corregir datos
              </button>
              <button
                type="button"
                onClick={handleResendPin}
                disabled={resendCooldown > 0 || isLoading}
                className="text-indigo-600 dark:text-indigo-300 hover:underline uppercase disabled:opacity-50"
              >
                {resendCooldown > 0 ? `Reenviar en ${resendCooldown}s` : 'Reenviar PIN 🔄'}
              </button>
            </div>
          </form>
        )}

        {/* Alternar entre Login y Registro (Oculto en recuperación) */}
        {!isForgotPassword && (
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => {
                setIsRegistering(!isRegistering);
                setRegisterStep('form');
                resetAllFeedback();
              }}
              className="text-xs font-black text-indigo-500 dark:text-indigo-300 hover:underline uppercase"
            >
              {isRegistering
                ? '¿Ya tienes una cuenta? Inicia sesión aquí'
                : '¿Nuevo estudiante? Regístrate y recibe 3 clases gratis'}
            </button>
          </div>
        )}

      </div>
    </div>
  );
};

export default Login;
