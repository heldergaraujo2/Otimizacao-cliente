/**
 * three.js renderer for the resource pipeline.
 *
 * The renderer is data-driven on purpose: it receives parsed ATT/MAP/OBJ/BMD structures (from
 * `mu-formats`), never files, so the *same* code renders generated fixtures in this environment and
 * the user's real data through the gateway asset route (`src/browser/resources.ts`). Nothing in here
 * knows about the network or the filesystem.
 */

import * as THREE from 'three';

import {
  extractMeshGeometry,
  TwFlags,
  type AttData,
  type BmdModel,
  type MapData,
  type MeshGeometry,
  type ObjData,
} from '@mu-reengineer/formats';

export interface RendererOptions {
  canvas: HTMLCanvasElement;
  /** Tile span rendered around the map centre (the maps are 256x256 tiles). */
  tileSpan: number;
}

export interface CharacterView {
  id: number;
  mesh: THREE.Object3D;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
}

export interface RendererStats {
  width: number;
  height: number;
  waterTiles: number;
  safeTiles: number;
  objects: number;
  meshVertices: number;
  meshTriangles: number;
  terrainSource: string;
}

const TILE_COLOR: Record<string, number> = {
  ground: 0x4a5d3a,
  water: 0x2b5d8a,
  noGround: 0x2f2f2f,
  safe: 0x6b7f4a,
};

export class MuRenderer {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly stats: RendererStats = {
    width: 0,
    height: 0,
    waterTiles: 0,
    safeTiles: 0,
    objects: 0,
    meshVertices: 0,
    meshTriangles: 0,
    terrainSource: 'none',
  };

  private readonly renderer: THREE.WebGLRenderer;
  private readonly characterRoot = new THREE.Group();
  private readonly terrainRoot = new THREE.Group();
  private readonly characters = new Map<number, CharacterView>();
  private readonly clock = new THREE.Clock();
  private readonly tileSpan: number;
  private model?: BmdModel;
  private frames = 0;
  private lastFpsUpdate = 0;
  private fps = 0;

  constructor(options: RendererOptions) {
    this.tileSpan = options.tileSpan;
    this.renderer = new THREE.WebGLRenderer({ canvas: options.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 2000);

    this.scene.background = new THREE.Color(0x0d1117);
    this.scene.fog = new THREE.Fog(0x0d1117, 60, 180);
    this.scene.add(new THREE.HemisphereLight(0xf0f6ff, 0x2a2c1f, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(60, 120, 40);
    this.scene.add(sun);
    this.scene.add(this.terrainRoot);
    this.scene.add(this.characterRoot);
  }

  /** Rebuilds terrain + objects from parsed data. Safe to call again (map change / new data). */
  setTerrain(att: AttData, map: MapData, obj: ObjData, source: string): void {
    this.terrainRoot.clear();
    this.stats.terrainSource = source;
    this.stats.width = att.width + 1; // the format stores the count minus one (see mu-formats)
    this.stats.height = att.height + 1;
    this.stats.objects = obj.objects.length;
    this.stats.waterTiles = 0;
    this.stats.safeTiles = 0;

    const span = Math.min(this.tileSpan, this.stats.width);
    const offset = Math.floor((this.stats.width - span) / 2);

    // One segment per tile gives (span+1)^2 vertices; rotateX(-PI/2) puts the plane on the XZ ground
    // with the front face up, so vertex (ix, iy) lands on tile (offset+ix, offset+iy) when the mesh is
    // centred on the sampled window.
    const geometry = new THREE.PlaneGeometry(span, span, span, span);
    geometry.rotateX(-Math.PI / 2);

    const colors = new Float32Array(geometry.attributes.position!.count * 3);
    const color = new THREE.Color();
    for (let i = 0; i < geometry.attributes.position!.count; i++) {
      const ix = i % (span + 1);
      const iy = Math.floor(i / (span + 1));
      const tileIndex = (offset + Math.min(iy, this.stats.height - 1)) * this.stats.width + (offset + Math.min(ix, this.stats.width - 1));
      const flags = att.attributes[tileIndex] ?? 0;
      if (flags & TwFlags.Water) {
        this.stats.waterTiles += 1;
        color.setHex(TILE_COLOR.water!);
      } else if (flags & TwFlags.NoGround) {
        color.setHex(TILE_COLOR.noGround!);
      } else if (flags & TwFlags.SafeZone) {
        this.stats.safeTiles += 1;
        color.setHex(TILE_COLOR.safe!);
      } else {
        color.setHex(TILE_COLOR.ground!);
      }
      // shading from the texture indices so both MAP layers are visible in the palette
      const textureIndex = (map.layer1[tileIndex] ?? 0) + (map.layer2[tileIndex] ?? 0);
      color.multiplyScalar(0.75 + ((textureIndex % 8) / 8) * 0.5);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const terrain = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0.05 }),
    );
    terrain.name = 'terrain';
    terrain.position.set(offset + span / 2, 0, offset + span / 2);
    this.terrainRoot.add(terrain);

    // objects from the OBJ record list (positions are tile coordinates, z is height)
    const objectMaterial = new THREE.MeshStandardMaterial({ color: 0x8a6f4e, roughness: 0.8 });
    for (const record of obj.objects) {
      const height = Math.max(0.5, record.scale);
      const box = new THREE.Mesh(new THREE.BoxGeometry(record.scale, height, record.scale), objectMaterial);
      box.position.set(record.position.x, height / 2 + (record.position.z ?? 0), record.position.y);
      box.rotation.y = record.angle.z;
      this.terrainRoot.add(box);
    }
  }

  /** Sets the model used for every character (rebuilds the meshes of characters already in the scene). */
  setCharacterModel(model: BmdModel): void {
    this.model = model;
    for (const view of this.characters.values()) {
      view.mesh.remove(...view.mesh.children.filter((child) => child.name === 'model'));
      view.mesh.add(this.buildCharacterMesh());
    }
  }

  /** Creates (or updates) the visual representation of a character. */
  addCharacter(id: number, name: string, x: number, y: number): CharacterView {
    const existing = this.characters.get(id);
    if (existing) {
      existing.targetX = x;
      existing.targetY = y;
      return existing;
    }

    const group = new THREE.Group();
    group.name = `character-${name}`;
    group.add(this.buildCharacterMesh());

    const marker = new THREE.Mesh(new THREE.SphereGeometry(0.18), new THREE.MeshStandardMaterial({ color: 0x66ccff }));
    marker.name = 'marker';
    marker.position.set(0, 2.1, 0);
    group.add(marker);

    const view: CharacterView = { id, mesh: group, x, y, targetX: x, targetY: y };
    group.position.set(x, 0, y);
    this.characterRoot.add(group);
    this.characters.set(id, view);
    return view;
  }

  removeCharacter(id: number): void {
    const view = this.characters.get(id);
    if (!view) return;
    this.characterRoot.remove(view.mesh);
    this.characters.delete(id);
  }

  setTarget(id: number, x: number, y: number): void {
    const view = this.characters.get(id);
    if (!view) return;
    view.targetX = x;
    view.targetY = y;
  }

  getCharacter(id: number): CharacterView | undefined {
    return this.characters.get(id);
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  get currentFps(): number {
    return this.fps;
  }

  /** Renders one frame: smoothing, camera follow and the FPS meter. */
  render(focus: { x: number; y: number }): void {
    const delta = this.clock.getDelta();
    for (const view of this.characters.values()) {
      const step = Math.min(1, delta * 12);
      view.x += (view.targetX - view.x) * step;
      view.y += (view.targetY - view.y) * step;
      view.mesh.position.set(view.x, 0, view.y);
    }

    this.camera.position.set(focus.x - 18, 26, focus.y + 24);
    this.camera.lookAt(focus.x, 0, focus.y);
    this.renderer.render(this.scene, this.camera);

    this.frames += 1;
    const now = performance.now();
    if (now - this.lastFpsUpdate >= 500) {
      this.fps = Math.round((this.frames * 1000) / (now - this.lastFpsUpdate));
      this.frames = 0;
      this.lastFpsUpdate = now;
    }
  }

  private buildCharacterMesh(): THREE.Object3D {
    if (!this.model || this.model.meshes.length === 0) {
      const capsule = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.4, 1.2),
        new THREE.MeshStandardMaterial({ color: 0xd0a070, name: 'placeholder' }),
      );
      capsule.name = 'model';
      return capsule;
    }
    const geometry: MeshGeometry = extractMeshGeometry(this.model.meshes[0]!);
    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute('position', new THREE.BufferAttribute(geometry.positions, 3));
    buffer.setAttribute('uv', new THREE.BufferAttribute(geometry.uvs, 2));
    buffer.computeVertexNormals(); // skinning/animation is not wired yet, so bind-pose normals are fine

    const mesh = new THREE.Mesh(
      buffer,
      new THREE.MeshStandardMaterial({ color: 0xcfcfd8, roughness: 0.6, metalness: 0.15, flatShading: true }),
    );
    mesh.name = 'model';
    this.stats.meshVertices = geometry.vertexCount;
    this.stats.meshTriangles = geometry.triangleCount;
    return mesh;
  }
}
