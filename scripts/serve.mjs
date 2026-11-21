import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
const types={'.html':'text/html','.css':'text/css','.js':'text/javascript'};
createServer(async(req,res)=>{try{const path=(req.url??'/').split('?')[0]==='/'?'index.html':(req.url??'').split('?')[0].slice(1);const body=await readFile(join(process.cwd(),'dashboard',path));res.writeHead(200,{'content-type':types[extname(path)]??'application/octet-stream'});res.end(body)}catch{res.writeHead(404);res.end('not found')}}).listen(4173,'127.0.0.1');
