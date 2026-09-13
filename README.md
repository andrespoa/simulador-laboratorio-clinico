# Simulador 3D: Laboratorio Clínico (BMS / IoT)

Sistema interactivo 3D para supervisión y mitigación ambiental autónoma en un laboratorio de simulación clínica, integrando telemetría IoT, visualización volumétrica y control dinámico de actuadores HVAC.

---

## 🏥 Características Principales

* **Visualización 3D Fidedigna**: Escena renderizada en Three.js (WebGL) con modelo real exportado de Blender (`public/simulador3d.glb`).
* **Dinámica de Flujo de Aire y Humedad**:
  * Emisión continua de partículas de aire climatizado desde la unidad central de techo.
  * Succión y extracción física a través del extractor real en pared cuando se activa la mitigación.
  * Modulación cromática en tiempo real según niveles de humedad (Cian $\rightarrow$ Púrpura $\rightarrow$ Rojo Alerta).
* **Control Automatizado (Lógica Preventiva)**:
  * Monitoreo continuo de 9 sectores ambientales (Matriz 3×3).
  * Activación automática de contingencia al superar el **68.0% de Humedad Relativa**:
    * Conmutación del LED del sensor a Rojo (`0xef4444`).
    * Encendido del extractor centrífugo (rotación de aspas a 1800 RPM).
    * Extracción continua hasta normalizar a **50.0% HR**.
* **Interfaz de Usuario Profesional (BMS / SCADA)**:
  * Paneles laterales colapsables y ocultables con modo de pantalla completa (*Vista Inmersiva*).
  * Módulos tipo acordeón independientes para telemetría, actuadores, sectores, modos de visualización y terminal de eventos.
  * Modos de visualización 3D: **Modo Físico**, **Mapa Térmico** y **Mapa de Humedad**.

---

## 🚀 Requisitos y Ejecución Local

Dado que los navegadores bloquean la carga de modelos 3D (`.glb`) bajo el protocolo local `file://` por restricciones de CORS, se requiere ejecutar mediante un servidor HTTP local:

### Opción 1: Con Node.js (Recomendado)
```bash
# Desde la carpeta raíz del proyecto:
npx serve -l 3000
```
Luego abre en tu navegador: [http://localhost:3000](http://localhost:3000)

### Opción 2: Con Python
```bash
# Con Python 3:
python -m http.server 3000
```
Luego abre en tu navegador: [http://localhost:3000](http://localhost:3000)

### Opción 3: Con VS Code
Instala la extensión **Live Server** de VS Code, haz clic derecho sobre `index.html` y selecciona **"Open with Live Server"**.

---

## 📂 Estructura del Proyecto

```text
simuladorpy/
├── index.html              # Interfaz de usuario, HUD y configuración de estilos
├── js/
│   └── main.js             # Motor Three.js, física de partículas, actuadores y lógica
├── public/
│   └── simulador3d.glb     # Modelo 3D del laboratorio clínico
├── .gitignore              # Configuración de exclusiones de Git
└── README.md               # Documentación del proyecto
```

---

## 🛠️ Tecnologías Utilizadas

* [Three.js r128](https://threejs.org/) (WebGL Engine)
* OrbitControls & GLTFLoader
* [Tailwind CSS](https://tailwindcss.com/)
* [FontAwesome Icons](https://fontawesome.com/)
* Google Fonts (Inter & JetBrains Mono)
