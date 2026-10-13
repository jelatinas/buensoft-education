// Utilidades criptográficas para autenticación y protección de contraseñas

const SALT_PREFIX = 'buensoft_edu_salt_';

/**
 * Genera un hash SHA-256 criptográfico con salt a partir de una contraseña en texto plano.
 */
export const hashPassword = async (password: string): Promise<string> => {
  if (!password) return '';
  const encoder = new TextEncoder();
  const data = encoder.encode(`${SALT_PREFIX}${password}`);
  
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  
  // Fallback simple por si se ejecutara en un entorno sin Web Crypto
  return fallbackHash(`${SALT_PREFIX}${password}`);
};

/**
 * Verifica si una contraseña ingresada coincide con la guardada en base de datos.
 * Soporta contraseñas antiguas en texto plano, contraseñas hasheadas con salt y SHA-256 estándar.
 */
export const verifyPassword = async (
  inputPassword: string,
  storedPassword: string | undefined | null
): Promise<{ isValid: boolean; needsUpgrade: boolean }> => {
  if (!storedPassword || !inputPassword) return { isValid: false, needsUpgrade: false };

  // 1. Coincidencia con hash seguro (con salt)
  const saltedHash = await hashPassword(inputPassword);
  if (storedPassword === saltedHash) {
    return { isValid: true, needsUpgrade: false };
  }

  // 2. Coincidencia en texto plano (legado / sin encriptar)
  if (storedPassword === inputPassword) {
    return { isValid: true, needsUpgrade: true }; // Requiere migrar a hash seguro
  }

  // 3. Coincidencia con SHA-256 directo (sin salt)
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const rawBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(inputPassword));
    const rawHash = Array.from(new Uint8Array(rawBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    if (storedPassword.toLowerCase() === rawHash.toLowerCase()) {
      return { isValid: true, needsUpgrade: true };
    }
  }

  return { isValid: false, needsUpgrade: false };
};

/**
 * Detecta si una cadena ya tiene formato de hash hexadecimal SHA-256 (64 caracteres)
 */
export const isHashedPassword = (password: string): boolean => {
  return /^[a-f0-9]{64}$/i.test(password.trim());
};

// Implementación auxiliar de respaldo
function fallbackHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(16, '0').repeat(4).slice(0, 64);
}
