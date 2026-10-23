import sharp from 'sharp';
const s = 'resources/icon.svg';
for (const n of [192, 512]) await sharp(s).resize(n, n).png().toFile(`public/icon-${n}.png`);
await sharp(s).resize(180, 180).png().toFile('public/apple-touch-icon.png');
await sharp(s).resize(1024, 1024).png().toFile('resources/icon.png');
// maskable: icon already full-bleed
await sharp(s).resize(512, 512).png().toFile('public/icon-maskable-512.png');
await sharp('resources/icon-fg.svg').resize(1024,1024).png().toFile('resources/icon-foreground.png');
await sharp({create:{width:1024,height:1024,channels:4,background:'#0d9488'}}).png().toFile('resources/icon-background.png');
// splash
const splash = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="2732" height="2732"><rect width="2732" height="2732" fill="#0f766e"/></svg>`);
const logo = await sharp('resources/icon-fg.svg').resize(900,900).png().toBuffer();
await sharp(splash).composite([{input: logo, gravity:'center'}]).png().toFile('resources/splash.png');
await sharp(splash).composite([{input: logo, gravity:'center'}]).png().toFile('resources/splash-dark.png');
