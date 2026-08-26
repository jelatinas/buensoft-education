
import React, { useState, useEffect, useRef } from 'react';
import { User, Role } from './types.ts';
import { initStorage, autoUpdateLessonStatuses, updateUser, updateUserSession, getAccountBalance } from './storage2.ts';
import { supabase } from './supabaseClient.ts';
import Login from './components/Login.tsx';
import AdminDashboard from './components/AdminDashboard.tsx';
import StudentDashboard from './components/StudentDashboard.tsx';
import { Lock, Sun, Moon, LogOut, Wallet, BookOpen, UserCircle2, Settings, Shield, GraduationCap, Coins, Palette } from 'lucide-react';
import pkg from './package.json';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [theme, setTheme] = useState<'claro' | 'oscuro' | 'bosque'>(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark') return 'oscuro';
    if (saved === 'light') return 'claro';
    return (saved as 'claro' | 'oscuro' | 'bosque') || 'claro';
  });
  const [totalBalance, setTotalBalance] = useState(0);

  const [tabSessionId] = useState(() => Math.random().toString(36).substring(2, 15));
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const sessionSubscriptionRef = useRef<any>(null);

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [passError, setPassError] = useState('');
  const [isUpdatingPass, setIsUpdatingPass] = useState(false);

  const [lastFinishedLessonId, setLastFinishedLessonId] = useState<string | null>(null);
  const [lastFinishedDate, setLastFinishedDate] = useState<string | null>(null);

  /**
   * Función para obtener el balance actual del estudiante.
   * Utiliza el ID (UUID) si está disponible, sino el username.
   */
  const fetchUserBalance = async (user: User) => {
    try {
      const ownerId = user.id || user.username;
      const balance = await getAccountBalance(ownerId);
      setTotalBalance(balance);
      return balance;
    } catch (err) {
      console.error("Error al obtener balance:", err);
      return 0;
    }
  };

  const setupSessionListener = (username: string) => {
    if (sessionSubscriptionRef.current) {
      supabase.removeChannel(sessionSubscriptionRef.current);
    }

    const channel = supabase
      .channel(`user-session-${username}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'users',
          filter: `username=eq.${username}`
        },
        (payload) => {
          const remoteSessionId = payload.new.current_session_id;
          if (remoteSessionId && remoteSessionId !== tabSessionId) {
            setShowDuplicateModal(true);
          }
        }
      )
      .subscribe();
    
    sessionSubscriptionRef.current = channel;
  };

  // Escucha de cambios en tiempo real en la tabla USERS para el balance
  useEffect(() => {
    if (currentUser && currentUser.role === Role.STUDENT) {
      const filter = currentUser.id 
        ? `id=eq.${currentUser.id}` 
        : `username=eq.${currentUser.username}`;

      const channel = supabase
        .channel(`user-balance-changes-${currentUser.username}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'users',
            filter: filter
          },
          (payload) => {
            // Si el balance cambió, actualizamos el estado local
            if (payload.new && typeof payload.new.balance !== 'undefined') {
              setTotalBalance(Number(payload.new.balance));
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [currentUser]);

  useEffect(() => {
    const loadApp = async () => {
      await initStorage();
      const storedUser = localStorage.getItem('current_user');
      if (storedUser) {
        const user = JSON.parse(storedUser);
        setCurrentUser(user);
        if (user.role === Role.STUDENT) {
          await autoUpdateLessonStatuses(user.username);
          fetchUserBalance(user);
          setupSessionListener(user.username);
          updateUserSession(user.username, tabSessionId);
        }
      }
      setIsInitializing(false);
    };
    loadApp();

    return () => {
      if (sessionSubscriptionRef.current) {
        supabase.removeChannel(sessionSubscriptionRef.current);
      }
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('theme', theme);
    document.documentElement.classList.remove('dark', 'theme-bosque');
    if (theme === 'oscuro') {
      document.documentElement.classList.add('dark');
    } else if (theme === 'bosque') {
      document.documentElement.classList.add('theme-bosque');
    }
  }, [theme]);

  const handleLogin = async (user: User) => {
    setCurrentUser(user);
    localStorage.setItem('current_user', JSON.stringify(user));
    if (user.role === Role.STUDENT) {
      await autoUpdateLessonStatuses(user.username);
      fetchUserBalance(user);
      setupSessionListener(user.username);
      await updateUserSession(user.username, tabSessionId);
    }
  };

  const handleLogout = () => {
    if (currentUser) {
      updateUserSession(currentUser.username, null).catch(console.error);
    }
    setCurrentUser(null);
    setTotalBalance(0);
    setShowDuplicateModal(false);
    localStorage.removeItem('current_user');
    if (sessionSubscriptionRef.current) {
      supabase.removeChannel(sessionSubscriptionRef.current);
    }
  };

  const handleResumeHere = async () => {
    if (currentUser) {
      await updateUserSession(currentUser.username, tabSessionId);
      setShowDuplicateModal(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassError('');
    if (!currentUser) return;
    
    if (currentPass !== currentUser.password) {
      setPassError('La contraseña actual es incorrecta.');
      return;
    }
    if (newPass.length < 4 || newPass.length > 8) {
      setPassError('La nueva contraseña debe tener entre 4 y 8 caracteres.');
      return;
    }
    if (newPass !== confirmPass) {
      setPassError('Las contraseñas nuevas no coinciden.');
      return;
    }

    setIsUpdatingPass(true);
    try {
      const updatedUser: User = { ...currentUser, password: newPass };
      await updateUser(currentUser.username, updatedUser);
      setCurrentUser(updatedUser);
      localStorage.setItem('current_user', JSON.stringify(updatedUser));
      setShowPasswordModal(false);
      setCurrentPass('');
      setNewPass('');
      setConfirmPass('');
      alert('¡Contraseña actualizada con éxito!');
    } catch (err) {
      setPassError('Error al actualizar. Intenta más tarde.');
    } finally {
      setIsUpdatingPass(false);
    }
  };

  if (isInitializing) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-sky-50 dark:bg-indigo-950 transition-colors duration-500">
        <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-indigo-900 dark:text-sky-100 font-bold animate-pulse text-xl">Buensoft Education se está preparando...</p>
      </div>
    );
  }

  if (!currentUser) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-sky-50 dark:bg-indigo-950 transition-colors duration-300">
      <nav className="bg-white/80 dark:bg-indigo-900/80 backdrop-blur-md shadow-md p-4 flex justify-between items-center sticky top-0 z-[100] border-b dark:border-indigo-800 transition-colors duration-300">
        <div className="flex items-center space-x-3">
          <img src="/icon.png" alt="Logo" className="w-10 h-10 md:w-12 md:h-12 object-contain rounded-lg shadow-sm" />
          <div className="flex flex-col hidden sm:flex">
            <h1 className="text-lg md:text-xl font-black text-indigo-900 dark:text-white uppercase tracking-tight leading-tight">Buensoft Education</h1>
            <span className="text-[10px] font-black text-indigo-400 dark:text-indigo-500 tracking-widest uppercase">v{pkg.version}</span>
          </div>
        </div>
        
        <div className="flex items-center space-x-2 sm:space-x-4">
          <div className="flex flex-col items-end">
            <span className="text-indigo-600 dark:text-indigo-200 font-bold text-xs">Hola, {currentUser.username}</span>
            <button 
              onClick={() => setShowPasswordModal(true)}
              className="text-[9px] font-black text-indigo-400 dark:text-indigo-500 uppercase tracking-widest hover:text-indigo-600 transition-colors"
            >
              Cambiar Contraseña
            </button>
          </div>
          
          <div className="flex bg-indigo-50 dark:bg-indigo-900/50 p-1 rounded-xl items-center space-x-1">
            <button 
              onClick={() => setTheme('claro')}
              className={`p-1.5 rounded-lg transition-all ${theme === 'claro' ? 'bg-white shadow-sm text-sky-500' : 'text-indigo-400 hover:text-indigo-600'}`}
              title="Claro"
            >
              <Sun size={16} />
            </button>
            <button 
              onClick={() => setTheme('oscuro')}
              className={`p-1.5 rounded-lg transition-all ${theme === 'oscuro' ? 'bg-indigo-800 shadow-sm text-sky-200' : 'text-indigo-400 hover:text-indigo-600'}`}
              title="Oscuro"
            >
              <Moon size={16} />
            </button>
            <button 
              onClick={() => setTheme('bosque')}
              className={`p-1.5 rounded-lg transition-all ${theme === 'bosque' ? 'bg-emerald-100 shadow-sm text-emerald-600' : 'text-indigo-400 hover:text-indigo-600'}`}
              title="Bosque"
            >
              <Palette size={16} />
            </button>
          </div>

          {currentUser.role === Role.STUDENT && (
            <div className="flex items-center space-x-2 bg-amber-50 dark:bg-amber-900/30 px-3 py-2 rounded-xl border border-amber-100 dark:border-amber-800">
              <Wallet className="w-4 h-4 text-amber-500" />
              <span className="text-xs font-black text-amber-600 dark:text-amber-400">
                ${totalBalance.toFixed(2)}
              </span>
            </div>
          )}

          <button 
            onClick={handleLogout}
            className="p-2 rounded-xl bg-red-50 dark:bg-red-900/30 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 transition-all"
          >
            <LogOut size={20} />
          </button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {currentUser.role === Role.ADMIN ? (
          <AdminDashboard user={currentUser} />
        ) : (
          <StudentDashboard 
            user={currentUser} 
            lastFinishedLessonId={lastFinishedLessonId}
            initialSelectedDate={lastFinishedDate}
          />
        )}
      </main>

      {/* Duplicate Session Modal */}
      {showDuplicateModal && (
        <div className="fixed inset-0 bg-indigo-900/80 backdrop-blur-md z-[1000] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-indigo-900 p-8 rounded-[3rem] w-full max-w-md shadow-2xl border-8 border-indigo-50 text-center">
            <Shield className="w-20 h-20 text-indigo-600 mx-auto mb-6" />
            <h2 className="text-2xl font-black text-indigo-900 dark:text-white uppercase mb-4">Sesión Duplicada</h2>
            <p className="text-indigo-400 dark:text-indigo-300 font-bold mb-8">Parece que tienes otra pestaña abierta con este usuario.</p>
            <div className="space-y-3">
              <button 
                onClick={handleResumeHere}
                className="w-full bg-indigo-600 text-white font-black py-4 rounded-2xl shadow-xl uppercase tracking-widest"
              >
                Continuar aquí 🚀
              </button>
              <button 
                onClick={handleLogout}
                className="w-full text-indigo-400 font-black py-2 uppercase text-xs"
              >
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Password Update Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-indigo-900/80 backdrop-blur-md z-[1000] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-indigo-900 p-8 rounded-[3rem] w-full max-w-md shadow-2xl border-8 border-indigo-50">
            <h2 className="text-2xl font-black text-indigo-900 dark:text-white uppercase mb-6 text-center">Actualizar Contraseña</h2>
            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-indigo-400 uppercase mb-2 ml-2">Contraseña Actual</label>
                <input 
                  type="password" 
                  value={currentPass}
                  onChange={(e) => setCurrentPass(e.target.value)}
                  className="w-full p-4 bg-indigo-50 dark:bg-indigo-950 rounded-2xl font-bold border-2 border-transparent focus:border-indigo-500 outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-indigo-400 uppercase mb-2 ml-2">Nueva Contraseña</label>
                <input 
                  type="password" 
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                  className="w-full p-4 bg-indigo-50 dark:bg-indigo-950 rounded-2xl font-bold border-2 border-transparent focus:border-indigo-500 outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-indigo-400 uppercase mb-2 ml-2">Confirmar Nueva Contraseña</label>
                <input 
                  type="password" 
                  value={confirmPass}
                  onChange={(e) => setConfirmPass(e.target.value)}
                  className="w-full p-4 bg-indigo-50 dark:bg-indigo-950 rounded-2xl font-bold border-2 border-transparent focus:border-indigo-500 outline-none"
                  required
                />
              </div>
              {passError && <p className="text-red-500 text-[10px] font-black uppercase text-center">{passError}</p>}
              <div className="flex space-x-3 pt-4">
                <button 
                  type="button" 
                  onClick={() => setShowPasswordModal(false)}
                  className="flex-1 text-indigo-400 font-black uppercase text-xs"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  disabled={isUpdatingPass}
                  className="flex-1 bg-indigo-600 text-white font-black py-4 rounded-2xl shadow-xl uppercase text-xs disabled:opacity-50"
                >
                  {isUpdatingPass ? 'Actualizando...' : 'Guardar ✨'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
