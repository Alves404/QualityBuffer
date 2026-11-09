'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const utilsCode = fs.readFileSync(path.join(__dirname, '../src/core/utils.js'), 'utf8');
eval(utilsCode);
const Utils = global.DownloaderUtils || DownloaderUtils;

const hlsCode = fs.readFileSync(path.join(__dirname, '../src/core/hls-downloader.js'), 'utf8');
eval(hlsCode);
const Downloader = global.HLSDownloader || HLSDownloader;

console.log('--- Running Unit Tests: DownloaderUtils & V12 HLSDownloader ---');

// Test 1: resolveSecureUrl preserves CDN authentication tokens
{
  const base = 'https://cdn.example.com/videos/master.m3u8?token=xyz123&hdnea=exp=999';
  const relative = 'subfolder/playlist_1080p.m3u8';
  const resolved = Utils.resolveSecureUrl(relative, base);
  assert.strictEqual(
    resolved,
    'https://cdn.example.com/videos/subfolder/playlist_1080p.m3u8?token=xyz123&hdnea=exp=999',
    'Should preserve base URL query tokens'
  );
  console.log('✓ Test 1: resolveSecureUrl token preservation passed.');
}

// Test 2: resolveSecureUrl respects explicit relative query params
{
  const base = 'https://cdn.example.com/playlist.m3u8?token=base';
  const relative = 'segment.ts?token=override&part=1';
  const resolved = Utils.resolveSecureUrl(relative, base);
  assert.strictEqual(
    resolved,
    'https://cdn.example.com/segment.ts?token=override&part=1',
    'Explicit relative parameter should take precedence'
  );
  console.log('✓ Test 2: resolveSecureUrl parameter override passed.');
}

// Test 3: hexToUint8Array 16-byte AES-128 IV parsing
{
  const hex = '0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d';
  const arr = Utils.hexToUint8Array(hex);
  assert.strictEqual(arr.length, 16);
  assert.strictEqual(arr[0], 0x1a);
  assert.strictEqual(arr[1], 0x2b);
  assert.strictEqual(arr[15], 0x6d);
  console.log('✓ Test 3: hexToUint8Array 16-byte AES-128 IV passed.');
}

// Test 4: sanitizeFilename
{
  const dirty = 'Aula 01: Introdução ao Curso / Parte 1? *Importante* <V1>';
  const clean = Utils.sanitizeFilename(dirty);
  assert.strictEqual(clean, 'Aula 01 Introdução ao Curso Parte 1 Importante V1');

  const empty = Utils.sanitizeFilename('', 'Padrao');
  assert.ok(empty.startsWith('Padrao_'));
  console.log('✓ Test 4: sanitizeFilename passed.');
}

// Test 5: formatBytes
{
  assert.strictEqual(Utils.formatBytes(500), '500 B');
  assert.strictEqual(Utils.formatBytes(1024), '1 KB');
  assert.strictEqual(Utils.formatBytes(1024 * 1024 * 15.5), '15.5 MB');
  console.log('✓ Test 5: formatBytes passed.');
}

// Test 6: V12 12-worker default concurrency & Master/Media M3U8 parsing with AES-128
(async () => {
  const downloader = new Downloader();
  assert.strictEqual(downloader.concurrency, 12, 'Default concurrency must be 12 (V12 Turbo)');

  const mockMasterM3U8 = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360
stream_360p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720
stream_720p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080
stream_1080p.m3u8
`;

  const mockMediaM3U8 = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-MEDIA-SEQUENCE:100
#EXT-X-KEY:METHOD=AES-128,URI="key.php?id=99",IV=0x0102030405060708090a0b0c0d0e0f10
#EXTINF:6.0,
seg_0.ts
#EXTINF:6.0,
seg_1.ts
#EXT-X-ENDLIST
`;

  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (url.includes('master.m3u8')) {
      return { ok: true, status: 200, text: async () => mockMasterM3U8 };
    }
    if (url.includes('stream_1080p.m3u8')) {
      return { ok: true, status: 200, text: async () => mockMediaM3U8 };
    }
    return { ok: false, status: 404 };
  };

  try {
    const result = await downloader.parseM3U8('https://cdn.example.com/hls/master.m3u8?token=safe');

    assert.ok(
      result.currentPlaylistUrl.includes('stream_1080p.m3u8'),
      'Should select highest bandwidth stream (1080p)'
    );
    assert.strictEqual(result.segments.length, 2, 'Should extract 2 segments');
    assert.strictEqual(result.segments[0].sequence, 100);
    assert.strictEqual(result.segments[1].sequence, 101);
    assert.ok(result.segments[0].url.includes('seg_0.ts?token=safe'), 'Should retain token on segment');
    assert.strictEqual(result.segments[0].ivHex, '0x0102030405060708090a0b0c0d0e0f10');
    assert.ok(
      result.segments[0].keyUrl.includes('key.php?id=99&token=safe'),
      'Should retain token on AES key URL'
    );
    assert.strictEqual(result.uniqueKeyUrls.length, 1);

    console.log('✓ Test 6: V12 Master/Media M3U8 parsing & AES-128 key discovery passed.');
  } finally {
    global.fetch = originalFetch;
  }

  // Test 7: cleanStreamUrl removes range and chunking parameters
  {
    const dirtyUrl = 'https://rr1---sn-4g5ednks.googlevideo.com/videoplayback?expire=123&itag=22&range=0-1048576&rn=1&rbuf=5000&sq=10';
    const cleaned = Utils.cleanStreamUrl(dirtyUrl);
    assert.ok(!cleaned.includes('range='), 'Should remove range parameter');
    assert.ok(!cleaned.includes('rn='), 'Should remove rn parameter');
    assert.ok(!cleaned.includes('rbuf='), 'Should remove rbuf parameter');
    assert.ok(!cleaned.includes('sq='), 'Should remove sq parameter');
    assert.ok(cleaned.includes('itag=22'), 'Should keep itag');
    assert.ok(cleaned.includes('expire=123'), 'Should keep expire token');
    console.log('✓ Test 7: cleanStreamUrl parameter stripping passed.');
  }

  // Test 8: classifyYouTubeItag metadata resolution
  {
    const muxed720 = Utils.classifyYouTubeItag(22);
    assert.strictEqual(muxed720.quality, '720p HD');
    assert.strictEqual(muxed720.isMuxed, true);
    assert.strictEqual(muxed720.ext, 'mp4');

    const adaptive4k = Utils.classifyYouTubeItag(313);
    assert.strictEqual(adaptive4k.quality, '2160p 4K');
    assert.strictEqual(adaptive4k.isMuxed, false);
    assert.strictEqual(adaptive4k.ext, 'webm');

    const audioM4a = Utils.classifyYouTubeItag(140);
    assert.strictEqual(audioM4a.quality, 'Audio');
    assert.strictEqual(audioM4a.ext, 'm4a');
    console.log('✓ Test 8: classifyYouTubeItag metadata mapping passed.');
  }

  console.log('\nALL CORE UNIT TESTS PASSED SUCCESSFULLY!\n');
})();
