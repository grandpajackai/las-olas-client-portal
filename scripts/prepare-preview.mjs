import {readFileSync,writeFileSync,existsSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const directory=resolve('preview-dist');
const htmlPath=resolve(directory,'index.html');
let html=readFileSync(htmlPath,'utf8');
html=html.replace(/<title>.*?<\/title>/,'<title>Las Olas · Yacht Management Preview</title>');
const metadata=`<meta name="description" content="Explore the Las Olas Yacht Management client experience. An interactive mobile preview with fictional vessels and records."><meta name="theme-color" content="#062f35"><meta name="robots" content="noindex,nofollow"><meta property="og:title" content="Las Olas · Your yacht, in clear view"><meta property="og:description" content="Explore the owner and care-team experience. Interactive feedback preview with sample records."><style>:focus-visible{outline:3px solid #806333!important;outline-offset:3px}html,body,#root{height:100%;background:#f7f5ef}input,textarea{font-size:16px!important}button,[role=button]{-webkit-tap-highlight-color:transparent}button:disabled,[aria-disabled=true]{cursor:not-allowed}</style>`;
html=html.replace('</head>',metadata+'</head>');
writeFileSync(htmlPath,html);
writeFileSync(resolve(directory,'.nojekyll'),'');
writeFileSync(resolve(directory,'404.html'),html);
writeFileSync(resolve(directory,'health.json'),JSON.stringify({application:'Las Olas feedback preview',mode:'synthetic-browser-demo',builtAt:new Date().toISOString(),commit:process.env.GITHUB_SHA||'local'},null,2)+'\n');
const assets=[...html.matchAll(/(?:src|href)="([^"#]+)"/g)].map(m=>m[1]).filter(x=>!/^https?:|^data:/.test(x));
for(const asset of assets){const relative=asset.replace(/^\/las-olas-client-portal\//,'').replace(/^\//,'');if(!existsSync(resolve(directory,relative)))throw new Error('Missing exported asset: '+asset);}
console.log(`Prepared feedback preview; ${assets.length} HTML asset references verified.`);

const files=[];
function collect(folder,relative=''){for(const entry of readdirSync(folder,{withFileTypes:true})){const path=relative?relative+'/'+entry.name:entry.name;if(entry.isDirectory())collect(resolve(folder,entry.name),path);else if(entry.name!=='asset-manifest.json')files.push({path,sha256:createHash('sha256').update(readFileSync(resolve(folder,entry.name))).digest('hex')});}}
collect(directory);
writeFileSync(resolve(directory,'asset-manifest.json'),JSON.stringify({files},null,2)+'\n');
console.log(`Wrote integrity manifest for ${files.length} static files.`);
