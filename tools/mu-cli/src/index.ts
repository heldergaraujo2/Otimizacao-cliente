#!/usr/bin/env node
/**
 * MU-REENGINEER CLI.
 *
 * Commands are intentionally small and composable; every reader comes from the workspace packages so
 * the tool and the automated tests can never disagree. Nothing here ships or copies game data: files
 * are read from wherever the user points the tool.
 */

import { formatInspection, inspectFile } from './commands/inspect.js';
import { formatFixtures, generateFixtures } from './commands/fixtures.js';
import { formatDecodedPacket, decodePacketHex } from './commands/packets.js';
import { formatScanReport, scanDirectory } from './commands/scan.js';
import { formatExport, exportTexture } from './commands/textures.js';
import { exportObj, formatExportObj } from './commands/obj.js';

const HELP = `mu-cli — MU-REENGINEER resource and protocol tool

Usage:
  mu-cli inspect <file> [--json]                 identify a file and summarise its structure
  mu-cli export-png <file> <out.png>             decode a texture to PNG (OZJ → embedded .jpg)
  mu-cli export-obj <file.bmd> <out.obj> [--action N --key K]
                                                 write a BMD mesh as Wavefront OBJ (optionally
                                                 skinned/baked at an animation key)
  mu-cli scan <dir> [--json] [--limit N]         classify a whole data directory (real-data report)
  mu-cli gen-fixtures --out <dir> [--json]       write and re-parse the deterministic fixtures
  mu-cli decode-packet <hex> [--direction c2s|s2c] [--xor32]
                                                 explain a raw MU packet (framing + ciphers)
  mu-cli --help | --version

Options:
  --json            machine-readable output
  --limit N         stop after N files (scan)
  --direction       packet travel direction: c2s = client sent it (default), s2c = server sent it
  --action N        animation action index (export-obj)
  --key K           animation key/time within the action (export-obj, fractional allowed)
  --xor32           apply the XOR32 stream mask before decrypting the packet

Environment:
  MU_REENGINEER_DATA   optional root of your own game data; never read automatically, only used by
                       commands you run explicitly.
`;

interface ParsedArgs {
  command?: string;
  positionals: string[];
  flags: Map<string, string | true>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags = new Map<string, string | true>();
  const valueFlags = new Set(['out', 'limit', 'direction', 'action', 'key']);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg.startsWith('--')) {
      const name = arg.slice(2);
      if (valueFlags.has(name)) {
        const value = argv[i + 1];
        if (value === undefined) throw new Error(`--${name} requires a value`);
        flags.set(name, value);
        i += 1;
      } else {
        flags.set(name, true);
      }
    } else {
      positionals.push(arg);
    }
  }
  return { command: positionals.shift(), positionals, flags };
}

function print(lines: string[]): void {
  process.stdout.write(`${lines.join('\n')}\n`);
}

async function main(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  if (args.command === undefined || args.flags.has('help') || args.command === 'help') {
    process.stdout.write(HELP);
    return 0;
  }
  if (args.command === 'version' || args.flags.has('version')) {
    process.stdout.write('mu-cli 0.1.0 (MU-REENGINEER)\n');
    return 0;
  }

  const asJson = args.flags.has('json');

  switch (args.command) {
    case 'inspect': {
      const file = args.positionals[0];
      if (!file) throw new Error('inspect requires a file path');
      const result = await inspectFile(file);
      print(asJson ? [JSON.stringify(result, null, 2)] : formatInspection(result));
      return result.format === 'unknown' ? 2 : 0;
    }

    case 'export-png': {
      const [source, output] = args.positionals;
      if (!source || !output) throw new Error('export-png requires <file> and <out.png>');
      const result = await exportTexture(source, output);
      print(asJson ? [JSON.stringify(result, null, 2)] : formatExport(result));
      return 0;
    }

    case 'export-obj': {
      const [source, output] = args.positionals;
      if (!source || !output) throw new Error('export-obj requires <file.bmd> and <out.obj>');
      const action = args.flags.get('action');
      const key = args.flags.get('key');
      const result = await exportObj(source, output, {
        action: typeof action === 'string' ? Number.parseInt(action, 10) : undefined,
        key: typeof key === 'string' ? Number.parseFloat(key) : undefined,
      });
      print(asJson ? [JSON.stringify(result, null, 2)] : formatExportObj(result));
      return 0;
    }

    case 'scan': {
      const dir = args.positionals[0];
      if (!dir) throw new Error('scan requires a directory');
      const limit = args.flags.get('limit');
      const report = await scanDirectory(dir, {
        limit: typeof limit === 'string' ? Number.parseInt(limit, 10) : undefined,
      });
      print(asJson ? [JSON.stringify(report, null, 2)] : formatScanReport(report));
      return report.scanned > 0 && report.ok === 0 ? 2 : 0;
    }

    case 'gen-fixtures': {
      const out = args.flags.get('out');
      if (typeof out !== 'string') throw new Error('gen-fixtures requires --out <dir>');
      const result = await generateFixtures(out);
      print(asJson ? [JSON.stringify(result, null, 2)] : formatFixtures(result));
      return result.ok ? 0 : 1;
    }

    case 'decode-packet': {
      const hex = args.positionals[0];
      if (!hex) throw new Error('decode-packet requires a hex string');
      const direction = args.flags.get('direction');
      const result = decodePacketHex(hex, {
        direction: direction === 's2c' ? 's2c' : 'c2s',
        xor32: args.flags.has('xor32'),
      });
      print(asJson ? [JSON.stringify(result, null, 2)] : formatDecodedPacket(result));
      return result.errors.length > 0 ? 2 : 0;
    }

    default:
      process.stderr.write(`unknown command '${args.command}'\n\n${HELP}`);
      return 2;
  }
}

const isDirectRun = process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href;

if (isDirectRun || process.env.MU_CLI_FORCE_RUN === '1') {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      process.stderr.write(`error: ${(error as Error).message}\n`);
      process.exitCode = 1;
    });
}

export { main };
