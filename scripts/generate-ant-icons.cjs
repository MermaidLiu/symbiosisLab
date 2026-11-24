const fs=require('fs'),path=require('path');
const source=process.argv[2]||'../.preview/tools/ant-icons/package';
const names=['appstore','bell','calendar','camera','check','close','delete','down','edit','experiment','file-text','home','info-circle','left','loading','lock','logout','medicine-box','plus','qrcode','read','right','save','scan','search','team','tool','upload','warning'];
const aliases={instrument:'experiment',animal:'medicine-box',ra:'read',log:'file-text',users:'team',list:'file-text'};
const icons={};let css='/* Ant Design Icons 4.6.0, Ant UED, MIT. See assets/icons/LICENSE. */\n.ali-icon{width:40rpx;height:40rpx;display:inline-block;vertical-align:middle;background-repeat:no-repeat;background-position:center;background-size:contain;flex-shrink:0}.ali-icon-lg{width:48rpx;height:48rpx}.ali-icon-sm{width:30rpx;height:30rpx}\n';
for(const folder of ['public/icons/ant','miniprogram/assets/icons'])fs.mkdirSync(folder,{recursive:true});
for(const name of names){const raw=fs.readFileSync(path.join(source,'inline-svg/outlined',name+'.svg'),'utf8');const viewBox=raw.match(/viewBox="([^"]+)"/)[1];const body=raw.replace(/^<svg[^>]*>/,'').replace(/<\/svg>\s*$/,'');icons[name]={viewBox,body};const svg=raw.replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" fill="#75258c" ');for(const folder of ['public/icons/ant','miniprogram/assets/icons'])fs.writeFileSync(path.join(folder,name+'.svg'),svg);css+=`.ali-icon-${name}{background-image:url("data:image/svg+xml,${encodeURIComponent(svg)}")}\n`;}
for(const [alias,name]of Object.entries(aliases))css+=`.ali-icon-${alias}{background-image:url("data:image/svg+xml,${encodeURIComponent(fs.readFileSync('miniprogram/assets/icons/'+name+'.svg','utf8'))}")}\n`;
fs.writeFileSync('src/lib/ant-icons.ts','// Ant Design Icons 4.6.0 (Ant UED), MIT. Generated from official outlined SVG assets.\nexport const antIcons:Record<string,{viewBox:string;body:string}> = '+JSON.stringify(icons)+';\n');
fs.writeFileSync('miniprogram/styles/icons.wxss',css);
const license=`MIT License

Copyright (c) 2018-present Ant UED, https://xtech.antfin.com/

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;
fs.writeFileSync('public/icons/ant/LICENSE',license);fs.writeFileSync('miniprogram/assets/icons/LICENSE',license);
(async()=>{const folder=fs.readdirSync('node_modules/.pnpm').find(n=>n.startsWith('sharp@'));const sharp=require(path.resolve('node_modules/.pnpm',folder,'node_modules/sharp'));for(const [base,name]of Object.entries({'tab-home':'home','tab-inst':'experiment','tab-animal':'medicine-box','tab-bell':'bell'}))for(const active of [false,true]){const svg=fs.readFileSync('miniprogram/assets/icons/'+name+'.svg','utf8').replace('#75258c',active?'#75258c':'#8B7A90');await sharp(Buffer.from(svg)).resize(64,64).png().toFile('miniprogram/assets/'+base+(active?'-active':'')+'.png');}console.log('Generated official Ant Design outlined icons and tab images');})().catch(e=>{console.error(e);process.exitCode=1;});
