import { writeFileSync, mkdirSync, existsSync } from 'fs';

const buildId = Date.now().toString();

if (!existsSync('public')) mkdirSync('public');
writeFileSync('public/version.json', JSON.stringify({ buildId }));
writeFileSync('.build-id', buildId);

console.log(`[gen-version] build id: ${buildId}`);
