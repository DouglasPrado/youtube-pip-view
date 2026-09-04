import { test } from "node:test";
import assert from "node:assert/strict";
import {
  advanceAfterEnded,
  moveItemAfterCurrent,
  removeFromQueue,
  reorderQueue,
  withNowPlaying,
} from "../dist-test/main/queue-logic.js";

const item = (n) => ({
  id: `id${n}`,
  videoId: `vid${n}`,
  url: `https://www.youtube.com/watch?v=vid${n}`,
  title: `Vídeo ${n}`,
});

const fila = (currentIndex, quantidade = 4) => ({
  items: Array.from({ length: quantidade }, (_, i) => item(i)),
  currentIndex,
});

// ===== reorderQueue =====

test("reordenar mantém o índice apontando para o mesmo vídeo", () => {
  const antes = fila(2);
  const depois = reorderQueue(antes, 0, 3);

  assert.deepEqual(
    depois.items.map((i) => i.videoId),
    ["vid1", "vid2", "vid3", "vid0"]
  );
  // vid2 estava tocando e continua sendo o atual
  assert.equal(depois.items[depois.currentIndex].videoId, "vid2");
});

test("reordenar o próprio item que toca leva o índice junto", () => {
  const depois = reorderQueue(fila(0), 0, 2);
  assert.equal(depois.items[depois.currentIndex].videoId, "vid0");
  assert.equal(depois.currentIndex, 2);
});

test("reordenar com índices inválidos não muda nada", () => {
  const antes = fila(1);
  assert.equal(reorderQueue(antes, -1, 2), antes);
  assert.equal(reorderQueue(antes, 0, 99), antes);
  assert.equal(reorderQueue(antes, 1, 1), antes);
});

// ===== moveItemAfterCurrent =====

test("tocar em seguida coloca o item logo depois do atual", () => {
  const depois = moveItemAfterCurrent(fila(1), "id3");
  assert.deepEqual(
    depois.items.map((i) => i.videoId),
    ["vid0", "vid1", "vid3", "vid2"]
  );
  assert.equal(depois.items[depois.currentIndex].videoId, "vid1");
});

test("tocar em seguida sem nada tocando põe no começo", () => {
  const depois = moveItemAfterCurrent(fila(-1), "id2");
  assert.equal(depois.items[0].videoId, "vid2");
});

// ===== removeFromQueue =====

test("remover item anterior ao atual recua o índice", () => {
  const { state, playVideoId } = removeFromQueue(fila(2), "id0");
  assert.equal(state.items[state.currentIndex].videoId, "vid2");
  assert.equal(playVideoId, null);
});

test("remover o que está tocando segue para o próximo", () => {
  const { state, playVideoId } = removeFromQueue(fila(1), "id1");
  assert.equal(playVideoId, "vid2", "o próximo deve começar a tocar");
  assert.equal(state.items[state.currentIndex].videoId, "vid2");
});

test("remover o último enquanto ele toca encerra a fila", () => {
  const { state, playVideoId } = removeFromQueue(fila(3), "id3");
  assert.equal(playVideoId, null);
  assert.equal(state.currentIndex, -1);
});

test("remover id inexistente não muda nada", () => {
  const antes = fila(1);
  const { state } = removeFromQueue(antes, "nao-existe");
  assert.equal(state, antes);
});

// ===== withNowPlaying =====

test("tocar um vídeo que já está na fila não duplica", () => {
  const depois = withNowPlaying(fila(0), { ...item(2), id: "outro-id" });
  assert.equal(depois.items.length, 4);
  assert.equal(depois.currentIndex, 2);
});

test("tocar um vídeo novo entra logo depois do atual", () => {
  const novo = item(9);
  const depois = withNowPlaying(fila(1), novo);
  assert.deepEqual(
    depois.items.map((i) => i.videoId),
    ["vid0", "vid1", "vid9", "vid2", "vid3"]
  );
  assert.equal(depois.currentIndex, 2);
});

test("tocar um vídeo novo com fila parada entra no fim", () => {
  const depois = withNowPlaying(fila(-1), item(9));
  assert.equal(depois.currentIndex, 4);
  assert.equal(depois.items[4].videoId, "vid9");
});

// ===== advanceAfterEnded =====

test("ao terminar, avança para o próximo", () => {
  const { state, playVideoId } = advanceAfterEnded(fila(1), "vid1");
  assert.equal(playVideoId, "vid2");
  assert.equal(state.currentIndex, 2);
});

test("o vídeo informado vence o índice guardado quando eles divergem", () => {
  // o índice diz que toca vid0, mas quem terminou foi vid2
  const { state, playVideoId } = advanceAfterEnded(fila(0), "vid2");
  assert.equal(playVideoId, "vid3");
  assert.equal(state.currentIndex, 3);
});

test("terminar o último encerra a fila sem tocar nada", () => {
  const { state, playVideoId } = advanceAfterEnded(fila(3), "vid3");
  assert.equal(playVideoId, null);
  assert.equal(state.currentIndex, -1);
});

test("um vídeo fora da fila não mexe na fila", () => {
  const antes = fila(1);
  const { playVideoId, endedIndex } = advanceAfterEnded(antes, "vid-de-fora");
  assert.equal(playVideoId, null);
  assert.equal(endedIndex, -1);
});

test("fila vazia não quebra", () => {
  const { playVideoId } = advanceAfterEnded({ items: [], currentIndex: -1 }, "x");
  assert.equal(playVideoId, null);
});
