// Strict, shallow schema checks run before any worker structured clone.
// Unknown nested input is rejected without recursive traversal.
const encoder = new TextEncoder();
function plain(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function fields(value, allowed, label) {
  if (!plain(value)) throw new Error(`${label} must be a JSON object.`);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`${label}: unknown field ${key.slice(0, 80)}.`);
}
function bounded(value, max, label) {
  if (typeof value !== 'string' || !value.length || encoder.encode(value).length > max || /[\u0000-\u001f\u007f-\u009f]/u.test(value)) throw new Error(`${label} must be nonempty text up to ${max} UTF-8 bytes, without control characters.`);
}
function optional(value, check) { if (value !== null && value !== undefined) check(value); }
export function validateManifest(manifest) {
  fields(manifest, ['schema_version', 'label', 'completeness', 'records'], 'Manifest');
  if (manifest.schema_version !== 1) throw new Error('Unsupported schema_version. Expected 1.');
  bounded(manifest.label, 100, 'Manifest label');
  if (!['unknown', 'partial', 'supplied_export'].includes(manifest.completeness)) throw new Error('Completeness must be unknown, partial, or supplied_export.');
  if (!Array.isArray(manifest.records) || manifest.records.length > 2000) throw new Error('A manifest must have an array of at most 2,000 records.');
  const ids = new Set();
  for (const record of manifest.records) {
    fields(record, ['id', 'path', 'size', 'sha256', 'path_hash', 'kind', 'original_id', 'albums', 'metadata'], 'Record');
    bounded(record.id, 128, 'Record ID');
    if (ids.has(record.id)) throw new Error('Record IDs must be unique.');
    ids.add(record.id);
    bounded(record.path, 512, 'Record path');
    if (record.path.startsWith('/') || record.path.includes('\\') || record.path.split('/').some(p => !p || p === '.' || p === '..')) throw new Error('Use a relative forward-slash path without traversal or empty segments.');
    if (!['original', 'edited', 'unknown'].includes(record.kind)) throw new Error('Record kind must be original, edited, or unknown.');
    optional(record.size, size => { if (!Number.isSafeInteger(size) || size < 0) throw new Error('Record size must be a nonnegative safe integer or null.'); });
    optional(record.sha256, hash => { if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/i.test(hash)) throw new Error('SHA-256 must be 64 hexadecimal characters.'); });
    optional(record.path_hash, hash => bounded(hash, 128, 'Path hash'));
    optional(record.original_id, id => { bounded(id, 128, 'Original ID'); if (id === record.id) throw new Error('A record cannot reference itself as its original.'); });
    optional(record.albums, albums => {
      if (!Array.isArray(albums) || albums.length > 64) throw new Error('Albums must be an array with at most 64 entries.');
      for (const album of albums) bounded(album, 128, 'Album');
      if (new Set(albums).size !== albums.length) throw new Error('Album names must be unique.');
    });
    optional(record.metadata, metadata => {
      if (!plain(metadata) || Object.keys(metadata).length > 32) throw new Error('Metadata must be an object with at most 32 text fields.');
      for (const [key, value] of Object.entries(metadata)) { bounded(key, 64, 'Metadata key'); bounded(value, 512, 'Metadata value'); }
    });
  }
  return manifest;
}
export function validateFiles(files) {
  if (!Array.isArray(files) || !files.length || files.length > 100) throw new Error('Select between 1 and 100 files per side.');
  let total = 0;
  for (const file of files) {
    if (!file || !Number.isSafeInteger(file.size) || file.size < 0 || file.size > 32 * 1024 * 1024) throw new Error('Each local file must be 32 MiB or smaller.');
    bounded(file.name, 512, 'File name');
    if (['.', '..'].includes(file.name) || /[/\\]/.test(file.name)) throw new Error('Select files with valid plain file names.');
    total += file.size;
  }
  if (total > 256 * 1024 * 1024) throw new Error('Selected files exceed 256 MiB for this side.');
}
export function validateInput(input) {
  if (!input || !['files', 'manifest', 'sample'].includes(input.mode)) throw new Error('Choose a valid source and destination first.');
  if (input.mode === 'files') validateFiles(input.files); else validateManifest(input.manifest);
}
