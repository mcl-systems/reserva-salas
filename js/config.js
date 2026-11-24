/**
 * Configuración del sitio web.
 * Es lo único que tienes que editar después de publicar el backend (ver README).
 */
window.APP_CONFIG = {
  // Título de la aplicación (arriba a la izquierda, pestaña del navegador y pantalla de acceso)
  NOMBRE_APP: 'Reserva de Salas',
  NOMBRE_ORGANIZACION: 'MCLogística',

  // Color de la marca: 'verde' | 'azul' | 'morado' | 'vino' | 'naranja'
  // (cada persona puede cambiarlo para sí misma desde el menú de su cuenta)
  COLOR_MARCA: 'verde',

  // Tipo de letra predeterminado (cada persona puede cambiarlo desde el menú de su cuenta):
  // 'moderna' (Figtree) | 'redondeada' (Nunito) | 'amplia' (Lexend) | 'google' (Roboto)
  // 'legible' (Atkinson Hyperlegible) | 'letrero' (títulos altos y angostos)
  FUENTE: 'moderna',

  // Decoración por época del año: 'auto' (según la fecha) | 'apagada' | el id de una época fija.
  // Épocas incluidas: anio-nuevo, amistad, semana-santa, dia-cruz, madres, padres, maestro,
  // agostinas, patrias, calabiuza, navidad. Cada persona puede cambiarlo en el menú de su cuenta.
  EPOCA: 'auto',
  // Épocas incluidas que NO quieres usar, por ejemplo: ['amistad', 'calabiuza']
  EPOCAS_DESACTIVADAS: [],
  // Épocas propias de tu organización (fechas MM-DD; colores para la guirnalda).
  // adorno: 'banderines' | 'franjas' | 'luces'  ·  particulas (opcional): un símbolo, ej. '★'
  EPOCAS_PROPIAS: [
    // { id: 'aniversario', nombre: 'Aniversario de la institución', emoji: '🎓', desde: '03-14', hasta: '03-18',
    //   colores: ['#003b71', '#f2a900', '#ffffff'], mensaje: '¡Feliz aniversario a toda la comunidad!' },
  ],

  // Huevos de pascua y decoraciones de temporada (false para desactivarlos)
  EASTER_EGGS: true,

  // URL de la aplicación web de Apps Script (termina en /exec).
  // Si se deja vacío, el sitio funciona en MODO DEMOSTRACIÓN con datos de ejemplo
  // guardados solo en tu navegador.
  API_URL: '',  // ← PASO 5: pega aquí la URL que termina en /exec

  // ID de cliente OAuth de Google Cloud (tipo "Aplicación web").
  // Termina en .apps.googleusercontent.com
  GOOGLE_CLIENT_ID: '',  // ← PASO 5: pega aquí el ID que termina en .apps.googleusercontent.com

  // Opcional: muestra solo cuentas de este dominio en el selector de Google (ej. 'miempresa.com').
  // La restricción real se configura en la hoja Config (DOMINIO_PERMITIDO).
  DOMINIO_SUGERIDO: 'mclogistica.com',

  // Zona horaria de las salas
  ZONA_HORARIA: 'America/El_Salvador',

  // true → 14:00   ·   false → 2:00 p. m.
  FORMATO_24H: false,
};
