/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { BoxCollider, CameraMode, LevelDefinition, PlayerPhysicsState, Vector3D } from './types';
import { PHYSICS_CONSTANTS } from './rules';

// Pre-allocated scratch vectors for zero-GC render loop
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _targetCamPos = new THREE.Vector3();
const _targetLookAt = new THREE.Vector3();

export class ParkourRenderer {
  public isSoftwareGl: boolean;
  public renderer: THREE.WebGLRenderer;
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public cameraMode: CameraMode = 'third_person';
  public container: HTMLElement;

  private frameId: number = 0;
  private isDestroyed: boolean = false;
  private levelMeshes: Map<string, THREE.Mesh | THREE.Group> = new Map();
  private movingMeshes: { id: string; mesh: THREE.Mesh | THREE.Group; collider: BoxCollider; origin: Vector3D }[] = [];

  // Procedural 3D athletic character model
  public playerGroup: THREE.Group;
  private innerBodyGroup!: THREE.Group;
  private headMesh!: THREE.Mesh;
  private visorMesh!: THREE.Mesh;
  private torsoMesh!: THREE.Mesh;
  private spineGlowMesh!: THREE.Mesh;
  private backpackMesh!: THREE.Mesh;
  private thrusterLMesh!: THREE.Mesh;
  private thrusterRMesh!: THREE.Mesh;
  private leftArmGroup!: THREE.Group;
  private rightArmGroup!: THREE.Group;
  private leftLegGroup!: THREE.Group;
  private rightLegGroup!: THREE.Group;
  private contactShadow!: THREE.Mesh;
  private arrowMesh!: THREE.Mesh;
  private speedLines!: THREE.LineSegments;
  private doubleJumpFlipProgress = 0;

  // Camera damping
  private currentCamPos = new THREE.Vector3(0, 5, 10);
  private currentLookAt = new THREE.Vector3(0, 2, 0);
  private cameraRoll = 0;
  private cameraFovBase = 68;

  // Title flyover animation
  public isTitleScreen: boolean = true;
  private titleFlyTime = 0;

  constructor(container: HTMLElement) {
    this.container = container;

    // Detect software WebGL
    this.isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    // Initialize renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.appendChild(this.renderer.domElement);

    // Setup scene & camera
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0f172a');
    this.scene.fog = new THREE.FogExp2('#0f172a', 0.012);

    this.camera = new THREE.PerspectiveCamera(
      this.cameraFovBase,
      container.clientWidth / container.clientHeight,
      0.1,
      400
    );
    this.camera.position.set(0, 8, 14);

    // Studio Environment reflection
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    // Setup Lighting
    this.setupLighting();

    // Build procedural 3-12 part runner character
    this.playerGroup = this.buildProceduralPlayer();
    this.scene.add(this.playerGroup);

    // Build speed line streaks
    this.speedLines = this.buildSpeedLines();
    this.scene.add(this.speedLines);

    // Handle resize
    window.addEventListener('resize', this.onResize);
  }

  private setupLighting() {
    // Cool sky/ground ambient fill
    const hemiLight = new THREE.HemisphereLight('#f8fafc', '#334155', 0.95);
    hemiLight.position.set(0, 60, 0);
    this.scene.add(hemiLight);

    // Warm key sun light with soft shadows
    const dirLight = new THREE.DirectionalLight('#fff7ed', 1.8);
    dirLight.position.set(25, 45, 20);
    if (!this.isSoftwareGl) {
      dirLight.castShadow = true;
      dirLight.shadow.mapSize.width = 1024;
      dirLight.shadow.mapSize.height = 1024;
      dirLight.shadow.camera.near = 5;
      dirLight.shadow.camera.far = 120;
      const d = 40;
      dirLight.shadow.camera.left = -d;
      dirLight.shadow.camera.right = d;
      dirLight.shadow.camera.top = d;
      dirLight.shadow.camera.bottom = -d;
      dirLight.shadow.bias = -0.0005;
      dirLight.shadow.normalBias = 0.02;
    }
    this.scene.add(dirLight);

    // Subtle blue rim back-light
    const rimLight = new THREE.DirectionalLight('#38bdf8', 0.6);
    rimLight.position.set(-20, 20, -30);
    this.scene.add(rimLight);
  }

  /**
   * High-fidelity athletic humanoid 3D parkour runner avatar
   */
  private buildProceduralPlayer(): THREE.Group {
    const rootGroup = new THREE.Group();

    // Inner body group allows front-flips and body tilts without rotating contact shadow
    this.innerBodyGroup = new THREE.Group();
    rootGroup.add(this.innerBodyGroup);

    // Common PBR materials
    const whiteFabricMat = new THREE.MeshStandardMaterial({
      color: '#f8fafc',
      roughness: 0.35,
      metalness: 0.1,
    });
    const darkSlateMat = new THREE.MeshStandardMaterial({
      color: '#0f172a',
      roughness: 0.25,
      metalness: 0.3,
    });
    const charcoalMat = new THREE.MeshStandardMaterial({
      color: '#1e293b',
      roughness: 0.6,
      metalness: 0.1,
    });
    const orangeAccentMat = new THREE.MeshStandardMaterial({
      color: '#f97316',
      roughness: 0.3,
      metalness: 0.2,
    });
    const cyanGlowMat = new THREE.MeshBasicMaterial({ color: '#38bdf8' });
    const flameGlowMat = new THREE.MeshBasicMaterial({ color: '#f97316' });

    // 1. Torso: Athletic parkour jacket / vest
    const torsoGeo = new THREE.BoxGeometry(0.48, 0.68, 0.28);
    this.torsoMesh = new THREE.Mesh(torsoGeo, whiteFabricMat);
    this.torsoMesh.position.y = 1.05;
    this.torsoMesh.castShadow = !this.isSoftwareGl;
    this.innerBodyGroup.add(this.torsoMesh);

    // Two-tone shoulder pads / vest panels
    const vestPanelGeo = new THREE.BoxGeometry(0.5, 0.28, 0.3);
    const vestPanel = new THREE.Mesh(vestPanelGeo, darkSlateMat);
    vestPanel.position.set(0, 1.25, 0);
    this.innerBodyGroup.add(vestPanel);

    // Glowing cyber spine strip on the back
    const spineGeo = new THREE.BoxGeometry(0.06, 0.52, 0.04);
    this.spineGlowMesh = new THREE.Mesh(spineGeo, cyanGlowMat);
    this.spineGlowMesh.position.set(0, 1.05, 0.145);
    this.innerBodyGroup.add(this.spineGlowMesh);

    // Front chest badge
    const badgeGeo = new THREE.BoxGeometry(0.16, 0.16, 0.04);
    const badgeMesh = new THREE.Mesh(badgeGeo, orangeAccentMat);
    badgeMesh.position.set(0, 1.15, -0.145);
    this.innerBodyGroup.add(badgeMesh);

    // 2. Aerodynamic Jet Thruster Pack on runner's back
    const packGeo = new THREE.BoxGeometry(0.32, 0.38, 0.12);
    this.backpackMesh = new THREE.Mesh(packGeo, darkSlateMat);
    this.backpackMesh.position.set(0, 1.08, 0.2);
    this.innerBodyGroup.add(this.backpackMesh);

    // Twin micro-nozzles
    const nozzleGeo = new THREE.CylinderGeometry(0.04, 0.06, 0.1, 8);
    const nozzleL = new THREE.Mesh(nozzleGeo, darkSlateMat);
    nozzleL.rotation.x = Math.PI;
    nozzleL.position.set(-0.1, 0.86, 0.22);
    const nozzleR = new THREE.Mesh(nozzleGeo, darkSlateMat);
    nozzleR.rotation.x = Math.PI;
    nozzleR.position.set(0.1, 0.86, 0.22);
    this.innerBodyGroup.add(nozzleL, nozzleR);

    // Thruster flame jets (flares up on Jump / Double Jump / Dash)
    const flameGeo = new THREE.ConeGeometry(0.045, 0.18, 6);
    this.thrusterLMesh = new THREE.Mesh(flameGeo, flameGlowMat);
    this.thrusterLMesh.rotation.x = Math.PI;
    this.thrusterLMesh.position.set(-0.1, 0.76, 0.22);
    this.thrusterLMesh.visible = false;

    this.thrusterRMesh = new THREE.Mesh(flameGeo, flameGlowMat);
    this.thrusterRMesh.rotation.x = Math.PI;
    this.thrusterRMesh.position.set(0.1, 0.76, 0.22);
    this.thrusterRMesh.visible = false;
    this.innerBodyGroup.add(this.thrusterLMesh, this.thrusterRMesh);

    // 3. Head & Helmet Visor
    const neckGeo = new THREE.CylinderGeometry(0.09, 0.1, 0.1, 8);
    const neckMesh = new THREE.Mesh(neckGeo, charcoalMat);
    neckMesh.position.set(0, 1.42, 0);
    this.innerBodyGroup.add(neckMesh);

    const headGeo = new THREE.BoxGeometry(0.32, 0.34, 0.34);
    this.headMesh = new THREE.Mesh(headGeo, darkSlateMat);
    this.headMesh.position.set(0, 1.6, 0);
    this.headMesh.castShadow = !this.isSoftwareGl;
    this.innerBodyGroup.add(this.headMesh);

    // Glowing aerodynamic visor
    const visorGeo = new THREE.BoxGeometry(0.28, 0.11, 0.06);
    this.visorMesh = new THREE.Mesh(visorGeo, cyanGlowMat);
    this.visorMesh.position.set(0, 1.6, -0.175);
    this.innerBodyGroup.add(this.visorMesh);

    // Side ear comms
    const earGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.36, 8);
    const earMesh = new THREE.Mesh(earGeo, orangeAccentMat);
    earMesh.rotation.z = Math.PI / 2;
    earMesh.position.set(0, 1.6, 0);
    this.innerBodyGroup.add(earMesh);

    // 4. Limbs: Arms with shoulder pivots & runner gloves
    const upperArmGeo = new THREE.BoxGeometry(0.12, 0.32, 0.12);
    const forearmGeo = new THREE.BoxGeometry(0.11, 0.28, 0.11);
    const gloveGeo = new THREE.BoxGeometry(0.12, 0.14, 0.13);

    // Left Arm
    this.leftArmGroup = new THREE.Group();
    this.leftArmGroup.position.set(-0.34, 1.35, 0);
    const lUpper = new THREE.Mesh(upperArmGeo, whiteFabricMat);
    lUpper.position.y = -0.14;
    const lForearm = new THREE.Mesh(forearmGeo, charcoalMat);
    lForearm.position.y = -0.4;
    const lGlove = new THREE.Mesh(gloveGeo, orangeAccentMat);
    lGlove.position.y = -0.56;
    this.leftArmGroup.add(lUpper, lForearm, lGlove);
    this.innerBodyGroup.add(this.leftArmGroup);

    // Right Arm
    this.rightArmGroup = new THREE.Group();
    this.rightArmGroup.position.set(0.34, 1.35, 0);
    const rUpper = new THREE.Mesh(upperArmGeo, whiteFabricMat);
    rUpper.position.y = -0.14;
    const rForearm = new THREE.Mesh(forearmGeo, charcoalMat);
    rForearm.position.y = -0.4;
    const rGlove = new THREE.Mesh(gloveGeo, orangeAccentMat);
    rGlove.position.y = -0.56;
    this.rightArmGroup.add(rUpper, rForearm, rGlove);
    this.innerBodyGroup.add(this.rightArmGroup);

    // 5. Limbs: Legs with hip pivots, knee guards & luminous pro sneakers
    const thighGeo = new THREE.BoxGeometry(0.16, 0.36, 0.16);
    const calfGeo = new THREE.BoxGeometry(0.14, 0.34, 0.14);
    const kneeGeo = new THREE.BoxGeometry(0.16, 0.08, 0.18);
    const shoeGeo = new THREE.BoxGeometry(0.18, 0.12, 0.32);
    const soleGeo = new THREE.BoxGeometry(0.18, 0.03, 0.32);

    // Left Leg
    this.leftLegGroup = new THREE.Group();
    this.leftLegGroup.position.set(-0.16, 0.72, 0);
    const lThigh = new THREE.Mesh(thighGeo, charcoalMat);
    lThigh.position.y = -0.16;
    const lKnee = new THREE.Mesh(kneeGeo, darkSlateMat);
    lKnee.position.set(0, -0.34, 0.01);
    const lCalf = new THREE.Mesh(calfGeo, darkSlateMat);
    lCalf.position.y = -0.48;
    const lShoe = new THREE.Mesh(shoeGeo, orangeAccentMat);
    lShoe.position.set(0, -0.66, -0.05);
    const lSole = new THREE.Mesh(soleGeo, cyanGlowMat);
    lSole.position.set(0, -0.72, -0.05);
    this.leftLegGroup.add(lThigh, lKnee, lCalf, lShoe, lSole);
    this.innerBodyGroup.add(this.leftLegGroup);

    // Right Leg
    this.rightLegGroup = new THREE.Group();
    this.rightLegGroup.position.set(0.16, 0.72, 0);
    const rThigh = new THREE.Mesh(thighGeo, charcoalMat);
    rThigh.position.y = -0.16;
    const rKnee = new THREE.Mesh(kneeGeo, darkSlateMat);
    rKnee.position.set(0, -0.34, 0.01);
    const rCalf = new THREE.Mesh(calfGeo, darkSlateMat);
    rCalf.position.y = -0.48;
    const rShoe = new THREE.Mesh(shoeGeo, orangeAccentMat);
    rShoe.position.set(0, -0.66, -0.05);
    const rSole = new THREE.Mesh(soleGeo, cyanGlowMat);
    rSole.position.set(0, -0.72, -0.05);
    this.rightLegGroup.add(rThigh, rKnee, rCalf, rShoe, rSole);
    this.innerBodyGroup.add(this.rightLegGroup);

    // 6. Contact shadow disc on ground
    const shadowGeo = new THREE.CircleGeometry(0.55, 16);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: '#000000',
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    this.contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
    this.contactShadow.rotation.x = -Math.PI / 2;
    this.contactShadow.position.y = 0.02;
    rootGroup.add(this.contactShadow);

    // 7. Sleek minimalist directional guide arrow
    const arrowShape = new THREE.Shape();
    arrowShape.moveTo(0, -0.9); // Tip
    arrowShape.lineTo(0.2, -0.55);
    arrowShape.lineTo(0.08, -0.55);
    arrowShape.lineTo(0.08, 0);
    arrowShape.lineTo(-0.08, 0);
    arrowShape.lineTo(-0.08, -0.55);
    arrowShape.lineTo(-0.2, -0.55);
    arrowShape.closePath();

    const arrowGeo = new THREE.ShapeGeometry(arrowShape);
    const arrowMat = new THREE.MeshBasicMaterial({
      color: '#06b6d4',
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    });
    this.arrowMesh = new THREE.Mesh(arrowGeo, arrowMat);
    this.arrowMesh.rotation.x = -Math.PI / 2;
    this.arrowMesh.position.y = 0.03;
    rootGroup.add(this.arrowMesh);

    return rootGroup;
  }

  private mouseRaycaster = new THREE.Raycaster();
  private mouseNdc = new THREE.Vector2();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private groundTarget = new THREE.Vector3();

  /**
   * Projects screen mouse NDC (-1 to +1) onto 3D horizontal plane at player height
   */
  public getGroundIntersection(ndcX: number, ndcY: number, groundY: number): THREE.Vector3 | null {
    this.groundPlane.constant = -groundY;
    this.mouseNdc.set(ndcX, ndcY);
    this.mouseRaycaster.setFromCamera(this.mouseNdc, this.camera);
    const hit = this.mouseRaycaster.ray.intersectPlane(this.groundPlane, this.groundTarget);
    return hit ? this.groundTarget : null;
  }

  /**
   * Speed lines effect in high sprint/dash
   */
  private buildSpeedLines(): THREE.LineSegments {
    const lineCount = 30;
    const positions = new Float32Array(lineCount * 6);
    for (let i = 0; i < lineCount; i++) {
      const idx = i * 6;
      const x = (Math.random() - 0.5) * 8;
      const y = (Math.random() - 0.5) * 5;
      const z = -Math.random() * 8;
      positions[idx] = x;
      positions[idx + 1] = y;
      positions[idx + 2] = z;
      positions[idx + 3] = x;
      positions[idx + 4] = y;
      positions[idx + 5] = z - (2 + Math.random() * 4);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({
      color: '#38bdf8',
      transparent: true,
      opacity: 0,
    });
    const lines = new THREE.LineSegments(geo, mat);
    lines.visible = false;
    return lines;
  }

  /**
   * Build level 3D meshes from colliders
   */
  public loadLevel(level: LevelDefinition) {
    // Clear old meshes
    this.levelMeshes.forEach((mesh) => {
      this.scene.remove(mesh);
      if (mesh instanceof THREE.Mesh) {
        mesh.geometry.dispose();
      }
    });
    this.levelMeshes.clear();
    this.movingMeshes = [];

    // Sky and fog color based on level theme
    if (level.skyTheme === 'zenith') {
      this.scene.background = new THREE.Color('#0369a1');
      this.scene.fog = new THREE.FogExp2('#0369a1', 0.012);
    } else if (level.skyTheme === 'sunset') {
      this.scene.background = new THREE.Color('#431407');
      this.scene.fog = new THREE.FogExp2('#431407', 0.011);
    } else if (level.skyTheme === 'cyber') {
      this.scene.background = new THREE.Color('#1e1b4b');
      this.scene.fog = new THREE.FogExp2('#1e1b4b', 0.012);
    } else if (level.skyTheme === 'emerald') {
      this.scene.background = new THREE.Color('#064e3b');
      this.scene.fog = new THREE.FogExp2('#064e3b', 0.012);
    } else if (level.skyTheme === 'crimson') {
      this.scene.background = new THREE.Color('#4c0519');
      this.scene.fog = new THREE.FogExp2('#4c0519', 0.011);
    } else if (level.skyTheme === 'midnight') {
      this.scene.background = new THREE.Color('#020617');
      this.scene.fog = new THREE.FogExp2('#020617', 0.013);
    } else if (level.skyTheme === 'neon') {
      this.scene.background = new THREE.Color('#172554');
      this.scene.fog = new THREE.FogExp2('#172554', 0.012);
    } else {
      this.scene.background = new THREE.Color('#0f172a');
      this.scene.fog = new THREE.FogExp2('#0f172a', 0.013);
    }

    // Shared materials for clean performance
    const groundMat = new THREE.MeshStandardMaterial({
      color: '#f8fafc',
      roughness: 0.5,
      metalness: 0.05,
    });
    const wallRunMat = new THREE.MeshStandardMaterial({
      color: '#f97316', // Orange wall run strip
      roughness: 0.3,
      metalness: 0.1,
    });
    const bounceMat = new THREE.MeshStandardMaterial({
      color: '#ec4899', // Bright pink / orange bounce pad
      roughness: 0.25,
      metalness: 0.3,
    });
    const obstacleMat = new THREE.MeshStandardMaterial({
      color: '#ef4444', // Red laser / bar
      roughness: 0.4,
      metalness: 0.1,
    });
    const hazardLaserMat = new THREE.MeshBasicMaterial({
      color: '#ff003b',
    });
    const hazardLaserGlowMat = new THREE.MeshBasicMaterial({
      color: '#ff4d6d',
      transparent: true,
      opacity: 0.45,
    });
    const hazardSpikeMat = new THREE.MeshStandardMaterial({
      color: '#dc2626',
      roughness: 0.25,
      metalness: 0.8,
    });
    const hazardSawMat = new THREE.MeshStandardMaterial({
      color: '#e11d48',
      roughness: 0.2,
      metalness: 0.85,
    });
    const hazardPylonMat = new THREE.MeshStandardMaterial({
      color: '#0f172a',
      roughness: 0.5,
      metalness: 0.6,
    });

    level.colliders.forEach((col) => {
      // 1. Specialized 3D Visuals for Lethal Hazard Traps
      if (col.type === 'hazard') {
        const hazardGroup = new THREE.Group();
        hazardGroup.position.set(col.x, col.y, col.z);

        const hType = col.metadata?.hazardType || 'spikes';

        if (hType === 'spikes') {
          // Dark metallic base bed
          const baseHeight = Math.min(0.15, col.height * 0.2);
          const baseGeo = new THREE.BoxGeometry(col.width, baseHeight, col.depth);
          const baseMesh = new THREE.Mesh(baseGeo, hazardPylonMat);
          baseMesh.position.y = -col.height / 2 + baseHeight / 2;
          hazardGroup.add(baseMesh);

          // Array of sharp danger spikes (cones)
          const spikeH = col.height - baseHeight;
          const spikeRadius = Math.min(0.25, Math.min(col.width, col.depth) * 0.25);
          const spikeGeo = new THREE.ConeGeometry(spikeRadius, spikeH, 4);

          const stepX = Math.max(0.6, col.width / Math.max(1, Math.round(col.width / 0.8)));
          const stepZ = Math.max(0.6, col.depth / Math.max(1, Math.round(col.depth / 0.8)));

          for (let sx = -col.width / 2 + stepX / 2; sx <= col.width / 2; sx += stepX) {
            for (let sz = -col.depth / 2 + stepZ / 2; sz <= col.depth / 2; sz += stepZ) {
              const spikeMesh = new THREE.Mesh(spikeGeo, hazardSpikeMat);
              spikeMesh.position.set(sx, -col.height / 2 + baseHeight + spikeH / 2, sz);
              spikeMesh.castShadow = !this.isSoftwareGl;
              hazardGroup.add(spikeMesh);
            }
          }
        } else if (hType === 'laser') {
          // Glowing laser beam core + outer glow sheath
          const beamGeo = new THREE.BoxGeometry(col.width, col.height * 0.6, col.depth * 0.6);
          const beamMesh = new THREE.Mesh(beamGeo, hazardLaserMat);
          hazardGroup.add(beamMesh);

          const glowGeo = new THREE.BoxGeometry(col.width * 1.02, col.height, col.depth);
          const glowMesh = new THREE.Mesh(glowGeo, hazardLaserGlowMat);
          hazardGroup.add(glowMesh);

          // Left and right emitter pylons
          const pylonW = Math.max(0.3, col.width * 0.08);
          const pylonH = col.height * 2.2;
          const pylonGeo = new THREE.BoxGeometry(pylonW, pylonH, col.depth * 1.8);

          const pylonL = new THREE.Mesh(pylonGeo, hazardPylonMat);
          pylonL.position.x = -col.width / 2;
          const pylonR = new THREE.Mesh(pylonGeo, hazardPylonMat);
          pylonR.position.x = col.width / 2;
          hazardGroup.add(pylonL, pylonR);
        } else if (hType === 'saw') {
          // High-speed rotating hazard saw blade
          const sawRadius = Math.max(col.width, col.height) / 2;
          const sawGeo = new THREE.CylinderGeometry(sawRadius, sawRadius, 0.08, 16);
          const sawMesh = new THREE.Mesh(sawGeo, hazardSawMat);
          sawMesh.rotation.x = Math.PI / 2;
          hazardGroup.add(sawMesh);

          // Center mechanical mounting hub
          const hubGeo = new THREE.CylinderGeometry(sawRadius * 0.35, sawRadius * 0.35, 0.12, 12);
          const hubMesh = new THREE.Mesh(hubGeo, hazardPylonMat);
          hubMesh.rotation.x = Math.PI / 2;
          hazardGroup.add(hubMesh);
        } else {
          // Fallback lethal hazard block
          const boxGeo = new THREE.BoxGeometry(col.width, col.height, col.depth);
          const boxMesh = new THREE.Mesh(boxGeo, hazardLaserMat);
          hazardGroup.add(boxMesh);
        }

        this.scene.add(hazardGroup);
        this.levelMeshes.set(col.id, hazardGroup);

        if (col.metadata?.moving || col.metadata?.rotating) {
          this.movingMeshes.push({
            id: col.id,
            mesh: hazardGroup,
            collider: col,
            origin: { x: col.x, y: col.y, z: col.z },
          });
        }
        return;
      }

      const geo = new THREE.BoxGeometry(col.width, col.height, col.depth);

      let mat: THREE.Material;
      if (col.type === 'bounce') {
        mat = bounceMat;
      } else if (col.type === 'wall' && col.color === '#f97316') {
        mat = wallRunMat;
      } else if (col.type === 'obstacle') {
        mat = obstacleMat;
      } else if (col.type === 'checkpoint') {
        // Glowing checkpoint gate arch
        mat = new THREE.MeshBasicMaterial({ color: '#10b981', wireframe: true });
      } else if (col.type === 'finish') {
        // Grand finish portal
        mat = new THREE.MeshBasicMaterial({ color: '#06b6d4', wireframe: true });
      } else {
        mat = col.color
          ? new THREE.MeshStandardMaterial({ color: col.color, roughness: 0.45, metalness: 0.05 })
          : groundMat;
      }

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(col.x, col.y, col.z);
      if (col.type !== 'checkpoint' && col.type !== 'finish') {
        mesh.receiveShadow = !this.isSoftwareGl;
        mesh.castShadow = !this.isSoftwareGl;

        // Subtle architectural edge accent for minimalist depth
        if (col.type === 'ground' || col.type === 'wall') {
          const edgeGeo = new THREE.EdgesGeometry(geo);
          const edgeMat = new THREE.LineBasicMaterial({
            color: col.type === 'wall' && col.color === '#f97316' ? '#fdba74' : '#64748b',
            transparent: true,
            opacity: 0.35,
          });
          const wire = new THREE.LineSegments(edgeGeo, edgeMat);
          mesh.add(wire);
        }
      }

      this.scene.add(mesh);
      this.levelMeshes.set(col.id, mesh);

      if (col.metadata?.moving || col.metadata?.rotating) {
        this.movingMeshes.push({
          id: col.id,
          mesh,
          collider: col,
          origin: { x: col.x, y: col.y, z: col.z },
        });
      }
    });
  }

  /**
   * Updates animated level elements like moving platforms and rotating hazard traps
   */
  public updateAnimatedPlatforms(time: number) {
    this.movingMeshes.forEach((item) => {
      const mov = item.collider.metadata?.moving;
      if (mov) {
        const offset = Math.sin(time * mov.speed) * (mov.distance / 2);
        if (mov.axis === 'x') {
          item.mesh.position.x = item.origin.x + offset;
          item.collider.x = item.mesh.position.x;
        } else if (mov.axis === 'y') {
          item.mesh.position.y = item.origin.y + offset;
          item.collider.y = item.mesh.position.y;
        } else if (mov.axis === 'z') {
          item.mesh.position.z = item.origin.z + offset;
          item.collider.z = item.mesh.position.z;
        }
      }

      const rot = item.collider.metadata?.rotating;
      if (rot) {
        item.mesh.rotation[rot.axis] += rot.speed * 0.016;
      }
    });
  }

  /**
   * Updates player 3D avatar pose, rotation, and animation
   */
  public updatePlayerMesh(player: PlayerPhysicsState, time: number) {
    this.playerGroup.position.set(player.position.x, player.position.y, player.position.z);
    this.playerGroup.rotation.y = player.rotation.yaw;

    // Always third person view - runner avatar is fully visible
    this.cameraMode = 'third_person';
    this.playerGroup.visible = true;

    // Dynamic height scaling during slide
    const targetScaleY = player.isSliding ? 0.55 : 1.0;
    this.playerGroup.scale.y = THREE.MathUtils.damp(this.playerGroup.scale.y, targetScaleY, 15, 0.016);

    const isMoving = player.speed > 0.5 && player.isGrounded && !player.isSliding;
    const runFreq = player.speed * 1.5;

    // Dynamic animation states
    if (player.isSliding) {
      // Slide pose: lean backward, legs extended forward, arms balancing
      this.innerBodyGroup.rotation.x = THREE.MathUtils.damp(this.innerBodyGroup.rotation.x, -0.45, 12, 0.016);
      this.leftLegGroup.rotation.x = -1.2;
      this.rightLegGroup.rotation.x = -1.0;
      this.leftArmGroup.rotation.x = 0.5;
      this.rightArmGroup.rotation.x = 0.5;
      this.thrusterLMesh.visible = false;
      this.thrusterRMesh.visible = false;
      this.doubleJumpFlipProgress = 0;
    } else if (!player.isGrounded) {
      // In-air jumps & aerial acrobatics
      this.thrusterLMesh.visible = true;
      this.thrusterRMesh.visible = true;

      if (player.currentAction === 'double_jumping') {
        // Fast acrobatic front-flip!
        this.doubleJumpFlipProgress = Math.min(Math.PI * 2, this.doubleJumpFlipProgress + 0.016 * 16);
        this.innerBodyGroup.rotation.x = -this.doubleJumpFlipProgress;
        this.thrusterLMesh.scale.set(1.8, 2.8, 1.8);
        this.thrusterRMesh.scale.set(1.8, 2.8, 1.8);
      } else {
        // Standard jump: tuck legs and balance arms
        this.doubleJumpFlipProgress = 0;
        this.innerBodyGroup.rotation.x = THREE.MathUtils.damp(this.innerBodyGroup.rotation.x, 0.15, 10, 0.016);
        this.leftArmGroup.rotation.x = -0.5;
        this.rightArmGroup.rotation.x = -0.5;
        this.leftLegGroup.rotation.x = -0.3;
        this.rightLegGroup.rotation.x = 0.2;
        this.thrusterLMesh.scale.set(1.0, 1.4, 1.0);
        this.thrusterRMesh.scale.set(1.0, 1.4, 1.0);
      }
    } else {
      // Ground movement & running
      this.doubleJumpFlipProgress = 0;
      this.thrusterLMesh.visible = false;
      this.thrusterRMesh.visible = false;

      // Athletic torso bounce and forward stride lean
      const torsoBounce = isMoving ? Math.abs(Math.sin(time * runFreq)) * 0.05 : 0;
      this.innerBodyGroup.position.y = THREE.MathUtils.damp(this.innerBodyGroup.position.y, torsoBounce, 15, 0.016);
      const forwardLean = isMoving ? 0.14 : 0;
      this.innerBodyGroup.rotation.x = THREE.MathUtils.damp(this.innerBodyGroup.rotation.x, forwardLean, 10, 0.016);

      // Arm & leg swing
      const armSwing = isMoving ? Math.sin(time * runFreq) * 0.8 : 0;
      const legSwing = isMoving ? Math.sin(time * runFreq) * 0.9 : 0;

      this.leftArmGroup.rotation.x = armSwing;
      this.rightArmGroup.rotation.x = -armSwing;
      this.leftLegGroup.rotation.x = -legSwing;
      this.rightLegGroup.rotation.x = legSwing;
    }

    // Wall run body lean
    if (player.isWallRunning) {
      const tilt = player.wallRunSide === 'left' ? -0.4 : 0.4;
      this.playerGroup.rotation.z = THREE.MathUtils.damp(this.playerGroup.rotation.z, tilt, 14, 0.016);
    } else {
      this.playerGroup.rotation.z = THREE.MathUtils.damp(this.playerGroup.rotation.z, 0, 10, 0.016);
    }

    // Speed lines
    const isHighSpeed = player.speed > 16 || player.isDashing;
    this.speedLines.visible = isHighSpeed;
    if (isHighSpeed) {
      this.speedLines.position.copy(this.camera.position);
      this.speedLines.quaternion.copy(this.camera.quaternion);
      const lineMat = this.speedLines.material as THREE.LineBasicMaterial;
      lineMat.opacity = Math.min((player.speed - 16) / 10, 0.6);
    }
  }

  /**
   * Smoothly updates camera position and look target in 3rd person chase view
   */
  public updateCamera(player: PlayerPhysicsState, dt: number) {
    if (this.isTitleScreen) {
      // Cinematic orbital flyover around start area showcasing the runner
      this.titleFlyTime += dt * 0.45;
      const r = 16;
      this.camera.position.set(
        Math.sin(this.titleFlyTime) * r,
        7 + Math.cos(this.titleFlyTime * 0.6) * 2,
        Math.cos(this.titleFlyTime) * r - 12
      );
      this.camera.lookAt(player.position.x, player.position.y + 1.2, player.position.z);
      return;
    }

    const yaw = player.rotation.yaw;
    const pitch = player.rotation.pitch;

    // Cinematic, athletic third-person chase camera (Camera số 3)
    const camDist = player.isSliding ? 3.8 : 4.8;
    const camHeight = player.isSliding ? 1.4 : 2.1;

    const backX = Math.sin(yaw) * Math.cos(pitch) * camDist;
    const backY = camHeight - Math.sin(pitch) * camDist;
    const backZ = Math.cos(yaw) * Math.cos(pitch) * camDist;

    _targetCamPos.set(
      player.position.x + backX,
      player.position.y + backY,
      player.position.z + backZ
    );

    // Camera target directly centered on character's core (chuột cố định ở giữa nhân vật)
    _targetLookAt.set(
      player.position.x,
      player.position.y + (player.isSliding ? 0.6 : 1.05),
      player.position.z
    );

    // Exponential damping
    const dampFactor = 1 - Math.exp(-20 * dt);
    this.currentCamPos.lerp(_targetCamPos, dampFactor);
    this.currentLookAt.lerp(_targetLookAt, dampFactor);

    this.camera.position.copy(this.currentCamPos);
    this.camera.lookAt(this.currentLookAt);

    // Dynamic FOV based on speed
    const targetFov = this.cameraFovBase + Math.min(player.speed * 0.8, 16);
    this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 6, dt);
    this.camera.updateProjectionMatrix();

    // Update jump rings
    this.updateJumpRings(dt);
  }

  private jumpRings: { mesh: THREE.Mesh; life: number; maxLife: number }[] = [];

  public spawnDoubleJumpRing(pos: Vector3D) {
    const ringGeo = new THREE.RingGeometry(0.2, 0.55, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: '#38bdf8',
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(ringGeo, ringMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(pos.x, pos.y + 0.1, pos.z);
    this.scene.add(mesh);
    this.jumpRings.push({ mesh, life: 0.28, maxLife: 0.28 });
  }

  private updateJumpRings(dt: number) {
    for (let i = this.jumpRings.length - 1; i >= 0; i--) {
      const item = this.jumpRings[i];
      item.life -= dt;
      const progress = 1 - item.life / item.maxLife;
      const scale = 1 + progress * 2.2;
      item.mesh.scale.set(scale, scale, scale);
      const mat = item.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, (item.life / item.maxLife) * 0.85);

      if (item.life <= 0) {
        this.scene.remove(item.mesh);
        item.mesh.geometry.dispose();
        mat.dispose();
        this.jumpRings.splice(i, 1);
      }
    }
  }

  public render() {
    this.renderer.render(this.scene, this.camera);
  }

  private onResize = () => {
    if (!this.container || this.isDestroyed) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  public destroy() {
    this.isDestroyed = true;
    window.removeEventListener('resize', this.onResize);
    cancelAnimationFrame(this.frameId);
    this.renderer.dispose();
  }
}
