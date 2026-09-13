/**
 * ==============================================================================
 * SIMULADOR 3D: LABORATORIO DE SIMULACIÓN CLÍNICA (BMS / IoT)
 * Sistema de Control Ambiental Hospitalario y Mitigación Preventiva
 * ==============================================================================
 */

// --- CONFIGURACIÓN GLOBAL Y PARÁMETROS AMBIENTALES ---
const CONFIG = {
  MODEL_PATH: 'public/simulador3d.glb',
  CRITICAL_HUMIDITY: 68.0,     // Umbral de activación de mitigación (%)
  TARGET_HUMIDITY: 50.0,       // Umbral de normalización ambiental (%)
  COLOR_LED_OK: 0x10b981,      // Verde esmeralda óptimo
  COLOR_LED_ALERT: 0xef4444,   // Rojo alerta crítica
  PARTICLE_COUNT: 1800,        // Partículas luminiscentes de aire/humedad
  EXTRACTOR_MAX_RPM: 1800,     // RPM máxima del extractor
  EXTRACTOR_MAX_RAD: 22.0,     // Velocidad angular (rad/s)
  SECTOR_HEIGHT: 0.35          // Altura calibrada a la escala del modelo
};

// --- ESTADO CENTRAL DE LA SIMULACIÓN ---
const LabState = {
  viewMode: 'real',            // 'real' | 'temp' | 'humidity'
  isNightSimActive: false,     // Simulación de noche (AC en reposo)
  extractorActive: false,      // Estado de trabajo del extractor
  extractorCurrentRPM: 0,      // RPM actual interpolada
  extractorSpeed: 0,           // Velocidad angular actual
  ledStatus: 'OK',             // 'OK' | 'ALERT'
  avgTemp: 24.5,               // Temperatura promedio (°C)
  maxHumidity: 52.0,           // Humedad máxima encontrada (%)
  avgHumidity: 50.5,           // Humedad promedio (%)
  sectors: [],                 // 9 sectores (S1 a S9)
  // Límites reales del laboratorio calibrados desde el modelo Blender
  labBounds: {
    min: new THREE.Vector3(-1.91, 0.0, -0.93),
    max: new THREE.Vector3(0.79, 0.97, 0.94),
    center: new THREE.Vector3(-0.56, 0.48, 0.0),
    size: new THREE.Vector3(2.70, 0.97, 1.87)
  },
  // Coordenadas reales de los equipos en el modelo 3D
  acEmitterPos: new THREE.Vector3(-0.56, 0.94, 0.0),   // Salida del AC central en techo
  extractorPos: new THREE.Vector3(0.68, 0.30, 0.79),   // Extractor real en la pared derecha
  iotDevicePos: new THREE.Vector3(0.65, 0.82, -0.01)   // Dispositivo IoT en la pared
};

// --- VARIABLES THREE.JS ---
let scene, camera, renderer, controls, clock;
let extractorMesh = null;       // Aspas reales del extractor (root.2)
let centralACMesh = null;       // Unidad de aire central (model.001)
let iotDeviceMesh = null;       // Dispositivo IoT (dispositivoiot)
let ledIndicatorMesh = null;    // Lente LED sobre el dispositivo
let ledPointLight = null;       // Luz dinámica emitida por el LED
let particleSystem = null;      // Sistema de partículas de aire/humedad
let sectorGroup = new THREE.Group();
let labelsGroup = new THREE.Group();

// ==============================================================================
// 1. INICIALIZACIÓN DE LA ESCENA THREE.JS
// ==============================================================================
function initEngine() {
  const container = document.getElementById('canvas-container');
  clock = new THREE.Clock();

  // Escena con fondo neutro clínico
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x080c14);
  scene.fog = new THREE.FogExp2(0x080c14, 0.035);
  scene.add(sectorGroup);
  scene.add(labelsGroup);

  // Cámara con encuadre clínico
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

  // OrbitControls centrados en el laboratorio
  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.target.set(-0.56, 0.45, 0.0);
  controls.minDistance = 0.6;
  controls.maxDistance = 6.5;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;

  // Iluminación clínica
  setupLighting();

  // Inicializar sectores
  initSectorData();

  // Cargar modelo real simulador3d.glb
  loadLaboratoryModel();

  // Configurar listeners de interfaz (acordeones y colapsables)
  setupEventListeners();
  setupSidebarControls();

  // Loop de renderizado
  animate();

  addAILog('SISTEMA', 'Inicializando gemelo digital del Laboratorio Clínico...', 'system');
  addAILog('CONTROL-HVAC', 'Sistema de supervisión ambiental activo. 9 nodos IoT en línea.', 'action');
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

  // Luz puntual del sensor LED
  ledPointLight = new THREE.PointLight(CONFIG.COLOR_LED_OK, 1.5, 1.8);
  ledPointLight.position.copy(LabState.iotDevicePos);
  scene.add(ledPointLight);
}

// ==============================================================================
// 3. CARGA DEL MODELO 3D REAL (Identificación directa de componentes)
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

      // RECORRIDO DE ESCENA: Vincular componentes reales del modelo Blender
      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;

          if (child.material) {
            child.material.roughness = Math.min(0.85, Math.max(0.15, child.material.roughness || 0.4));
            child.material.needsUpdate = true;
          }

          const name = child.name.toLowerCase();

          // 1. AIRE ACONDICIONADO CENTRAL EN TECHO: 'model.001'
          if (child.name === 'model.001' || name.includes('model.001') || name.includes('aire')) {
            centralACMesh = child;
            child.geometry.computeBoundingBox();
            const acBox = new THREE.Box3().setFromObject(child);
            acBox.getCenter(LabState.acEmitterPos);
            LabState.acEmitterPos.y = acBox.min.y;
            addAILog('HARDWARE', `Aire Central detectado en techo: [${child.name}]`, 'system');
          }

          // 2. EXTRACTOR EN PARED DERECHA: 'root.2' (dentro de ROOT.001)
          if (
            child.name === 'root.2' ||
            child.name === 'root.012' ||
            child.name === 'Extractor_Aspas' ||
            name.includes('extractor') ||
            name.includes('aspas')
          ) {
            setupRealExtractorBlades(child);
          }

          // 3. DISPOSITIVO IoT EN PARED: 'dispositivoiot'
          if (
            child.name === 'dispositivoiot' ||
            name.includes('dispositivo') ||
            (child.name === 'Cube' && child.geometry.attributes.position.count < 100)
          ) {
            setupRealIoTDevice(child);
          }
        }
      });

      if (!ledIndicatorMesh) {
        createLEDIndicatorOnDevice();
      }

      buildCalibratedSectors();
      createAirflowParticleSystem();

      setTimeout(() => {
        loadingScreen.style.opacity = '0';
        setTimeout(() => {
          loadingScreen.style.display = 'none';
          addAILog('SISTEMA', 'Modelo 3D cargado y sincronizado con telemetría.', 'system');
        }, 600);
      }, 400);
    },
    (xhr) => {
      let percent = 0;
      if (xhr.lengthComputable && xhr.total > 0) {
        percent = Math.round((xhr.loaded / xhr.total) * 100);
        const loadedMB = (xhr.loaded / 1048576).toFixed(1);
        const totalMB = (xhr.total / 1048576).toFixed(1);
        progressText.innerText = `Cargando: ${loadedMB} MB / ${totalMB} MB`;
      } else {
        const loadedMB = (xhr.loaded / 1048576).toFixed(1);
        percent = Math.min(99, Math.round((xhr.loaded / (92.5 * 1048576)) * 100));
        progressText.innerText = `Cargando modelo: ${loadedMB} MB`;
      }
      barFill.style.width = `${percent}%`;
      percentageText.innerText = `${percent}%`;
    },
    (error) => {
      console.error('Error al cargar simulador3d.glb:', error);
      progressText.innerText = 'Error al cargar modelo 3D.';
      addAILog('ERROR', 'Error crítico al cargar archivo GLB.', 'alert');
    }
  );
}

// ==============================================================================
// 4. CONFIGURACIÓN DEL EXTRACTOR REAL
// ==============================================================================
function setupRealExtractorBlades(mesh) {
  extractorMesh = mesh;

  mesh.geometry.computeBoundingBox();
  const bladeCenter = new THREE.Vector3();
  mesh.geometry.boundingBox.getCenter(bladeCenter);

  mesh.geometry.center();
  mesh.position.copy(bladeCenter);

  const worldPos = new THREE.Vector3();
  mesh.getWorldPosition(worldPos);
  LabState.extractorPos.copy(worldPos.lengthSq() > 0.01 ? worldPos : bladeCenter);

  addAILog('HARDWARE', `Aspas de extractor en pared vinculadas: [${mesh.name}].`, 'system');
}

// ==============================================================================
// 5. CONFIGURACIÓN DEL DISPOSITIVO IoT Y LED REAL
// ==============================================================================
function setupRealIoTDevice(mesh) {
  iotDeviceMesh = mesh;
  const devCenter = new THREE.Vector3();
  mesh.geometry.computeBoundingBox();
  mesh.geometry.boundingBox.getCenter(devCenter);
  LabState.iotDevicePos.copy(devCenter);

  createLEDIndicatorOnDevice();
  addAILog('HARDWARE', `Sensor ambiental IoT vinculado: [${mesh.name}].`, 'system');
}

function createLEDIndicatorOnDevice() {
  if (ledIndicatorMesh) return;

  const ledGeo = new THREE.SphereGeometry(0.018, 16, 16);
  const ledMat = new THREE.MeshStandardMaterial({
    color: CONFIG.COLOR_LED_OK,
    emissive: new THREE.Color(CONFIG.COLOR_LED_OK),
    emissiveIntensity: 2.5,
    roughness: 0.1
  });

  ledIndicatorMesh = new THREE.Mesh(ledGeo, ledMat);
  ledIndicatorMesh.position.set(
    LabState.iotDevicePos.x,
    LabState.iotDevicePos.y,
    LabState.iotDevicePos.z + 0.035
  );
  scene.add(ledIndicatorMesh);
  ledPointLight.position.copy(ledIndicatorMesh.position);
}

// ==============================================================================
// 6. MAPAS DE CALOR Y HUMEDAD VOLUMÉTRICOS
// ==============================================================================
function initSectorData() {
  LabState.sectors = [];
  const baseTemps = [24.1, 24.6, 25.2, 24.3, 25.8, 26.4, 23.8, 24.9, 27.1];
  const baseHums = [49.2, 51.0, 52.8, 50.4, 53.5, 54.2, 48.6, 51.7, 55.0];

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const idx = r * 3 + c;
      LabState.sectors.push({
        id: `S${idx + 1}`,
        row: r,
        col: c,
        temp: baseTemps[idx],
        baseTemp: baseTemps[idx],
        humidity: baseHums[idx],
        baseHumidity: baseHums[idx],
        mesh: null,
        edges: null,
        labelSprite: null,
        bounds: null
      });
    }
  }
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
  const sectorH = Math.min(0.38, size.y * 0.42);
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
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      roughness: 0.3,
      metalness: 0.1
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(centerX, centerY, centerZ);

    const edgeGeo = new THREE.EdgesGeometry(geo);
    const edgeMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.35
    });
    const edges = new THREE.LineSegments(edgeGeo, edgeMat);
    mesh.add(edges);

    sec.mesh = mesh;
    sec.edges = edges;
    sectorGroup.add(mesh);

    const labelSprite = createSectorLabelSprite(sec.id);
    labelSprite.position.set(centerX, floorY + sectorH + 0.05, centerZ);
    labelsGroup.add(labelSprite);
    sec.labelSprite = labelSprite;
  });

  updateSectorsVisualization();
  renderUIMiniMap();
}

function createSectorLabelSprite(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = 'rgba(13, 19, 33, 0.85)';
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
  ctx.lineWidth = 2;
  ctx.roundRect(10, 10, 108, 44, 8);
  ctx.fill();
  ctx.stroke();

  ctx.font = 'bold 22px monospace';
  ctx.fillStyle = '#38bdf8';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 32);

  const texture = new THREE.CanvasTexture(canvas);
  const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0.75 });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.scale.set(0.18, 0.09, 1.0);
  return sprite;
}

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

    if (LabState.viewMode === 'temp') {
      const t = Math.min(1, Math.max(0, (sec.temp - 23.0) / (30.0 - 23.0)));
      if (t < 0.5) {
        targetColor.lerpColors(new THREE.Color(0x2563eb), new THREE.Color(0xf59e0b), t * 2);
      } else {
        targetColor.lerpColors(new THREE.Color(0xf59e0b), new THREE.Color(0xef4444), (t - 0.5) * 2);
      }
      sec.mesh.material.opacity = 0.18;
    } else if (LabState.viewMode === 'humidity') {
      const h = Math.min(1, Math.max(0, (sec.humidity - 40.0) / (85.0 - 40.0)));
      if (sec.humidity < CONFIG.CRITICAL_HUMIDITY) {
        targetColor.lerpColors(new THREE.Color(0x06b6d4), new THREE.Color(0x8b5cf6), h);
        sec.mesh.material.opacity = 0.18;
      } else {
        const critT = Math.min(1, (sec.humidity - CONFIG.CRITICAL_HUMIDITY) / (85.0 - CONFIG.CRITICAL_HUMIDITY));
        targetColor.lerpColors(new THREE.Color(0xd946ef), new THREE.Color(0xef4444), critT);
        sec.mesh.material.opacity = 0.28;
      }
    }

    sec.mesh.material.color.copy(targetColor);
    sec.edges.material.color.copy(targetColor);
  });
}

// ==============================================================================
// 7. SISTEMA DE PARTÍCULAS MEJORADO (ALTA VISIBILIDAD Y FLUJO REAL)
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

  for (let i = 0; i < count; i++) {
    resetParticleAtAC(i, positions, velocities, lifetimes, true);
    // Color cian luminoso inicial
    colors[i * 3] = 0.25;
    colors[i * 3 + 1] = 0.90;
    colors[i * 3 + 2] = 1.0;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.userData = { velocities, lifetimes };

  // Textura radial luminosa con núcleo brillante
  const texture = createLuminousRadialTexture();

  // Partículas con tamaño 0.048 y AdditiveBlending para destacar bajo la luz
  const material = new THREE.PointsMaterial({
    size: 0.048,
    map: texture,
    transparent: true,
    opacity: 0.75,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  particleSystem = new THREE.Points(geometry, material);
  scene.add(particleSystem);
}

// Reubica la partícula en la boca de salida del Aire Central en el techo
function resetParticleAtAC(index, positions, velocities, lifetimes, randomAge = false) {
  const acPos = LabState.acEmitterPos;
  const idx = index * 3;

  positions[idx] = acPos.x + (Math.random() - 0.5) * 0.48;
  positions[idx + 1] = acPos.y - 0.02 - (randomAge ? Math.random() * 0.7 : 0);
  positions[idx + 2] = acPos.z + (Math.random() - 0.5) * 0.38;

  // Caída convectiva y dispersión en abanico
  velocities[idx] = (Math.random() - 0.5) * 0.14;
  velocities[idx + 1] = -0.09 - Math.random() * 0.12;
  velocities[idx + 2] = (Math.random() - 0.5) * 0.14;

  lifetimes[index] = randomAge ? Math.random() * 8.0 : 0.0;
}

// Textura de partícula luminiscente de alta definición
function createLuminousRadialTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  // Gradiente radial con centro blanco intenso y halo cian
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 31);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
  gradient.addColorStop(0.2, 'rgba(165, 243, 252, 0.95)');
  gradient.addColorStop(0.55, 'rgba(56, 189, 248, 0.65)');
  gradient.addColorStop(0.85, 'rgba(2, 132, 199, 0.20)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);

  const tex = new THREE.CanvasTexture(canvas);
  tex.generateMipmaps = true;
  return tex;
}

// Física de flujo: Aire central -> Sala -> Succión en Extractor
function updateParticles(delta) {
  if (!particleSystem) return;

  const positions = particleSystem.geometry.attributes.position.array;
  const colors = particleSystem.geometry.attributes.color.array;
  const velocities = particleSystem.geometry.userData.velocities;
  const lifetimes = particleSystem.geometry.userData.lifetimes;
  const count = CONFIG.PARTICLE_COUNT;
  const { min, max } = LabState.labBounds;
  const extPos = LabState.extractorPos;

  const isAlert = LabState.maxHumidity > CONFIG.CRITICAL_HUMIDITY;
  const humFactor = Math.min(1, Math.max(0, (LabState.maxHumidity - 40) / (85 - 40)));

  // Color cian luminoso a baja humedad; rojo/coral intenso al superar el umbral
  const colR = isAlert ? 1.0 : THREE.MathUtils.lerp(0.20, 0.75, humFactor);
  const colG = isAlert ? 0.22 : THREE.MathUtils.lerp(0.88, 0.45, humFactor);
  const colB = isAlert ? 0.30 : THREE.MathUtils.lerp(1.0, 0.80, humFactor);

  // Mayor opacidad para máxima visibilidad
  particleSystem.material.opacity = isAlert ? 0.88 : THREE.MathUtils.lerp(0.68, 0.82, humFactor);

  for (let i = 0; i < count; i++) {
    const px = i * 3;
    const py = i * 3 + 1;
    const pz = i * 3 + 2;

    lifetimes[i] += delta;

    positions[px] += velocities[px] * delta;
    positions[py] += velocities[py] * delta;
    positions[pz] += velocities[pz] * delta;

    // Dispersión suave por la zona inferior de la sala
    if (positions[py] < min.y + 0.35) {
      velocities[px] += (Math.random() - 0.5) * 0.05 * delta;
      velocities[pz] += (Math.random() - 0.5) * 0.05 * delta;
      velocities[py] = Math.max(-0.02, velocities[py] + 0.03 * delta);
    }

    // SUCCIÓN POR EL EXTRACTOR REAL
    if (LabState.extractorActive && LabState.extractorCurrentRPM > 100) {
      const dx = extPos.x - positions[px];
      const dy = extPos.y - positions[py];
      const dz = extPos.z - positions[pz];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (dist < 2.4) {
        const pullPower = (1.0 - dist / 2.4) * (LabState.extractorCurrentRPM / CONFIG.EXTRACTOR_MAX_RPM) * 4.2;
        positions[px] += (dx / dist) * pullPower * delta;
        positions[py] += (dy / dist) * pullPower * delta;
        positions[pz] += (dz / dist) * pullPower * delta;

        // Si cruza la rejilla del extractor: SALE DE LA SALA
        if (dist < 0.065) {
          resetParticleAtAC(i, positions, velocities, lifetimes, false);
          continue;
        }
      }
    }

    if (
      lifetimes[i] > 10.0 ||
      positions[py] < min.y + 0.03 ||
      positions[px] < min.x ||
      positions[px] > max.x ||
      positions[pz] < min.z ||
      positions[pz] > max.z
    ) {
      resetParticleAtAC(i, positions, velocities, lifetimes, false);
    }

    colors[px] = colR;
    colors[py] = colG;
    colors[pz] = colB;
  }

  particleSystem.geometry.attributes.position.needsUpdate = true;
  particleSystem.geometry.attributes.color.needsUpdate = true;
}

// ==============================================================================
// 8. CONTROL PREVENTIVO AMBIENTAL Y ACTUADORES
// ==============================================================================
let aiLoopTimer = 0;

function updateAILogic(delta) {
  aiLoopTimer += delta;

  // Protocolo Nocturno: Humedad asciende progresivamente
  if (LabState.isNightSimActive) {
    LabState.sectors.forEach((sec) => {
      const deltaHum = (0.35 + Math.random() * 0.20) * delta;
      sec.humidity = Math.min(85.0, sec.humidity + deltaHum);
      sec.temp = Math.min(29.5, sec.temp + 0.04 * delta);
    });
  }

  // Mitigación por Extracción Activa
  if (LabState.extractorActive) {
    LabState.sectors.forEach((sec) => {
      if (sec.humidity > CONFIG.TARGET_HUMIDITY) {
        const deltaExtract = (0.75 + Math.random() * 0.30) * delta;
        sec.humidity = Math.max(CONFIG.TARGET_HUMIDITY, sec.humidity - deltaExtract);
      }
      if (sec.temp > 24.2) {
        sec.temp = Math.max(24.2, sec.temp - 0.08 * delta);
      }
    });
  }

  // Evaluación periódica
  if (aiLoopTimer > 0.2) {
    aiLoopTimer = 0;
    evaluateLabSensors();
  }

  updateExtractorPhysics(delta);
}

function evaluateLabSensors() {
  let sumTemp = 0;
  let sumHum = 0;
  let maxHum = 0;

  LabState.sectors.forEach((sec) => {
    sumTemp += sec.temp;
    sumHum += sec.humidity;
    if (sec.humidity > maxHum) maxHum = sec.humidity;
  });

  LabState.avgTemp = sumTemp / LabState.sectors.length;
  LabState.avgHumidity = sumHum / LabState.sectors.length;
  LabState.maxHumidity = maxHum;

  if (LabState.maxHumidity >= CONFIG.CRITICAL_HUMIDITY && !LabState.extractorActive) {
    triggerAIEmergencyActivation();
  }

  if (LabState.extractorActive && LabState.maxHumidity <= CONFIG.TARGET_HUMIDITY) {
    triggerAINormalization();
  }

  updateTelemetryUI();
  updateSectorsVisualization();
  renderUIMiniMap();
}

function triggerAIEmergencyActivation() {
  LabState.extractorActive = true;
  LabState.ledStatus = 'ALERT';

  setSensorLEDColor(CONFIG.COLOR_LED_ALERT, 3.5);

  addAILog('CONTROL-HVAC', `⚠️ ALERTA: Humedad crítica (${LabState.maxHumidity.toFixed(1)}% > ${CONFIG.CRITICAL_HUMIDITY}%).`, 'alert');
  addAILog('ACTUADOR', `Activando extractor centrífugo en pared @ ${CONFIG.EXTRACTOR_MAX_RPM} RPM.`, 'action');
  addAILog('SISTEMA', `LED de sensor conmuta a MODO_CRÍTICO (0xef4444).`, 'system');
  addAILog('CONTROL-HVAC', `Ciclo de deshumidificación preventiva en curso hacia ${CONFIG.TARGET_HUMIDITY}% HR.`, 'action');
}

function triggerAINormalization() {
  LabState.extractorActive = false;
  LabState.isNightSimActive = false;
  LabState.ledStatus = 'OK';

  setSensorLEDColor(CONFIG.COLOR_LED_OK, 2.0);

  addAILog('CONTROL-HVAC', `✅ CONDICIÓN NOMINAL: Humedad normalizada a ${LabState.maxHumidity.toFixed(1)}% (<= 50.0%).`, 'ok');
  addAILog('ACTUADOR', `Extractor de pared entrando en reposo (0 RPM).`, 'action');
  addAILog('SISTEMA', `LED de sensor restaurado a MODO_SEGURO (0x10b981).`, 'system');
  addAILog('CONTROL-HVAC', `Ambiente clínico seguro. Supervisión continua nominal.`, 'system');
}

function setSensorLEDColor(hexColor, intensity) {
  if (ledIndicatorMesh && ledIndicatorMesh.material) {
    ledIndicatorMesh.material.color.setHex(hexColor);
    ledIndicatorMesh.material.emissive.setHex(hexColor);
    ledIndicatorMesh.material.emissiveIntensity = intensity;
  }
  if (ledPointLight) {
    ledPointLight.color.setHex(hexColor);
    ledPointLight.intensity = intensity * 0.7;
  }
}

function updateExtractorPhysics(delta) {
  const targetRPM = LabState.extractorActive ? CONFIG.EXTRACTOR_MAX_RPM : 0;
  const rpmRate = LabState.extractorActive ? 1500 : 900;

  if (LabState.extractorCurrentRPM < targetRPM) {
    LabState.extractorCurrentRPM = Math.min(targetRPM, LabState.extractorCurrentRPM + rpmRate * delta);
  } else if (LabState.extractorCurrentRPM > targetRPM) {
    LabState.extractorCurrentRPM = Math.max(targetRPM, LabState.extractorCurrentRPM - rpmRate * delta);
  }

  LabState.extractorSpeed = (LabState.extractorCurrentRPM / CONFIG.EXTRACTOR_MAX_RPM) * CONFIG.EXTRACTOR_MAX_RAD;

  if (extractorMesh && LabState.extractorCurrentRPM > 0.1) {
    extractorMesh.rotation.x += LabState.extractorSpeed * delta;
  }
}

// ==============================================================================
// 9. TELEMETRÍA Y ELEMENTOS DE INTERFAZ
// ==============================================================================
function updateTelemetryUI() {
  const tempEl = document.getElementById('val-temp-avg');
  const humEl = document.getElementById('val-hum-max');
  const barTemp = document.getElementById('bar-temp');
  const barHum = document.getElementById('bar-hum');

  if (tempEl) tempEl.innerText = LabState.avgTemp.toFixed(1);
  if (humEl) {
    humEl.innerText = LabState.maxHumidity.toFixed(1);
    if (LabState.maxHumidity > CONFIG.CRITICAL_HUMIDITY) {
      humEl.className = 'text-2xl font-bold font-mono text-rose-500 animate-pulse';
    } else {
      humEl.className = 'text-2xl font-bold font-mono text-cyan-400';
    }
  }

  if (barTemp) {
    const tempPct = Math.min(100, Math.max(0, ((LabState.avgTemp - 20) / (32 - 20)) * 100));
    barTemp.style.width = `${tempPct}%`;
  }
  if (barHum) {
    const humPct = Math.min(100, Math.max(0, ((LabState.maxHumidity - 30) / (90 - 30)) * 100));
    barHum.style.width = `${humPct}%`;
  }

  // Actuador Extractor
  const rpmTxt = document.getElementById('status-extractor-rpm');
  const badgeExt = document.getElementById('badge-extractor');
  const iconExt = document.getElementById('icon-extractor');
  const iconExtContainer = document.getElementById('icon-extractor-container');

  if (rpmTxt) {
    rpmTxt.innerText = `${Math.round(LabState.extractorCurrentRPM)} RPM • ${LabState.extractorActive ? 'Extrayendo' : 'Inactivo'}`;
  }
  if (badgeExt) {
    if (LabState.extractorActive) {
      badgeExt.innerText = 'ON';
      badgeExt.className = 'px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-cyan-500/20 text-cyan-300 border border-cyan-500/30';
      if (iconExtContainer) iconExtContainer.className = 'w-7 h-7 rounded-md bg-cyan-500/20 text-cyan-400 flex items-center justify-center';
      if (iconExt) iconExt.className = 'fa-solid fa-fan text-xs animate-fan';
    } else {
      badgeExt.innerText = 'OFF';
      badgeExt.className = 'px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-slate-800 text-slate-400';
      if (iconExtContainer) iconExtContainer.className = 'w-7 h-7 rounded-md bg-slate-800 text-slate-400 flex items-center justify-center';
      if (iconExt) iconExt.className = 'fa-solid fa-fan text-xs';
    }
  }

  // Sensor LED
  const badgeLed = document.getElementById('badge-sensor-led');
  const badgeAlert = document.getElementById('badge-sensor-alert');
  const ledTxt = document.getElementById('status-sensor-led-txt');
  const sysStatusDot = document.getElementById('system-status-dot');
  const sysStatusText = document.getElementById('system-status-text');

  if (LabState.ledStatus === 'ALERT') {
    if (badgeLed) badgeLed.className = 'w-3.5 h-3.5 rounded-full bg-rose-500 led-dot-alert ml-2';
    if (badgeAlert) {
      badgeAlert.innerText = 'CRÍTICO';
      badgeAlert.className = 'px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-rose-500/20 text-rose-400 border border-rose-500/40';
    }
    if (ledTxt) {
      ledTxt.innerText = 'ALERTA (0xef4444)';
      ledTxt.className = 'text-[10px] font-mono text-rose-400';
    }
    if (sysStatusDot) sysStatusDot.className = 'w-2 h-2 rounded-full bg-rose-500 led-dot-alert';
    if (sysStatusText) sysStatusText.innerText = 'ESTADO: ALERTA CRÍTICA';
  } else {
    if (badgeLed) badgeLed.className = 'w-3.5 h-3.5 rounded-full bg-emerald-500 led-dot-ok ml-2';
    if (badgeAlert) {
      badgeAlert.innerText = 'SEGURO';
      badgeAlert.className = 'px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/25';
    }
    if (ledTxt) {
      ledTxt.innerText = 'NORMAL (0x10b981)';
      ledTxt.className = 'text-[10px] font-mono text-emerald-400';
    }
    if (sysStatusDot) sysStatusDot.className = 'w-2 h-2 rounded-full bg-emerald-500 led-dot-ok';
    if (sysStatusText) sysStatusText.innerText = 'ESTADO: NOMINAL';
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
      const t = Math.min(1, Math.max(0, (sec.temp - 23.0) / 7.0));
      cell.style.borderColor = t > 0.5 ? 'rgba(239,68,68,0.5)' : 'rgba(59,130,246,0.5)';
      cell.style.background = t > 0.5 ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.15)';
    } else if (LabState.viewMode === 'humidity') {
      const isCrit = sec.humidity > CONFIG.CRITICAL_HUMIDITY;
      cell.style.borderColor = isCrit ? 'rgba(239,68,68,0.7)' : 'rgba(6,182,212,0.4)';
      cell.style.background = isCrit ? 'rgba(239,68,68,0.22)' : 'rgba(6,182,212,0.12)';
    }

    cell.innerHTML = `
      <div class="flex justify-between items-center text-[9px] font-mono">
        <span class="font-bold text-slate-300">${sec.id}</span>
        <span class="${sec.humidity > CONFIG.CRITICAL_HUMIDITY ? 'text-rose-400 font-bold' : 'text-slate-400'}">${sec.humidity.toFixed(0)}%</span>
      </div>
      <div class="text-[9px] font-mono text-slate-400 text-right mt-0.5">${sec.temp.toFixed(1)}°</div>
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
  addAILog('OPERADOR', `Enfocando inspección en sector ${sec.id}: ${sec.temp.toFixed(1)}°C / ${sec.humidity.toFixed(1)}%`, 'telemetry');
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

  // Toggle Panel Izquierdo
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

  // Toggle Panel Derecho
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

  // Botón maestro: Modo Inmersivo (Oculta o muestra ambos paneles a la vez)
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

  // --- ACORDEONES DESPLEGABLES POR SECCIÓN ---
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

  // Secciones del panel izquierdo
  registerAccordion('header-sec-telemetry', 'content-sec-telemetry');
  registerAccordion('header-sec-actuators', 'content-sec-actuators');
  registerAccordion('header-sec-sectors', 'content-sec-sectors');

  // Secciones del panel derecho
  registerAccordion('header-sec-viewmodes', 'content-sec-viewmodes');
  registerAccordion('header-sec-simulation', 'content-sec-simulation');
}

// ==============================================================================
// 11. CONTROLADORES DE EVENTOS AMBIENTALES
// ==============================================================================
function setupEventListeners() {
  const btnReal = document.getElementById('btn-mode-real');
  const btnTemp = document.getElementById('btn-mode-temp');
  const btnHum = document.getElementById('btn-mode-hum');
  const activeModeTag = document.getElementById('active-mode-tag');

  const setViewMode = (mode) => {
    LabState.viewMode = mode;
    [btnReal, btnTemp, btnHum].forEach(b => {
      if (b) b.className = 'py-1.5 px-2 rounded-md transition-all text-center text-slate-400 hover:text-white hover:bg-white/5 text-[11px]';
    });

    if (mode === 'real') {
      if (btnReal) btnReal.className = 'py-1.5 px-2 rounded-md transition-all text-center bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm text-[11px]';
      if (activeModeTag) activeModeTag.innerText = 'Modo Físico';
      addAILog('VISTA', 'Capa física activa. Sin mapas superpuestos.', 'system');
    } else if (mode === 'temp') {
      if (btnTemp) btnTemp.className = 'py-1.5 px-2 rounded-md transition-all text-center bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm text-[11px]';
      if (activeModeTag) activeModeTag.innerText = 'Mapa Térmico';
      addAILog('VISTA', 'Mapa térmico activado (23°C - 30°C).', 'system');
    } else if (mode === 'humidity') {
      if (btnHum) btnHum.className = 'py-1.5 px-2 rounded-md transition-all text-center bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm text-[11px]';
      if (activeModeTag) activeModeTag.innerText = 'Mapa Humedad';
      addAILog('VISTA', 'Mapa de humedad activado (40% - 85%).', 'system');
    }

    updateSectorsVisualization();
    renderUIMiniMap();
  };

  if (btnReal) btnReal.addEventListener('click', () => setViewMode('real'));
  if (btnTemp) btnTemp.addEventListener('click', () => setViewMode('temp'));
  if (btnHum) btnHum.addEventListener('click', () => setViewMode('humidity'));

  // Botón Simular Noche
  const btnNight = document.getElementById('btn-sim-night');
  if (btnNight) {
    btnNight.addEventListener('click', () => {
      LabState.isNightSimActive = !LabState.isNightSimActive;
      if (LabState.isNightSimActive) {
        btnNight.classList.add('ring-2', 'ring-amber-400');
        addAILog('SIMULACIÓN', '🌙 Protocolo Nocturno iniciado: Climatización en reposo. Incrementando humedad en sala.', 'action');
      } else {
        btnNight.classList.remove('ring-2', 'ring-amber-400');
        addAILog('SIMULACIÓN', 'Protocolo Nocturno detenido por el operador.', 'system');
      }
    });
  }

  // Botón Forzar Extractor
  const btnForce = document.getElementById('btn-force-extractor');
  if (btnForce) {
    btnForce.addEventListener('click', () => {
      LabState.extractorActive = !LabState.extractorActive;
      if (LabState.extractorActive) {
        addAILog('OPERADOR', '⚡ Forzado manual de extractor activado.', 'action');
      } else {
        addAILog('OPERADOR', 'Extractor detenido manualmente.', 'system');
      }
    });
  }

  // Botón Restablecer
  const btnReset = document.getElementById('btn-reset-env');
  if (btnReset) {
    btnReset.addEventListener('click', () => {
      LabState.isNightSimActive = false;
      LabState.extractorActive = false;
      LabState.ledStatus = 'OK';
      if (btnNight) btnNight.classList.remove('ring-2', 'ring-amber-400');

      LabState.sectors.forEach((sec) => {
        sec.humidity = sec.baseHumidity;
        sec.temp = sec.baseTemp;
      });

      setSensorLEDColor(CONFIG.COLOR_LED_OK, 2.0);
      evaluateLabSensors();
      addAILog('SISTEMA', '🔄 Restablecidas condiciones ambientales nominales.', 'system');
    });
  }

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

// Inicializar cuando el DOM esté listo
window.addEventListener('DOMContentLoaded', () => {
  initEngine();
});
