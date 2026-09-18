import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFfmpegArgs,buildOutputPath,rpcUrl,storageObjectUrl,sanitizeText} from '../scripts/marketing-light-video-render-worker.mjs';

test('output path is deterministic and scoped by asset/version',()=>{
  assert.equal(buildOutputPath('4dade231-5f23-4a58-884e-175c1e0039fd',1),'4dade231-5f23-4a58-884e-175c1e0039fd/v1/preview-10s.mp4');
});
test('ffmpeg contract is exactly 10s vertical H264 30fps with AAC 48kHz',()=>{
  const args=buildFfmpegArgs('/tmp/in.webp','/tmp/out.mp4');
  const all=args.join(' ');
  assert.match(all,/1080:1920/);
  assert.match(all,/fps=30/);
  assert.match(all,/-t 10/);
  assert.match(all,/libx264/);
  assert.doesNotMatch(all,/-an/);
  assert.match(all,/anullsrc=channel_layout=stereo:sample_rate=48000/);
  assert.match(all,/-c:a aac/);
  assert.match(all,/-ar 48000/);
  assert.match(all,/zoompan/);
  assert.match(all,/sin\(on\/18\)/);
  assert.match(all,/\+faststart/);
});
test('REST helpers do not leak path segments',()=>{
  assert.equal(rpcUrl('https://x.supabase.co/','claim_x'),'https://x.supabase.co/rest/v1/rpc/claim_x');
  assert.equal(storageObjectUrl('https://x.supabase.co','marketing-private','a b/v1/x.mp4',true),'https://x.supabase.co/storage/v1/object/authenticated/marketing-private/a%20b/v1/x.mp4');
});
test('sanitize strips controls',()=>assert.equal(sanitizeText(' a\n b '),'a b'));
