import {execFileSync} from 'node:child_process';

const bucket='pedidos-pro-files';

// GitHub Actions performs dry-run bundles without Cloudflare credentials.
if(process.env.GITHUB_ACTIONS==='true'){
  console.log('Skipping R2 provisioning during GitHub dry-run.');
  process.exit(0);
}

function run(args,{capture=false}={}){
  return execFileSync(process.platform==='win32'?'npx.cmd':'npx',args,{
    encoding:capture?'utf8':undefined,
    stdio:capture?['ignore','pipe','pipe']:'inherit',
    env:process.env
  });
}

try{
  run(['wrangler','r2','bucket','create',bucket]);
  console.log(`R2 bucket created: ${bucket}`);
}catch(createError){
  let listing='';
  try{listing=String(run(['wrangler','r2','bucket','list'],{capture:true})||'')}catch{}
  if(!listing.includes(bucket)){
    console.error(`Could not create or find R2 bucket ${bucket}.`);
    throw createError;
  }
  console.log(`R2 bucket already available: ${bucket}`);
}
