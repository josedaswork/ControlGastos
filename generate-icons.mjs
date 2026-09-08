import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.join(__dirname, 'scripts', 'generate_assets.py');

console.log('Generating all Android and Web assets...');
execSync(`python3 "${scriptPath}"`, { stdio: 'inherit' });

