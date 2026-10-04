import assert from 'node:assert/strict';
import {__testMuxOggOpus,PRE_SKIP} from '../vitrine/admin/atendimento/attendance-audio-webcodecs-adapter.js';

function crc32Ogg(bytes){
  let crc=0;
  for(const byte of bytes){
    crc^=byte<<24;
    for(let bit=0;bit<8;bit++)crc=(crc&0x80000000)?((crc<<1)^0x04c11db7):(crc<<1);
    crc>>>=0;
  }
  return crc>>>0;
}
function readU64LE(view,offset){return BigInt(view.getUint32(offset,true))|(BigInt(view.getUint32(offset+4,true))<<32n)}
function parsePages(bytes){
  const pages=[];let offset=0;
  while(offset<bytes.length){
    assert.equal(new TextDecoder().decode(bytes.subarray(offset,offset+4)),'OggS','cada página deve começar em OggS');
    const segmentCount=bytes[offset+26];
    const segments=bytes.subarray(offset+27,offset+27+segmentCount);
    const payloadLength=[...segments].reduce((sum,value)=>sum+value,0);
    const end=offset+27+segmentCount+payloadLength;
    const page=bytes.slice(offset,end);
    const view=new DataView(page.buffer,page.byteOffset,page.byteLength);
    const expected=view.getUint32(22,true);
    const checksumBytes=page.slice();checksumBytes.fill(0,22,26);
    assert.equal(crc32Ogg(checksumBytes),expected,'CRC Ogg deve validar independentemente');
    pages.push({
      headerType:page[5],granule:readU64LE(view,6),serial:view.getUint32(14,true),sequence:view.getUint32(18,true),
      payload:page.slice(27+segmentCount),segments:[...segments],
    });
    offset=end;
  }
  assert.equal(offset,bytes.length,'parser deve consumir o arquivo inteiro');
  return pages;
}

const packets=[Uint8Array.from([0xf8,0xff,0xfe]),Uint8Array.from([0xf8,0xaa,0xbb,0xcc])];
const blob=__testMuxOggOpus(packets,1500,0x12345678);
assert.equal(blob.type,'audio/ogg');
const bytes=new Uint8Array(await blob.arrayBuffer());
const pages=parsePages(bytes);
assert.equal(pages.length,4,'stream deve ter OpusHead, OpusTags e duas páginas de áudio');
assert.deepEqual(pages.map(page=>page.sequence),[0,1,2,3],'sequência de páginas deve ser contínua');
assert.ok(pages.every(page=>page.serial===0x12345678),'serial lógico deve ser estável');
assert.equal(pages[0].headerType,2,'primeira página deve marcar BOS');
assert.equal(pages[0].granule,0n,'OpusHead deve ter granule zero');
assert.equal(new TextDecoder().decode(pages[0].payload.subarray(0,8)),'OpusHead');
assert.equal(new DataView(pages[0].payload.buffer,pages[0].payload.byteOffset,pages[0].payload.byteLength).getUint16(10,true),PRE_SKIP,'OpusHead deve carregar pre-skip');
assert.equal(pages[1].headerType,0);
assert.equal(pages[1].granule,0n,'OpusTags deve ter granule zero');
assert.equal(new TextDecoder().decode(pages[1].payload.subarray(0,8)),'OpusTags');
assert.equal(pages[2].headerType,0);
assert.equal(pages[2].granule,BigInt(PRE_SKIP+960),'primeiro pacote de 20 ms deve avançar 960 amostras + pre-skip');
assert.equal(pages[3].headerType,4,'última página deve marcar EOS');
assert.equal(pages[3].granule,BigInt(PRE_SKIP+1500),'EOS deve cortar o padding final pela duração PCM real');
assert.deepEqual([...pages[2].payload], [...packets[0]]);
assert.deepEqual([...pages[3].payload], [...packets[1]]);

console.log('PASS test-attendance-audio-ogg-mux-v1');
