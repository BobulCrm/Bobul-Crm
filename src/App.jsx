import { useState, useRef, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

// ---  ---SUPABASE CLIENT ----------------------------------------------------------
// Environment variables defined in Vercel (and in .env.local for local dev).
// Using VITE_ prefix makes them available to the client bundle via Vite.
const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;
const STRIPE_PK     = import.meta.env.VITE_STRIPE_PK;
const POSTHOG_KEY   = import.meta.env.VITE_POSTHOG_KEY;
const POSTHOG_HOST  = "https://us.i.posthog.com";

// Helpful early warning if a variable is missing — prevents silent blank-screen bugs.
if(!SUPABASE_URL || !SUPABASE_ANON){
  console.error("⚠ Bobul: faltan variables de entorno VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Revisa la configuración de Vercel o el archivo .env.local.");
}

const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

// ── POSTHOG ANALYTICS ─────────────────────────────────────────────────────────
// Loaded lazily on first user interaction to keep initial bundle fast.
// posthog-js is loaded from CDN to avoid bundling cost.
let posthogInstance = null;
let posthogLoadPromise = null;

const initPostHog = () => {
  if(posthogInstance || posthogLoadPromise) return posthogLoadPromise;
  if(!POSTHOG_KEY){ return Promise.resolve(null); }
  posthogLoadPromise = new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://us.i.posthog.com/static/array.js";
    script.async = true;
    script.onload = () => {
      try {
        // posthog-js is exposed on window after array.js loads
        if(window.posthog && typeof window.posthog.init === "function"){
          window.posthog.init(POSTHOG_KEY, {
            api_host: POSTHOG_HOST,
            person_profiles: "identified_only", // only track identified users by default
            capture_pageview: true,
            capture_pageleave: true,
            // Session Replay with privacy masking
            session_recording: {
              maskAllInputs: true,        // mask all <input> values
              maskTextSelector: "[data-sensitive]", // any element marked as sensitive
            },
            autocapture: true,
            disable_surveys: true,        // no surveys for now
            loaded: (ph) => { posthogInstance = ph; },
          });
          posthogInstance = window.posthog;
        }
      } catch(e) { console.error("PostHog init failed:", e); }
      resolve(posthogInstance);
    };
    script.onerror = () => { console.warn("PostHog failed to load"); resolve(null); };
    document.head.appendChild(script);
  });
  return posthogLoadPromise;
};

// Track an event. Safe to call even if PostHog isn't loaded yet — events are queued.
const track = (event, properties = {}) => {
  try {
    if(!POSTHOG_KEY) return;
    if(!posthogInstance && !posthogLoadPromise) initPostHog();
    if(window.posthog?.capture) window.posthog.capture(event, properties);
  } catch(e) { /* fail silently to never break the app */ }
};

// Identify a logged-in user. Safe to call even before PostHog is loaded.
const identify = (userId, properties = {}) => {
  try {
    if(!POSTHOG_KEY || !userId) return;
    if(!posthogInstance && !posthogLoadPromise) initPostHog();
    if(window.posthog?.identify) window.posthog.identify(userId, properties);
  } catch(e) { /* fail silently */ }
};

// Reset on signout — clears the stored distinct_id so the next user is anonymous.
const resetTracking = () => {
  try { if(window.posthog?.reset) window.posthog.reset(); } catch(e) {}
};

// ---  ---STRIPE CONFIG ------------------------------------------------------------
// STRIPE_PK is defined above from import.meta.env.VITE_STRIPE_PK
const PLANS = {
  pro:   { name:"Pro",          price:159, priceId:"price_1TMK8cDNtsRL2TImZcZOT4DG", maxClients:999, features:["Clientes ilimitados","Historial de actividades","Gestión de tareas","Subir archivos","Exportar CSV","Email y WhatsApp"] },
};

// ---  ---37 PROFESIONES -----------------------------------------------------------
const CATEGORIES = [
  { group:"💻 Tecnología", items:[
    {id:"frontend",label:"Desarrollo web (frontend/backend/fullstack)",icon:"🌐",stages:["Lead","Brief técnico","Cotización","Contrato firmado","Desarrollo","QA / Testing","Deploy","Facturado"]},
    {id:"mobile",label:"Desarrollo de apps móviles",icon:"📱",stages:["Lead","Requerimientos","Propuesta","Contrato","Diseño UI","Desarrollo","Testing","Publicación","Cobro"]},
    {id:"wordpress",label:"WordPress / CMS / Shopify",icon:"🔧",stages:["Lead","Brief","Cotización","Pago inicial","Instalación","Desarrollo","Revisión","Entrega","Cobro final"]},
    {id:"nocode",label:"Automatización e integraciones (APIs / no-code)",icon:"⚙️",stages:["Lead","Diagnóstico","Propuesta","Aprobación","Configuración","Pruebas","Entrega","Soporte","Cobro"]},
    {id:"datascience",label:"Data Science / Análisis de datos",icon:"📊",stages:["Lead","Definición del problema","Propuesta","Contrato","Recolección","Análisis","Modelo","Entrega","Facturado"]},
  ]},
  { group:"🎨 Diseño & Multimedia", items:[
    {id:"grafic",label:"Diseño gráfico",icon:"🎨",stages:["Contacto","Brief","Cotización","Anticipo","Bocetos","Revisión 1","Revisión 2","Aprobación","Cobro final"]},
    {id:"uiux",label:"Diseño UI/UX",icon:"🖥️",stages:["Lead","Discovery","Brief","Cotización","Wireframes","Prototipo","Testing","Entrega","Cobro"]},
    {id:"video",label:"Edición de video y motion graphics",icon:"🎬",stages:["Contacto","Brief creativo","Cotización","Anticipo","Recursos","Edición","Revisión","Entrega","Cobro final"]},
    {id:"illustration",label:"Ilustración y arte digital",icon:"🖌️",stages:["Lead","Brief","Cotización","Anticipo","Boceto inicial","Revisión","Arte final","Entrega","Cobro"]},
    {id:"photo",label:"Fotografía y retoque de imagen",icon:"📸",stages:["Consulta","Cotización","Reserva","Anticipo","Sesión","Selección","Retoque","Entrega","Cobro final"]},
  ]},
  { group:"📣 Marketing Digital", items:[
    {id:"seo",label:"SEO / SEM / Google Ads",icon:"🔍",stages:["Lead","Auditoría","Propuesta","Contrato","Configuración","Implementación","Optimización","Reporte","Renovación"]},
    {id:"socialmedia",label:"Gestión de redes sociales",icon:"📲",stages:["Lead","Diagnóstico","Propuesta","Onboarding","Calendario aprobado","Publicación activa","Reporte mensual","Renovación"]},
    {id:"email",label:"Email marketing y automation",icon:"📧",stages:["Lead","Brief","Propuesta","Configuración","Diseño de secuencias","Pruebas","Lanzamiento","Reporte","Cobro"]},
    {id:"content",label:"Estrategia de contenidos",icon:"📝",stages:["Lead","Diagnóstico","Propuesta","Contrato","Investigación","Estrategia","Implementación","Reporte","Renovación"]},
    {id:"influencer",label:"Influencer marketing",icon:"⭐",stages:["Contacto marca","Brief campaña","Negociación","Contrato","Creación de contenido","Revisión","Publicación","Métricas","Cobro"]},
  ]},
  { group:"✍️ Contenido & Comunicación", items:[
    {id:"copy",label:"Redacción y copywriting",icon:"✍️",stages:["Lead","Brief","Cotización","Anticipo","Investigación","Redacción","Revisión","Aprobación","Cobro"]},
    {id:"contracts",label:"Redacción de contratos",icon:"📄",stages:["Consulta inicial","Definición del alcance","Cotización","Anticipo","Borrador","Revisión cliente","Ajustes","Versión final","Cobro"]},
    {id:"translation",label:"Traducción",icon:"🌍",stages:["Lead","Recepción de documento","Cotización","Aprobación","Traducción","Revisión","Corrección","Entrega","Cobro"]},
    {id:"voiceover",label:"Locución y voz en off",icon:"🎙️",stages:["Contacto","Recepción de guión","Cotización","Anticipo","Grabación","Edición de audio","Revisión","Entrega","Cobro"]},
  ]},
  { group:"📊 Negocios & Administración", items:[
    {id:"va",label:"Asistente virtual / Soporte administrativo",icon:"🗂️",stages:["Lead","Entrevista","Propuesta","Contrato","Onboarding","Activo","Evaluación mensual","Renovación"]},
    {id:"accounting",label:"Contabilidad y finanzas",icon:"💰",stages:["Contacto","Diagnóstico","Propuesta","Contrato","Recopilación de info","Procesamiento","Reporte","Presentación","Cobro"]},
    {id:"hr",label:"Recursos humanos",icon:"👥",stages:["Lead","Brief","Propuesta","Contrato","Relevamiento","Implementación","Seguimiento","Entrega","Cobro"]},
    {id:"research",label:"Investigación de mercados",icon:"🔬",stages:["Lead","Brief","Propuesta","Aprobación","Diseño metodológico","Recolección","Análisis","Informe","Cobro"]},
    {id:"consulting",label:"Gestión de proyectos y consultoría",icon:"🧠",stages:["Lead","Discovery call","Propuesta","Contrato firmado","Diagnóstico","Implementación","Seguimiento","Cierre","Cobro"]},
    {id:"bizbroker",label:"Broker de negocios / Compraventa de empresas",icon:"🤝",stages:["Lead","Llamada exploratoria","NDA firmado","Valuación","Mandato firmado","Listado activo","Compradores interesados","Carta de intención","Due diligence","Negociación final","Cierre","Comisión cobrada"]},
  ]},
  { group:"⚖️ Legal", items:[
    {id:"legal",label:"Legal / Asesoría jurídica independiente",icon:"⚖️",stages:["Consulta inicial","Evaluación del caso","Propuesta de honorarios","Contrato","Investigación legal","Elaboración de documentos","Revisión","Presentación","Cobro"]},
  ]},
  { group:"🏠 Inmobiliario", items:[
    {id:"realestate",label:"Asesor inmobiliario independiente",icon:"🏠",stages:["Lead captado","Calificación","Visita / Presentación","Negociación","Oferta","Due diligence","Firma","Cierre","Comisión cobrada"]},
  ]},
  { group:"🛒 Comercio", items:[
    {id:"commerce",label:"Comerciante / Vendedor independiente",icon:"🛒",stages:["Lead","Contacto","Presentación de producto","Cotización","Negociación","Pedido confirmado","Envío","Entrega","Cobro"]},
  ]},
  { group:"🎓 Educación & Formación", items:[
    {id:"languages",label:"Clases de idiomas",icon:"🗣️",stages:["Lead","Evaluación de nivel","Propuesta","Pago","Clases activas","Seguimiento","Evaluación","Renovación"]},
    {id:"tutoring",label:"Tutoría académica online",icon:"📚",stages:["Lead","Diagnóstico","Propuesta","Pago","Sesiones activas","Seguimiento de progreso","Evaluación final","Renovación"]},
    {id:"courses",label:"Cursos y contenido educativo digital",icon:"🎓",stages:["Idea validada","Guión","Grabación","Edición","Plataforma configurada","Lanzamiento","Ventas activas","Optimización"]},
    {id:"elearning",label:"Diseño instruccional / E-learning",icon:"💡",stages:["Lead","Análisis de necesidades","Propuesta","Contrato","Diseño instruccional","Desarrollo de contenido","Revisión","Publicación","Cobro"]},
  ]},
  { group:"🏥 Salud & Bienestar", items:[
    {id:"psychology",label:"Psicología y coaching online",icon:"🧘",stages:["Consulta inicial","Evaluación","Propuesta de plan","Contrato","Sesiones activas","Seguimiento","Evaluación de progreso","Cierre / Renovación"]},
    {id:"nutrition",label:"Nutrición y planes alimenticios",icon:"🥗",stages:["Lead","Consulta inicial","Evaluación nutricional","Plan personalizado","Seguimiento semana 1","Ajustes","Control mensual","Renovación"]},
    {id:"fitness",label:"Entrenador personal / Fitness online",icon:"💪",stages:["Lead","Evaluación física","Propuesta","Pago","Plan de entrenamiento","Semana activa","Control de progreso","Renovación"]},
    {id:"medicine",label:"Medicina y salud (consultas remotas)",icon:"🏥",stages:["Solicitud de cita","Confirmación","Pago","Consulta","Diagnóstico","Receta / Indicaciones","Seguimiento","Alta"]},
  ]},
  { group:"🏗️ Técnico & Construcción", items:[
    {id:"architecture",label:"Arquitectura y diseño de interiores",icon:"🏛️",stages:["Lead","Visita / Briefing","Cotización","Anticipo","Anteproyecto","Revisión","Proyecto final","Supervisión","Cobro final"]},
    {id:"engineering",label:"Ingeniería y consultoría técnica",icon:"⚙️",stages:["Lead","Diagnóstico técnico","Propuesta","Contrato","Levantamiento","Análisis","Informe técnico","Presentación","Cobro"]},
  ]},
  { group:"💍 Bodas", items:[
    {id:"wedding",label:"Wedding planner",icon:"💍",stages:["Lead","Cita exploratoria","Propuesta","Anticipo","Contrato firmado","Selección de venue","Selección de proveedores","Diseño y decoración","Save the date","Invitaciones","Pruebas (menú/vestido)","Reuniones de seguimiento","Semana del evento","Día del evento","Cierre y feedback","Pago final"]},
  ]},
  { group:"🎉 Eventos", items:[
    {id:"events",label:"Organizador de eventos",icon:"🎉",stages:["Lead","Brief del evento","Cotización","Anticipo","Contrato firmado","Búsqueda de venue","Proveedores confirmados","Diseño y producción","Logística confirmada","Convocatoria / Invitados","Montaje","Día del evento","Desmontaje","Reporte post-evento","Pago final"]},
  ]},
];

const PALETTE = ["#C9A84C","#B8860B","#D4A853","#C17F3A","#A67C52","#BFA47A","#8B6914","#D4956A"];

// ─── THEMES ───────────────────────────────────────────────────────────────────
const THEMES = {
  ivory: {
    name:"☀️ Marfil Dorado", id:"ivory",
    bg:"#F5F0EA", surface:"#FFFFFF", card:"#FAF6F1", cardHover:"#EEE7DC",
    border:"#D8CFC4", text:"#1A1410", textMuted:"#5C4F42", textDim:"#A8998A",
    gold:"#7A5410", goldLight:"#9A6F20", goldDim:"#9A6F2018",
    grad:"linear-gradient(135deg,#9A6F20 0%,#5C3A08 100%)",
    green:"#1F6B3A", red:"#9B2D1F", blue:"#1E4D8C",
  },
  night: {
    name:"🌙 Noche Elegante", id:"night",
    bg:"#0C0A08", surface:"#13110E", card:"#1A1712", cardHover:"#201D18",
    border:"#2C2820", text:"#F0EAD6", textMuted:"#7A6E5F", textDim:"#4A4236",
    gold:"#C9A84C", goldLight:"#E8C96A", goldDim:"#C9A84C20",
    grad:"linear-gradient(135deg,#C9A84C 0%,#8B6914 100%)",
    green:"#7AC98A", red:"#C0614A", blue:"#6A9EC0",
  },
  forest: {
    name:"🌿 Bosque", id:"forest",
    bg:"#F0F4F0", surface:"#FFFFFF", card:"#F5F8F5", cardHover:"#E8F0E8",
    border:"#C8D8C8", text:"#1A2A1A", textMuted:"#4A6A4A", textDim:"#9AB09A",
    gold:"#2D6A2D", goldLight:"#3D8A3D", goldDim:"#2D6A2D18",
    grad:"linear-gradient(135deg,#3D7A3D 0%,#1A4A1A 100%)",
    green:"#2D8A2D", red:"#8A2D2D", blue:"#2D4A8A",
  },
  ocean: {
    name:"🌊 Océano", id:"ocean",
    bg:"#EEF4F8", surface:"#FFFFFF", card:"#F4F8FC", cardHover:"#E4EEF6",
    border:"#C4D8E8", text:"#0A1E2E", textMuted:"#3A6080", textDim:"#8AAAC0",
    gold:"#0A5080", goldLight:"#1A70A0", goldDim:"#0A508018",
    grad:"linear-gradient(135deg,#1A6090 0%,#0A3060 100%)",
    green:"#0A7060", red:"#902030", blue:"#0A50A0",
  },
  rose: {
    name:"🌸 Rosa Editorial", id:"rose",
    bg:"#FBF0F2", surface:"#FFFFFF", card:"#FDF5F7", cardHover:"#F5E4E8",
    border:"#E8C8D0", text:"#2A1018", textMuted:"#7A4050", textDim:"#C0909A",
    gold:"#9A3050", goldLight:"#C04060", goldDim:"#9A305018",
    grad:"linear-gradient(135deg,#B04060 0%,#701030 100%)",
    green:"#4A8A5A", red:"#A02030", blue:"#3050A0",
  },
  carbon: {
    name:"🖤 Carbón", id:"carbon",
    bg:"#1A1A1A", surface:"#242424", card:"#2E2E2E", cardHover:"#383838",
    border:"#404040", text:"#E8E8E8", textMuted:"#909090", textDim:"#505050",
    gold:"#B0B0B0", goldLight:"#D0D0D0", goldDim:"#B0B0B018",
    grad:"linear-gradient(135deg,#C0C0C0 0%,#707070 100%)",
    green:"#60A870", red:"#B05050", blue:"#5080B0",
  },
};
const LEAD_SOURCES = ["Referido","Redes sociales","Sitio web","Google Ads","Email","LinkedIn","Llamada en frío","Evento / Feria","Otro"];
const ACTIVITY_TYPES = ["📞 Llamada","📧 Email","🤝 Reunión","📝 Nota","📋 Propuesta enviada","💰 Pago recibido","⚠️ Seguimiento","✅ Tarea completada","✏️ Otra (personalizada)"];
const TASK_PRIORITIES = ["Alta","Media","Baja"];
const TAGS_OPTIONS = ["VIP","Recurrente","Urgente","En pausa","Potencial alto","Referido","Sin presupuesto"];

const T = {...THEMES.ivory};

const css = `
html,body{max-width:100vw;overflow-x:hidden;}*{box-sizing:border-box;}
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=Jost:wght@300;400;500;600&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
html,body{background:${T.bg};}
::-webkit-scrollbar{width:3px;height:3px;}
::-webkit-scrollbar-thumb{background:${T.border};border-radius:2px;}
@keyframes fadeUp{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:translateY(0);}}
@keyframes fadeIn{from{opacity:0;}to{opacity:1;}}
@keyframes slideR{from{opacity:0;transform:translateX(24px);}to{opacity:1;transform:translateX(0);}}
@keyframes glow{0%,100%{box-shadow:0 0 0px #9A6F2000;}50%{box-shadow:0 0 20px #9A6F2033;}}
.fadeUp{animation:fadeUp .45s cubic-bezier(.22,.68,0,1.2) both;}
.fadeIn{animation:fadeIn .3s ease both;}
.pBtn{transition:all .2s;cursor:pointer;border:none;}
.pBtn:hover{transform:translateY(-1px);filter:brightness(1.1);}
.pBtn:active{transform:translateY(0);filter:brightness(.95);}
.profCard{transition:all .2s;cursor:pointer;border:1px solid ${T.border};}
.profCard:hover{border-color:${T.gold}80!important;background:${T.cardHover}!important;transform:translateY(-1px);}
.clientCard{transition:all .2s;cursor:pointer;}
.clientCard:hover{background:${T.cardHover}!important;border-color:${T.gold}50!important;transform:translateY(-1px);box-shadow:0 4px 16px rgba(44,36,32,.08)!important;}
.rowHover{transition:background .15s;cursor:pointer;}
.rowHover:hover{background:${T.cardHover}!important;}
.tabBtn{transition:all .2s;cursor:pointer;border:none;}
.tabBtn:hover{color:${T.gold}!important;}
input,textarea,select{outline:none;transition:border-color .2s;}
input:focus,textarea:focus,select:focus{border-color:${T.gold}!important;box-shadow:0 0 0 2px ${T.goldDim};}
select option{background:#FFFFFF;color:#2C2420;}
.goldLine{height:1px;background:linear-gradient(90deg,transparent,${T.gold}50,transparent);}
.tag{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:1px;font-size:10px;letter-spacing:.5px;font-family:'Jost',sans-serif;}
`;

const fmt = (n) => `$${Number(n).toLocaleString("es-MX")}`;
const daysSince = (d) => { if(!d) return 0; const diff=Math.floor((new Date()-new Date(d))/86400000); return isNaN(diff)?0:diff; };
const now = () => new Date().toISOString();
const today = () => new Date().toISOString().split("T")[0];
// Returns a Date for the Monday of the week containing the given date
const weekStart = (d) => {
  const x = new Date(d);
  const day = x.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = day === 0 ? -6 : 1 - day; // shift back to Monday
  x.setDate(x.getDate() + diff);
  x.setHours(0,0,0,0);
  return x;
};
const dateToISO = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString("es-MX",{day:"2-digit",month:"short",year:"numeric"}) : "";
const fmtDateTime = (iso) => iso ? new Date(iso).toLocaleDateString("es-MX",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}) : "";

// ── DEVICE IDENTIFICATION (for multi-device login limit) ─────────────────────
// Persistent device id stored in localStorage. If user clears storage, this becomes
// a new device — this is intentional friction against account sharing.
const getDeviceId = () => {
  try {
    let id = localStorage.getItem("bobul_device_id");
    if(!id){
      id = (crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
      localStorage.setItem("bobul_device_id", id);
    }
    return id;
  } catch { return `fallback-${Date.now()}`; }
};

// Human-readable device label from User-Agent (e.g. "Chrome en Windows")
const getDeviceLabel = () => {
  const ua = navigator.userAgent || "";
  let browser = "Navegador";
  if(/Edg\//.test(ua)) browser = "Edge";
  else if(/Chrome\//.test(ua) && !/Chromium/.test(ua)) browser = "Chrome";
  else if(/Firefox\//.test(ua)) browser = "Firefox";
  else if(/Safari\//.test(ua) && !/Chrome/.test(ua)) browser = "Safari";
  else if(/Opera|OPR\//.test(ua)) browser = "Opera";
  let os = "";
  if(/Windows/.test(ua)) os = "Windows";
  else if(/Mac OS X/.test(ua)) os = "Mac";
  else if(/Android/.test(ua)) os = "Android";
  else if(/iPhone|iPad|iPod/.test(ua)) os = "iOS";
  else if(/Linux/.test(ua)) os = "Linux";
  // Detect PWA/standalone mode
  const isStandalone = window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator?.standalone;
  return os ? `${browser} en ${os}${isStandalone?" (App)":""}` : browser;
};

const MAX_DEVICES = 3;

function GL() { return <div className="goldLine"/>; }
function Center({children}){return <div style={{minHeight:"100vh",background:T.bg,display:"flex",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"Jost,sans-serif"}}>{children}</div>;}
function ProgressBar({step,total}){return(<div style={{display:"flex",alignItems:"center",gap:5,marginBottom:24}}>{Array.from({length:total}).map((_,i)=>(<div key={i} style={{height:2,flex:1,borderRadius:1,background:i<step?T.grad:T.border,transition:"all .4s"}}/>))}<span style={{fontSize:10,color:T.textMuted,marginLeft:6,whiteSpace:"nowrap",letterSpacing:1}}>{step}/{total}</span></div>);}
function Label({children}){return <div style={{fontSize:9,color:T.gold,letterSpacing:2,textTransform:"uppercase",marginBottom:6,fontFamily:"Jost,sans-serif"}}>{children}</div>;}
function SectionTitle({children}){return <div style={{fontFamily:"Cormorant Garamond,serif",fontSize:11,letterSpacing:3,color:T.gold,textTransform:"uppercase",marginBottom:8}}>{children}</div>;}

// ---  ---ONBOARDING ---------------------------------------------------------------
function Onboarding({onFinish}){
  const [step,setStep]=useState(0);
  const [prof,setProf]=useState(null);
  const [name,setName]=useState("");
  const [company,setCompany]=useState("");
  const [stages,setStages]=useState([]);
  const [newStage,setNew]=useState("");
  const [search,setSearch]=useState("");
  const [dragIdx,setDragIdx]=useState(null);
  const [overIdx,setOverIdx]=useState(null);
  // Legal consent
  const [privacyAccepted,setPrivacy]=useState(false);
  const [termsAccepted,setTerms]=useState(false);
  const [showPrivacy,setShowPrivacy]=useState(false);
  const [showTerms,setShowTerms]=useState(false);

  const pick=(p)=>{setProf(p);setStages(p.stages.map((s,i)=>({label:s,color:PALETTE[i%PALETTE.length]})));setStep(2);};
  const addStage=()=>{if(!newStage.trim())return;setStages([...stages,{label:newStage.trim(),color:PALETTE[stages.length%PALETTE.length]}]);setNew("");};
  const drop=(toIdx)=>{if(dragIdx===null||dragIdx===toIdx)return;const arr=[...stages];const[item]=arr.splice(dragIdx,1);arr.splice(toIdx,0,item);setStages(arr);setDragIdx(null);setOverIdx(null);};
  const filteredCats=search.trim()===""?CATEGORIES:CATEGORIES.map(c=>({...c,items:c.items.filter(p=>p.label.toLowerCase().includes(search.toLowerCase()))})).filter(c=>c.items.length>0);

  const inputS={width:"100%",background:T.card,border:`1px solid ${T.border}`,borderRadius:2,padding:"11px 14px",color:T.text,fontSize:13,fontFamily:"Jost,sans-serif"};

  if(step===0)return(<Center><div className="fadeUp" style={{textAlign:"center",maxWidth:440}}>
    <div style={{position:"relative",width:80,height:80,margin:"0 auto 28px"}}>
      <div style={{position:"absolute",inset:0,borderRadius:"50%",border:`1px solid ${T.gold}40`,animation:"glow 3s ease infinite"}}/>
      <div style={{position:"absolute",inset:8,borderRadius:"50%",border:`1px solid ${T.gold}60`}}/>
      <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:30,color:T.gold}}>◈</div>
    </div>
    <h1 style={{fontFamily:"Cormorant Garamond,serif",fontSize:88,fontWeight:700,color:T.gold,lineHeight:1,marginBottom:6,letterSpacing:-2}}>Bobul</h1>
    <p style={{fontFamily:"Cormorant Garamond,serif",fontSize:18,fontWeight:400,color:T.textMuted,lineHeight:1.4,marginBottom:6,letterSpacing:1,fontStyle:"italic"}}>Tu CRM Personal</p>
    <p style={{color:T.textMuted,fontSize:13,lineHeight:1.8,marginBottom:36,fontWeight:300}}>Gestión profesional de clientes,<br/>adaptado a tu actividad.</p>
    <button className="pBtn" onClick={()=>setStep(1)} style={{background:T.grad,color:"#0C0A08",padding:"13px 38px",borderRadius:2,fontSize:12,fontWeight:700,letterSpacing:2,textTransform:"uppercase",boxShadow:`0 4px 20px ${T.gold}40`}}>Comenzar</button>
    <div style={{marginTop:16,fontSize:10,color:T.textDim,letterSpacing:1}}>40 categorías · Conforme a buenas prácticas de privacidad</div>
  </div></Center>);

  if(step===1)return(<Center><div className="fadeUp" style={{maxWidth:620,width:"100%"}}>
    <ProgressBar step={1} total={4}/>
    <SectionTitle>Paso 1</SectionTitle>
    <h2 style={{fontFamily:"Cormorant Garamond,serif",fontSize:30,fontWeight:600,color:T.text,marginBottom:6}}>¿A qué te dedicas?</h2>
    <p style={{color:T.textMuted,marginBottom:18,fontSize:13,fontWeight:300}}>Selecciona tu actividad para pre-cargar las etapas de venta.</p>
    <div style={{position:"relative",marginBottom:14}}>
      <span style={{position:"absolute",left:11,top:"50%",transform:"translateY(-50%)",color:T.textMuted,fontSize:12}}>◎</span>
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar actividad..." style={{...inputS,padding:"10px 12px 10px 30px"}}/>
    </div>
    <div style={{maxHeight:"52vh",overflowY:"auto",paddingRight:4}}>
      {filteredCats.map(cat=>(<div key={cat.group} style={{marginBottom:18}}>
        <div style={{fontSize:9,color:T.gold,fontWeight:600,letterSpacing:2,textTransform:"uppercase",marginBottom:7,paddingBottom:5,borderBottom:`1px solid ${T.border}`}}>{cat.group}</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
          {cat.items.map(p=>(<button key={p.id} className="profCard pBtn" onClick={()=>pick(p)} style={{background:T.card,borderRadius:2,padding:"10px 13px",display:"flex",alignItems:"center",gap:9,color:T.text,textAlign:"left"}}>
            <span style={{fontSize:18,flexShrink:0}}>{p.icon}</span>
            <span style={{fontSize:12,lineHeight:1.3,fontFamily:"Jost,sans-serif"}}>{p.label}</span>
          </button>))}
        </div>
      </div>))}
    </div>

    {/* Custom profession option */}
    <div style={{borderTop:`1px solid ${T.border}`,marginTop:8,paddingTop:14}}>
      <div style={{fontSize:10,color:T.textMuted,marginBottom:8,textAlign:"center",letterSpacing:.5}}>¿No encuentras tu actividad?</div>
      <button className="profCard pBtn" onClick={()=>{setProf({id:"custom",label:"Actividad personalizada",icon:"✏️",stages:[]});setStages([]);setStep(2);}} style={{width:"100%",background:"transparent",borderRadius:2,padding:"11px 14px",display:"flex",alignItems:"center",justifyContent:"center",gap:9,color:T.gold,border:`1px dashed ${T.gold}60`,textAlign:"center"}}>
        <span style={{fontSize:18}}>✏️</span>
        <span style={{fontSize:13,fontFamily:"Jost,sans-serif",fontWeight:500}}>Crear mi propia actividad y etapas desde cero</span>
      </button>
    </div>
  </div></Center>);

  if(step===2)return(<Center><div className="fadeUp" style={{maxWidth:440}}>
    <ProgressBar step={2} total={4}/>
    <div style={{fontSize:32,marginBottom:8}}>{prof?.icon}</div>
    <SectionTitle>Paso 2</SectionTitle>
    <h2 style={{fontFamily:"Cormorant Garamond,serif",fontSize:30,fontWeight:600,color:T.text,marginBottom:6}}>¿Cómo te llamas?</h2>
    <p style={{color:T.textMuted,marginBottom:22,fontSize:13,fontWeight:300}}>Esta información aparecerá en tu aviso de privacidad.</p>
    <div style={{marginBottom:12}}><Label>Tu nombre completo</Label><input autoFocus value={name} onChange={e=>setName(e.target.value)} placeholder="Ej: Ana García" style={inputS}/></div>
    <div style={{marginBottom:22}}><Label>Nombre de tu negocio / estudio (opcional)</Label><input value={company} onChange={e=>setCompany(e.target.value)} placeholder="Ej: Studio Creativo" style={inputS}/></div>
    <div style={{display:"flex",gap:10}}>
      <button className="pBtn" onClick={()=>setStep(1)} style={{background:"transparent",color:T.textMuted,padding:"11px 18px",borderRadius:2,fontSize:11,border:`1px solid ${T.border}`,letterSpacing:1}}>← Atrás</button>
      <button className="pBtn" onClick={()=>setStep(3)} style={{flex:1,background:T.grad,color:"#0C0A08",padding:"11px",borderRadius:2,fontSize:11,fontWeight:700,letterSpacing:2,textTransform:"uppercase"}}>Continuar →</button>
    </div>
  </div></Center>);

  if(step===3)return(<Center><div className="fadeUp" style={{maxWidth:500,width:"100%"}}>
    <ProgressBar step={3} total={4}/>
    <SectionTitle>Paso 3</SectionTitle>
    <h2 style={{fontFamily:"Cormorant Garamond,serif",fontSize:30,fontWeight:600,color:T.text,marginBottom:6}}>Tus etapas de venta</h2>
    {prof?.id==="custom"
      ? <p style={{color:T.textMuted,marginBottom:18,fontSize:13,fontWeight:300}}>Crea las etapas de tu proceso de venta desde cero.</p>
      : <p style={{color:T.textMuted,marginBottom:18,fontSize:13,fontWeight:300}}>Pre-cargadas para <em style={{color:T.text}}>{prof?.label}</em>. Edítalas o reordénalas.</p>
    }
    <div style={{maxHeight:"40vh",overflowY:"auto",marginBottom:10,paddingRight:4}}>
      {stages.length===0&&prof?.id==="custom"&&(
        <div style={{textAlign:"center",padding:"20px 0",color:T.textDim,fontSize:12,border:`1px dashed ${T.border}`,borderRadius:2,marginBottom:8}}>
          <div style={{fontSize:22,marginBottom:6}}>✏️</div>
          Agrega tus etapas abajo.<br/>
          <span style={{fontSize:11,color:T.textMuted}}>Ej: Lead → Propuesta → Negociación → Cobro</span>
        </div>
      )}
      {stages.map((s,i)=>(<div key={i} draggable onDragStart={()=>setDragIdx(i)} onDragOver={e=>{e.preventDefault();setOverIdx(i);}} onDrop={()=>drop(i)} onDragEnd={()=>{setDragIdx(null);setOverIdx(null);}} style={{display:"flex",alignItems:"center",gap:9,padding:"9px 12px",background:overIdx===i?T.cardHover:T.card,border:`1px solid ${overIdx===i?T.gold+"80":T.border}`,borderRadius:2,marginBottom:5,cursor:"grab",opacity:dragIdx===i?0.3:1,transition:"all .15s"}}>
        <span style={{color:T.textDim,fontSize:12}}>⠿</span>
        <div style={{width:6,height:6,borderRadius:"50%",background:s.color,flexShrink:0}}/>
        <span style={{flex:1,fontSize:13,color:T.text,fontFamily:"Jost,sans-serif"}}>{s.label}</span>
        <span style={{fontSize:10,color:T.textMuted}}>{String(i+1).padStart(2,"0")}</span>
        <button className="pBtn" onClick={()=>setStages(stages.filter((_,idx)=>idx!==i))} style={{background:"transparent",color:T.red,fontSize:15,padding:"0 3px"}}>×</button>
      </div>))}
    </div>
    <div style={{display:"flex",gap:7,marginBottom:22}}>
      <input value={newStage} onChange={e=>setNew(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addStage()} placeholder="+ Escribe el nombre de la etapa y presiona Enter..." style={{...inputS,flex:1,padding:"9px 12px"}}/>
      <button className="pBtn" onClick={addStage} style={{background:T.card,border:`1px solid ${T.border}`,color:T.gold,padding:"9px 14px",borderRadius:2,fontSize:17}}>+</button>
    </div>
    <div style={{display:"flex",gap:10}}>
      <button className="pBtn" onClick={()=>setStep(2)} style={{background:"transparent",color:T.textMuted,padding:"11px 18px",borderRadius:2,fontSize:11,border:`1px solid ${T.border}`,letterSpacing:1}}>← Atrás</button>
      <button className="pBtn" onClick={()=>setStep(4)} style={{flex:1,background:T.grad,color:"#0C0A08",padding:"11px",borderRadius:2,fontSize:11,fontWeight:700,letterSpacing:2,textTransform:"uppercase"}}>Continuar →</button>
    </div>
  </div></Center>);

  // Step 4: Legal consent
  if(step===4)return(<Center><div className="fadeUp" style={{maxWidth:480}}>
    <ProgressBar step={4} total={4}/>
    <SectionTitle>Paso 4 — Legal</SectionTitle>
    <h2 style={{fontFamily:"Cormorant Garamond,serif",fontSize:30,fontWeight:600,color:T.text,marginBottom:6}}>Aviso de Privacidad</h2>
    <p style={{color:T.textMuted,marginBottom:22,fontSize:13,fontWeight:300,lineHeight:1.7}}>Al usar este CRM, tú eres el responsable de los datos de tus clientes. Lee y acepta los términos antes de continuar.</p>

    <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:2,padding:18,marginBottom:16}}>
      <div style={{fontSize:11,color:T.gold,letterSpacing:1,marginBottom:10,fontWeight:600}}>◈ AVISO DE PRIVACIDAD RESUMIDO</div>
      <div style={{fontSize:12,color:T.textMuted,lineHeight:1.8}}>
        <strong style={{color:T.text}}>Responsable:</strong> {name||"El titular de esta cuenta"}{company?` · ${company}`:""}<br/>
        <strong style={{color:T.text}}>Finalidad:</strong> Gestión comercial, seguimiento de clientes y proyectos.<br/>
        <strong style={{color:T.text}}>Datos recopilados:</strong> Nombre, email, teléfono, empresa, notas de contacto.<br/>
        <strong style={{color:T.text}}>Transferencia:</strong> Los datos no se comparten con terceros sin consentimiento.<br/>
        <strong style={{color:T.text}}>Derechos ARCO:</strong> Tus clientes pueden solicitar acceso, rectificación, cancelación u oposición de sus datos en cualquier momento.<br/>
        <strong style={{color:T.text}}>Almacenamiento:</strong> Los datos se conservan durante la relación comercial y hasta 2 años después.
      </div>
      <button className="pBtn" onClick={()=>setShowPrivacy(true)} style={{marginTop:10,background:"transparent",color:T.gold,fontSize:11,letterSpacing:1,textDecoration:"underline",padding:0}}>Ver aviso completo →</button>
    </div>

    <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:2,padding:18,marginBottom:22}}>
      <div style={{fontSize:11,color:T.gold,letterSpacing:1,marginBottom:10,fontWeight:600}}>◈ TÉRMINOS DE USO</div>
      <div style={{fontSize:12,color:T.textMuted,lineHeight:1.8}}>
        Este CRM es una herramienta de gestión interna. El usuario es responsable del uso adecuado de los datos almacenados, del cumplimiento de la legislación de privacidad aplicable en su país, y de obtener el consentimiento de sus clientes al recopilar sus datos.
      </div>
      <button className="pBtn" onClick={()=>setShowTerms(true)} style={{marginTop:10,background:"transparent",color:T.gold,fontSize:11,letterSpacing:1,textDecoration:"underline",padding:0}}>Ver términos completos →</button>
    </div>

    <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:22}}>
      <label style={{display:"flex",alignItems:"flex-start",gap:10,cursor:"pointer"}}>
        <div onClick={()=>setPrivacy(!privacyAccepted)} style={{width:18,height:18,borderRadius:1,border:`1px solid ${privacyAccepted?T.gold:T.border}`,background:privacyAccepted?T.gold+"20":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1,cursor:"pointer",transition:"all .2s"}}>
          {privacyAccepted&&<span style={{color:T.gold,fontSize:12}}>✓</span>}
        </div>
        <span style={{fontSize:12,color:T.textMuted,lineHeight:1.6}}>He leído y acepto el <strong style={{color:T.text}}>Aviso de Privacidad</strong> y me comprometo a tratar los datos de mis clientes de forma responsable.</span>
      </label>
      <label style={{display:"flex",alignItems:"flex-start",gap:10,cursor:"pointer"}}>
        <div onClick={()=>setTerms(!termsAccepted)} style={{width:18,height:18,borderRadius:1,border:`1px solid ${termsAccepted?T.gold:T.border}`,background:termsAccepted?T.gold+"20":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1,cursor:"pointer",transition:"all .2s"}}>
          {termsAccepted&&<span style={{color:T.gold,fontSize:12}}>✓</span>}
        </div>
        <span style={{fontSize:12,color:T.textMuted,lineHeight:1.6}}>Acepto los <strong style={{color:T.text}}>Términos de Uso</strong> y entiendo que soy responsable del cumplimiento legal en mi jurisdicción.</span>
      </label>
    </div>

    <div style={{display:"flex",gap:10}}>
      <button className="pBtn" onClick={()=>setStep(3)} style={{background:"transparent",color:T.textMuted,padding:"11px 18px",borderRadius:2,fontSize:11,border:`1px solid ${T.border}`,letterSpacing:1}}>← Atrás</button>
      <button className="pBtn" onClick={()=>privacyAccepted&&termsAccepted&&onFinish({name,company,profession:prof,stages})} style={{flex:1,background:privacyAccepted&&termsAccepted?T.grad:"#2a2a2a",color:privacyAccepted&&termsAccepted?"#0C0A08":T.textDim,padding:"11px",borderRadius:2,fontSize:11,fontWeight:700,letterSpacing:2,textTransform:"uppercase",boxShadow:privacyAccepted&&termsAccepted?`0 4px 24px ${T.gold}30`:"none",cursor:privacyAccepted&&termsAccepted?"pointer":"not-allowed"}}>
        Crear mi CRM ◈
      </button>
    </div>

    {/* Privacy Modal */}
    {showPrivacy&&<div style={{position:"fixed",inset:0,background:"rgba(44,36,32,.6)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setShowPrivacy(false)}>
      <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:2,padding:28,maxWidth:560,maxHeight:"80vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
        <div style={{fontFamily:"Cormorant Garamond,serif",fontSize:22,fontWeight:600,color:T.text,marginBottom:16}}>Aviso de Privacidad Completo</div>
        <div style={{fontSize:12,color:T.textMuted,lineHeight:2}}>
          <strong style={{color:T.text}}>1. Identidad del Responsable</strong><br/>Los datos son gestionados por el titular de esta cuenta de CRM, quien actúa como responsable del tratamiento.<br/><br/>
          <strong style={{color:T.text}}>2. Finalidad del Tratamiento</strong><br/>Los datos personales se recopilan para: gestión de la relación comercial, seguimiento de proyectos, comunicación sobre servicios, emisión de cotizaciones y facturas.<br/><br/>
          <strong style={{color:T.text}}>3. Datos Recopilados</strong><br/>Nombre completo, correo electrónico, teléfono, empresa, dirección, fuente de contacto, notas de interacciones comerciales.<br/><br/>
          <strong style={{color:T.text}}>4. Base Legal</strong><br/>El tratamiento se basa en la ejecución de una relación contractual o precontractual y el interés legítimo comercial.<br/><br/>
          <strong style={{color:T.text}}>5. Transferencia de Datos</strong><br/>Los datos no se ceden a terceros salvo obligación legal. En caso de usar servicios de terceros (email, facturación), se informará explícitamente.<br/><br/>
          <strong style={{color:T.text}}>6. Derechos ARCO</strong><br/>Los titulares pueden ejercer derechos de Acceso, Rectificación, Cancelación y Oposición contactando directamente al responsable. El plazo de respuesta es de 20 días hábiles.<br/><br/>
          <strong style={{color:T.text}}>7. Conservación de Datos</strong><br/>Los datos se conservarán durante la relación comercial y un máximo de 2 años adicionales para fines de auditoría.
        </div>
        <button className="pBtn" onClick={()=>setShowPrivacy(false)} style={{marginTop:18,background:T.grad,color:"#0C0A08",padding:"9px 22px",borderRadius:2,fontSize:11,fontWeight:700,letterSpacing:2,textTransform:"uppercase"}}>Cerrar</button>
      </div>
    </div>}

    {/* Terms Modal */}
    {showTerms&&<div style={{position:"fixed",inset:0,background:"rgba(44,36,32,.6)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setShowTerms(false)}>
      <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:2,padding:28,maxWidth:560,maxHeight:"80vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
        <div style={{fontFamily:"Cormorant Garamond,serif",fontSize:22,fontWeight:600,color:T.text,marginBottom:16}}>Términos de Uso</div>
        <div style={{fontSize:12,color:T.textMuted,lineHeight:2}}>
          <strong style={{color:T.text}}>1. Uso Permitido</strong><br/>Este CRM está diseñado para uso comercial legítimo. Queda prohibido su uso para actividades ilegales, spam o tratamiento de datos sin consentimiento.<br/><br/>
          <strong style={{color:T.text}}>2. Responsabilidad del Usuario</strong><br/>El usuario es el único responsable de los datos que ingresa al sistema y de obtener el consentimiento necesario de sus contactos.<br/><br/>
          <strong style={{color:T.text}}>3. Cumplimiento Legal</strong><br/>El usuario se compromete a cumplir con la legislación de protección de datos aplicable en su país (GDPR, LFPDPPP, u otras).<br/><br/>
          <strong style={{color:T.text}}>4. Seguridad</strong><br/>El usuario es responsable de mantener la confidencialidad de su acceso y de no compartir credenciales con personas no autorizadas.<br/><br/>
          <strong style={{color:T.text}}>5. Minimización de Datos</strong><br/>Se recomienda recopilar únicamente los datos estrictamente necesarios para los fines comerciales declarados.<br/><br/>
          <strong style={{color:T.text}}>6. Limitación de Responsabilidad</strong><br/>El proveedor del CRM no se hace responsable por el uso indebido de los datos por parte del usuario.
        </div>
        <button className="pBtn" onClick={()=>setShowTerms(false)} style={{marginTop:18,background:T.grad,color:"#0C0A08",padding:"9px 22px",borderRadius:2,fontSize:11,fontWeight:700,letterSpacing:2,textTransform:"uppercase"}}>Cerrar</button>
      </div>
    </div>}
  </div></Center>);
}

// ---  ---CRM MAIN -----------------------------------------------------------------
function CRM({config,user,supabase,plan,subscriptionEnd,themeId,onThemeChange,onUpgrade,onReset,onSignOut}){
  const {name,company,profession,stages:cfgStages}=config;

  // Check if subscription expired
  const isExpired = subscriptionEnd && new Date() > new Date(subscriptionEnd);
  const STAGES=cfgStages.map(s=>s.label);
  const COLORS=Object.fromEntries(cfgStages.map(s=>[s.label,s.color]));
  const sc=(stage)=>COLORS[stage]||T.gold;

  // Active workspace = current profession id. Filter all data views by this.
  // Clients/events without a profession_id (legacy) are treated as belonging to the current one.
  const currentProfId = profession?.id || null;

  const [clients,setClients]=useState([]);
  const [view,setView]=useState("kanban");
  const [showForm,setShowForm]=useState(false);
  const [editing,setEditing]=useState(null);
  const [selected,setSelected]=useState(null);
  const [detailTab,setDetailTab]=useState("info"); // info|activity|tasks
  const [filterStage,setFilterStage]=useState("all");
  const [filterTag,setFilterTag]=useState("all");
  const [dragOver,setDragOver]=useState(null);
  const [dragging,setDragging]=useState(null);
  const [notif,setNotif]=useState(null);
  const [dbLoading,setDbLoading]=useState(false);
  // Settings
  const [showSettings,setShowSettings]=useState(false);
  const [settTab,setSettTab]=useState("perfil");
  const [settName,setSettName]=useState(name||"");
  const [settCompany,setSettCompany]=useState(company||"");
  const [settStages,setSettStages]=useState(()=>cfgStages.map(s=>({...s})));
  const [settNewStage,setSettNewStage]=useState("");
  const [settDragIdx,setSettDragIdx]=useState(null);
  const [settOverIdx,setSettOverIdx]=useState(null);
  const [settProf,setSettProf]=useState(profession);
  const [settSearchProf,setSettSearchProf]=useState("");
  // Calendar
  const [calView,setCalView]=useState("month");
  const [calDate,setCalDate]=useState(new Date());
  const [showEventForm,setShowEventForm]=useState(false);
  const [editingEvent,setEditingEvent]=useState(null);
  const [events,setEvents]=useState([]);
  const [conflictInfo,setConflictInfo]=useState(null); // { overlapping: [...events] } when save is blocked by a conflict

  // ── WORKSPACE FILTER ──────────────────────────────────────────────────────
  // visibleClients/visibleEvents = subset belonging to the current profession.
  // Items without professionId (pre-migration legacy) are treated as belonging to current.
  const visibleClients = clients.filter(c => !c.professionId || c.professionId === currentProfId);
  const visibleEvents  = events.filter(e => !e.professionId || e.professionId === currentProfId);

  // ── NOTIFICATIONS ─────────────────────────────────────────────────────────
  const requestNotificationPermission = async () => {
    if(!("Notification" in window)) return;
    if(Notification.permission === "default") {
      await Notification.requestPermission();
    }
  };

  const scheduleNotification = (event) => {
    if(!("Notification" in window) || Notification.permission !== "granted") return;
    if(!event.date || !event.time) return;
    const eventTime = new Date(`${event.date}T${event.time}`);
    const now = new Date();
    // 15 minutes before
    const notifTime15 = eventTime.getTime() - 15 * 60 * 1000;
    // At event time
    const notifTimeExact = eventTime.getTime();
    const delay15 = notifTime15 - now.getTime();
    const delayExact = notifTimeExact - now.getTime();
    if(delay15 > 0) {
      setTimeout(()=>{
        new Notification("⏰ Bobul — Evento en 15 min", {
          body: `${event.title} a las ${event.time}`,
          icon: "/public/favicon.svg",
          tag: `bobul-${event.id}-15`,
        });
      }, delay15);
    }
    if(delayExact > 0 && delayExact < 24*60*60*1000) {
      setTimeout(()=>{
        new Notification("🔔 Bobul — Evento ahora", {
          body: `${event.title}`,
          icon: "/public/favicon.svg",
          tag: `bobul-${event.id}-now`,
        });
      }, delayExact);
    }
  };
  const [eventForm,setEventForm]=useState({title:"",date:today(),time:"10:00",duration:60,type:"Llamada",clientId:"",notes:""});
  const [installPromptCRM,setInstallPromptCRM]=useState(null);
  const [showMobileMenu,setShowMobileMenu]=useState(false);
  const [showImport,setShowImport]=useState(false);
  const [globalSearchOpen,setGlobalSearchOpen]=useState(false);
  const [globalSearchQuery,setGlobalSearchQuery]=useState("");
  const [showCategoryTip,setShowCategoryTip]=useState(false);
  const [showSubscription,setShowSubscription]=useState(false);
  const [installedCRM,setInstalledCRM]=useState(window.matchMedia("(display-mode: standalone)").matches);

  useEffect(()=>{
    const handler=(e)=>{e.preventDefault();setInstallPromptCRM(e);};
    window.addEventListener("beforeinstallprompt",handler);
    window.addEventListener("appinstalled",()=>setInstalledCRM(true));
    return()=>window.removeEventListener("beforeinstallprompt",handler);
  },[]);

  const handleInstallCRM=async()=>{
    if(!installPromptCRM)return;
    installPromptCRM.prompt();
    const{outcome}=await installPromptCRM.userChoice;
    if(outcome==="accepted")setInstalledCRM(true);
    setInstallPromptCRM(null);
  };

  // ---  ---Load clients from Supabase on mount
  useEffect(()=>{
    if(!supabase||!user)return;
    setDbLoading(true);
    // Request notification permission
    requestNotificationPermission();
    // Load events
    supabase.from("events").select("*").eq("user_id",user.id).then(({data})=>{
      if(data){
        const loaded = data.map(e=>({
          id:String(e.id),title:e.title,date:e.date,time:e.time,
          duration:e.duration||60,
          type:e.type,clientId:e.client_id,notes:e.notes||"",
          professionId:e.profession_id,
        }));
        setEvents(loaded);
        // Schedule notifications for all future events
        loaded.forEach(e=>scheduleNotification(e));
      }
    });
    supabase.from("clients").select("*").eq("user_id",user.id).order("created_at",{ascending:false})
      .then(({data,error})=>{
        if(data){
          setClients(data.map(r=>({
            ...r,
            tags:r.tags||[],activities:r.activities||[],
            tasks:r.tasks||[],files:r.files||[],stageHistory:r.stage_history||[],
            expectedClose:r.expected_close,lastContact:r.last_contact,
            privacyConsent:r.privacy_consent,
            professionId:r.profession_id,
          })));
        }
        setDbLoading(false);
      });
  },[supabase,user]);

  // Activity
  const [actType,setActType]=useState(ACTIVITY_TYPES[0]);
  const [customActType,setCustomActType]=useState("");
  const [actNote,setActNote]=useState("");
  // Task
  const [taskTitle,setTaskTitle]=useState("");
  const [taskDue,setTaskDue]=useState(today());
  const [taskPriority,setTaskPriority]=useState("Media");

  const blankForm=()=>({
    name:"",company:"",email:"",phone:"",address:"",
    value:"",stage:STAGES[0],source:"",tags:[],
    notes:"",expectedClose:today(),currency:"MXN",
    privacyConsent:false, activities:[], tasks:[],
    createdAt:now(), stageHistory:[{stage:STAGES[0],date:now()}],
  });
  const [form,setForm]=useState(blankForm());

  const showN=(m)=>{setNotif(m);setTimeout(()=>setNotif(null),2600);};

  // ── ERROR HANDLING FOR SUPABASE MUTATIONS ────────────────────────────────
  // Returns true if the error looks like a transient network issue worth retrying.
  const isNetworkError = (err) => {
    if(!err) return false;
    const msg = (err.message || err.toString() || "").toLowerCase();
    return msg.includes("fetch") || msg.includes("network") || msg.includes("timeout") ||
           msg.includes("failed to fetch") || msg.includes("aborted") || err.code === "PGRST301";
  };

  // Humanized error messages for common Supabase/PostgREST errors.
  const humanizeError = (err) => {
    if(!err) return "Error desconocido";
    if(isNetworkError(err)) return "⚠ Sin conexión. Revisa tu internet e intenta de nuevo";
    const code = err.code || "";
    const msg = (err.message || "").toLowerCase();
    if(code === "23505" || msg.includes("duplicate")) return "⚠ Ese registro ya existe";
    if(code === "42501" || msg.includes("row-level security") || msg.includes("rls")) return "⚠ No tienes permiso para esta acción";
    if(code === "23503") return "⚠ No se puede completar: hay datos relacionados";
    if(code === "23502") return "⚠ Falta información requerida";
    if(msg.includes("jwt") || msg.includes("expired")) return "⚠ Tu sesión expiró. Recarga la página";
    return `⚠ Error al guardar${err.message?`: ${err.message.slice(0,80)}`:""}`;
  };

  // Runs a Supabase operation with retry-on-network-error and user-friendly error toasts.
  // `operation` is a function that returns a promise (typically a supabase query).
  // If it resolves with { error }, that's a Supabase error. If it throws, that's a thrown exception.
  // On success: returns { ok: true, data }.
  // On failure: shows a toast, runs onFail() (for rollback), returns { ok: false, error }.
  const trySupabase = async (operation, onFail) => {
    const maxRetries = 2;
    let lastError = null;
    for(let attempt = 0; attempt <= maxRetries; attempt++){
      try{
        const result = await operation();
        if(result && result.error){
          lastError = result.error;
          if(isNetworkError(result.error) && attempt < maxRetries){
            await new Promise(r => setTimeout(r, 1500));
            continue;
          }
          break;
        }
        return { ok: true, data: result?.data ?? null };
      } catch(e){
        lastError = e;
        if(isNetworkError(e) && attempt < maxRetries){
          await new Promise(r => setTimeout(r, 1500));
          continue;
        }
        break;
      }
    }
    showN(humanizeError(lastError));
    if(onFail) onFail();
    return { ok: false, error: lastError };
  };

  // Save event to state + Supabase. Used by the normal save and by "save anyway" after a conflict.
  const saveEventNow = async (toSave) => {
    // Close modals immediately for UX responsiveness
    setShowEventForm(false);
    setConflictInfo(null);

    if(editingEvent){
      const previousEvent = events.find(e=>e.id===editingEvent.id);
      const updated={...toSave,id:editingEvent.id};
      // Optimistic update
      setEvents(events.map(e=>e.id===editingEvent.id?updated:e));
      showN("◈ Evento actualizado");
      scheduleNotification(updated);
      if(supabase&&user){
        const res = await trySupabase(
          () => supabase.from("events").update({
            title:updated.title,date:updated.date,time:updated.time,
            duration:Number(updated.duration)||60,
            type:updated.type,client_id:updated.clientId||null,notes:updated.notes||""
          }).eq("id",editingEvent.id),
          // Rollback: restore previous event
          () => { if(previousEvent) setEvents(evs => evs.map(e => e.id===editingEvent.id ? previousEvent : e)); }
        );
        if(!res.ok) return;
      }
    } else {
      const newEvent={...toSave,id:String(Date.now()),professionId:currentProfId};
      // Optimistic add
      setEvents([...events,newEvent]);
      showN("◈ Evento agregado");
      scheduleNotification(newEvent);
      if(supabase&&user){
        const res = await trySupabase(
          () => supabase.from("events").insert({
            user_id:user.id,title:newEvent.title,date:newEvent.date,
            time:newEvent.time,duration:Number(newEvent.duration)||60,
            type:newEvent.type,
            client_id:newEvent.clientId||null,notes:newEvent.notes||"",
            profession_id:    currentProfId,
            profession_label: profession?.label,
            profession_icon:  profession?.icon,
          }).select(),
          // Rollback: remove the optimistically-added event
          () => { setEvents(evs => evs.filter(e => e.id !== newEvent.id)); }
        );
        if(res.ok && res.data && res.data[0]){
          setEvents(evs=>evs.map(e=>e.id===newEvent.id?{...e,id:String(res.data[0].id),professionId:res.data[0].profession_id}:e));
        }
      }
    }
  };

  const filtered=visibleClients.filter(c=>{
    const matchS=filterStage==="all"||c.stage===filterStage;
    const matchT=filterTag==="all"||(c.tags||[]).includes(filterTag);
    return matchS&&matchT;
  });

  const pipeline=visibleClients.filter(c=>c.stage!==STAGES[STAGES.length-1]).reduce((s,c)=>s+Number(c.value||0),0);
  const closedV=visibleClients.filter(c=>c.stage===STAGES[STAGES.length-1]).reduce((s,c)=>s+Number(c.value||0),0);
  const pendingTasks=visibleClients.flatMap(c=>(c.tasks||[]).filter(t=>!t.done)).length;

  const toDb=(f)=>({
    user_id:user?.id,
    name:f.name,company:f.company||null,email:f.email||null,
    phone:f.phone||null,address:f.address||null,
    value:Number(f.value||0),currency:f.currency||"USD",
    stage:f.stage,source:f.source||null,
    tags:f.tags||[],notes:f.notes||null,
    expected_close:f.expectedClose||null,last_contact:f.lastContact||null,
    privacy_consent:f.privacyConsent||false,
    activities:f.activities||[],tasks:f.tasks||[],
    files:f.files||[],stage_history:f.stageHistory||[],
    // Workspace tag — preserve existing profession on edit, default to current on create
    profession_id:    f.professionId    || currentProfId,
    profession_label: f.professionLabel || profession?.label,
    profession_icon:  f.professionIcon  || profession?.icon,
  });

  const save=async()=>{
    if(!form.name.trim())return;
    if(editing){
      const updated={...form,value:Number(form.value)};
      if(supabase){
        const res = await trySupabase(
          () => supabase.from("clients").update(toDb(updated)).eq("id",editing.id)
        );
        if(!res.ok) return; // error toast already shown by trySupabase
      }
      setClients(clients.map(c=>c.id===editing.id?updated:c));
      if(selected?.id===editing.id)setSelected(updated);
      showN("◈ Registro actualizado");
    }else{
      if(supabase){
        const res = await trySupabase(
          () => supabase.from("clients").insert(toDb({...form})).select().single()
        );
        if(!res.ok) return;
        const data = res.data;
        const newClient={...form,...data,tags:data.tags||[],activities:[],tasks:[],files:[],stageHistory:[],expectedClose:data.expected_close,lastContact:data.last_contact,privacyConsent:data.privacy_consent,professionId:data.profession_id};
        setClients([newClient,...clients]);
        showN("◈ Cliente registrado");
      } else {
        setClients([...clients,{...form,id:Date.now(),value:Number(form.value),professionId:currentProfId}]);
        showN("◈ Cliente registrado");
      }
    }
    setShowForm(false);setEditing(null);setForm(blankForm());
  };

  const editClient=(c)=>{setForm({...c});setEditing(c);setShowForm(true);};
  const delClient=async(id)=>{
    const previous = clients.find(c=>c.id===id);
    const previousSelected = selected;
    // Optimistic delete
    setClients(clients.filter(c=>c.id!==id));
    setSelected(null);
    showN("Eliminado");
    if(supabase){
      await trySupabase(
        () => supabase.from("clients").delete().eq("id",id),
        // Rollback: restore the client
        () => { if(previous){ setClients(cs => [previous, ...cs]); setSelected(previousSelected); } }
      );
    }
  };

  const moveStage=async(id,stage)=>{
    const previous = clients.find(c=>c.id===id);
    const history=[...(previous?.stageHistory||[]),{stage,date:now()}];
    // Optimistic update
    setClients(clients.map(c=>{
      if(c.id!==id)return c;
      return {...c,stage,stageHistory:history};
    }));
    if(selected?.id===id)setSelected(s=>({...s,stage,stageHistory:history}));
    showN(`→ ${stage}`);
    if(supabase){
      await trySupabase(
        () => supabase.from("clients").update({stage,stage_history:history}).eq("id",id),
        // Rollback to previous stage
        () => {
          if(previous){
            setClients(cs => cs.map(c => c.id===id ? previous : c));
            if(selected?.id===id) setSelected(previous);
          }
        }
      );
    }
  };

  const addActivity=async()=>{
    if(!actNote.trim()||!selected)return;
    const finalType = actType==="✏️ Otra (personalizada)" ? (customActType.trim()||"Otra actividad") : actType;
    const act={id:Date.now(),type:finalType,note:actNote,date:now()};
    const newActivities=[act,...(selected.activities||[])];
    const updated={...selected,activities:newActivities,lastContact:today()};
    const previousSelected = selected;
    // Optimistic update
    setClients(clients.map(c=>c.id===selected.id?updated:c));
    setSelected(updated);
    setActNote("");setCustomActType("");
    showN("◈ Actividad registrada");
    if(supabase){
      await trySupabase(
        () => supabase.from("clients").update({activities:newActivities,last_contact:today()}).eq("id",selected.id),
        () => {
          setClients(cs => cs.map(c => c.id===previousSelected.id ? previousSelected : c));
          setSelected(previousSelected);
        }
      );
    }
  };

  const addTask=async()=>{
    if(!taskTitle.trim()||!selected)return;
    const task={id:Date.now(),title:taskTitle,due:taskDue,priority:taskPriority,done:false,createdAt:now()};
    const newTasks=[...(selected.tasks||[]),task];
    const updated={...selected,tasks:newTasks};
    const previousSelected = selected;
    // Optimistic update
    setClients(clients.map(c=>c.id===selected.id?updated:c));
    setSelected(updated);
    setTaskTitle("");setTaskDue(today());
    showN("◈ Tarea agregada");
    if(supabase){
      await trySupabase(
        () => supabase.from("clients").update({tasks:newTasks}).eq("id",selected.id),
        () => {
          setClients(cs => cs.map(c => c.id===previousSelected.id ? previousSelected : c));
          setSelected(previousSelected);
        }
      );
    }
  };

  const toggleTask=async(taskId)=>{
    if(!selected)return;
    const newTasks=(selected.tasks||[]).map(t=>t.id===taskId?{...t,done:!t.done}:t);
    const updated={...selected,tasks:newTasks};
    const previousSelected = selected;
    // Optimistic update
    setClients(clients.map(c=>c.id===selected.id?updated:c));
    setSelected(updated);
    if(supabase){
      await trySupabase(
        () => supabase.from("clients").update({tasks:newTasks}).eq("id",selected.id),
        () => {
          setClients(cs => cs.map(c => c.id===previousSelected.id ? previousSelected : c));
          setSelected(previousSelected);
        }
      );
    }
  };

  // ---  ---FILES
  const fileInputRef = useRef(null);

  const FILE_CATEGORIES = ["📋 Propuesta","📄 Contrato","🧾 Recibo / Factura","📸 Referencia","📊 Reporte","📝 Documento","🖼️ Diseño","🎬 Video","🔗 Otro"];
  const [fileCategory, setFileCategory] = useState("📋 Propuesta");

  const handleFileUpload = async (e) => {
    if(!selected) return;
    const files = Array.from(e.target.files);
    if(!files.length) return;
    if(!supabase){ showN("⚠ Sin conexión a storage"); return; }
    showN("◈ Subiendo archivo...");
    let failed = 0;
    const newFileObjs = [];
    for(const file of files) {
      const fileId = Date.now() + Math.random();
      const filePath = `${user.id}/${selected.id}/${fileId}_${file.name}`;
      const {error} = await supabase.storage.from("bobul-files").upload(filePath, file, {upsert:true});
      if(error){
        failed++;
        continue;
      }
      newFileObjs.push({
        id: fileId,
        name: file.name,
        size: file.size,
        type: file.type,
        category: fileCategory,
        date: now(),
        path: filePath, // URL is generated on-demand via signed URL (see downloadFile)
      });
    }
    if(newFileObjs.length){
      const updatedFiles = [...(selected.files||[]), ...newFileObjs];
      const updated = {...selected, files: updatedFiles};
      setClients(c => c.map(cl => cl.id===selected.id ? updated : cl));
      setSelected(updated);
      if(selected.id) {
        await supabase.from("clients").update({files: updatedFiles}).eq("id", selected.id);
      }
    }
    if(failed === 0) showN(`◈ ${newFileObjs.length} archivo(s) cargado(s)`);
    else if(newFileObjs.length === 0) showN(`⚠ Error al subir los archivos`);
    else showN(`◈ ${newFileObjs.length} cargado(s), ${failed} fallaron`);
    e.target.value = "";
  };

  const deleteFile = async (fileId) => {
    const fileToDelete = (selected.files||[]).find(f=>f.id===fileId);
    const previousSelected = selected;
    const updatedFiles = (selected.files||[]).filter(f=>f.id!==fileId);
    const updated = {...selected, files: updatedFiles};
    // Optimistic delete
    setClients(clients.map(c=>c.id===selected.id?updated:c));
    setSelected(updated);
    showN("Archivo eliminado");
    if(supabase && selected.id) {
      const res = await trySupabase(
        () => supabase.from("clients").update({files: updatedFiles}).eq("id", selected.id),
        () => {
          setClients(cs => cs.map(c => c.id===previousSelected.id ? previousSelected : c));
          setSelected(previousSelected);
        }
      );
      // Only remove from storage if DB update succeeded
      if(res.ok && fileToDelete?.path) {
        await supabase.storage.from("bobul-files").remove([fileToDelete.path]);
      }
    }
  };

  const downloadFile = async (file) => {
    // Legacy files may still have a url/dataUrl embedded (old uploads)
    const legacy = file.url || file.dataUrl;
    if(legacy && !file.path){
      const a = document.createElement("a");
      a.href = legacy;
      a.download = file.name;
      a.click();
      return;
    }
    if(!file.path || !supabase){ showN("⚠ No se puede abrir este archivo"); return; }
    // Generate a fresh signed URL that forces download via Content-Disposition: attachment.
    // Valid for 5 minutes.
    const {data, error} = await supabase.storage
      .from("bobul-files")
      .createSignedUrl(file.path, 300, { download: file.name });
    if(error || !data?.signedUrl){
      showN("⚠ Error al abrir el archivo");
      return;
    }
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.download = file.name;
    a.click();
  };

  const viewFile = async (file) => {
    const legacy = file.url || file.dataUrl;
    if(legacy && !file.path){
      window.open(legacy, "_blank");
      return;
    }
    if(!file.path || !supabase){ showN("⚠ No se puede abrir este archivo"); return; }
    // iOS Safari blocks window.open() when called after an async await (loses the
    // user gesture context). Workaround: open the tab synchronously first with
    // about:blank, then redirect it once the signed URL is ready.
    const w = window.open("", "_blank");
    const {data, error} = await supabase.storage.from("bobul-files").createSignedUrl(file.path, 300);
    if(error || !data?.signedUrl){
      if(w) w.close();
      showN("⚠ Error al abrir el archivo");
      return;
    }
    if(w){
      w.location.href = data.signedUrl;
    } else {
      // Popup was blocked (e.g. PWA standalone mode on iOS). Fall back to same-tab navigation.
      window.location.href = data.signedUrl;
    }
  };

  const fmtFileSize = (bytes) => {
    if(bytes < 1024) return bytes + " B";
    if(bytes < 1024*1024) return (bytes/1024).toFixed(1) + " KB";
    return (bytes/(1024*1024)).toFixed(1) + " MB";
  };

  const fileIcon = (type) => {
    if(type.includes("pdf")) return "📄";
    if(type.includes("image")) return "🖼️";
    if(type.includes("video")) return "🎬";
    if(type.includes("word")||type.includes("document")) return "📝";
    if(type.includes("sheet")||type.includes("excel")) return "📊";
    if(type.includes("zip")||type.includes("rar")) return "📦";
    return "📎";
  };

  // ── EXPORT HELPERS ──────────────────────────────────────────────────────────
  // Build a CSV string from headers + rows arrays. Quotes/escapes everything safely.
  const buildCSV = (headers, rows) =>
    [headers, ...rows]
      .map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");

  // Trigger a browser download for a string blob
  const downloadBlob = (content, filename, mime = "text/csv;charset=utf-8;") => {
    const blob = new Blob([content], {type: mime});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Build CSV for clients in the active workspace
  const buildClientsCSV = () => {
    const headers = ["Nombre","Empresa","Email","Teléfono","Dirección","Valor","Moneda","Etapa","Fuente","Tags","Notas","Último contacto","Cierre esperado","Creado"];
    const rows = visibleClients.map(c => [
      c.name, c.company || "", c.email || "", c.phone || "", c.address || "",
      c.value || 0, c.currency || "MXN", c.stage, c.source || "",
      (c.tags || []).join(";"), c.notes || "",
      c.lastContact || "", c.expectedClose || "",
      fmtDate(c.createdAt)
    ]);
    return buildCSV(headers, rows);
  };

  // Build CSV for events in the active workspace
  const buildEventsCSV = () => {
    const headers = ["Título","Fecha","Hora","Duración (min)","Tipo","Cliente","Notas"];
    const rows = visibleEvents.map(e => {
      const clientName = e.clientId ? (clients.find(c => c.id == e.clientId)?.name || "") : "";
      return [e.title, e.date, e.time, e.duration || 60, e.type, clientName, e.notes || ""];
    });
    return buildCSV(headers, rows);
  };

  // Build CSV for tasks (denormalized: one row per task across all visible clients)
  const buildTasksCSV = () => {
    const headers = ["Cliente","Tarea","Vencimiento","Prioridad","Estado","Creada"];
    const rows = [];
    for(const c of visibleClients){
      for(const t of (c.tasks || [])){
        rows.push([
          c.name,
          t.title,
          t.due || "",
          t.priority || "",
          t.done ? "Completada" : "Pendiente",
          t.createdAt || "",
        ]);
      }
    }
    return buildCSV(headers, rows);
  };

  // Single-CSV export (one type at a time)
  const exportSingle = (type) => {
    const profSlug = (profession?.label || "workspace").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    const dateStr = today();
    if(type === "clients"){
      downloadBlob(buildClientsCSV(), `bobul_clientes_${profSlug}_${dateStr}.csv`);
      showN(`◈ ${visibleClients.length} cliente(s) exportado(s)`);
    } else if(type === "events"){
      downloadBlob(buildEventsCSV(), `bobul_eventos_${profSlug}_${dateStr}.csv`);
      showN(`◈ ${visibleEvents.length} evento(s) exportado(s)`);
    } else if(type === "tasks"){
      const taskCount = visibleClients.reduce((s,c) => s + (c.tasks||[]).length, 0);
      downloadBlob(buildTasksCSV(), `bobul_tareas_${profSlug}_${dateStr}.csv`);
      showN(`◈ ${taskCount} tarea(s) exportada(s)`);
    }
  };

  // Combined export: 3 CSVs in a single ZIP. Loads JSZip lazily from CDN.
  const exportAll = async () => {
    const profSlug = (profession?.label || "workspace").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    const dateStr = today();
    showN("◈ Preparando exportación...");
    // Lazy-load JSZip
    if(!window.JSZip){
      await new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js";
        s.onload = resolve; s.onerror = reject;
        document.head.appendChild(s);
      }).catch(() => { showN("⚠ No se pudo cargar la librería"); return null; });
    }
    if(!window.JSZip){ showN("⚠ No se pudo cargar la librería de export"); return; }
    const zip = new window.JSZip();
    zip.file(`clientes.csv`, buildClientsCSV());
    zip.file(`eventos.csv`, buildEventsCSV());
    zip.file(`tareas.csv`, buildTasksCSV());
    zip.file(`README.txt`,
`Exportación de Bobul CRM
========================
Workspace: ${profession?.label || "Sin nombre"}
Fecha: ${new Date().toLocaleString("es-MX")}

Archivos incluidos:
- clientes.csv  (${visibleClients.length} registros)
- eventos.csv   (${visibleEvents.length} registros)
- tareas.csv    (${visibleClients.reduce((s,c) => s + (c.tasks||[]).length, 0)} registros)

Estos archivos pueden abrirse en Excel, Google Sheets o cualquier hoja de cálculo.
`);
    const blob = await zip.generateAsync({type: "blob"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `bobul_${profSlug}_${dateStr}.zip`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showN("◈ Exportación completa");
  };

  // Legacy alias for backward compatibility (other parts of the code may call exportCSV)
  const exportCSV = () => exportSingle("clients");

  const [showExport, setShowExport] = useState(false);

  const inputS={width:"100%",background:T.card,border:`1px solid ${T.border}`,borderRadius:2,padding:"9px 12px",color:T.text,fontSize:13,fontFamily:"Jost,sans-serif"};
  const priorityColor={Alta:T.red,Media:T.gold,Baja:T.green};

  // Show expired screen
  if(isExpired) return(
    <div style={{minHeight:"100vh",background:T.bg,display:"flex",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"Jost,sans-serif"}}>
      <div style={{maxWidth:420,width:"100%",textAlign:"center"}}>
        <div style={{fontFamily:"Cormorant Garamond,serif",fontSize:52,fontWeight:700,color:T.gold,marginBottom:4}}>Bobul</div>
        <div style={{fontSize:13,color:T.textMuted,marginBottom:40,fontStyle:"italic",fontFamily:"Cormorant Garamond,serif"}}>Tu CRM personal</div>

        <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:2,padding:32,marginBottom:20}}>
          <div style={{fontSize:40,marginBottom:16}}>🔒</div>
          <div style={{fontFamily:"Cormorant Garamond,serif",fontSize:24,fontWeight:600,color:T.text,marginBottom:8}}>Tu suscripción ha expirado</div>
          <div style={{fontSize:13,color:T.textMuted,lineHeight:1.7,marginBottom:24}}>
            Tu período de acceso ha terminado. Renueva tu suscripción para seguir usando Bobul CRM.<br/><br/>
            <strong style={{color:T.text}}>Tus datos están seguros</strong> — no se elimina nada. Al renovar recuperas acceso inmediatamente.
          </div>
          <button className="pBtn" onClick={onUpgrade} style={{width:"100%",background:T.grad,color:"#fff",padding:"14px",borderRadius:2,fontSize:12,fontWeight:700,letterSpacing:2,textTransform:"uppercase",marginBottom:12,boxShadow:`0 4px 20px ${T.gold}30`}}>
            ⭐ Renovar Plan Pro — $169/mes
          </button>
          <button className="pBtn" onClick={onSignOut} style={{width:"100%",background:"transparent",border:`1px solid ${T.border}`,color:T.textMuted,padding:"11px",borderRadius:2,fontSize:11,letterSpacing:1,textTransform:"uppercase"}}>
            Cerrar sesión
          </button>
        </div>
        <div style={{fontSize:10,color:T.textDim}}>
          ¿Problemas con tu suscripción? Escríbenos a <span style={{color:T.gold}}>soporte@bobulcrm.com</span>
        </div>
      </div>
    </div>
  );

  return(<div style={{minHeight:"100vh",background:T.bg,fontFamily:"Jost,sans-serif",color:T.text,display:"flex",flexDirection:"column"}}>

    {/* -- TOPBAR */}
    <div style={{background:T.surface,borderBottom:`1px solid ${T.border}`,position:"sticky",top:0,zIndex:100}}>

      {/* Fila 1: Logo, Buscar, Filtro, +Nuevo, Menu */}
      <div style={{padding:"0 12px",display:"flex",alignItems:"center",height:50,gap:8}}>

        {/* Logo - izquierda (clickeable: abre el switcher de workspaces) */}
        <div style={{display:"flex",alignItems:"center",gap:7,flexShrink:0,minWidth:0}}>
          <span style={{fontSize:15,color:T.gold,flexShrink:0}}>◈</span>
          <div style={{minWidth:0,cursor:"pointer",display:"flex",alignItems:"center",gap:5}} onClick={()=>setShowCategoryTip(true)}>
            <div style={{minWidth:0}}>
              <div style={{fontFamily:"Cormorant Garamond,serif",fontSize:14,fontWeight:600,color:T.text,lineHeight:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:100}}>{company||name}</div>
              <div style={{fontSize:8,color:T.textMuted,letterSpacing:1,textTransform:"uppercase",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:100}}>{profession?.label?.slice(0,22)}</div>
            </div>
            <span style={{fontSize:9,color:T.gold,marginLeft:1}}>▼</span>
          </div>
        </div>

        {/* Spacer */}
        <div style={{flex:1}}/>

        {/* Controles - derecha, misma altura */}
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <button className="pBtn" onClick={()=>{setGlobalSearchOpen(true);setGlobalSearchQuery("");}} title="Buscar" style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:2,padding:"0 10px",fontSize:14,color:T.textMuted,flexShrink:0,height:32,display:"flex",alignItems:"center"}}>🔍</button>

          <select value={filterStage} onChange={e=>setFilterStage(e.target.value)} style={{background:T.card,border:`1px solid ${T.border}`,color:filterStage==="all"?T.textMuted:T.gold,borderRadius:2,padding:"0 8px",fontSize:11,fontFamily:"Jost,sans-serif",flexShrink:0,maxWidth:110,height:32}}>
            <option value="all">Todas</option>
            {STAGES.map(s=><option key={s}>{s}</option>)}
          </select>

          <button className="pBtn" onClick={()=>{setShowForm(true);setEditing(null);resetForm();}} style={{background:T.grad,color:"#fff",padding:"0 12px",borderRadius:2,fontSize:11,fontWeight:700,letterSpacing:.5,textTransform:"uppercase",flexShrink:0,whiteSpace:"nowrap",height:32,display:"flex",alignItems:"center"}}>+ Nuevo</button>

          <div style={{position:"relative",flexShrink:0}}>
            <button className="pBtn" onClick={()=>setShowMobileMenu(v=>!v)} style={{background:T.card,border:`1px solid ${T.border}`,color:T.textMuted,padding:"0 10px",borderRadius:2,fontSize:17,height:32,display:"flex",alignItems:"center"}}>⋮</button>
            {showMobileMenu&&(<div style={{position:"absolute",top:"110%",right:0,background:T.surface,border:`1px solid ${T.border}`,borderRadius:2,boxShadow:"0 8px 24px rgba(0,0,0,.15)",zIndex:200,minWidth:170,padding:6}} onClick={e=>e.stopPropagation()}>
              <button className="pBtn" onClick={()=>{setShowImport(true);setShowMobileMenu(false);}} style={{display:"block",width:"100%",textAlign:"left",padding:"9px 12px",fontSize:12,color:T.text,background:"transparent",borderRadius:2}}>↑ Importar clientes</button>
              <button className="pBtn" onClick={()=>{setShowExport(true);setShowMobileMenu(false);}} style={{display:"block",width:"100%",textAlign:"left",padding:"9px 12px",fontSize:12,color:T.text,background:"transparent",borderRadius:2}}>↓ Exportar datos</button>
              {"Notification" in window && Notification.permission==="default" && (
                <button className="pBtn" onClick={()=>requestNotificationPermission().then(()=>showN("✅ Notificaciones activadas"))} style={{display:"block",width:"100%",textAlign:"left",padding:"9px 12px",fontSize:12,color:T.gold,background:"transparent",borderRadius:2}}>🔔 Activar notificaciones</button>
              )}
              <button className="pBtn" onClick={()=>{setShowSettings(true);setShowMobileMenu(false);}} style={{display:"block",width:"100%",textAlign:"left",padding:"9px 12px",fontSize:12,color:T.text,background:"transparent",borderRadius:2}}>⚙ Configuración</button>
              <button className="pBtn" onClick={()=>{setShowSubscription(true);setShowMobileMenu(false);}} style={{display:"block",width:"100%",textAlign:"left",padding:"9px 12px",fontSize:12,color:T.text,background:"transparent",borderRadius:2}}>💳 Mi suscripción</button>
              {installPromptCRM&&!installedCRM&&<button className="pBtn" onClick={()=>{handleInstallCRM();setShowMobileMenu(false);}} style={{display:"block",width:"100%",textAlign:"left",padding:"9px 12px",fontSize:12,color:T.gold,background:"transparent",borderRadius:2}}>⬇ Instalar app</button>}
              <div style={{height:1,background:T.border,margin:"4px 0"}}/>
              <button className="pBtn" onClick={()=>onSignOut()} style={{display:"block",width:"100%",textAlign:"left",padding:"9px 12px",fontSize:12,color:T.red,background:"transparent",borderRadius:2}}>↪ Cerrar sesión</button>
            </div>)}
          </div>
        </div>

      </div>

      {/* Fila 2: Vistas */}
      <div style={{display:"flex",borderTop:`1px solid ${T.border}`,overflowX:"auto"}}>
        {[["kanban","Kanban"],["list","Lista"],["stats","Stats"],["tasks",`Tareas${pendingTasks>0?" ("+pendingTasks+")":""}`],["calendar","Agenda"]].map(([v,label])=>(
          <button key={v} className="pBtn" onClick={()=>setView(v)} style={{
            flex:1,padding:"8px 4px",fontSize:10,letterSpacing:.8,textTransform:"uppercase",
            background:"transparent",color:view===v?T.gold:T.textMuted,
            borderBottom:view===v?`2px solid ${T.gold}`:"2px solid transparent",
            fontWeight:view===v?600:400,whiteSpace:"nowrap",
          }}>{label}</button>
        ))}
      </div>
    </div>

    <GL/>

    {/* -- STATS BAR */}
    <div style={{background:T.surface,borderBottom:`1px solid ${T.border}`,padding:"8px 6px",display:"flex",alignItems:"stretch"}}>
      {[
        {label:"Pipeline",value:dbLoading?"...":fmt(pipeline),c:T.gold},
        {label:"Ganado",value:fmt(closedV),c:T.green},
        {label:["Clientes","activos"],value:visibleClients.filter(c=>c.stage!==STAGES[STAGES.length-1]).length,c:T.text},
        {label:["Total","clientes"],value:visibleClients.length,c:T.textMuted},
        {label:["Tareas","pend."],value:pendingTasks,c:pendingTasks>0?T.red:T.textMuted},
      ].map((s,i,arr)=>(
        <div key={i} style={{flex:1,textAlign:"center",padding:"4px 2px",borderRight:i<arr.length-1?`1px solid ${T.border}`:"none"}}>
          <div style={{fontSize:8,color:T.textMuted,textTransform:"uppercase",letterSpacing:1,lineHeight:1.3,minHeight:16}}>
            {Array.isArray(s.label)?<>{s.label[0]}<br/>{s.label[1]}</>:s.label}
          </div>
          <div style={{fontSize:16,fontWeight:600,color:s.c,fontFamily:"Cormorant Garamond,serif",lineHeight:1.2,marginTop:1}}>{s.value}</div>
        </div>
      ))}
    </div>
    <GL/>

    {/* -- CONTENT */}
    <div style={{flex:1,overflow:"auto",overflowX:"hidden",padding:18,maxWidth:"100vw"}}>

      {/* KANBAN */}
      {view==="kanban"&&(<div style={{display:"flex",gap:9,minHeight:"calc(100vh-200px)",maxWidth:"100%",scrollSnapType:"x mandatory",WebkitOverflowScrolling:"touch",overflowX:"auto",paddingBottom:14}}>
        {STAGES.map(stage=>{
          const scs=filtered.filter(c=>c.stage===stage);
          const col=sc(stage);
          const total=scs.reduce((s,c)=>s+Number(c.value||0),0);
          return(<div key={stage} onDragOver={e=>{e.preventDefault();setDragOver(stage);}} onDrop={()=>{if(dragging){moveStage(dragging,stage);setDragging(null);setDragOver(null);}}} onDragLeave={()=>setDragOver(null)} style={{flex:"0 0 calc(85vw)",maxWidth:280,scrollSnapAlign:"start",background:dragOver===stage?T.cardHover:T.surface,borderRadius:2,border:`1px solid ${dragOver===stage?col+"80":T.border}`,display:"flex",flexDirection:"column",transition:"all .2s"}}>
            <div style={{padding:"10px 12px",borderBottom:`1px solid ${T.border}`}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:3}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <div style={{width:5,height:5,borderRadius:"50%",background:col,boxShadow:`0 0 6px ${col}80`}}/>
                  <span style={{fontSize:10,fontWeight:600,color:col,letterSpacing:.5,textTransform:"uppercase"}}>{stage}</span>
                </div>
                <span style={{fontSize:10,background:T.card,border:`1px solid ${T.border}`,padding:"1px 5px",borderRadius:1,color:T.textMuted}}>{scs.length}</span>
              </div>
              {total>0&&<div style={{fontSize:14,color:col,fontFamily:"Cormorant Garamond,serif",fontWeight:600}}>{fmt(total)}</div>}
            </div>
            <div style={{flex:1,overflowY:"auto",padding:7}}>
              {scs.map(client=>(<div key={client.id} className="clientCard" draggable onDragStart={()=>setDragging(client.id)} onClick={()=>{setSelected(client);setDetailTab("info");}} style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:2,padding:"11px",marginBottom:6}}>
                <div style={{fontWeight:500,fontSize:13,marginBottom:2}}>{client.name}</div>
                {client.company&&<div style={{fontSize:10,color:T.textMuted,marginBottom:2}}>{client.company}</div>}
                <div style={{fontSize:11,color:T.textMuted,marginBottom:7}}>{client.email}</div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                  <span style={{fontSize:14,fontWeight:600,color:col,fontFamily:"Cormorant Garamond,serif"}}>{fmt(client.value||0)}</span>
                  <span style={{fontSize:10,color:daysSince(client.lastContact||client.createdAt)>7?T.red:T.textDim}}>{daysSince(client.lastContact||client.createdAt)}d</span>
                </div>
                {(client.tags||[]).length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:3,marginTop:4}}>
                  {client.tags.slice(0,2).map(tag=>(<span key={tag} className="tag" style={{background:`${T.gold}15`,color:T.gold,border:`1px solid ${T.gold}30`}}>{tag}</span>))}
                </div>}
                {(client.tasks||[]).filter(t=>!t.done).length>0&&<div style={{fontSize:10,color:T.blue,marginTop:4}}>⊡ {(client.tasks||[]).filter(t=>!t.done).length} tarea(s)</div>}
                {/* Mini contact icons */}
                <div style={{display:"flex",gap:5,marginTop:6}}>
                  {client.email&&<a href={`mailto:${client.email}`} onClick={e=>e.stopPropagation()} title="Enviar email" style={{fontSize:13,color:T.blue,textDecoration:"none",opacity:.7,transition:"opacity .2s"}} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=.7}>✉</a>}
                  {client.phone&&<a href={`https://wa.me/${client.phone.replace(/\D/g,"")}`} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} title="WhatsApp" style={{fontSize:13,color:"#25D366",textDecoration:"none",opacity:.7,transition:"opacity .2s"}} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=.7}>💬</a>}
                  {client.phone&&<a href={`tel:${client.phone.replace(/\s/g,"")}`} onClick={e=>e.stopPropagation()} title="Llamar" style={{fontSize:13,color:T.green,textDecoration:"none",opacity:.7,transition:"opacity .2s"}} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=.7}>📞</a>}
                </div>
              </div>))}
              {scs.length===0&&<div style={{textAlign:"center",padding:"28px 0",color:T.textDim,fontSize:20}}>—</div>}
            </div>
          </div>);
        })}
      </div>)}

      {/* LIST */}
      {view==="list"&&(<div style={{maxWidth:920,margin:"0 auto"}}>
        <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:2,overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
          <table style={{width:"100%",minWidth:600,borderCollapse:"collapse"}}>
            <thead><tr style={{borderBottom:`1px solid ${T.border}`}}>
              {["Cliente","Empresa","Valor","Etapa","Fuente","Tags","Últ. contacto",""].map(h=>(
                <th key={h} style={{padding:"11px 14px",textAlign:"left",fontSize:9,color:T.gold,textTransform:"uppercase",letterSpacing:1.5,fontWeight:600,background:T.card}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>{filtered.map((c,i)=>{const col=sc(c.stage);return(<tr key={c.id} onClick={()=>{setSelected(c);setDetailTab("info");}} className="rowHover" style={{borderBottom:`1px solid ${T.border}`,background:i%2?T.card+"60":"transparent"}}>
              <td style={{padding:"10px 14px",fontWeight:500,fontSize:13}}>{c.name}</td>
              <td style={{padding:"10px 14px",fontSize:12,color:T.textMuted}}>{c.company||"—"}</td>
              <td style={{padding:"10px 14px",fontWeight:600,color:col,fontFamily:"Cormorant Garamond,serif",fontSize:15}}>{fmt(c.value||0)}</td>
              <td style={{padding:"10px 14px"}}><span style={{color:col,border:`1px solid ${col}40`,background:`${col}12`,padding:"2px 9px",borderRadius:1,fontSize:9,letterSpacing:.5,textTransform:"uppercase"}}>{c.stage}</span></td>
              <td style={{padding:"10px 14px",fontSize:11,color:T.textMuted}}>{c.source||"—"}</td>
              <td style={{padding:"10px 14px"}}>{(c.tags||[]).slice(0,2).map(tag=>(<span key={tag} className="tag" style={{background:`${T.gold}15`,color:T.gold,border:`1px solid ${T.gold}30`,marginRight:3}}>{tag}</span>))}</td>
              <td style={{padding:"10px 14px",fontSize:11,color:daysSince(c.lastContact||c.createdAt)>7?T.red:T.textMuted}}>{c.lastContact||"—"}</td>
              <td style={{padding:"10px 14px"}}><button className="pBtn" onClick={e=>{e.stopPropagation();editClient(c);}} style={{background:T.card,border:`1px solid ${T.border}`,color:T.textMuted,padding:"3px 9px",borderRadius:2,fontSize:10}}>Editar</button></td>
            </tr>);})}
            </tbody>
          </table>
          {filtered.length===0&&<div style={{textAlign:"center",padding:52,color:T.textDim}}>
            {visibleClients.length===0?<div><div style={{fontFamily:"Cormorant Garamond,serif",fontSize:28,marginBottom:8}}>◈</div>Registra tu primer cliente</div>:"Sin resultados"}
          </div>}
        </div>
      </div>)}

      {/* STATS */}
      {view==="stats"&&(<div style={{maxWidth:800,margin:"0 auto",display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
        <div style={{gridColumn:"1/-1",background:T.surface,border:`1px solid ${T.border}`,borderRadius:2,padding:20}}>
          <Label>Pipeline por etapa</Label>
          {STAGES.map(stage=>{
            const scs=visibleClients.filter(c=>c.stage===stage);
            const total=scs.reduce((s,c)=>s+Number(c.value||0),0);
            const maxV=Math.max(...STAGES.map(s=>visibleClients.filter(c=>c.stage===s).reduce((a,c)=>a+Number(c.value||0),0)),1);
            const col=sc(stage);
            return(<div key={stage} style={{marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                <span style={{fontSize:12,color:T.text}}>{stage}</span>
                <span style={{fontSize:13,fontFamily:"Cormorant Garamond,serif",color:col}}>{fmt(total)} · {scs.length}</span>
              </div>
              <div style={{height:3,background:T.border,borderRadius:1,overflow:"hidden"}}>
                <div style={{height:"100%",width:`${(total/maxV)*100}%`,background:col,transition:"width .6s"}}/>
              </div>
            </div>);
          })}
        </div>
        <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:2,padding:20}}>
          <Label>⚠ Requieren seguimiento</Label>
          {visibleClients.filter(c=>daysSince(c.lastContact||c.createdAt)>7&&c.stage!==STAGES[STAGES.length-1]).sort((a,b)=>daysSince(b.lastContact||b.createdAt)-daysSince(a.lastContact||a.createdAt)).slice(0,6).map(c=>(<div key={c.id} className="rowHover" onClick={()=>{setSelected(c);setDetailTab("activity");}} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${T.border}`}}>
            <div><div style={{fontSize:13,fontWeight:500}}>{c.name}</div><div style={{fontSize:10,color:T.textMuted,marginTop:1}}>{c.stage}</div></div>
            <div style={{color:T.red,fontSize:15,fontFamily:"Cormorant Garamond,serif",fontWeight:600}}>{daysSince(c.lastContact||c.createdAt)}d</div>
          </div>))}
          {visibleClients.filter(c=>daysSince(c.lastContact||c.createdAt)>7).length===0&&<div style={{color:T.green,fontSize:13}}>✓ Todo al día</div>}
        </div>
        <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:2,padding:20}}>
          <Label>Resumen financiero</Label>
          {[
            {label:"Pipeline activo",value:pipeline,c:T.gold},
            {label:"Ganado / Cerrado",value:closedV,c:T.green},
            {label:"Total potencial",value:visibleClients.reduce((s,c)=>s+Number(c.value||0),0),c:T.text},
          ].map(item=>(<div key={item.label} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${T.border}`}}>
            <span style={{fontSize:13,color:T.textMuted}}>{item.label}</span>
            <span style={{fontSize:17,fontWeight:600,color:item.c,fontFamily:"Cormorant Garamond,serif"}}>{fmt(item.value)}</span>
          </div>))}
        </div>
        <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:2,padding:20}}>
          <Label>Fuente de clientes</Label>
          {LEAD_SOURCES.map(src=>{const n=visibleClients.filter(c=>c.source===src).length;return n>0?(<div key={src} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:`1px solid ${T.border}`}}>
            <span style={{fontSize:13,color:T.textMuted}}>{src}</span>
            <span style={{fontSize:14,color:T.gold,fontFamily:"Cormorant Garamond,serif",fontWeight:600}}>{n}</span>
          </div>):null;})}
          {visibleClients.filter(c=>c.source).length===0&&<div style={{color:T.textDim,fontSize:12}}>Sin datos de fuente aún</div>}
        </div>
      </div>)}

      {/* TASKS VIEW */}
      {view==="tasks"&&(<div style={{maxWidth:700,margin:"0 auto"}}>
        <div style={{marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{fontFamily:"Cormorant Garamond,serif",fontSize:22,fontWeight:600}}>Tareas pendientes</div>
          <div style={{fontSize:12,color:T.textMuted}}>{pendingTasks} pendientes</div>
        </div>
        {visibleClients.flatMap(c=>(c.tasks||[]).filter(t=>!t.done).map(t=>({...t,clientName:c.name,clientId:c.id}))).sort((a,b)=>new Date(a.due)-new Date(b.due)).map(t=>(<div key={t.id} className="rowHover" onClick={()=>{const client=clients.find(c=>c.id===t.clientId);if(client){setSelected(client);setDetailTab("tasks");}}} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:2,padding:"13px 16px",marginBottom:8,display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:8,height:8,borderRadius:"50%",background:priorityColor[t.priority]||T.gold,flexShrink:0}}/>
          <div style={{flex:1}}>
            <div style={{fontSize:13,fontWeight:500}}>{t.title}</div>
            <div style={{fontSize:11,color:T.textMuted,marginTop:2}}>{t.clientName} · Vence: {fmtDate(t.due)}</div>
          </div>
          <span style={{fontSize:10,color:priorityColor[t.priority],border:`1px solid ${priorityColor[t.priority]}40`,padding:"2px 8px",borderRadius:1,letterSpacing:.5}}>{t.priority}</span>
          {new Date(t.due)<new Date()&&<span style={{fontSize:10,color:T.red,border:`1px solid ${T.red}40`,padding:"2px 8px",borderRadius:1}}>Vencida</span>}
        </div>))}
        {pendingTasks===0&&<div style={{textAlign:"center",padding:52,color:T.textDim}}><div style={{fontFamily:"Cormorant Garamond,serif",fontSize:28,marginBottom:8}}>✓</div>Sin tareas pendientes</div>}
      </div>)}
    </div>

    {/* -- DETAIL PANEL */}
    {selected&&(<div style={{position:"fixed",inset:0,background:"rgba(44,36,32,.5)",zIndex:200,display:"flex",justifyContent:"flex-end",animation:"fadeIn .2s"}} onClick={()=>setSelected(null)}>
      <div style={{width:400,background:T.surface,borderLeft:`1px solid ${T.border}`,height:"100%",display:"flex",flexDirection:"column",animation:"slideR .25s"}} onClick={e=>e.stopPropagation()}>

        {/* Panel header */}
        <div style={{padding:"18px 20px",borderBottom:`1px solid ${T.border}`,flexShrink:0}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
            <div style={{flex:1}}>
              <div style={{fontFamily:"Cormorant Garamond,serif",fontSize:20,fontWeight:600,lineHeight:1.1}}>{selected.name}</div>
              {selected.company&&<div style={{fontSize:12,color:T.gold,marginTop:2}}>{selected.company}</div>}
              <div style={{fontSize:11,color:T.textMuted,marginTop:2}}>{selected.email}{selected.phone?` · ${selected.phone}`:""}</div>
            </div>
            <div style={{display:"flex",gap:6,flexShrink:0}}>
              <button className="pBtn" onClick={()=>editClient(selected)} style={{background:T.card,border:`1px solid ${T.border}`,color:T.textMuted,padding:"5px 10px",borderRadius:2,fontSize:10,letterSpacing:1}}>Editar</button>
              <button className="pBtn" onClick={()=>setSelected(null)} style={{background:"transparent",color:T.textMuted,padding:"5px 8px",border:`1px solid ${T.border}`,borderRadius:2,fontSize:14}}>✕</button>
            </div>
          </div>
          <div style={{fontFamily:"Cormorant Garamond,serif",fontSize:28,fontWeight:700,color:sc(selected.stage),marginTop:6}}>{fmt(selected.value||0)}</div>
          {(selected.tags||[]).length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:6}}>{selected.tags.map(tag=>(<span key={tag} className="tag" style={{background:`${T.gold}15`,color:T.gold,border:`1px solid ${T.gold}30`}}>{tag}</span>))}</div>}

          {/* -- QUICK CONTACT BUTTONS */}
          <div style={{display:"flex",gap:7,marginTop:12}}>
            {selected.email&&(
              <a href={`mailto:${selected.email}?subject=Seguimiento%20de%20proyecto&body=Hola%20${encodeURIComponent(selected.name)},%0A%0AEspero%20que%20est%C3%A9s%20bien.%20Te%20escribo%20para%20dar%20seguimiento%20a%20nuestro%20proyecto.%0A%0ASaludos`}
                target="_blank" rel="noreferrer"
                style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6,background:T.card,border:`1px solid ${T.border}`,borderRadius:2,padding:"8px 10px",color:T.blue,fontSize:11,letterSpacing:.5,textDecoration:"none",transition:"all .2s",fontFamily:"Jost,sans-serif"}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor=T.blue;e.currentTarget.style.background=`${T.blue}15`;}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.background=T.card;}}>
                <span style={{fontSize:14}}>✉</span> Email
              </a>
            )}
            {selected.phone&&(
              <a href={`https://wa.me/${selected.phone.replace(/\D/g,"")}?text=${encodeURIComponent(`Hola ${selected.name}, te escribo para dar seguimiento a nuestro proyecto. ¿Tienes un momento para hablar?`)}`}
                target="_blank" rel="noreferrer"
                style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6,background:T.card,border:`1px solid ${T.border}`,borderRadius:2,padding:"8px 10px",color:"#25D366",fontSize:11,letterSpacing:.5,textDecoration:"none",transition:"all .2s",fontFamily:"Jost,sans-serif"}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor="#25D366";e.currentTarget.style.background="#25D36615";}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.background=T.card;}}>
                <span style={{fontSize:14}}>💬</span> WhatsApp
              </a>
            )}
            {selected.phone&&(
              <a href={`tel:${selected.phone.replace(/\s/g,"")}`}
                style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6,background:T.card,border:`1px solid ${T.border}`,borderRadius:2,padding:"8px 10px",color:T.green,fontSize:11,letterSpacing:.5,textDecoration:"none",transition:"all .2s",fontFamily:"Jost,sans-serif"}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor=T.green;e.currentTarget.style.background=`${T.green}15`;}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.background=T.card;}}>
                <span style={{fontSize:14}}>📞</span> Llamar
              </a>
            )}
            {!selected.email&&!selected.phone&&(
              <div style={{fontSize:11,color:T.textDim,padding:"8px 0",fontStyle:"italic"}}>Agrega email o teléfono para contactar</div>
            )}
          </div>
        </div>

        {/* Stage pills */}
        <div style={{padding:"10px 20px",borderBottom:`1px solid ${T.border}`,flexShrink:0,overflowX:"auto"}}>
          <div style={{display:"flex",gap:5,flexWrap:"nowrap"}}>
            {STAGES.map(s=>{const col=sc(s);const active=selected.stage===s;return(<button key={s} className="pBtn" onClick={()=>moveStage(selected.id,s)} style={{padding:"3px 9px",borderRadius:1,fontSize:9,letterSpacing:.5,textTransform:"uppercase",border:`1px solid ${active?col:T.border}`,background:active?`${col}18`:"transparent",color:active?col:T.textMuted,whiteSpace:"nowrap",flexShrink:0}}>{s}</button>);})}
          </div>
        </div>

        {/* Tabs */}
        <div style={{display:"flex",borderBottom:`1px solid ${T.border}`,flexShrink:0}}>
          {[["info","Info"],["activity","Actividad"],["tasks","Tareas"],["files","Archivos"]].map(([id,label])=>(<button key={id} className="tabBtn" onClick={()=>setDetailTab(id)} style={{flex:1,padding:"10px",fontSize:10,letterSpacing:1,textTransform:"uppercase",background:"transparent",color:detailTab===id?T.gold:T.textMuted,borderBottom:detailTab===id?`1px solid ${T.gold}`:"1px solid transparent",marginBottom:-1}}>{label}{id==="tasks"&&(selected.tasks||[]).filter(t=>!t.done).length>0?` (${(selected.tasks||[]).filter(t=>!t.done).length})`:""}{id==="files"&&(selected.files||[]).length>0?` (${(selected.files||[]).length})`:""}</button>))}
        </div>

        <div style={{flex:1,overflowY:"auto",padding:"16px 20px"}}>

          {/* INFO TAB */}
          {detailTab==="info"&&(<div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
              {[
                {label:"Email",value:selected.email},
                {label:"Teléfono",value:selected.phone},
                {label:"Empresa",value:selected.company},
                {label:"Dirección",value:selected.address},
                {label:"Fuente del lead",value:selected.source},
                {label:"Cierre esperado",value:fmtDate(selected.expectedClose)},
              ].map(f=>f.value?(<div key={f.label}>
                <div style={{fontSize:9,color:T.gold,letterSpacing:1.5,textTransform:"uppercase",marginBottom:2}}>{f.label}</div>
                <div style={{fontSize:12,color:T.text}}>{f.value}</div>
              </div>):null)}
            </div>
            {selected.notes&&(<div style={{marginBottom:16}}>
              <Label>Notas</Label>
              <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:2,padding:"10px 12px",fontSize:12,lineHeight:1.7,color:T.textMuted}}>{selected.notes}</div>
            </div>)}
            {(selected.stageHistory||[]).length>1&&(<div>
              <Label>Historial de etapas</Label>
              {[...(selected.stageHistory||[])].reverse().slice(0,5).map((h,i)=>(<div key={i} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:`1px solid ${T.border}`,fontSize:12}}>
                <span style={{color:sc(h.stage)}}>{h.stage}</span>
                <span style={{color:T.textMuted}}>{fmtDateTime(h.date)}</span>
              </div>))}
            </div>)}
            {selected.privacyConsent&&<div style={{marginTop:14,fontSize:10,color:T.textDim,border:`1px solid ${T.border}`,borderRadius:2,padding:"6px 10px"}}>✓ Consentimiento de privacidad registrado</div>}
            <GL/>
            <div style={{marginTop:14,display:"flex",gap:8}}>
              <button className="pBtn" onClick={()=>delClient(selected.id)} style={{flex:1,background:"transparent",border:`1px solid ${T.red}40`,color:T.red,padding:"9px",borderRadius:2,fontSize:10,letterSpacing:1,textTransform:"uppercase"}}>Eliminar cliente</button>
            </div>
          </div>)}

          {/* ACTIVITY TAB */}
          {detailTab==="activity"&&(<div>

            {/* Quick send buttons */}
            <div style={{marginBottom:14}}>
              <Label>Enviar mensaje rápido</Label>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:8}}>
                {[
                  {label:"📋 Enviar cotización",type:"email",msg:`Hola ${selected.name},\n\nAdjunto la cotización para el proyecto que conversamos.\n\nQuedo atento a tus comentarios.\n\nSaludos`},
                  {label:"🔔 Recordatorio pago",type:"whatsapp",msg:`Hola ${selected.name}! Te recuerdo que tenemos un pago pendiente. ¿Puedes confirmarme cuándo podrías realizarlo? Gracias 🙏`},
                  {label:"✅ Proyecto entregado",type:"email",msg:`Hola ${selected.name},\n\nMe complace informarte que el proyecto está completado y listo para entrega.\n\nPor favor confírmame la recepción.\n\nSaludos`},
                  {label:"🤝 Seguimiento",type:"whatsapp",msg:`Hola ${selected.name}! ¿Cómo estás? Quería hacer un seguimiento sobre nuestro proyecto. ¿Tienes alguna novedad o duda?`},
                  {label:"📅 Agendar reunión",type:"email",msg:`Hola ${selected.name},\n\nMe gustaría agendar una reunión para hablar sobre el avance del proyecto. ¿Qué días tienes disponibles esta semana?\n\nSaludos`},
                  {label:"🎉 Bienvenida cliente",type:"whatsapp",msg:`¡Hola ${selected.name}! Estoy muy contento/a de trabajar contigo. Comenzaremos a trabajar en tu proyecto de inmediato. ¡Cualquier duda, aquí estoy! 😊`},
                ].map(tpl=>{
                  const isWA=tpl.type==="whatsapp";
                  const hasContact=isWA?!!selected.phone:!!selected.email;
                  const href=isWA
                    ?`https://wa.me/${(selected.phone||"").replace(/\D/g,"")}?text=${encodeURIComponent(tpl.msg)}`
                    :`mailto:${selected.email||""}?subject=${encodeURIComponent(tpl.label.replace(/[^\w\s]/g,"").trim())}&body=${encodeURIComponent(tpl.msg)}`;
                  return(
                    <a key={tpl.label} href={hasContact?href:"#"} target={isWA?"_blank":"_self"} rel="noreferrer"
                      onClick={e=>{
                        if(!hasContact){e.preventDefault();showN(`⚠ Agrega ${isWA?"teléfono":"email"} para usar esta plantilla`);}
                        else{const act={id:Date.now(),type:isWA?"💬 WhatsApp":"📧 Email",note:`Plantilla enviada: "${tpl.label}"`,date:now()};const updated={...selected,activities:[act,...(selected.activities||[])]};setClients(clients.map(c=>c.id===selected.id?updated:c));setSelected(updated);}
                      }}
                      style={{display:"flex",alignItems:"center",gap:6,background:T.card,border:`1px solid ${hasContact?(isWA?"#25D36640":T.blue+"40"):T.border}`,borderRadius:2,padding:"8px 10px",color:hasContact?(isWA?"#25D366":T.blue):T.textDim,fontSize:11,textDecoration:"none",transition:"all .2s",fontFamily:"Jost,sans-serif",opacity:hasContact?1:.5,cursor:hasContact?"pointer":"not-allowed"}}>
                      <span style={{fontSize:13}}>{isWA?"💬":"✉"}</span>
                      <span style={{fontSize:11,lineHeight:1.3}}>{tpl.label}</span>
                    </a>
                  );
                })}
              </div>
            </div>

            <GL/>
            <div style={{height:14}}/>

            <Label>Registrar actividad manual</Label>
            <select value={actType} onChange={e=>{setActType(e.target.value);setCustomActType("");}} style={{...inputS,marginBottom:8}}>
              {ACTIVITY_TYPES.map(t=><option key={t}>{t}</option>)}
            </select>
            {actType==="✏️ Otra (personalizada)"&&(
              <input value={customActType} onChange={e=>setCustomActType(e.target.value)} placeholder="Escribe el nombre de la actividad..." style={{...inputS,marginBottom:8,borderColor:T.gold}}/>
            )}
            <textarea value={actNote} onChange={e=>setActNote(e.target.value)} placeholder="Describe la actividad, acuerdos o próximos pasos..." rows={3}
              style={{...inputS,resize:"vertical",lineHeight:1.6,marginBottom:8}}/>
            <button className="pBtn" onClick={addActivity} style={{width:"100%",background:T.grad,color:"#0C0A08",padding:"9px",borderRadius:2,fontSize:10,fontWeight:700,letterSpacing:2,textTransform:"uppercase",marginBottom:18}}>◈ Registrar</button>
            <GL/>
            <div style={{marginTop:14}}>
              <Label>Historial</Label>
              {(selected.activities||[]).length===0&&<div style={{color:T.textDim,fontSize:12,textAlign:"center",padding:"20px 0"}}>Sin actividades registradas</div>}
              {(selected.activities||[]).map(act=>(<div key={act.id} style={{borderBottom:`1px solid ${T.border}`,paddingBottom:10,marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                  <span style={{fontSize:11,color:T.gold}}>{act.type}</span>
                  <span style={{fontSize:10,color:T.textMuted}}>{fmtDateTime(act.date)}</span>
                </div>
                <div style={{fontSize:12,color:T.textMuted,lineHeight:1.6}}>{act.note}</div>
              </div>))}
            </div>
          </div>)}

          {/* TASKS TAB */}
          {detailTab==="tasks"&&(<div>
            <Label>Nueva tarea</Label>
            <input value={taskTitle} onChange={e=>setTaskTitle(e.target.value)} placeholder="Descripción de la tarea..." style={{...inputS,marginBottom:8}}/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
              <div>
                <Label>Fecha límite</Label>
                <input type="date" value={taskDue} onChange={e=>setTaskDue(e.target.value)} style={{...inputS,height:42,lineHeight:"20px",boxSizing:"border-box",appearance:"none",WebkitAppearance:"none"}}/>
              </div>
              <div>
                <Label>Prioridad</Label>
                <select value={taskPriority} onChange={e=>setTaskPriority(e.target.value)} style={{...inputS,height:42,lineHeight:"20px",boxSizing:"border-box",appearance:"none",WebkitAppearance:"none",backgroundImage:`url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path fill='${encodeURIComponent(T.textDim)}' d='M0 0l5 6 5-6z'/></svg>")`,backgroundRepeat:"no-repeat",backgroundPosition:"right 12px center",paddingRight:30}}>
                  {TASK_PRIORITIES.map(p=><option key={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <button className="pBtn" onClick={addTask} style={{width:"100%",background:T.grad,color:"#0C0A08",padding:"9px",borderRadius:2,fontSize:10,fontWeight:700,letterSpacing:2,textTransform:"uppercase",marginBottom:18}}>◈ Agregar tarea</button>
            <GL/>
            <div style={{marginTop:14}}>
              <Label>Tareas</Label>
              {(selected.tasks||[]).length===0&&<div style={{color:T.textDim,fontSize:12,textAlign:"center",padding:"20px 0"}}>Sin tareas</div>}
              {(selected.tasks||[]).sort((a,b)=>a.done-b.done).map(task=>(<div key={task.id} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"8px 0",borderBottom:`1px solid ${T.border}`,opacity:task.done?.6:1}}>
                <div onClick={()=>toggleTask(task.id)} style={{width:16,height:16,borderRadius:1,border:`1px solid ${task.done?T.green:T.border}`,background:task.done?T.green+"20":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1,cursor:"pointer",transition:"all .2s"}}>
                  {task.done&&<span style={{color:T.green,fontSize:11}}>✓</span>}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,color:task.done?T.textMuted:T.text,textDecoration:task.done?"line-through":"none"}}>{task.title}</div>
                  <div style={{fontSize:10,color:T.textMuted,marginTop:2}}>Vence: {fmtDate(task.due)} · <span style={{color:priorityColor[task.priority]}}>{task.priority}</span></div>
                </div>
                {!task.done&&new Date(task.due)<new Date()&&<span style={{fontSize:9,color:T.red,border:`1px solid ${T.red}40`,padding:"2px 6px",borderRadius:1,flexShrink:0}}>Vencida</span>}
              </div>))}
            </div>
          </div>)}

          {/* FILES TAB */}
          {detailTab==="files"&&(<div>
            <Label>Subir archivos</Label>

            {/* Category selector */}
            <div style={{marginBottom:8}}>
              <select value={fileCategory} onChange={e=>setFileCategory(e.target.value)} style={{...inputS,marginBottom:8}}>
                {FILE_CATEGORIES.map(c=><option key={c}>{c}</option>)}
              </select>
            </div>

            {/* Drop zone */}
            <div
              onClick={()=>fileInputRef.current?.click()}
              onDragOver={e=>{e.preventDefault();e.currentTarget.style.borderColor=T.gold;e.currentTarget.style.background=`${T.gold}08`;}}
              onDragLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.background="transparent";}}
              onDrop={e=>{e.preventDefault();e.currentTarget.style.borderColor=T.border;e.currentTarget.style.background="transparent";const dt=e.dataTransfer;if(dt.files.length){handleFileUpload({target:{files:dt.files,value:""}});}}}
              style={{border:`2px dashed ${T.border}`,borderRadius:2,padding:"24px 16px",textAlign:"center",cursor:"pointer",marginBottom:16,transition:"all .2s"}}>
              <div style={{fontSize:28,marginBottom:8}}>📎</div>
              <div style={{fontSize:13,fontWeight:500,color:T.text,marginBottom:4}}>Arrastra archivos aquí</div>
              <div style={{fontSize:11,color:T.textMuted}}>o haz clic para seleccionar</div>
              <div style={{fontSize:10,color:T.textDim,marginTop:6}}>PDF, Word, Excel, imágenes, videos...</div>
            </div>
            <input ref={fileInputRef} type="file" multiple onChange={handleFileUpload} style={{display:"none"}}
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.webp,.mp4,.mov,.zip,.rar,.txt,.csv"/>

            <GL/>
            <div style={{marginTop:14}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <Label>Documentos del cliente</Label>
                <span style={{fontSize:10,color:T.textMuted}}>{(selected.files||[]).length} archivo(s)</span>
              </div>

              {(selected.files||[]).length===0&&(
                <div style={{textAlign:"center",padding:"28px 0",color:T.textDim}}>
                  <div style={{fontSize:32,marginBottom:8}}>📂</div>
                  <div style={{fontSize:12}}>Sin archivos aún</div>
                </div>
              )}

              {/* Group by category */}
              {FILE_CATEGORIES.map(cat=>{
                const catFiles=(selected.files||[]).filter(f=>f.category===cat);
                if(!catFiles.length) return null;
                return(
                  <div key={cat} style={{marginBottom:14}}>
                    <div style={{fontSize:9,color:T.gold,letterSpacing:1.5,textTransform:"uppercase",marginBottom:6,paddingBottom:4,borderBottom:`1px solid ${T.border}`}}>{cat}</div>
                    {catFiles.map(file=>(
                      <div key={file.id} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 10px",background:T.card,border:`1px solid ${T.border}`,borderRadius:2,marginBottom:5}}>
                        <span style={{fontSize:22,flexShrink:0}}>{fileIcon(file.type)}</span>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:12,fontWeight:500,color:T.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{file.name}</div>
                          <div style={{fontSize:10,color:T.textMuted,marginTop:1}}>{fmtFileSize(file.size)} · {fmtDateTime(file.date)}</div>
                        </div>
                        <div style={{display:"flex",gap:5,flexShrink:0}}>
                          {(file.path||file.url||file.dataUrl)&&(
                            <button className="pBtn" onClick={()=>downloadFile(file)} title="Descargar"
                              style={{background:"transparent",border:`1px solid ${T.border}`,color:T.blue,padding:"4px 8px",borderRadius:2,fontSize:11}}>↓</button>
                          )}
                          {(file.path||file.url||file.dataUrl)&&file.type&&(file.type.includes("image")||file.type.includes("pdf"))&&(
                            <button className="pBtn" onClick={()=>viewFile(file)} title={file.type.includes("pdf")?"Ver PDF":"Ver"}
                              style={{background:"transparent",border:`1px solid ${T.border}`,color:T.gold,padding:"4px 8px",borderRadius:2,fontSize:11}}>👁</button>
                          )}
                          <button className="pBtn" onClick={()=>deleteFile(file.id)} title="Eliminar"
                            style={{background:"transparent",border:`1px solid ${T.red}40`,color:T.red,padding:"4px 8px",borderRadius:2,fontSize:11}}>×</button>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>)}

        </div>
      </div>
    </div>)}

    {/* -- FORM MODAL */}
    {showForm&&(<div style={{position:"fixed",inset:0,background:"rgba(44,36,32,.6)",zIndex:300,display:"flex",alignItems:"flex-start",justifyContent:"center",animation:"fadeIn .2s",padding:16,overflowY:"auto",overflowX:"hidden"}} onClick={()=>setShowForm(false)}>
      <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:2,width:"100%",maxWidth:540,maxHeight:"92vh",display:"flex",flexDirection:"column",overflowX:"hidden",animation:"fadeUp .25s"}} onClick={e=>e.stopPropagation()}>

        <div style={{padding:"20px 24px",borderBottom:`1px solid ${T.border}`,flexShrink:0}}>
          <div style={{fontFamily:"Cormorant Garamond,serif",fontSize:22,fontWeight:600,color:T.text}}>{editing?"Editar cliente":"Nuevo cliente"}</div>
          <div style={{fontSize:9,color:T.gold,letterSpacing:2,marginTop:2,textTransform:"uppercase"}}>{editing?"Modificar registro":"Registrar contacto"}</div>
        </div>

        <div style={{flex:1,overflowY:"auto",overflowX:"hidden",padding:"18px 16px",width:"100%"}}>
          <div style={{marginBottom:14,borderBottom:`1px solid ${T.border}`,paddingBottom:14}}>
            <div style={{fontSize:10,color:T.gold,letterSpacing:2,textTransform:"uppercase",marginBottom:10,fontWeight:600}}>Información de contacto</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,width:"100%",minWidth:0}}>
              <div style={{gridColumn:"1/-1"}}><Label>Nombre completo *</Label><input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Nombre del cliente" style={inputS}/></div>
              <div><Label>Empresa / Organización</Label><input value={form.company} onChange={e=>setForm({...form,company:e.target.value})} placeholder="Empresa S.A." style={inputS}/></div>
              <div><Label>Email</Label><input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="cliente@email.com" style={inputS}/></div>
              <div><Label>Teléfono</Label><input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="+52 55 1234 5678" style={inputS}/></div>
              <div style={{gridColumn:"1/-1"}}><Label>Dirección (opcional)</Label><input value={form.address} onChange={e=>setForm({...form,address:e.target.value})} placeholder="Ciudad, País" style={inputS}/></div>
            </div>
          </div>

          <div style={{marginBottom:14,borderBottom:`1px solid ${T.border}`,paddingBottom:14}}>
            <div style={{fontSize:10,color:T.gold,letterSpacing:2,textTransform:"uppercase",marginBottom:10,fontWeight:600}}>Información comercial</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,width:"100%",minWidth:0}}>
              <div><Label>Valor del proyecto</Label><input type="number" value={form.value} onChange={e=>setForm({...form,value:e.target.value})} placeholder="0" style={inputS}/></div>
              <div><Label>Moneda</Label><select value={form.currency} onChange={e=>setForm({...form,currency:e.target.value})} style={inputS}>{["MXN","USD","EUR","COP","ARS","CLP","PEN"].map(c=><option key={c}>{c}</option>)}</select></div>
              <div><Label>Etapa</Label><select value={form.stage} onChange={e=>setForm({...form,stage:e.target.value})} style={inputS}>{STAGES.map(s=><option key={s}>{s}</option>)}</select></div>
              <div><Label>Fuente del lead</Label><select value={form.source} onChange={e=>setForm({...form,source:e.target.value})} style={inputS}><option value="">Seleccionar...</option>{LEAD_SOURCES.map(s=><option key={s}>{s}</option>)}</select></div>
              <div style={{minWidth:0}}>
                <Label>Cierre esperado</Label>
                <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:2,padding:"9px 10px",display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <input type="date" value={form.expectedClose} onChange={e=>setForm({...form,expectedClose:e.target.value})}
                    style={{background:"transparent",border:"none",outline:"none",color:T.text,fontSize:12,fontFamily:"Jost,sans-serif",width:"100%",textAlign:"center"}}/>
                </div>
              </div>
              <div style={{minWidth:0}}>
                <Label>Último contacto</Label>
                <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:2,padding:"9px 10px",display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <input type="date" value={form.lastContact||today()} onChange={e=>setForm({...form,lastContact:e.target.value})}
                    style={{background:"transparent",border:"none",outline:"none",color:T.text,fontSize:12,fontFamily:"Jost,sans-serif",width:"100%",textAlign:"center"}}/>
                </div>
              </div>
            </div>
          </div>

          <div style={{marginBottom:14,borderBottom:`1px solid ${T.border}`,paddingBottom:14}}>
            <div style={{fontSize:10,color:T.gold,letterSpacing:2,textTransform:"uppercase",marginBottom:10,fontWeight:600}}>Etiquetas</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {TAGS_OPTIONS.map(tag=>{const active=(form.tags||[]).includes(tag);return(<button key={tag} className="pBtn" onClick={()=>setForm({...form,tags:active?(form.tags||[]).filter(t=>t!==tag):[...(form.tags||[]),tag]})} style={{padding:"4px 10px",borderRadius:1,fontSize:10,letterSpacing:.5,border:`1px solid ${active?T.gold:T.border}`,background:active?`${T.gold}18`:"transparent",color:active?T.gold:T.textMuted}}>{tag}</button>);})}
            </div>
          </div>

          <div style={{marginBottom:14,borderBottom:`1px solid ${T.border}`,paddingBottom:14}}>
            <Label>Notas del proyecto</Label>
            <textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Detalles, acuerdos, contexto del proyecto..." rows={3} style={{...inputS,resize:"vertical",lineHeight:1.6}}/>
          </div>

          {/* Privacy consent in form */}
          <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:2,padding:14,marginBottom:14}}>
            <div style={{fontSize:9,color:T.gold,letterSpacing:2,textTransform:"uppercase",marginBottom:8,fontWeight:600}}>Consentimiento de privacidad</div>
            <label style={{display:"flex",alignItems:"flex-start",gap:10,cursor:"pointer"}}>
              <div onClick={()=>setForm({...form,privacyConsent:!form.privacyConsent})} style={{width:16,height:16,borderRadius:1,border:`1px solid ${form.privacyConsent?T.gold:T.border}`,background:form.privacyConsent?T.gold+"20":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1,cursor:"pointer",transition:"all .2s"}}>
                {form.privacyConsent&&<span style={{color:T.gold,fontSize:10}}>✓</span>}
              </div>
              <span style={{fontSize:11,color:T.textMuted,lineHeight:1.6}}>El cliente ha dado su consentimiento para que sus datos sean tratados con fines comerciales, conforme al Aviso de Privacidad.</span>
            </label>
          </div>
        </div>

        <div style={{padding:"14px 24px",borderTop:`1px solid ${T.border}`,display:"flex",gap:10,flexShrink:0}}>
          <button className="pBtn" onClick={()=>setShowForm(false)} style={{flex:1,background:"transparent",border:`1px solid ${T.border}`,color:T.textMuted,padding:"10px",borderRadius:2,fontSize:10,letterSpacing:2,textTransform:"uppercase"}}>Cancelar</button>
          <button className="pBtn" onClick={save} style={{flex:2,background:T.grad,color:"#0C0A08",padding:"10px",borderRadius:2,fontSize:10,fontWeight:700,letterSpacing:2,textTransform:"uppercase",boxShadow:`0 4px 20px ${T.gold}25`}}>
            {editing?"Guardar cambios":"Registrar cliente"}
          </button>
        </div>
      </div>
    </div>)}

    {/* -- NOTIFICATION */}

    {/* ── CALENDAR VIEW */}
    {view==="calendar"&&(
      <div style={{maxWidth:calView==="day"?500:1000,width:"100%",margin:"0 auto",marginTop:-20,minHeight:"calc(100vh - 200px)",overflow:"hidden",boxSizing:"border-box"}}>
        {/* Calendar Header — 3 columnas: vacío | título centrado con flechas | botones */}
        <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",alignItems:"center",marginBottom:8,gap:10}}>
          {/* Spacer izquierdo, mismo ancho que los botones de la derecha para que el centro quede centrado */}
          <div/>
          {/* Título con flechas */}
          <div style={{display:"flex",alignItems:"center",gap:10,justifyContent:"center"}}>
            <button className="pBtn" onClick={()=>{const d=new Date(calDate);if(calView==="day")d.setDate(d.getDate()-1);else if(calView==="week")d.setDate(d.getDate()-7);else d.setMonth(d.getMonth()-1);setCalDate(d);}} style={{background:T.card,border:`1px solid ${T.border}`,color:T.text,padding:"6px 12px",borderRadius:2,fontSize:14}}>←</button>
            <div style={{fontFamily:"Cormorant Garamond,serif",fontSize:22,fontWeight:600,color:T.text,minWidth:200,textAlign:"center",whiteSpace:"nowrap"}}>
              {calView==="day"
                ? calDate.toLocaleDateString("es-MX",{weekday:"long",day:"numeric",month:"long"})
                : calView==="week"
                ? (()=>{
                    const ws = weekStart(calDate);
                    const we = new Date(ws); we.setDate(we.getDate()+6);
                    const sameMonth = ws.getMonth()===we.getMonth();
                    if(sameMonth){
                      return `${ws.getDate()}–${we.getDate()} ${ws.toLocaleDateString("es-MX",{month:"long",year:"numeric"})}`;
                    }
                    return `${ws.getDate()} ${ws.toLocaleDateString("es-MX",{month:"short"})} – ${we.getDate()} ${we.toLocaleDateString("es-MX",{month:"short",year:"numeric"})}`;
                  })()
                : calDate.toLocaleDateString("es-MX",{month:"long",year:"numeric"})}
            </div>
            <button className="pBtn" onClick={()=>{const d=new Date(calDate);if(calView==="day")d.setDate(d.getDate()+1);else if(calView==="week")d.setDate(d.getDate()+7);else d.setMonth(d.getMonth()+1);setCalDate(d);}} style={{background:T.card,border:`1px solid ${T.border}`,color:T.text,padding:"6px 12px",borderRadius:2,fontSize:14}}>→</button>
          </div>
          {/* Botones a la derecha */}
          <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
            <button className="pBtn" onClick={()=>{setCalDate(new Date());}} style={{background:T.card,border:`1px solid ${T.border}`,color:T.textMuted,padding:"6px 12px",borderRadius:2,fontSize:11,letterSpacing:.5}}>Hoy</button>
            <button className="pBtn" onClick={()=>{const d=(calView==="day"||calView==="week")?dateToISO(calDate):today();setEditingEvent(null);setEventForm({title:"",date:d,time:"10:00",duration:60,type:"Llamada",clientId:"",notes:""});setShowEventForm(true);}} style={{background:T.grad,color:"#fff",padding:"6px 14px",borderRadius:2,fontSize:11,fontWeight:700,letterSpacing:1,textTransform:"uppercase"}}>+ Evento</button>
          </div>
        </div>

        {/* Divider 1 */}
        <div style={{height:1,background:T.border,marginBottom:6}}/>

        {/* View toggle: Mes / Semana / Día */}
        <div style={{display:"flex",justifyContent:"center",gap:0,marginBottom:6}}>
          {[["month","Mes"],["week","Semana"],["day","Día"]].map(([v,label],i)=>(
            <button key={v} className="pBtn" onClick={()=>setCalView(v)} style={{
              background:calView===v?`${T.gold}18`:"transparent",
              color:calView===v?T.gold:T.textMuted,
              border:`1px solid ${calView===v?T.gold:T.border}`,
              padding:"6px 22px",fontSize:11,fontWeight:600,letterSpacing:1.5,textTransform:"uppercase",
              borderRadius:0,
              marginLeft:i>0?-1:0,
            }}>{label}</button>
          ))}
        </div>

        {/* Divider 2 — less bottom margin on day/week view to compensate for the weekday header row */}
        <div style={{height:1,background:T.border,marginBottom:calView==="day"?4:2}}/>

        {/* MONTH VIEW */}
        {calView==="month"&&(<>
        {/* Day headers */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,minmax(0,1fr))",gap:2,marginBottom:2}}>
          {["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"].map(d=>(
            <div key={d} style={{textAlign:"center",fontSize:10,fontWeight:700,color:T.gold,letterSpacing:1,textTransform:"uppercase",padding:"6px 0"}}>{d}</div>
          ))}
        </div>

        {/* Calendar Grid */}
        {(()=>{
          const year=calDate.getFullYear();
          const month=calDate.getMonth();
          const firstDay=new Date(year,month,1).getDay();
          const offset=firstDay===0?6:firstDay-1;
          const daysInMonth=new Date(year,month+1,0).getDate();
          const cells=[];
          for(let i=0;i<offset;i++) cells.push(null);
          for(let d=1;d<=daysInMonth;d++) cells.push(d);
          while(cells.length%7!==0) cells.push(null);

          const todayDate=new Date();
          const isToday=(d)=>d&&year===todayDate.getFullYear()&&month===todayDate.getMonth()&&d===todayDate.getDate();

          return(
            <div style={{display:"grid",gridTemplateColumns:"repeat(7,minmax(0,1fr))",gap:2}}>
              {cells.map((day,idx)=>{
                const dateStr=day?`${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`:"";
                const dayEvents=visibleEvents.filter(e=>e.date===dateStr);
                const dayClients=visibleClients.filter(c=>c.expectedClose===dateStr||c.lastContact===dateStr);
                return(
                  <div key={idx} onClick={()=>{if(day){const d=new Date(year,month,day);setCalDate(d);setCalView("day");}}} style={{
                    height:72,overflow:"hidden",minWidth:0,background:day?(isToday(day)?`${T.gold}15`:T.surface):T.bg,
                    border:`1px solid ${isToday(day)?T.gold:T.border}`,borderRadius:2,padding:"6px 4px",
                    cursor:day?"pointer":"default",transition:"all .15s",
                  }}
                  onMouseEnter={e=>{if(day)e.currentTarget.style.background=T.cardHover;}}
                  onMouseLeave={e=>{if(day)e.currentTarget.style.background=isToday(day)?`${T.gold}15`:T.surface;}}>
                    {day&&<div style={{fontSize:11,fontWeight:isToday(day)?700:500,color:isToday(day)?T.gold:T.text,marginBottom:2,textAlign:"right",lineHeight:1}}>{day}</div>}
                    {dayEvents.slice(0,3).map(ev=>(
                      <div key={ev.id} onClick={e=>{e.stopPropagation();setEditingEvent(ev);setEventForm({...ev});setShowEventForm(true);}} style={{fontSize:9,background:ev.type==="Llamada"?`${T.blue}20`:ev.type==="Reunión"?`${T.green}20`:ev.type==="Seguimiento"?`${T.gold}20`:`${T.textMuted}15`,color:ev.type==="Llamada"?T.blue:ev.type==="Reunión"?T.green:ev.type==="Seguimiento"?T.gold:T.textMuted,padding:"2px 4px",borderRadius:1,marginBottom:1,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis",cursor:"pointer",maxWidth:"100%"}}>
                        {ev.time} {ev.title}
                      </div>
                    ))}
                    {dayClients.slice(0,2).map(cl=>(
                      <div key={cl.id} onClick={e=>{e.stopPropagation();setSelected(cl);}} style={{fontSize:9,background:`${T.red}15`,color:T.red,padding:"2px 4px",borderRadius:1,marginBottom:1,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis",maxWidth:"100%",cursor:"pointer"}}>
                        📌 {cl.name}
                      </div>
                    ))}
                    {dayEvents.length>3&&<div style={{fontSize:8,color:T.textMuted}}>+{dayEvents.length-3} más</div>}
                  </div>
                );
              })}
            </div>
          );
        })()}
        </>)}

        {/* WEEK VIEW — 7 columnas (Lun-Dom), filas horarias 6:00 AM → 8:00 PM */}
        {calView==="week"&&(()=>{
          const ws = weekStart(calDate);
          const days = Array.from({length:7},(_,i)=>{
            const d = new Date(ws); d.setDate(d.getDate()+i);
            return { date:d, iso: dateToISO(d) };
          });
          const slots=[];
          for(let h=6;h<=20;h++){
            for(let mi=0;mi<60;mi+=30){
              if(h===20&&mi>0)break;
              slots.push({h,m:mi,label:`${String(h).padStart(2,"0")}:${String(mi).padStart(2,"0")}`});
            }
          }
          const slotH=44;
          const top=(time)=>{
            const [hh,mm]=time.split(":").map(Number);
            const minsFrom6=(hh-6)*60+mm;
            return (minsFrom6/30)*slotH;
          };
          const dayLabels=["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];
          const todayISO = today();
          return(
            <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:2,overflow:"hidden"}}>
              {/* Header row with weekdays + dates */}
              <div style={{display:"grid",gridTemplateColumns:`64px repeat(7,minmax(0,1fr))`,borderBottom:`1px solid ${T.border}`}}>
                <div/>
                {days.map((d,i)=>{
                  const isTodayCol = d.iso===todayISO;
                  return(
                    <div key={i} onClick={()=>{setCalDate(d.date);setCalView("day");}} style={{
                      textAlign:"center",padding:"8px 4px",cursor:"pointer",
                      background:isTodayCol?`${T.gold}10`:"transparent",
                      borderLeft:`1.5px solid ${T.border}`,
                    }}>
                      <div style={{fontSize:10,fontWeight:700,color:isTodayCol?T.gold:T.gold,letterSpacing:1,textTransform:"uppercase"}}>{dayLabels[i]}</div>
                      <div style={{fontSize:16,fontWeight:isTodayCol?700:500,color:isTodayCol?T.gold:T.text,marginTop:2}}>{d.date.getDate()}</div>
                    </div>
                  );
                })}
              </div>
              {/* Time grid */}
              <div style={{position:"relative"}}>
                {slots.map((s,i)=>(
                  <div key={i} style={{
                    display:"grid",gridTemplateColumns:`64px repeat(7,minmax(0,1fr))`,height:slotH,
                    borderTop:i===0?"none":(s.m===0?`1.5px solid ${T.border}`:`1px dashed ${T.border}`),
                  }}>
                    <div style={{padding:"4px 10px 0 12px",fontSize:10,color:s.m===0?T.text:T.textDim,fontWeight:s.m===0?600:400,letterSpacing:.5,textAlign:"right"}}>
                      {s.m===0?s.label:""}
                    </div>
                    {days.map((d,di)=>(
                      <div key={di} onClick={()=>{setEditingEvent(null);setEventForm({title:"",date:d.iso,time:s.label,duration:60,type:"Llamada",clientId:"",notes:""});setShowEventForm(true);}} style={{
                        cursor:"pointer",transition:"background .15s",
                        borderLeft:`1.5px solid ${T.border}`,
                      }}
                      onMouseEnter={e=>{e.currentTarget.style.background=T.cardHover;}}
                      onMouseLeave={e=>{e.currentTarget.style.background="transparent";}}/>
                    ))}
                  </div>
                ))}
                {/* Events overlay — positioned over the time grid, padded by the time gutter */}
                <div style={{position:"absolute",top:0,left:64,right:0,bottom:0,pointerEvents:"none",display:"grid",gridTemplateColumns:"repeat(7,minmax(0,1fr))"}}>
                  {days.map((d,colIdx)=>{
                    const dayEvents=visibleEvents.filter(e=>e.date===d.iso).sort((a,b)=>a.time.localeCompare(b.time));
                    // Cluster logic for stacking overlapping events side-by-side
                    const evWithRange = dayEvents.map(ev=>{
                      const [hh,mm]=ev.time.split(":").map(Number);
                      const dur=Number(ev.duration)||60;
                      return {ev, dur, startMin:hh*60+mm, endMin:hh*60+mm+dur};
                    }).sort((a,b)=>a.startMin-b.startMin || b.dur-a.dur);
                    const clusters=[];
                    let current=null, clusterEnd=-Infinity;
                    for(const item of evWithRange){
                      if(item.startMin<clusterEnd){ current.push(item); clusterEnd=Math.max(clusterEnd,item.endMin); }
                      else { if(current) clusters.push(current); current=[item]; clusterEnd=item.endMin; }
                    }
                    if(current) clusters.push(current);
                    const placed=[];
                    for(const cluster of clusters){
                      const cols=[];
                      for(const item of cluster){
                        let ci = cols.findIndex(em=>em<=item.startMin);
                        if(ci===-1){ ci=cols.length; cols.push(item.endMin); }
                        else cols[ci]=item.endMin;
                        placed.push({...item,subColIdx:ci,subColsTotal:null,clusterRef:cols});
                      }
                      for(const p of placed){ if(p.clusterRef===cols) p.subColsTotal=cols.length; }
                    }
                    return(
                      <div key={d.iso} style={{position:"relative"}}>
                        {placed.map(({ev,dur,startMin,endMin,subColIdx,subColsTotal})=>{
                          const t=top(ev.time);
                          if(t<0||t>=slots.length*slotH)return null;
                          const rawH=(dur/30)*slotH-2;
                          const maxH=slots.length*slotH-t-2;
                          const h=Math.max(slotH-2,Math.min(rawH,maxH));
                          const bg=ev.type==="Llamada"?T.blue:ev.type==="Reunión"?T.green:ev.type==="Seguimiento"?T.gold:T.textMuted;
                          const leftPct = (subColIdx/subColsTotal)*100;
                          const widthPct = (1/subColsTotal)*100;
                          return(
                            <div key={ev.id} onClick={e=>{e.stopPropagation();setEditingEvent(ev);setEventForm({...ev,duration:dur});setShowEventForm(true);}} style={{
                              position:"absolute",top:t+1,height:h,
                              left:`calc(${leftPct}% + 2px)`,
                              width:`calc(${widthPct}% - 4px)`,
                              background:`${bg}1A`,borderLeft:`3px solid ${bg}`,borderRadius:2,
                              padding:"3px 5px",cursor:"pointer",pointerEvents:"auto",overflow:"hidden",
                              boxSizing:"border-box",
                            }}>
                              <div style={{fontSize:10,fontWeight:600,color:T.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",lineHeight:1.2}}>{ev.title}</div>
                              <div style={{fontSize:9,color:T.textMuted,marginTop:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",lineHeight:1.2}}>{ev.time}</div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })()}

        {/* DAY VIEW — agenda 6:00 AM → 8:00 PM, 30-min slots */}
        {calView==="day"&&(()=>{
          const y=calDate.getFullYear(), m=calDate.getMonth(), d=calDate.getDate();
          const dateStr=`${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
          const dayEvents=visibleEvents.filter(e=>e.date===dateStr).sort((a,b)=>a.time.localeCompare(b.time));
          const slots=[];
          for(let h=6;h<=20;h++){
            for(let mi=0;mi<60;mi+=30){
              if(h===20&&mi>0)break; // stop at 20:00
              slots.push({h,m:mi,label:`${String(h).padStart(2,"0")}:${String(mi).padStart(2,"0")}`});
            }
          }
          const slotH=44; // px height of each 30-min slot
          // Position events absolutely over the grid
          const top=(time)=>{
            const [hh,mm]=time.split(":").map(Number);
            const minsFrom6=(hh-6)*60+mm;
            return (minsFrom6/30)*slotH;
          };
          return(
            <div style={{position:"relative",background:T.surface,border:`1px solid ${T.border}`,borderRadius:2,overflow:"hidden"}}>
              {/* Time grid */}
              {slots.map((s,i)=>(
                <div key={i} onClick={()=>{setEditingEvent(null);setEventForm({title:"",date:dateStr,time:s.label,duration:60,type:"Llamada",clientId:"",notes:""});setShowEventForm(true);}} style={{
                  display:"flex",alignItems:"flex-start",height:slotH,
                  borderTop:i===0?"none":`1px solid ${s.m===0?T.border:T.border+"60"}`,
                  cursor:"pointer",transition:"background .15s",
                }}
                onMouseEnter={e=>{e.currentTarget.style.background=T.cardHover;}}
                onMouseLeave={e=>{e.currentTarget.style.background="transparent";}}>
                  <div style={{width:64,flexShrink:0,padding:"4px 10px 0 12px",fontSize:10,color:s.m===0?T.text:T.textDim,fontWeight:s.m===0?600:400,letterSpacing:.5,textAlign:"right"}}>
                    {s.m===0?s.label:""}
                  </div>
                  <div style={{flex:1,height:"100%"}}/>
                </div>
              ))}
              {/* Events overlay — supports overlapping events laid out side-by-side in columns */}
              {(()=>{
                // Pre-compute start/end minutes for each event
                const evWithRange = dayEvents.map(ev=>{
                  const [hh,mm]=ev.time.split(":").map(Number);
                  const dur=Number(ev.duration)||60;
                  return {ev, dur, startMin:hh*60+mm, endMin:hh*60+mm+dur};
                // Sort by start time, then by longer duration first so bigger events pick columns first
                }).sort((a,b)=>a.startMin-b.startMin || b.dur-a.dur);

                // Group overlapping events: iterate, when an event overlaps the running cluster extend it
                const clusters = [];
                let current = null;
                let clusterEnd = -Infinity;
                for(const item of evWithRange){
                  if(item.startMin < clusterEnd){
                    current.push(item);
                    clusterEnd = Math.max(clusterEnd, item.endMin);
                  } else {
                    if(current) clusters.push(current);
                    current = [item];
                    clusterEnd = item.endMin;
                  }
                }
                if(current) clusters.push(current);

                // Within each cluster, assign a column index (greedy: reuse a column if its event ended)
                const placed = [];
                for(const cluster of clusters){
                  const cols = []; // cols[i] = endMin of last event placed in column i
                  for(const item of cluster){
                    let colIdx = cols.findIndex(endMin=>endMin<=item.startMin);
                    if(colIdx===-1){ colIdx = cols.length; cols.push(item.endMin); }
                    else cols[colIdx] = item.endMin;
                    placed.push({...item, colIdx, colsTotal: null, clusterRef: cols});
                  }
                  // After the cluster is done, lock colsTotal
                  for(const p of placed){ if(p.clusterRef===cols) p.colsTotal = cols.length; }
                }

                return (
                  <div style={{position:"absolute",top:0,left:64,right:0,pointerEvents:"none"}}>
                    {placed.map(({ev,dur,startMin,endMin,colIdx,colsTotal})=>{
                      const t=top(ev.time);
                      if(t<0||t>=slots.length*slotH)return null;
                      const rawH=(dur/30)*slotH-4;
                      const maxH=slots.length*slotH-t-4;
                      const h=Math.max(slotH-4,Math.min(rawH,maxH));
                      const bg=ev.type==="Llamada"?T.blue:ev.type==="Reunión"?T.green:ev.type==="Seguimiento"?T.gold:T.textMuted;
                      const endH=Math.floor(endMin/60), endMn=endMin%60;
                      const endLabel=`${String(endH).padStart(2,"0")}:${String(endMn).padStart(2,"0")}`;
                      // Column layout: each column gets an equal share of the available width
                      const gutter = 4; // space between side-by-side columns, in px
                      const leftPct = (colIdx / colsTotal) * 100;
                      const widthPct = (1 / colsTotal) * 100;
                      return(
                        <div key={ev.id} onClick={e=>{e.stopPropagation();setEditingEvent(ev);setEventForm({...ev,duration:dur});setShowEventForm(true);}} style={{
                          position:"absolute",top:t+1,height:h,
                          left:`calc(${leftPct}% + ${colIdx===0?6:gutter/2}px)`,
                          width:`calc(${widthPct}% - ${colIdx===0?6+gutter/2:(colIdx===colsTotal-1?8+gutter/2:gutter)}px)`,
                          background:`${bg}1A`,borderLeft:`3px solid ${bg}`,borderRadius:2,
                          padding:"4px 8px",cursor:"pointer",pointerEvents:"auto",overflow:"hidden",
                          boxSizing:"border-box",
                        }}>
                          <div style={{fontSize:11,fontWeight:600,color:T.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{ev.title}</div>
                          <div style={{fontSize:10,color:T.textMuted,marginTop:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                            {colsTotal>1 ? `${ev.time}–${endLabel}` : `${ev.time}–${endLabel} · ${ev.type}${ev.clientId&&clients.find(c=>c.id==ev.clientId)?` · ${clients.find(c=>c.id==ev.clientId).name}`:""}`}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          );
        })()}

        {/* Upcoming events list */}
        <div style={{marginTop:20,background:T.surface,border:`1px solid ${T.border}`,borderRadius:2,padding:16}}>
          <div style={{fontSize:9,color:T.gold,letterSpacing:2,textTransform:"uppercase",marginBottom:12,fontWeight:600}}>Próximos eventos</div>
          {visibleEvents.filter(e=>e.date>=today()).sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time)).slice(0,8).map(ev=>(
            <div key={ev.id} className="rowHover" onClick={()=>{setEditingEvent(ev);setEventForm({...ev});setShowEventForm(true);}} style={{display:"flex",alignItems:"center",gap:12,padding:"8px 0",borderBottom:`1px solid ${T.border}`}}>
              <div style={{width:3,height:36,borderRadius:2,background:ev.type==="Llamada"?T.blue:ev.type==="Reunión"?T.green:ev.type==="Seguimiento"?T.gold:T.textMuted,flexShrink:0}}/>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:600,color:T.text}}>{ev.title}</div>
                <div style={{fontSize:11,color:T.textMuted}}>{ev.type}{ev.clientId&&clients.find(c=>c.id==ev.clientId)?` · ${clients.find(c=>c.id==ev.clientId).name}`:""}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:12,color:T.text,fontWeight:500}}>{ev.date}</div>
                <div style={{fontSize:11,color:T.textMuted}}>{ev.time}</div>
              </div>
            </div>
          ))}
          {visibleEvents.filter(e=>e.date>=today()).length===0&&<div style={{textAlign:"center",padding:"20px 0",color:T.textDim,fontSize:13}}>Sin eventos próximos — toca un día para agregar uno</div>}
        </div>
      </div>
    )}

    {/* ── EVENT FORM MODAL */}
    {showEventForm&&(
      <div style={{position:"fixed",inset:0,background:"rgba(44,36,32,.6)",zIndex:300,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:16,paddingTop:40,overflowY:"auto",overflowX:"hidden",animation:"fadeIn .2s"}} onClick={()=>setShowEventForm(false)}>
        <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:2,width:"100%",maxWidth:420,padding:20,animation:"fadeUp .25s",overflowX:"hidden"}} onClick={e=>e.stopPropagation()}>
          <div style={{fontFamily:"Cormorant Garamond,serif",fontSize:20,fontWeight:600,color:T.text,marginBottom:4}}>{editingEvent?"Editar evento":"Nuevo evento"}</div>
          <div style={{fontSize:9,color:T.gold,letterSpacing:2,textTransform:"uppercase",marginBottom:18}}>Agenda · Seguimiento</div>

          {[
            {label:"Título *",key:"title",type:"text",ph:"Ej: Llamada con cliente"},
          ].map(f=>(
            <div key={f.key} style={{marginBottom:12}}>
              <div style={{fontSize:9,color:T.gold,letterSpacing:1.5,textTransform:"uppercase",marginBottom:4}}>{f.label}</div>
              <input type={f.type} value={eventForm[f.key]} onChange={e=>setEventForm(ef=>({...ef,[f.key]:e.target.value}))} placeholder={f.ph}
                style={{...inputS,width:"100%"}}/>
            </div>
          ))}

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
            <div style={{minWidth:0}}>
              <div style={{fontSize:9,color:T.gold,letterSpacing:1.5,textTransform:"uppercase",marginBottom:4}}>Fecha</div>
              <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:2,padding:"9px 10px",display:"flex",alignItems:"center",justifyContent:"center"}}>
                <input type="date" value={eventForm.date} onChange={e=>setEventForm(ef=>({...ef,date:e.target.value}))}
                  style={{background:"transparent",border:"none",outline:"none",color:T.text,fontSize:12,fontFamily:"Jost,sans-serif",width:"100%",textAlign:"center"}}/>
              </div>
            </div>
            <div style={{minWidth:0}}>
              <div style={{fontSize:9,color:T.gold,letterSpacing:1.5,textTransform:"uppercase",marginBottom:4}}>Hora</div>
              <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:2,padding:"9px 10px",display:"flex",alignItems:"center",justifyContent:"center"}}>
                <input type="time" value={eventForm.time} onChange={e=>setEventForm(ef=>({...ef,time:e.target.value}))}
                  style={{background:"transparent",border:"none",outline:"none",color:T.text,fontSize:12,fontFamily:"Jost,sans-serif",width:"100%",textAlign:"center"}}/>
              </div>
            </div>
          </div>

          {/* Duration selector */}
          <div style={{marginBottom:12}}>
            <div style={{fontSize:9,color:T.gold,letterSpacing:1.5,textTransform:"uppercase",marginBottom:4}}>Duración</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {[
                {v:15,label:"15 min"},
                {v:30,label:"30 min"},
                {v:45,label:"45 min"},
                {v:60,label:"1 h"},
                {v:90,label:"1.5 h"},
                {v:120,label:"2 h"},
                {v:180,label:"3 h"},
                {v:240,label:"4 h"},
              ].map(d=>(
                <button key={d.v} className="pBtn" onClick={()=>setEventForm(ef=>({...ef,duration:d.v}))} style={{padding:"5px 10px",borderRadius:2,fontSize:11,border:`1px solid ${Number(eventForm.duration)===d.v?T.gold:T.border}`,background:Number(eventForm.duration)===d.v?`${T.gold}18`:"transparent",color:Number(eventForm.duration)===d.v?T.gold:T.textMuted}}>{d.label}</button>
              ))}
              <div style={{display:"flex",alignItems:"center",gap:4,background:T.card,border:`1px solid ${[15,30,45,60,90,120,180,240].includes(Number(eventForm.duration))?T.border:T.gold}`,borderRadius:2,padding:"3px 8px"}}>
                <input type="number" min="5" max="720" step="5" inputMode="numeric"
                  value={eventForm.duration===""||eventForm.duration==null?"":eventForm.duration}
                  onFocus={e=>e.target.select()}
                  onChange={e=>{
                    const v=e.target.value;
                    // Allow empty while typing; otherwise store the raw (sanitized) string
                    if(v===""){setEventForm(ef=>({...ef,duration:""}));return;}
                    const n=parseInt(v,10);
                    if(!isNaN(n)) setEventForm(ef=>({...ef,duration:n}));
                  }}
                  onBlur={e=>{
                    const n=parseInt(e.target.value,10);
                    if(isNaN(n)||n<5) setEventForm(ef=>({...ef,duration:60}));
                    else if(n>720) setEventForm(ef=>({...ef,duration:720}));
                  }}
                  placeholder="min"
                  style={{width:46,background:"transparent",border:"none",outline:"none",color:T.text,fontSize:12,fontFamily:"Jost,sans-serif",textAlign:"center"}}/>
                <span style={{fontSize:10,color:T.textMuted}}>min</span>
              </div>
            </div>
          </div>

          <div style={{marginBottom:12}}>
            <div style={{fontSize:9,color:T.gold,letterSpacing:1.5,textTransform:"uppercase",marginBottom:4}}>Tipo</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {["Llamada","Reunión","Seguimiento","Propuesta","Pago","Otro"].map(t=>(
                <button key={t} className="pBtn" onClick={()=>setEventForm(ef=>({...ef,type:t}))} style={{padding:"5px 12px",borderRadius:2,fontSize:11,border:`1px solid ${eventForm.type===t?T.gold:T.border}`,background:eventForm.type===t?`${T.gold}18`:"transparent",color:eventForm.type===t?T.gold:T.textMuted}}>{t}</button>
              ))}
            </div>
          </div>

          <div style={{marginBottom:12}}>
            <div style={{fontSize:9,color:T.gold,letterSpacing:1.5,textTransform:"uppercase",marginBottom:4}}>Cliente (opcional)</div>
            <select value={eventForm.clientId||""} onChange={e=>setEventForm(ef=>({...ef,clientId:e.target.value}))}
              style={{width:"100%",background:T.card,border:`1px solid ${T.border}`,borderRadius:2,padding:"9px 12px",color:T.text,fontSize:13,fontFamily:"Jost,sans-serif"}}>
              <option value="">Sin cliente asociado</option>
              {visibleClients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div style={{marginBottom:18}}>
            <div style={{fontSize:9,color:T.gold,letterSpacing:1.5,textTransform:"uppercase",marginBottom:4}}>Notas</div>
            <textarea value={eventForm.notes||""} onChange={e=>setEventForm(ef=>({...ef,notes:e.target.value}))} placeholder="Detalles del evento..." rows={2}
              style={{width:"100%",background:T.card,border:`1px solid ${T.border}`,borderRadius:2,padding:"9px 12px",color:T.text,fontSize:13,fontFamily:"Jost,sans-serif",resize:"vertical"}}/>
          </div>

          <div style={{display:"flex",gap:8}}>
            {editingEvent&&<button className="pBtn" onClick={async()=>{
              const previousEvent = events.find(e=>e.id===editingEvent.id);
              const previousList = events;
              // Optimistic delete
              setEvents(events.filter(e=>e.id!==editingEvent.id));
              setShowEventForm(false);
              showN("Evento eliminado");
              if(supabase&&user){
                await trySupabase(
                  () => supabase.from("events").delete().eq("id",editingEvent.id),
                  () => { setEvents(previousList); }
                );
              }
            }} style={{background:"transparent",border:`1px solid ${T.red}40`,color:T.red,padding:"10px 14px",borderRadius:2,fontSize:11}}>Eliminar</button>}
            <button className="pBtn" onClick={()=>setShowEventForm(false)} style={{flex:1,background:T.card,border:`1px solid ${T.border}`,color:T.textMuted,padding:"10px",borderRadius:2,fontSize:11}}>Cancelar</button>
            <button className="pBtn" onClick={()=>{
              if(!eventForm.title.trim())return;
              // Normalize duration
              const durNum = Math.max(5, Math.min(720, parseInt(eventForm.duration,10)||60));
              const toSave={...eventForm,duration:durNum};
              // Detect conflicts: same date, time ranges overlap, different id
              const [hh,mm]=toSave.time.split(":").map(Number);
              const startA=hh*60+mm, endA=startA+durNum;
              const overlapping = visibleEvents.filter(e=>{
                if(editingEvent&&e.id===editingEvent.id) return false;
                if(e.date!==toSave.date) return false;
                const [h2,m2]=e.time.split(":").map(Number);
                const startB=h2*60+m2, endB=startB+(Number(e.duration)||60);
                return startA<endB && startB<endA;
              });
              if(overlapping.length>0){
                setConflictInfo({toSave,overlapping});
                return;
              }
              // No conflict → save directly
              saveEventNow(toSave);
            }} style={{flex:2,background:T.grad,color:"#fff",padding:"10px",borderRadius:2,fontSize:11,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase"}}>
              {editingEvent?"Guardar":"Agregar"}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ── CONFLICT WARNING MODAL */}
    {conflictInfo&&(()=>{
      const fmtTime=(t,dur)=>{
        const [h,m]=t.split(":").map(Number);
        const endMin=h*60+m+(Number(dur)||60);
        const eh=Math.floor(endMin/60), em=endMin%60;
        return `${t}–${String(eh).padStart(2,"0")}:${String(em).padStart(2,"0")}`;
      };
      return(
      <div style={{position:"fixed",inset:0,background:"rgba(44,36,32,.7)",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:16,animation:"fadeIn .2s"}} onClick={()=>setConflictInfo(null)}>
        <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:2,width:"100%",maxWidth:420,padding:22,animation:"fadeUp .25s"}} onClick={e=>e.stopPropagation()}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
            <div style={{width:28,height:28,borderRadius:"50%",background:`${T.red}18`,color:T.red,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,flexShrink:0}}>!</div>
            <div style={{fontFamily:"Cormorant Garamond,serif",fontSize:20,fontWeight:600,color:T.text}}>Horario ocupado</div>
          </div>
          <div style={{fontSize:9,color:T.gold,letterSpacing:2,textTransform:"uppercase",marginBottom:14,paddingLeft:38}}>Conflicto de agenda</div>

          <div style={{fontSize:13,color:T.text,lineHeight:1.5,marginBottom:12}}>
            Ya tienes {conflictInfo.overlapping.length===1?"un evento":`${conflictInfo.overlapping.length} eventos`} agendado{conflictInfo.overlapping.length===1?"":"s"} en ese horario:
          </div>

          <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:2,padding:12,marginBottom:16,maxHeight:180,overflowY:"auto"}}>
            {conflictInfo.overlapping.map(ev=>{
              const col=ev.type==="Llamada"?T.blue:ev.type==="Reunión"?T.green:ev.type==="Seguimiento"?T.gold:T.textMuted;
              return(
                <div key={ev.id} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"6px 0",borderBottom:`1px solid ${T.border}40`}}>
                  <div style={{width:3,alignSelf:"stretch",background:col,borderRadius:2,flexShrink:0}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:600,color:T.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{ev.title}</div>
                    <div style={{fontSize:10,color:T.textMuted,marginTop:1}}>{fmtTime(ev.time,ev.duration)} · {ev.type}</div>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{fontSize:12,color:T.textMuted,marginBottom:16,lineHeight:1.5}}>
            ¿Quieres agendarlo de todas formas, o prefieres cambiar la hora?
          </div>

          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <button className="pBtn" onClick={()=>{setConflictInfo(null);}} style={{background:T.grad,color:"#fff",padding:"11px",borderRadius:2,fontSize:11,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase"}}>
              Cambiar horario
            </button>
            <button className="pBtn" onClick={()=>saveEventNow(conflictInfo.toSave)} style={{background:T.card,border:`1px solid ${T.border}`,color:T.text,padding:"11px",borderRadius:2,fontSize:11,fontWeight:600,letterSpacing:1.5,textTransform:"uppercase"}}>
              Agendar de todas formas
            </button>
          </div>
        </div>
      </div>
      );
    })()}

    {/* ── IMPORT CLIENTS MODAL */}
    {showImport && (
      <ImportClients
        onClose={()=>setShowImport(false)}
        currentProfId={currentProfId}
        profession={profession}
        stages={cfgStages}
        existingCount={visibleClients.length}
        onImport={async(clientData) => {
          // Use the same toDb path as `save()` for consistency
          if(!supabase || !user){
            // Local fallback: just push to state
            setClients(cs => [...cs, {...clientData, id: Date.now()+Math.random()}]);
            return true;
          }
          const dbRow = {
            user_id: user.id,
            name: clientData.name,
            company: clientData.company,
            email: clientData.email,
            phone: clientData.phone,
            address: clientData.address,
            value: clientData.value,
            currency: clientData.currency,
            stage: clientData.stage,
            source: clientData.source,
            tags: clientData.tags,
            notes: clientData.notes,
            privacy_consent: clientData.privacyConsent,
            activities: clientData.activities,
            tasks: clientData.tasks,
            files: clientData.files,
            stage_history: clientData.stageHistory,
            profession_id: clientData.professionId,
            profession_label: clientData.professionLabel,
            profession_icon: clientData.professionIcon,
          };
          const {data, error} = await supabase.from("clients").insert(dbRow).select().single();
          if(error){ console.error("import error", error); return false; }
          // Add to local state with hydrated server id and any defaults from DB
          const newClient = {
            ...clientData, ...data,
            tags: data.tags || [],
            activities: data.activities || [],
            tasks: data.tasks || [],
            files: data.files || [],
            stageHistory: data.stage_history || [],
            expectedClose: data.expected_close,
            lastContact: data.last_contact,
            privacyConsent: data.privacy_consent,
            professionId: data.profession_id,
          };
          setClients(cs => [newClient, ...cs]);
          return true;
        }}
      />
    )}

    {/* ── GLOBAL SEARCH MODAL */}
    {globalSearchOpen && (()=>{
      const q = globalSearchQuery.toLowerCase().trim();
      // Build results across clients, events, tasks (workspace-scoped)
      const clientResults = q ? visibleClients.filter(c => {
        const blob = [
          c.name, c.email, c.phone, c.company, c.address, c.notes,
          (c.tags||[]).join(" "),
        ].filter(Boolean).join(" ").toLowerCase();
        return blob.includes(q);
      }).slice(0, 12) : [];
      const eventResults = q ? visibleEvents.filter(e => {
        const blob = [e.title, e.notes, e.type].filter(Boolean).join(" ").toLowerCase();
        return blob.includes(q);
      }).slice(0, 8) : [];
      const taskResults = q ? visibleClients.flatMap(c =>
        (c.tasks||[]).filter(t => (t.title||"").toLowerCase().includes(q)).map(t => ({...t, clientId: c.id, clientName: c.name}))
      ).slice(0, 12) : [];
      const totalResults = clientResults.length + eventResults.length + taskResults.length;

      const goToClient = (c) => {
        setGlobalSearchOpen(false);
        setSelected(c);
        setView("kanban");
      };
      const goToEvent = (ev) => {
        setGlobalSearchOpen(false);
        setEditingEvent(ev);
        setEventForm({...ev});
        setShowEventForm(true);
      };
      const goToTask = (t) => {
        const c = visibleClients.find(cl => cl.id === t.clientId);
        if(!c) return;
        setGlobalSearchOpen(false);
        setSelected(c);
        setDetailTab("tasks");
      };
      const highlight = (text) => {
        if(!q || !text) return text;
        const lower = String(text).toLowerCase();
        const idx = lower.indexOf(q);
        if(idx === -1) return text;
        return <>{text.slice(0,idx)}<mark style={{background:`${T.gold}40`,color:T.text,padding:"0 1px"}}>{text.slice(idx, idx+q.length)}</mark>{text.slice(idx+q.length)}</>;
      };

      return(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.45)",zIndex:600,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"60px 16px 16px"}} onClick={()=>setGlobalSearchOpen(false)}>
          <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:3,maxWidth:560,width:"100%",maxHeight:"80vh",display:"flex",flexDirection:"column"}} onClick={e=>e.stopPropagation()}>
            {/* Search input */}
            <div style={{padding:"12px 14px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:18,color:T.gold,flexShrink:0}}>⌕</span>
              <input
                type="text"
                value={globalSearchQuery}
                onChange={e=>setGlobalSearchQuery(e.target.value)}
                onKeyDown={e=>{
                  if(e.key === "Escape") setGlobalSearchOpen(false);
                  // Quick navigation: if only 1 result total and Enter, jump to it
                  if(e.key === "Enter" && totalResults === 1){
                    if(clientResults[0]) goToClient(clientResults[0]);
                    else if(eventResults[0]) goToEvent(eventResults[0]);
                    else if(taskResults[0]) goToTask(taskResults[0]);
                  }
                }}
                autoFocus
                placeholder="Buscar clientes, eventos, tareas..."
                style={{flex:1,background:"transparent",border:"none",outline:"none",fontSize:14,color:T.text,fontFamily:"Jost,sans-serif",padding:"6px 0"}}
              />
              <button onClick={()=>setGlobalSearchOpen(false)} title="Cerrar" style={{background:"transparent",border:`1px solid ${T.border}`,color:T.textMuted,fontSize:13,cursor:"pointer",padding:"3px 8px",borderRadius:2,lineHeight:1}}>✕</button>
            </div>

            {/* Results */}
            <div style={{overflowY:"auto",flex:1,padding:q ? "8px 0" : "32px 16px"}}>
              {!q && (
                <div style={{textAlign:"center",color:T.textDim,fontSize:12,lineHeight:1.6}}>
                  Buscar en {visibleClients.length} cliente(s), {visibleEvents.length} evento(s) y {visibleClients.reduce((s,c)=>s+(c.tasks||[]).length,0)} tarea(s) del workspace activo<br/>
                  <span style={{fontSize:10,color:T.textDim,marginTop:6,display:"inline-block"}}>Workspace: {profession?.icon} {profession?.label}</span>
                </div>
              )}

              {q && totalResults === 0 && (
                <div style={{textAlign:"center",color:T.textDim,fontSize:13,padding:"32px 16px"}}>
                  Sin resultados para "{globalSearchQuery}"
                </div>
              )}

              {/* Clients */}
              {clientResults.length > 0 && (
                <div style={{marginBottom:8}}>
                  <div style={{fontSize:9,color:T.gold,letterSpacing:1.5,textTransform:"uppercase",fontWeight:600,padding:"6px 16px"}}>Clientes ({clientResults.length})</div>
                  {clientResults.map(c => (
                    <div key={c.id} onClick={()=>goToClient(c)} className="rowHover" style={{padding:"9px 16px",cursor:"pointer",borderBottom:`1px solid ${T.border}30`}}>
                      <div style={{fontSize:13,color:T.text,fontWeight:500}}>{highlight(c.name)}</div>
                      <div style={{fontSize:10,color:T.textMuted,marginTop:2,display:"flex",gap:8,flexWrap:"wrap"}}>
                        <span style={{color:sc(c.stage),fontWeight:500}}>{c.stage}</span>
                        {c.company && <span>· {highlight(c.company)}</span>}
                        {c.email && <span>· {highlight(c.email)}</span>}
                        {c.phone && <span>· {highlight(c.phone)}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Events */}
              {eventResults.length > 0 && (
                <div style={{marginBottom:8}}>
                  <div style={{fontSize:9,color:T.gold,letterSpacing:1.5,textTransform:"uppercase",fontWeight:600,padding:"6px 16px"}}>Eventos ({eventResults.length})</div>
                  {eventResults.map(ev => {
                    const cn = ev.clientId ? (clients.find(c => c.id == ev.clientId)?.name || "") : "";
                    return(
                      <div key={ev.id} onClick={()=>goToEvent(ev)} className="rowHover" style={{padding:"9px 16px",cursor:"pointer",borderBottom:`1px solid ${T.border}30`,display:"flex",alignItems:"center",gap:10}}>
                        <div style={{width:3,height:28,borderRadius:2,background:ev.type==="Llamada"?T.blue:ev.type==="Reunión"?T.green:ev.type==="Seguimiento"?T.gold:T.textMuted,flexShrink:0}}/>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,color:T.text,fontWeight:500,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{highlight(ev.title)}</div>
                          <div style={{fontSize:10,color:T.textMuted,marginTop:2}}>{ev.type} · {ev.date} {ev.time}{cn?` · ${cn}`:""}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Tasks */}
              {taskResults.length > 0 && (
                <div style={{marginBottom:8}}>
                  <div style={{fontSize:9,color:T.gold,letterSpacing:1.5,textTransform:"uppercase",fontWeight:600,padding:"6px 16px"}}>Tareas ({taskResults.length})</div>
                  {taskResults.map(t => (
                    <div key={t.id} onClick={()=>goToTask(t)} className="rowHover" style={{padding:"9px 16px",cursor:"pointer",borderBottom:`1px solid ${T.border}30`,display:"flex",alignItems:"center",gap:10}}>
                      <span style={{fontSize:12,color:t.done?T.green:T.textMuted,flexShrink:0,width:14}}>{t.done?"✓":"○"}</span>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,color:T.text,fontWeight:500,textDecoration:t.done?"line-through":"none",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{highlight(t.title)}</div>
                        <div style={{fontSize:10,color:T.textMuted,marginTop:2}}>{t.clientName}{t.due?` · vence ${t.due}`:""}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer hint */}
            {q && totalResults > 0 && totalResults === 1 && (
              <div style={{padding:"8px 16px",borderTop:`1px solid ${T.border}`,fontSize:10,color:T.textDim,textAlign:"center"}}>
                Enter para abrir
              </div>
            )}
          </div>
        </div>
      );
    })()}

    {/* ── EXPORT MODAL */}
    {showExport && (()=>{
      const taskCount = visibleClients.reduce((s,c) => s + (c.tasks||[]).length, 0);
      const opts = [
        {id:"clients", icon:"👥", title:"Clientes",  count:visibleClients.length, desc:"Nombre, contacto, etapa, valor, notas"},
        {id:"events",  icon:"📅", title:"Eventos",   count:visibleEvents.length,  desc:"Llamadas, reuniones, seguimientos"},
        {id:"tasks",   icon:"✓",  title:"Tareas",    count:taskCount,              desc:"Tareas de todos tus clientes"},
        {id:"all",     icon:"📦", title:"Todo (.zip)", count:visibleClients.length+visibleEvents.length+taskCount, desc:"Las 3 tablas en un archivo .zip"},
      ];
      return(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:600,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setShowExport(false)}>
          <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:3,maxWidth:520,width:"100%",maxHeight:"90vh",display:"flex",flexDirection:"column"}} onClick={e=>e.stopPropagation()}>
            <div style={{padding:"18px 22px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div>
                <div style={{fontFamily:"Cormorant Garamond,serif",fontSize:22,fontWeight:600,color:T.text}}>Exportar datos</div>
                <div style={{fontSize:11,color:T.textMuted,marginTop:2}}>Workspace: {profession?.icon} {profession?.label}</div>
              </div>
              <button onClick={()=>setShowExport(false)} style={{background:"transparent",border:`1px solid ${T.border}`,color:T.textMuted,padding:"4px 10px",borderRadius:2,fontSize:14,cursor:"pointer"}}>✕</button>
            </div>
            <div style={{padding:"20px 22px",overflowY:"auto",flex:1}}>
              <p style={{fontSize:12,color:T.textMuted,marginBottom:18,lineHeight:1.6}}>Descarga tus datos como CSV (Excel). Los archivos pueden abrirse en Excel, Google Sheets o Numbers.</p>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {opts.map(o => (
                  <button key={o.id} className="pBtn"
                    onClick={async()=>{
                      if(o.count===0){ showN("Sin datos para exportar"); return; }
                      setShowExport(false);
                      if(o.id === "all") await exportAll();
                      else exportSingle(o.id);
                    }}
                    disabled={o.count===0}
                    style={{
                      background: o.count===0 ? T.bg : T.card,
                      border:`1px solid ${o.count===0 ? T.border : (o.id==="all" ? T.gold : T.border)}`,
                      borderRadius:2, padding:"14px 16px",
                      display:"flex", alignItems:"center", gap:14, textAlign:"left",
                      cursor: o.count===0 ? "not-allowed" : "pointer",
                      opacity: o.count===0 ? .5 : 1,
                      transition:"all .15s",
                    }}
                  >
                    <span style={{fontSize:24,flexShrink:0}}>{o.icon}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:600,color:T.text}}>
                        {o.title}
                        <span style={{fontSize:11,color:o.count===0?T.textDim:T.gold,marginLeft:8,fontWeight:500}}>
                          ({o.count} {o.count === 1 ? "registro" : "registros"})
                        </span>
                      </div>
                      <div style={{fontSize:11,color:T.textMuted,marginTop:3,lineHeight:1.4}}>{o.desc}</div>
                    </div>
                    <span style={{fontSize:14,color:o.count===0?T.textDim:T.gold,flexShrink:0}}>↓</span>
                  </button>
                ))}
              </div>
              <div style={{marginTop:16,fontSize:10,color:T.textDim,lineHeight:1.5,padding:"10px 12px",background:T.bg,borderRadius:2,borderLeft:`2px solid ${T.gold}`}}>
                <strong>Tip:</strong> Los datos exportados solo incluyen el workspace activo ({profession?.label}). Para exportar otro workspace, cambia primero usando el ▼ del header.
              </div>
            </div>
          </div>
        </div>
      );
    })()}

    {/* ── SETTINGS MODAL */}
    {showSettings&&(
      <div style={{position:"fixed",inset:0,background:"rgba(44,36,32,.6)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16,animation:"fadeIn .2s"}} onClick={()=>setShowSettings(false)}>
        <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:2,width:520,maxHeight:"88vh",display:"flex",flexDirection:"column",animation:"fadeUp .25s"}} onClick={e=>e.stopPropagation()}>

          <div style={{padding:"18px 22px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
            <div>
              <div style={{fontFamily:"Cormorant Garamond,serif",fontSize:20,fontWeight:600,color:T.text}}>Configuración</div>
              <div style={{fontSize:9,color:T.gold,letterSpacing:2,textTransform:"uppercase",marginTop:2}}>Personaliza tu CRM</div>
            </div>
            <button className="pBtn" onClick={()=>setShowSettings(false)} style={{background:"transparent",color:T.textMuted,fontSize:16,border:`1px solid ${T.border}`,borderRadius:2,padding:"4px 8px"}}>✕</button>
          </div>

          <div style={{display:"flex",borderBottom:`1px solid ${T.border}`,flexShrink:0}}>
            {[["perfil","👤 Perfil"],["etapas","📋 Etapas"],["categoria","🏷️ Categoría"],["devices","📱 Sesiones"],["apariencia","🎨 Apariencia"]].map(([id,label])=>(
              <button key={id} className="tabBtn" onClick={()=>setSettTab(id)} style={{flex:1,padding:"10px 6px",fontSize:10,letterSpacing:.5,textTransform:"uppercase",background:"transparent",color:settTab===id?T.gold:T.textMuted,borderBottom:settTab===id?`2px solid ${T.gold}`:"2px solid transparent",marginBottom:-1,fontWeight:settTab===id?600:400}}>{label}</button>
            ))}
          </div>

          <div style={{flex:1,overflowY:"auto",padding:"18px 22px"}}>

            {/* PERFIL */}
            {settTab==="perfil"&&(
              <div>
                <div style={{marginBottom:14}}>
                  <div style={{fontSize:9,color:T.gold,letterSpacing:1.5,textTransform:"uppercase",marginBottom:5,fontWeight:600}}>Tu nombre</div>
                  <input value={settName} onChange={e=>setSettName(e.target.value)} placeholder="Tu nombre completo"
                    style={{width:"100%",background:T.card,border:`1px solid ${T.border}`,borderRadius:2,padding:"10px 13px",color:T.text,fontSize:14,fontFamily:"Jost,sans-serif"}}/>
                </div>
                <div style={{marginBottom:22}}>
                  <div style={{fontSize:9,color:T.gold,letterSpacing:1.5,textTransform:"uppercase",marginBottom:5,fontWeight:600}}>Nombre de tu negocio</div>
                  <input value={settCompany} onChange={e=>setSettCompany(e.target.value)} placeholder="Tu estudio o empresa"
                    style={{width:"100%",background:T.card,border:`1px solid ${T.border}`,borderRadius:2,padding:"10px 13px",color:T.text,fontSize:14,fontFamily:"Jost,sans-serif"}}/>
                </div>
                <button className="pBtn" onClick={async()=>{
                  if(supabase&&user){
                    const res = await trySupabase(
                      () => supabase.from("profiles").update({name:settName,company:settCompany}).eq("id",user.id)
                    );
                    if(!res.ok) return;
                  }
                  if(onReset) onReset({...config,name:settName,company:settCompany});
                  showN("✅ Perfil actualizado");
                  setShowSettings(false);
                }} style={{width:"100%",background:T.grad,color:"#fff",padding:"11px",borderRadius:2,fontSize:11,fontWeight:700,letterSpacing:2,textTransform:"uppercase"}}>
                  Guardar cambios
                </button>
              </div>
            )}

            {/* ETAPAS */}
            {settTab==="etapas"&&(
              <div>
                <p style={{fontSize:12,color:T.textMuted,marginBottom:14,lineHeight:1.6}}>Edita los nombres, reordena arrastrando o agrega nuevas etapas. Los clientes existentes mantienen su etapa.</p>
                <div style={{maxHeight:"38vh",overflowY:"auto",marginBottom:10}}>
                  {settStages.map((s,i)=>(
                    <div key={i} draggable
                      onDragStart={()=>setSettDragIdx(i)}
                      onDragOver={e=>{e.preventDefault();setSettOverIdx(i);}}
                      onDrop={()=>{
                        if(settDragIdx===null||settDragIdx===i)return;
                        const arr=[...settStages];
                        const[item]=arr.splice(settDragIdx,1);
                        arr.splice(i,0,item);
                        setSettStages(arr);
                        setSettDragIdx(null);setSettOverIdx(null);
                      }}
                      onDragEnd={()=>{setSettDragIdx(null);setSettOverIdx(null);}}
                      style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",background:settOverIdx===i?T.cardHover:T.card,border:`1px solid ${settOverIdx===i?T.gold+"80":T.border}`,borderRadius:2,marginBottom:5,cursor:"grab",opacity:settDragIdx===i?.3:1,transition:"all .15s"}}>
                      {/* Touch reorder buttons */}
                      <div style={{display:"flex",flexDirection:"column",gap:1,flexShrink:0}}>
                        <button className="pBtn" onClick={()=>{
                          if(i===0)return;
                          const arr=[...settStages];
                          const[item]=arr.splice(i,1);
                          arr.splice(i-1,0,item);
                          setSettStages(arr);
                        }} style={{background:"transparent",border:"none",color:i===0?T.border:T.textMuted,fontSize:10,padding:"0 2px",lineHeight:1,cursor:i===0?"default":"pointer"}}>▲</button>
                        <button className="pBtn" onClick={()=>{
                          if(i===settStages.length-1)return;
                          const arr=[...settStages];
                          const[item]=arr.splice(i,1);
                          arr.splice(i+1,0,item);
                          setSettStages(arr);
                        }} style={{background:"transparent",border:"none",color:i===settStages.length-1?T.border:T.textMuted,fontSize:10,padding:"0 2px",lineHeight:1,cursor:i===settStages.length-1?"default":"pointer"}}>▼</button>
                      </div>
                      <div style={{width:8,height:8,borderRadius:"50%",background:s.color||T.gold,flexShrink:0}}/>
                      <input value={s.label} onChange={e=>{const arr=[...settStages];arr[i]={...arr[i],label:e.target.value};setSettStages(arr);}}
                        style={{flex:1,background:"transparent",border:"none",color:T.text,fontSize:13,fontFamily:"Jost,sans-serif",outline:"none"}}/>
                      <button className="pBtn" onClick={()=>setSettStages(settStages.filter((_,idx)=>idx!==i))} style={{background:"transparent",color:T.red,fontSize:15,padding:"0 2px",flexShrink:0}}>×</button>
                    </div>
                  ))}
                </div>
                <div style={{display:"flex",gap:7,marginBottom:18}}>
                  <input value={settNewStage} onChange={e=>setSettNewStage(e.target.value)}
                    onKeyDown={e=>{if(e.key==="Enter"&&settNewStage.trim()){setSettStages([...settStages,{label:settNewStage.trim(),color:PALETTE[settStages.length%PALETTE.length]}]);setSettNewStage("");}}}
                    placeholder="+ Nueva etapa..."
                    style={{flex:1,background:T.card,border:`1px solid ${T.border}`,borderRadius:2,padding:"9px 12px",color:T.text,fontSize:13,fontFamily:"Jost,sans-serif"}}/>
                  <button className="pBtn" onClick={()=>{if(settNewStage.trim()){setSettStages([...settStages,{label:settNewStage.trim(),color:PALETTE[settStages.length%PALETTE.length]}]);setSettNewStage("");}}}
                    style={{background:T.card,border:`1px solid ${T.border}`,color:T.gold,padding:"9px 14px",borderRadius:2,fontSize:17}}>+</button>
                </div>
                <button className="pBtn" onClick={async()=>{
                  // The workspace whose stages we're saving = the one selected in this dialog
                  const targetProfId = settProf?.id || config.profession?.id;
                  // Build updated workspaces map: keep all other workspaces intact, update this one
                  const newWorkspaces = {...(config.workspaces||{}), [targetProfId]: settStages};
                  if(supabase&&user){
                    const res = await trySupabase(
                      () => supabase.from("profiles").update({
                        stages:settStages,           // legacy field — keep in sync with active workspace
                        workspaces:newWorkspaces,    // workspace-specific stages
                        profession_id:targetProfId,
                        profession_label:settProf?.label||config.profession?.label,
                        profession_icon:settProf?.icon||config.profession?.icon,
                      }).eq("id",user.id)
                    );
                    if(!res.ok) return;
                  }
                  // Update local config immediately without reload
                  if(onReset) onReset({
                    ...config,
                    stages:settStages,
                    workspaces:newWorkspaces,
                    profession:settProf||config.profession,
                  });
                  showN("✅ Guardado correctamente");
                  setShowSettings(false);
                }} style={{width:"100%",background:T.grad,color:"#fff",padding:"11px",borderRadius:2,fontSize:11,fontWeight:700,letterSpacing:2,textTransform:"uppercase"}}>
                  Guardar etapas
                </button>
              </div>
            )}

            {/* CATEGORÍA */}
            {settTab==="categoria"&&(
              <div>
                <p style={{fontSize:12,color:T.textMuted,marginBottom:14,lineHeight:1.6}}>Cambia tu workspace activo. Si ya habías usado esta categoría, se cargan tus etapas guardadas. Si es nueva, se cargan las predeterminadas.</p>
                <div style={{maxHeight:"48vh",overflowY:"auto"}}>
                  {CATEGORIES.map(cat=>(
                    <div key={cat.group} style={{marginBottom:16}}>
                      <div style={{fontSize:9,color:T.gold,letterSpacing:2,textTransform:"uppercase",marginBottom:7,paddingBottom:5,borderBottom:`1px solid ${T.border}`,fontWeight:600}}>{cat.group}</div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5}}>
                        {cat.items.map(p=>{
                          const isActive=settProf?.id===p.id;
                          return(
                            <button key={p.id} className="pBtn" onClick={()=>{
                              setSettProf(p);
                              // If this workspace already has saved stages, restore them.
                              // Otherwise initialize with the profession's default stages.
                              const savedStages = (config.workspaces||{})[p.id];
                              if(savedStages && savedStages.length>0){
                                setSettStages(savedStages);
                                showN(`✅ "${p.label}" — etapas restauradas`);
                              } else {
                                setSettStages(p.stages.map((s,i)=>({label:s,color:PALETTE[i%PALETTE.length]})));
                                showN(`✅ "${p.label}" — workspace nuevo, etapas predeterminadas`);
                              }
                              setSettTab("etapas");
                            }} style={{background:isActive?`${T.gold}15`:T.card,border:`1px solid ${isActive?T.gold:T.border}`,borderRadius:2,padding:"9px 10px",display:"flex",alignItems:"center",gap:7,color:T.text,textAlign:"left",transition:"all .15s"}}>
                              <span style={{fontSize:16,flexShrink:0}}>{p.icon}</span>
                              <span style={{fontSize:11,lineHeight:1.3,color:isActive?T.gold:T.text}}>{p.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* DISPOSITIVOS / SESIONES */}
            {settTab==="devices"&&(()=>{
              // We use a tiny self-contained panel that fetches and manages devices.
              // It relies on `supabase` and `user` props already passed to CRM.
              return <DevicesPanel supabase={supabase} user={user} onSignOut={onSignOut}/>;
            })()}

            {/* APARIENCIA */}
            {settTab==="apariencia"&&(
              <div>
                <p style={{fontSize:12,color:T.textMuted,marginBottom:20,lineHeight:1.6}}>Elige la combinacion de colores de tu CRM. Se guarda automaticamente en tu cuenta.</p>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,width:"100%",minWidth:0}}>
                  {Object.values(THEMES).map(theme=>{
                    const isActive=themeId===theme.id;
                    return(
                      <button key={theme.id} className="pBtn" onClick={async()=>{
                        if(onThemeChange) await onThemeChange(theme.id);
                        showN("Tema aplicado");
                        setShowSettings(false);
                      }} style={{background:theme.bg,border:`2px solid ${isActive?theme.gold:theme.border}`,borderRadius:4,padding:14,textAlign:"left",cursor:"pointer",transition:"all .2s",boxShadow:isActive?`0 0 0 3px ${theme.gold}40`:"none"}}>
                        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                          <span style={{fontSize:12,fontWeight:600,color:theme.text,fontFamily:"Jost,sans-serif"}}>{theme.name}</span>
                          {isActive&&<span style={{color:theme.gold,fontSize:14}}>✓</span>}
                        </div>
                        <div style={{display:"flex",gap:4,marginBottom:8}}>
                          {[theme.bg,theme.surface,theme.gold,theme.text,theme.green,theme.red].map((c,i)=>(
                            <div key={i} style={{width:14,height:14,borderRadius:"50%",background:c,border:`1px solid ${theme.border}`}}/>
                          ))}
                        </div>
                        <div style={{height:3,borderRadius:2,background:theme.grad}}/>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    )}

    {/* ── SUBSCRIPTION MODAL */}
    {showSubscription&&(
      <div style={{position:"fixed",inset:0,background:"rgba(44,36,32,.6)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16,animation:"fadeIn .2s"}} onClick={()=>setShowSubscription(false)}>
        <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:2,width:"100%",maxWidth:420,animation:"fadeUp .25s",overflow:"hidden"}} onClick={e=>e.stopPropagation()}>

          {/* Header */}
          <div style={{padding:"18px 22px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",background:`linear-gradient(135deg,${T.gold}10,transparent)`}}>
            <div>
              <div style={{fontFamily:"Cormorant Garamond,serif",fontSize:20,fontWeight:600,color:T.text}}>Mi suscripción</div>
              <div style={{fontSize:9,color:T.gold,letterSpacing:2,textTransform:"uppercase",marginTop:2}}>Gestiona tu plan</div>
            </div>
            <button className="pBtn" onClick={()=>setShowSubscription(false)} style={{background:"transparent",color:T.textMuted,fontSize:16,border:`1px solid ${T.border}`,borderRadius:2,padding:"4px 8px"}}>✕</button>
          </div>

          <div style={{padding:"20px 22px"}}>

            {/* Plan badge */}
            <div style={{display:"flex",alignItems:"center",gap:12,padding:"14px 16px",background:`${T.gold}12`,border:`1px solid ${T.gold}`,borderRadius:2,marginBottom:20}}>
              <div style={{fontSize:28}}>⭐</div>
              <div style={{flex:1}}>
                <div style={{fontSize:14,fontWeight:600,color:T.text}}>Plan Pro</div>
                <div style={{fontSize:12,color:T.textMuted,marginTop:2}}>Clientes ilimitados · Todas las funciones</div>
              </div>
              <div style={{fontSize:13,fontWeight:700,color:T.gold}}>$169<span style={{fontSize:10,fontWeight:400,color:T.textMuted}}>/mes</span></div>
            </div>

            {/* Subscription info */}
            <div style={{marginBottom:20}}>
              {[
                {label:"Estado",value:"✓ Activa",color:T.green},
                {label:"Renovación",value:"Mensual automática",color:T.text},
                {label:"Próximo cobro",value:subscriptionEnd?new Date(subscriptionEnd).toLocaleDateString("es-MX",{day:"numeric",month:"long",year:"numeric"}):"Revisa tu email de Stripe",color:T.text},
                {label:"Pago procesado por",value:"Stripe 🔒",color:T.text},
              ].map(row=>(
                <div key={row.label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${T.border}`}}>
                  <span style={{fontSize:12,color:T.textMuted}}>{row.label}</span>
                  <span style={{fontSize:12,fontWeight:row.color===T.green?600:400,color:row.color}}>{row.value}</span>
                </div>
              ))}
              <div style={{padding:"12px 0",fontSize:11,color:T.textDim,lineHeight:1.6}}>
                Para ver el historial de pagos y la fecha exacta de tu próxima renovación, revisa el email de confirmación que recibiste al suscribirte.
              </div>
            </div>

            {/* Cancel */}
            <div style={{borderTop:`1px solid ${T.border}`,paddingTop:16}}>
              <div style={{fontSize:11,color:T.textMuted,marginBottom:12,lineHeight:1.6}}>
                Si cancelas, seguirás teniendo acceso hasta el final del período pagado. Al vencer, tu cuenta quedará suspendida hasta que renueves.
              </div>
              <button className="pBtn" onClick={()=>{
                if(window.confirm("¿Confirmas que quieres cancelar tu suscripción? Seguirás con acceso hasta el fin del período actual.")){
                  window.open("mailto:cancelaciones@bobulcrm.com?subject=Cancelar suscripción Bobul Pro&body=Hola, quisiera cancelar mi suscripción al Plan Pro. Mi email de cuenta es: "+((user&&user.email)||"")+".", "_blank");
                  showN("📧 Abre tu email y envía el mensaje para cancelar");
                  setShowSubscription(false);
                }
              }} style={{width:"100%",background:"transparent",border:`1px solid ${T.red}50`,color:T.red,padding:"11px",borderRadius:2,fontSize:11,fontWeight:600,letterSpacing:1,textTransform:"uppercase"}}>
                Cancelar suscripción
              </button>
            </div>

          </div>
        </div>
      </div>
    )}

        {showCategoryTip&&(()=>{
          // List all workspaces the user has set up (saved stages OR data in clients/events)
          const wsKeys = new Set(Object.keys(config.workspaces||{}));
          // Also include any profession_id we see in clients/events that isn't yet in workspaces
          clients.forEach(c => { if(c.professionId) wsKeys.add(c.professionId); });
          events.forEach(e => { if(e.professionId) wsKeys.add(e.professionId); });
          // Always include current workspace even if empty
          if(currentProfId) wsKeys.add(currentProfId);
          // Look up label/icon for each from CATEGORIES + current profile data
          const wsList = Array.from(wsKeys).map(id => {
            // Try to find in CATEGORIES
            for(const cat of CATEGORIES){
              const found = cat.items.find(p => p.id === id);
              if(found) return {id, label:found.label, icon:found.icon, isActive: id===currentProfId};
            }
            // Fallback to current profession info
            if(id===currentProfId) return {id, label:profession?.label||id, icon:profession?.icon||"⚡", isActive:true};
            return {id, label:id, icon:"⚡", isActive:false};
          });
          // Sort: active first, then alphabetical by label
          wsList.sort((a,b)=> (a.isActive===b.isActive ? a.label.localeCompare(b.label) : (a.isActive?-1:1)));
          const switchTo = async (newProfId) => {
            if(newProfId === currentProfId){ setShowCategoryTip(false); return; }
            // Find profession data
            let newProf = null;
            for(const cat of CATEGORIES){
              const found = cat.items.find(p => p.id === newProfId);
              if(found){ newProf = found; break; }
            }
            if(!newProf){ showN("⚠ No se encontró esa categoría"); return; }
            // Get saved stages for this workspace, or defaults
            const saved = (config.workspaces||{})[newProfId];
            const newStages = (saved && saved.length>0)
              ? saved
              : newProf.stages.map((s,i)=>({label:s,color:PALETTE[i%PALETTE.length]}));
            // Persist switch to DB
            if(supabase&&user){
              const res = await trySupabase(
                () => supabase.from("profiles").update({
                  profession_id: newProf.id,
                  profession_label: newProf.label,
                  profession_icon: newProf.icon,
                  stages: newStages,
                }).eq("id",user.id)
              );
              if(!res.ok) return;
            }
            // Update local config
            if(onReset) onReset({
              ...config,
              profession: newProf,
              stages: newStages,
            });
            showN(`◈ Workspace: ${newProf.label}`);
            setShowCategoryTip(false);
          };
          return(
            <div style={{position:"fixed",inset:0,zIndex:600,background:"rgba(0,0,0,.4)"}} onClick={()=>setShowCategoryTip(false)}>
              <div style={{position:"absolute",top:58,left:12,background:T.surface,border:`1px solid ${T.border}`,borderRadius:2,padding:"14px 18px",minWidth:240,maxWidth:300,boxShadow:"0 6px 24px rgba(0,0,0,.18)"}} onClick={e=>e.stopPropagation()}>
                <div style={{fontSize:9,color:T.gold,letterSpacing:1.5,textTransform:"uppercase",marginBottom:3}}>Negocio</div>
                <div style={{fontSize:15,fontWeight:600,color:T.text,fontFamily:"Cormorant Garamond,serif",marginBottom:10}}>{company||name}</div>
                <div style={{width:"100%",height:1,background:T.border,marginBottom:10}}/>
                <div style={{fontSize:9,color:T.gold,letterSpacing:1.5,textTransform:"uppercase",marginBottom:8}}>Workspaces ({wsList.length})</div>
                <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:10}}>
                  {wsList.map(ws => (
                    <button key={ws.id} className="pBtn" onClick={()=>switchTo(ws.id)} style={{
                      background: ws.isActive ? `${T.gold}15` : "transparent",
                      border: `1px solid ${ws.isActive ? T.gold : T.border}`,
                      borderRadius: 2, padding: "8px 10px",
                      display:"flex", alignItems:"center", gap:8, textAlign:"left",
                      color: ws.isActive ? T.gold : T.text,
                      cursor: ws.isActive ? "default" : "pointer",
                      fontSize: 12,
                    }}>
                      <span style={{fontSize:14,flexShrink:0}}>{ws.icon}</span>
                      <span style={{flex:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{ws.label}</span>
                      {ws.isActive && <span style={{fontSize:9,color:T.gold,letterSpacing:1}}>●</span>}
                    </button>
                  ))}
                </div>
                <div style={{fontSize:10,color:T.textDim,letterSpacing:.5,lineHeight:1.4}}>Para añadir un workspace nuevo, ve a <span style={{color:T.gold,cursor:"pointer",textDecoration:"underline"}} onClick={()=>{setShowCategoryTip(false);setShowSettings(true);setSettTab("categoria");}}>Configuración → Categoría</span></div>
              </div>
            </div>
          );
        })()}
    {notif&&(<div style={{position:"fixed",bottom:20,left:"50%",transform:"translateX(-50%)",background:T.surface,border:`1px solid ${T.gold}50`,borderRadius:2,padding:"8px 20px",fontSize:11,color:T.gold,letterSpacing:1,zIndex:500,animation:"fadeUp .25s",boxShadow:`0 4px 20px rgba(44,36,32,.15),0 0 20px ${T.gold}30`}}>{notif}</div>)}
  </div>);
}

// ---  ---IMPORT CLIENTS ----------------------------------------------------------
// 3-step wizard: upload file → adjust column mapping → confirm import
// Supports CSV, Excel (.xlsx/.xls), and Google Contacts CSV format
function ImportClients({onClose, onImport, currentProfId, profession, stages, existingCount}){
  const [step,setStep]=useState(1); // 1=upload, 2=mapping, 3=summary
  const [parsing,setParsing]=useState(false);
  const [rows,setRows]=useState([]); // raw rows from file: array of objects keyed by header
  const [headers,setHeaders]=useState([]);
  const [mapping,setMapping]=useState({}); // {field: headerName}
  const [error,setError]=useState("");
  const [importing,setImporting]=useState(false);
  const [importedCount,setImportedCount]=useState(0);

  // Lazy-load CSV/Excel parsers from CDN only when this modal opens
  useEffect(()=>{
    const loadScript = (src) => new Promise((resolve, reject) => {
      if(document.querySelector(`script[src="${src}"]`)) return resolve();
      const s = document.createElement("script");
      s.src = src; s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
    Promise.all([
      loadScript("https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js"),
      loadScript("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"),
    ]).catch(()=>{ setError("No se pudieron cargar las librerías de import. Revisa tu conexión."); });
  },[]);

  // Field definitions: which fields to import + how to detect them automatically
  // Each field has aliases (lowercase, accent-stripped) to auto-match against CSV headers
  const FIELDS = [
    {id:"name",     label:"Nombre",       required:true,  aliases:["name","nombre","fullname","full name","nombre completo","nombre y apellido","contact","contacto","first name","given name"]},
    {id:"email",    label:"Email",        required:false, aliases:["email","correo","correo electronico","e-mail","mail","email address","email 1 - value","emails"]},
    {id:"phone",    label:"Teléfono",     required:false, aliases:["phone","telefono","celular","movil","mobile","whatsapp","tel","phone 1 - value","phone number"]},
    {id:"company",  label:"Empresa",      required:false, aliases:["company","empresa","compania","organization","organizacion","negocio","business","organization 1 - name","org"]},
    {id:"address",  label:"Dirección",    required:false, aliases:["address","direccion","domicilio","ubicacion","ubicación","location","address 1 - formatted"]},
    {id:"value",    label:"Valor / Monto",required:false, aliases:["value","valor","monto","amount","precio","price","deal","total"]},
    {id:"notes",    label:"Notas",        required:false, aliases:["notes","notas","note","observaciones","comments","comentarios","description","descripcion"]},
    {id:"stage",    label:"Etapa",        required:false, aliases:["stage","etapa","estado","status","fase","pipeline"]},
    {id:"source",   label:"Fuente",       required:false, aliases:["source","fuente","origen","lead source","como te enteraste"]},
    {id:"tags",     label:"Etiquetas",    required:false, aliases:["tags","etiquetas","labels","categorias"]},
  ];

  const norm = (s) => (s||"").toString().toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g,"");

  const autoMap = (hdrs) => {
    const m = {};
    for(const f of FIELDS){
      const found = hdrs.find(h => f.aliases.some(a => norm(h) === norm(a)));
      if(found) m[f.id] = found;
    }
    return m;
  };

  const handleFile = async (file) => {
    setError(""); setParsing(true);
    const ext = (file.name.split(".").pop()||"").toLowerCase();
    try{
      if(ext === "csv"){
        if(!window.Papa){ throw new Error("Parser CSV no disponible"); }
        const text = await file.text();
        const result = window.Papa.parse(text, {header:true, skipEmptyLines:true, dynamicTyping:false});
        if(result.errors?.length && result.errors[0].type !== "FieldMismatch"){
          throw new Error(result.errors[0].message || "Error al leer CSV");
        }
        const data = result.data.filter(r => Object.values(r).some(v => v && String(v).trim()));
        if(!data.length) throw new Error("El archivo está vacío o sin filas válidas");
        const hdrs = result.meta.fields || Object.keys(data[0]);
        setHeaders(hdrs);
        setRows(data);
        setMapping(autoMap(hdrs));
      } else if(ext === "xlsx" || ext === "xls"){
        if(!window.XLSX){ throw new Error("Parser Excel no disponible"); }
        const buf = await file.arrayBuffer();
        const wb = window.XLSX.read(buf, {type:"array"});
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = window.XLSX.utils.sheet_to_json(ws, {defval:""});
        if(!data.length) throw new Error("La hoja está vacía");
        const hdrs = Object.keys(data[0]);
        setHeaders(hdrs);
        setRows(data);
        setMapping(autoMap(hdrs));
      } else {
        throw new Error("Formato no soportado. Usa CSV, XLSX o XLS.");
      }
      setStep(2);
    } catch(e){
      setError(e.message || "Error al procesar el archivo");
    } finally {
      setParsing(false);
    }
  };

  const validRows = () => {
    const nameCol = mapping.name;
    if(!nameCol) return [];
    return rows.filter(r => r[nameCol] && String(r[nameCol]).trim());
  };

  const buildClient = (row) => {
    const get = (fieldId) => {
      const col = mapping[fieldId];
      return col ? String(row[col]||"").trim() : "";
    };
    const stageVal = get("stage");
    // Validate stage against current workspace stages; fall back to first stage
    const stageMatch = stages.find(s => norm(s.label) === norm(stageVal));
    const stage = stageMatch ? stageMatch.label : (stages[0]?.label || "Lead");

    let valueNum = 0;
    const v = get("value").replace(/[^\d.-]/g,"");
    if(v) valueNum = parseFloat(v) || 0;

    const tagsVal = get("tags");
    const tags = tagsVal ? tagsVal.split(/[;,]/).map(t=>t.trim()).filter(Boolean) : [];

    return {
      name: get("name"),
      email: get("email") || null,
      phone: get("phone") || null,
      company: get("company") || null,
      address: get("address") || null,
      value: valueNum,
      currency: "MXN",
      stage,
      source: get("source") || null,
      tags,
      notes: get("notes") || null,
      privacyConsent: false,
      activities: [],
      tasks: [],
      files: [],
      stageHistory: [{stage, date: new Date().toISOString()}],
      // Workspace tagging
      professionId: currentProfId,
      professionLabel: profession?.label,
      professionIcon: profession?.icon,
    };
  };

  const doImport = async () => {
    setImporting(true);
    const valid = validRows();
    let success = 0;
    for(const row of valid){
      const client = buildClient(row);
      const ok = await onImport(client);
      if(ok) success++;
      setImportedCount(success);
    }
    setImporting(false);
    setStep(4); // results
  };

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:600,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={onClose}>
      <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:3,maxWidth:640,width:"100%",maxHeight:"90vh",display:"flex",flexDirection:"column"}} onClick={e=>e.stopPropagation()}>

        {/* Header */}
        <div style={{padding:"18px 22px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            <div style={{fontFamily:"Cormorant Garamond,serif",fontSize:22,fontWeight:600,color:T.text}}>Importar clientes</div>
            <div style={{fontSize:11,color:T.textMuted,marginTop:2}}>Workspace: {profession?.icon} {profession?.label}</div>
          </div>
          <button onClick={onClose} style={{background:"transparent",border:`1px solid ${T.border}`,color:T.textMuted,padding:"4px 10px",borderRadius:2,fontSize:14,cursor:"pointer"}}>✕</button>
        </div>

        {/* Body */}
        <div style={{flex:1,overflowY:"auto",padding:"20px 22px"}}>

          {/* Step 1: Upload */}
          {step===1 && (
            <div>
              <p style={{fontSize:13,color:T.textMuted,marginBottom:18,lineHeight:1.6}}>Sube un archivo CSV, Excel (.xlsx) o exportación de Google Contacts. Detectaremos las columnas automáticamente.</p>
              <label style={{display:"block",border:`2px dashed ${T.border}`,borderRadius:3,padding:"32px 20px",textAlign:"center",cursor:"pointer",background:T.card,transition:"all .15s"}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor=T.gold;}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;}}>
                <input type="file" accept=".csv,.xlsx,.xls" style={{display:"none"}} onChange={e=>{if(e.target.files?.[0]) handleFile(e.target.files[0]);}}/>
                <div style={{fontSize:32,marginBottom:8}}>📂</div>
                <div style={{fontSize:14,fontWeight:600,color:T.text,marginBottom:4}}>{parsing ? "Procesando..." : "Selecciona un archivo"}</div>
                <div style={{fontSize:11,color:T.textMuted}}>CSV · XLSX · XLS · Google Contacts</div>
              </label>
              {error && <div style={{marginTop:14,padding:"10px 12px",background:`${T.red}15`,border:`1px solid ${T.red}40`,borderRadius:2,color:T.red,fontSize:12}}>{error}</div>}
              <div style={{marginTop:16,fontSize:11,color:T.textDim,lineHeight:1.5}}>
                <strong>Tip:</strong> Para exportar tus contactos de Google: contacts.google.com → Exportar → Google CSV.
                Para Excel: archivo → Guardar como → CSV o XLSX.
              </div>
            </div>
          )}

          {/* Step 2: Column mapping */}
          {step===2 && (
            <div>
              <div style={{fontSize:13,color:T.textMuted,marginBottom:14,lineHeight:1.6}}>Verifica que las columnas estén correctamente asignadas. <strong style={{color:T.gold}}>Nombre</strong> es obligatorio.</div>

              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {FIELDS.map(f => (
                  <div key={f.id} style={{display:"grid",gridTemplateColumns:"110px 1fr",gap:10,alignItems:"center"}}>
                    <div style={{fontSize:12,color:T.text,fontWeight:f.required?600:400}}>
                      {f.label}{f.required && <span style={{color:T.red,marginLeft:3}}>*</span>}
                    </div>
                    <select value={mapping[f.id]||""} onChange={e=>setMapping(m=>({...m,[f.id]:e.target.value||undefined}))}
                      style={{background:T.card,border:`1px solid ${mapping[f.id]?T.border:(f.required?T.red:T.border)}`,borderRadius:2,padding:"7px 10px",color:T.text,fontSize:12,fontFamily:"Jost,sans-serif"}}>
                      <option value="">— No importar —</option>
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>

              {/* Preview first 3 rows */}
              <div style={{marginTop:18,paddingTop:14,borderTop:`1px solid ${T.border}`}}>
                <div style={{fontSize:10,color:T.gold,letterSpacing:1.5,textTransform:"uppercase",marginBottom:8,fontWeight:600}}>Vista previa ({validRows().length} válidos · {rows.length} total)</div>
                <div style={{maxHeight:120,overflowY:"auto",background:T.card,border:`1px solid ${T.border}`,borderRadius:2,padding:8}}>
                  {validRows().slice(0,3).map((row,i)=>(
                    <div key={i} style={{fontSize:11,color:T.text,padding:"4px 0",borderBottom:i<2?`1px solid ${T.border}`:"none"}}>
                      <strong>{row[mapping.name]}</strong>
                      {mapping.email && row[mapping.email] && <span style={{color:T.textMuted}}> · {row[mapping.email]}</span>}
                      {mapping.company && row[mapping.company] && <span style={{color:T.textMuted}}> · {row[mapping.company]}</span>}
                    </div>
                  ))}
                  {validRows().length===0 && <div style={{fontSize:11,color:T.red,padding:"4px 0"}}>Sin filas válidas — falta mapear "Nombre"</div>}
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Confirm */}
          {step===3 && (
            <div>
              <div style={{textAlign:"center",padding:"20px 0"}}>
                <div style={{fontSize:48,marginBottom:8}}>📋</div>
                <div style={{fontFamily:"Cormorant Garamond,serif",fontSize:24,fontWeight:600,color:T.text,marginBottom:6}}>Listo para importar</div>
                <div style={{fontSize:13,color:T.textMuted,lineHeight:1.6}}>
                  Se crearán <strong style={{color:T.gold}}>{validRows().length}</strong> clientes en tu workspace de <strong>{profession?.label}</strong>.
                  {rows.length > validRows().length && <div style={{marginTop:8,fontSize:11,color:T.red}}>{rows.length - validRows().length} fila(s) sin nombre serán ignoradas.</div>}
                  {existingCount > 0 && <div style={{marginTop:8,fontSize:11,color:T.textMuted}}>Ya tienes {existingCount} cliente(s) en este workspace. Total después: {existingCount + validRows().length}.</div>}
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Results */}
          {step===4 && (
            <div style={{textAlign:"center",padding:"30px 0"}}>
              <div style={{fontSize:48,marginBottom:8}}>{importedCount===validRows().length?"✅":"⚠️"}</div>
              <div style={{fontFamily:"Cormorant Garamond,serif",fontSize:24,fontWeight:600,color:T.text,marginBottom:6}}>
                {importedCount===validRows().length ? "Importación completa" : "Importación parcial"}
              </div>
              <div style={{fontSize:13,color:T.textMuted}}>
                Se importaron <strong style={{color:T.gold}}>{importedCount}</strong> de {validRows().length} clientes.
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div style={{padding:"14px 22px",borderTop:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",gap:10,flexShrink:0}}>
          {step===1 && <div/>}
          {step===2 && <button onClick={()=>{setStep(1);setRows([]);setHeaders([]);setMapping({});}} style={{background:"transparent",border:`1px solid ${T.border}`,color:T.textMuted,padding:"8px 14px",borderRadius:2,fontSize:11,cursor:"pointer",letterSpacing:1,textTransform:"uppercase"}}>← Atrás</button>}
          {step===3 && <button onClick={()=>setStep(2)} disabled={importing} style={{background:"transparent",border:`1px solid ${T.border}`,color:T.textMuted,padding:"8px 14px",borderRadius:2,fontSize:11,cursor:importing?"not-allowed":"pointer",letterSpacing:1,textTransform:"uppercase",opacity:importing?.5:1}}>← Atrás</button>}
          {step===4 && <div/>}

          {step===1 && <button onClick={onClose} style={{background:"transparent",border:`1px solid ${T.border}`,color:T.textMuted,padding:"8px 14px",borderRadius:2,fontSize:11,cursor:"pointer",letterSpacing:1,textTransform:"uppercase"}}>Cancelar</button>}
          {step===2 && (
            <button onClick={()=>setStep(3)} disabled={!mapping.name || validRows().length===0}
              style={{background:(!mapping.name||validRows().length===0)?T.card:T.grad,color:(!mapping.name||validRows().length===0)?T.textDim:"#fff",padding:"8px 16px",borderRadius:2,fontSize:11,cursor:(!mapping.name||validRows().length===0)?"not-allowed":"pointer",letterSpacing:1,textTransform:"uppercase",fontWeight:600,border:"none"}}>
              Continuar →
            </button>
          )}
          {step===3 && (
            <button onClick={doImport} disabled={importing}
              style={{background:T.grad,color:"#fff",padding:"8px 18px",borderRadius:2,fontSize:11,cursor:importing?"wait":"pointer",letterSpacing:1,textTransform:"uppercase",fontWeight:600,border:"none",opacity:importing?.7:1}}>
              {importing ? `Importando ${importedCount}/${validRows().length}...` : `Importar ${validRows().length} clientes`}
            </button>
          )}
          {step===4 && (
            <button onClick={onClose} style={{background:T.grad,color:"#fff",padding:"8px 18px",borderRadius:2,fontSize:11,cursor:"pointer",letterSpacing:1,textTransform:"uppercase",fontWeight:600,border:"none"}}>
              Cerrar
            </button>
          )}
        </div>

      </div>
    </div>
  );
}

// ---  ---AUTH SCREEN -------------------------------------------------------------

// ---  ---PRICING SCREEN -----------------------------------------------------------
function PricingScreen({user,onSelectPlan,currentPlan,onSignOut,canDismiss}){
  const PAYMENT_LINK = "https://buy.stripe.com/test_3cI14n8EI7qrdV9fiG5ZC02";

  useEffect(()=>{
    track("pricing_viewed", {current_plan: currentPlan, blocked: !canDismiss});
  },[]);

  const handlePaymentClick = () => {
    track("payment_initiated", {plan: "pro", price: 159});
  };

  return(
    <div style={{minHeight:"100vh",background:"#f5f2ee",display:"flex",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"Jost,sans-serif"}}>
      <div style={{maxWidth:440,width:"100%"}}>

        {/* Header */}
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{fontFamily:"Cormorant Garamond,serif",fontSize:48,fontWeight:700,color:"#2c4a3e",letterSpacing:-1}}>Bobul</div>
          <div style={{fontSize:13,color:"#8a7968",fontStyle:"italic",fontFamily:"Cormorant Garamond,serif",marginTop:2}}>Tu CRM personal</div>
        </div>

        {/* Plan card */}
        <div style={{background:"#fff",border:"2px solid #b8935a",borderRadius:3,padding:32,boxShadow:"0 8px 40px rgba(184,147,90,.15)"}}>

          {/* Badge */}
          <div style={{textAlign:"center",marginBottom:24}}>
            <div style={{display:"inline-block",background:"#b8935a",color:"#fff",fontSize:9,fontWeight:700,letterSpacing:2,padding:"4px 12px",borderRadius:20,textTransform:"uppercase",marginBottom:12}}>Plan único</div>
            <div style={{fontFamily:"Cormorant Garamond,serif",fontSize:32,fontWeight:700,color:"#2c4a3e"}}>Bobul Pro</div>
            <div style={{marginTop:8,display:"flex",alignItems:"baseline",justifyContent:"center",gap:4}}>
              <span style={{fontFamily:"Cormorant Garamond,serif",fontSize:44,fontWeight:700,color:"#b8935a"}}>$169</span>
              <span style={{fontSize:13,color:"#8a7968"}}>MXN / mes</span>
            </div>
            <div style={{fontSize:11,color:"#8a7968",marginTop:4}}>Cancela cuando quieras · Precio incluye IVA</div>
          </div>

          {/* Features */}
          <div style={{borderTop:"1px solid #e8e0d5",borderBottom:"1px solid #e8e0d5",padding:"20px 0",marginBottom:24}}>
            {[
              "Clientes ilimitados",
              "Kanban, Lista, Stats y Agenda",
              "Tareas y seguimiento de actividades",
              "Subida de archivos por cliente",
              "Notificaciones de eventos",
              "Exportación CSV",
              "Acceso desde cualquier dispositivo",
            ].map(f=>(
              <div key={f} style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                <span style={{color:"#b8935a",fontSize:13,flexShrink:0}}>◈</span>
                <span style={{fontSize:13,color:"#3d3530"}}>{f}</span>
              </div>
            ))}
          </div>

          {/* CTA */}
          <a href={`${PAYMENT_LINK}?prefilled_email=${encodeURIComponent(user?.email||"")}&client_reference_id=${user?.id||""}`}
            target="_blank" rel="noopener noreferrer" onClick={handlePaymentClick}
            style={{display:"block",width:"100%",background:"linear-gradient(135deg,#b8935a,#8a6a3a)",color:"#fff",padding:"15px",borderRadius:2,fontSize:12,fontWeight:700,letterSpacing:2,textTransform:"uppercase",textAlign:"center",textDecoration:"none",boxShadow:"0 4px 20px rgba(184,147,90,.35)"}}>
            Suscribirme — $169 / mes
          </a>

          <div style={{textAlign:"center",marginTop:14,fontSize:11,color:"#8a7968"}}>
            Pago seguro con <strong>Stripe</strong> 🔒
          </div>
        </div>

        {/* Footer */}
        <div style={{textAlign:"center",marginTop:20,fontSize:11,color:"#8a7968"}}>
          {canDismiss
            ? <>¿Ya tienes cuenta? <span onClick={onSelectPlan} style={{color:"#b8935a",cursor:"pointer",textDecoration:"underline"}}>Volver al inicio</span></>
            : <>¿Quieres usar otra cuenta? <span onClick={onSignOut} style={{color:"#b8935a",cursor:"pointer",textDecoration:"underline"}}>Cerrar sesión</span></>
          }
        </div>

      </div>
    </div>
  );
}


function AuthScreen({onAuth}){
  const [mode,setMode]=useState("login"); // login | signup | forgot
  const [email,setEmail]=useState(()=>localStorage.getItem("bobul_email")||"");
  const [password,setPassword]=useState("");
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");
  const [rememberMe,setRememberMe]=useState(()=>!!localStorage.getItem("bobul_email"));
  const [stayConnected,setStayConnected]=useState(()=>!!localStorage.getItem("bobul_stay"));
  const [installPrompt,setInstallPrompt]=useState(null);
  const [installed,setInstalled]=useState(false);

  // Capture install prompt event
  useEffect(()=>{
    const handler=(e)=>{e.preventDefault();setInstallPrompt(e);};
    window.addEventListener("beforeinstallprompt",handler);
    window.addEventListener("appinstalled",()=>setInstalled(true));
    // Check if already installed
    if(window.matchMedia("(display-mode: standalone)").matches) setInstalled(true);
    return()=>window.removeEventListener("beforeinstallprompt",handler);
  },[]);

  const handleInstall=async()=>{
    if(!installPrompt)return;
    installPrompt.prompt();
    const{outcome}=await installPrompt.userChoice;
    if(outcome==="accepted") setInstalled(true);
    setInstallPrompt(null);
  };

  const inputS={width:"100%",background:T.card,border:`1px solid ${T.border}`,borderRadius:2,padding:"12px 14px",color:T.text,fontSize:14,fontFamily:"Jost,sans-serif",marginBottom:10};

  const handleSubmit=async()=>{
    if(!email||!password){setError("Completa todos los campos");return;}
    setLoading(true);setError("");setSuccess("");
    try{
      if(mode==="signup"){
        const{error:e}=await sb.auth.signUp({email,password});
        if(e)throw e;
        setSuccess("✓ Cuenta creada. Revisa tu email para confirmar.");
        setMode("login");
      } else {
        // Save/clear remembered email
        if(rememberMe) localStorage.setItem("bobul_email",email);
        else localStorage.removeItem("bobul_email");
        if(stayConnected) localStorage.setItem("bobul_stay","1");
        else localStorage.removeItem("bobul_stay");
        const{data,error:e}=await sb.auth.signInWithPassword({email,password});
        if(e)throw e;
        onAuth(data.user);
      }
    }catch(e){setError(e.message||"Error al procesar");}
    setLoading(false);
  };

  const handleForgot=async()=>{
    if(!email){setError("Escribe tu email primero");return;}
    setLoading(true);setError("");
    const{error:e}=await sb.auth.resetPasswordForEmail(email);
    if(e)setError(e.message);
    else setSuccess("✓ Revisa tu email para restablecer tu contraseña.");
    setLoading(false);
  };

  return(
    <div style={{minHeight:"100vh",background:T.bg,display:"flex",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"Jost,sans-serif"}}>
      <div className="fadeUp" style={{width:"100%",maxWidth:400}}>
        {/* Logo */}
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{position:"relative",width:64,height:64,margin:"0 auto 16px"}}>
            <div style={{position:"absolute",inset:0,borderRadius:"50%",border:`1px solid ${T.gold}40`,animation:"glow 3s ease infinite"}}/>
            <div style={{position:"absolute",inset:6,borderRadius:"50%",border:`1px solid ${T.gold}60`}}/>
            <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,color:T.gold}}>◈</div>
          </div>
          <h1 style={{fontFamily:"Cormorant Garamond,serif",fontSize:52,fontWeight:700,color:T.gold,lineHeight:1,letterSpacing:-1}}>Bobul</h1>
          <p style={{fontFamily:"Cormorant Garamond,serif",fontSize:14,color:T.textMuted,fontStyle:"italic",marginTop:4}}>Tu CRM Personal</p>
        </div>

        {/* Card */}
        <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:2,padding:28}}>
          <div style={{fontSize:9,color:T.gold,letterSpacing:2,textTransform:"uppercase",marginBottom:4}}>{mode==="signup"?"Crear cuenta":mode==="forgot"?"Recuperar acceso":"Iniciar sesión"}</div>
          <div style={{fontFamily:"Cormorant Garamond,serif",fontSize:22,fontWeight:600,color:T.text,marginBottom:20}}>{mode==="signup"?"Bienvenido a Bobul":mode==="forgot"?"¿Olvidaste tu contraseña?":"Accede a tu cuenta"}</div>

          {error&&<div style={{background:`${T.red}15`,border:`1px solid ${T.red}40`,borderRadius:2,padding:"9px 12px",fontSize:12,color:T.red,marginBottom:12}}>{error}</div>}
          {success&&<div style={{background:`${T.green}15`,border:`1px solid ${T.green}40`,borderRadius:2,padding:"9px 12px",fontSize:12,color:T.green,marginBottom:12}}>{success}</div>}

          <div style={{fontSize:9,color:T.gold,letterSpacing:1.5,textTransform:"uppercase",marginBottom:5}}>Email</div>
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleSubmit()} placeholder="tu@email.com" style={inputS}/>

          {mode!=="forgot"&&<>
            <div style={{fontSize:9,color:T.gold,letterSpacing:1.5,textTransform:"uppercase",marginBottom:5}}>Contraseña</div>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleSubmit()} placeholder="••••••••" style={inputS}/>
          </>}

          {mode==="login"&&(
            <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:16,marginTop:4}}>
              <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer"}}>
                <input type="checkbox" checked={rememberMe} onChange={e=>setRememberMe(e.target.checked)}
                  style={{width:16,height:16,accentColor:T.gold,cursor:"pointer",flexShrink:0}}/>
                <span style={{fontSize:13,color:T.textMuted}}>Recordar mi email</span>
              </label>
              <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer"}}>
                <input type="checkbox" checked={stayConnected} onChange={e=>setStayConnected(e.target.checked)}
                  style={{width:16,height:16,accentColor:T.gold,cursor:"pointer",flexShrink:0}}/>
                <span style={{fontSize:13,color:T.textMuted}}>Mantenerme conectado</span>
              </label>
            </div>
          )}

          <button className="pBtn" onClick={mode==="forgot"?handleForgot:handleSubmit} disabled={loading}
            style={{width:"100%",background:loading?"#ccc":T.grad,color:"#0C0A08",padding:"12px",borderRadius:2,fontSize:11,fontWeight:700,letterSpacing:2,textTransform:"uppercase",marginTop:4,cursor:loading?"wait":"pointer"}}>
            {loading?"Procesando...":(mode==="signup"?"Crear cuenta":mode==="forgot"?"Enviar enlace":"Entrar")}
          </button>

          <div style={{display:"flex",justifyContent:"space-between",marginTop:16,flexWrap:"wrap",gap:4}}>
            {mode==="login"&&<>
              <button className="pBtn" onClick={()=>{setMode("signup");setError("");setSuccess("");}} style={{background:"transparent",color:T.gold,fontSize:11,letterSpacing:.5,textDecoration:"underline",padding:0}}>Crear cuenta nueva</button>
              <button className="pBtn" onClick={()=>{setMode("forgot");setError("");setSuccess("");}} style={{background:"transparent",color:T.textMuted,fontSize:11,textDecoration:"underline",padding:0}}>¿Olvidaste tu contraseña?</button>
            </>}
            {mode!=="login"&&<button className="pBtn" onClick={()=>{setMode("login");setError("");setSuccess("");}} style={{background:"transparent",color:T.gold,fontSize:11,letterSpacing:.5,textDecoration:"underline",padding:0}}>← Volver a iniciar sesión</button>}
          </div>
        </div>
        <div style={{textAlign:"center",marginTop:16,fontSize:10,color:T.textDim,letterSpacing:.5}}>Tus datos están cifrados y protegidos</div>

        {/* PWA Install Banner */}
        {!installed&&installPrompt&&(
          <div style={{marginTop:16,background:T.surface,border:`1px solid ${T.gold}50`,borderRadius:2,padding:"14px 16px",display:"flex",alignItems:"center",gap:12,animation:"fadeUp .4s ease"}}>
            <div style={{fontSize:28,flexShrink:0}}>◈</div>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:600,color:T.text,marginBottom:2}}>Instalar Bobul</div>
              <div style={{fontSize:11,color:T.textMuted}}>Agrégalo a tu pantalla de inicio para acceso rápido</div>
            </div>
            <button className="pBtn" onClick={handleInstall} style={{background:T.grad,color:"#0C0A08",padding:"8px 14px",borderRadius:2,fontSize:11,fontWeight:700,letterSpacing:1,textTransform:"uppercase",flexShrink:0}}>
              Instalar
            </button>
          </div>
        )}
        {installed&&(
          <div style={{marginTop:12,textAlign:"center",fontSize:11,color:T.green,letterSpacing:.5}}>✓ Bobul instalado en tu dispositivo</div>
        )}
      </div>
    </div>
  );
}

// ---  ---DEVICES PANEL ----------------------------------------------------------
// Settings tab that lists active devices and lets the user revoke any of them.
function DevicesPanel({supabase,user,onSignOut}){
  const [devices,setDevices] = useState(null); // null = loading
  const [busy,setBusy] = useState(false);
  const myDeviceId = (()=>{ try{return localStorage.getItem("bobul_device_id");}catch{return null;} })();

  const load = async () => {
    if(!supabase||!user) return;
    const {data} = await supabase.from("user_devices")
      .select("*").eq("user_id",user.id).order("last_active",{ascending:false});
    setDevices(data||[]);
  };
  useEffect(()=>{load();},[user?.id]);

  const fmtRel = (iso) => {
    const d = new Date(iso);
    const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
    if(diffMin < 1) return "ahora";
    if(diffMin < 60) return `hace ${diffMin}m`;
    const diffH = Math.floor(diffMin/60);
    if(diffH < 24) return `hace ${diffH}h`;
    const diffD = Math.floor(diffH/24);
    if(diffD < 30) return `hace ${diffD}d`;
    return d.toLocaleDateString("es-MX",{day:"2-digit",month:"short"});
  };

  const revoke = async (deviceRow) => {
    const isCurrent = deviceRow.device_id === myDeviceId;
    if(!confirm(isCurrent
      ? "¿Cerrar sesión en ESTE dispositivo? Tendrás que volver a iniciar sesión."
      : `¿Cerrar sesión en "${deviceRow.label||"este dispositivo"}"?`
    )) return;
    setBusy(true);
    await supabase.from("user_devices").delete().eq("id",deviceRow.id);
    if(isCurrent){
      try{ localStorage.removeItem("bobul_device_id"); }catch{}
      if(onSignOut) onSignOut();
      return;
    }
    setBusy(false);
    load();
  };

  if(devices===null) return <div style={{padding:"24px 0",textAlign:"center",color:T.textMuted,fontSize:12}}>Cargando...</div>;

  return(
    <div>
      <p style={{fontSize:12,color:T.textMuted,marginBottom:14,lineHeight:1.6}}>
        Tu cuenta puede estar activa en hasta {MAX_DEVICES} dispositivos a la vez.
        Si excedes el límite, deberás cerrar sesión en uno antes de entrar en otro.
      </p>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
        <div style={{fontSize:11,color:T.gold,letterSpacing:1.5,textTransform:"uppercase",fontWeight:600}}>
          Dispositivos activos · {devices.length} de {MAX_DEVICES}
        </div>
        <button onClick={load} disabled={busy} style={{background:"transparent",border:`1px solid ${T.border}`,color:T.textMuted,padding:"4px 10px",fontSize:10,letterSpacing:1,textTransform:"uppercase",cursor:"pointer",borderRadius:2}}>↻ Actualizar</button>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {devices.map(d => {
          const isCurrent = d.device_id === myDeviceId;
          return(
            <div key={d.id} style={{background:isCurrent?`${T.gold}10`:T.card,border:`1px solid ${isCurrent?T.gold:T.border}`,borderRadius:2,padding:"11px 13px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,color:T.text,fontWeight:500,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                  {d.label||"Dispositivo"}
                  {isCurrent && <span style={{fontSize:9,color:T.gold,marginLeft:6,letterSpacing:1,textTransform:"uppercase"}}>· este</span>}
                </div>
                <div style={{fontSize:10,color:T.textMuted,marginTop:2}}>Última actividad: {fmtRel(d.last_active)}</div>
              </div>
              <button onClick={()=>revoke(d)} disabled={busy} style={{background:"transparent",border:`1px solid ${T.red}40`,color:T.red,padding:"6px 11px",fontSize:10,fontWeight:600,letterSpacing:.5,textTransform:"uppercase",cursor:"pointer",borderRadius:2,whiteSpace:"nowrap"}}>
                Cerrar
              </button>
            </div>
          );
        })}
        {devices.length===0 && <div style={{padding:"20px 0",textAlign:"center",color:T.textDim,fontSize:12}}>Sin dispositivos registrados</div>}
      </div>
    </div>
  );
}

// ---  ---DEVICE GATE -------------------------------------------------------------
// Shown when the user tries to log in from a 4th device.
// They must remotely close one of the existing 3 to continue.
function DeviceGate({gate,onRevoke,onSignOut}){
  const fmtRel = (iso) => {
    const d = new Date(iso);
    const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
    if(diffMin < 1) return "ahora";
    if(diffMin < 60) return `hace ${diffMin}m`;
    const diffH = Math.floor(diffMin/60);
    if(diffH < 24) return `hace ${diffH}h`;
    const diffD = Math.floor(diffH/24);
    if(diffD < 30) return `hace ${diffD}d`;
    return d.toLocaleDateString("es-MX",{day:"2-digit",month:"short"});
  };
  return(
    <div style={{minHeight:"100vh",background:"#0F0E0C",color:"#E8DDC8",display:"flex",alignItems:"center",justifyContent:"center",padding:"24px 16px",fontFamily:"Jost,sans-serif"}}>
      <div style={{maxWidth:480,width:"100%",background:"#1A1814",border:"1px solid #3A3128",borderRadius:4,padding:"36px 32px"}}>
        <div style={{textAlign:"center",marginBottom:20}}>
          <div style={{fontSize:32,marginBottom:6}}>◈</div>
          <div style={{fontFamily:"Cormorant Garamond,serif",fontSize:26,fontWeight:600,color:"#E8DDC8",letterSpacing:.5}}>Demasiados dispositivos</div>
          <div style={{fontSize:13,color:"#A89D85",marginTop:8,lineHeight:1.5}}>Tu cuenta ya está activa en {MAX_DEVICES} dispositivos. Para continuar en este dispositivo, cierra sesión en uno de los siguientes:</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:18}}>
          {gate.devices.map(d => (
            <div key={d.id} style={{background:"#0F0E0C",border:"1px solid #3A3128",borderRadius:3,padding:"12px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,color:"#E8DDC8",fontWeight:500,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{d.label||"Dispositivo"}</div>
                <div style={{fontSize:11,color:"#8A7E68",marginTop:2}}>Última actividad: {fmtRel(d.last_active)}</div>
              </div>
              <button onClick={()=>onRevoke(d.id)} style={{background:"transparent",border:"1px solid #C9A84C",color:"#C9A84C",padding:"7px 12px",borderRadius:2,fontSize:10,fontWeight:600,letterSpacing:1,textTransform:"uppercase",cursor:"pointer",whiteSpace:"nowrap"}}>Cerrar sesión</button>
            </div>
          ))}
        </div>
        <div style={{textAlign:"center",fontSize:11,color:"#8A7E68",marginTop:14}}>
          ¿Quieres usar otra cuenta? <span onClick={onSignOut} style={{color:"#C9A84C",cursor:"pointer",textDecoration:"underline"}}>Cerrar sesión aquí</span>
        </div>
      </div>
    </div>
  );
}

// ---  ---ROOT ---------------------------------------------------------------------
export default function App(){
  const [user,setUser]=useState(undefined);
  const [config,setConfig]=useState(null);
  const [loadingConfig,setLoadingConfig]=useState(false);
  const [themeId,setThemeId]=useState(()=>localStorage.getItem("bobul_theme")||"ivory");
  // Apply theme immediately
  Object.assign(T, THEMES[themeId]||THEMES.ivory);
  const [plan,setPlan]=useState(null);
  const [subscriptionEnd,setSubscriptionEnd]=useState(null);
  const [showPricing,setShowPricing]=useState(false);
  // Device gate: when login exceeds max devices, we show a blocker until user closes one
  const [deviceGate,setDeviceGate]=useState(null); // { devices: [...], myDeviceId } when blocked
  const [showDevicesPanel,setShowDevicesPanel]=useState(false);
  const [devicesList,setDevicesList]=useState([]); // for the panel

  // Check session on mount
  useEffect(()=>{
    initPostHog(); // pre-load PostHog SDK in background
    sb.auth.getSession().then(async({data:{session}})=>{
      setUser(session?.user||null);
      if(session?.user){
        identify(session.user.id, {email: session.user.email});
        const allowed = await registerDevice(session.user.id);
        if(allowed) loadProfile(session.user.id);
      }
    });
    const{data:{subscription}}=sb.auth.onAuthStateChange(async(_,session)=>{
      setUser(session?.user||null);
      if(!session?.user){setConfig(null);setDeviceGate(null); resetTracking();}
    });
    return()=>subscription.unsubscribe();
  },[]);

  const loadProfile=async(userId)=>{
    setLoadingConfig(true);
    const{data}=await sb.from("profiles").select("*").eq("id",userId).single();
    if(data?.stages){
      setConfig({name:data.name||"",company:data.company||"",profession:{id:data.profession_id,label:data.profession_label,icon:data.profession_icon},stages:data.stages,workspaces:data.workspaces||{}});
      setPlan(data.plan||null);
      if(data.subscription_end){
        setSubscriptionEnd(new Date(data.subscription_end));
      }
      if(data.theme){
        setThemeId(data.theme);
        Object.assign(T, THEMES[data.theme]||THEMES.ivory);
        localStorage.setItem("bobul_theme",data.theme);
      }
    }
    // Check for successful Stripe checkout
    const params=new URLSearchParams(window.location.search);
    if(params.get("plan")){
      const newPlan=params.get("plan");
      const now=new Date();
      const end=new Date(now);
      end.setDate(end.getDate()+30);
      setPlan(newPlan);
      setSubscriptionEnd(end);
      await sb.from("profiles").update({
        plan:newPlan,
        subscription_start:now.toISOString(),
        subscription_end:end.toISOString(),
      }).eq("id",userId);
      window.history.replaceState({},"",window.location.pathname);
    }
    setLoadingConfig(false);
  };

  const handleAuth=async(u)=>{
    setUser(u);
    identify(u.id, {email: u.email});
    track("signup_completed", {user_id: u.id});
    const allowed = await registerDevice(u.id);
    if(allowed) loadProfile(u.id);
  };

  // Register the current device for this user. Returns true if access allowed,
  // false if blocked (and sets deviceGate state with the list).
  const registerDevice = async (userId) => {
    const myDeviceId = getDeviceId();
    const myLabel = getDeviceLabel();
    const myUA = navigator.userAgent || "";
    // Fetch existing devices for this user
    const {data:existing,error} = await sb.from("user_devices")
      .select("*").eq("user_id",userId).order("last_active",{ascending:false});
    if(error){ console.error("device check failed",error); return true; /* fail-open: don't lock out on bug */ }
    const mine = (existing||[]).find(d => d.device_id === myDeviceId);
    if(mine){
      // Already registered — bump last_active
      await sb.from("user_devices").update({last_active:new Date().toISOString()}).eq("id",mine.id);
      return true;
    }
    // New device. Check capacity
    if((existing||[]).length >= MAX_DEVICES){
      setDeviceGate({devices: existing, myDeviceId, myLabel, myUA, userId});
      return false;
    }
    // Capacity OK — register
    await sb.from("user_devices").insert({
      user_id:userId, device_id:myDeviceId, label:myLabel, user_agent:myUA,
    });
    return true;
  };

  // Called when the user picks a device to remotely revoke from the blocker modal
  const revokeDeviceAndContinue = async (deviceRowId) => {
    if(!deviceGate) return;
    const {error} = await sb.from("user_devices").delete().eq("id",deviceRowId);
    if(error){ console.error(error); return; }
    // Now register the current device
    await sb.from("user_devices").insert({
      user_id: deviceGate.userId,
      device_id: deviceGate.myDeviceId,
      label: deviceGate.myLabel,
      user_agent: deviceGate.myUA,
    });
    setDeviceGate(null);
    // The user was already authenticated before hitting the device gate, but we
    // never loaded their profile (because we returned early). Load it now so the
    // app shows the CRM instead of treating them as a fresh signup.
    await loadProfile(deviceGate.userId);
  };

  // Load current devices list for the management panel
  const loadDevices = async () => {
    if(!user) return;
    const {data} = await sb.from("user_devices")
      .select("*").eq("user_id",user.id).order("last_active",{ascending:false});
    setDevicesList(data||[]);
  };

  // Sign out from a specific device (from the management panel)
  const signOutDevice = async (deviceRowId, isCurrent) => {
    await sb.from("user_devices").delete().eq("id",deviceRowId);
    if(isCurrent){
      // If user closed their own device, sign them out fully
      try { localStorage.removeItem("bobul_device_id"); } catch {}
      await sb.auth.signOut();
    } else {
      loadDevices();
    }
  };

  const handleOnboardingFinish=async(cfg)=>{
    setConfig(cfg);
    if(user){
      await sb.from("profiles").upsert({
        id:user.id,
        name:cfg.name,
        company:cfg.company||"",
        profession_id:cfg.profession?.id||"custom",
        profession_label:cfg.profession?.label||"",
        profession_icon:cfg.profession?.icon||"⚡",
        stages:cfg.stages,
        plan:null,
      });
    }
    track("onboarding_completed", {profession_id: cfg.profession?.id, has_company: !!cfg.company});
    setShowPricing(true);
  };

  const handleSignOut=async()=>{
    // Remove this device from the user_devices table so the slot is freed
    if(user){
      const myDeviceId = (()=>{ try{return localStorage.getItem("bobul_device_id");}catch{return null;} })();
      if(myDeviceId){
        await sb.from("user_devices").delete().eq("user_id",user.id).eq("device_id",myDeviceId);
      }
    }
    track("signout");
    resetTracking();
    await sb.auth.signOut();
    setUser(null);setConfig(null);setDeviceGate(null);
  };

  // Loading
  if(user===undefined||loadingConfig) return(
    <div style={{minHeight:"100vh",background:T.bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"Cormorant Garamond,serif"}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:48,color:T.gold,marginBottom:12,animation:"glow 2s infinite"}}>◈</div>
        <div style={{fontSize:14,color:T.textMuted,letterSpacing:2}}>Cargando Bobul...</div>
      </div>
    </div>
  );

  // Not authenticated
  if(!user) return(<><style>{css}</style><AuthScreen onAuth={handleAuth}/></>);

  // Device gate: too many devices, must close one to continue
  if(deviceGate) return(<><style>{css}</style><DeviceGate gate={deviceGate} onRevoke={revokeDeviceAndContinue} onSignOut={handleSignOut}/></>);

  // Authenticated but no config → onboarding
  if(!config) return(<><style>{css}</style><Onboarding onFinish={handleOnboardingFinish}/></>);

  // Access gate: must be on Pro plan. subscription_end is optional —
  // if present, must be in the future. If absent, access is granted (lifetime/manual).
  const subExpired = subscriptionEnd && new Date(subscriptionEnd) <= new Date();
  const hasAccess = plan === "pro" && !subExpired;

  // Show pricing screen if user explicitly requested it OR if access is denied
  if(showPricing || !hasAccess) return(<><style>{css}</style><PricingScreen user={user} currentPlan={plan} onSelectPlan={async(p)=>{
    setPlan(p);setShowPricing(false);
    if(user) await sb.from("profiles").update({plan:p}).eq("id",user.id);
  }} onSignOut={handleSignOut} canDismiss={hasAccess}/></>);

  // Full CRM
  return(<><style>{css}</style><CRM config={config} user={user} supabase={sb} plan={plan} subscriptionEnd={subscriptionEnd} themeId={themeId} onThemeChange={async(id)=>{setThemeId(id);Object.assign(T,THEMES[id]||THEMES.ivory);localStorage.setItem("bobul_theme",id);if(sb&&user)await sb.from("profiles").update({theme:id}).eq("id",user.id);}} onUpgrade={()=>setShowPricing(true)} onReset={(newCfg)=>{ if(newCfg&&typeof newCfg==="object") setConfig({...newCfg}); else setConfig(null); }} onSignOut={handleSignOut}/></>);
}
