# 🧠 MEMORIA TÉCNICA DEL PROYECTO: SIMULADOR 3D DE LABORATORIO CLÍNICO
> **Documento de Continuidad y Contexto para IA y Equipo de Trabajo**  
> **Proyecto de Grado**: Monitoreo y Control Ambiental IoT en Laboratorio de Simulación Clínica  
> **Repositorio**: https://github.com/andrespoa/simulador-laboratorio-clinico  
> **Rama activa**: `main`

---

## 1. RESUMEN EJECUTIVO Y OBJETIVO
Construcción de un gemelo digital 3D interactivo en la web para la supervisión y control microclimático autónomo en un laboratorio de simulación clínica hospitalaria. El sistema integra:
1. **Dinámica de Partículas Reactiva y Dispersión Gradual**: Al apagarse el aire acondicionado (simulación de alza higrotérmica), las partículas no desaparecen de golpe; experimentan una deriva orgánica y desvanecimiento progresivo durante 6 a 8 segundos. Al encenderse, reingresan mediante una suave cascada laminar desde el difusor del techo.
2. **Tareas Preventivas de IA Proporcionales a la Humedad**: Las recomendaciones se desbloquean progresivamente (hasta 4 tareas) conforme suben la humedad y la temperatura, presentándose con animación de salto flotante (`toast`). Al ejecutarse, cada tarea elimina matemáticamente una porción proporcional del exceso de humedad hasta restaurar la sala a su umbral nominal (~$50.0\%$ HR).
3. **Alerta Crítica Central Abrupta ($>75\%$ HR)**: Despliegue inmediato e impactante de un modal central con animación `abrupt-slam` cuando la humedad relativa en cualquier sector supera el $75\%$, alertando el riesgo inminente de proliferación de moho y daño dieléctrico irreversible en maniquíes.
4. **Gráfica de Ciclo de Vida Útil Calibrada (Laerdal / MedVision)**: Comparativa técnica de durabilidad con degradación lineal suave bajo control IoT/IA (umbral del $40\%$ cruzado a los **8.7 años**) versus degradación exponencial acelerada sin control ambiental (falla crítica a los **2.4 años**), visualizando una ganancia neta superior a los **6 años de operatividad** con área sombreada.
5. **Matriz 3×3 Física Calibrada**: El sector central (S5) concentra la menor temperatura por inyección directa del AC, mientras que los sectores posteriores (S1, S2, S3) presentan la mayor concentración de humedad debido a la densidad de maniquíes de alta fidelidad.
6. **Mapas Térmicos y de Humedad de Alta Visibilidad**: Reducción de transparencia (opacidad $0.68$ a $0.84$ y resplandor *emissive*) para una clara diferenciación volumétrica en 3D.
7. **Interfaz Clínica Ergonómica**: Barras de desplazamiento estilizadas en cian de alta visibilidad (`custom-scroll`) y jerarquía visual optimizada para evitar ocultamiento de datos en pantallas compactas o portátiles.

---

## 2. STACK TECNOLÓGICO Y LIBRERÍAS
* **Three.js r128**: Motor gráfico WebGL con renderizado físico ACES Filmic y sombreado suave.
* **OrbitControls**: Control orbital de cámara con amortiguación suave (`dampingFactor = 0.05`).
* **GLTFLoader**: Carga asíncrona optimizada del modelo 3D con indicador de progreso en MB y porcentaje.
* **Chart.js 4.5.1**: Gráfica de proyección de ciclo de vida útil del equipamiento biomédico con escalas lineales continuas y zonas de sombreado de ganancia.
* **Tailwind CSS**: Maquetación reactiva, paneles translúcidos de control clínico BMS y modales de emergencia.
* **FontAwesome 6**: Iconografía de grado médico, bioingeniería y automatización.
* **Google Fonts**: `Inter` (interfaz) y `JetBrains Mono` (telemetría y consola de eventos).

---

## 3. ESTRUCTURA DEL REPOSITORIO
```text
simulador-3d/
├── index.html              # Interfaz BMS hospitalario, paneles colapsables, modal crítico y visor WebGL
├── js/
│   └── main.js             # Motor 3D, física volumétrica, tareas preventivas de IA, telemetría y Chart.js
├── public/
│   └── simulador3d.glb     # Modelo 3D exportado de Blender (~92.4 MB)
├── .gitignore              # Exclusiones de Git
├── README.md               # Documentación general y guía de ejecución
└── MEMORIA_TECNICA.md      # Este documento (contexto técnico actualizado)
```

---

## 4. ANATOMÍA Y CALIBRACIÓN FÍSICA DE LA SALA 3D

### Dimensiones en Escena:
* **Límites BoundingBox**: $X \in [-1.91, 0.79]$, $Y \in [0.00, 0.97]$, $Z \in [-0.93, 0.94]$.
* **Dimensiones totales**: $2.70\text{ m (ancho)} \times 0.97\text{ m (alto)} \times 1.87\text{ m (profundidad)}$.
* **Centro geométrico**: $(-0.56, 0.48, 0.00)$.
* **Cámara calibrada**: Posición inicial en $(1.45, 1.85, 2.30)$, objetivo `controls.target` en $(-0.56, 0.45, 0.00)$.

### Componentes Clave:
1. **Aire Acondicionado Central (Techo)**:
   * **Nodo**: `model.001`
   * **Ubicación**: $(-0.56, 0.94, 0.00)$.
   * **Función**: Difusor de inyección directa de aire frío y seco que incide sobre el sector S5 (centro).
2. **Distribución de Maniquíes Clínicos (Nodos `maniquie` a `maniquie.008`)**:
   * Concentrados en la fila posterior ($Z < -0.30\text{ m}$): Camillas de pediatría, UCI adulto y materno-infantil.
   * Constituyen los focos biológicos simulados de mayor humedad relativa en el laboratorio.

---

## 5. SISTEMAS Y REGLAS DE FÍSICA AMBIENTAL

### A. Matriz 3×3 Calibrada (Temperatura y Humedad)
* **Fila 0 (Posterior - Foco de Maniquíes)**:
  * **S1 (Cama Pediatría)**: Temp base $24.5^\circ\text{C}$, Humedad base $60.0\%$ HR.
  * **S2 (Cama UCI Adulto - Foco Crítico)**: Temp base $24.0^\circ\text{C}$, Humedad base **$64.5\%$ HR (Máxima de la sala)**.
  * **S3 (Cama Materno-Infantil)**: Temp base $24.8^\circ\text{C}$, Humedad base $61.0\%$ HR.
* **Fila 1 (Central - Caída de Aire Acondicionado)**:
  * **S4 (Pasillo Lateral Oeste)**: Temp base $23.2^\circ\text{C}$, Humedad base $50.5\%$ HR.
  * **S5 (Centro Sala)**: **MENOR TEMPERATURA de toda la sala ($20.5^\circ\text{C}$)** y menor humedad ($45.0\%$ HR) por inyección vertical directa del AC.
  * **S6 (Pasillo Lateral Este)**: Temp base $23.5^\circ\text{C}$, Humedad base $52.0\%$ HR.
* **Fila 2 (Frontal - Procedimientos y Monitores)**:
  * **S7 (Acceso Clínico / Lavamanos)**: Temp base $25.2^\circ\text{C}$, Humedad base $53.5\%$ HR.
  * **S8 (Camilla Quirúrgica / RCP)**: Temp base $23.6^\circ\text{C}$, Humedad base $58.0\%$ HR (maniquí de reanimación).
  * **S9 (Estación Monitores & Equipos)**: Temp base $26.2^\circ\text{C}$ (calor disipado por electrónica), Humedad base $52.5\%$ HR.

### B. Dinámica de Partículas de Aire y Dispersión Gradual
* **Comportamiento con AC Apagado (Simulación de Alza Térmica/Higrométrica)**:
  * Las partículas ya no desaparecen de manera instantánea.
  * Pasan a un estado de **dispersión lenta**: mantienen una deriva inercial radial (`drift`) con ligera flotabilidad térmica, mientras su opacidad se atenúa gradualmente mediante `delta * 0.32` a lo largo de un intervalo orgánico de **6 a 8 segundos** hasta extinguirse.
* **Animación de Entrada con AC Activo**:
  * Al encenderse el sistema de acondicionamiento, las partículas inician una cascada laminar descendente desde el difusor en el techo ($Y \approx 0.94\text{ m}$), aumentando progresivamente su opacidad de $0.0$ a $0.82$ y distribuyéndose en abanico por el volumen total de la sala.
* **Coloración Reactiva**:
  * Cian cristalino (`0x38bdf8`) en condiciones nominales de inyección fría.
  * Rojo coral / carmesí (`0xef4444`) en los sectores de maniquíes con estrés higrométrico.

### C. Sistema de Tareas Preventivas de IA con Equivalencia Matemática
* **Desbloqueo progresivo por umbrales (hasta 4 tareas)**:
  1. *Deshumidificación Profunda en AC Central* (HR $\ge 66.5\%$ o Temp $\ge 24.1^\circ\text{C}$).
  2. *Purga y Secado en Simuladores de Pacientes S1-S3* (HR $\ge 69.0\%$ o Maniquíes $\ge 64.0\%$).
  3. *Redistribución de Flujo Laminar Periférico* (HR $\ge 73.0\%$ o Temp $\ge 25.2^\circ\text{C}$).
  4. *Filtros HEPA & Control de Punto de Rocío* (HR $\ge 77.0\%$).
* **Animación de Notificación Flotante**:
  * Al activarse una tarea, salta al centro-derecha de la pantalla con efecto elástico (`toast-jump-in`) antes de posarse en la lista de tareas del panel lateral (`task-card-land`).
* **Equivalencia Matemática y Retorno al Umbral Correcto**:
  * Cada tarea ejecutada reduce una fracción proporcional del exceso higrotérmico:  
    $$\Delta H = \frac{\text{Humedad Actual} - \text{Humedad Nominal}}{\text{Tareas Restantes}}$$
  * Al completar todas las tareas pendientes, la sala regresa con exactitud al nivel de humedad nominal (~$50.0\%$ HR global), restaurando la estabilidad ambiental y reiniciando el flujo laminar del AC.

### D. Aviso de Estado Crítico Abrupto ($>75\%$ HR)
* **Activación**: Disparado inmediatamente en cuanto la humedad máxima de cualquier sector supera el **$75.0\%$ HR**.
* **Impacto Visual**: Modal centrado con fondo oscuro translúcido y animación `abrupt-slam` (escala súbita desde $1.4\times$ con rebote tenso), borde rojo carmesí parpadeante y señalética de alarma médica.
* **Mensaje Técnico**: Advierte sobre la condensación inminente en los componentes elastoméricos, conectores de sensores internos y riesgo de cortocircuito o colonización por moho en maniquíes pediátricos y de UCI.
* **Interacción**: Permite descartar la alarma para proceder a la ejecución de tareas correctivas en el panel de IA.

### E. Proyección del Ciclo de Vida Útil de Maniquíes (Calibración Laerdal / MedVision)
La gráfica interactiva en `index.html` implementada con Chart.js refleja la degradación comparativa basada en guías de fabricantes y estudios higrotérmicos de polímeros:
* **Eje X (Tiempo)**: 0 a 10 Años de servicio continuo.
* **Eje Y (Funcionalidad y Estado Físico)**: $0\%$ a $100\%$.
* **Umbral Crítico de Falla e Inoperatividad**: Línea punteada horizontal roja en el **$40\%$**.
* **Línea Verde (Con Control IoT / IA)**:
  * Curva de degradación suave y progresiva.
  * Cruza el umbral crítico ($40\%$) a los **8.7 años**.
  * Retiene un $30\%$ de estado funcional a los 10 años.
* **Línea Roja Discontinua (Sin Control Ambiental)**:
  * Degradación exponencial acelerada provocada por humedad y calor acumulado.
  * Cruza el umbral crítico de falla a los **2.4 años**.
  * Cae al $1.8\%$ a los 10 años (pérdida total del activo).
* **Zona de Sombra (Ganancia Operativa)**:
  * Relleno degradado esmeralda entre ambas curvas que destaca una **ganancia de más de 6 años de vida útil operativa** y la prevención de sobrecostos de reemplazo prematuro.
* **Cita Técnica**: *"Fuente: Estimación técnica basada en guías de fabricantes (Laerdal, MedVision) y estudios de envejecimiento higrotérmico de polímeros (2024-2026)."*

### F. Mapas 3D con Alta Visibilidad
* **Opacidad**: Ajustada entre $0.68$ y $0.84$.
* **Brillo Emissive**: Factor de $0.40$ a $0.75$ para que la visualización volumétrica de calor y humedad sea nítida y evidente sobre el modelo tridimensional.

---

## 6. CÓMO EJECUTAR EL PROYECTO
```bash
# Servidor local con Python:
python -m http.server 3000

# O con Node.js:
npx serve -l 3000
```
Abrir en el navegador: `http://localhost:3000`
