<script setup lang="ts">
defineProps<{ titulo: string }>();
</script>

<template>
  <div class="page-head">
    <h1>{{ titulo }}</h1>
  </div>
  <div class="card vazio">Esta tela ainda não tem conteúdo. Os dados entram nas próximas fatias.</div>
</template>
