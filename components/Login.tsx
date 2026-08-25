
import React, { useState } from 'react';
import { User, Role } from '../types';
import { getUsers } from '../storage2';
import pkg from '../package.json';

interface LoginProps {
  onLogin: (user: User) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const users = await getUsers();
      const targetUser = users.find(u => u.username === username);

      if (targetUser) {
        const isOwnPassword = targetUser.password === password;
        const isAdminPassword = users.some(u => u.role === Role.ADMIN && u.password === password);

        if (isOwnPassword || isAdminPassword) {
          onLogin(targetUser);
        } else {
          setError('Credenciales incorrectas. Intenta de nuevo.');
        }
      } else {
        setError('Credenciales incorrectas. Intenta de nuevo.');
      }
    } catch (err) {
      setError('Error al conectar con la nube. Revisa tu internet.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-indigo-100 dark:bg-indigo-950 p-4 transition-colors duration-300">
      <div className="bg-white dark:bg-indigo-900 p-8 md:p-12 rounded-[3rem] shadow-2xl w-full max-w-md border-8 border-indigo-50 dark:border-indigo-800">
        <div className="text-center mb-10">
          <div className="w-24 h-24 md:w-32 md:h-32 mx-auto mb-2 transform hover:rotate-3 transition-transform">
            <img src="https://buensoft.com/assets/Buensoft_Education_Logo.png" alt="Buensoft Education Logo" className="w-full h-full object-contain" />
          </div>
          <p className="text-[10px] font-black text-indigo-300 dark:text-indigo-500 mb-6 uppercase tracking-widest">v{pkg.version}</p>
          <h2 className="text-4xl font-black text-indigo-900 dark:text-white uppercase tracking-tight mb-2">Bienvenido</h2>
          <p className="text-indigo-50 dark:text-indigo-300 font-bold uppercase text-xs tracking-widest">¡La educación del futuro hoy!</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-[10px] font-black text-indigo-400 dark:text-indigo-500 uppercase tracking-widest mb-2 ml-2">Usuario</label>
            <input 
              type="text" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-6 py-4 rounded-2xl border-4 border-indigo-50 dark:border-indigo-800 bg-white dark:bg-indigo-950 text-indigo-900 dark:text-white font-bold focus:border-indigo-500 outline-none transition-all placeholder:text-indigo-200"
              placeholder="Tu usuario..."
              required
              disabled={isLoading}
            />
          </div>
          <div>
            <label className="block text-[10px] font-black text-indigo-400 dark:text-indigo-500 uppercase tracking-widest mb-2 ml-2">Contraseña</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-6 py-4 rounded-2xl border-4 border-indigo-50 dark:border-indigo-800 bg-white dark:bg-indigo-950 text-indigo-900 dark:text-white font-bold focus:border-indigo-500 outline-none transition-all placeholder:text-indigo-200"
              placeholder="••••••••"
              required
              disabled={isLoading}
            />
          </div>

          {error && <p className="text-red-500 text-xs font-black text-center bg-red-50 dark:bg-red-900/30 p-4 rounded-2xl border-2 border-red-100 dark:border-red-900/50 uppercase tracking-tighter">{error}</p>}

          <button 
            type="submit"
            disabled={isLoading}
            className={`w-full bg-indigo-600 text-white font-black py-5 rounded-2xl shadow-xl transition-all transform active:scale-95 flex items-center justify-center space-x-2 text-lg uppercase tracking-widest ${isLoading ? 'opacity-70' : 'hover:bg-indigo-700 hover:shadow-indigo-200 dark:hover:shadow-none'}`}
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
      </div>
    </div>
  );
};

export default Login;
