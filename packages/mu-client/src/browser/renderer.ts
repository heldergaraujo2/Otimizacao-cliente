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
  bmdEulerToQuaternion,
  computeBoneWorldMatrices,
  extractMeshGeometry,
  sampleBoneTransform,
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
  /** Animation speed in keys per second when playing a clip (default 8). */
  keysPerSecond?: number;
}

/** One playable animation state (a BMD action index plus its playhead). */
export interface AnimationState {
  action: number;
  key: number;
  keysPerSecond: number;
  playing: boolean;
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
  bones: number;
  actions: number;
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
    bones: 0,
    actions: 0,
    terrainSource: 'none',
  };

  private readonly renderer: THREE.WebGLRenderer;
  private readonly characterRoot = new THREE.Group();
  private readonly terrainRoot = new THREE.Group();
  private readonly characters = new Map<number, CharacterView>();
  private readonly clock = new THREE.Clock();
  private readonly tileSpan: number;
  private model?: BmdModel;
  private skinnedRoot?: THREE.Object3D;
  private bones: THREE.Bone[] = [];
  private actionsPerSecond = 8;
  readonly animation: AnimationState = { action: 0, key: 0, keysPerSecond: 8, playing: true };
  private frames = 0;
  private lastFpsUpdate = 0;
  private fps = 0;

  constructor(options: RendererOptions) {
    this.tileSpan = options.tileSpan;
    this.actionsPerSecond = options.keysPerSecond ?? 8;
    this.animation.keysPerSecond = this.actionsPerSecond;
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

  /**
   * Sets the model used for every character. Existing characters are rebuilt, so the call is safe at
   * any time (for example after the real model arrives from the gateway).
   */
  setCharacterModel(model: BmdModel): void {
    this.model = model;
    this.animation.action = 0;
    this.animation.key = 0;
    this.skinnedRoot = this.buildCharacterModel();
    for (const view of this.characters.values()) {
      view.mesh.remove(...view.mesh.children.filter((child) => child.name === 'model'));
      view.mesh.add(this.buildCharacterModel());
    }
  }

  get modelSummary(): { name: string; meshes: number; bones: number; actions: number; keys: number } | undefined {
    if (!this.model) return undefined;
    return {
      name: this.model.name,
      meshes: this.model.meshes.length,
      bones: this.model.bones.length,
      actions: this.model.actions.length,
      keys: this.model.actions[this.animation.action]?.numAnimationKeys ?? 0,
    };
  }

  /** Switches the clip played by every character (BMD actions are unnamed, so this is by index). */
  setAction(action: number): void {
    if (!this.model || action < 0 || action >= this.model.actions.length) return;
    if (this.animation.action === action) return;
    this.animation.action = action;
    this.animation.key = 0;
  }

  /**
   * Advances the animation playhead and re-poses every skinned character.
   *
   * MU models store vertices in bone space, so a bone's *world* matrix is exactly the matrix the skin
   * shader needs: the mesh is bound with identity bind matrices and the GPU applies the same matrices
   * the CPU implementation in `mu-formats` (tested) computes.
   */
  private updateAnimation(delta: number): void {
    if (!this.model) return;
    const action = this.model.actions[this.animation.action];
    if (!action || action.numAnimationKeys === 0) return;

    if (this.animation.playing) {
      const keys = action.numAnimationKeys;
      this.animation.key = (this.animation.key + delta * this.animation.keysPerSecond) % keys;
    }
    const matrices = computeBoneWorldMatrices(this.model, this.animation.action, this.animation.key);

    for (let i = 0; i < this.bones.length; i++) {
      const bone = this.bones[i]!;
      const sample = sampleBoneTransform(this.model, i, this.animation.action, this.animation.key);
      const quaternion = bmdEulerToQuaternion(sample.rotation);
      bone.position.set(sample.position.x, sample.position.y, sample.position.z);
      bone.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
      bone.matrix.fromArray(matrices.subarray(i * 16, i * 16 + 16) as Float32Array);
    }
    // the engine still needs consistent world matrices for culling and the shader
    this.skinnedRoot?.updateMatrixWorld(true);
    for (const view of this.characters.values()) view.mesh.updateMatrixWorld(true);
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
    group.add(this.buildCharacterModel());

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
    this.updateAnimation(delta);
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

  /**
   * Builds the visual for one character: a skinned mesh with the model's bone hierarchy, or a capsule
   * placeholder when no model is loaded yet.
   */
  private buildCharacterModel(): THREE.Object3D {
    const model = this.model;
    if (!model || model.meshes.length === 0) {
      const capsule = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.4, 1.2),
        new THREE.MeshStandardMaterial({ color: 0xd0a070 }),
      );
      capsule.name = 'model';
      // the placeholder is authored in the same Z-up space as the models
      capsule.rotation.x = -Math.PI / 2;
      return capsule;
    }

    const root = new THREE.Group();
    root.name = 'model';

    // bone hierarchy from the BMD bone list (parents come first in the format)
    const bones: THREE.Bone[] = model.bones.map((bone) => {
      const node = new THREE.Bone();
      node.name = bone.name;
      return node;
    });
    for (let i = 0; i < bones.length; i++) {
      const parent = model.bones[i]!.parent;
      if (parent >= 0 && parent < bones.length && parent !== i) bones[parent]!.add(bones[i]!);
    }
    const skeleton = new THREE.Skeleton(bones, bones.map(() => new THREE.Matrix4()));
    // vertices are stored in bone space: the bind matrices are the identity, so the shader applies the
    // animated bone matrices directly (same maths as the tested CPU skinning)
    const identity = new THREE.Matrix4();
    skeleton.calculateInverses();
    for (const inverse of skeleton.boneInverses) inverse.identity();

    const mesh = model.meshes[0]!;
    const geometry = extractMeshGeometry(mesh);
    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute('position', new THREE.BufferAttribute(geometry.positions, 3));
    buffer.setAttribute('normal', new THREE.BufferAttribute(geometry.normals, 3));
    buffer.setAttribute('uv', new THREE.BufferAttribute(geometry.uvs, 2));
    buffer.setAttribute('skinIndex', new THREE.BufferAttribute(geometry.skinIndices, 1));
    buffer.setAttribute('skinWeight', new THREE.BufferAttribute(geometry.skinWeights, 1));
    buffer.setAttribute('color', new THREE.BufferAttribute(
      new Float32Array(geometry.vertexCount * 3).fill(1),
      3,
    ));

    const skinned = new THREE.SkinnedMesh(
      buffer,
      new THREE.MeshStandardMaterial({ color: 0xcfcfd8, roughness: 0.6, metalness: 0.15, flatShading: false }),
    );
    skinned.name = 'skin';
    skinned.add(bones[0]!);
    if (bones.length > 0) skinned.bind(skeleton, identity);

    // the BMD coordinate system is Z-up; three.js is Y-up
    root.rotation.x = -Math.PI / 2;
    root.add(skinned);

    this.stats.meshVertices = geometry.vertexCount;
    this.stats.meshTriangles = geometry.triangleCount;
    this.stats.bones = bones.length;
    this.stats.actions = model.actions.length;
    this.bones = bones;
    return root;
  }
}
