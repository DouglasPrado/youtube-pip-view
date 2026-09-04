import { test } from "node:test";
import assert from "node:assert/strict";
import { extractVideoId, extractVideoRef } from "../dist/index.js";

/**
 * Os formatos que as pessoas realmente colam. Shorts e live entraram depois de
 * o app rejeitar os dois como "URL inválida".
 */
const ACEITOS = [
  ["ID direto", "dQw4w9WgXcQ", "dQw4w9WgXcQ", 0],
  ["watch", "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ", 0],
  ["watch com v depois de outro parâmetro", "https://www.youtube.com/watch?app=desktop&v=dQw4w9WgXcQ", "dQw4w9WgXcQ", 0],
  ["youtu.be", "https://youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ", 0],
  ["embed", "https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ", 0],
  ["shorts", "https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ", 0],
  ["live", "https://www.youtube.com/live/dQw4w9WgXcQ", "dQw4w9WgXcQ", 0],
  ["/v/ antigo", "https://www.youtube.com/v/dQw4w9WgXcQ", "dQw4w9WgXcQ", 0],
  ["mobile", "https://m.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ", 0],
  ["music com playlist", "https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=RDABC", "dQw4w9WgXcQ", 0],
];

const COM_INSTANTE = [
  ["segundos com s", "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90s", 90],
  ["segundos sem s", "https://youtu.be/dQw4w9WgXcQ?t=42", 42],
  ["minutos e segundos", "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s", 90],
  ["horas, minutos e segundos", "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1h2m3s", 3723],
  ["shorts com t", "https://youtube.com/shorts/dQw4w9WgXcQ?feature=share&t=15", 15],
];

const REJEITADOS = [
  ["texto solto", "nada disso"],
  ["vazio", ""],
  ["outro serviço", "https://vimeo.com/12345678901"],
];

for (const [nome, entrada, id, start] of ACEITOS) {
  test(`reconhece ${nome}`, () => {
    const ref = extractVideoRef(entrada);
    assert.equal(ref?.videoId, id);
    assert.equal(ref?.startSeconds, start);
    assert.equal(extractVideoId(entrada), id);
  });
}

for (const [nome, entrada, segundos] of COM_INSTANTE) {
  test(`lê o instante inicial: ${nome}`, () => {
    const ref = extractVideoRef(entrada);
    assert.equal(ref?.videoId, "dQw4w9WgXcQ");
    assert.equal(ref?.startSeconds, segundos);
  });
}

for (const [nome, entrada] of REJEITADOS) {
  test(`rejeita ${nome}`, () => {
    assert.equal(extractVideoRef(entrada), null);
    assert.equal(extractVideoId(entrada), null);
  });
}
