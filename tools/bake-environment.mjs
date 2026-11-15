import { PNG } from 'pngjs';
import { mkdir, writeFile } from 'node:fs/promises';
const png = new PNG({width:512,height:256});
for(let y=0;y<256;y++)for(let x=0;x<512;x++) {
  const h=y/255;
  const a=h<.5?[85,137,197]:[183,170,149],b=h<.5?[210,221,228]:[91,82,70];
  const t=h<.5?h*2:(h-.5)*2;
  const i=(y*512+x)*4;
  for(let c=0;c<3;c++)png.data[i+c]=Math.round(a[c]+(b[c]-a[c])*t);
  png.data[i+3]=255;
}
await mkdir(new URL('../public/baked/',import.meta.url),{recursive:true});
await writeFile(new URL('../public/baked/environment.png',import.meta.url),PNG.sync.write(png));
