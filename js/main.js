/**
 * ==============================================================================
 * SIMULADOR 3D: LABORATORIO DE SIMULACIÓN CLÍNICA (BMS / IoT)
 * Control Microclimático, Tareas Preventivas de IA y Análisis de Vida Útil
 * ==============================================================================
 */

// --- CONFIGURACIÓN GLOBAL Y PARÁMETROS AMBIENTALES ---
const CONFIG = {
  MODEL_PATH: 'public/simulador3d.glb',
  CRITICAL_HUMIDITY: 65.0,     // Umbral de alerta por riesgo de humedad (%)
  EMERGENCY_HUMIDITY: 75.0,    // Umbral de alerta crítica abrupta en pantalla (%)
  TARGET_HUMIDITY: 50.0,       // Humedad objetivo recomendada (%)
  OPTIMAL_TEMP: 22.0,          // Temperatura óptima recomendada (°C)
  PARTICLE_COUNT: 2400,        // Partículas luminiscentes distribuidas en toda la sala
  SECTOR_HEIGHT: 0.38          // Altura calibrada de los bloques de sector
};

// --- DEFINICIÓN DE LAS 4 TAREAS PREVENTIVAS DE LA IA (MÁXIMO 4) ---
const AI_TASK_DEFINITIONS = [
  {
    id: 'task-ac-dehum',
    title: 'Deshumidificación Profunda en AC Central',
    category: 'Climatización HVAC',
    desc: 'Activar condensación frigorífica profunda en serpentín del AC central y drenaje continuo.',
    impactHum: 8.5,
    impactTemp: 1.2,
    targetSectors: ['S4', 'S5', 'S6'],
    minHumTrigger: 66.5,
    minTempTrigger: 24.1,
    unlocked: false,
    completed: false,
    inProgress: false
  },
  {
    id: 'task-manikin-purge',
    title: 'Purga y Secado en Simuladores de Pacientes (S1-S3)',
    category: 'Simulación Biomédica',
    desc: 'Secado de vías respiratorias, sensores internos y purga de cavidades en maniquíes clínicos.',
    impactHum: 12.0,
    impactTemp: 0.5,
    targetSectors: ['S1', 'S2', 'S3'],
    minHumTrigger: 69.0,
    minTempTrigger: 24.5,
    unlocked: false,
    completed: false,
    inProgress: false
  },
  {
    id: 'task-flow-redistrib',
    title: 'Redistribución de Flujo Laminar Periférico',
    category: 'Ventilación Clínica',
    desc: 'Ajuste de deflectores para disipar microclimas estancados hacia las zonas de retorno.',
    impactHum: 6.5,
    impactTemp: 0.8,
    targetSectors: ['S7', 'S8', 'S9'],
    minHumTrigger: 73.0,
    minTempTrigger: 25.2,
    unlocked: false,
    completed: false,
    inProgress: false
  },
  {
    id: 'task-hepa-dewpoint',
    title: 'Filtros HEPA & Control de Punto de Rocío',
    category: 'Filtración y Preservación',
    desc: 'Regulación higrométrica crítica para evitar condensación superficial sobre equipos médicos.',
    impactHum: 7.0,
    impactTemp: 0.4,
    targetSectors: ['all'],
    minHumTrigger: 77.0,
    minTempTrigger: 25.8,
    unlocked: false,
    completed: false,
    inProgress: false
  }
];

// --- ESTADO CENTRAL DE LA SIMULACIÓN ---
const LabState = {
  viewMode: 'real',            // 'real' | 'temp' | 'humidity'
  isSimulationRunning: false,  // Simulación de alza (AC apagado)
  acIsOn: true,                // Estado del aire acondicionado central
  currentParticleOpacity: 0.82,// Opacidad dinámica del sistema de partículas
  acEntranceActive: false,     // Animación de entrada de partículas desde el AC
  acEntranceTimer: 0.0,        // Temporizador de ráfaga de entrada
  hasShownCritical75Alert: false, // Control para que la alerta abrupta solo salga al cruzar 75%
  simSpeed: 1.0,               // Multiplicador de velocidad de simulación
  avgTemp: 23.8,               // Temperatura promedio de la sala (°C)
  centerTemp: 20.5,            // Temperatura del centro S5 (más frío por AC)
  maxTemp: 26.2,               // Temperatura máxima
  avgHumidity: 54.5,           // Humedad promedio de la sala (%)
  maxHumidity: 64.5,           // Humedad máxima encontrada (%)
  manikinsAvgHumidity: 62.0,   // Humedad promedio en zona de maniquíes (S1-S3)
  sectors: [],                 // 9 sectores (S1 a S9)
  // Límites reales del laboratorio calibrados desde el modelo Blender
  labBounds: {
    min: new THREE.Vector3(-1.91, 0.0, -0.93),
    max: new THREE.Vector3(0.79, 0.97, 0.94),
    center: new THREE.Vector3(-0.56, 0.48, 0.0),
    size: new THREE.Vector3(2.70, 0.97, 1.87)
  },
  // Coordenadas reales del Aire Acondicionado central en el techo
  acEmitterPos: new THREE.Vector3(-0.56, 0.94, 0.0),
  // Sistema de Tareas Preventivas de la IA
  aiTasks: []
};

// --- VARIABLES THREE.JS & CHARTS ---
let scene, camera, renderer, controls, clock;
let centralACMesh = null;
let particleSystem = null;
let sectorGroup = new THREE.Group();
let labelsGroup = new THREE.Group();
let lifecycleChartInstance = null;
let currentChartMode = 'both'; // 'both' | 'preventive' | 'failure'
let toastTimeout = null;

// ==============================================================================
// 1. INICIALIZACIÓN DE LA APLICACIÓN
// ==============================================================================
function initEngine() {
  const container = document.getElementById('canvas-container');
  clock = new THREE.Clock();

  // Escena con fondo clínico profundo
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x080c14);
  scene.fog = new THREE.FogExp2(0x080c14, 0.032);
  scene.add(sectorGroup);
  scene.add(labelsGroup);

  // Cámara con perspectiva clínica
  camera = new THREE.PerspectiveCamera(
    42,
    window.innerWidth / window.innerHeight,
    0.05,
    50
  );
  camera.position.set(1.45, 1.85, 2.30);

  // Renderizador WebGL
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  container.appendChild(renderer.domElement);

  // OrbitControls centrados en la sala
  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.target.set(-0.56, 0.45, 0.0);
  controls.minDistance = 0.6;
  controls.maxDistance = 6.5;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;

  // Iluminación clínica
  setupLighting();

  // Inicializar sectores con calibración física
  initSectorData();

  // Inicializar sistema de tareas preventivas de la IA
  initAITasks();

  // Cargar modelo 3D real
  loadLaboratoryModel();

  // Configurar listeners de interfaz y acordeones
  setupEventListeners();
  setupSidebarControls();

  // Inicializar gráficas de ciclo de vida útil con Chart.js (Fiel a la referencia)
  initLifecycleChart();

  // Loop principal de renderizado
  animate();

  addAILog('SISTEMA', 'Gemelo Digital 3D inicializado con éxito.', 'system');
  addAILog('AC-CLIMA', 'Aire Acondicionado Central activo. Inyección de flujo continuo.', 'ok');
  addAILog('IA-CONTROL', 'Supervisión de microclima activa: Foco de maniquíes y descarga de AC calibrados.', 'action');
}

// ==============================================================================
// 2. ILUMINACIÓN CLÍNICA ADAPTADA A LA ESCALA REAL
// ==============================================================================
function setupLighting() {
  const hemiLight = new THREE.HemisphereLight(0xf0fdf4, 0x0f172a, 0.85);
  hemiLight.position.set(-0.5, 4, 0);
  scene.add(hemiLight);

  const mainDirLight = new THREE.DirectionalLight(0xffffff, 1.35);
  mainDirLight.position.set(1.8, 3.5, 1.5);
  mainDirLight.castShadow = true;
  mainDirLight.shadow.mapSize.width = 2048;
  mainDirLight.shadow.mapSize.height = 2048;
  mainDirLight.shadow.camera.near = 0.1;
  mainDirLight.shadow.camera.far = 10;
  const d = 2.2;
  mainDirLight.shadow.camera.left = -d;
  mainDirLight.shadow.camera.right = d;
  mainDirLight.shadow.camera.top = d;
  mainDirLight.shadow.camera.bottom = -d;
  mainDirLight.shadow.bias = -0.0003;
  scene.add(mainDirLight);

  const fillLight = new THREE.DirectionalLight(0x38bdf8, 0.45);
  fillLight.position.set(-2.5, 2.0, -1.5);
  scene.add(fillLight);
}

// ==============================================================================
// 3. CARGA DEL MODELO 3D REAL
// ==============================================================================
function loadLaboratoryModel() {
  const loader = new THREE.GLTFLoader();
  const loadingScreen = document.getElementById('loading-screen');
  const barFill = document.getElementById('loading-bar-fill');
  const percentageText = document.getElementById('loading-percentage');
  const progressText = document.getElementById('loading-progress-text');

  loader.load(
    CONFIG.MODEL_PATH,
    (gltf) => {
      const model = gltf.scene;
      scene.add(model);

      const bbox = new THREE.Box3().setFromObject(model);
      LabState.labBounds.min.copy(bbox.min);
      LabState.labBounds.max.copy(bbox.max);
      bbox.getCenter(LabState.labBounds.center);
      bbox.getSize(LabState.labBounds.size);

      controls.target.copy(LabState.labBounds.center);
      controls.target.y = LabState.labBounds.min.y + LabState.labBounds.size.y * 0.45;

      const maxDim = Math.max(LabState.labBounds.size.x, LabState.labBounds.size.z);
      camera.position.set(
        LabState.labBounds.center.x + maxDim * 0.75,
        LabState.labBounds.center.y + LabState.labBounds.size.y * 1.35,
        LabState.labBounds.center.z + maxDim * 0.95
      );
      controls.update();

      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;

          if (child.material) {
            child.material.roughness = Math.min(0.85, Math.max(0.15, child.material.roughness || 0.4));
            child.material.needsUpdate = true;
          }

          const name = child.name.toLowerCase();

          // Identificar Aire Acondicionado Central en Techo (model.001)
          if (child.name === 'model.001' || name.includes('model.001') || name.includes('aire')) {
            centralACMesh = child;
            child.geometry.computeBoundingBox();
            const acBox = new THREE.Box3().setFromObject(child);
            acBox.getCenter(LabState.acEmitterPos);
            LabState.acEmitterPos.y = acBox.min.y;
            addAILog('HARDWARE', `Aire Acondicionado Central en techo localizado: [${child.name}]`, 'system');
          }
        }
      });

      buildCalibratedSectors();
      createAirflowParticleSystem();

      setTimeout(() => {
        if (loadingScreen) {
          loadingScreen.style.opacity = '0';
          setTimeout(() => {
            loadingScreen.style.display = 'none';
            addAILog('SISTEMA', 'Modelo 3D y telemetría de 9 sectores sincronizados.', 'system');
          }, 600);
        }
      }, 400);
    },
    (xhr) => {
      let percent = 0;
      if (xhr.lengthComputable && xhr.total > 0) {
        percent = Math.round((xhr.loaded / xhr.total) * 100);
        const loadedMB = (xhr.loaded / 1048576).toFixed(1);
        const totalMB = (xhr.total / 1048576).toFixed(1);
        if (progressText) progressText.innerText = `Cargando: ${loadedMB} MB / ${totalMB} MB`;
      } else {
        const loadedMB = (xhr.loaded / 1048576).toFixed(1);
        percent = Math.min(99, Math.round((xhr.loaded / (92.5 * 1048576)) * 100));
        if (progressText) progressText.innerText = `Cargando modelo: ${loadedMB} MB`;
      }
      if (barFill) barFill.style.width = `${percent}%`;
      if (percentageText) percentageText.innerText = `${percent}%`;
    },
    (error) => {
      console.error('Error al cargar simulador3d.glb:', error);
      if (progressText) progressText.innerText = 'Error al cargar modelo 3D.';
      addAILog('ERROR', 'Error al cargar archivo GLB.', 'alert');
    }
  );
}

// ==============================================================================
// 4. MATRIZ 3x3 CALIBRADA: CENTRO MÁS FRÍO, MANIQUÍES MÁS HÚMEDOS
// ==============================================================================
function initSectorData() {
  LabState.sectors = [];

  const sectorConfigs = [
    // Fila 0: Zona Posterior (Camillas y Maniquíes de Alta Fidelidad)
    { id: 'S1', name: 'Cama Pediatría', row: 0, col: 0, baseTemp: 24.5, baseHum: 60.0, manikinWeight: 1.35, isManikinZone: true, isACCenter: false },
    { id: 'S2', name: 'UCI Adulto (Foco Principal)', row: 0, col: 1, baseTemp: 24.0, baseHum: 64.5, manikinWeight: 1.60, isManikinZone: true, isACCenter: false },
    { id: 'S3', name: 'Cama Materno-Infantil', row: 0, col: 2, baseTemp: 24.8, baseHum: 61.0, manikinWeight: 1.35, isManikinZone: true, isACCenter: false },

    // Fila 1: Zona Central (Cruce de la Sala & Descarga de Climatización)
    { id: 'S4', name: 'Pasillo Lateral Oeste', row: 1, col: 0, baseTemp: 23.2, baseHum: 50.5, manikinWeight: 0.85, isManikinZone: false, isACCenter: false },
    { id: 'S5', name: 'Centro Sala (Descarga AC Central)', row: 1, col: 1, baseTemp: 20.5, baseHum: 45.0, manikinWeight: 0.35, isManikinZone: false, isACCenter: true },
    { id: 'S6', name: 'Pasillo Lateral Este', row: 1, col: 2, baseTemp: 23.5, baseHum: 52.0, manikinWeight: 0.90, isManikinZone: false, isACCenter: false },

    // Fila 2: Zona Frontal (Mesa Quirúrgica, Accesos y Monitores)
    { id: 'S7', name: 'Acceso Clínico / Lavamanos', row: 2, col: 0, baseTemp: 25.2, baseHum: 53.5, manikinWeight: 0.80, isManikinZone: false, isACCenter: false },
    { id: 'S8', name: 'Camilla Quirúrgica / RCP', row: 2, col: 1, baseTemp: 23.6, baseHum: 58.0, manikinWeight: 1.20, isManikinZone: true, isACCenter: false },
    { id: 'S9', name: 'Estación Monitores & Equipos', row: 2, col: 2, baseTemp: 26.2, baseHum: 52.5, manikinWeight: 0.75, isManikinZone: false, isACCenter: false }
  ];

  sectorConfigs.forEach((cfg) => {
    LabState.sectors.push({
      id: cfg.id,
      name: cfg.name,
      row: cfg.row,
      col: cfg.col,
      temp: cfg.baseTemp,
      baseTemp: cfg.baseTemp,
      humidity: cfg.baseHum,
      baseHumidity: cfg.baseHum,
      manikinWeight: cfg.manikinWeight,
      isManikinZone: cfg.isManikinZone,
      isACCenter: cfg.isACCenter,
      mesh: null,
      edges: null,
      labelSprite: null,
      bounds: null
    });
  });
}

function buildCalibratedSectors() {
  while (sectorGroup.children.length > 0) {
    const obj = sectorGroup.children[0];
    sectorGroup.remove(obj);
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) obj.material.dispose();
  }
  while (labelsGroup.children.length > 0) {
    const obj = labelsGroup.children[0];
    labelsGroup.remove(obj);
    if (obj.material && obj.material.map) obj.material.map.dispose();
  }

  const { min, size } = LabState.labBounds;
  const sectorW = size.x / 3;
  const sectorD = size.z / 3;
  const sectorH = Math.min(CONFIG.SECTOR_HEIGHT, size.y * 0.42);
  const floorY = min.y + 0.01;

  LabState.sectors.forEach((sec) => {
    const minX = min.x + sec.col * sectorW;
    const maxX = minX + sectorW;
    const minZ = min.z + sec.row * sectorD;
    const maxZ = minZ + sectorD;

    const centerX = (minX + maxX) / 2;
    const centerZ = (minZ + maxZ) / 2;
    const centerY = floorY + sectorH / 2;

    sec.bounds = new THREE.Box3(
      new THREE.Vector3(minX, floorY, minZ),
      new THREE.Vector3(maxX, floorY + sectorH, maxZ)
    );

    const geo = new THREE.BoxGeometry(sectorW * 0.96, sectorH, sectorD * 0.96);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: new THREE.Color(0x38bdf8),
      emissiveIntensity: 0.40,
      transparent: true,
      opacity: 0.70,
      depthWrite: false,
      roughness: 0.25,
      metalness: 0.05
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(centerX, centerY, centerZ);

    const edgeGeo = new THREE.EdgesGeometry(geo);
    const edgeMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.95
    });
    const edges = new THREE.LineSegments(edgeGeo, edgeMat);
    mesh.add(edges);

    sec.mesh = mesh;
    sec.edges = edges;
    sectorGroup.add(mesh);

    const labelSprite = createSectorLabelSprite(sec.id, sec.isACCenter, sec.isManikinZone);
    labelSprite.position.set(centerX, floorY + sectorH + 0.05, centerZ);
    labelsGroup.add(labelSprite);
    sec.labelSprite = labelSprite;
  });

  updateSectorsVisualization();
  renderUIMiniMap();
  evaluateLabSensors();
}

function createSectorLabelSprite(text, isACCenter, isManikinZone) {
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 70;
  const ctx = canvas.getContext('2d');

  let borderColor = 'rgba(56, 189, 248, 0.65)';
  let tagColor = '#38bdf8';
  let tagSubtext = 'Sector IoT';

  if (isACCenter) {
    borderColor = 'rgba(56, 189, 248, 1.0)';
    tagColor = '#06b6d4';
    tagSubtext = 'Descarga AC';
  } else if (isManikinZone) {
    borderColor = 'rgba(244, 63, 94, 0.95)';
    tagColor = '#fb7185';
    tagSubtext = 'Maniquíes';
  }

  ctx.fillStyle = 'rgba(13, 19, 33, 0.92)';
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 3;
  ctx.roundRect(8, 8, 144, 54, 10);
  ctx.fill();
  ctx.stroke();

  ctx.font = 'bold 22px monospace';
  ctx.fillStyle = tagColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 80, 26);

  ctx.font = '11px sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(tagSubtext, 80, 48);

  const texture = new THREE.CanvasTexture(canvas);
  const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0.90 });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.scale.set(0.20, 0.09, 1.0);
  return sprite;
}

/**
 * Visualización 3D con ALTA VISIBILIDAD y MENOS TRANSPARENCIA (Punto 4)
 */
function updateSectorsVisualization() {
  if (LabState.viewMode === 'real') {
    sectorGroup.visible = false;
    labelsGroup.visible = false;
    return;
  }

  sectorGroup.visible = true;
  labelsGroup.visible = true;

  LabState.sectors.forEach((sec) => {
    if (!sec.mesh) return;
    let targetColor = new THREE.Color();
    let opacity = 0.72;
    let emissiveIntensity = 0.50;

    if (LabState.viewMode === 'temp') {
      const t = Math.min(1, Math.max(0, (sec.temp - 20.0) / (28.0 - 20.0)));
      if (t < 0.5) {
        targetColor.lerpColors(new THREE.Color(0x0284c7), new THREE.Color(0xf59e0b), t * 2);
      } else {
        targetColor.lerpColors(new THREE.Color(0xf59e0b), new THREE.Color(0xef4444), (t - 0.5) * 2);
      }
      opacity = sec.isACCenter ? 0.78 : 0.68;
      emissiveIntensity = 0.45;
    } else if (LabState.viewMode === 'humidity') {
      if (sec.humidity < 55.0) {
        const t = Math.min(1, Math.max(0, (sec.humidity - 40.0) / 15.0));
        targetColor.lerpColors(new THREE.Color(0x00d2ff), new THREE.Color(0x0284c7), t);
        opacity = 0.68;
        emissiveIntensity = 0.40;
      } else if (sec.humidity < CONFIG.CRITICAL_HUMIDITY) {
        const t = Math.min(1, (sec.humidity - 55.0) / 10.0);
        targetColor.lerpColors(new THREE.Color(0x0284c7), new THREE.Color(0x9333ea), t);
        opacity = 0.75;
        emissiveIntensity = 0.55;
      } else {
        const t = Math.min(1, (sec.humidity - CONFIG.CRITICAL_HUMIDITY) / 18.0);
        targetColor.lerpColors(new THREE.Color(0xf43f5e), new THREE.Color(0xef4444), t);
        opacity = 0.84;
        emissiveIntensity = 0.75;
      }
    }

    sec.mesh.material.color.copy(targetColor);
    sec.mesh.material.emissive.copy(targetColor);
    sec.mesh.material.emissiveIntensity = emissiveIntensity;
    sec.mesh.material.opacity = opacity;
    sec.edges.material.color.copy(targetColor);
    sec.edges.material.opacity = 0.95;
  });
}

// ==============================================================================
// 5. SISTEMA DE PARTÍCULAS: DISPERSIÓN GRADUAL AL APAGAR Y ENTRADA SUAVE AL ENCENDER
// ==============================================================================
function createAirflowParticleSystem() {
  if (particleSystem) {
    scene.remove(particleSystem);
    particleSystem.geometry.dispose();
    particleSystem.material.dispose();
  }

  const count = CONFIG.PARTICLE_COUNT;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  const lifetimes = new Float32Array(count);
  const phaseSeeds = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    if (i < count * 0.40) {
      resetParticleAtAC(i, positions, velocities, lifetimes, false);
    } else {
      resetParticleInRoom(i, positions, velocities, lifetimes);
    }

    phaseSeeds[i] = Math.random() * Math.PI * 2;

    colors[i * 3] = 0.22;
    colors[i * 3 + 1] = 0.85;
    colors[i * 3 + 2] = 1.0;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.userData = { velocities, lifetimes, phaseSeeds };

  const texture = createLuminousRadialTexture();

  const material = new THREE.PointsMaterial({
    size: 0.046,
    map: texture,
    transparent: true,
    opacity: LabState.currentParticleOpacity,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  particleSystem = new THREE.Points(geometry, material);
  scene.add(particleSystem);
}

function resetParticleAtAC(index, positions, velocities, lifetimes, isInitialBurst = false) {
  const acPos = LabState.acEmitterPos;
  const idx = index * 3;

  positions[idx] = acPos.x + (Math.random() - 0.5) * 0.45;
  positions[idx + 1] = acPos.y - 0.02 - (isInitialBurst ? Math.random() * 0.12 : Math.random() * 0.35);
  positions[idx + 2] = acPos.z + (Math.random() - 0.5) * 0.35;

  const spread = isInitialBurst ? 0.22 : 0.14;
  velocities[idx] = (Math.random() - 0.5) * spread;
  velocities[idx + 1] = isInitialBurst ? (-0.25 - Math.random() * 0.25) : (-0.09 - Math.random() * 0.12);
  velocities[idx + 2] = (Math.random() - 0.5) * spread;

  lifetimes[index] = isInitialBurst ? 0.0 : Math.random() * 12.0;
}

function resetParticleInRoom(index, positions, velocities, lifetimes) {
  const { min, size } = LabState.labBounds;
  const idx = index * 3;

  positions[idx] = min.x + 0.08 + Math.random() * (size.x - 0.16);
  positions[idx + 1] = min.y + 0.05 + Math.random() * (size.y - 0.12);
  positions[idx + 2] = min.z + 0.08 + Math.random() * (size.z - 0.16);

  velocities[idx] = (Math.random() - 0.5) * 0.10;
  velocities[idx + 1] = (Math.random() - 0.5) * 0.06;
  velocities[idx + 2] = (Math.random() - 0.5) * 0.10;

  lifetimes[index] = Math.random() * 12.0;
}

function createLuminousRadialTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 31);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
  gradient.addColorStop(0.25, 'rgba(165, 243, 252, 0.95)');
  gradient.addColorStop(0.60, 'rgba(56, 189, 248, 0.60)');
  gradient.addColorStop(0.88, 'rgba(2, 132, 199, 0.15)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);

  const tex = new THREE.CanvasTexture(canvas);
  tex.generateMipmaps = true;
  return tex;
}

/**
 * Animación física de partículas:
 * - Cuando se apaga el AC: dispersión gradual y desaparición lenta (tarda 6-8s de deriva orgánica).
 * - Cuando se enciende el AC: ráfaga suave descendente y gradual fade-in.
 */
function updateParticles(delta) {
  if (!particleSystem) return;

  const positions = particleSystem.geometry.attributes.position.array;
  const colors = particleSystem.geometry.attributes.color.array;
  const velocities = particleSystem.geometry.userData.velocities;
  const lifetimes = particleSystem.geometry.userData.lifetimes;
  const phaseSeeds = particleSystem.geometry.userData.phaseSeeds;
  const count = CONFIG.PARTICLE_COUNT;
  const { min, max } = LabState.labBounds;
  const acPos = LabState.acEmitterPos;
  const elapsedTime = clock.getElapsedTime();

  // 1. CONTROL DE ESTADO DEL AC Y OPACIDAD
  if (!LabState.acIsOn) {
    // Desvanecimiento suave y pausado (tarda ~6-8 segundos en disiparse completamente)
    LabState.currentParticleOpacity = THREE.MathUtils.lerp(LabState.currentParticleOpacity, 0.0, delta * 0.32);
    particleSystem.material.opacity = LabState.currentParticleOpacity;

    if (LabState.currentParticleOpacity < 0.005) {
      particleSystem.visible = false;
      return;
    }
  } else {
    particleSystem.visible = true;
    const targetOpacity = LabState.maxHumidity > CONFIG.CRITICAL_HUMIDITY ? 0.88 : 0.80;
    LabState.currentParticleOpacity = THREE.MathUtils.lerp(LabState.currentParticleOpacity, targetOpacity, delta * 2.0);
    particleSystem.material.opacity = LabState.currentParticleOpacity;

    if (LabState.acEntranceActive) {
      LabState.acEntranceTimer += delta;
      if (LabState.acEntranceTimer > 3.0) {
        LabState.acEntranceActive = false;
      }
    }
  }

  // 2. FÍSICA Y MOVIMIENTO DE PARTÍCULAS
  const isAlert = LabState.maxHumidity > CONFIG.CRITICAL_HUMIDITY;

  for (let i = 0; i < count; i++) {
    const px = i * 3;
    const py = i * 3 + 1;
    const pz = i * 3 + 2;

    lifetimes[i] += delta;

    if (LabState.acIsOn) {
      const dxCenter = positions[px] - acPos.x;
      const dzCenter = positions[pz] - acPos.z;
      const distCenter = Math.sqrt(dxCenter * dxCenter + dzCenter * dzCenter);

      // Flujo activo desde el AC central en el techo
      if (distCenter < 0.65 && positions[py] > min.y + 0.20) {
        velocities[py] -= (LabState.acEntranceActive ? 0.22 : 0.10) * delta;
        velocities[px] += (dxCenter / (distCenter + 0.05)) * 0.08 * delta;
        velocities[pz] += (dzCenter / (distCenter + 0.05)) * 0.08 * delta;
      }

      // Dispersión laminar sobre camillas y suelo
      if (positions[py] < min.y + 0.32) {
        velocities[py] = Math.max(0.01, velocities[py] + 0.06 * delta);
      } else if (distCenter > 0.70 && positions[py] < max.y - 0.15) {
        velocities[py] += 0.03 * delta;
      }

      const phase = phaseSeeds[i] + elapsedTime * 0.7;
      velocities[px] += Math.sin(phase + positions[pz] * 2.5) * 0.010 * delta;
      velocities[pz] += Math.cos(phase + positions[px] * 2.5) * 0.010 * delta;

      velocities[px] *= 0.988;
      velocities[py] = Math.max(-0.25, Math.min(0.18, velocities[py]));
      velocities[pz] *= 0.988;
    } else {
      // Con AC apagado: dispersión gradual y lenta deriva hacia las paredes y reposo
      velocities[px] += (Math.random() - 0.5) * 0.03 * delta;
      velocities[pz] += (Math.random() - 0.5) * 0.03 * delta;
      velocities[py] = THREE.MathUtils.lerp(velocities[py], 0.002, delta * 0.30);
      velocities[px] *= Math.max(0, 1.0 - 0.20 * delta);
      velocities[pz] *= Math.max(0, 1.0 - 0.20 * delta);
    }

    positions[px] += velocities[px] * delta;
    positions[py] += velocities[py] * delta;
    positions[pz] += velocities[pz] * delta;

    // Rebote suave en límites
    if (positions[px] < min.x + 0.05) { positions[px] = min.x + 0.06; velocities[px] = Math.abs(velocities[px]) * 0.8; }
    if (positions[px] > max.x - 0.05) { positions[px] = max.x - 0.06; velocities[px] = -Math.abs(velocities[px]) * 0.8; }
    if (positions[pz] < min.z + 0.05) { positions[pz] = min.z + 0.06; velocities[pz] = Math.abs(velocities[pz]) * 0.8; }
    if (positions[pz] > max.z - 0.05) { positions[pz] = max.z - 0.06; velocities[pz] = -Math.abs(velocities[pz]) * 0.8; }

    if (positions[py] > max.y - 0.04) {
      positions[py] = max.y - 0.05;
      velocities[py] = -Math.abs(velocities[py]) * 0.6;
    }
    if (positions[py] < min.y + 0.04) {
      positions[py] = min.y + 0.05;
      velocities[py] = Math.abs(velocities[py]) * 0.6;
    }

    // Reciclaje continuo mientras el AC esté activo
    if (LabState.acIsOn && lifetimes[i] > 18.0) {
      if (Math.random() < 0.40) {
        resetParticleAtAC(i, positions, velocities, lifetimes, false);
      } else {
        resetParticleInRoom(i, positions, velocities, lifetimes);
      }
    }

    // Color cromático reactivo
    const isNearManikins = positions[pz] < -0.25;
    if (isAlert) {
      if (isNearManikins) {
        colors[px] = 1.0;
        colors[py] = 0.20;
        colors[pz] = 0.35;
      } else {
        colors[px] = 0.95;
        colors[py] = 0.45;
        colors[pz] = 0.70;
      }
    } else {
      colors[px] = 0.18;
      colors[py] = 0.88;
      colors[pz] = 1.0;
    }
  }

  particleSystem.geometry.attributes.position.needsUpdate = true;
  particleSystem.geometry.attributes.color.needsUpdate = true;
}

function triggerACEntranceAnimation() {
  LabState.acIsOn = true;
  LabState.acEntranceActive = true;
  LabState.acEntranceTimer = 0.0;
  LabState.currentParticleOpacity = 0.15;

  if (particleSystem) {
    particleSystem.visible = true;
    const positions = particleSystem.geometry.attributes.position.array;
    const velocities = particleSystem.geometry.userData.velocities;
    const lifetimes = particleSystem.geometry.userData.lifetimes;
    const count = CONFIG.PARTICLE_COUNT;

    for (let i = 0; i < count; i++) {
      if (i < count * 0.65) {
        resetParticleAtAC(i, positions, velocities, lifetimes, true);
      }
    }
    particleSystem.geometry.attributes.position.needsUpdate = true;
  }

  addAILog('AC-CENTRAL', '🌬️ Inyección de aire frío iniciada: ráfaga laminar descendente desde el techo.', 'ok');
}

// ==============================================================================
// 6. SISTEMA DE TAREAS PREVENTIVAS DE LA IA EQUIVALENTES AL UMBRAL (Punto 1 y 3)
// ==============================================================================
function initAITasks() {
  LabState.aiTasks = AI_TASK_DEFINITIONS.map(d => ({ ...d }));
  renderAITasksUI();
}

function renderAITasksUI(highlightTaskId = null) {
  const container = document.getElementById('ai-tasks-container');
  const badgeProgress = document.getElementById('tasks-progress-badge');
  const btnApplyAll = document.getElementById('btn-apply-all-tasks');
  if (!container) return;

  const unlockedTasks = LabState.aiTasks.filter(t => t.unlocked);
  const completedCount = unlockedTasks.filter(t => t.completed).length;

  if (badgeProgress) {
    if (unlockedTasks.length === 0) {
      badgeProgress.innerText = '0/4 Activas';
      badgeProgress.className = 'text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-white/10';
    } else {
      badgeProgress.innerText = `${completedCount}/${unlockedTasks.length} Hechas (${unlockedTasks.length}/4)`;
      badgeProgress.className = completedCount === unlockedTasks.length
        ? 'text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
        : 'text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30';
    }
  }

  if (btnApplyAll) {
    btnApplyAll.style.display = unlockedTasks.length > 0 ? 'flex' : 'none';
  }

  container.innerHTML = '';

  if (unlockedTasks.length === 0) {
    container.innerHTML = `
      <div class="p-3.5 rounded-lg border border-dashed border-cyan-500/20 bg-cyan-500/5 text-center">
        <div class="w-8 h-8 mx-auto mb-2 rounded-full bg-cyan-500/10 flex items-center justify-center text-cyan-400">
          <i class="fa-solid fa-shield-halved animate-pulse"></i>
        </div>
        <div class="text-xs font-semibold text-slate-200">Monitoreo Predictivo Activo</div>
        <p class="text-[10px] text-slate-400 mt-1 leading-relaxed">
          Sin alertas activas. Al apagar el AC central y ascender la humedad/temperatura, la IA emitirá hasta 4 recomendaciones preventivas con notificación flotante.
        </p>
      </div>
    `;
    return;
  }

  unlockedTasks.forEach((task) => {
    const isNewLanding = task.id === highlightTaskId;
    const card = document.createElement('div');
    card.className = `bms-card p-2.5 rounded-lg border transition-all ${isNewLanding ? 'animate-task-land ring-2 ring-amber-400/80 shadow-lg shadow-amber-500/20' : ''} ${
      task.completed
        ? 'border-emerald-500/30 bg-emerald-500/5'
        : 'border-white/10 hover:border-cyan-500/40 bg-slate-900/60'
    }`;

    card.innerHTML = `
      <div class="flex items-start justify-between gap-2">
        <div class="flex-1">
          <div class="flex items-center gap-1.5">
            <span class="text-[9px] font-mono uppercase px-1.5 py-0.2 rounded ${
              task.completed ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
            }">${task.category}</span>
            <span class="text-[10px] font-mono text-cyan-400 font-semibold">Mitigación proporcional</span>
          </div>
          <h4 class="text-xs font-semibold text-slate-200 mt-1">${task.title}</h4>
          <p class="text-[10px] text-slate-400 mt-0.5 leading-snug">${task.desc}</p>
        </div>
        <button
          data-task-id="${task.id}"
          class="btn-execute-task shrink-0 py-1.5 px-2.5 rounded-md text-[10px] font-mono font-semibold transition-all ${
            task.completed
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 cursor-default'
              : 'bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border border-cyan-500/40 shadow-sm active:scale-95'
          }">
          ${task.completed ? '<i class="fa-solid fa-check"></i> Hecha' : '<i class="fa-solid fa-play text-[9px]"></i> Ejecutar'}
        </button>
      </div>
    `;

    const btn = card.querySelector('.btn-execute-task');
    if (btn && !task.completed) {
      btn.addEventListener('click', () => executeAITask(task.id));
    }

    container.appendChild(card);
  });
}

function showFloatingTaskToast(task) {
  const toast = document.getElementById('floating-task-toast');
  const toastInner = document.getElementById('toast-card-inner');
  const titleEl = document.getElementById('toast-task-title');
  const descEl = document.getElementById('toast-task-desc');
  const impactEl = document.getElementById('toast-task-impact');
  const btnView = document.getElementById('btn-toast-view');
  if (!toast) return;

  if (titleEl) titleEl.innerText = task.title;
  if (descEl) descEl.innerText = task.desc;
  if (impactEl) impactEl.innerText = `-${task.impactHum}% HR`;

  if (toastTimeout) clearTimeout(toastTimeout);

  toast.classList.remove('hidden');
  if (toastInner) {
    toastInner.classList.remove('animate-toast-fly');
    toastInner.classList.add('animate-toast-jump');
  }

  const dismissToast = () => {
    if (toastInner) {
      toastInner.classList.remove('animate-toast-jump');
      toastInner.classList.add('animate-toast-fly');
      setTimeout(() => {
        toast.classList.add('hidden');
      }, 380);
    } else {
      toast.classList.add('hidden');
    }
  };

  if (btnView) {
    btnView.onclick = () => {
      dismissToast();
      const tasksSec = document.getElementById('content-sec-aitasks');
      if (tasksSec) tasksSec.style.display = 'block';
      const rightSidebar = document.getElementById('right-sidebar');
      if (rightSidebar) rightSidebar.scrollTop = 220;
    };
  }

  toastTimeout = setTimeout(() => {
    dismissToast();
  }, 3600);
}

function unlockAITask(task) {
  task.unlocked = true;
  showFloatingTaskToast(task);
  renderAITasksUI(task.id);
  addAILog('IA-RECOMENDACIÓN', `🔔 Alerta por umbral climático. Nueva tarea preventiva: "${task.title}".`, 'action');
}

/**
 * Valores nominales esperados para cada sector cuando la sala vuelve a una operación segura.
 * La meta de control mantiene la humedad cercana a 50% HR y la temperatura alrededor de 22°C,
 * sin dejar zonas de maniquíes por encima del rango operativo aceptable.
 */
function getNominalSectorHumidity(sec) {
  const targetHum = sec.isManikinZone ? CONFIG.TARGET_HUMIDITY + 4.0 : CONFIG.TARGET_HUMIDITY;
  return Math.min(sec.baseHumidity, targetHum);
}

function getNominalSectorTemp(sec) {
  const targetTemp = sec.isManikinZone ? CONFIG.OPTIMAL_TEMP + 1.5 : CONFIG.OPTIMAL_TEMP;
  return Math.min(sec.baseTemp, targetTemp);
}

function normalizeEnvironmentToSafeConditions() {
  LabState.sectors.forEach((sec) => {
    sec.humidity = getNominalSectorHumidity(sec);
    sec.temp = getNominalSectorTemp(sec);
  });

  LabState.isSimulationRunning = false;
  LabState.hasShownCritical75Alert = false;
  closeAbruptCriticalModal();
  triggerACEntranceAnimation();
  updateSimulationToggleUI();
  evaluateLabSensors();
}

/**
 * Ejecución de tareas con reducción proporcional equivalente al nivel de humedad:
 * Conforme se van completando las tareas, la humedad regresa gradualmente al umbral correcto (50.0% HR).
 */
function executeAITask(taskId) {
  const task = LabState.aiTasks.find(t => t.id === taskId);
  if (!task || task.completed || task.inProgress) return;

  task.inProgress = true;
  addAILog('IA-PREVENCIÓN', `Iniciando tarea: "${task.title}"...`, 'action');

  // Calcular la porción de exceso correspondiente a esta tarea
  const pendingIncomplete = LabState.aiTasks.filter(t => t.unlocked && !t.completed).length;
  const shareRatio = 1.0 / Math.max(1, pendingIncomplete);

  let step = 0;
  const totalSteps = 14;

  const interval = setInterval(() => {
    step++;

    LabState.sectors.forEach((sec) => {
      const isTarget = task.targetSectors.includes('all') || task.targetSectors.includes(sec.id);
      if (isTarget) {
        const targetHumidity = getNominalSectorHumidity(sec);
        const excessHum = Math.max(0, sec.humidity - targetHumidity);
        const humDelta = Math.max(0.40, (excessHum * shareRatio) / totalSteps);
        sec.humidity = Math.max(targetHumidity, sec.humidity - humDelta);

        const targetTemp = getNominalSectorTemp(sec);
        const excessTemp = Math.max(0, sec.temp - targetTemp);
        const tempDelta = Math.max(0.08, (excessTemp * shareRatio) / totalSteps);
        sec.temp = Math.max(targetTemp, sec.temp - tempDelta);
      }
    });

    evaluateLabSensors();

    if (step >= totalSteps) {
      clearInterval(interval);
      task.completed = true;
      task.inProgress = false;
      renderAITasksUI();
      addAILog('IA-PREVENCIÓN', `✓ Tarea completada: "${task.title}". Mitigación aplicada hacia el umbral seguro.`, 'ok');

      // Si todas las tareas activas se han completado, normalizar por completo
      const allActiveDone = LabState.aiTasks.filter(t => t.unlocked).every(t => t.completed);
      if (allActiveDone) {
        normalizeEnvironmentToSafeConditions();
        addAILog('IA-MITIGACIÓN', '✅ Contingencia resuelta: Todas las tareas preventivas completadas. Humedad estabilizada en el umbral nominal (50% HR).', 'ok');
      }
    }
  }, 90);
}

function applyAllAITasks() {
  const pendingTasks = LabState.aiTasks.filter(t => t.unlocked && !t.completed);
  if (pendingTasks.length === 0) {
    addAILog('IA-PREVENCIÓN', 'No hay tareas activas pendientes por aplicar.', 'system');
    return;
  }

  addAILog('IA-PREVENCIÓN', '⚡ Ejecutando plan integral de mitigación preventiva...', 'action');
  pendingTasks.forEach((task, idx) => {
    setTimeout(() => {
      executeAITask(task.id);
    }, idx * 280);
  });
}

// ==============================================================================
// 7. SIMULACIÓN DE ALZA Y MODAL ABRUPTO (>75% HR)
// ==============================================================================
let aiLoopTimer = 0;

function updateAILogic(delta) {
  aiLoopTimer += delta;

  if (LabState.isSimulationRunning) {
    // Identificar sectores actualmente en mitigación para inhibir alza mientras la IA los drena
    const activeMitigatingSectors = new Set();
    LabState.aiTasks.filter(t => t.inProgress).forEach(t => {
      if (t.targetSectors.includes('all')) {
        LabState.sectors.forEach(s => activeMitigatingSectors.add(s.id));
      } else {
        t.targetSectors.forEach(id => activeMitigatingSectors.add(id));
      }
    });

    LabState.sectors.forEach((sec) => {
      if (activeMitigatingSectors.has(sec.id)) return;

      const humRate = (0.30 + Math.random() * 0.18) * sec.manikinWeight * LabState.simSpeed;
      sec.humidity = Math.min(88.0, sec.humidity + humRate * delta);

      // Al cesar la refrigeración por AC, el centro también incrementa temperatura gradualmente
      const tempRate = (sec.isACCenter ? 0.028 : (0.038 + Math.random() * 0.025)) * LabState.simSpeed;
      sec.temp = Math.min(29.5, sec.temp + tempRate * delta);
    });

    // Desbloqueo progresivo de tareas preventivas por umbral (hasta 4)
    LabState.aiTasks.forEach((task) => {
      if (!task.unlocked) {
        const isHumMet = LabState.maxHumidity >= task.minHumTrigger;
        const isTempMet = LabState.avgTemp >= task.minTempTrigger;
        const isManikinSpecial = task.id === 'task-manikin-purge' && LabState.manikinsAvgHumidity >= 64.0;

        if (isHumMet || isTempMet || isManikinSpecial) {
          unlockAITask(task);
        }
      }
    });
  } else if (LabState.acIsOn) {
    // Climatización activa: El AC central inyecta aire frío y deshumidificado continuamente.
    // Si la humedad o temperatura de algún sector supera su umbral nominal, desciende de forma visible y orgánica.
    LabState.sectors.forEach((sec) => {
      const nomHum = getNominalSectorHumidity(sec);
      const nomTemp = getNominalSectorTemp(sec);

      if (sec.humidity > nomHum) {
        const coolHumRate = (sec.isACCenter ? 1.6 : 0.95) * LabState.simSpeed;
        sec.humidity = Math.max(nomHum, sec.humidity - coolHumRate * delta);
      }
      if (sec.temp > nomTemp) {
        const coolTempRate = (sec.isACCenter ? 0.45 : 0.28) * LabState.simSpeed;
        sec.temp = Math.max(nomTemp, sec.temp - coolTempRate * delta);
      }
    });
  }

  if (aiLoopTimer > 0.2) {
    aiLoopTimer = 0;
    evaluateLabSensors();
  }
}

function evaluateLabSensors() {
  let sumTemp = 0;
  let sumHum = 0;
  let maxHum = 0;
  let maxTemp = 0;
  let manikinsHumSum = 0;
  let manikinsCount = 0;

  LabState.sectors.forEach((sec) => {
    sumTemp += sec.temp;
    sumHum += sec.humidity;
    if (sec.humidity > maxHum) maxHum = sec.humidity;
    if (sec.temp > maxTemp) maxTemp = sec.temp;

    if (sec.isManikinZone) {
      manikinsHumSum += sec.humidity;
      manikinsCount++;
    }

    if (sec.isACCenter) {
      LabState.centerTemp = sec.temp;
    }
  });

  LabState.avgTemp = sumTemp / LabState.sectors.length;
  LabState.avgHumidity = sumHum / LabState.sectors.length;
  LabState.maxHumidity = maxHum;
  LabState.maxTemp = maxTemp;
  LabState.manikinsAvgHumidity = manikinsHumSum / (manikinsCount || 1);

  // Comprobar umbral de alerta crítica abrupta (>75% HR)
  if (LabState.maxHumidity >= CONFIG.EMERGENCY_HUMIDITY && !LabState.hasShownCritical75Alert) {
    LabState.hasShownCritical75Alert = true;
    triggerAbruptCriticalModal(LabState.maxHumidity);
  }

  if (LabState.maxHumidity < 68.0) {
    LabState.hasShownCritical75Alert = false;
  }

  updateTelemetryUI();
  updateSectorsVisualization();
  renderUIMiniMap();
}

/**
 * Alerta Crítica Abrupta en el Centro de la Pantalla (>75% HR)
 */
function triggerAbruptCriticalModal(humVal) {
  const modal = document.getElementById('critical-alert-modal');
  const valEl = document.getElementById('abrupt-critical-val');
  if (!modal) return;

  if (valEl) valEl.innerText = humVal.toFixed(1);
  modal.classList.remove('hidden');

  addAILog('EMERGENCIA', `🚨 ALERTA CRÍTICA: Humedad superó el umbral del 75% (${humVal.toFixed(1)}% HR). Intervención requerida.`, 'alert');
}

function closeAbruptCriticalModal() {
  const modal = document.getElementById('critical-alert-modal');
  if (modal) modal.classList.add('hidden');
}

// ==============================================================================
// 8. TELEMETRÍA Y ELEMENTOS DE INTERFAZ
// ==============================================================================
function updateTelemetryUI() {
  const tempAvgEl = document.getElementById('val-temp-avg');
  const tempCenterEl = document.getElementById('val-temp-center');
  const tempMaxEl = document.getElementById('val-temp-max');
  const humMaxEl = document.getElementById('val-hum-max');
  const humManikinsEl = document.getElementById('val-hum-manikins');
  const barTemp = document.getElementById('bar-temp');
  const barHum = document.getElementById('bar-hum');
  const humBadge = document.getElementById('hum-alert-badge');
  const sysStatusDot = document.getElementById('system-status-dot');
  const sysStatusText = document.getElementById('system-status-text');

  if (tempAvgEl) tempAvgEl.innerText = LabState.avgTemp.toFixed(1);
  if (tempCenterEl) tempCenterEl.innerText = `${LabState.centerTemp.toFixed(1)}°`;
  if (tempMaxEl) tempMaxEl.innerText = `${LabState.maxTemp.toFixed(1)}°`;

  if (humMaxEl) {
    humMaxEl.innerText = LabState.maxHumidity.toFixed(1);
    if (LabState.maxHumidity >= CONFIG.CRITICAL_HUMIDITY) {
      humMaxEl.className = 'text-2xl font-bold font-mono text-rose-500 animate-pulse';
    } else {
      humMaxEl.className = 'text-2xl font-bold font-mono text-cyan-400';
    }
  }

  if (humManikinsEl) {
    humManikinsEl.innerText = `${LabState.manikinsAvgHumidity.toFixed(1)}%`;
    humManikinsEl.className = LabState.manikinsAvgHumidity >= CONFIG.CRITICAL_HUMIDITY
      ? 'text-rose-400 font-bold'
      : 'text-amber-300 font-semibold';
  }

  if (barTemp) {
    const tempPct = Math.min(100, Math.max(0, ((LabState.avgTemp - 20) / (30 - 20)) * 100));
    barTemp.style.width = `${tempPct}%`;
  }
  if (barHum) {
    const humPct = Math.min(100, Math.max(0, ((LabState.maxHumidity - 35) / (85 - 35)) * 100));
    barHum.style.width = `${humPct}%`;
  }

  const isCritical = LabState.maxHumidity >= CONFIG.CRITICAL_HUMIDITY;
  const isElevated = LabState.maxHumidity > 58.0;

  if (humBadge) {
    if (LabState.maxHumidity >= CONFIG.EMERGENCY_HUMIDITY) {
      humBadge.innerText = 'Peligro Crítico >75%';
      humBadge.className = 'text-rose-400 font-bold animate-ping';
    } else if (isCritical) {
      humBadge.innerText = 'Riesgo Crítico';
      humBadge.className = 'text-rose-400 font-semibold animate-pulse';
    } else if (isElevated) {
      humBadge.innerText = 'Humedad Elevada';
      humBadge.className = 'text-amber-400 font-semibold';
    } else {
      humBadge.innerText = 'Condición Normal';
      humBadge.className = 'text-emerald-400 font-semibold';
    }
  }

  if (sysStatusDot && sysStatusText) {
    if (LabState.maxHumidity >= CONFIG.EMERGENCY_HUMIDITY) {
      sysStatusDot.className = 'w-2 h-2 rounded-full bg-rose-500 animate-ping';
      sysStatusText.innerText = 'ESTADO: EMERGENCIA >75% HR';
    } else if (isCritical) {
      sysStatusDot.className = 'w-2 h-2 rounded-full bg-rose-500 status-dot-alert';
      sysStatusText.innerText = 'ESTADO: RIESGO DE HUMEDAD EN MANIQUÍES';
    } else if (LabState.isSimulationRunning) {
      sysStatusDot.className = 'w-2 h-2 rounded-full bg-amber-400 status-dot-mitigation';
      sysStatusText.innerText = 'ESTADO: ALZA AMBIENTAL (AC APAGADO)';
    } else {
      sysStatusDot.className = 'w-2 h-2 rounded-full bg-emerald-500 status-dot-ok';
      sysStatusText.innerText = 'ESTADO: AMBIENTE CONTROLADO';
    }
  }
}

function updateSimulationToggleUI() {
  const textSimToggle = document.getElementById('text-sim-toggle');
  const iconSimToggle = document.getElementById('icon-sim-toggle');
  const badgeSimStatus = document.getElementById('badge-sim-status');
  const btnToggleSim = document.getElementById('btn-toggle-sim');

  if (LabState.isSimulationRunning) {
    if (textSimToggle) textSimToggle.innerText = 'Encender AC Central (Detener Alza)';
    if (iconSimToggle) iconSimToggle.className = 'fa-solid fa-power-off text-rose-400';
    if (badgeSimStatus) {
      badgeSimStatus.innerText = 'AC APAGADO (+HR)';
      badgeSimStatus.className = 'text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 animate-pulse';
    }
    if (btnToggleSim) btnToggleSim.classList.add('ring-2', 'ring-rose-500/50');
  } else {
    if (textSimToggle) textSimToggle.innerText = 'Simular Alza (Apagar AC Central)';
    if (iconSimToggle) iconSimToggle.className = 'fa-solid fa-wind text-cyan-400';
    if (badgeSimStatus) {
      badgeSimStatus.innerText = 'AC ACTIVO';
      badgeSimStatus.className = 'text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
    }
    if (btnToggleSim) btnToggleSim.classList.remove('ring-2', 'ring-rose-500/50');
  }
}

function renderUIMiniMap() {
  const container = document.getElementById('sectors-grid-container');
  if (!container) return;

  container.innerHTML = '';
  LabState.sectors.forEach((sec) => {
    const cell = document.createElement('div');
    cell.className = 'sector-cell p-1.5 rounded bg-slate-900 border border-white/5 flex flex-col justify-between cursor-pointer';

    if (LabState.viewMode === 'temp') {
      const t = Math.min(1, Math.max(0, (sec.temp - 20.0) / 8.0));
      cell.style.borderColor = t > 0.5 ? 'rgba(239,68,68,0.7)' : 'rgba(2,132,199,0.7)';
      cell.style.background = t > 0.5 ? 'rgba(239,68,68,0.25)' : 'rgba(2,132,199,0.25)';
    } else if (LabState.viewMode === 'humidity') {
      const isCrit = sec.humidity >= CONFIG.CRITICAL_HUMIDITY;
      cell.style.borderColor = isCrit ? 'rgba(244,63,94,0.9)' : 'rgba(6,182,212,0.6)';
      cell.style.background = isCrit ? 'rgba(244,63,94,0.30)' : 'rgba(6,182,212,0.20)';
    }

    let subTag = sec.isACCenter ? 'AC' : (sec.isManikinZone ? 'Maniquí' : '');

    cell.innerHTML = `
      <div class="flex justify-between items-center text-[9px] font-mono">
        <span class="font-bold ${sec.isACCenter ? 'text-cyan-300' : 'text-slate-300'}">${sec.id}</span>
        <span class="${sec.humidity >= CONFIG.CRITICAL_HUMIDITY ? 'text-rose-400 font-bold' : (sec.humidity <= 50.5 ? 'text-emerald-400 font-medium' : 'text-slate-300')}">${sec.humidity.toFixed(0)}%</span>
      </div>
      <div class="flex justify-between items-center text-[8.5px] font-mono text-slate-400 mt-0.5">
        <span class="${sec.isACCenter ? 'text-cyan-400 font-semibold' : (sec.isManikinZone ? 'text-rose-300' : 'text-slate-500')}">${subTag}</span>
        <span class="${sec.temp >= 25.5 ? 'text-amber-300 font-semibold' : (sec.temp <= 21.0 ? 'text-cyan-300' : 'text-slate-300')}">${sec.temp.toFixed(1)}°</span>
      </div>
    `;

    cell.addEventListener('click', () => {
      focusCameraOnSector(sec);
    });

    container.appendChild(cell);
  });
}

function focusCameraOnSector(sec) {
  if (!sec.bounds) return;
  const center = new THREE.Vector3();
  sec.bounds.getCenter(center);
  controls.target.set(center.x, center.y, center.z);
  addAILog('OPERADOR', `Enfocando inspección en sector ${sec.id} (${sec.name}): ${sec.temp.toFixed(1)}°C / ${sec.humidity.toFixed(1)}% HR`, 'action');
}

function addAILog(source, message, type = 'ai') {
  const terminal = document.getElementById('terminal-logs');
  if (!terminal) return;

  const now = new Date();
  const timeStr = now.toTimeString().split(' ')[0];

  const logItem = document.createElement('div');
  logItem.className = 'leading-relaxed text-[11px]';

  let badgeColor = 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30';
  if (type === 'alert') badgeColor = 'bg-rose-500/20 text-rose-300 border-rose-500/30';
  if (type === 'action') badgeColor = 'bg-amber-500/20 text-amber-300 border-amber-500/30';
  if (type === 'ok') badgeColor = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
  if (type === 'system') badgeColor = 'bg-slate-700/50 text-slate-300 border-slate-600/30';

  logItem.innerHTML = `
    <span class="text-slate-500">[${timeStr}]</span>
    <span class="px-1 py-0.5 rounded border text-[9px] font-semibold ${badgeColor}">${source}</span>
    <span class="text-slate-200 ml-1">${message}</span>
  `;

  terminal.appendChild(logItem);
  terminal.scrollTop = terminal.scrollHeight;

  if (terminal.children.length > 70) {
    terminal.removeChild(terminal.children[0]);
  }
}

// ==============================================================================
// 9. GRÁFICAS DE CICLO DE VIDA ÚTIL EXACTAS AL MODELO DE REFERENCIA
// ==============================================================================
function initLifecycleChart() {
  const canvas = document.getElementById('lifecycleChart');
  if (!canvas || typeof Chart === 'undefined') return;

  const ctx = canvas.getContext('2d');

  // Curva Verde (Con Control Ambiental e IoT/IA): Degrada suavemente y cruza 40% a los 8.7 Años
  const preventivePoints = [
    { x: 0, y: 100 },
    { x: 1, y: 94 },
    { x: 2, y: 88 },
    { x: 3, y: 81 },
    { x: 4, y: 74 },
    { x: 5, y: 67 },
    { x: 6, y: 60 },
    { x: 7, y: 53 },
    { x: 8, y: 45 },
    { x: 8.7, y: 40.0 }, // Punto crítico verde exacto
    { x: 9, y: 37 },
    { x: 10, y: 30 }
  ];

  // Curva Roja Discontinua (Sin Control Ambiental): Exponencial acelerada, cruza 40% a los 2.4 Años
  const failurePoints = [
    { x: 0, y: 100 },
    { x: 1, y: 68 },
    { x: 2, y: 47 },
    { x: 2.4, y: 40.0 }, // Punto crítico rojo exacto
    { x: 3, y: 30 },
    { x: 4, y: 21 },
    { x: 5, y: 14 },
    { x: 6, y: 9.5 },
    { x: 7, y: 6.2 },
    { x: 8, y: 4.1 },
    { x: 8.7, y: 3.0 },
    { x: 10, y: 1.8 }
  ];

  // Umbral Crítico de Falla / Reemplazo Requerido (40%)
  const thresholdPoints = [
    { x: 0, y: 40 },
    { x: 10, y: 40 }
  ];

  lifecycleChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [
        {
          label: 'Con Control IoT/IA (Preventivo)',
          data: preventivePoints,
          borderColor: '#15803d',
          backgroundColor: 'rgba(34, 197, 94, 0.18)', // Zona Sombra (+6 Años Ganados)
          borderWidth: 3.2,
          fill: 1, // Rellena entre verde y roja
          tension: 0.28,
          pointRadius: (ctx) => (ctx.raw && ctx.raw.x === 8.7 ? 6.5 : 0),
          pointHoverRadius: 8,
          pointBackgroundColor: '#15803d',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2
        },
        {
          label: 'Sin Control Ambiental (Humedad Nocturna >75%)',
          data: failurePoints,
          borderColor: '#dc2626',
          backgroundColor: 'rgba(239, 68, 68, 0.05)',
          borderWidth: 3.0,
          borderDash: [6, 4],
          fill: false,
          tension: 0.35,
          pointRadius: (ctx) => (ctx.raw && ctx.raw.x === 2.4 ? 6.5 : 0),
          pointHoverRadius: 8,
          pointBackgroundColor: '#dc2626',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2
        },
        {
          label: 'Umbral Crítico de Falla / Reemplazo Requerido (40%)',
          data: thresholdPoints,
          borderColor: '#64748b',
          borderDash: [3, 3],
          borderWidth: 1.8,
          fill: false,
          pointRadius: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'nearest',
        axis: 'x',
        intersect: false
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            boxWidth: 12,
            boxHeight: 4,
            color: '#cbd5e1',
            font: { size: 9.5, family: 'Inter', weight: 'bold' },
            padding: 8
          }
        },
        tooltip: {
          backgroundColor: 'rgba(13, 19, 33, 0.96)',
          titleColor: '#38bdf8',
          bodyColor: '#e2e8f0',
          borderColor: 'rgba(255, 255, 255, 0.15)',
          borderWidth: 1,
          padding: 10,
          callbacks: {
            title: (items) => `Tiempo de Servicio: ${items[0].parsed.x} Años`,
            label: (context) => {
              const x = context.parsed.x;
              const y = context.parsed.y;
              if (x === 8.7 && context.datasetIndex === 0) {
                return ` [FIN VIDA OPERATIVA]: ${y}% a los ~8.7 Años`;
              }
              if (x === 2.4 && context.datasetIndex === 1) {
                return ` [FALLA CRÍTICA / INOPERATIVO]: ${y}% a los ~2.4 Años`;
              }
              return ` ${context.dataset.label}: ${y}% Estado Físico`;
            }
          }
        }
      },
      scales: {
        x: {
          type: 'linear',
          min: 0,
          max: 10,
          grid: { color: 'rgba(255, 255, 255, 0.06)' },
          ticks: {
            stepSize: 1,
            color: '#94a3b8',
            font: { size: 9, family: 'JetBrains Mono' },
            callback: (val) => `${val}`
          },
          title: {
            display: true,
            text: 'Tiempo de Servicio (Años)',
            color: '#cbd5e1',
            font: { size: 10, family: 'Inter', weight: 'bold' }
          }
        },
        y: {
          min: 0,
          max: 100,
          grid: { color: 'rgba(255, 255, 255, 0.06)' },
          ticks: {
            stepSize: 20,
            color: '#94a3b8',
            font: { size: 9, family: 'JetBrains Mono' },
            callback: (val) => `${val}%`
          },
          title: {
            display: true,
            text: 'Nivel de Funcionalidad y Estado Físico (%)',
            color: '#cbd5e1',
            font: { size: 10, family: 'Inter', weight: 'bold' }
          }
        }
      }
    }
  });
}

function updateLifecycleChartMode(mode) {
  currentChartMode = mode;
  if (!lifecycleChartInstance) return;

  const btnBoth = document.getElementById('btn-chart-both');
  const btnPrev = document.getElementById('btn-chart-preventive');
  const btnFail = document.getElementById('btn-chart-failure');

  [btnBoth, btnPrev, btnFail].forEach(b => {
    if (b) b.className = 'py-1 px-1.5 rounded transition-all text-slate-400 hover:text-white hover:bg-white/5';
  });

  if (mode === 'both') {
    if (btnBoth) btnBoth.className = 'py-1 px-1.5 rounded transition-all bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-semibold';
    lifecycleChartInstance.data.datasets[0].hidden = false;
    lifecycleChartInstance.data.datasets[1].hidden = false;
    lifecycleChartInstance.data.datasets[2].hidden = false;
  } else if (mode === 'preventive') {
    if (btnPrev) btnPrev.className = 'py-1 px-1.5 rounded transition-all bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold';
    lifecycleChartInstance.data.datasets[0].hidden = false;
    lifecycleChartInstance.data.datasets[1].hidden = true;
    lifecycleChartInstance.data.datasets[2].hidden = false;
  } else if (mode === 'failure') {
    if (btnFail) btnFail.className = 'py-1 px-1.5 rounded transition-all bg-rose-500/20 text-rose-300 border border-rose-500/30 font-semibold';
    lifecycleChartInstance.data.datasets[0].hidden = true;
    lifecycleChartInstance.data.datasets[1].hidden = false;
    lifecycleChartInstance.data.datasets[2].hidden = false;
  }

  lifecycleChartInstance.update();
}

// ==============================================================================
// 10. CONTROL DE ACORDEONES Y COLAPSO DE PANELES LATERALES
// ==============================================================================
function setupSidebarControls() {
  const leftSidebar = document.getElementById('left-sidebar');
  const rightSidebar = document.getElementById('right-sidebar');
  const btnCloseLeft = document.getElementById('btn-close-left-sidebar');
  const btnCloseRight = document.getElementById('btn-close-right-sidebar');
  const tabReopenLeft = document.getElementById('tab-reopen-left');
  const tabReopenRight = document.getElementById('tab-reopen-right');
  const btnImmersive = document.getElementById('btn-toggle-immersive');
  const textImmersive = document.getElementById('text-immersive');
  const iconImmersive = document.getElementById('icon-immersive');

  let isLeftClosed = false;
  let isRightClosed = false;

  const setLeftClosed = (closed) => {
    isLeftClosed = closed;
    if (closed) {
      leftSidebar.classList.add('sidebar-collapsed-left');
      tabReopenLeft.classList.remove('hidden');
    } else {
      leftSidebar.classList.remove('sidebar-collapsed-left');
      tabReopenLeft.classList.add('hidden');
    }
    updateImmersiveButtonState();
  };

  const setRightClosed = (closed) => {
    isRightClosed = closed;
    if (closed) {
      rightSidebar.classList.add('sidebar-collapsed-right');
      tabReopenRight.classList.remove('hidden');
    } else {
      rightSidebar.classList.remove('sidebar-collapsed-right');
      tabReopenRight.classList.add('hidden');
    }
    updateImmersiveButtonState();
  };

  const updateImmersiveButtonState = () => {
    const isBothClosed = isLeftClosed && isRightClosed;
    if (isBothClosed) {
      if (textImmersive) textImmersive.innerText = 'Restaurar Paneles';
      if (iconImmersive) iconImmersive.className = 'fa-solid fa-compress text-cyan-400 text-[11px]';
    } else {
      if (textImmersive) textImmersive.innerText = 'Vista Inmersiva';
      if (iconImmersive) iconImmersive.className = 'fa-solid fa-expand text-cyan-400 text-[11px]';
    }
  };

  if (btnCloseLeft) btnCloseLeft.addEventListener('click', () => setLeftClosed(true));
  if (tabReopenLeft) tabReopenLeft.addEventListener('click', () => setLeftClosed(false));

  if (btnCloseRight) btnCloseRight.addEventListener('click', () => setRightClosed(true));
  if (tabReopenRight) tabReopenRight.addEventListener('click', () => setRightClosed(false));

  if (btnImmersive) {
    btnImmersive.addEventListener('click', () => {
      const anyOpen = !isLeftClosed || !isRightClosed;
      if (anyOpen) {
        setLeftClosed(true);
        setRightClosed(true);
      } else {
        setLeftClosed(false);
        setRightClosed(false);
      }
    });
  }

  const registerAccordion = (headerId, contentId) => {
    const header = document.getElementById(headerId);
    const content = document.getElementById(contentId);
    if (!header || !content) return;

    const icon = header.querySelector('.chevron-icon');

    header.addEventListener('click', () => {
      const isHidden = content.style.display === 'none';
      if (isHidden) {
        content.style.display = 'block';
        if (icon) icon.style.transform = 'rotate(0deg)';
      } else {
        content.style.display = 'none';
        if (icon) icon.style.transform = 'rotate(-90deg)';
      }
    });
  };

  registerAccordion('header-sec-telemetry', 'content-sec-telemetry');
  registerAccordion('header-sec-sectors', 'content-sec-sectors');
  registerAccordion('header-sec-lifecycle', 'content-sec-lifecycle');

  registerAccordion('header-sec-viewmodes', 'content-sec-viewmodes');
  registerAccordion('header-sec-simulation', 'content-sec-simulation');
  registerAccordion('header-sec-aitasks', 'content-sec-aitasks');
}

// ==============================================================================
// 11. CONTROLADORES DE EVENTOS
// ==============================================================================
function setupEventListeners() {
  const btnReal = document.getElementById('btn-mode-real');
  const btnTemp = document.getElementById('btn-mode-temp');
  const btnHum = document.getElementById('btn-mode-hum');

  const setViewMode = (mode) => {
    LabState.viewMode = mode;
    [btnReal, btnTemp, btnHum].forEach(b => {
      if (b) b.className = 'py-1.5 px-2 rounded-md transition-all text-center text-slate-400 hover:text-white hover:bg-white/5 text-[11px]';
    });

    if (mode === 'real') {
      if (btnReal) btnReal.className = 'py-1.5 px-2 rounded-md transition-all text-center bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm text-[11px]';
      addAILog('VISTA', 'Capa física activa. Visualización directa de la sala.', 'system');
    } else if (mode === 'temp') {
      if (btnTemp) btnTemp.className = 'py-1.5 px-2 rounded-md transition-all text-center bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm text-[11px]';
      addAILog('VISTA', 'Mapa térmico activado (Alta visibilidad). Centro S5 muestra menor temperatura por AC.', 'system');
    } else if (mode === 'humidity') {
      if (btnHum) btnHum.className = 'py-1.5 px-2 rounded-md transition-all text-center bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm text-[11px]';
      addAILog('VISTA', 'Mapa de humedad activado (Alta visibilidad y brillo). Foco en maniquíes S1, S2, S3.', 'system');
    }

    updateSectorsVisualization();
    renderUIMiniMap();
  };

  if (btnReal) btnReal.addEventListener('click', () => setViewMode('real'));
  if (btnTemp) btnTemp.addEventListener('click', () => setViewMode('temp'));
  if (btnHum) btnHum.addEventListener('click', () => setViewMode('humidity'));

  // Botón Toggle Simulación (Apagar AC / Encender AC)
  const btnToggleSim = document.getElementById('btn-toggle-sim');

  if (btnToggleSim) {
    btnToggleSim.addEventListener('click', () => {
      LabState.isSimulationRunning = !LabState.isSimulationRunning;

      if (LabState.isSimulationRunning) {
        LabState.acIsOn = false;
        updateSimulationToggleUI();
        addAILog('AC-CENTRAL', '❄️ AC central apagado: cesa el flujo de aire y las partículas se desvanecen gradualmente. Se inicia alza de HR y temperatura.', 'alert');
      } else {
        triggerACEntranceAnimation();
        updateSimulationToggleUI();
        addAILog('SIMULACIÓN', 'Simulación de alza detenida. AC central reanudando climatización activa (HR y temperatura en descenso).', 'system');
      }
    });
  }

  // Botón Restablecer Condiciones
  const btnReset = document.getElementById('btn-reset-env');
  if (btnReset) {
    btnReset.addEventListener('click', () => {
      LabState.isSimulationRunning = false;
      LabState.hasShownCritical75Alert = false;
      closeAbruptCriticalModal();
      triggerACEntranceAnimation();
      updateSimulationToggleUI();

      LabState.sectors.forEach((sec) => {
        sec.humidity = getNominalSectorHumidity(sec);
        sec.temp = getNominalSectorTemp(sec);
      });

      initAITasks();
      evaluateLabSensors();
      addAILog('SISTEMA', '↺ Condiciones ambientales nominales restablecidas. Tareas reiniciadas.', 'system');
    });
  }

  // Botón Modal Crítico: Mitigación IA Inmediata
  const btnModalMitigate = document.getElementById('btn-modal-mitigate');
  if (btnModalMitigate) {
    btnModalMitigate.addEventListener('click', () => {
      closeAbruptCriticalModal();
      applyAllAITasks();
    });
  }

  // Botón Modal Crítico: Cerrar Alerta
  const btnModalClose = document.getElementById('btn-modal-close');
  if (btnModalClose) {
    btnModalClose.addEventListener('click', () => {
      closeAbruptCriticalModal();
    });
  }

  // Botón Aplicar Todas las Tareas Preventivas
  const btnApplyAll = document.getElementById('btn-apply-all-tasks');
  if (btnApplyAll) {
    btnApplyAll.addEventListener('click', () => {
      applyAllAITasks();
    });
  }

  // Selectores de Modo de Gráfica de Vida Útil
  const btnChartBoth = document.getElementById('btn-chart-both');
  const btnChartPrev = document.getElementById('btn-chart-preventive');
  const btnChartFail = document.getElementById('btn-chart-failure');

  if (btnChartBoth) btnChartBoth.addEventListener('click', () => updateLifecycleChartMode('both'));
  if (btnChartPrev) btnChartPrev.addEventListener('click', () => updateLifecycleChartMode('preventive'));
  if (btnChartFail) btnChartFail.addEventListener('click', () => updateLifecycleChartMode('failure'));

  // Botón Limpiar Terminal
  const btnClearTerm = document.getElementById('btn-clear-terminal');
  if (btnClearTerm) {
    btnClearTerm.addEventListener('click', () => {
      const terminal = document.getElementById('terminal-logs');
      if (terminal) terminal.innerHTML = '';
      addAILog('CONSOLA', 'Histórico de eventos vaciado.', 'system');
    });
  }

  // Reloj
  setInterval(() => {
    const clockEl = document.getElementById('live-clock');
    if (clockEl) clockEl.innerText = new Date().toTimeString().split(' ')[0];
  }, 1000);

  window.addEventListener('resize', onWindowResize, false);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
}

// ==============================================================================
// 12. LOOP DE ANIMACIÓN Y RENDERIZADO
// ==============================================================================
function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();

  controls.update();
  updateAILogic(delta);
  updateParticles(delta);

  renderer.render(scene, camera);
}

window.addEventListener('DOMContentLoaded', () => {
  initEngine();
});
