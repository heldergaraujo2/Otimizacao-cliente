/**
 * `export-obj <file.bmd> <out.obj>`: writes a BMD mesh as Wavefront OBJ.
 *
 * Two modes, both useful in practice:
 *  - default: the mesh as stored (rest pose, i.e. what the file contains);
 *  - `--action N --key K`: the mesh after CPU skinning at that animation time, so an animation can be
 *    inspected in any 3D tool without the game.
 *
 * The output is deterministic (fixed decimal places, vertices in file order, one group per mesh), which
 * makes it diffable and testable. Materials are referenced by the texture paths stored in the model.
 */

import { parseBmd, skinMesh, type BmdMesh, type BmdModel } from '@mu-reengineer/formats';

import { readBytes, writeText } from '../fs-utils.js';

export interface ExportObjOptions {
  action?: number;
  key?: number;
}

export interface ExportObjResult {
  source: string;
  output: string;
  model: string;
  version: number;
  meshes: number;
  vertices: number;
  faces: number;
  bones: number;
  actions: number;
  skinned: boolean;
  bytes: number;
}

const DECIMALS = 6;

function formatNumber(value: number): string {
  // -0 would make the output non-deterministic between runs
  const normalised = Object.is(value, -0) ? 0 : value;
  const text = normalised.toFixed(DECIMALS);
  return text.includes('.') ? text.replace(/0+$/, '').replace(/\.$/, '') : text;
}

function pushVertex(lines: string[], x: number, y: number, z: number): void {
  lines.push(`v ${formatNumber(x)} ${formatNumber(y)} ${formatNumber(z)}`);
}

function meshCounters(mesh: BmdMesh): { corners: number } {
  return { corners: mesh.triangles.reduce((total, triangle) => total + triangle.polygon, 0) };
}

export async function exportObj(source: string, output: string, options: ExportObjOptions = {}): Promise<ExportObjResult> {
  const bytes = await readBytes(source);
  const model: BmdModel = parseBmd(bytes);
  const skinned = options.action !== undefined;
  const action = options.action ?? 0;
  const key = options.key ?? 0;

  if (skinned && (action < 0 || action >= model.actions.length)) {
    throw new Error(`action ${action} does not exist (the model has ${model.actions.length} actions)`);
  }

  const lines: string[] = [
    `# MU-REENGINEER mu-cli export-obj`,
    `# source: ${source}`,
    `# model: ${model.name} (BMD version ${model.version})`,
    `# bones: ${model.bones.length}, actions: ${model.actions.length}`,
  ];
  if (skinned) {
    lines.push(`# pose: action ${action} at key ${formatNumber(key)} (CPU skinning, ${model.actions[action]?.numAnimationKeys ?? 0} keys)`);
  } else {
    lines.push('# pose: as stored (no skinning)');
  }
  lines.push(`# coordinate system: as stored in the file (Z up)`);

  const textureNames: string[] = [];
  for (const mesh of model.meshes) {
    const name = mesh.texturePath.replace(/\\/g, '/');
    if (!textureNames.includes(name)) textureNames.push(name);
    lines.push(`mtllib ${name.split('/').pop() ?? 'texture'}`, `# mesh texture: ${name}`);
  }

  let vertexBase = 1;
  let faces = 0;
  let vertices = 0;
  for (let meshIndex = 0; meshIndex < model.meshes.length; meshIndex++) {
    const mesh = model.meshes[meshIndex]!;
    lines.push(`g mesh_${meshIndex}`);

    // vertex list: rest positions or skinned positions, in triangle-corner order
    if (skinned) {
      const result = skinMesh(model, mesh, action, key);
      const { corners } = meshCounters(mesh);
      for (let i = 0; i < corners; i++) {
        pushVertex(lines, result.positions[i * 3]!, result.positions[i * 3 + 1]!, result.positions[i * 3 + 2]!);
      }
      vertices += corners;
    } else {
      for (const triangle of mesh.triangles) {
        for (let corner = 0; corner < triangle.polygon; corner++) {
          const vertex = mesh.vertices[triangle.vertexIndex[corner]!]!;
          pushVertex(lines, vertex.position.x, vertex.position.y, vertex.position.z);
        }
      }
      vertices += meshCounters(mesh).corners;
    }

    // faces walk the same order, so indices are simply 1..N shifted by the global vertex base
    let local = 0;
    for (const triangle of mesh.triangles) {
      const indices: number[] = [];
      for (let corner = 0; corner < triangle.polygon; corner++) {
        indices.push(vertexBase + local + corner);
      }
      local += triangle.polygon;
      lines.push(`f ${indices.join(' ')}`);
      faces++;
    }
    vertexBase += local;
  }

  lines.push('');

  const text = lines.join('\n');
  await writeText(output, text);

  return {
    source,
    output,
    model: model.name,
    version: model.version,
    meshes: model.meshes.length,
    vertices,
    faces,
    bones: model.bones.length,
    actions: model.actions.length,
    skinned,
    bytes: Buffer.byteLength(text, 'utf8'),
  };
}

export function formatExportObj(result: ExportObjResult): string[] {
  return [
    `export-obj: ${result.source} -> ${result.output}`,
    `  model    : ${result.model} (BMD v${result.version})`,
    `  geometry : ${result.meshes} mesh(es), ${result.vertices} vertices, ${result.faces} faces`,
    `  skeleton : ${result.bones} bones, ${result.actions} actions`,
    `  pose     : ${result.skinned ? 'skinned (baked from the action/key given)' : 'as stored'}`,
    `  wrote    : ${result.bytes} bytes`,
  ];
}
