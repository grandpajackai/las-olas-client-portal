import { createHash } from 'node:crypto';
const supplied=process.argv[2];
if(!supplied)throw new Error('Provide the public preview URL.');
const origin=new URL(supplied.endsWith('/')?supplied:supplied+'/');
if(!['https:','http:'].includes(origin.protocol))throw new Error('Use an HTTP or HTTPS preview URL.');
async function get(path){
  const url=new URL(path,origin);
  if(url.origin!==origin.origin)throw new Error('Preview assets must remain on the preview origin.');
  let failure;
  for(let attempt=0;attempt<3;attempt++){
    try{const response=await fetch(url,{signal:AbortSignal.timeout(12000),headers:{'Cache-Control':'no-cache'}});if(!response.ok)throw new Error(`${response.status} ${path}`);return response;}catch(error){failure=error;if(attempt<2)await new Promise(resolve=>setTimeout(resolve,1500*(attempt+1)));}
  }
  throw failure;
}
const health=await(await get('health.json')).json();
if(health.mode!=='synthetic-browser-demo')throw new Error('Live preview is not the isolated synthetic demo.');
const manifest=await(await get('asset-manifest.json')).json();
if(!Array.isArray(manifest.files)||!manifest.files.length||manifest.files.length>100)throw new Error('Invalid preview asset manifest.');
for(let index=0;index<manifest.files.length;index+=4){
  await Promise.all(manifest.files.slice(index,index+4).map(async file=>{
    if(typeof file.path!=='string'||file.path.includes('..')||file.path.startsWith('/')||file.path.includes('://'))throw new Error('Invalid relative preview asset path.');
    const bytes=Buffer.from(await(await get(file.path)).arrayBuffer());
    if(createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw new Error('Live asset checksum mismatch: '+file.path);
  }));
}
const html=await(await get('')).text();
if(!html.includes('Las Olas')||!html.includes('name="viewport"'))throw new Error('Live HTML is missing brand or mobile viewport metadata.');
console.log(`Live preview PASS: ${manifest.files.length} assets fetched and checksum-verified; synthetic mode; commit ${health.commit}.`);
console.log('Browser page/flow acceptance is a separate review; this check verifies hosting and asset integrity.');
