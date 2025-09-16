import { createClient } from '@supabase/supabase-js';
import QrScanner from 'qr-scanner';

// Variables de entorno
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;
const N8N_WEBHOOK = import.meta.env.VITE_N8N_WEBHOOK;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// DOM Elements
const loginForm = document.getElementById('login-form');
const mensaje = document.getElementById('mensaje');
const userInfo = document.getElementById('user-info');
const userEmail = document.getElementById('user-email');
const logoutBtn = document.getElementById('logout-btn');
const scannerUI = document.getElementById('scanner-ui');

// Escáner
const video = document.getElementById('qr-video');
const resultDiv = document.getElementById('scan-result');
const loadingDiv = document.getElementById('loading');
const errorDiv = document.getElementById('error');
const studentInfo = document.getElementById('student-info');
const timestampInfo = document.getElementById('timestamp-info');
const errorMessage = document.getElementById('error-message');
const retryBtn = document.getElementById('retry-btn');

let qrScanner = null;
let qrScannerInited = false;

// --- Auth ---
async function checkUser() {
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    loginForm.style.display = 'none';
    userInfo.style.display = '';
    userEmail.textContent = user.email;
    scannerUI.style.display = '';
    mensaje.textContent = '';
    if (!qrScannerInited) {
      setTimeout(initScanner, 200);
    }
  } else {
    loginForm.style.display = '';
    userInfo.style.display = 'none';
    userEmail.textContent = '';
    scannerUI.style.display = 'none';
    mensaje.textContent = '';
    stopScanner();
  }
}
checkUser();

// Login con email/contraseña
loginForm.onsubmit = async (e) => {
  e.preventDefault();
  mensaje.textContent = 'Ingresando...';
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) mensaje.textContent = 'Error: ' + error.message;
  else {
    mensaje.textContent = '';
    checkUser();
  }
};

// Logout
logoutBtn.onclick = async () => {
  await supabase.auth.signOut();
  mensaje.textContent = 'Sesión cerrada';
  checkUser();
};

// Detectar autenticación después de redirección OAuth
supabase.auth.onAuthStateChange((_event, _session) => {
  checkUser();
});

// --- Escáner QR ---
function initScanner() {
  if (qrScannerInited) return;
  if (!video) return;
  qrScannerInited = true;
  qrScanner = new QrScanner(
    video,
    async (result) => { await handleQRScan(result.data); },
    {
      returnDetailedScanResult: true,
      highlightScanRegion: true,
      highlightCodeOutline: true,
      preferredCamera: 'environment'
    }
  );
  qrScanner.start().then(() => {
    console.log('✅ QR Scanner iniciado');
  }).catch(err => {
    showError('Error al iniciar la cámara: ' + err.message);
  });
}

function stopScanner() {
  if (qrScanner) {
    qrScanner.stop();
    qrScannerInited = false;
  }
}

// Procesar QR escaneado
async function handleQRScan(qrData) {
  try {
    let parts = qrData.split('|');
    parts = ["studentId", "classId", "studentName", "className"] // Datos de prueba

    if (parts.length < 4) throw new Error('Código QR inválido. Formato esperado: ID|CLASE|NOMBRE|CURSO');

    const [studentId, classId, studentName, className] = parts;

    qrScanner.stop();
    hideAll();
    loadingDiv.style.display = 'block';

    // Opcional: puedes obtener el usuario autenticado y agregarlo al payload
    const { data: { user } } = await supabase.auth.getUser();

    const payload = {
      student_id: studentId,
      class_id: classId,
      student_name: studentName,
      class_name: className,
      timestamp: new Date().toISOString(),
      user_email: user ? user.email : null,
      source: 'qr_scanner_fast',
      user_agent: navigator.userAgent,
      device_type: /Mobile|Android|iPhone|iPad/.test(navigator.userAgent) ? 'mobile' : 'desktop'
    };

    const response = await fetch(N8N_WEBHOOK, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Source': 'qr-attendance-scanner'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

    hideAll();
    studentInfo.innerHTML = `<strong>${studentName}</strong><br>📚 ${className}`;
    timestampInfo.textContent = `⏰ ${new Date().toLocaleString('es-CL')}`;
    resultDiv.style.display = 'block';

    setTimeout(() => {
      hideAll();
      qrScanner.start();
    }, 3000);

  } catch (error) {
    hideAll();
    showError('Error al registrar asistencia: ' + error.message);
  }
}

// Funciones auxiliares
function hideAll() {
  if(resultDiv) resultDiv.style.display = 'none';
  if(loadingDiv) loadingDiv.style.display = 'none';
  if(errorDiv) errorDiv.style.display = 'none';
}

function showError(message) {
  if(errorMessage) errorMessage.textContent = message;
  if(errorDiv) errorDiv.style.display = 'block';
}

// Botón de reintentar en error
if (retryBtn) {
  retryBtn.onclick = () => {
    hideAll();
    if (qrScanner) qrScanner.start();
  };
}

// Manejar visibilidad de página
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (qrScannerInited && qrScanner) qrScanner.start();
  } else {
    if (qrScannerInited && qrScanner) qrScanner.stop();
  }
});