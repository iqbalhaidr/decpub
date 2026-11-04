import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { keccak256, toHex } from 'viem';
import { NotFoundException } from '@nestjs/common';

export const STORAGE_PATH = path.join(process.cwd(), 'storage', 'manuscripts');

export function ensureStorageExists() {
  if (!fs.existsSync(STORAGE_PATH)) {
    fs.mkdirSync(STORAGE_PATH, { recursive: true });
  }
}

export function getManifestPath(id: string, isAnon: boolean = false): string {
  const suffix = isAnon ? '-anon-manifest' : '-manifest';
  return path.join(STORAGE_PATH, `${id}${suffix}.json`);
}

export function getReportPath(id: string, type: 'anon' | 'check'): string {
  return path.join(STORAGE_PATH, `${id}-${type}-report.${type === 'anon' ? 'txt' : 'json'}`);
}

export function loadManifest(id: string, isAnon: boolean = false): any {
  const manifestPath = getManifestPath(id, isAnon);
  if (!fs.existsSync(manifestPath)) {
    throw new NotFoundException(`Manifest for manuscript ${id} not found`);
  }
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

export function loadFileBuffer(id: string, extension: string): Buffer {
  const filePath = path.join(STORAGE_PATH, `${id}${extension}`);
  if (!fs.existsSync(filePath)) {
    throw new NotFoundException(`File for manuscript ${id} not found`);
  }
  return fs.readFileSync(filePath);
}

export function generateFileHash(buffer: Buffer): string {
  return '0x' + crypto.createHash('sha256').update(buffer).digest('hex');
}

export function generateMetadataHash(metadata: any): string {
  return keccak256(toHex(JSON.stringify(metadata)));
}
