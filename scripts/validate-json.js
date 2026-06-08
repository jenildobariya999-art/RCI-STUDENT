const fs = require('fs');

const files = ['package.json', 'package-lock.json', 'vercel.json'];
let failed = false;

for (const file of files) {
  try {
    JSON.parse(fs.readFileSync(file, 'utf8'));
    console.log(`OK ${file}`);
  } catch (error) {
    failed = true;
    console.error(`Invalid JSON in ${file}: ${error.message}`);
  }
}

if (failed) process.exit(1);
