// Referencias a los elementos del DOM
const listaMensajes = document.getElementById("lista-mensajes");
const zonaDeEscritura = document.getElementById("zona-de-escritura");
const campoMensaje = document.getElementById("campo-mensaje");
const botonEnviar = document.getElementById("boton-enviar");
const contadorCaracteres = document.getElementById("contador-caracteres");

// Constantes de configuración de control
const LIMITE_CARACTERES = 500;
const TIEMPO_LIMITE_MS = 30000;
const PAUSA_ENTRE_ENVIOS_MS = 1500;
const CLAVE_STORAGE_SESION = "agente_marketing_session_id";

// Variables de estado en memoria
let sessionIdEnMemoria = null;
let ultimoEnvioTimestamp = 0;
let enviando = false;

/**
 * Genera un identificador único de sesión y lo persiste de forma segura.
 */
function obtenerSessionId() {
  if (sessionIdEnMemoria) {
    return sessionIdEnMemoria;
  }

  try {
    const guardado = localStorage.getItem(CLAVE_STORAGE_SESION);
    if (guardado) {
      sessionIdEnMemoria = guardado;
      return sessionIdEnMemoria;
    }
  } catch (error) {
    // Si localStorage está bloqueado, se continúa con memoria
  }

  const nuevoId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : "ses-" + Date.now() + "-" + Math.random().toString(36).slice(2, 11);

  sessionIdEnMemoria = nuevoId;

  try {
    localStorage.setItem(CLAVE_STORAGE_SESION, nuevoId);
  } catch (error) {
    // Ignorar error de almacenamiento y mantener en memoria
  }

  return sessionIdEnMemoria;
}

/**
 * Crea y agrega una burbuja de mensaje al chat usando exclusivamente textContent.
 */
function agregarBurbuja(texto, tipo) {
  const articulo = document.createElement("article");
  articulo.className = "mensaje mensaje-" + tipo;

  const parrafo = document.createElement("p");
  parrafo.className = "texto-mensaje";
  parrafo.textContent = texto;

  articulo.appendChild(parrafo);
  listaMensajes.appendChild(articulo);
  listaMensajes.scrollTop = listaMensajes.scrollHeight;

  return articulo;
}

/**
 * Habilita o deshabilita los controles de la zona de escritura.
 */
function alternarControles(deshabilitado) {
  campoMensaje.disabled = deshabilitado;
  botonEnviar.disabled = deshabilitado;
}

/**
 * Actualiza el contador visual de caracteres permitidos.
 */
function actualizarContador() {
  const longitudActual = campoMensaje.value.length;
  contadorCaracteres.textContent = longitudActual + "/" + LIMITE_CARACTERES;
}

/**
 * Extrae el texto de respuesta según las reglas de prioridad del contrato.
 */
function extraerTextoRespuesta(textoCrudo) {
  if (!textoCrudo || textoCrudo.trim() === "") {
    return "(respuesta vacía)";
  }

  try {
    const datos = JSON.parse(textoCrudo);

    if (datos !== null && typeof datos === "object" && !Array.isArray(datos)) {
      const propiedadesPrioridad = ["response", "respuesta", "message", "mensaje"];

      for (const clave of propiedadesPrioridad) {
        if (typeof datos[clave] === "string" && datos[clave].trim() !== "") {
          return datos[clave];
        }
      }

      return "Make respondió, pero sin el campo response";
    }

    return textoCrudo;
  } catch (error) {
    // Si no es JSON válido, devolver el texto recibido tal cual
    return textoCrudo;
  }
}

/**
 * Verifica si la URL del webhook fue configurada correctamente.
 */
function webhookConfigurado() {
  return (
    typeof WEBHOOK_URL === "string" &&
    WEBHOOK_URL.trim() !== "" &&
    !WEBHOOK_URL.includes("ACA VA")
  );
}

/**
 * Envía el mensaje del usuario al webhook de Make y gestiona los estados visuales.
 */
async function procesarEnvio(evento) {
  evento.preventDefault();

  if (enviando) {
    return;
  }

  const mensajeLimpio = campoMensaje.value.trim();

  if (mensajeLimpio === "") {
    return;
  }

  if (mensajeLimpio.length > LIMITE_CARACTERES) {
    agregarBurbuja("El mensaje supera el máximo de 500 caracteres.", "error");
    return;
  }

  // Verificar pausa mínima de 1,5 segundos entre envíos consecutivos
  const ahora = Date.now();
  if (ahora - ultimoEnvioTimestamp < PAUSA_ENTRE_ENVIOS_MS) {
    agregarBurbuja("Esperá un instante antes de enviar otro mensaje.", "error");
    return;
  }

  // Verificar que WEBHOOK_URL esté configurado antes de hacer fetch
  if (!webhookConfigurado()) {
    agregarBurbuja("Falta pegar la URL de tu webhook en config.js", "error");
    return;
  }

  enviando = true;
  ultimoEnvioTimestamp = ahora;

  agregarBurbuja(mensajeLimpio, "usuario");
  campoMensaje.value = "";
  actualizarContador();
  alternarControles(true);

  const burbujaCargando = agregarBurbuja("El agente está pensando...", "cargando");
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), TIEMPO_LIMITE_MS);

  const cuerpoPeticion = JSON.stringify({
    sessionId: obtenerSessionId(),
    mensaje: mensajeLimpio,
    fecha: new Date().toISOString()
  });

  try {
    const respuesta = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: cuerpoPeticion,
      signal: controlador.signal
    });

    const textoRespuesta = await respuesta.text();

    if (!respuesta.ok) {
      agregarBurbuja(
        "Make respondió con error (código " +
          respuesta.status +
          "). Revisá que tu escenario esté en Active o que hayas apretado Run once.",
        "error"
      );
      return;
    }

    const mensajeFinal = extraerTextoRespuesta(textoRespuesta);
    agregarBurbuja(mensajeFinal, "agente");
  } catch (error) {
    if (error.name === "AbortError") {
      agregarBurbuja(
        "Tiempo de espera agotado (30 segundos). El agente tardó demasiado en responder.",
        "error"
      );
    } else {
      agregarBurbuja(
        "Error de red: no se pudo conectar con Make. Verificá tu conexión a internet.",
        "error"
      );
    }
  } finally {
    clearTimeout(temporizador);
    if (burbujaCargando && burbujaCargando.parentNode) {
      burbujaCargando.remove();
    }
    enviando = false;
    alternarControles(false);
    campoMensaje.focus();
  }
}

// Inicialización de sesión y eventos de interfaz
obtenerSessionId();
zonaDeEscritura.addEventListener("submit", procesarEnvio);
campoMensaje.addEventListener("input", actualizarContador);

// Permitir enviar con Enter (y salto de línea con Shift + Enter)
campoMensaje.addEventListener("keydown", (evento) => {
  if (evento.key === "Enter" && !evento.shiftKey) {
    evento.preventDefault();
    zonaDeEscritura.requestSubmit();
  }
});
