# 🧠 MEMORIA TÉCNICA DEL PROYECTO: SIMULADOR 3D DE LABORATORIO CLÍNICO
> **Documento de Continuidad y Contexto para IA y Equipo de Trabajo**  
> **Proyecto de Grado**: Monitoreo y Control Ambiental IoT en Laboratorio de Simulación Clínica  
> **Repositorio**: https://github.com/andrespoa/simulador-laboratorio-clinico  
> **Rama activa**: `main`

---

## 1. RESUMEN EJECUTIVO Y OBJETIVO
Construcción de un gemelo digital 3D interactivo en la web para la supervisión y control microclimático autónomo en un laboratorio de simulación clínica hospitalaria. Integra:
1. **Dinámica de partículas reactiva al estado del AC**: Cuando el aire acondicionado se apaga (simulación de alza térmica e higrométrica), las partículas se transparentan y desvanecen gradualmente; al encenderse el AC, reingresan con una suave animación en cascada desde el difusor del techo.
2. **Sistema de Tareas Preventivas de la IA con aparición progresiva (máximo 4)**: Las recomendaciones no se muestran todas al inicio, sino que se desbloquean dinámicamente conforme ascienden la humedad y la temperatura, presentándose con una animación de salto como notificación flotante antes de ubicarse en el panel.
3. **Modelado y proyección del Ciclo de Vida Útil** mediante dos gráficas comparativas (Con Prevención IA vs. Falla Prematura sin intervención).
4. **Matriz 3×3 física calibrada**: Sector central (S5) con la menor temperatura por descarga directa de AC, y sectores posteriores (S1, S2, S3) con la mayor concentración de humedad por presencia de maniquíes de alta fidelidad.
5. **Mapas térmicos y de humedad de alta visibilidad**: Reducción de transparencia (opacidad $0.68$ a $0.84$ y resplandor emissive) para una clara diferenciación visual en 3D.
6. **Interfaz clínica ergonómica**: Barras de desplazamiento estilizadas en cian de alta visibilidad y contenedor delimitado para evitar ocultamiento de datos en pantallas compactas.

---

## 2. STACK TECNOLÓGICO Y LIBRERÍAS
* **Three.js r128**: Motor gráfico WebGL con renderizado físico ACES Filmic.
* **OrbitControls**: Control orbital de cámara con amortiguación suave (`dampingFactor = 0.05`).
* **GLTFLoader**: Carga optimizada del modelo 3D con indicador de progreso en MB y porcentaje.
* **Chart.js 4.5.1**: Gráficas interactivas de proyección de ciclo de vida útil del equipamiento biomédico.
* **Tailwind CSS**: Maquetación reactiva y paneles translúcidos de control clínico BMS.
* **FontAwesome 6**: Iconografía de grado médico, bioingeniería y automatización.
* **Google Fonts**: `Inter` (interfaz) y `JetBrains Mono` (telemetría y consola de eventos).

---

## 3. ESTRUCTURA DEL REPOSITORIO
```text
simuladorpy/
├── index.html              # Interfaz BMS hospitalario, paneles colapsables, gráficas y visor WebGL
├── js/
│   └── main.js             # Motor 3D, física volumétrica, tareas preventivas de IA y telemetría
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

### B. Dinámica de Partículas de Aire
* **Comportamiento con AC Apagado (Simulación de alza)**:
  * La opacidad desciende progresivamente mediante interpolación lerp hasta $0.0$, deteniendo el movimiento y ocultando el sistema de partículas para reflejar la ausencia de inyección de aire frío.
* **Animación de Entrada con AC Activo**:
  * Al encenderse o reanudarse el AC, las partículas reingresan con una ráfaga laminar descendente desde el difusor central en el techo, aumentando su opacidad de $0.0$ a $0.82$ y abriéndose en abanico por la sala.
* **Coloración Reactiva**:
  * Cian cristalino (`0x38bdf8`) en condiciones nominales y rojo coral / magenta (`0xef4444`) en sectores críticos de maniquíes.

### C. Tareas Preventivas de la IA con Notificación Flotante
* **Aparición progresiva por umbrales (hasta 4 tareas)**:
  1. *Deshumidificación Profunda en AC Central* (HR $\ge 66.5\%$ o Temp $\ge 24.1^\circ\text{C}$).
  2. *Purga y Secado en Simuladores de Pacientes S1-S3* (HR $\ge 69.0\%$ o Maniquíes $\ge 64.0\%$).
  3. *Redistribución de Flujo Laminar Periférico* (HR $\ge 73.0\%$ o Temp $\ge 25.2^\circ\text{C}$).
  4. *Filtros HEPA & Control de Punto de Rocío* (HR $\ge 77.0\%$).
* **Animación**:
  * Notificación flotante emergente con efecto de salto (`toast-jump-in`).
  * Transición de entrada al panel lateral con animación de aterrizaje (`task-card-land`).
  * Ejecución interactiva que reduce la humedad inmediatamente.

### D. Mapas 3D con Alta Visibilidad
* **Opacidad**: Ajustada a un rango entre $0.68$ y $0.84$.
* **Brillo Emissive**: Intensidad entre $0.40$ y $0.75$ para destacar los volúmenes sin transparencias excesivas que dificulten su identificación visual.

---

## 6. CÓMO EJECUTAR EL PROYECTO
```bash
# Servidor local con Python:
python -m http.server 3000

# O con Node.js:
npx serve -l 3000
```
Abrir en el navegador: `http://localhost:3000`



