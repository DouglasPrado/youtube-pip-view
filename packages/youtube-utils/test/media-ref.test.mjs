import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMediaUrl, mediaPageUrl } from "../dist/index.js";

const CASOS = [
  // Vimeo
  ["https://vimeo.com/123456789", "vimeo", "123456789", 0],
  ["https://vimeo.com/channels/staffpicks/123456789", "vimeo", "123456789", 0],
  ["https://player.vimeo.com/video/123456789", "vimeo", "123456789", 0],
  ["https://vimeo.com/123456789#t=1m30s", "vimeo", "123456789", 90],

  // Dailymotion
  ["https://www.dailymotion.com/video/x8abcde", "dailymotion", "x8abcde", 0],
  ["https://dai.ly/x8abcde", "dailymotion", "x8abcde", 0],

  // Twitch
  ["https://www.twitch.tv/videos/1234567890", "twitch", "1234567890", 0],
  ["https://www.twitch.tv/videos/1234567890?t=1h2m3s", "twitch", "1234567890", 3723],
  ["https://clips.twitch.tv/AmazingClipName", "twitch", "AmazingClipName", 0],
  ["https://www.twitch.tv/gaules/clip/SuperClip", "twitch", "SuperClip", 0],
  ["https://www.twitch.tv/gaules", "twitch", "gaules", 0],

  // YouTube segue funcionando
  ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "youtube", "dQw4w9WgXcQ", 0],
  ["https://youtube.com/shorts/dQw4w9WgXcQ?t=15", "youtube", "dQw4w9WgXcQ", 15],
  ["dQw4w9WgXcQ", "youtube", "dQw4w9WgXcQ", 0],
];

for (const [url, provider, id, start] of CASOS) {
  test(`reconhece ${provider}: ${url.slice(0, 52)}`, () => {
    const ref = parseMediaUrl(url);
    assert.equal(ref?.provider, provider);
    assert.equal(ref?.id, id);
    assert.equal(ref?.startSeconds, start);
  });
}

test("distingue os três tipos do Twitch", () => {
  assert.equal(parseMediaUrl("https://www.twitch.tv/videos/999").kind, "video");
  assert.equal(parseMediaUrl("https://clips.twitch.tv/Slug").kind, "clip");
  assert.equal(parseMediaUrl("https://www.twitch.tv/canal").kind, "channel");
});

test("caminhos reservados do Twitch não viram canal", () => {
  for (const path of ["directory", "settings", "downloads", "subscriptions"]) {
    assert.equal(parseMediaUrl(`https://www.twitch.tv/${path}`), null, path);
  }
});

test("não reconhece o que não é vídeo", () => {
  for (const url of ["https://example.com/video/123", "texto solto", ""]) {
    assert.equal(parseMediaUrl(url), null);
  }
});

test("monta o endereço público de volta", () => {
  assert.equal(mediaPageUrl({ provider: "vimeo", id: "123", startSeconds: 0 }), "https://vimeo.com/123");
  assert.equal(mediaPageUrl({ provider: "twitch", id: "canal", kind: "channel", startSeconds: 0 }), "https://www.twitch.tv/canal");
  assert.equal(mediaPageUrl({ provider: "twitch", id: "999", kind: "video", startSeconds: 0 }), "https://www.twitch.tv/videos/999");
  assert.equal(mediaPageUrl({ provider: "dailymotion", id: "x1", startSeconds: 0 }), "https://www.dailymotion.com/video/x1");
});

import { mediaKey, parseMediaKey, mediaThumbnail } from "../dist/index.js";

test("chave de mídia vai e volta", () => {
  const casos = [
    { provider: "youtube", id: "dQw4w9WgXcQ", startSeconds: 0 },
    { provider: "vimeo", id: "123456789", startSeconds: 0 },
    { provider: "dailymotion", id: "x8abcde", startSeconds: 0 },
    { provider: "twitch", id: "999", kind: "video", startSeconds: 0 },
    { provider: "twitch", id: "gaules", kind: "channel", startSeconds: 0 },
    { provider: "twitch", id: "SlugDoClipe", kind: "clip", startSeconds: 0 },
  ];
  for (const ref of casos) {
    const volta = parseMediaKey(mediaKey(ref));
    assert.equal(volta.provider, ref.provider, mediaKey(ref));
    assert.equal(volta.id, ref.id, mediaKey(ref));
    if (ref.kind) assert.equal(volta.kind, ref.kind, mediaKey(ref));
  }
});

test("id antigo sem prefixo continua sendo do YouTube", () => {
  const ref = parseMediaKey("dQw4w9WgXcQ");
  assert.equal(ref.provider, "youtube");
  assert.equal(ref.id, "dQw4w9WgXcQ");
});

test("chave do YouTube não ganha prefixo (compatível com o que já está salvo)", () => {
  assert.equal(mediaKey({ provider: "youtube", id: "abc12345678", startSeconds: 0 }), "abc12345678");
});

test("miniatura só onde existe sem API", () => {
  assert.match(mediaThumbnail({ provider: "youtube", id: "abc", startSeconds: 0 }), /img\.youtube\.com/);
  assert.match(mediaThumbnail({ provider: "dailymotion", id: "x1", startSeconds: 0 }), /dailymotion\.com/);
  assert.equal(mediaThumbnail({ provider: "vimeo", id: "1", startSeconds: 0 }), null);
  assert.equal(mediaThumbnail({ provider: "twitch", id: "c", startSeconds: 0 }), null);
});
