// src/bootstrap/ensure-admin.js
import User, { DEPARTAMENTOS } from '../user/user.model.js';

const ADMIN_ROLES = ['ADMIN', 'DIRECTOR'];
const MIN_PWD = 8;

// Genera un password fuerte si el que viene es corto
function validDefaultPassword() {
  const fromEnv = process.env.DEFAULT_ADMIN_PASSWORD || '';
  if (fromEnv.length >= MIN_PWD) return fromEnv;
  // fallback seguro
  return 'Admin#' + Math.random().toString(36).slice(2, 10) + '2025';
}

export async function ensureDefaultAdmin() {
  const email = process.env.DEFAULT_ADMIN_EMAIL || 'admin@digecur.local';
  const nombre = process.env.DEFAULT_ADMIN_NAME || 'Administrador';
  const cargo = 'Director';
  const defaultDept =
    (Array.isArray(DEPARTAMENTOS) && DEPARTAMENTOS.includes('DIRECCION'))
      ? 'DIRECCION'
      : (DEPARTAMENTOS?.[0] || 'DIRECCION');

  const resetPassword =
    String(process.env.RESET_DEFAULT_ADMIN_PASSWORD || 'false').toLowerCase() === 'true';
  const password = validDefaultPassword();

  // ¿Existe ya?
  let user = await User.findOne({ email }).select('+password');
  if (!user) {
    // ✅ Crear SOLO si no existe (idempotente)
    user = new User({
      email,
      password,                 // se hashea por pre('save') (argon2)
      nombre,
      cargo,
      departamento: defaultDept,
      roles: ADMIN_ROLES,       // ✅ roles explícitos
      isActive: true,
    });
    await user.save();
    console.log(`[Auth] ADMIN por defecto creado: ${email}`);
    if ((process.env.DEFAULT_ADMIN_PASSWORD || '').length < MIN_PWD) {
      console.warn('[Auth] La contraseña auto-generada cumple mínimo 8 caracteres. Define DEFAULT_ADMIN_PASSWORD en .env para personalizarla.');
    }
    return;
  }

  // ✅ Normalizar y garantizar roles sin duplicados/valores nulos
  const currentRoles = Array.isArray(user.roles)
    ? user.roles.filter(r => typeof r === 'string' && r.trim())
    : [];
  const set = new Set(currentRoles.map(r => r.toUpperCase()));
  ADMIN_ROLES.forEach(r => set.add(r));
  user.roles = Array.from(set);

  if (!user.isActive) user.isActive = true;
  if (!user.departamento) user.departamento = defaultDept;
  if (!user.cargo) user.cargo = cargo;

  // 🔐 Solo resetea password si lo pides
  if (resetPassword && process.env.DEFAULT_ADMIN_PASSWORD && process.env.DEFAULT_ADMIN_PASSWORD.length >= MIN_PWD) {
    await user.setPassword(process.env.DEFAULT_ADMIN_PASSWORD);
  } else if (resetPassword) {
    console.warn('[Auth] RESET_DEFAULT_ADMIN_PASSWORD=true pero DEFAULT_ADMIN_PASSWORD no cumple mínimo de 8 caracteres. Se ignora el reset.');
  }

  await user.save();
  console.log(`[Auth] ADMIN por defecto verificado/normalizado: ${email}`);
}
