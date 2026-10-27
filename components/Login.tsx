import React, { useState } from 'react';
import { User } from '../types';
import { authenticateUser, registerStudent } from '../storage2';
import pkg from '../package.json';

interface LoginProps {
  onLogin: (user: User) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      if (isRegistering) {
        if (password.length < 4) {
          setError('La contraseña debe tener al menos 4 caracteres.');
          setIsLoading(false);
          return;
        }
        if (password !== confirmPassword) {
          setError('Las contraseñas no coinciden.');
          setIsLoading(false);
          return;
        }

        const registeredUser = await registerStudent(username, password, email);
        if (registeredUser) {
          onLogin(registeredUser);
        }
      } else {
        const authenticatedUser = await authenticateUser(username, password);

        if (authenticatedUser) {
          onLogin(authenticatedUser);
        } else {
          setError('Credenciales incorrectas. Intenta de nuevo.');
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Error al conectar con la nube. Revisa tu internet.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-indigo-100 dark:bg-indigo-950 p-4 transition-colors duration-300">
      <div className="bg-white dark:bg-indigo-900 p-8 md:p-12 rounded-[3rem] shadow-2xl w-full max-w-md border-8 border-indigo-50 dark:border-indigo-800">
        <div className="text-center mb-8">
          <div className="w-24 h-24 md:w-32 md:h-32 mx-auto mb-2 transform hover:rotate-3 transition-transform">
            <img src="/icon.png" alt="Buensoft Education Logo" className="w-full h-full object-contain" />
          </div>
          <p className="text-[10px] font-black text-indigo-300 dark:text-indigo-500 mb-4 uppercase tracking-widest">v{pkg.version}</p>
          <h2 className="text-3xl md:text-4xl font-black text-indigo-900 dark:text-white uppercase tracking-tight mb-2">
            {isRegistering ? 'Crear Cuenta' : 'Bienvenido'}
          </h2>
          <p className="text-indigo-400 dark:text-indigo-300 font-bold uppercase text-xs tracking-widest">
            {isRegistering ? '🎁 ¡3 clases demo gratis incluidas!' : '¡La educación del futuro hoy!'}
          </p>
        </div>

        {/* Pestañas de Login / Registro */}
        <div className="flex bg-indigo-50 dark:bg-indigo-950 p-1.5 rounded-2xl mb-6 border-2 border-indigo-100 dark:border-indigo-800">
          <button
            type="button"
            onClick={() => { setIsRegistering(false); setError(''); }}
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
            onClick={() => { setIsRegistering(true); setError(''); }}
            className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase transition-all ${
              isRegistering
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-indigo-400 dark:text-indigo-300 hover:text-indigo-700'
            }`}
          >
            Registrarse ✨
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[10px] font-black text-indigo-400 dark:text-indigo-500 uppercase tracking-widest mb-1.5 ml-2">
              Usuario
            </label>
            <input 
              type="text" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-5 py-3.5 rounded-2xl border-4 border-indigo-50 dark:border-indigo-800 bg-white dark:bg-indigo-950 text-indigo-900 dark:text-white font-bold focus:border-indigo-500 outline-none transition-all placeholder:text-indigo-200"
              placeholder="Tu nombre de usuario..."
              required
              disabled={isLoading}
            />
          </div>

          {isRegistering && (
            <div>
              <label className="block text-[10px] font-black text-indigo-400 dark:text-indigo-500 uppercase tracking-widest mb-1.5 ml-2">
                Correo Electrónico (Opcional)
              </label>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-5 py-3.5 rounded-2xl border-4 border-indigo-50 dark:border-indigo-800 bg-white dark:bg-indigo-950 text-indigo-900 dark:text-white font-bold focus:border-indigo-500 outline-none transition-all placeholder:text-indigo-200"
                placeholder="tu@correo.com"
                disabled={isLoading}
              />
            </div>
          )}

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
          </div>

          {isRegistering && (
            <div>
              <label className="block text-[10px] font-black text-indigo-400 dark:text-indigo-500 uppercase tracking-widest mb-1.5 ml-2">
                Confirmar Contraseña
              </label>
              <input 
                type="password" 
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-5 py-3.5 rounded-2xl border-4 border-indigo-50 dark:border-indigo-800 bg-white dark:bg-indigo-950 text-indigo-900 dark:text-white font-bold focus:border-indigo-500 outline-none transition-all placeholder:text-indigo-200"
                placeholder="••••••••"
                required
                disabled={isLoading}
              />
            </div>
          )}

          {error && (
            <p className="text-red-500 text-xs font-black text-center bg-red-50 dark:bg-red-900/30 p-3 rounded-2xl border-2 border-red-100 dark:border-red-900/50 uppercase tracking-tight">
              {error}
            </p>
          )}

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
                <span>{isRegistering ? 'Creando cuenta...' : 'Entrando...'}</span>
              </>
            ) : (
              <span>{isRegistering ? 'CREAR CUENTA GRATIS 🎓' : 'ENTRAR AL AULA 🚀'}</span>
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => { setIsRegistering(!isRegistering); setError(''); }}
            className="text-xs font-black text-indigo-500 dark:text-indigo-300 hover:underline uppercase"
          >
            {isRegistering
              ? '¿Ya tienes una cuenta? Inicia sesión aquí'
              : '¿Nuevo estudiante? Regístrate y recibe 3 clases gratis'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Login;
