<template>
  <div></div>
</template>

<script setup>
</script>

<style lang="scss" scoped>
.foo {
  baz: 0px;
}

.foo :deep() .bar {
  baz: 1px;
}

.foo:deep() .bar {
  baz: 2px;
}

.foo:deep(.bar) {
  baz: 3px;
}

.foo :deep(.bar) {
  baz: 4px;
}

.foo:deep(.bar) .bab {
  baz: 5px;
}

.foo :deep(.bar) .bab {
  baz: 6px;
}

:deep(.bar) .bab {
  baz: 7px;
}

.foo :deep(.bar .bab) {
  baz: 8px;
}

.foo :deep(.bar .bab) {
  baz: 8px;
}

.foo :deep() .bar {
  &__title {
    baz: 9px;
  }
}

</style>
