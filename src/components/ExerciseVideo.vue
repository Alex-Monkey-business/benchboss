<script setup>
// Selve filmen, uten tekst rundt. Brukes to steder: på toppen av øvelsesarket
// (Sheet sin media-slot) og inne i ExerciseView der arket ikke er i bruk.
// Treneren står på mobilnett, så filmen lastes først når han trykker; uten
// poster hentes bare metadata, nok til at første bilde vises i stedet for en
// svart boks.
defineProps({
  video: { type: Object, required: true }
})
</script>

<template>
  <video
    v-if="video.kind === 'mp4'"
    class="ex-video__spiller"
    :src="video.url"
    :poster="video.poster || null"
    controls
    playsinline
    :preload="video.poster ? 'none' : 'metadata'"
  ></video>
  <!-- YouTube/Vimeo: spilleren deres i en ramme. nocookie-domenet holder
       sporingen unna til noen faktisk trykker play. -->
  <iframe
    v-else
    class="ex-video__spiller"
    :src="video.url"
    title="Video av øvelsen"
    loading="lazy"
    allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
    allowfullscreen
    referrerpolicy="strict-origin-when-cross-origin"
  ></iframe>
</template>

<style>
/* 16:9 låst før filmen er lastet, så siden ikke hopper når posteren kommer.
   Mørk flate bak: filmene er filmet ute, og en hvit boks rundt en grønn bane
   ser ut som en feil. Ikke scoped — ExerciseView deler klassen. */
.ex-video__spiller {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  border: 0;
  border-radius: var(--ds-radius-md);
  background: #0E0E0D;
  object-fit: cover;
}
</style>
